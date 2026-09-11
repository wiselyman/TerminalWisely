import { describe, expect, it, vi } from "vitest";
import {
  buildNavGroups,
  DEFAULT_EXPANDED,
  GATEWAY_CATEGORIES,
  groupIdForCategory,
  isGatewayNavAvailable,
  loadExpandedGroups,
} from "./navConfig";

describe("k8s navConfig", () => {
  it("defaults to cluster and workloads expanded", () => {
    expect(DEFAULT_EXPANDED).toEqual(["cluster", "workloads"]);
  });

  it("includes gateway group by default", () => {
    const groups = buildNavGroups();
    expect(groups.map((g) => g.id)).toContain("gateway");
    expect(groups.find((g) => g.id === "gateway")?.items).toEqual(
      GATEWAY_CATEGORIES,
    );
  });

  it("builds base groups without gateway when explicitly disabled", () => {
    const groups = buildNavGroups(false);
    expect(groups.map((g) => g.id)).toEqual([
      "cluster",
      "workloads",
      "network",
      "storage",
      "security",
      "config",
      "helm",
      "custom",
    ]);
    expect(groups.find((g) => g.id === "cluster")?.items[0]).toBe(
      "cluster_overview",
    );
    expect(groups.find((g) => g.id === "workloads")?.items).not.toContain(
      "replicationcontrollers",
    );
  });

  it("detects gateway CRDs from catalog", () => {
    expect(isGatewayNavAvailable([])).toBe(false);
    expect(
      isGatewayNavAvailable([
        {
          group: "traefik.io",
          kind: "IngressRoute",
          plural: "ingressroutes",
          name: "ingressroutes.traefik.io",
          scope: "Namespaced",
        },
      ]),
    ).toBe(false);
    expect(
      isGatewayNavAvailable([
        {
          group: "gateway.networking.k8s.io",
          kind: "Gateway",
          plural: "gateways",
          name: "gateways.gateway.networking.k8s.io",
          scope: "Namespaced",
        },
      ]),
    ).toBe(true);
  });

  it("maps categories to group ids", () => {
    const groups = buildNavGroups(false);
    expect(groupIdForCategory("cluster_overview", groups)).toBe("cluster");
    expect(groupIdForCategory("pods", groups)).toBe("workloads");
    expect(groupIdForCategory("helm_releases", groups)).toBe("helm");
    expect(groupIdForCategory("applications", groups)).toBeNull();
  });

  it("migrates legacy access group id to security", () => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });
    store["tw.k8s.navExpanded"] = JSON.stringify(["access", "workloads"]);
    const expanded = loadExpandedGroups();
    expect(expanded.has("security")).toBe(true);
    expect(expanded.has("access")).toBe(false);
    vi.unstubAllGlobals();
  });
});
