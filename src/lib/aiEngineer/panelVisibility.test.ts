import { describe, expect, it } from "vitest";
import { shouldShowAiEngineerPanel } from "./panelVisibility";

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
      }),
    ).toBe(true);
  });

  it("hides when closed or missing session", () => {
    expect(
      shouldShowAiEngineerPanel({
        open: false,
        sessionId: "sess",
        sidebarView: "hosts",
        hasSelectedCluster: true,
      }),
    ).toBe(false);
    expect(
      shouldShowAiEngineerPanel({
        open: true,
        sessionId: null,
        sidebarView: "hosts",
        hasSelectedCluster: true,
      }),
    ).toBe(false);
  });
});
