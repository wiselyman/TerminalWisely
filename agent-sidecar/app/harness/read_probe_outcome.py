"""Read-only probe outcomes: distinguish filter-miss from hard failure.

Exit 1 + empty stderr + non-empty stdout usually means a trailing filter
(grep/awk/…) matched nothing after earlier commands already printed DATA.
Do not treat that as a broken host command for the model.
"""

from __future__ import annotations

from typing import Any

FILTER_NO_MATCH_NOTE = (
    "Non-zero exit with empty stderr and non-empty stdout usually means a "
    "trailing filter matched nothing. Use the stdout; do not retry the same probe."
)


def annotate_read_probe_result(payload: dict[str, Any]) -> dict[str, Any]:
    """Return a shallow-copied payload with soft-ok for filter-no-match cases."""
    if not isinstance(payload, dict):
        return payload
    if payload.get("timed_out") or payload.get("cancelled") or payload.get("denied"):
        return payload

    code = payload.get("exit_code")
    stdout = str(payload.get("stdout") or "").strip()
    stderr = str(payload.get("stderr") or "").strip()

    # Classic filter-miss / soft boolean — regardless of client ok bit.
    if isinstance(code, int) and code == 1 and not stderr and stdout:
        out = dict(payload)
        out["ok"] = True
        out["filter_no_match"] = True
        out.pop("error", None)
        note = str(out.get("_note") or "").strip()
        if FILTER_NO_MATCH_NOTE not in note:
            out["_note"] = (
                f"{note} {FILTER_NO_MATCH_NOTE}".strip()
                if note
                else FILTER_NO_MATCH_NOTE
            )
        return out

    return payload
