export type BrowserTab = {
  id: string;
  url: string;
  title: string;
  /** Absolute http(s) or data: URL for the tab favicon. */
  favicon?: string;
  navStack: string[];
  navIndex: number;
};

export type BrowserSessionBucket = {
  tabs: BrowserTab[];
  activeTabId: string;
  /** Native surface handles — survive park across host switches. */
  webviewLabel: string | null;
  profileKey: string | null;
  socksPort: number | null;
  /** True after at least one successful navigate/activate for this host. */
  warm: boolean;
};

let tabSeq = 0;

export function newBrowserTabId(): string {
  tabSeq += 1;
  return `btab-${tabSeq}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createBrowserTab(
  url = "http://127.0.0.1/",
  title = "",
): BrowserTab {
  return {
    id: newBrowserTabId(),
    url,
    title,
    navStack: [],
    navIndex: -1,
  };
}

export function createBrowserBucket(): BrowserSessionBucket {
  const tab = createBrowserTab();
  return {
    tabs: [tab],
    activeTabId: tab.id,
    webviewLabel: null,
    profileKey: null,
    socksPort: null,
    warm: false,
  };
}

export function activeTab(
  bucket: BrowserSessionBucket,
): BrowserTab | undefined {
  return bucket.tabs.find((t) => t.id === bucket.activeTabId) ?? bucket.tabs[0];
}

/** An http(s) address is a location, not a page title. */
export function browserTabCaption(title: string): string {
  const trimmed = title.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed)) return "";
  return trimmed;
}

export function pushTabNav(tab: BrowserTab, url: string): BrowserTab {
  const same = tab.navIndex >= 0 && tab.navStack[tab.navIndex] === url;
  const title = same ? browserTabCaption(tab.title) : "";
  if (same) {
    return { ...tab, url, title };
  }
  const navStack = tab.navStack.slice(0, tab.navIndex + 1);
  navStack.push(url);
  return {
    ...tab,
    url,
    title,
    navStack,
    navIndex: navStack.length - 1,
  };
}

/**
 * Apply a native page-load event to the owning tab only.
 * Never write a background webview's URL onto the active address bar.
 */
export function applyBrowserPageEvent(
  tabs: BrowserTab[],
  activeTabId: string | null,
  event: { tabId: string; url: string; title: string; favicon?: string },
): {
  tabs: BrowserTab[];
  url: string | undefined;
  pageTitle: string | undefined;
  activeUpdated: boolean;
} {
  const idx = tabs.findIndex((t) => t.id === event.tabId);
  if (idx < 0) {
    return { tabs, url: undefined, pageTitle: undefined, activeUpdated: false };
  }
  const current = tabs[idx];
  const title = browserTabCaption(event.title);
  const favicon = event.favicon?.trim() || current.favicon;
  const pushed = pushTabNav(current, event.url);
  const updated = {
    ...pushed,
    title: title || pushed.title,
    favicon,
  };
  const nextTabs = tabs.map((t, i) => (i === idx ? updated : t));
  const activeUpdated = activeTabId === event.tabId;
  return {
    tabs: nextTabs,
    url: activeUpdated ? event.url : undefined,
    pageTitle: activeUpdated ? title : undefined,
    activeUpdated,
  };
}

export function tabCanGoBack(tab: BrowserTab): boolean {
  return tab.navIndex > 0;
}

export function tabCanGoForward(tab: BrowserTab): boolean {
  return tab.navIndex >= 0 && tab.navIndex < tab.navStack.length - 1;
}
