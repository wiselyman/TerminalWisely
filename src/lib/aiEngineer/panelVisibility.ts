export type AiPanelSidebarView = "hosts" | "k8s";

/** AI Engineer panel is hidden in K8s view until a cluster is selected. */
export function shouldShowAiEngineerPanel(opts: {
  open: boolean;
  sessionId: string | null | undefined;
  sidebarView: AiPanelSidebarView;
  hasSelectedCluster: boolean;
  /** Hosts tab: must match the AI-bound session or the panel stays hidden. */
  activeTabId?: string | null;
}): boolean {
  if (!opts.open || !opts.sessionId) return false;
  if (opts.sidebarView === "k8s" && !opts.hasSelectedCluster) return false;
  if (
    opts.sidebarView === "hosts" &&
    opts.activeTabId != null &&
    opts.activeTabId !== "" &&
    opts.sessionId !== opts.activeTabId
  ) {
    return false;
  }
  return true;
}

/**
 * Keep the React tree mounted while the panel is soft-hidden on host-tab
 * switch (open=false). Remounting markdown makes chat text flash.
 */
export function shouldKeepAiEngineerPanelMounted(opts: {
  sessionId: string | null | undefined;
  show: boolean;
  sidebarView: AiPanelSidebarView;
  open: boolean;
}): boolean {
  if (!opts.sessionId) return false;
  if (opts.show) return true;
  return opts.sidebarView === "hosts" && !opts.open;
}
