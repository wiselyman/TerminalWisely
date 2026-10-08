"""Per-run ModelGateway from a profile binding. Does not touch process env."""

from __future__ import annotations

from typing import Any

from app.llm.gateway import ModelGateway
from app.paths import resolve_openai_compat_base_url


def gateway_for_binding(raw: Any) -> ModelGateway | None:
    if not isinstance(raw, dict):
        return None
    model = str(raw.get("model") or "").strip()
    if not model:
        return None
    base = resolve_openai_compat_base_url(
        str(raw.get("provider") or ""),
        str(raw.get("base_url") or ""),
        str(raw.get("ollama_base_url") or ""),
    )
    return ModelGateway(
        base_url=base or None,
        api_key=str(raw.get("api_key") or ""),
        model=model,
    )


def gateway_for_run(run: Any) -> ModelGateway | None:
    meta = getattr(run, "metadata", None) or {}
    return gateway_for_binding(meta.get("_model_binding"))
