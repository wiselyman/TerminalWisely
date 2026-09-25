"""web_search: do not invent calendar years the user did not write."""

from __future__ import annotations

from datetime import date

from app.harness.web_query_calendar import (
    invented_years_in_web_query,
    strip_invented_calendar_years,
    web_query_year_advice,
    years_mentioned,
)


def test_years_mentioned() -> None:
    assert years_mentioned("RTX 5090 price 2025 China") == {"2025"}
    assert years_mentioned("port 8080 and 2024-01") == {"2024"}
    assert years_mentioned("no year here") == set()


def test_invented_years_when_user_silent() -> None:
    assert invented_years_in_web_query(
        "AMD Threadripper price 2025",
        user_text="这台电脑现在多少钱",
    ) == ["2025"]


def test_user_named_year_is_not_invented() -> None:
    assert (
        invented_years_in_web_query(
            "GPU price 2024",
            user_text="查一下 2024 年的显卡行情",
        )
        == []
    )


def test_strip_invented_year_keeps_user_year() -> None:
    cleaned, removed = strip_invented_calendar_years(
        "NVIDIA RTX 5090 32GB 价格 2025 最新",
        user_text="显卡价格严重不符合事实，现在至少3万一个以上",
    )
    assert removed == ["2025"]
    assert "2025" not in cleaned
    assert "NVIDIA RTX 5090" in cleaned
    assert "最新" in cleaned

    kept, removed2 = strip_invented_calendar_years(
        "GPU 2024",
        user_text="只要 2024 的数据",
    )
    assert removed2 == []
    assert kept == "GPU 2024"


def test_advice_after_strip() -> None:
    note = web_query_year_advice(
        "laptop price 2025",
        user_text="最新价格",
        today=date(2026, 9, 25),
        stripped=["2025"],
    )
    assert note is not None
    assert "2025" in note
    assert "2026-09-25" in note
    assert "removed" in note.lower()
