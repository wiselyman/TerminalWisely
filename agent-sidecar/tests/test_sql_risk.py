import json
from pathlib import Path

from app.policy.sql_risk import classify_sql, decide_sql

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "sql-risk.json"


def test_shared_sql_risk_fixture():
    payload = json.loads(FIXTURE.read_text())
    for case in payload["cases"]:
        got = classify_sql(case["sql"], case["dialect"])
        assert got == case["expect"], (
            f"{case['dialect']!r} {case['sql']!r}: {got} != {case['expect']}"
        )


def test_decide_sql_matches_security_mode():
    assert decide_sql("SELECT 1", "postgres", "observe")["action"] == "allow"
    assert decide_sql("UPDATE t SET a = 1", "postgres", "observe")["action"] == "deny"
    assert decide_sql("DROP TABLE t", "postgres", "safe")["risk"] == "R3"
    assert decide_sql("DROP TABLE t", "postgres", "safe")["action"] == "require_approval"
    assert decide_sql("UPDATE t SET a = 1", "postgres", "autonomous")["action"] == "allow"
    assert decide_sql("DROP TABLE t", "postgres", "autonomous")["action"] == "require_approval"
    assert decide_sql("BEGIN", "mysql", "production")["action"] == "deny"
    assert decide_sql("not sql", "postgres", "safe")["action"] == "require_approval"
    assert decide_sql("not sql", "postgres", "observe")["action"] == "deny"
