import { closeWorkspacePanels } from "../stores/workspacePanelSwitch";

export function WorkspacePanelBackdrop() {
  return (
    <div
      className="workspace-tool-backdrop open"
      onClick={closeWorkspacePanels}
      aria-hidden="true"
    />
  );
}
