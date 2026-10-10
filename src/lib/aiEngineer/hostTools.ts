/** Tools the webview must execute while the sidecar waits on awaiting_host. */

export function isHostExecutedTool(name: string): boolean {
  return (
    name === "terminal_exec" ||
    name === "ai_exec" ||
    name.startsWith("k8s_") ||
    name === "db_query" ||
    name === "db_explain" ||
    name === "db_search_objects"
  );
}

/** /v1/tool_result only carries stdout. Catalog tools return columns/rows. */
export function hostToolResultStdout(result: Record<string, unknown>): string {
  if (typeof result.stdout === "string" && result.stdout) return result.stdout;
  if (result.columns != null || result.rows != null) {
    const body: Record<string, unknown> = {
      columns: result.columns,
      rows: result.rows,
    };
    if (result.truncated != null) body.truncated = result.truncated;
    return JSON.stringify(body);
  }
  return "";
}
