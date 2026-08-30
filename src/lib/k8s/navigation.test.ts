import { describe, expect, it } from "vitest";
import { categoryForKind } from "./navigation";

describe("k8s navigation", () => {
  it("maps well-known kinds to categories", () => {
    expect(categoryForKind("Pod")).toBe("pods");
    expect(categoryForKind("Deployment")).toBe("deployments");
    expect(categoryForKind("Ingress")).toBe("ingresses");
    expect(categoryForKind("HorizontalPodAutoscaler")).toBe(
      "horizontalpodautoscalers",
    );
  });

  it("returns null for unknown kinds", () => {
    expect(categoryForKind("")).toBeNull();
    expect(categoryForKind("UnknownKind")).toBeNull();
  });
});
