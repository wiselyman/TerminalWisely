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

/** Bare hosts default to https. An explicit scheme (http, https, about) is kept. */
export function withBrowserScheme(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
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

/** Document title, or the host while that title has not arrived yet. */
export function browserTabLabel(title: string, url: string): string {
  const caption = browserTabCaption(title);
  if (caption) return caption;
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function popupPageKey(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    url.searchParams.delete("newwindow");
    return url.toString();
  } catch {
    return raw.trim();
  }
}

/**
 * One Open Link gesture can report the current page plus the real href.
 * Keep a single http(s) destination, preferring a different page.
 */
export function choosePopupUrl(
  currentUrl: string,
  candidates: string[],
): string | null {
  const http = candidates
    .map((item) => item.trim())
    .filter((item) => /^https?:\/\//i.test(item));
  if (http.length === 0) return null;
  const currentKey = popupPageKey(currentUrl);
  let currentHost = "";
  try {
    currentHost = new URL(currentUrl).host;
  } catch {
    currentHost = "";
  }
  const others = http.filter((item) => popupPageKey(item) !== currentKey);
  if (others.length === 0) return null;
  const external = others.filter((item) => {
    try {
      return new URL(item).host !== currentHost;
    } catch {
      return false;
    }
  });
  const pool = external.length > 0 ? external : others;
  return pool[pool.length - 1] ?? null;
}

/** Set a tab caption from the document title. An address does not replace one. */
export function applyBrowserTitle(
  tabs: BrowserTab[],
  tabId: string,
  title: string,
): BrowserTab[] {
  const caption = browserTabCaption(title);
  if (!caption) return tabs;
  return tabs.map((tab) => (tab.id === tabId ? { ...tab, title: caption } : tab));
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
  const incoming = browserTabCaption(event.title);
  const favicon = event.favicon?.trim() || current.favicon;
  const pushed = pushTabNav(current, event.url);
  // A finished load often reports an empty title after the document title
  // was already stored. Do not replace that caption with nothing.
  const title = incoming || browserTabCaption(current.title) || pushed.title;
  const updated = {
    ...pushed,
    title,
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
