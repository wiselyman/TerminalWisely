import { describe, expect, it } from "vitest";
import {
  canLogs,
  canPortForward,
  canRestart,
  canScale,
  canShell,
  ownedPodDeleteController,
  ownerNeedsParentResolve,
  parseControllerOwner,
  preferWorkloadOwner,
} from "./actions";

describe("k8s actions", () => {
  it("allows port-forward on Pod and Service", () => {
    expect(canPortForward("Pod")).toBe(true);
    expect(canPortForward("Service")).toBe(true);
    expect(canPortForward("svc")).toBe(true);
    expect(canPortForward("Deployment")).toBe(false);
  });

  it("allows logs on workloads Lens supports", () => {
    expect(canLogs("Pod")).toBe(true);
    expect(canLogs("Deployment")).toBe(true);
    expect(canLogs("StatefulSet")).toBe(true);
    expect(canLogs("DaemonSet")).toBe(true);
    expect(canLogs("Job")).toBe(true);
    expect(canLogs("Service")).toBe(false);
  });

  it("allows restart on rollout targets", () => {
    expect(canRestart("Deployment")).toBe(true);
    expect(canRestart("DaemonSet")).toBe(true);
    expect(canRestart("Pod")).toBe(false);
  });

  it("keeps scale and shell scopes tight", () => {
    expect(canScale("ReplicaSet")).toBe(true);
    expect(canShell("Pod")).toBe(true);
    expect(canShell("Deployment")).toBe(false);
  });

  it("parses controller ownerRefs for owned pods", () => {
    expect(parseControllerOwner("StatefulSet/my-statefulset")).toEqual({
      kind: "StatefulSet",
      name: "my-statefulset",
    });
    expect(
      parseControllerOwner("ReplicaSet/web-7d9, Deployment/web"),
    ).toEqual({ kind: "Deployment", name: "web" });
    expect(parseControllerOwner("DaemonSet/fluentd")).toEqual({
      kind: "DaemonSet",
      name: "fluentd",
    });
    expect(parseControllerOwner("Job/batch-1")).toEqual({
      kind: "Job",
      name: "batch-1",
    });
    expect(parseControllerOwner("ReplicationController/rc-1")).toEqual({
      kind: "ReplicationController",
      name: "rc-1",
    });
    // Custom / unknown controllers still count as owners
    expect(parseControllerOwner("Rollout/canary")).toEqual({
      kind: "Rollout",
      name: "canary",
    });
    expect(parseControllerOwner("")).toBeNull();
    expect(parseControllerOwner(null)).toBeNull();
  });

  it("lifts ReplicaSet→Deployment and Job→CronJob via parent ownerRefs", () => {
    expect(
      preferWorkloadOwner(
        { kind: "ReplicaSet", name: "web-abc" },
        "Deployment/web",
      ),
    ).toEqual({ kind: "Deployment", name: "web" });
    expect(
      preferWorkloadOwner(
        { kind: "Job", name: "nightly-123" },
        "CronJob/nightly",
      ),
    ).toEqual({ kind: "CronJob", name: "nightly" });
    expect(
      preferWorkloadOwner(
        { kind: "ReplicaSet", name: "orphan-rs" },
        null,
      ),
    ).toEqual({ kind: "ReplicaSet", name: "orphan-rs" });
    expect(
      preferWorkloadOwner(
        { kind: "StatefulSet", name: "db" },
        "Deployment/ignored",
      ),
    ).toEqual({ kind: "StatefulSet", name: "db" });
    expect(ownerNeedsParentResolve("ReplicaSet")).toBe(true);
    expect(ownerNeedsParentResolve("Job")).toBe(true);
    expect(ownerNeedsParentResolve("StatefulSet")).toBe(false);
  });

  it("picks owned-pod delete target from controller ownerRefs", () => {
    expect(
      ownedPodDeleteController("Pod", "StatefulSet/my-statefulset"),
    ).toEqual({ kind: "StatefulSet", name: "my-statefulset" });
    expect(
      ownedPodDeleteController("Pod", "DaemonSet/fluentd, ReplicaSet/noise"),
    ).toEqual({ kind: "DaemonSet", name: "fluentd" });
    expect(ownedPodDeleteController("Pod", "ReplicaSet/web-abc")).toEqual({
      kind: "ReplicaSet",
      name: "web-abc",
    });
    expect(ownedPodDeleteController("Pod", "Rollout/canary")).toEqual({
      kind: "Rollout",
      name: "canary",
    });
    expect(
      ownedPodDeleteController("Deployment", "StatefulSet/x"),
    ).toBeNull();
  });
});
