mod auth;
mod command_risk;
mod catalog;
pub(crate) mod secrets;
pub mod commands;
mod driver;
mod engines;
mod gate;
mod oracle;
mod sqlserver;
mod lease;
mod live;
mod route;
mod sql_risk;

pub use auth::decide_sql;
pub use catalog::{DbCatalog, DbConnection, SaveDbConnection};
pub use gate::{
    authorize, run_statement, Authorized, GateOutcome, SqlExecutor, SqlJob, SqlRows, CATALOG_ROW_LIMIT,
    MAX_ROW_LIMIT,
};
pub use lease::{consume_db_lease, register_db_lease, DbLease};
pub use live::cancel_ssh;
pub use route::{dial_plan, DialPlan};
pub use command_risk::{classify_command, command_statement_count};
pub use sql_risk::{classify_sql, statement_count};
