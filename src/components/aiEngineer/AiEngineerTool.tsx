import { AiEngineerIcon } from "../WorkspaceToolIcons";
import { useTranslation } from "react-i18next";

type Props = {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export function AiEngineerTool({ active, disabled, onClick }: Props) {
  const { t } = useTranslation("tools");
  const label = t("aiEngineer.linuxTitle");
  return (
    <button
      type="button"
      className={`workspace-tool-btn${active ? " active" : ""}`}
      disabled={disabled}
      title={label}
      aria-label={label}
      data-testid="ai-engineer-tool"
      onClick={onClick}
    >
      <AiEngineerIcon />
    </button>
  );
}
