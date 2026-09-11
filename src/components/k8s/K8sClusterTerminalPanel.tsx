import { useEffect, useRef, useState } from "react";
import { ChevronDown, FilePlus, Plus, Save, Search, Terminal, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { K8sClusterTarget } from "../../lib/k8s/types";
import type { K8sCreateTemplateId } from "../../lib/k8s/createResource";
import type { K8sCreateResourceTab, K8sTerminalTab } from "../../lib/k8s/dock";
import { K8sClusterTerminal } from "./K8sClusterTerminal";
import { K8sTemplatePicker } from "./K8sTemplatePicker";
import { K8sYamlEditor } from "./K8sYamlEditor";

export type { K8sCreateResourceTab, K8sTerminalTab };

type TerminalTabsProps = {
  tabs: K8sTerminalTab[];
  activeTabId: string | null;
  detailTabActive: boolean;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
};

/** Terminal session tabs in the detail tab row. */
export function K8sClusterTerminalTabs({
  tabs,
  activeTabId,
  detailTabActive,
  onSelectTab,
  onCloseTab,
}: TerminalTabsProps) {
  const { t } = useTranslation("k8s");
  if (tabs.length === 0) return null;

  return (
    <>
      {tabs.map((tab) => {
        const active = detailTabActive && tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? "active" : ""}
            data-testid={`k8s-dock-tab-${tab.id}`}
            onClick={() => onSelectTab(tab.id)}
          >
            <Terminal size={12} strokeWidth={2} aria-hidden />
            <span>{tab.title}</span>
            <span
              className="k8s-detail-terminal-tab-close"
              role="button"
              tabIndex={0}
              aria-label={t("dockCloseTab")}
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }
              }}
            >
              <X size={12} strokeWidth={2} />
            </span>
          </button>
        );
      })}
    </>
  );
}

type CreateResourceTabsProps = {
  tabs: K8sCreateResourceTab[];
  activeTabId: string | null;
  detailTabActive: boolean;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
};

export function K8sCreateResourceTabs({
  tabs,
  activeTabId,
  detailTabActive,
  onSelectTab,
  onCloseTab,
}: CreateResourceTabsProps) {
  const { t } = useTranslation("k8s");
  if (tabs.length === 0) return null;

  return (
    <>
      {tabs.map((tab) => {
        const active = detailTabActive && tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? "active" : ""}
            data-testid={`k8s-dock-tab-${tab.id}`}
            onClick={() => onSelectTab(tab.id)}
          >
            <FilePlus size={12} strokeWidth={2} aria-hidden />
            <span>{tab.title}</span>
            <span
              className="k8s-detail-terminal-tab-close"
              role="button"
              tabIndex={0}
              aria-label={t("dockCloseTab")}
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }
              }}
            >
              <X size={12} strokeWidth={2} />
            </span>
          </button>
        );
      })}
    </>
  );
}

type AddMenuProps = {
  cluster: K8sClusterTarget;
  onAddTerminal: () => void;
  onCreateResource: () => void;
  onFocusSshTerminal?: () => void;
  /** `toolbar` = table toolbar Create; `tabs` = detail tab row + */
  placement?: "tabs" | "toolbar";
};

/** + menu — terminal session / create resource. */
export function K8sDetailTabAddMenu({
  cluster,
  onAddTerminal,
  onCreateResource,
  onFocusSshTerminal,
  placement = "tabs",
}: AddMenuProps) {
  const { t } = useTranslation("k8s");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const wrapClass =
    placement === "toolbar"
      ? "k8s-toolbar-create-wrap"
      : "k8s-detail-terminal-add-wrap";
  const btnClass =
    placement === "toolbar" ? "k8s-toolbar-create" : "k8s-detail-terminal-add";
  const testId =
    placement === "toolbar" ? "k8s-toolbar-create" : "k8s-detail-tab-add";

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen]);

  if (cluster.kind !== "kubeconfig") return null;

  const addTerminal = () => {
    onAddTerminal();
    setMenuOpen(false);
  };

  const addCreateResource = () => {
    onCreateResource();
    setMenuOpen(false);
  };

  return (
    <div className={wrapClass} ref={menuRef}>
      <button
        type="button"
        className={btnClass}
        data-testid={testId}
        aria-label={placement === "toolbar" ? t("toolbarCreate") : t("dockAddMenu")}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
      >
        {placement === "toolbar" ? (
          <>
            <span>{t("toolbarCreate")}</span>
            <ChevronDown size={14} strokeWidth={2} aria-hidden />
          </>
        ) : (
          <Plus size={18} strokeWidth={2} />
        )}
      </button>
      {menuOpen ? (
        <div className="k8s-dock-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            data-testid="k8s-dock-create-resource"
            onClick={addCreateResource}
          >
            {t("dockCreateResource")}
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="k8s-dock-terminal-session"
            onClick={() => {
              if (cluster.kind !== "kubeconfig") {
                onFocusSshTerminal?.();
                setMenuOpen(false);
                return;
              }
              addTerminal();
            }}
          >
            {t("dockTerminalSession")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

type PanesProps = {
  cluster: K8sClusterTarget;
  tabs: K8sTerminalTab[];
  activeTabId: string | null;
  visible: boolean;
  onCloseTab: (tabId: string) => void;
  onError?: (message: string) => void;
  onSendSelection?: (text: string) => void;
};

/** Keep every session mounted; hide inactive tabs so PTY stays connected. */
export function K8sClusterTerminalPanes({
  cluster,
  tabs,
  activeTabId,
  visible,
  onCloseTab,
  onError,
  onSendSelection,
}: PanesProps) {
  const { t } = useTranslation("k8s");
  const contextLabel = cluster.context?.trim() || cluster.display_name;

  if (tabs.length === 0 || cluster.kind !== "kubeconfig") return null;

  return (
    <div
      className="k8s-detail-pane-slot k8s-detail-terminal-stack"
      hidden={!visible}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className="k8s-detail-terminal-pane"
            hidden={!active}
            data-testid={active ? "k8s-workbench-dock" : undefined}
          >
            <p className="k8s-dock-context" data-testid="k8s-dock-context">
              {t("dockClusterContext", { cluster: contextLabel })}
            </p>
            <K8sClusterTerminal
              cluster={cluster}
              onError={(msg) => {
                onError?.(msg);
                onCloseTab(tab.id);
              }}
              onSendSelection={onSendSelection}
            />
          </div>
        );
      })}
    </div>
  );
}

type CreateResourcePaneProps = {
  tab: K8sCreateResourceTab;
  onYamlChange: (yaml: string) => void;
  onTemplateChange: (templateId: K8sCreateTemplateId) => void;
  onApply: () => void;
  visible: boolean;
};

export function K8sCreateResourcePane({
  tab,
  onYamlChange,
  onTemplateChange,
  onApply,
  visible,
}: CreateResourcePaneProps) {
  const { t } = useTranslation("k8s");
  const [findOpen, setFindOpen] = useState(false);

  return (
    <div
      className="k8s-detail-pane-slot k8s-create-resource-pane"
      hidden={!visible}
      data-testid={`k8s-create-resource-pane-${tab.id}`}
    >
      <div className="k8s-create-resource-toolbar">
        <div className="k8s-create-resource-toolbar-left">
          <button
            type="button"
            className="k8s-create-resource-icon-btn primary"
            title={t("apply")}
            aria-label={t("apply")}
            data-testid={
              visible ? "k8s-create-resource-apply" : undefined
            }
            onClick={onApply}
          >
            <Save size={14} strokeWidth={2} />
          </button>
          <button
            type="button"
            className={`k8s-create-resource-icon-btn${findOpen ? " active" : ""}`}
            title={t("yamlFind")}
            aria-label={t("yamlFind")}
            data-testid={visible ? "k8s-create-resource-find" : undefined}
            onClick={() => setFindOpen((open) => !open)}
          >
            <Search size={14} strokeWidth={2} />
          </button>
        </div>
        <div className="k8s-create-resource-toolbar-right">
          <K8sTemplatePicker
            value={tab.templateId as K8sCreateTemplateId}
            onChange={onTemplateChange}
            aria-label={t("createResourceSelectTemplate")}
          />
        </div>
      </div>
      <K8sYamlEditor
        className="k8s-create-resource-editor"
        value={tab.yaml}
        onChange={onYamlChange}
        findOpen={findOpen}
        onFindOpenChange={setFindOpen}
        testId={visible ? "k8s-create-resource-yaml" : undefined}
        ariaLabel={t("detailYaml")}
      />
    </div>
  );
}

/** Mount every create-resource editor; swap visibility by active tab. */
export function K8sCreateResourcePanes({
  tabs,
  activeTabId,
  visible,
  onYamlChange,
  onTemplateChange,
  onApply,
}: {
  tabs: K8sCreateResourceTab[];
  activeTabId: string | null;
  visible: boolean;
  onYamlChange: (tabId: string, yaml: string) => void;
  onTemplateChange: (tabId: string, templateId: K8sCreateTemplateId) => void;
  onApply: (tabId: string) => void;
}) {
  if (tabs.length === 0) return null;

  return (
    <>
      {tabs.map((tab) => (
        <K8sCreateResourcePane
          key={tab.id}
          tab={tab}
          visible={visible && tab.id === activeTabId}
          onYamlChange={(yaml) => onYamlChange(tab.id, yaml)}
          onTemplateChange={(templateId) => onTemplateChange(tab.id, templateId)}
          onApply={() => onApply(tab.id)}
        />
      ))}
    </>
  );
}
