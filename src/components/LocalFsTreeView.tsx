import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type UIEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { buildVisibleTreeRows } from "../lib/localFsTree";
import type { LocalFsEntry } from "../types";
import { useLocalFsStore } from "../stores/localFsStore";
import { LocalFsEntryIcon, LocalFsTreeChevronIcon } from "./LocalFsIcons";

const ROW_HEIGHT = 26;
const OVERSCAN = 16;
const DEPTH_INDENT = 14;

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
};

export function LocalFsTreeView({
  contextMenuPath = null,
  onEntryContextMenu,
  onBackgroundContextMenu,
  onOpenFile,
}: Props) {
  const { t } = useTranslation("tools");
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const {
    rootPath,
    loadingRoot,
    childrenCache,
    expandedPaths,
    loadingPaths,
    selectedPath,
    setSelectedPath,
    toggleDirectory,
  } = useLocalFsStore();

  const expandedSet = useMemo(() => new Set(expandedPaths), [expandedPaths]);
  const loadingSet = useMemo(() => new Set(loadingPaths), [loadingPaths]);
  const rootOpen = Boolean(rootPath && childrenCache[rootPath]);

  const rows = useMemo(
    () => buildVisibleTreeRows(rootPath, childrenCache, expandedSet, loadingSet),
    [rootPath, childrenCache, expandedSet, loadingSet],
  );

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rootPath]);

  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

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
              const isDir = entry.kind === "directory";
              return (
                <div
                  key={entry.path}
                  className={`local-fs-tree-row${isDir ? " is-dir" : " is-file"}${selectedPath === entry.path ? " is-selected" : ""}${contextMenuPath === entry.path ? " is-context-target" : ""}`}
                  role="treeitem"
                  aria-expanded={isDir ? isExpanded : undefined}
                  style={{
                    paddingLeft: 6 + depth * DEPTH_INDENT,
                    height: ROW_HEIGHT,
                  }}
                  onContextMenu={(e) => onEntryContextMenu(e, entry)}
                >
                  {isDir ? (
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
                  ) : (
                    <span className="local-fs-tree-toggle-spacer" aria-hidden />
                  )}
                  <div className="local-fs-tree-name">
                    {!isDir ? (
                      <LocalFsEntryIcon kind={entry.kind} name={entry.name} />
                    ) : null}
                    <button
                      type="button"
                      className="local-fs-tree-label"
                      title={entry.path}
                      onClick={() => setSelectedPath(entry.path)}
                      onDoubleClick={() => {
                        if (isDir) {
                          void toggleDirectory(entry.path);
                          return;
                        }
                        onOpenFile(entry);
                      }}
                    >
                      {entry.name}
                    </button>
                  </div>
                  <span className="local-fs-size">
                    {isDir ? "—" : formatSize(entry.size_bytes)}
                  </span>
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
