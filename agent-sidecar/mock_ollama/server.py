"""FastAPI app: Ollama + OpenAI-compatible endpoints backed by ScenarioDirector."""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

from mock_ollama.director import ScenarioDirector, load_scenarios

DEFAULT_MODEL = "mock-k8s-engineer"


def create_app(
    *,
    scenarios_path: Path | None = None,
    model_id: str = DEFAULT_MODEL,
) -> FastAPI:
    director = load_scenarios(scenarios_path)
    app = FastAPI(title="Mock Ollama", version="1.0.0")

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "kind": "mock-ollama"}

    @app.get("/api/tags")
    async def ollama_tags() -> dict[str, Any]:
        now = time.strftime("%Y-%m-%dT%H:%M:%S.000000000Z", time.gmtime())
        return {
            "models": [
                {
                    "name": model_id,
                    "model": model_id,
                    "modified_at": now,
                    "size": 0,
                    "digest": "mock",
                    "details": {
                        "family": "mock",
                        "parameter_size": "scripted",
                        "quantization_level": "none",
                    },
                    "capabilities": ["completion", "tools"],
                }
            ]
        }

    @app.get("/v1/models")
    async def openai_models() -> dict[str, Any]:
        return {
            "object": "list",
            "data": [
                {
                    "id": model_id,
                    "object": "model",
                    "created": int(time.time()),
                    "owned_by": "mock-ollama",
                }
            ],
        }

    @app.post("/v1/chat/completions")
    async def chat_completions(request: Request) -> Any:
        body = await request.json()
        messages = body.get("messages") or []
        if not isinstance(messages, list):
            return JSONResponse(
                status_code=400,
                content={"error": "messages must be a list"},
            )
        model = str(body.get("model") or model_id)
        stream = bool(body.get("stream"))
        try:
            completion = director.build_completion(messages, model=model)
        except ValueError as exc:
            return JSONResponse(status_code=400, content={"error": str(exc)})

        if stream:
            return StreamingResponse(
                _sse_from_completion(completion),
                media_type="text/event-stream",
            )
        return completion

    @app.post("/v1/models/list")
    async def models_list_alias() -> dict[str, Any]:
        return await openai_models()

    return app


def _sse_from_completion(completion: dict[str, Any]):
    """Emit a minimal OpenAI-style SSE sequence from a full completion."""
    choice = (completion.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    content = message.get("content") or ""
    tool_calls = message.get("tool_calls") or []
    finish_reason = choice.get("finish_reason") or "stop"
    chunk_id = completion.get("id") or f"chatcmpl-mock-{uuid.uuid4().hex[:8]}"
    model = completion.get("model") or DEFAULT_MODEL

    if content:
        payload = {
            "id": chunk_id,
            "object": "chat.completion.chunk",
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "delta": {"role": "assistant", "content": content},
                    "finish_reason": None,
                }
            ],
        }
        yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    for i, tc in enumerate(tool_calls):
        fn = tc.get("function") or {}
        payload = {
            "id": chunk_id,
            "object": "chat.completion.chunk",
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "delta": {
                        "role": "assistant",
                        "tool_calls": [
                            {
                                "index": i,
                                "id": tc.get("id"),
                                "type": "function",
                                "function": {
                                    "name": fn.get("name"),
                                    "arguments": fn.get("arguments") or "",
                                },
                            }
                        ],
                    },
                    "finish_reason": None,
                }
            ],
        }
        yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    done_payload = {
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "model": model,
        "choices": [{"index": 0, "delta": {}, "finish_reason": finish_reason}],
    }
    yield f"data: {json.dumps(done_payload, ensure_ascii=False)}\n\n"
    yield "data: [DONE]\n\n"
