"""Paths and environment configuration for the agent sidecar."""

from __future__ import annotations

import os
from pathlib import Path


def data_dir() -> Path:
    raw = os.environ.get("TW_AI_DATA_DIR", "").strip()
    if raw:
        path = Path(raw).expanduser()
    else:
        path = Path.home() / ".terminalwisely" / "ai-engineer"
    path.mkdir(parents=True, exist_ok=True)
    return path


def sqlite_path() -> Path:
    return data_dir() / "audit.sqlite3"


def resolve_openai_compat_base_url(
    provider: str,
    base_url: str = "",
    ollama_base_url: str = "",
) -> str:
    """Resolve chat/completions base for a settings profile (OpenAI-compatible only)."""
    pid = (provider or "openai").strip().lower()
    explicit = (base_url or "").strip().rstrip("/")
    if pid == "ollama":
        ollama = (ollama_base_url or "http://127.0.0.1:11434").strip().rstrip("/")
        if not ollama:
            ollama = "http://127.0.0.1:11434"
        return ollama if ollama.endswith("/v1") else f"{ollama}/v1"
    if explicit:
        return explicit
    if pid == "openai":
        return "https://api.openai.com/v1"
    if pid == "gemini":
        return "https://generativelanguage.googleapis.com/v1beta/openai"
    # anthropic (and others): require an OpenAI-compatible gateway base URL
    return ""


def validate_http_base_url(url: str) -> str | None:
    """Return an error message if url is not a usable http(s) base, else None."""
    raw = (url or "").strip()
    if not raw:
        return "Base URL is empty."
    if "://" not in raw:
        return "Base URL must start with http:// or https://"
    try:
        from urllib.parse import urlparse

        parsed = urlparse(raw)
    except Exception:  # noqa: BLE001
        return f"Invalid Base URL: {raw!r}"
    if parsed.scheme not in {"http", "https"}:
        return f"Base URL must start with http:// or https:// (got {parsed.scheme!r})."
    if not parsed.hostname:
        return "Base URL is missing a host name."
    if parsed.hostname in {"example.com", "localhost.invalid"}:
        return f"Base URL host looks like a placeholder: {parsed.hostname}"
    return None


def ai_provider() -> str:
    return os.environ.get("TW_AI_PROVIDER", "openai")


def ai_base_url() -> str:
    explicit = os.environ.get("TW_AI_BASE_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    return resolve_openai_compat_base_url(
        ai_provider(),
        "",
        os.environ.get("TW_AI_OLLAMA_BASE", "http://127.0.0.1:11434"),
    )


def ai_api_key() -> str:
    return os.environ.get("TW_AI_API_KEY", "")


def ai_model() -> str:
    return os.environ.get("TW_AI_MODEL", "gpt-4o-mini")


def apply_runtime_config(
    *,
    provider: str | None = None,
    model: str | None = None,
    base_url: str | None = None,
    ollama_base_url: str | None = None,
    api_key: str | None = None,
    security_mode: str | None = None,
) -> dict[str, str]:
    """Hot-update process env so the next AgentLoop/ModelGateway picks new settings.

    Avoids killing the sidecar on every model-profile switch (UI freeze).
    """
    if provider is not None:
        os.environ["TW_AI_PROVIDER"] = str(provider).strip() or "openai"
    if model is not None:
        os.environ["TW_AI_MODEL"] = str(model).strip() or "gpt-4o-mini"
    if ollama_base_url is not None:
        os.environ["TW_AI_OLLAMA_BASE"] = (
            str(ollama_base_url).strip() or "http://127.0.0.1:11434"
        )
    if api_key is not None:
        # Always set (even empty) so a prior key cannot stick after clear.
        os.environ["TW_AI_API_KEY"] = str(api_key)
    if security_mode is not None:
        mode = str(security_mode).strip().lower() or "safe"
        os.environ["TW_AI_SECURITY_MODE"] = mode

    prov = ai_provider().strip().lower()
    if base_url is not None and str(base_url).strip():
        os.environ["TW_AI_BASE_URL"] = str(base_url).strip().rstrip("/")
    elif prov == "ollama":
        # Mirror Rust spawn: derive OpenAI-compat base from ollama URL.
        ollama = os.environ.get("TW_AI_OLLAMA_BASE", "http://127.0.0.1:11434").rstrip(
            "/"
        )
        base = ollama if ollama.endswith("/v1") else f"{ollama}/v1"
        os.environ["TW_AI_BASE_URL"] = base
    elif base_url is not None:
        # Explicit clear for non-ollama when empty.
        os.environ.pop("TW_AI_BASE_URL", None)

    return {
        "provider": ai_provider(),
        "model": ai_model(),
        "base_url": ai_base_url(),
        "security_mode": os.environ.get("TW_AI_SECURITY_MODE", "safe").strip().lower()
        or "safe",
    }


def is_local_model_endpoint(url: str | None = None) -> bool:
    """True for Ollama / private OpenAI-compatible servers (no API key required)."""
    if ai_provider().strip().lower() == "ollama":
        return True
    base = (url or ai_base_url() or "").strip().lower()
    if not base:
        return False
    # Loopback
    if any(
        marker in base
        for marker in (
            "127.0.0.1",
            "localhost",
            "[::1]",
            "0.0.0.0",
            ":11434",
        )
    ):
        return True
    # Private / Tailscale CGNAT hosts (LAN or 100.x) hosting vLLM etc.
    try:
        from urllib.parse import urlparse

        host = (urlparse(base if "://" in base else f"http://{base}").hostname or "").lower()
    except Exception:  # noqa: BLE001
        return False
    if not host:
        return False
    if host.endswith(".local") or host.endswith(".ts.net"):
        return True
    parts = host.split(".")
    if len(parts) == 4 and all(p.isdigit() for p in parts):
        a, b = int(parts[0]), int(parts[1])
        if a == 10:
            return True
        if a == 172 and 16 <= b <= 31:
            return True
        if a == 192 and b == 168:
            return True
        # Tailscale CGNAT 100.64.0.0/10
        if a == 100 and 64 <= b <= 127:
            return True
    return False


def ai_token() -> str:
    """Bearer token required on all /v1/* routes."""
    return os.environ.get("TW_AI_TOKEN", "dev-token")


def security_mode() -> str:
    return os.environ.get("TW_AI_SECURITY_MODE", "safe").strip().lower() or "safe"


def max_tool_calls() -> int:
    """Per-run tool budget. Install / verify loops burn calls fast; keep this high."""
    return int(os.environ.get("TW_AI_MAX_TOOL_CALLS", "96"))


def max_run_seconds() -> float:
    """Active agent budget per user turn (excludes host exec / approval / ask_user waits)."""
    return float(os.environ.get("TW_AI_MAX_RUN_SECONDS", "900"))


def max_run_wall_seconds() -> float:
    """Wall-clock cap for a whole run including host waits (default 12h)."""
    return float(os.environ.get("TW_AI_MAX_RUN_WALL_SECONDS", "43200"))


def stall_seconds() -> float:
    """Fail RUNNING runs that never touch the model within this many seconds."""
    return float(os.environ.get("TW_AI_STALL_SECONDS", "90"))


def progress_stall_seconds() -> float:
    """Fail RUNNING runs with no events/stream chunks for this many seconds.

    Covers hung model HTTP after tools (cold-start stall alone stops after first touch).
    """
    return float(os.environ.get("TW_AI_PROGRESS_STALL_SECONDS", "300"))


def max_context_tokens() -> int:
    """Soft budget for prompt compaction (leave room under vLLM max-model-len)."""
    return int(os.environ.get("TW_AI_MAX_CONTEXT_TOKENS", "28000"))


def compact_pressure_ratio() -> float:
    """Fraction of context budget that triggers pressure / auto-compact."""
    return float(os.environ.get("TW_AI_COMPACT_PRESSURE_RATIO", "0.85"))


def compact_retain_tail() -> int:
    """Surface nodes kept verbatim after compaction."""
    return int(os.environ.get("TW_AI_COMPACT_RETAIN_TAIL", "8"))


def max_output_tokens() -> int:
    """Generation budget for a single sample.

    Prefer finishing the user-visible answer in one shot — remediation
    (auto-continue) is a fallback, not the happy path. Override with
    TW_AI_MAX_OUTPUT_TOKENS.
    """
    return int(os.environ.get("TW_AI_MAX_OUTPUT_TOKENS", "32768"))


def max_output_tokens_hard_cap() -> int:
    """Upper bound when auto-raising budget after a length-truncated sample."""
    return int(os.environ.get("TW_AI_MAX_OUTPUT_TOKENS_CAP", "65536"))


def prefer_complete_max_output_tokens() -> int:
    """Budget for user-facing answers (after tools / conclude / no-tool sample).

    Defaults to the hard cap so long answers finish in one sample instead of
    cutting mid-reply and auto-continuing. Override with
    TW_AI_PREFER_COMPLETE_OUTPUT_TOKENS.
    """
    prefer = int(os.environ.get("TW_AI_PREFER_COMPLETE_OUTPUT_TOKENS", "0") or "0")
    if prefer > 0:
        return min(max(prefer, max_output_tokens()), max_output_tokens_hard_cap())
    return max_output_tokens_hard_cap()


def raised_max_output_tokens(current: int | None = None) -> int:
    """Next budget after a length hit: min(2x current-or-default, hard cap)."""
    base = int(current) if current and current > 0 else max_output_tokens()
    return min(max(base * 2, base + 1), max_output_tokens_hard_cap())


def lease_ttl_seconds() -> float:
    return float(os.environ.get("TW_AI_LEASE_TTL_SECONDS", "120"))


def lease_exec_grace_seconds() -> float:
    """Execution window after the user clicks Approve (independent of review wait)."""
    return float(os.environ.get("TW_AI_LEASE_EXEC_GRACE_SECONDS", "120"))


def terminal_timeout_default_seconds() -> float:
    """Wait budget for terminal_exec when the model omits timeout_seconds.

    Large artifact downloads/builds routinely take hours; a short default causes
    TOOL_TIMEOUT and blind re-install loops. Override with TW_AI_TERMINAL_TIMEOUT_DEFAULT.
    """
    return float(os.environ.get("TW_AI_TERMINAL_TIMEOUT_DEFAULT", "7200"))


def terminal_timeout_max_seconds() -> float:
    """Hard cap for a single terminal_exec wait (default 24h)."""
    return float(os.environ.get("TW_AI_TERMINAL_TIMEOUT_MAX", "86400"))


def resolve_terminal_timeout_seconds(raw: object | None) -> float:
    """Clamp a tool/args timeout to [5, max], falling back to the long default."""
    default = terminal_timeout_default_seconds()
    max_s = terminal_timeout_max_seconds()
    if raw is None or raw == "":
        return default
    try:
        return max(5.0, min(float(raw), max_s))
    except (TypeError, ValueError):
        return default


def policy_overrides_path() -> Path:
    """User-editable capability overrides (optional)."""
    return data_dir() / "policy" / "overrides.yaml"
