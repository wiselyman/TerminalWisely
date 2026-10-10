//! Command verbs for engines that are not SQL. SQL text stays on the AST path.

const REDIS_READ: &[&str] = &[
    "GET", "MGET", "KEYS", "SCAN", "TYPE", "PING", "EXISTS", "TTL", "PTTL", "HGET", "HGETALL",
    "HKEYS", "LRANGE", "SMEMBERS", "ZRANGE", "INFO", "DBSIZE", "STRLEN", "LLEN", "SCARD",
];
const REDIS_WRITE: &[&str] = &[
    "SET", "MSET", "DEL", "UNLINK", "HSET", "LPUSH", "RPUSH", "SADD", "ZADD", "INCR", "EXPIRE",
    "PERSIST", "RENAME", "APPEND",
];
const REDIS_DDL: &[&str] = &["FLUSHDB", "FLUSHALL"];

const MONGO_READ: &[&str] = &[
    "find", "aggregate", "count", "countdocuments", "distinct", "estimateddocumentcount",
    "listdatabases", "listcollections",
];
const MONGO_WRITE: &[&str] = &[
    "insert", "insertone", "insertmany", "update", "updateone", "updatemany", "delete",
    "deleteone", "deletemany", "replaceone",
];
const MONGO_DDL: &[&str] = &["drop", "dropdatabase", "createcollection", "createindex"];

pub fn command_statement_count(text: &str) -> usize {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .count()
}

pub fn classify_command(engine: &str, text: &str) -> Option<&'static str> {
    match engine {
        "redis" => Some(classify_redis(text)),
        "mongodb" => Some(classify_mongo(text)),
        _ => None,
    }
}

fn classify_redis(text: &str) -> &'static str {
    let verb = text
        .split_whitespace()
        .next()
        .unwrap_or("")
        .trim_matches('"')
        .to_ascii_uppercase();
    if REDIS_READ.contains(&verb.as_str()) {
        "read"
    } else if REDIS_WRITE.contains(&verb.as_str()) {
        "write"
    } else if REDIS_DDL.contains(&verb.as_str()) {
        "ddl"
    } else {
        "unparsed"
    }
}

fn classify_mongo(text: &str) -> &'static str {
    let head = text.split('(').next().unwrap_or(text).trim();
    let verb = head.rsplit('.').next().unwrap_or(head).trim().to_ascii_lowercase();
    if MONGO_READ.contains(&verb.as_str()) {
        "read"
    } else if MONGO_WRITE.contains(&verb.as_str()) {
        "write"
    } else if MONGO_DDL.contains(&verb.as_str()) {
        "ddl"
    } else {
        "unparsed"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redis_and_mongo_stay_off_the_sql_parser() {
        assert_eq!(classify_command("redis", "GET user:1"), Some("read"));
        assert_eq!(classify_command("redis", "SET user:1 a"), Some("write"));
        assert_eq!(classify_command("redis", "EXPIRE user:1 60"), Some("write"));
        assert_eq!(classify_command("redis", "PERSIST user:1"), Some("write"));
        assert_eq!(classify_command("redis", "FLUSHALL"), Some("ddl"));
        assert_eq!(classify_command("redis", "EVAL sha 0"), Some("unparsed"));
        assert_eq!(classify_command("mongodb", "db.orders.find({})"), Some("read"));
        assert_eq!(classify_command("mongodb", "db.orders.insertOne({})"), Some("write"));
        assert_eq!(classify_command("mongodb", "db.orders.drop()"), Some("ddl"));
        assert_eq!(classify_command("postgres", "SELECT 1"), None);
        assert_eq!(command_statement_count("GET a\nSET b 1"), 2);
    }
}
