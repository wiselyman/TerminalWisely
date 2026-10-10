//! AST classification shared with `fixtures/sql-risk.json`.
//! Parse failures stay unparsed. No source-text regex.

use std::ops::ControlFlow;

use sqlparser::ast::{Query, Select, SetExpr, Statement, Visit, Visitor};
use sqlparser::dialect::{Dialect, GenericDialect, MsSqlDialect, MySqlDialect, PostgreSqlDialect, SQLiteDialect};
use sqlparser::parser::Parser;
use sqlparser::tokenizer::{Token, Tokenizer, Word};

const ORDER: [&str; 5] = ["read", "write", "ddl", "transaction", "unparsed"];

fn sql_dialect(name: &str) -> Option<Box<dyn Dialect>> {
    match name {
        "postgres" => Some(Box::new(PostgreSqlDialect {})),
        "mysql" | "mariadb" => Some(Box::new(MySqlDialect {})),
        "sqlite" => Some(Box::new(SQLiteDialect {})),
        "sqlserver" => Some(Box::new(MsSqlDialect {})),
        // sqlparser ships MsSqlDialect and no Oracle dialect. GenericDialect
        // accepts the statements we classify, including :1 binds.
        "oracle" => Some(Box::new(GenericDialect {})),
        _ => None,
    }
}

fn worse<'a>(left: &'a str, right: &'a str) -> &'a str {
    let left_rank = ORDER.iter().position(|item| *item == left).unwrap_or(0);
    let right_rank = ORDER.iter().position(|item| *item == right).unwrap_or(0);
    if left_rank >= right_rank {
        left
    } else {
        right
    }
}

/// `Some(n)` when the dialect tokenizer can prove how many statements are present.
pub fn statement_count(sql: &str, dialect_name: &str) -> Option<usize> {
    let trimmed = sql.trim();
    let Some(dialect) = sql_dialect(dialect_name) else {
        return if trimmed.is_empty() { Some(0) } else { None };
    };
    if trimmed.is_empty() {
        return Some(0);
    }
    match Parser::parse_sql(dialect.as_ref(), trimmed) {
        Ok(statements) => Some(statements.len()),
        Err(_) => token_statement_count(dialect.as_ref(), trimmed),
    }
}

fn token_statement_count(dialect: &dyn Dialect, sql: &str) -> Option<usize> {
    let mut tokenizer = Tokenizer::new(dialect, sql);
    let tokens = tokenizer.tokenize().ok()?;
    let mut count = 0usize;
    let mut started = false;
    for token in tokens {
        match token {
            Token::Whitespace(_) => {}
            Token::SemiColon => {
                if started {
                    count += 1;
                    started = false;
                }
            }
            _ => started = true,
        }
    }
    if started {
        count += 1;
    }
    Some(count)
}

pub fn classify_sql(sql: &str, dialect_name: &str) -> &'static str {
    let trimmed = sql.trim();
    let Some(dialect) = sql_dialect(dialect_name) else {
        return "unparsed";
    };
    if trimmed.is_empty() {
        return "unparsed";
    }
    match Parser::parse_sql(dialect.as_ref(), trimmed) {
        Ok(statements) if statements.is_empty() => "unparsed",
        Ok(statements) => {
            let mut worst = "read";
            for statement in &statements {
                worst = worse(worst, classify_statement(statement));
            }
            worst
        }
        Err(_) => {
            if file_output(dialect.as_ref(), trimmed) {
                "write"
            } else {
                "unparsed"
            }
        }
    }
}

fn classify_statement(statement: &Statement) -> &'static str {
    match statement {
        Statement::Query(query) => classify_query(query),
        Statement::Explain {
            analyze,
            statement,
            options,
            ..
        } => {
            let inner = classify_statement(statement);
            if inner == "unparsed" {
                return "unparsed";
            }
            if *analyze || options_request_analyze(options) {
                worse(inner, "write")
            } else {
                inner
            }
        }
        Statement::ExplainTable { .. } => "read",
        Statement::StartTransaction { .. }
        | Statement::Commit { .. }
        | Statement::Rollback { .. }
        | Statement::Savepoint { .. }
        | Statement::ReleaseSavepoint { .. }
        | Statement::SetTransaction { .. } => "transaction",
        other => keyword_class(other),
    }
}

fn classify_query(query: &Query) -> &'static str {
    let mut worst = "read";
    if !query.locks.is_empty() || nested_write(query) {
        worst = worse(worst, "write");
    }
    if let Some(with) = &query.with {
        for cte in &with.cte_tables {
            worst = worse(worst, classify_query(&cte.query));
        }
    }
    worse(worst, classify_body(&query.body))
}

fn classify_body(body: &SetExpr) -> &'static str {
    match body {
        SetExpr::Select(select) => classify_select(select),
        SetExpr::Query(query) => classify_query(query),
        SetExpr::SetOperation { left, right, .. } => {
            worse(classify_body(left), classify_body(right))
        }
        SetExpr::Values(_) | SetExpr::Table(_) => "read",
        SetExpr::Insert(statement) | SetExpr::Update(statement) => classify_statement(statement),
    }
}

fn classify_select(select: &Select) -> &'static str {
    if select.into.is_some() {
        "write"
    } else {
        "read"
    }
}

fn options_request_analyze(options: &Option<Vec<sqlparser::ast::UtilityOption>>) -> bool {
    options.as_ref().is_some_and(|items| {
        items
            .iter()
            .any(|option| option.name.value.eq_ignore_ascii_case("analyze"))
    })
}

struct NestedWrite {
    hit: bool,
}

impl Visitor for NestedWrite {
    type Break = ();

    fn pre_visit_query(&mut self, query: &Query) -> ControlFlow<Self::Break> {
        if !query.locks.is_empty() {
            self.hit = true;
        }
        if let SetExpr::Select(select) = query.body.as_ref() {
            if select.into.is_some() {
                self.hit = true;
            }
        }
        ControlFlow::Continue(())
    }
}

fn nested_write(query: &Query) -> bool {
    let mut walk = NestedWrite { hit: false };
    let _ = query.visit(&mut walk);
    walk.hit
}

fn keyword_class(statement: &Statement) -> &'static str {
    match statement {
        Statement::Insert(_)
        | Statement::Update { .. }
        | Statement::Delete(_)
        | Statement::Merge { .. }
        | Statement::Copy { .. }
        | Statement::Call(_)
        | Statement::Load { .. } => "write",
        Statement::Drop { .. }
        | Statement::Truncate { .. }
        | Statement::Grant { .. }
        | Statement::Revoke { .. }
        | Statement::AlterTable { .. }
        | Statement::CreateTable(_)
        | Statement::CreateIndex(_)
        | Statement::Comment { .. } => "ddl",
        Statement::ShowFunctions { .. }
        | Statement::ShowVariable { .. }
        | Statement::ShowStatus { .. }
        | Statement::ShowVariables { .. }
        | Statement::ShowCreate { .. }
        | Statement::ShowColumns { .. }
        | Statement::ShowDatabases { .. }
        | Statement::ShowSchemas { .. }
        | Statement::ShowObjects(_)
        | Statement::ShowTables { .. }
        | Statement::ShowViews { .. }
        | Statement::ShowCollation { .. } => "read",
        _ => "unparsed",
    }
}

fn file_output(dialect: &dyn Dialect, sql: &str) -> bool {
    let mut tokenizer = Tokenizer::new(dialect, sql);
    let Ok(tokens) = tokenizer.tokenize() else {
        return false;
    };
    let mut saw_into = false;
    for token in tokens {
        match token {
            Token::Whitespace(_) => {}
            Token::Word(Word { value, .. }) if value.eq_ignore_ascii_case("INTO") => {
                saw_into = true;
            }
            Token::Word(Word { value, .. })
                if saw_into
                    && matches!(value.to_ascii_uppercase().as_str(), "OUTFILE" | "DUMPFILE") =>
            {
                return true;
            }
            _ => saw_into = false,
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maintain_statements_are_single_and_need_approval_class() {
        for (dialect, sql) in [
            ("postgres", r#"VACUUM "public"."orders""#),
            ("postgres", r#"ANALYZE "public"."orders""#),
            ("postgres", r#"REINDEX TABLE "public"."orders""#),
            ("mysql", "OPTIMIZE TABLE `shop`.`orders`"),
            ("mysql", "ANALYZE TABLE `shop`.`orders`"),
            ("sqlite", r#"ANALYZE "main"."orders""#),
        ] {
            assert_eq!(statement_count(sql, dialect), Some(1), "{dialect} {sql}");
            let class = classify_sql(sql, dialect);
            assert!(
                matches!(class, "write" | "ddl" | "unparsed"),
                "{dialect} {sql} -> {class}"
            );
        }
    }

    #[test]
    fn shared_fixture_matches_rust() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../fixtures/sql-risk.json");
        let text = std::fs::read_to_string(path).expect("fixture");
        let payload: serde_json::Value = serde_json::from_str(&text).expect("json");
        for case in payload["cases"].as_array().expect("cases") {
            let dialect = case["dialect"].as_str().unwrap();
            let sql = case["sql"].as_str().unwrap();
            let expect = case["expect"].as_str().unwrap();
            let got = classify_sql(sql, dialect);
            assert_eq!(got, expect, "{dialect} {sql:?}: {got} != {expect}");
        }
    }
}
