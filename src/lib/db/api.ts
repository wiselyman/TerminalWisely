import { invoke } from "@tauri-apps/api/core";

export type DbConnection = {
  id: string;
  name: string;
  engine: "postgres" | "mysql" | string;
  host: string;
  port: number;
  database: string;
  user: string;
  tls: "disabled" | "verify-full" | string;
  ssh_session_id?: string | null;
  auth_database?: string;
  revision: number;
  secret_id: string;
};

export type DbQueryResponse = {
  kind: "rows" | "needs_approval";
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
  risk: string;
  connection_id: string;
  revision: number;
  operation: string;
  sql: string;
};

export type SaveDbRequest = {
  id?: string | null;
  name: string;
  engine: string;
  host: string;
  port?: number | null;
  database: string;
  user: string;
  tls: string;
  ssh_session_id?: string | null;
  password?: string | null;
  auth_database?: string;
  clear_secret?: boolean;
};

export function dbListConnections(): Promise<DbConnection[]> {
  return invoke("db_list_connections");
}

export function dbSaveConnection(request: SaveDbRequest): Promise<DbConnection> {
  return invoke("db_save_connection", { request });
}

export function dbTestConnection(request: SaveDbRequest): Promise<string> {
  return invoke("db_test_connection", { request });
}

export function dbDeleteConnection(connectionId: string): Promise<void> {
  return invoke("db_delete_connection", { connectionId });
}

export function dbQuery(args: {
  connectionId: string;
  sql: string;
  rowLimit?: number;
  leaseId?: string | null;
  database?: string | null;
  operationId?: string | null;
}): Promise<DbQueryResponse> {
  return invoke("db_query", {
    connectionId: args.connectionId,
    sql: args.sql,
    rowLimit: args.rowLimit ?? 500,
    leaseId: args.leaseId ?? null,
    database: args.database ?? null,
    operationId: args.operationId ?? null,
  });
}

export function dbCancelQuery(operationId: string): Promise<void> {
  return invoke("db_cancel_query", { operationId });
}

export function dbListSavedQueries(connectionId: string): Promise<Array<{ id: string; name: string; sql: string }>> {
  return invoke("db_list_saved_queries", { connectionId });
}

export function dbWriteSavedQueries(
  connectionId: string,
  queries: Array<{ id: string; name: string; sql: string }>,
): Promise<void> {
  return invoke("db_write_saved_queries", { connectionId, queries });
}

export function dbExplain(args: {
  connectionId: string;
  sql: string;
  leaseId?: string | null;
  database?: string | null;
  operationId?: string | null;
}): Promise<DbQueryResponse> {
  return invoke("db_explain", {
    connectionId: args.connectionId,
    sql: args.sql,
    leaseId: args.leaseId ?? null,
    database: args.database ?? null,
    operationId: args.operationId ?? null,
  });
}

export function dbListDatabases(connectionId: string): Promise<DbQueryResponse> {
  return invoke("db_list_databases", { connectionId });
}

export function dbSearchObjects(
  connectionId: string,
  query?: string,
  database?: string | null,
): Promise<DbQueryResponse> {
  return invoke("db_search_objects", {
    connectionId,
    query: query ?? null,
    database: database ?? null,
  });
}

export function dbSearchStructure(
  connectionId: string,
  query?: string,
  database?: string | null,
): Promise<DbQueryResponse> {
  return invoke("db_search_structure", {
    connectionId,
    query: query ?? null,
    database: database ?? null,
  });
}

export function dbStatus(connectionId: string, page: string): Promise<DbQueryResponse> {
  return invoke("db_status", { connectionId, page });
}

export function dbRegisterLease(args: {
  connectionId: string;
  revision: number;
  operation: string;
  sql: string;
}): Promise<string> {
  return invoke("db_register_lease", {
    connectionId: args.connectionId,
    revision: args.revision,
    operation: args.operation,
    sql: args.sql,
  });
}

export function approvalStillMatches(pendingSql: string, editorSql: string): boolean {
  return pendingSql.trim() === editorSql.trim();
}
