import { closeWorkspacePanels } from "../stores/workspacePanelSwitch";
import { useWorkspacePanelPinStore } from "../stores/workspacePanelPin";

type WorkspacePanelBackdropProps = {
  /** When false, overlay is non-interactive (does not dismiss panels). Default true. */
  dismissible?: boolean;
};

export function WorkspacePanelBackdrop({
  dismissible = true,
}: WorkspacePanelBackdropProps) {
  const pinnedId = useWorkspacePanelPinStore((s) => s.pinnedId);
  // Pinned panel: clicking the dimmed area must not collapse it.
  const canDismiss = dismissible && !pinnedId;

  return (
    <div
      className={`workspace-tool-backdrop${canDismiss ? " open" : ""}`}
      onClick={canDismiss ? closeWorkspacePanels : undefined}
      aria-hidden="true"
    />
  );
}
