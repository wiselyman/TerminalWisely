//! Security-mode decision for a classified statement.
//! The caller supplies the mode read from trusted settings, never a frontend flag.

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SqlAuth {
    Allow { risk: &'static str, automatic: bool },
    Deny { reason: &'static str },
    RequireApproval { risk: &'static str },
}

pub fn decide_sql(class: &str, security_mode: &str) -> SqlAuth {
    if class == "transaction" {
        return SqlAuth::Deny {
            reason: "transaction control is not accepted",
        };
    }
    let mode = match security_mode {
        "observe" | "safe" | "autonomous" | "production" => security_mode,
        _ => "safe",
    };
    let risk = match class {
        "read" => "R0",
        "ddl" => "R3",
        "write" | "unparsed" => "R2",
        _ => "R2",
    };
    if mode == "observe" {
        return if risk == "R0" {
            SqlAuth::Allow {
                risk,
                automatic: true,
            }
        } else {
            SqlAuth::Deny {
                reason: "OBSERVE: mutations denied",
            }
        };
    }
    if risk == "R0" {
        return SqlAuth::Allow {
            risk,
            automatic: true,
        };
    }
    if mode == "autonomous" && risk == "R2" {
        return SqlAuth::Allow {
            risk,
            automatic: true,
        };
    }
    SqlAuth::RequireApproval { risk }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modes_cover_each_class() {
        let modes = ["observe", "safe", "autonomous", "production"];
        let classes = ["read", "write", "ddl", "unparsed", "transaction"];
        for mode in modes {
            for class in classes {
                let decision = decide_sql(class, mode);
                match (mode, class) {
                    (_, "transaction") => {
                        assert!(matches!(decision, SqlAuth::Deny { .. }), "{mode} {class}")
                    }
                    ("observe", "read") => assert!(matches!(
                        decision,
                        SqlAuth::Allow {
                            risk: "R0",
                            automatic: true
                        }
                    )),
                    ("observe", _) => assert!(matches!(decision, SqlAuth::Deny { .. })),
                    (_, "read") => assert!(matches!(
                        decision,
                        SqlAuth::Allow {
                            risk: "R0",
                            automatic: true
                        }
                    )),
                    ("autonomous", "write" | "unparsed") => assert!(matches!(
                        decision,
                        SqlAuth::Allow {
                            risk: "R2",
                            automatic: true
                        }
                    )),
                    (_, "ddl") => assert!(matches!(
                        decision,
                        SqlAuth::RequireApproval { risk: "R3" }
                    )),
                    _ => assert!(matches!(
                        decision,
                        SqlAuth::RequireApproval { risk: "R2" }
                    )),
                }
            }
        }
    }
}
