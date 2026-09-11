import { describe, expect, it } from "vitest";
import { resolveSelectedCluster, syncOpenClusterTabIds } from "./clusterTabs";

describe("syncOpenClusterTabIds", () => {
  it("adds selected cluster when open tabs are empty", () => {
    expect(syncOpenClusterTabIds([], ["kube:a", "kube:b"], "kube:a")).toEqual([
      "kube:a",
    ]);
  });

  it("preserves existing open tabs and appends selected if missing", () => {
    expect(
      syncOpenClusterTabIds(["kube:b"], ["kube:a", "kube:b"], "kube:a"),
    ).toEqual(["kube:b", "kube:a"]);
  });

  it("drops stale ids that no longer exist", () => {
    expect(
      syncOpenClusterTabIds(
        ["kube:gone", "kube:a"],
        ["kube:a", "kube:b"],
        "kube:a",
      ),
    ).toEqual(["kube:a"]);
  });

  it("does not duplicate selected when already open", () => {
    expect(
      syncOpenClusterTabIds(["kube:a", "kube:b"], ["kube:a", "kube:b"], "kube:a"),
    ).toEqual(["kube:a", "kube:b"]);
  });

  it("only filters when nothing is selected", () => {
    expect(
      syncOpenClusterTabIds(["kube:gone", "kube:a"], ["kube:a"], null),
    ).toEqual(["kube:a"]);
  });
});

describe("resolveSelectedCluster", () => {
  const clusters = [
    { id: "kube:a", display_name: "131" },
    { id: "kube:b", display_name: "firefly" },
  ];

  it("returns null when nothing was selected", () => {
    expect(resolveSelectedCluster(clusters, null)).toBeNull();
  });

  it("keeps an existing selection when still present", () => {
    expect(resolveSelectedCluster(clusters, "kube:b")?.id).toBe("kube:b");
  });

  it("prefers import display name over stale selection", () => {
    expect(resolveSelectedCluster(clusters, "kube:a", "firefly")?.id).toBe(
      "kube:b",
    );
  });

  it("returns null when previous selection disappeared", () => {
    expect(resolveSelectedCluster(clusters, "kube:gone")).toBeNull();
  });
});
