type WorkspacePanelBackdropProps = {
  panelId?: string;
  /** Kept for call-site compatibility; backdrop never dismisses the panel. */
  dismissible?: boolean;
};

/** Non-interactive dimmer behind the open workspace panel (does not close it). */
export function WorkspacePanelBackdrop(_props: WorkspacePanelBackdropProps) {
  return <div className="workspace-tool-backdrop" aria-hidden="true" />;
}
