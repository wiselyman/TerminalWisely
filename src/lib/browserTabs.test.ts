import { describe, expect, it } from "vitest";
import {
  createBrowserBucket,
  createBrowserTab,
  pushTabNav,
  tabCanGoBack,
  tabCanGoForward,
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
});
