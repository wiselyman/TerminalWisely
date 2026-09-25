import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  pathsIntersectingMarquee,
  rangeSelectPaths,
  togglePathInSelection,
} from "../lib/localFsOps";
import { startLocalFsPointerMove } from "../lib/localFsPointerMove";
import type { LocalFsEntry } from "../types";
import { useLocalFsStore } from "../stores/localFsStore";
import { LocalFsEntryIcon } from "./LocalFsIcons";

function formatSize(sizeBytes: number | null | undefined) {
  if (sizeBytes == null) return "—";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  if (sizeBytes < 1024 * 1024 * 1024)
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const MARQUEE_THRESHOLD_PX = 4;

type Props = {
  contextMenuPath?: string | null;
  onEntryContextMenu: (event: ReactMouseEvent, entry: LocalFsEntry) => void;
  onBackgroundContextMenu: (event: ReactMouseEvent) => void;
  onOpenFile: (entry: LocalFsEntry) => void;
  onMovePaths?: (paths: string[], destDir: string) => void;
  /** When set (e.g. inline Find results), replace directory listing. */
  entriesOverride?: LocalFsEntry[] | null;
  loadingOverride?: boolean;
  emptyLabel?: string;
  /** Called before navigating into a directory while showing search results. */
  onLeaveSearch?: () => void;
};

export function LocalFsContentsView({
  contextMenuPath = null,
  onEntryContextMenu,
  onBackgroundContextMenu,
  onOpenFile,
  onMovePaths,
  entriesOverride = null,
  loadingOverride,
  emptyLabel,
  onLeaveSearch,
}: Props) {
  const { t } = useTranslation("tools");
  const moveCleanupRef = useRef<(() => void) | null>(null);
  const marqueeCleanupRef = useRef<(() => void) | null>(null);
  const contentsRef = useRef<HTMLDivElement | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const {
    contentsPath,
    childrenCache,
    loadingPaths,
    loadingRoot,
    viewMode,
    selectedPaths,
    selectionAnchor,
    setSelectedPath,
    setSelectedPaths,
    openDirectory,
  } = useLocalFsStore();

  const selectedSet = useMemo(() => new Set(selectedPaths), [selectedPaths]);
  const searchMode = entriesOverride != null;
  const entries = useMemo(() => {
    if (entriesOverride != null) return entriesOverride;
    if (!contentsPath) return [];
    return childrenCache[contentsPath] ?? [];
  }, [childrenCache, contentsPath, entriesOverride]);
  const orderedPaths = useMemo(() => entries.map((e) => e.path), [entries]);
  const isLoading =
    loadingOverride ??
    (loadingRoot ||
      (contentsPath != null && loadingPaths.includes(contentsPath)));

  const openDir = (path: string) => {
    if (searchMode) onLeaveSearch?.();
    void openDirectory(path);
  };

  useEffect(() => {
    return () => {
      moveCleanupRef.current?.();
      moveCleanupRef.current = null;
      marqueeCleanupRef.current?.();
      marqueeCleanupRef.current = null;
    };
  }, []);

  const selectEntry = (event: ReactMouseEvent, entry: LocalFsEntry) => {
    const meta = event.metaKey || event.ctrlKey;
    if (event.shiftKey) {
      const next = rangeSelectPaths(
        orderedPaths,
        selectionAnchor,
        entry.path,
        new Set(meta ? selectedPaths : []),
      );
      setSelectedPaths(next, selectionAnchor ?? entry.path);
      return;
    }
    if (meta) {
      const next = togglePathInSelection(selectedPaths, entry.path);
      setSelectedPaths(next, entry.path);
      return;
    }
    if (entry.kind === "directory") {
      openDir(entry.path);
      return;
    }
    setSelectedPath(entry.path);
  };

  const beginMove = (event: ReactPointerEvent, entry: LocalFsEntry) => {
    if (!onMovePaths || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;

    const paths =
      selectedSet.has(entry.path) && selectedPaths.length > 0
        ? [...selectedPaths]
        : [entry.path];

    moveCleanupRef.current?.();
    moveCleanupRef.current = startLocalFsPointerMove({
      paths,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      onPreview: setDropTarget,
      onDrop: (destDir) => {
        onMovePaths(paths, destDir);
      },
      onEnd: () => {
        setDropTarget(null);
        moveCleanupRef.current = null;
      },
    });
  };

  const beginMarquee = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(".local-fs-contents-item")) return;

    const root = contentsRef.current;
    if (!root) return;

    const additive = event.metaKey || event.ctrlKey;
    const startX = event.clientX;
    const startY = event.clientY;
    const base = additive ? [...selectedPaths] : [];
    let active = false;
    const pointerId = event.pointerId;

    const collectItems = () => {
      const nodes = root.querySelectorAll<HTMLElement>(
        ".local-fs-contents-item[data-path]",
      );
      return Array.from(nodes).flatMap((node) => {
        const path = node.dataset.path?.trim();
        if (!path) return [];
        const r = node.getBoundingClientRect();
        return [
          {
            path,
            rect: {
              left: r.left,
              top: r.top,
              right: r.right,
              bottom: r.bottom,
            },
          },
        ];
      });
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!active) {
        if (Math.hypot(dx, dy) < MARQUEE_THRESHOLD_PX) return;
        active = true;
        try {
          root.setPointerCapture(pointerId);
        } catch {
          // ignore
        }
      }
      const left = Math.min(startX, ev.clientX);
      const top = Math.min(startY, ev.clientY);
      const right = Math.max(startX, ev.clientX);
      const bottom = Math.max(startY, ev.clientY);
      const rootRect = root.getBoundingClientRect();
      setMarquee({
        left: left - rootRect.left + root.scrollLeft,
        top: top - rootRect.top + root.scrollTop,
        width: right - left,
        height: bottom - top,
      });
      const hit = pathsIntersectingMarquee(collectItems(), {
        left,
        top,
        right,
        bottom,
      });
      const next = additive
        ? [...new Set([...base, ...hit])]
        : hit;
      setSelectedPaths(next, hit[hit.length - 1] ?? null);
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      marqueeCleanupRef.current = null;
      setMarquee(null);
      try {
        root.releasePointerCapture(pointerId);
      } catch {
        // ignore
      }
      if (!active) {
        setSelectedPaths([]);
      }
    };

    marqueeCleanupRef.current?.();
    marqueeCleanupRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setMarquee(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const onItemContextMenu = useCallback(
    (event: ReactMouseEvent, entry: LocalFsEntry) => {
      if (!selectedSet.has(entry.path)) {
        setSelectedPath(entry.path);
      }
      onEntryContextMenu(event, entry);
    },
    [onEntryContextMenu, selectedSet, setSelectedPath],
  );

  const marqueeEl = marquee ? (
    <div
      className="local-fs-marquee"
      data-testid="local-fs-marquee"
      style={{
        left: marquee.left,
        top: marquee.top,
        width: marquee.width,
        height: marquee.height,
      }}
      aria-hidden
    />
  ) : null;

  if (!contentsPath && !searchMode) {
    return (
      <div
        ref={contentsRef}
        className="local-fs-contents"
        data-testid="local-fs-contents"
        onContextMenu={onBackgroundContextMenu}
        onPointerDown={beginMarquee}
      >
        <p className="find-panel-empty">
          {loadingRoot ? t("localFs.loading") : t("localFs.emptyHint")}
        </p>
      </div>
    );
  }

  if (isLoading && entries.length === 0) {
    return (
      <div
        ref={contentsRef}
        className="local-fs-contents"
        data-testid="local-fs-contents"
        onContextMenu={onBackgroundContextMenu}
        onPointerDown={beginMarquee}
      >
        <p className="find-panel-empty">{t("localFs.loading")}</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div
        ref={contentsRef}
        className="local-fs-contents"
        data-testid="local-fs-contents"
        onContextMenu={onBackgroundContextMenu}
        onPointerDown={beginMarquee}
      >
        <p className="find-panel-empty">
          {emptyLabel ?? (searchMode ? t("find.empty") : t("localFs.empty"))}
        </p>
      </div>
    );
  }

  if (viewMode === "grid") {
    return (
      <div
        ref={contentsRef}
        className="local-fs-contents local-fs-contents-grid"
        data-testid="local-fs-contents"
        role="listbox"
        aria-multiselectable
        aria-label={t("localFs.title")}
        onContextMenu={onBackgroundContextMenu}
        onPointerDown={beginMarquee}
      >
        {marqueeEl}
        <div className="local-fs-grid">
          {entries.map((entry) => {
            const isDir = entry.kind === "directory";
            const isSelected = selectedSet.has(entry.path);
            const isDrop = dropTarget === entry.path;
            return (
              <div
                key={entry.path}
                className={`local-fs-grid-item local-fs-contents-item${isDir ? " is-dir" : " is-file"}${isSelected ? " is-selected" : ""}${contextMenuPath === entry.path ? " is-context-target" : ""}${isDrop ? " is-drop-target" : ""}`}
                role="option"
                aria-selected={isSelected}
                data-path={entry.path}
                data-kind={entry.kind}
                title={entry.path}
                onContextMenu={(e) => onItemContextMenu(e, entry)}
                onPointerDown={(e) => beginMove(e, entry)}
                onClick={(e) => selectEntry(e, entry)}
                onDoubleClick={() => {
                  if (isDir) {
                    openDir(entry.path);
                    return;
                  }
                  onOpenFile(entry);
                }}
              >
                <LocalFsEntryIcon kind={entry.kind} name={entry.name} />
                <span className="local-fs-grid-name">{entry.name}</span>
                {!isDir ? (
                  <span className="local-fs-grid-meta">
                    {formatSize(entry.size_bytes)}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={contentsRef}
      className="local-fs-contents local-fs-contents-list"
      data-testid="local-fs-contents"
      role="listbox"
      aria-multiselectable
      aria-label={t("localFs.title")}
      onContextMenu={onBackgroundContextMenu}
      onPointerDown={beginMarquee}
    >
      {marqueeEl}
      <div className="local-fs-list-header" aria-hidden>
        <span>{t("localFs.colName")}</span>
        <span>{t("localFs.colSize")}</span>
      </div>
      <div className="local-fs-list">
        {entries.map((entry) => {
          const isDir = entry.kind === "directory";
          const isSelected = selectedSet.has(entry.path);
          const isDrop = dropTarget === entry.path;
          return (
            <div
              key={entry.path}
              className={`local-fs-row local-fs-contents-item${isDir ? " is-dir" : " is-file"}${isSelected ? " is-selected" : ""}${contextMenuPath === entry.path ? " is-context-target" : ""}${isDrop ? " is-drop-target" : ""}`}
              role="option"
              aria-selected={isSelected}
              data-path={entry.path}
              data-kind={entry.kind}
              onContextMenu={(e) => onItemContextMenu(e, entry)}
              onPointerDown={(e) => beginMove(e, entry)}
              onClick={(e) => selectEntry(e, entry)}
              onDoubleClick={() => {
                if (isDir) {
                  openDir(entry.path);
                  return;
                }
                onOpenFile(entry);
              }}
            >
              <LocalFsEntryIcon kind={entry.kind} name={entry.name} />
              <span className="local-fs-row-name" title={entry.path}>
                {entry.name}
              </span>
              <span className="local-fs-row-size">
                {isDir ? "—" : formatSize(entry.size_bytes)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
