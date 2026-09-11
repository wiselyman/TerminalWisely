export type K8sTerminalTab = {
  id: string;
  title: string;
};

export type K8sCreateResourceTab = {
  id: string;
  title: string;
  yaml: string;
  templateId: string;
};

/** Open the embedded terminal dock — always appends a new session tab. */
export function openK8sTerminalDock(
  tabs: K8sTerminalTab[],
  t: (key: string, opts?: Record<string, unknown>) => string,
): { tabs: K8sTerminalTab[]; activeTabId: string; open: true; collapsed: false } {
  const id = `term-${Date.now()}`;
  const nextTabs = [
    ...tabs,
    { id, title: t("dockTerminalTab", { n: tabs.length + 1 }) },
  ];
  return {
    tabs: nextTabs,
    activeTabId: id,
    open: true,
    collapsed: false,
  };
}
