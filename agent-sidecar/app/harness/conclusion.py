"""Honest conclusion / UNKNOWN_OUTCOME helpers."""

from __future__ import annotations

from typing import Any

from app.harness.verify import claim_success_without_evidence
from app.models.ops import Conclusion


def build_conclusion(
    *,
    status: str,
    messages: list[dict[str, Any]],
    mutated: bool,
    pending_mutation: bool,
    cancel_requested: bool,
    error: str | None,
) -> Conclusion:
    if cancel_requested or status == "cancelled":
        if pending_mutation or mutated:
            return Conclusion(
                kind="unknown_outcome",
                summary=(
                    "Run stopped during or after a mutation — outcome UNKNOWN. "
                    "Verify host state before assuming success or failure."
                ),
                metadata={"status": status},
            )
        return Conclusion(kind="cancelled", summary="Run cancelled before completion.")

    if status == "failed" or error:
        return Conclusion(
            kind="failed",
            summary=error or "Agent run failed",
            metadata={"status": status},
        )

    if claim_success_without_evidence(messages) and mutated:
        return Conclusion(
            kind="incomplete",
            summary=(
                "Mutating commands ran but success was claimed without verify evidence. "
                "Treat as incomplete until verified."
            ),
        )

    texts = [
        str(m.get("content") or "")
        for m in messages
        if m.get("role") == "assistant" and m.get("content")
    ]
    summary = (texts[-1] if texts else "").strip() or "Completed"
    return Conclusion(kind="success", summary=summary[:2000], evidence=texts[-3:])
