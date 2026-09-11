import { describe, expect, it } from "vitest";
import {
  findActiveForward,
  parseForwardablePorts,
  suggestLocalPort,
} from "./forwardablePorts";
import type { PortForwardInfo } from "./types";

const podJson = JSON.stringify({
  apiVersion: "v1",
  kind: "Pod",
  spec: {
    containers: [
      {
        name: "app",
        ports: [
          { containerPort: 80, protocol: "TCP", name: "http" },
          { containerPort: 443, protocol: "TCP", name: "https" },
        ],
      },
      {
        name: "sidecar",
        ports: [{ containerPort: 9090 }],
      },
    ],
  },
});

const serviceJson = JSON.stringify({
  apiVersion: "v1",
  kind: "Service",
  spec: {
    ports: [
      { name: "redis", port: 6379, protocol: "TCP", targetPort: 6379 },
      { name: "sentinel", port: 26379, protocol: "TCP", targetPort: 26379 },
    ],
  },
});

describe("parseForwardablePorts", () => {
  it("extracts pod container ports from JSON", () => {
    expect(parseForwardablePorts(podJson, "Pod")).toEqual([
      { remotePort: 80, protocol: "TCP", name: "http" },
      { remotePort: 443, protocol: "TCP", name: "https" },
      { remotePort: 9090, protocol: "TCP" },
    ]);
  });

  it("extracts service ports from JSON (uses port, not targetPort)", () => {
    expect(parseForwardablePorts(serviceJson, "Service")).toEqual([
      {
        remotePort: 6379,
        protocol: "TCP",
        name: "redis",
        targetPort: "6379",
      },
      {
        remotePort: 26379,
        protocol: "TCP",
        name: "sentinel",
        targetPort: "26379",
      },
    ]);
  });

  it("accepts svc kind alias", () => {
    expect(parseForwardablePorts(serviceJson, "svc")).toHaveLength(2);
  });

  it("dedups same remotePort+protocol", () => {
    const dup = JSON.stringify({
      spec: {
        containers: [
          {
            ports: [
              { containerPort: 80, protocol: "TCP" },
              { containerPort: 80, protocol: "tcp" },
            ],
          },
        ],
      },
    });
    expect(parseForwardablePorts(dup, "Pod")).toEqual([
      { remotePort: 80, protocol: "TCP" },
    ]);
  });

  it("reads containerPort from kubectl-style YAML", () => {
    const yaml = `
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: nginx
    ports:
    - containerPort: 80
      protocol: TCP
      name: http
    - containerPort: 443
      protocol: TCP
`;
    expect(parseForwardablePorts(yaml, "Pod")).toEqual([
      { remotePort: 80, protocol: "TCP", name: "http" },
      { remotePort: 443, protocol: "TCP" },
    ]);
  });

  it("reads service ports from YAML without treating targetPort as remote", () => {
    const yaml = `
spec:
  ports:
  - name: redis
    port: 6379
    protocol: TCP
    targetPort: 6379
  - port: 26379
    protocol: TCP
`;
    expect(parseForwardablePorts(yaml, "Service")).toEqual([
      {
        remotePort: 6379,
        protocol: "TCP",
        name: "redis",
        targetPort: "6379",
      },
      { remotePort: 26379, protocol: "TCP" },
    ]);
  });

  it("returns empty for empty or malformed docs", () => {
    expect(parseForwardablePorts("", "Pod")).toEqual([]);
    expect(parseForwardablePorts("{not-json", "Pod")).toEqual([]);
    expect(parseForwardablePorts("kind: Pod\n", "Deployment")).toEqual([]);
  });
});

describe("suggestLocalPort", () => {
  it("defaults to remote port when free", () => {
    expect(suggestLocalPort(6379, [])).toBe(6379);
  });

  it("bumps when remote is already used locally", () => {
    expect(suggestLocalPort(80, [80, 81])).toBe(82);
  });
});

describe("findActiveForward", () => {
  const base: PortForwardInfo = {
    id: "pf-1",
    cluster_id: "c1",
    resource_kind: "Pod",
    namespace: "default",
    name: "web",
    local_port: 18080,
    remote_port: 80,
    mode: "local",
  };

  it("matches kind/ns/name/remote case-insensitively on kind", () => {
    expect(
      findActiveForward([base], {
        resourceKind: "pod",
        namespace: "default",
        name: "web",
        remotePort: 80,
      })?.id,
    ).toBe("pf-1");
    expect(
      findActiveForward([base], {
        resourceKind: "Pod",
        namespace: "default",
        name: "web",
        remotePort: 443,
      }),
    ).toBeUndefined();
  });
});
