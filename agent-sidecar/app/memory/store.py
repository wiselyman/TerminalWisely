"""Validated operational memory (SQLite). Memory is hypothesis, not authority."""

from __future__ import annotations

import sqlite3
import time
from typing import Any

from app import paths


def _connect() -> sqlite3.Connection:
    con = sqlite3.connect(str(paths.sqlite_path()))
    con.row_factory = sqlite3.Row
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS verified_cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            problem_signature TEXT NOT NULL,
            environment TEXT,
            os_version TEXT,
            software_version TEXT,
            root_cause TEXT,
            evidence TEXT,
            fix TEXT,
            verification TEXT,
            sources TEXT,
            confidence REAL DEFAULT 0.5,
            created_at REAL NOT NULL
        )
        """
    )
    con.commit()
    return con


def save_verified_case(case: dict[str, Any]) -> int:
    con = _connect()
    cur = con.execute(
        """
        INSERT INTO verified_cases(
            problem_signature, environment, os_version, software_version,
            root_cause, evidence, fix, verification, sources, confidence, created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            case.get("problem_signature") or "",
            case.get("environment"),
            case.get("os_version"),
            case.get("software_version"),
            case.get("root_cause"),
            case.get("evidence"),
            case.get("fix"),
            case.get("verification"),
            case.get("sources"),
            float(case.get("confidence") or 0.5),
            time.time(),
        ),
    )
    con.commit()
    row_id = int(cur.lastrowid)
    con.close()
    return row_id


def find_cases(signature: str, limit: int = 5) -> list[dict[str, Any]]:
    con = _connect()
    rows = con.execute(
        """
        SELECT * FROM verified_cases
        WHERE problem_signature LIKE ?
        ORDER BY created_at DESC LIMIT ?
        """,
        (f"%{signature}%", limit),
    ).fetchall()
    con.close()
    return [dict(r) for r in rows]
