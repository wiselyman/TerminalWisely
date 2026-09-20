import { describe, expect, it } from "vitest";
import {
  shouldKeepAiEngineerPanelMounted,
  shouldShowAiEngineerPanel,
} from "./panelVisibility";

describe("shouldShowAiEngineerPanel", () => {
  it("hides the panel in K8s view when no cluster is selected", () => {
    expect(
      shouldShowAiEngineerPanel({
        open: true,
        sessionId: "sess",
        sidebarView: "k8s",
        hasSelectedCluster: false,
      }),
    ).toBe(false);
  });

  it("shows the panel in K8s view with a selected cluster", () => {
    expect(
      shouldShowAiEngineerPanel({
        open: true,
        sessionId: "sess",
        sidebarView: "k8s",
        hasSelectedCluster: true,
      }),
    ).toBe(true);
  });

  it("shows the panel in Hosts view when open", () => {
    expect(
      shouldShowAiEngineerPanel({
        open: true,
        sessionId: "sess",
        sidebarView: "hosts",
        hasSelectedCluster: false,
        activeTabId: "sess",
      }),
    ).toBe(true);
  });

  it("hides when open on a different host tab (must not leak prior chat)", () => {
    expect(
      shouldShowAiEngineerPanel({
        open: true,
        sessionId: "bonsai-sess",
        sidebarView: "hosts",
        hasSelectedCluster: false,
        activeTabId: "spark-sess",
      }),
    ).toBe(false);
  });

  it("hides when closed or missing session", () => {
    expect(
      shouldShowAiEngineerPanel({
        open: false,
        sessionId: "sess",
        sidebarView: "hosts",
        hasSelectedCluster: true,
        activeTabId: "sess",
      }),
    ).toBe(false);
    expect(
      shouldShowAiEngineerPanel({
        open: true,
        sessionId: null,
        sidebarView: "hosts",
        hasSelectedCluster: true,
        activeTabId: "sess",
      }),
    ).toBe(false);
  });
});

describe("shouldKeepAiEngineerPanelMounted", () => {
  it("keeps fiber tree warm when soft-hidden on hosts", () => {
    expect(
      shouldKeepAiEngineerPanelMounted({
        sessionId: "sess",
        show: false,
        sidebarView: "hosts",
        open: false,
      }),
    ).toBe(true);
  });

  it("unmounts when no session is bound", () => {
    expect(
      shouldKeepAiEngineerPanelMounted({
        sessionId: null,
        show: false,
        sidebarView: "hosts",
        open: false,
      }),
    ).toBe(false);
  });
});
