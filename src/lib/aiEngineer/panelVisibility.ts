export type AiPanelSidebarView = "hosts" | "k8s";

/** AI Engineer panel is hidden in K8s view until a cluster is selected. */
export function shouldShowAiEngineerPanel(opts: {
  open: boolean;
  sessionId: string | null | undefined;
  sidebarView: AiPanelSidebarView;
  hasSelectedCluster: boolean;
}): boolean {
  if (!opts.open || !opts.sessionId) return false;
  if (opts.sidebarView === "k8s" && !opts.hasSelectedCluster) return false;
  return true;
}
