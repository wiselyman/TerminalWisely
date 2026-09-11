import { describe, expect, it } from "vitest";
import {
  categoryForKind,
  groupCrdCatalog,
  loadSelectedNamespaces,
} from "./navigation";

describe("k8s navigation", () => {
  it("maps well-known kinds to categories", () => {
    expect(categoryForKind("Pod")).toBe("pods");
    expect(categoryForKind("Deployment")).toBe("deployments");
    expect(categoryForKind("Ingress")).toBe("ingresses");
    expect(categoryForKind("EndpointSlice")).toBe("endpointslices");
    expect(categoryForKind("PodDisruptionBudget")).toBe("poddisruptionbudgets");
    expect(categoryForKind("HTTPRoute")).toBe("httproutes");
    expect(categoryForKind("HorizontalPodAutoscaler")).toBe(
      "horizontalpodautoscalers",
    );
  });

  it("returns null for unknown kinds", () => {
    expect(categoryForKind("")).toBeNull();
    expect(categoryForKind("UnknownKind")).toBeNull();
  });

  it("groups CRD catalog by API group", () => {
    const grouped = groupCrdCatalog([
      {
        group: "traefik.io",
        kind: "IngressRoute",
        plural: "ingressroutes",
        name: "ingressroutes.traefik.io",
        scope: "Namespaced",
      },
      {
        group: "k3s.cattle.io",
        kind: "Addon",
        plural: "addons",
        name: "addons.k3s.cattle.io",
        scope: "Namespaced",
      },
    ]);
    expect([...grouped.keys()]).toEqual(["k3s.cattle.io", "traefik.io"]);
    expect(grouped.get("traefik.io")?.[0].kind).toEqual("IngressRoute");
  });

  it("falls back when selected namespaces storage missing", () => {
    try {
      localStorage.removeItem("tw.k8s.selectedNamespaces");
    } catch {
      /* ignore */
    }
    expect(loadSelectedNamespaces("prod")).toEqual(["prod"]);
  });
});
