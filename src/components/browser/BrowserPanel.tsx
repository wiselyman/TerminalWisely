import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { isBookmarked } from "../../lib/browserHistory";
import { fallbackFaviconUrl } from "../../lib/browserPageChrome";
import { useBrowserStore } from "../../stores/browserStore";
import {
  PreviewCloseIcon,
  PreviewMinimizeIcon,
} from "../PreviewIcons";
import { BrowserDock } from "./BrowserDock";
import { useDesktopStore } from "../../stores/desktopStore";
import { DesktopAppWindow } from "../desktop/DesktopAppWindow";
import { ChatHistoryIcon, HostBrowserIcon } from "../WorkspaceToolIcons";

interface BrowserPanelProps {
  sessionId: string;
  sessionTitle?: string;
}

export function BrowserPanel({ sessionId }: BrowserPanelProps) {
  const { t } = useTranslation("tools");
  const open = useBrowserStore((s) => s.open);
  const minimized = useBrowserStore((s) => s.minimized);
  const url = useBrowserStore((s) => s.url);
  const error = useBrowserStore((s) => s.error);
  const ensuring = useBrowserStore((s) => s.ensuring);
  const loading = useBrowserStore((s) => s.loading);
  const profileKey = useBrowserStore((s) => s.profileKey);
  const webviewLabel = useBrowserStore((s) => s.webviewLabel);
  const docked = useBrowserStore((s) => s.docked);
  const suggestions = useBrowserStore((s) => s.suggestions);
  const bookmarks = useBrowserStore((s) => s.bookmarks);
  const historyEntries = useBrowserStore((s) => s.history);
  const canGoBack = useBrowserStore((s) => s.canGoBack);
  const canGoForward = useBrowserStore((s) => s.canGoForward);
  const tabs = useBrowserStore((s) => s.tabs);
  const activeTabId = useBrowserStore((s) => s.activeTabId);
  const newTab = useBrowserStore((s) => s.newTab);
  const closeTab = useBrowserStore((s) => s.closeTab);
  const selectTab = useBrowserStore((s) => s.selectTab);
  const setUrl = useBrowserStore((s) => s.setUrl);
  const navigate = useBrowserStore((s) => s.navigate);
  const goBack = useBrowserStore((s) => s.goBack);
  const goForward = useBrowserStore((s) => s.goForward);
  const reload = useBrowserStore((s) => s.reload);
  const toggleBookmark = useBrowserStore((s) => s.toggleBookmark);
  const removeBookmark = useBrowserStore((s) => s.removeBookmark);
  const clearHistory = useBrowserStore((s) => s.clearHistory);
  const syncBounds = useBrowserStore((s) => s.syncBounds);
  const ensureForSession = useBrowserStore((s) => s.ensureForSession);
  const close = useBrowserStore((s) => s.close);
  const minimize = useBrowserStore((s) => s.minimize);
  const desktopOpen = useDesktopStore((s) => s.open);
  const minimizeDesktopBrowser = useDesktopStore((s) => s.minimizeApp);
  const closeDesktopBrowser = useDesktopStore((s) => s.closeApp);
  const browserDesktopWin = useDesktopStore((s) => s.apps.browser);

  const contentRef = useRef<HTMLDivElement>(null);
  const lastNavigated = useRef<string | null>(null);
  const bootstrappedSession = useRef<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestIndex, setSuggestIndex] = useState(-1);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const starred = isBookmarked(bookmarks, url, profileKey);
  const showFloat = open && !minimized;

  const doMinimize = () => {
    if (desktopOpen) {
      minimizeDesktopBrowser("browser");
    } else {
      void minimize();
    }
  };

  const doClose = () => {
    if (desktopOpen) {
      closeDesktopBrowser("browser");
    } else {
      void close();
    }
  };

  useEffect(() => {
    if (!showFloat) return;
    const el = contentRef.current;
    if (!el) return;

    let cancelled = false;
    let rafSync = 0;

    const readRect = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 32 || rect.height < 32) return null;
      return {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      };
    };

    const scheduleSync = () => {
      if (cancelled) return;
      if (rafSync) cancelAnimationFrame(rafSync);
      rafSync = requestAnimationFrame(() => {
        rafSync = 0;
        const bounds = readRect();
        if (!bounds || cancelled) return;
        void syncBounds(bounds);
      });
    };

    const boot = async () => {
      const bounds = readRect();
      if (bounds) {
        await ensureForSession(sessionId, bounds);
        if (!cancelled) await syncBounds(bounds);
      } else {
        await ensureForSession(sessionId, null);
      }
    };

    const raf = requestAnimationFrame(() => {
      void boot();
      requestAnimationFrame(scheduleSync);
    });

    const ro = new ResizeObserver(() => {
      scheduleSync();
    });
    ro.observe(el);
    // Also observe the float window so maximize/chrome changes are caught.
    const floatEl = el.closest(".desktop-app-window, .browser-float-window");
    if (floatEl) ro.observe(floatEl);

    const onWindowResize = () => {
      scheduleSync();
    };
    window.addEventListener("resize", onWindowResize);

    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        unlistenMoved = await win.onMoved(() => {
          scheduleSync();
        });
        unlistenResized = await win.onResized(() => {
          scheduleSync();
        });
      } catch {
        // browser E2E / non-Tauri
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (rafSync) cancelAnimationFrame(rafSync);
      ro.disconnect();
      window.removeEventListener("resize", onWindowResize);
      unlistenMoved?.();
      unlistenResized?.();
    };
  }, [showFloat, sessionId, syncBounds, ensureForSession, desktopOpen, browserDesktopWin.maximized]);

  useEffect(() => {
    lastNavigated.current = null;
    bootstrappedSession.current = null;
  }, [sessionId]);

  // First dock for a cold host only. Warm restores must activate_tab without
  // re-navigate — reloading 127.0.0.1 tunnels / SPA routes causes white screens.
  useEffect(() => {
    if (!showFloat || !docked || !webviewLabel || !sessionId) return;
    if (bootstrappedSession.current === sessionId) return;
    const bucketWarm = useBrowserStore.getState();
    // If this host already had a native page (nav history or warm bucket), skip.
    const active = bucketWarm.tabs.find((t) => t.id === bucketWarm.activeTabId);
    const hasHistory = Boolean(active && active.navStack.length > 0);
    bootstrappedSession.current = sessionId;
    if (hasHistory) {
      lastNavigated.current = active?.url ?? bucketWarm.url;
      return;
    }
    const target = bucketWarm.url.trim();
    if (!target) return;
    lastNavigated.current = target;
    void navigate(target);
  }, [showFloat, docked, webviewLabel, sessionId, navigate]);

  useEffect(() => {
    if (!showFloat) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        doMinimize();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showFloat, desktopOpen]);

  if (!open) return null;

  const commitNavigate = (target: string) => {
    setSuggestOpen(false);
    setSuggestIndex(-1);
    lastNavigated.current = null;
    void navigate(target);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (suggestOpen && suggestIndex >= 0 && suggestions[suggestIndex]) {
      commitNavigate(suggestions[suggestIndex].url);
      return;
    }
    commitNavigate(url);
  };

  const onUrlKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setSuggestOpen(true);
      setSuggestIndex((i) => Math.min(i + 1, suggestions.length - 1));
      return;
    }
    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setSuggestOpen(true);
      setSuggestIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (event.key === "Escape") {
      setSuggestOpen(false);
      setSuggestIndex(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (suggestOpen && suggestIndex >= 0 && suggestions[suggestIndex]) {
        commitNavigate(suggestions[suggestIndex].url);
      } else {
        commitNavigate(url);
      }
    }
  };

  const history = historyEntries.filter((h) =>
    profileKey ? h.profile_key === profileKey : true,
  );


  const browserBody = (
    <>
      <div
        className="browser-tab-strip"
        role="tablist"
        aria-label={t("browser.tabsAria")}
        data-testid="host-browser-tabs"
      >
        {tabs.map((tab) => {
          const label = tab.title || tab.url || t("browser.newTab");
          const favicon =
            tab.favicon?.trim() || fallbackFaviconUrl(tab.url) || "";
          return (
            <div
              key={tab.id}
              className={
                tab.id === activeTabId
                  ? "browser-tab is-active"
                  : "browser-tab"
              }
              role="tab"
              aria-selected={tab.id === activeTabId}
              data-testid="host-browser-tab"
              data-tab-id={tab.id}
              onClick={() => selectTab(tab.id)}
            >
              {favicon ? (
                <img
                  className="browser-tab-favicon"
                  src={favicon}
                  alt=""
                  width={14}
                  height={14}
                  decoding="async"
                  data-testid="host-browser-tab-favicon"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.visibility =
                      "hidden";
                  }}
                />
              ) : (
                <span className="browser-tab-favicon is-placeholder" aria-hidden />
              )}
              <span className="browser-tab-label" title={label}>
                {label}
              </span>
              {tabs.length > 1 ? (
                <button
                  type="button"
                  className="browser-tab-close"
                  data-testid="host-browser-tab-close"
                  aria-label={t("browser.closeTab")}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                >
                  ×
                </button>
              ) : null}
            </div>
          );
        })}
        <button
          type="button"
          className="browser-tab-new"
          data-testid="host-browser-tab-new"
          aria-label={t("browser.newTab")}
          title={t("browser.newTab")}
          onClick={() => newTab()}
        >
          +
        </button>
      </div>
      <form className="browser-address-bar" onSubmit={onSubmit}>
        <div
          className="browser-nav-group"
          role="group"
          aria-label={t("browser.navAria")}
        >
          <button
            type="button"
            className="browser-nav-btn"
            data-testid="host-browser-back"
            aria-label={t("browser.back")}
            disabled={!canGoBack || ensuring}
            onClick={() => void goBack()}
          >
            ←
          </button>
          <button
            type="button"
            className="browser-nav-btn"
            data-testid="host-browser-forward"
            aria-label={t("browser.forward")}
            disabled={!canGoForward || ensuring}
            onClick={() => void goForward()}
          >
            →
          </button>
          <button
            type="button"
            className="browser-nav-btn"
            data-testid="host-browser-reload"
            aria-label={t("browser.reload")}
            disabled={ensuring || !webviewLabel}
            onClick={() => void reload()}
          >
            ↻
          </button>
        </div>
        <div className="browser-url-wrap">
          <input
            type="text"
            className="browser-url-input"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setSuggestOpen(true);
              setSuggestIndex(-1);
            }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setSuggestOpen(false), 150);
            }}
            onKeyDown={onUrlKeyDown}
            placeholder={t("browser.urlPlaceholder")}
            aria-label={t("browser.urlAria")}
            aria-autocomplete="list"
            aria-expanded={suggestOpen && suggestions.length > 0}
            data-testid="host-browser-url"
          />
          {suggestOpen && suggestions.length > 0 ? (
            <ul
              className="browser-suggest-list"
              role="listbox"
              data-testid="host-browser-suggest"
            >
              {suggestions.map((item, index) => (
                <li key={`${item.profile_key}-${item.url}`}>
                  <button
                    type="button"
                    className={
                      index === suggestIndex
                        ? "browser-suggest-item is-active"
                        : "browser-suggest-item"
                    }
                    role="option"
                    aria-selected={index === suggestIndex}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      commitNavigate(item.url);
                    }}
                  >
                    <span className="browser-suggest-title">{item.title}</span>
                    <span className="browser-suggest-url">{item.url}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <button
          type="button"
          className="browser-menu-btn browser-history-icon-btn"
          data-testid="host-browser-library-toggle"
          aria-label={t("browser.library")}
          title={t("browser.library")}
          aria-expanded={libraryOpen}
          onClick={() => setLibraryOpen((v) => !v)}
        >
          <ChatHistoryIcon />
        </button>
      </form>
      <div
        className={
          ensuring || loading
            ? "browser-load-progress is-active"
            : "browser-load-progress"
        }
        data-testid="host-browser-progress"
        role="progressbar"
        aria-hidden={!(ensuring || loading)}
        aria-label={loading ? t("browser.loading") : t("browser.connecting")}
      >
        <div className="browser-load-progress-bar" />
      </div>
      {libraryOpen ? (
        <div className="browser-dropdown" data-testid="host-browser-library">
          <div className="browser-dropdown-actions">
            <button
              type="button"
              className={
                starred ? "browser-star-btn is-starred" : "browser-star-btn"
              }
              data-testid="host-browser-star"
              aria-label={
                starred ? t("browser.unbookmark") : t("browser.bookmark")
              }
              aria-pressed={Boolean(starred)}
              disabled={!profileKey}
              onClick={() => void toggleBookmark()}
            >
              ★ {starred ? t("browser.unbookmark") : t("browser.bookmark")}
            </button>
            <button
              type="button"
              className="browser-menu-btn"
              data-testid="host-browser-history-clear"
              onClick={() => void clearHistory()}
            >
              {t("browser.clearHistory")}
            </button>
          </div>
          <div className="browser-dropdown-section">
            <div className="browser-dropdown-heading">{t("browser.bookmarks")}</div>
            {bookmarks.length === 0 ? (
              <p
                className="browser-dropdown-empty"
                data-testid="host-browser-bookmarks"
              >
                {t("browser.bookmarksEmpty")}
              </p>
            ) : (
              <ul className="browser-dropdown-list" data-testid="host-browser-bookmarks">
                {bookmarks.map((bm) => (
                  <li key={bm.id}>
                    <button
                      type="button"
                      className="browser-dropdown-item"
                      onClick={() => {
                        setLibraryOpen(false);
                        commitNavigate(bm.url);
                      }}
                    >
                      <span className="browser-suggest-title">{bm.title}</span>
                      <span className="browser-suggest-url">{bm.url}</span>
                    </button>
                    <button
                      type="button"
                      className="browser-dropdown-remove"
                      aria-label={t("browser.removeBookmark")}
                      onClick={() => void removeBookmark(bm.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="browser-dropdown-section">
            <div className="browser-dropdown-heading">{t("browser.history")}</div>
            {history.length === 0 ? (
              <p
                className="browser-dropdown-empty"
                data-testid="host-browser-history"
              >
                {t("browser.historyEmpty")}
              </p>
            ) : (
              <ul className="browser-dropdown-list" data-testid="host-browser-history">
                {history.slice(0, 40).map((item) => (
                  <li key={`${item.visited_at}-${item.url}`}>
                    <button
                      type="button"
                      className="browser-dropdown-item"
                      onClick={() => {
                        setLibraryOpen(false);
                        commitNavigate(item.url);
                      }}
                    >
                      <span className="browser-suggest-title">{item.title}</span>
                      <span className="browser-suggest-url">{item.url}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
      {error ? (
        <div
          className="browser-error"
          role="alert"
          data-testid="host-browser-error"
        >
          {error}
        </div>
      ) : null}
      <div
        ref={contentRef}
        className="browser-content-slot"
        data-testid="host-browser-content"
      >
        {!docked ? (
          <p className="browser-content-hint">{t("browser.contentHint")}</p>
        ) : null}
      </div>
    </>
  );

  if (desktopOpen) {
    return (
      <DesktopAppWindow
        appId="browser"
        title={t("browser.title")}
        leading={<HostBrowserIcon />}
        hideTitleText
        panelTestId="host-browser-panel"
        floatTestId="host-browser-float"
        minimizeTestId="host-browser-minimize"
        maximizeTestId="host-browser-maximize"
        closeTestId="host-browser-close"
        bodyClassName="browser-float-window desktop-browser-body"
      >
        {browserBody}
      </DesktopAppWindow>
    );
  }

  return createPortal(
    <>
      {showFloat ? (
        <div
          className="preview-float-backdrop maximized browser-float-backdrop"
          role="presentation"
          data-testid="host-browser-float"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              doMinimize();
            }
          }}
        >
          <div
            className="preview-float-window maximized browser-float-window"
            role="dialog"
            aria-label={t("browser.panelAria")}
            data-testid="host-browser-panel"
            data-chrome="icon-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="browser-float-head is-compact">
              <span
                className="desktop-app-window-leading"
                data-testid="desktop-app-window-leading"
                aria-hidden
              >
                <HostBrowserIcon />
              </span>
              <div className="browser-float-actions">
                <button
                  type="button"
                  className="browser-float-icon-btn"
                  data-testid="host-browser-minimize"
                  title={t("browser.minimizeToDock")}
                  aria-label={t("common:minimize")}
                  onClick={() => doMinimize()}
                >
                  <PreviewMinimizeIcon />
                </button>
                <button
                  type="button"
                  className="browser-float-icon-btn"
                  data-testid="host-browser-close"
                  title={t("browser.close")}
                  aria-label={t("browser.close")}
                  onClick={() => doClose()}
                >
                  <PreviewCloseIcon />
                </button>
              </div>
            </header>
            <div className="browser-float-body">{browserBody}</div>
          </div>
        </div>
      ) : null}
      <BrowserDock />
    </>,
    document.body,
  );
}
