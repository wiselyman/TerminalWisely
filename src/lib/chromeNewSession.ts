export type ChromeNewAction = "ssh" | "cluster" | "database";

/** Title-bar plus follows the sidebar that is open. */
export function chromeNewAction(view: "hosts" | "k8s" | "db"): ChromeNewAction {
  if (view === "k8s") return "cluster";
  if (view === "db") return "database";
  return "ssh";
}
