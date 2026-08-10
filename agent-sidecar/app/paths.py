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


def ai_provider() -> str:
    return os.environ.get("TW_AI_PROVIDER", "openai")


def ai_base_url() -> str:
    explicit = os.environ.get("TW_AI_BASE_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    if ai_provider().strip().lower() == "ollama":
        ollama = os.environ.get("TW_AI_OLLAMA_BASE", "http://127.0.0.1:11434").strip().rstrip("/")
        if not ollama:
            ollama = "http://127.0.0.1:11434"
        return ollama if ollama.endswith("/v1") else f"{ollama}/v1"
    return "https://api.openai.com/v1"


def ai_api_key() -> str:
    return os.environ.get("TW_AI_API_KEY", "")


def ai_model() -> str:
    return os.environ.get("TW_AI_MODEL", "gpt-4o-mini")


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
    return int(os.environ.get("TW_AI_MAX_TOOL_CALLS", "24"))


def max_run_seconds() -> float:
    return float(os.environ.get("TW_AI_MAX_RUN_SECONDS", "300"))


def max_context_tokens() -> int:
    """Soft budget for prompt compaction (leave room under vLLM max-model-len)."""
    return int(os.environ.get("TW_AI_MAX_CONTEXT_TOKENS", "28000"))


def max_output_tokens() -> int:
    """Always request some generation budget so context-full prompts don't ask for 0."""
    return int(os.environ.get("TW_AI_MAX_OUTPUT_TOKENS", "2048"))


def lease_ttl_seconds() -> float:
    return float(os.environ.get("TW_AI_LEASE_TTL_SECONDS", "120"))


def policy_overrides_path() -> Path:
    """User-editable capability overrides (optional)."""
    return data_dir() / "policy" / "overrides.yaml"
