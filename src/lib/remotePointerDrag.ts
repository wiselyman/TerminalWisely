import { formatRemoteDragLabel } from "./dragVisual";

const DRAG_THRESHOLD_PX = 4;

export { DRAG_THRESHOLD_PX };

export interface RemotePointerDragOptions {
  fromSessionId: string;
  remotePath: string;
  startX: number;
  startY: number;
  onDrop: (toSessionId: string) => void;
  onCancel?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

function findSshTabTarget(
  x: number,
  y: number,
  fromSessionId: string,
): HTMLElement | null {
  const tab = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>(".tab[data-session-id]");
  if (!tab) return null;
  if (tab.dataset.tabKind !== "ssh") return null;
  if (tab.dataset.sessionId === fromSessionId) return null;
  return tab;
}

function clearTabHover(): void {
  document.querySelectorAll(".tab.tab-drag-hover").forEach((element) => {
    element.classList.remove("tab-drag-hover");
    element.removeAttribute("data-drag-hover-kind");
  });
}

function setTabBarActive(active: boolean): void {
  const tabBar = document.querySelector(".tab-bar");
  tabBar?.classList.toggle("tab-bar-drop-active", active);
  tabBar?.classList.toggle("tab-bar-drag-mode", active);
}

function positionOverlayBelowTabBar(overlay: HTMLElement): void {
  const tabBar = document.querySelector(".tab-bar");
  if (tabBar instanceof HTMLElement) {
    const bottom = tabBar.getBoundingClientRect().bottom;
    overlay.style.top = `${bottom}px`;
    overlay.style.left = "0";
    overlay.style.right = "0";
    overlay.style.bottom = "0";
    return;
  }
  overlay.style.inset = "0";
}

function createDragUi(remotePath: string, startX: number, startY: number) {
  const overlay = document.createElement("div");
  overlay.className = "remote-drag-overlay";
  overlay.setAttribute("aria-hidden", "true");

  const connector = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  connector.setAttribute("class", "remote-drag-connector");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", String(startX));
  line.setAttribute("y1", String(startY));
  line.setAttribute("x2", String(startX));
  line.setAttribute("y2", String(startY));
  connector.appendChild(line);

  const origin = document.createElement("div");
  origin.className = "remote-drag-origin";
  origin.style.transform = `translate(${startX}px, ${startY}px)`;

  const pending = document.createElement("div");
  pending.className = "remote-drag-pending";
  pending.style.transform = `translate(${startX}px, ${startY}px)`;

  const fileName = remotePath.split("/").pop() || remotePath;
  const card = document.createElement("div");
  card.className = "remote-drag-follow-card";

  const icon = document.createElement("span");
  icon.className = "remote-drag-follow-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "📄";

  const textWrap = document.createElement("div");
  textWrap.className = "remote-drag-follow-text";

  const title = document.createElement("strong");
  title.textContent = formatRemoteDragLabel(remotePath);

  const subtitle = document.createElement("span");
  subtitle.textContent = `${fileName} · 拖到上方 SSH 标签`;

  textWrap.appendChild(title);
  textWrap.appendChild(subtitle);
  card.appendChild(icon);
  card.appendChild(textWrap);
  card.style.transform = `translate(${startX + 16}px, ${startY + 16}px)`;
  card.style.opacity = "0";

  document.body.appendChild(overlay);
  document.body.appendChild(connector);
  document.body.appendChild(origin);
  document.body.appendChild(pending);
  document.body.appendChild(card);
  positionOverlayBelowTabBar(overlay);

  return { overlay, connector, line, origin, pending, card };
}

/** Custom drag for remote files — HTML5 DnD is unreliable inside xterm/WebView. */
export function startRemotePointerDrag(options: RemotePointerDragOptions): () => void {
  const ui = createDragUi(options.remotePath, options.startX, options.startY);

  let dragging = false;
  let disposed = false;

  const preventTextSelection = () => {
    window.getSelection()?.removeAllRanges();
  };

  const onSelectStart = (event: Event) => {
    event.preventDefault();
  };

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("mouseup", onUp, true);
    document.removeEventListener("selectstart", onSelectStart, true);
    ui.overlay.remove();
    ui.connector.remove();
    ui.origin.remove();
    ui.pending.remove();
    ui.card.remove();
    document.body.classList.remove("remote-pointer-dragging");
    document.body.classList.remove("remote-pointer-drag-armed");
    setTabBarActive(false);
    clearTabHover();
    preventTextSelection();
    options.onDragEnd?.();
  };

  const moveUi = (x: number, y: number) => {
    ui.line.setAttribute("x2", String(x));
    ui.line.setAttribute("y2", String(y));
    ui.card.style.transform = `translate(${x + 16}px, ${y + 16}px)`;
    ui.pending.style.transform = `translate(${x}px, ${y}px)`;
  };

  const onMove = (event: MouseEvent) => {
    event.preventDefault();
    preventTextSelection();

    const dx = event.clientX - options.startX;
    const dy = event.clientY - options.startY;

    if (!dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
        moveUi(event.clientX, event.clientY);
        return;
      }
      dragging = true;
      options.onDragStart?.();
      document.body.classList.add("remote-pointer-dragging");
      positionOverlayBelowTabBar(ui.overlay);
      setTabBarActive(true);
      ui.pending.classList.add("remote-drag-pending-hidden");
      ui.origin.classList.add("remote-drag-origin-active");
      ui.card.classList.add("remote-drag-follow-card-active");
      ui.card.style.opacity = "1";
      ui.connector.classList.add("remote-drag-connector-active");
    }

    moveUi(event.clientX, event.clientY);

    clearTabHover();
    const tab = findSshTabTarget(
      event.clientX,
      event.clientY,
      options.fromSessionId,
    );
    if (tab) {
      tab.classList.add("tab-drag-hover");
      tab.dataset.dragHoverKind = "remote";
    }
  };

  const onUp = (event: MouseEvent) => {
    if (dragging) {
      ui.card.classList.add("remote-drag-follow-card-drop");
      const tab = findSshTabTarget(
        event.clientX,
        event.clientY,
        options.fromSessionId,
      );
      if (tab?.dataset.sessionId) {
        options.onDrop(tab.dataset.sessionId);
      } else {
        options.onCancel?.();
      }
    }
    cleanup();
  };

  document.body.classList.add("remote-pointer-drag-armed");
  preventTextSelection();
  document.addEventListener("selectstart", onSelectStart, true);
  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("mouseup", onUp, true);

  return () => {
    if (dragging) options.onCancel?.();
    cleanup();
  };
}
