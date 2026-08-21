import { closeWorkspacePanels } from "../stores/workspacePanelSwitch";
import type { WorkspacePanelId } from "../stores/workspacePanelSwitch";
import { useWorkspacePanelPinStore } from "../stores/workspacePanelPin";

type WorkspacePanelBackdropProps = {
  panelId: WorkspacePanelId;
  /** When false, overlay is non-interactive (does not dismiss panels). Default true. */
  dismissible?: boolean;
};

export function WorkspacePanelBackdrop({
  dismissible = true,
}: WorkspacePanelBackdropProps) {
  const pinned = useWorkspacePanelPinStore((s) => s.pinned);
  const canDismiss = dismissible && !pinned;

  return (
    <div
      className={`workspace-tool-backdrop${canDismiss ? " open" : ""}`}
      onClick={canDismiss ? closeWorkspacePanels : undefined}
      aria-hidden="true"
    />
  );
}
