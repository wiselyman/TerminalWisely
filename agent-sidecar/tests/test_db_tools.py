"""Database tool surface: direct connections hide terminal_exec; a bound session is exact."""

from app.agent.db_context import resolve_db_terminal_session
from app.policy.sql_risk import assess_db_sql, explain_text
from app.runtime.tw_mcp import tw_mcp_tool_names
from app.tools.schema import openai_tools


def _names(tools):
    return {(item.get("function") or {}).get("name") for item in tools}


def test_direct_connection_omits_terminal_exec():
    names = _names(openai_tools(engineer_mode="db"))
    assert "db_query" in names
    assert "db_search_objects" in names
    assert "db_explain" in names
    assert "terminal_exec" not in names
    assert "terminal_exec" not in tw_mcp_tool_names(engineer_mode="db")


def test_tunnel_connection_exposes_terminal_exec():
    names = _names(openai_tools(engineer_mode="db", ssh_session_id="ssh-1"))
    assert "terminal_exec" in names
    assert "terminal_exec" in tw_mcp_tool_names(
        engineer_mode="db", ssh_session_id="ssh-1"
    )


def test_terminal_session_must_match_the_bound_host():
    metadata = {
        "engineer_mode": "db",
        "db_context": {"ssh_session_id": "ssh-1", "connection_id": "c1"},
    }
    assert resolve_db_terminal_session(metadata, "", "db:c1") == "ssh-1"
    assert resolve_db_terminal_session(metadata, "ssh-1", "db:c1") == "ssh-1"
    assert resolve_db_terminal_session(metadata, "ssh-other", "db:c1") is None
    direct = {
        "engineer_mode": "db",
        "db_context": {"connection_id": "c1"},
    }
    assert resolve_db_terminal_session(direct, "ssh-1", "db:c1") is None


def test_explain_text_wraps_once_and_leaves_the_inner_statement():
    assert explain_text("SELECT 1") == "EXPLAIN SELECT 1"
    assert explain_text("  SELECT 1  ") == "EXPLAIN SELECT 1"
    decision = assess_db_sql(explain_text("SELECT 1"), "postgres", "observe")
    assert decision["action"] == "allow"


def test_unprovable_sql_is_rejected():
    decision = assess_db_sql("SELECT '", "postgres", "autonomous")
    assert decision["action"] == "error"
    assert "prove" in decision["reason"]


def test_multi_statement_is_rejected_before_a_driver():
    decision = assess_db_sql("SELECT 1; DROP TABLE t", "postgres", "autonomous")
    assert decision["action"] == "error"
    update = assess_db_sql("UPDATE t SET a = 1", "postgres", "safe")
    assert update["action"] == "require_approval"
    read = assess_db_sql("SELECT 1", "postgres", "observe")
    assert read["action"] == "allow"
