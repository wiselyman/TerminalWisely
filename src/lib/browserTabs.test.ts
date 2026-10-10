import { describe, expect, it } from "vitest";
import {
  applyBrowserPageEvent,
  applyBrowserTitle,
  browserTabCaption,
  browserTabLabel,
  choosePopupUrl,
  createBrowserBucket,
  createBrowserTab,
  pushTabNav,
  tabCanGoBack,
  tabCanGoForward,
  withBrowserScheme,
} from "./browserTabs";

describe("browserTabs", () => {
  it("creates an isolated bucket with one tab", () => {
    const a = createBrowserBucket();
    const b = createBrowserBucket();
    expect(a.tabs).toHaveLength(1);
    expect(a.activeTabId).toBe(a.tabs[0].id);
    expect(a.tabs[0].id).not.toBe(b.tabs[0].id);
  });

  it("tracks per-tab history", () => {
    let tab = createBrowserTab("http://127.0.0.1/");
    tab = pushTabNav(tab, "http://127.0.0.1:8096/");
    tab = pushTabNav(tab, "http://127.0.0.1:9000/");
    expect(tabCanGoBack(tab)).toBe(true);
    expect(tabCanGoForward(tab)).toBe(false);
    expect(tab.navStack).toEqual([
      "http://127.0.0.1:8096/",
      "http://127.0.0.1:9000/",
    ]);
  });

  it("page events update only the owning tab", async () => {
    const { applyBrowserPageEvent, createBrowserTab } = await import("./browserTabs");
    const a = createBrowserTab("http://127.0.0.1/");
    const b = createBrowserTab("http://10.0.0.1/");
    const tabs = [a, b];
    const result = applyBrowserPageEvent(tabs, b.id, {
      tabId: a.id,
      url: "https://www.baidu.com/",
      title: "百度一下",
      favicon: "https://www.baidu.com/favicon.ico",
    });
    expect(result.tabs.find((t) => t.id === a.id)?.url).toBe(
      "https://www.baidu.com/",
    );
    expect(result.tabs.find((t) => t.id === a.id)?.favicon).toBe(
      "https://www.baidu.com/favicon.ico",
    );
    expect(result.tabs.find((t) => t.id === a.id)?.title).toBe("百度一下");
    expect(result.tabs.find((t) => t.id === b.id)?.url).toBe("http://10.0.0.1/");
    expect(result.activeUpdated).toBe(false);
    expect(result.url).toBeUndefined();
  });

  it("does not treat an http address as the tab title", () => {
    let tab = createBrowserTab(
      "https://www.youtube.com/",
      "https://www.youtube.com/",
    );
    expect(browserTabCaption(tab.title)).toBe("");
    tab = pushTabNav(tab, "https://www.youtube.com/watch?v=1");
    expect(tab.title).toBe("");
    const ignored = applyBrowserPageEvent([tab], tab.id, {
      tabId: tab.id,
      url: "https://www.youtube.com/watch?v=1",
      title: "https://www.youtube.com/watch?v=1",
    });
    expect(ignored.tabs[0]?.title).toBe("");
    const titled = applyBrowserPageEvent(ignored.tabs, tab.id, {
      tabId: tab.id,
      url: "https://www.youtube.com/watch?v=1",
      title: "A real title",
    });
    expect(titled.tabs[0]?.title).toBe("A real title");
  });

  it("opens one destination when Open Link reports several urls", () => {
    const current =
      "https://www.google.com.hk/search?q=hello&newwindow=1&sca_esv=abc";
    const chosen = choosePopupUrl(current, [
      current,
      "https://www.google.com.hk/search?q=hello&newwindow=1&sca_esv=abc",
      "https://en.wikipedia.org/wiki/Hello",
    ]);
    expect(chosen).toBe("https://en.wikipedia.org/wiki/Hello");
    expect(choosePopupUrl(current, ["about:blank", current])).toBeNull();
  });

  it("keeps a document title that arrives after the address is known", () => {
    const tab = createBrowserTab("https://en.wikipedia.org/wiki/Hello", "");
    expect(browserTabCaption(tab.title)).toBe("");
    const titled = applyBrowserTitle([tab], tab.id, "Hello");
    expect(titled.find((item) => item.id === tab.id)?.title).toBe("Hello");
    const kept = applyBrowserTitle(titled, tab.id, "https://en.wikipedia.org/wiki/Hello");
    expect(kept.find((item) => item.id === tab.id)?.title).toBe("Hello");
  });

  it("keeps a document title when a later load event has an empty title", () => {
    const tab = createBrowserTab(
      "https://en.wikipedia.org/wiki/Hello",
      "Hello - Wikipedia",
    );
    const result = applyBrowserPageEvent([tab], tab.id, {
      tabId: tab.id,
      url: "https://en.wikipedia.org/wiki/Hello",
      title: "",
      favicon: "https://en.wikipedia.org/favicon.ico",
    });
    expect(result.tabs[0]?.title).toBe("Hello - Wikipedia");
    expect(browserTabLabel(result.tabs[0]!.title, result.tabs[0]!.url)).toBe(
      "Hello - Wikipedia",
    );
  });

  it("uses the host as the tab label until a document title arrives", () => {
    const tab = createBrowserTab("https://en.wikipedia.org/wiki/Hello", "");
    expect(browserTabLabel(tab.title, tab.url)).toBe("en.wikipedia.org");
    expect(browserTabLabel("", "")).toBe("");
  });

  it("defaults a bare host to https and keeps an explicit scheme", () => {
    expect(withBrowserScheme("www.baidu.com")).toBe("https://www.baidu.com");
    expect(withBrowserScheme("http://www.baidu.com")).toBe("http://www.baidu.com");
    expect(withBrowserScheme("https://example.com/a")).toBe("https://example.com/a");
  });
});
