import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type UIEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { buildVisibleTreeRows } from "../lib/localFsTree";
import { rangeSelectPaths, togglePathInSelection } from "../lib/localFsOps";
import { startLocalFsPointerMove } from "../lib/localFsPointerMove";
import type { LocalFsEntry } from "../types";
import { useLocalFsStore } from "../stores/localFsStore";
import { LocalFsTreeChevronIcon } from "./LocalFsIcons";

const ROW_HEIGHT = 26;
const OVERSCAN = 16;
const DEPTH_INDENT = 14;

type Props = {
  contextMenuPath?: string | null;
  onEntryContextMenu: (event: ReactMouseEvent, entry: LocalFsEntry) => void;
  onBackgroundContextMenu: (event: ReactMouseEvent) => void;
  onMovePaths?: (paths: string[], destDir: string) => void;
};

export function LocalFsTreeView({
  contextMenuPath = null,
  onEntryContextMenu,
  onBackgroundContextMenu,
  onMovePaths,
}: Props) {
  const { t } = useTranslation("tools");
  const bodyRef = useRef<HTMLDivElement>(null);
  const moveCleanupRef = useRef<(() => void) | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const {
    rootPath,
    loadingRoot,
    childrenCache,
    expandedPaths,
    loadingPaths,
    selectedPaths,
    selectionAnchor,
    contentsPath,
    setSelectedPath,
    setSelectedPaths,
    toggleDirectory,
    openDirectory,
  } = useLocalFsStore();

  const expandedSet = useMemo(() => new Set(expandedPaths), [expandedPaths]);
  const loadingSet = useMemo(() => new Set(loadingPaths), [loadingPaths]);
  const selectedSet = useMemo(() => new Set(selectedPaths), [selectedPaths]);
  const rootOpen = Boolean(rootPath && childrenCache[rootPath]);

  const rows = useMemo(
    () =>
      buildVisibleTreeRows(
        rootPath,
        childrenCache,
        expandedSet,
        loadingSet,
        { directoriesOnly: true },
      ),
    [rootPath, childrenCache, expandedSet, loadingSet],
  );
  const orderedPaths = useMemo(() => rows.map((r) => r.entry.path), [rows]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rootPath]);

  useEffect(() => {
    return () => {
      moveCleanupRef.current?.();
      moveCleanupRef.current = null;
    };
  }, []);

  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
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
    void openDirectory(entry.path);
  };

  const beginMove = (event: ReactPointerEvent, entry: LocalFsEntry) => {
    if (!onMovePaths || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(".local-fs-tree-toggle")) return;

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

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(
    rows.length,
    Math.ceil((scrollTop + Math.max(viewportHeight, 1)) / ROW_HEIGHT) +
      OVERSCAN,
  );
  const padTop = start * ROW_HEIGHT;
  const padBottom = Math.max(0, (rows.length - end) * ROW_HEIGHT);
  const visibleRows = rows.slice(start, end);

  return (
    <div
      className="local-fs-tree"
      role="tree"
      aria-label={t("localFs.title")}
      aria-multiselectable
      data-testid="local-fs-tree"
      onContextMenu={onBackgroundContextMenu}
    >
      <div
        ref={bodyRef}
        className="local-fs-tree-body"
        onScroll={onScroll}
      >
        {loadingRoot && !rootPath ? (
          <p className="find-panel-empty">{t("localFs.loading")}</p>
        ) : rootPath && rootOpen ? (
          <div
            className="local-fs-tree-virtual"
            style={{ paddingTop: padTop, paddingBottom: padBottom }}
          >
            {visibleRows.map(({ entry, depth, isExpanded, isLoading }) => {
              const isSelected =
                selectedSet.has(entry.path) || contentsPath === entry.path;
              const isDrop = dropTarget === entry.path;
              return (
                <div
                  key={entry.path}
                  className={`local-fs-tree-row is-dir${isSelected ? " is-selected" : ""}${contextMenuPath === entry.path ? " is-context-target" : ""}${isDrop ? " is-drop-target" : ""}${contentsPath === entry.path ? " is-contents-active" : ""}`}
                  role="treeitem"
                  aria-selected={isSelected}
                  aria-expanded={isExpanded}
                  data-path={entry.path}
                  data-kind={entry.kind}
                  style={{
                    paddingLeft: 6 + depth * DEPTH_INDENT,
                    height: ROW_HEIGHT,
                  }}
                  onContextMenu={(e) => {
                    if (!selectedSet.has(entry.path)) {
                      setSelectedPath(entry.path);
                    }
                    onEntryContextMenu(e, entry);
                  }}
                  onPointerDown={(e) => beginMove(e, entry)}
                  onClick={(e) => {
                    const target = e.target as HTMLElement | null;
                    if (target?.closest(".local-fs-tree-toggle")) return;
                    selectEntry(e, entry);
                  }}
                >
                  <button
                    type="button"
                    className="local-fs-tree-toggle"
                    aria-label={
                      isExpanded
                        ? t("localFs.collapseFolder")
                        : t("localFs.expandFolder")
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleDirectory(entry.path);
                    }}
                  >
                    {isLoading ? (
                      <span className="local-fs-tree-spinner" aria-hidden />
                    ) : (
                      <LocalFsTreeChevronIcon expanded={isExpanded} />
                    )}
                  </button>
                  <div className="local-fs-tree-name">
                    <button
                      type="button"
                      className="local-fs-tree-label"
                      title={entry.path}
                    >
                      {entry.name}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : rootPath ? null : (
          <p className="find-panel-empty">{t("localFs.emptyHint")}</p>
        )}
      </div>
    </div>
  );
}
