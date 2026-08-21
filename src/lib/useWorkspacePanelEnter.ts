import { useLayoutEffect, useRef } from "react";
import { shouldAnimateWorkspacePanelEnter } from "../stores/workspacePanelSwitch";

/** Slide panel in from the right on mount (toolbar open / panel switch). */
export function useWorkspacePanelEnter<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!shouldAnimateWorkspacePanelEnter()) return;

    el.classList.add("workspace-panel-entering");
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.classList.remove("workspace-panel-entering");
      el.removeEventListener("animationend", onEnd);
      window.clearTimeout(fallback);
    };
    const onEnd = (ev: AnimationEvent) => {
      if (ev.target !== el) return;
      finish();
    };
    el.addEventListener("animationend", onEnd);
    const fallback = window.setTimeout(finish, 280);
    return finish;
  }, []);

  return ref;
}
