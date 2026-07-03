import { FindInFilesIcon } from "./WorkspaceToolIcons";
import { WorkspaceToolButton } from "./WorkspaceToolRail";

interface FindToolProps {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function FindTool({ active, disabled, onClick }: FindToolProps) {
  return (
    <WorkspaceToolButton
      label="在文件中查找"
      active={active}
      disabled={disabled}
      onClick={onClick}
    >
      <FindInFilesIcon />
    </WorkspaceToolButton>
  );
}
