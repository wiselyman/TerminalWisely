import type { DesktopTarget } from "../../lib/desktopTarget";
import { EditorWiselyWindow } from "./EditorWiselyWindow";

/** FileWisely's text editing surface, backed by the existing EditorWisely store. */
export function FileWiselyWindow({ target }: { target: DesktopTarget }) {
  return <EditorWiselyWindow target={target} unified />;
}
