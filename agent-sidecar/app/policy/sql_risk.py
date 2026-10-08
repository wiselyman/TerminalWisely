"""Classify SQL by AST. Parse failures stay unparsed; no source-text regex."""

from __future__ import annotations

import sqlglot
from sqlglot import exp
from sqlglot.errors import ParseError, TokenError

_ORDER = ("read", "write", "ddl", "transaction", "unparsed")

_STATEMENTS = (
    exp.Select,
    exp.Union,
    exp.Except,
    exp.Intersect,
    exp.Insert,
    exp.Update,
    exp.Delete,
    exp.Merge,
    exp.Drop,
    exp.Create,
    exp.Alter,
    exp.TruncateTable,
    exp.Grant,
    exp.Revoke,
    exp.Command,
    exp.Transaction,
    exp.Commit,
    exp.Rollback,
    exp.Set,
    exp.Show,
    exp.Describe,
    exp.Copy,
    exp.Values,
)


def assess_db_sql(sql: str, dialect: str, security_mode: str) -> dict[str, str]:
    """One statement goes through the risk matrix. Anything else never runs."""
    count = statement_count(sql, dialect)
    if count != 1:
        if count is None:
            return {
                "action": "error",
                "reason": "could not prove a single statement",
            }
        return {"action": "error", "reason": "only a single statement is accepted"}
    return decide_sql(sql, dialect, security_mode)


def decide_sql(sql: str, dialect: str, security_mode: str) -> dict[str, str]:
    """Same matrix as the Rust gate. Transaction is always denied."""
    kind = classify_sql(sql, dialect)
    mode = security_mode if security_mode in {"observe", "safe", "autonomous", "production"} else "safe"
    if kind == "transaction":
        return {"action": "deny", "risk": "", "reason": "transaction control is not accepted"}
    risk = {"read": "R0", "ddl": "R3"}.get(kind, "R2")
    if mode == "observe":
        if risk == "R0":
            return {"action": "allow", "risk": risk, "grant": "auto"}
        return {"action": "deny", "risk": risk, "reason": "OBSERVE: mutations denied"}
    if risk == "R0":
        return {"action": "allow", "risk": risk, "grant": "auto"}
    if mode == "autonomous" and risk == "R2":
        return {"action": "allow", "risk": risk, "grant": "auto"}
    return {"action": "require_approval", "risk": risk, "grant": "approval"}


def _worse(left: str, right: str) -> str:
    return left if _ORDER.index(left) >= _ORDER.index(right) else right


def _read_dialect(dialect: str) -> str | None:
    return {
        "postgres": "postgres",
        "mysql": "mysql",
        "sqlserver": "tsql",
        "oracle": "oracle",
    }.get(dialect)


def classify_sql(sql: str, dialect: str) -> str:
    read = _read_dialect(dialect)
    if read is None:
        return "unparsed"
    if not isinstance(sql, str) or not sql.strip():
        return "unparsed"
    try:
        trees = sqlglot.parse(sql, read=read)
    except (ParseError, TokenError):
        return _recover_failed_parse(sql, dialect)
    statements = [
        tree
        for tree in trees
        if tree is not None and not isinstance(tree, exp.Semicolon)
    ]
    if not statements:
        return "unparsed"
    worst = "read"
    for statement in statements:
        worst = _worse(worst, _classify_one(statement, dialect))
    return worst


def explain_text(sql: str) -> str:
    """The single EXPLAIN string Rust will execute. Callers keep the inner SQL."""
    return f"EXPLAIN {sql.strip()}"


def statement_count(sql: str, dialect: str) -> int | None:
    """How many statements the tokenizer can prove. None when that proof fails."""
    read = _read_dialect(dialect)
    if read is None:
        return None
    if not isinstance(sql, str) or not sql.strip():
        return 0
    try:
        trees = sqlglot.parse(sql, read=read)
    except (ParseError, TokenError):
        return _token_statement_count(sql, read)
    return sum(
        1
        for tree in trees
        if tree is not None and not isinstance(tree, exp.Semicolon)
    )


def _token_statement_count(sql: str, dialect: str) -> int | None:
    read = _read_dialect(dialect) or dialect
    try:
        tokens = sqlglot.tokenize(sql, read=read)
    except (ParseError, TokenError):
        return None
    count = 0
    started = False
    for token in tokens:
        kind = token.token_type.name
        if kind == "SEMICOLON":
            if started:
                count += 1
                started = False
            continue
        if "COMMENT" in kind or kind in {"WHITESPACE", "SPACE"}:
            continue
        started = True
    if started:
        count += 1
    return count


def _classify_one(statement: exp.Expression, dialect: str) -> str:
    if isinstance(statement, exp.Command):
        return _from_command(statement, dialect)
    if not isinstance(statement, _STATEMENTS):
        return "unparsed"
    worst = "read"
    for node in statement.walk():
        kind = _node_kind(node)
        if kind == "unparsed":
            return "unparsed"
        if kind is not None:
            worst = _worse(worst, kind)
    return worst


def _node_kind(node: exp.Expression) -> str | None:
    if isinstance(node, exp.Command):
        return "unparsed"
    if isinstance(node, (exp.Transaction, exp.Commit, exp.Rollback)):
        return "transaction"
    if isinstance(
        node,
        (exp.Create, exp.Drop, exp.Alter, exp.TruncateTable, exp.Grant, exp.Revoke),
    ):
        return "ddl"
    if isinstance(node, (exp.Insert, exp.Update, exp.Delete, exp.Merge, exp.Copy)):
        return "write"
    if isinstance(node, exp.Set):
        return "write"
    if isinstance(node, exp.Select):
        if node.args.get("into") is not None or node.args.get("locks"):
            return "write"
        return "read"
    if isinstance(node, exp.Describe):
        style = str(node.args.get("style") or "").upper()
        if "ANALYZE" in style:
            return "write"
        return "read"
    if isinstance(node, (exp.Union, exp.Except, exp.Intersect, exp.Show, exp.Values)):
        return "read"
    return None


def _from_command(command: exp.Command, dialect: str) -> str:
    name = str(command.this or "").upper()
    if name == "SHOW":
        return "read"
    if name != "EXPLAIN":
        return "unparsed"
    expression = command.args.get("expression")
    if isinstance(expression, exp.Literal):
        payload = str(expression.this or "")
    elif isinstance(expression, exp.Expression):
        payload = expression.sql(dialect=_read_dialect(dialect) or dialect)
    else:
        payload = ""
    return _explain_payload(payload, dialect)


def _explain_payload(payload: str, dialect: str) -> str:
    body = payload.strip()
    if not body:
        return "unparsed"
    read = _read_dialect(dialect) or dialect
    try:
        tokens = sqlglot.tokenize(body, read=read)
    except (ParseError, TokenError):
        return "unparsed"
    if not tokens:
        return "unparsed"
    analyze = False
    if tokens[0].text == "(":
        depth = 0
        end_index = None
        for index, token in enumerate(tokens):
            if token.text == "(":
                depth += 1
            elif token.text == ")":
                depth -= 1
                if depth == 0:
                    end_index = index
                    break
            if token.text.upper() == "ANALYZE":
                analyze = True
        if end_index is None:
            return "unparsed"
        body = body[tokens[end_index].end + 1 :].strip()
    elif tokens[0].text.upper() == "ANALYZE":
        analyze = True
        body = body[tokens[0].end + 1 :].strip()
    inner = classify_sql(body, dialect)
    if inner == "unparsed":
        return "unparsed"
    if analyze:
        return _worse(inner, "write")
    return inner


def _recover_failed_parse(sql: str, dialect: str) -> str:
    """MySQL file-output forms that the parser rejects still carry an INTO token."""
    read = _read_dialect(dialect) or dialect
    try:
        tokens = sqlglot.tokenize(sql, read=read)
    except (ParseError, TokenError):
        return "unparsed"
    texts = [token.text.upper() for token in tokens]
    if "INTO" not in texts:
        return "unparsed"
    index = texts.index("INTO")
    if index + 1 < len(texts) and texts[index + 1] in {"OUTFILE", "DUMPFILE"}:
        return "write"
    return "unparsed"
