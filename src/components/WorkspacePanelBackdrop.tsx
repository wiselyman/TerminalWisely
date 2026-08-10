import { closeWorkspacePanels } from "../stores/workspacePanelSwitch";

type WorkspacePanelBackdropProps = {
  /** When false, overlay is non-interactive (does not dismiss panels). Default true. */
  dismissible?: boolean;
};

export function WorkspacePanelBackdrop({
  dismissible = true,
}: WorkspacePanelBackdropProps) {
  return (
    <div
      className={`workspace-tool-backdrop${dismissible ? " open" : ""}`}
      onClick={dismissible ? closeWorkspacePanels : undefined}
      aria-hidden="true"
    />
  );
}
