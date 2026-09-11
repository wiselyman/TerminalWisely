import { describe, expect, it } from "vitest";
import {
  CREATE_RESOURCE_TEMPLATE_GROUPS,
  CREATE_RESOURCE_TEMPLATES,
  createResourceYamlFromTemplate,
  defaultCreateResourceYaml,
  groupForTemplate,
} from "./createResource";

describe("createResource templates", () => {
  it("lists 35+ Lens-style template kinds in groups", () => {
    expect(CREATE_RESOURCE_TEMPLATES.length).toBeGreaterThanOrEqual(35);
    expect(CREATE_RESOURCE_TEMPLATE_GROUPS.length).toBeGreaterThanOrEqual(6);
    expect(CREATE_RESOURCE_TEMPLATES).toContain("Deployment");
    expect(CREATE_RESOURCE_TEMPLATES).toContain("NetworkPolicy");
    expect(CREATE_RESOURCE_TEMPLATES).toContain("StorageClass");
  });

  it("defaultCreateResourceYaml uses ConfigMap in namespace", () => {
    const yaml = defaultCreateResourceYaml("demo");
    expect(yaml).toContain("namespace: demo");
    expect(yaml).toContain("kind: ConfigMap");
  });

  it("falls back to default namespace", () => {
    expect(defaultCreateResourceYaml("  ")).toContain("namespace: default");
  });

  it("builds deployment template with namespace", () => {
    const yaml = createResourceYamlFromTemplate("Deployment", "prod");
    expect(yaml).toContain("kind: Deployment");
    expect(yaml).toContain("namespace: prod");
    expect(yaml).toContain("replicas: 1");
  });

  it("omits namespace for cluster-scoped kinds", () => {
    const yaml = createResourceYamlFromTemplate("Namespace", "ignored");
    expect(yaml).toContain("kind: Namespace");
    expect(yaml).not.toContain("namespace:");
  });

  it("maps templates to nav-like groups", () => {
    expect(groupForTemplate("Deployment")).toBe("workloads");
    expect(groupForTemplate("Ingress")).toBe("network");
    expect(groupForTemplate("ClusterRole")).toBe("access");
  });
});
