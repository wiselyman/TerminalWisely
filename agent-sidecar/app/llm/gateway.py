"""OpenAI-compatible ModelGateway via httpx."""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator, Callable
from typing import Any

import httpx

from app import paths
from app.llm.thinking import sanitize_assistant_content

logger = logging.getLogger(__name__)


class ModelGatewayError(RuntimeError):
    pass


def parse_sse_data_lines(buffer: str) -> tuple[list[str], str]:
    """Split buffered SSE text into complete `data:` payloads and remainder."""
    payloads: list[str] = []
    while True:
        sep = buffer.find("\n\n")
        if sep < 0:
            crlf = buffer.find("\r\n\r\n")
            if crlf < 0:
                break
            block, buffer = buffer[:crlf], buffer[crlf + 4 :]
        else:
            block, buffer = buffer[:sep], buffer[sep + 2 :]
        for line in block.replace("\r\n", "\n").split("\n"):
            if line.startswith("data:"):
                payloads.append(line[5:].lstrip())
    return payloads, buffer


def iter_stream_events_from_chunk_json(obj: dict[str, Any]) -> list[dict[str, Any]]:
    """Convert one OpenAI stream chunk object into gateway stream events."""
    events: list[dict[str, Any]] = []
    choices = obj.get("choices") or []
    if not choices:
        return events
    choice0 = choices[0] if isinstance(choices[0], dict) else {}
    delta = choice0.get("delta") or {}
    if not isinstance(delta, dict):
        delta = {}

    content = delta.get("content")
    if isinstance(content, str) and content:
        events.append({"type": "content", "text": content})
    elif isinstance(content, list):
        text = "".join(
            (p.get("text") if isinstance(p, dict) else str(p)) or "" for p in content
        )
        if text:
            events.append({"type": "content", "text": text})

    # Some gateways put reasoning in separate delta fields — never surface as content.
    for tc in delta.get("tool_calls") or []:
        if not isinstance(tc, dict):
            continue
        index = int(tc.get("index") or 0)
        fn = tc.get("function") if isinstance(tc.get("function"), dict) else {}
        events.append(
            {
                "type": "tool_call_delta",
                "index": index,
                "id": tc.get("id"),
                "name": fn.get("name"),
                "arguments": fn.get("arguments") or "",
            }
        )

    finish = choice0.get("finish_reason")
    if finish:
        events.append({"type": "finished", "finish_reason": finish})
    return events


class ModelGateway:
    """Chat Completions with tools. Providers go through this gateway only."""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        timeout: float = 120.0,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = (base_url or paths.ai_base_url()).rstrip("/")
        self.api_key = api_key if api_key is not None else paths.ai_api_key()
        self.model = model or paths.ai_model()
        # Local/vLLM thinking models often exceed 120s on long tool+CoT turns.
        if timeout == 120.0 and paths.is_local_model_endpoint(self.base_url):
            self.timeout = httpx.Timeout(600.0, connect=30.0)
        else:
            self.timeout = timeout
        self._client = client
        self._owns_client = client is None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def aclose(self) -> None:
        if self._owns_client and self._client is not None:
            await self._client.aclose()
            self._client = None

    def _auth_headers_and_key(self) -> tuple[dict[str, str], str]:
        key = (self.api_key or "").strip()
        if not key and not paths.is_local_model_endpoint(self.base_url):
            raise ModelGatewayError(
                "API Key is empty. Open AI Model Settings, paste a key for the active profile, then save. "
                "Local models (Ollama / localhost) do not need a key — select that profile and save."
            )
        headers = {"Content-Type": "application/json"}
        if key:
            headers["Authorization"] = f"Bearer {key}"
        return headers, key

    def _build_body(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None,
        *,
        temperature: float,
        tool_choice: str | dict[str, Any] | None,
        stream: bool,
        max_tokens: int | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "stream": stream,
            "max_tokens": max_tokens if max_tokens is not None else paths.max_output_tokens(),
        }
        if tools:
            body["tools"] = tools
            if tool_choice is not None:
                body["tool_choice"] = tool_choice
        return body

    async def chat_completions(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: str | dict[str, Any] | None = "auto",
    ) -> dict[str, Any]:
        headers, _ = self._auth_headers_and_key()
        url = f"{self.base_url}/chat/completions"
        body = self._build_body(
            messages,
            tools,
            temperature=temperature,
            tool_choice=tool_choice,
            stream=False,
        )
        # Keep model thinking capability; strip CoT only when presenting to the UI
        # (see extract_assistant_message → sanitize_assistant_content).

        client = await self._get_client()
        try:
            resp = await client.post(url, headers=headers, json=body)
        except httpx.HTTPError as exc:
            detail = str(exc).strip() or repr(exc)
            raise ModelGatewayError(
                f"Model HTTP error talking to {url}: {type(exc).__name__}: {detail}"
            ) from exc

        if resp.status_code >= 400:
            raise ModelGatewayError(f"Model error {resp.status_code}: {resp.text[:500]}")

        try:
            data = resp.json()
        except json.JSONDecodeError as exc:
            raise ModelGatewayError("Model returned non-JSON body") from exc
        return data

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: str | dict[str, Any] | None = "auto",
        should_cancel: Callable[[], bool] | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield stream events: content / tool_call_delta / finished.

        On hard stream failure, falls back once to non-stream completion and yields
        equivalent synthetic events.
        """
        headers, _ = self._auth_headers_and_key()
        url = f"{self.base_url}/chat/completions"
        body = self._build_body(
            messages,
            tools,
            temperature=temperature,
            tool_choice=tool_choice,
            stream=True,
        )
        client = await self._get_client()
        try:
            async with client.stream("POST", url, headers=headers, json=body) as resp:
                if resp.status_code >= 400:
                    err_text = (await resp.aread()).decode("utf-8", errors="replace")[:500]
                    raise ModelGatewayError(f"Model error {resp.status_code}: {err_text}")
                buf = ""
                async for raw in resp.aiter_text():
                    if should_cancel and should_cancel():
                        break
                    buf += raw
                    payloads, buf = parse_sse_data_lines(buf)
                    for payload in payloads:
                        if not payload or payload == "[DONE]":
                            if payload == "[DONE]":
                                yield {"type": "finished", "finish_reason": "stop"}
                            continue
                        try:
                            obj = json.loads(payload)
                        except json.JSONDecodeError:
                            continue
                        if not isinstance(obj, dict):
                            continue
                        for ev in iter_stream_events_from_chunk_json(obj):
                            yield ev
            return
        except ModelGatewayError:
            raise
        except httpx.HTTPError as exc:
            detail = str(exc).strip() or repr(exc)
            logger.warning(
                "stream failed (%s: %s) talking to %s; falling back to non-stream",
                type(exc).__name__,
                detail,
                url,
            )
        except Exception as exc:  # noqa: BLE001
            detail = str(exc).strip() or repr(exc)
            logger.warning(
                "stream failed (%s: %s) talking to %s; falling back to non-stream",
                type(exc).__name__,
                detail,
                url,
            )

        # Fallback: one-shot completion → synthetic stream events.
        completion = await self.chat_completions(
            messages,
            tools,
            temperature=temperature,
            tool_choice=tool_choice,
        )
        message = (completion.get("choices") or [{}])[0].get("message") or {}
        content = message.get("content")
        if isinstance(content, list):
            content = "".join(
                (p.get("text") if isinstance(p, dict) else str(p)) or "" for p in content
            )
        if isinstance(content, str) and content:
            yield {"type": "content", "text": content}
        for i, tc in enumerate(message.get("tool_calls") or []):
            if not isinstance(tc, dict):
                continue
            fn = tc.get("function") if isinstance(tc.get("function"), dict) else {}
            yield {
                "type": "tool_call_delta",
                "index": i,
                "id": tc.get("id"),
                "name": fn.get("name"),
                "arguments": fn.get("arguments") or "",
            }
        finish = (completion.get("choices") or [{}])[0].get("finish_reason") or "stop"
        yield {"type": "finished", "finish_reason": finish}

    @staticmethod
    def extract_assistant_message(completion: dict[str, Any]) -> dict[str, Any]:
        choices = completion.get("choices") or []
        if not choices:
            raise ModelGatewayError("Model response missing choices")
        message = choices[0].get("message")
        if not isinstance(message, dict):
            raise ModelGatewayError("Model response missing message")
        out = dict(message)
        content = out.get("content")
        if isinstance(content, list):
            content = "".join(
                (p.get("text") if isinstance(p, dict) else str(p)) or ""
                for p in content
            )
        raw = content if isinstance(content, str) else ("" if content is None else str(content))
        # Thinking stays enabled on the model; only the chat UI gets the final answer.
        # Separate reasoning_* fields are never shown as the reply.
        out["content"] = sanitize_assistant_content(raw)
        return out

    async def list_models(self) -> list[str]:
        """GET {base}/models — OpenAI-compatible catalog for settings refresh."""
        if not self.base_url:
            raise ModelGatewayError(
                "Base URL is empty. For Anthropic-compatible gateways, paste an OpenAI-compatible base URL."
            )
        url_err = paths.validate_http_base_url(self.base_url)
        if url_err:
            raise ModelGatewayError(url_err)
        headers, _ = self._auth_headers_and_key()
        url = f"{self.base_url.rstrip('/')}/models"
        # Keep refresh snappy — bad hosts should fail fast for settings UX.
        client = httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=6.0))
        try:
            resp = await client.get(url, headers=headers)
        except httpx.HTTPError as exc:
            detail = str(exc).strip() or repr(exc)
            raise ModelGatewayError(
                f"Cannot reach {url} ({type(exc).__name__}: {detail}). "
                "Check Base URL / network (VPN / Tailscale)."
            ) from exc
        finally:
            await client.aclose()
        if resp.status_code >= 400:
            raise ModelGatewayError(
                f"Model list failed HTTP {resp.status_code} from {url}: {resp.text[:400]}"
            )
        try:
            data = resp.json()
        except json.JSONDecodeError as exc:
            raise ModelGatewayError(
                f"Model list from {url} was not JSON (check Base URL). "
                f"Body starts with: {resp.text[:160]!r}"
            ) from exc
        models = parse_openai_models_payload(data)
        if not models:
            raise ModelGatewayError(
                f"No model ids in response from {url}. "
                "Is this an OpenAI-compatible /v1 base? "
                f"Payload keys: {sorted(data.keys()) if isinstance(data, dict) else type(data).__name__}"
            )
        return models

    @staticmethod
    def merge_tool_call_deltas(
        buckets: dict[int, dict[str, Any]],
        *,
        index: int,
        id_: str | None,
        name: str | None,
        arguments: str,
    ) -> None:
        slot = buckets.setdefault(
            index,
            {"id": "", "type": "function", "function": {"name": "", "arguments": ""}},
        )
        if id_:
            slot["id"] = str(id_)
        fn = slot["function"]
        if name:
            fn["name"] = str(name)
        if arguments:
            fn["arguments"] = str(fn.get("arguments") or "") + str(arguments)


def parse_openai_models_payload(data: Any) -> list[str]:
    """Extract model ids from an OpenAI-compatible `/models` JSON body."""
    seen: set[str] = set()
    models: list[str] = []

    def add(mid: str) -> None:
        mid = mid.strip()
        if mid and mid not in seen:
            seen.add(mid)
            models.append(mid)

    if isinstance(data, dict):
        items = data.get("data")
        if isinstance(items, list):
            for item in items:
                if isinstance(item, dict):
                    mid = item.get("id") or item.get("name")
                    if isinstance(mid, str):
                        add(mid)
        # Ollama /api/tags shaped payload sometimes proxied
        tags = data.get("models")
        if isinstance(tags, list):
            for item in tags:
                if isinstance(item, dict):
                    mid = item.get("name") or item.get("model") or item.get("id")
                    if isinstance(mid, str):
                        add(mid)
                elif isinstance(item, str):
                    add(item)
    return models
