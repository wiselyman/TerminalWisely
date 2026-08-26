import { AiEngineerIcon } from "../WorkspaceToolIcons";

type Props = {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export function AiEngineerTool({ active, disabled, onClick }: Props) {
  return (
    <button
      type="button"
      className={`workspace-tool-btn${active ? " active" : ""}`}
      disabled={disabled}
      title="AI Linux Engineer"
      aria-label="AI Linux Engineer"
      onClick={onClick}
    >
      <AiEngineerIcon />
    </button>
  );
}
