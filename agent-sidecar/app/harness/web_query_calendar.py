"""Detect / strip calendar years invented in web_search queries.

Does NOT append years. Models often stuff a stale YYYY into "latest / 现在"
searches from training habit. We strip years the user did not write before
calling the search provider, and optionally surface advice for the model.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timezone

# Four-digit years in the modern computing era (avoids matching ports, prices).
_YEAR_RE = re.compile(r"(?<!\d)(20\d{2})(?!\d)")


def years_mentioned(text: str) -> set[str]:
    return set(_YEAR_RE.findall(text or ""))


def invented_years_in_web_query(
    query: str,
    *,
    user_text: str,
) -> list[str]:
    """
    Years present in the search query that the user did not write.

    If the user named a year, keeping it is fine. If the model invented one
    (common for 「最新」), return those years sorted.
    """
    q_years = years_mentioned(query)
    if not q_years:
        return []
    u_years = years_mentioned(user_text)
    invented = sorted(y for y in q_years if y not in u_years)
    return invented


def strip_invented_calendar_years(
    query: str,
    *,
    user_text: str,
) -> tuple[str, list[str]]:
    """
    Remove invented YYYY tokens from the query. Returns (cleaned, removed_years).

    Not year-append: we never insert a year. Only drop years the user did not write.
    """
    invented = invented_years_in_web_query(query, user_text=user_text)
    if not invented:
        return (query or "").strip(), []
    out = query or ""
    for y in invented:
        out = re.sub(rf"(?<!\d){re.escape(y)}(?!\d)", " ", out)
    out = re.sub(r"\s+", " ", out).strip()
    return out, invented


def web_query_year_advice(
    query: str,
    *,
    user_text: str,
    today: date | None = None,
    stripped: list[str] | None = None,
) -> str | None:
    removed = stripped if stripped is not None else invented_years_in_web_query(
        query, user_text=user_text
    )
    if not removed:
        return None
    day = today or datetime.now(timezone.utc).date()
    years = ", ".join(removed)
    return (
        f"Harness removed invented calendar year(s) {years} from web_search "
        f"(user did not write them). Today (UTC) is {day.isoformat()} "
        f"(year {day.year}). Prefer queries without YYYY unless the user named one."
    )
