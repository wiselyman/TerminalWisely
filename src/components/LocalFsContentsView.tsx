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
import { rangeSelectPaths, togglePathInSelection } from "../lib/localFsOps";
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

type Props = {
  contextMenuPath?: string | null;
  onEntryContextMenu: (event: ReactMouseEvent, entry: LocalFsEntry) => void;
  onBackgroundContextMenu: (event: ReactMouseEvent) => void;
  onOpenFile: (entry: LocalFsEntry) => void;
  onMovePaths?: (paths: string[], destDir: string) => void;
};

export function LocalFsContentsView({
  contextMenuPath = null,
  onEntryContextMenu,
  onBackgroundContextMenu,
  onOpenFile,
  onMovePaths,
}: Props) {
  const { t } = useTranslation("tools");
  const moveCleanupRef = useRef<(() => void) | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

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
  const entries = useMemo(() => {
    if (!contentsPath) return [];
    return childrenCache[contentsPath] ?? [];
  }, [childrenCache, contentsPath]);
  const orderedPaths = useMemo(() => entries.map((e) => e.path), [entries]);
  const isLoading =
    loadingRoot ||
    (contentsPath != null && loadingPaths.includes(contentsPath));

  useEffect(() => {
    return () => {
      moveCleanupRef.current?.();
      moveCleanupRef.current = null;
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
      void openDirectory(entry.path);
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

  const onItemContextMenu = useCallback(
    (event: ReactMouseEvent, entry: LocalFsEntry) => {
      if (!selectedSet.has(entry.path)) {
        setSelectedPath(entry.path);
      }
      onEntryContextMenu(event, entry);
    },
    [onEntryContextMenu, selectedSet, setSelectedPath],
  );

  if (!contentsPath) {
    return (
      <div
        className="local-fs-contents"
        data-testid="local-fs-contents"
        onContextMenu={onBackgroundContextMenu}
      >
        <p className="find-panel-empty">{t("localFs.emptyHint")}</p>
      </div>
    );
  }

  if (isLoading && entries.length === 0) {
    return (
      <div
        className="local-fs-contents"
        data-testid="local-fs-contents"
        onContextMenu={onBackgroundContextMenu}
      >
        <p className="find-panel-empty">{t("localFs.loading")}</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div
        className="local-fs-contents"
        data-testid="local-fs-contents"
        onContextMenu={onBackgroundContextMenu}
      >
        <p className="find-panel-empty">{t("localFs.empty")}</p>
      </div>
    );
  }

  if (viewMode === "grid") {
    return (
      <div
        className="local-fs-contents local-fs-contents-grid"
        data-testid="local-fs-contents"
        role="listbox"
        aria-multiselectable
        aria-label={t("localFs.title")}
        onContextMenu={onBackgroundContextMenu}
      >
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
                    void openDirectory(entry.path);
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
      className="local-fs-contents local-fs-contents-list"
      data-testid="local-fs-contents"
      role="listbox"
      aria-multiselectable
      aria-label={t("localFs.title")}
      onContextMenu={onBackgroundContextMenu}
    >
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
                  void openDirectory(entry.path);
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
