import { describe, expect, it } from "vitest";
import {
  findSavedConnectionForServer,
  findSshKubectlClusterForServer,
  findSshTabForSaved,
  jumpHostNeedsAuth,
  liveJumpHostSessionId,
  resolveLiveSessionForCluster,
  savedServerKey,
  sshKubectlProbeOk,
} from "./sshHostBind";

describe("sshHostBind", () => {
  const tabs = [
    { id: "s1", server_id: "root@10.0.0.1:22" },
    { id: "s2", server_id: "root@10.0.0.1:22" },
    { id: "s3", server_id: "root@10.0.0.2:22" },
  ];

  it("finds SSH tab for saved server; prefers active", () => {
    expect(findSshTabForSaved(tabs, "root@10.0.0.1:22", "s2")?.id).toBe("s2");
    expect(findSshTabForSaved(tabs, "root@10.0.0.1:22", null)?.id).toBe("s1");
    expect(findSshTabForSaved(tabs, "missing", null)).toBeNull();
  });

  it("prefers bare title over numbered duplicates when not active", () => {
    const named = [
      { id: "b", server_id: "u@h:22", title: "spark-remote (1)" },
      { id: "a", server_id: "u@h:22", title: "spark-remote" },
      { id: "c", server_id: "u@h:22", title: "spark-remote (2)" },
    ];
    expect(findSshTabForSaved(named, "u@h:22", null, "spark-remote")?.id).toBe(
      "a",
    );
  });

  it("prefers lowest number when bare is absent", () => {
    const named = [
      { id: "b", server_id: "u@h:22", title: "spark-remote (2)" },
      { id: "a", server_id: "u@h:22", title: "spark-remote (1)" },
    ];
    expect(findSshTabForSaved(named, "u@h:22", null, "spark-remote")?.id).toBe(
      "a",
    );
  });

  it("matches connecting tabs by title when server_id missing", () => {
    const pending = [
      { id: "pending:1", server_id: null, title: "spark-remote" },
    ];
    expect(
      findSshTabForSaved(pending, "u@h:22", null, "spark-remote")?.id,
    ).toBe("pending:1");
  });

  it("probe ok only when successful result", () => {
    expect(sshKubectlProbeOk(undefined)).toBe(false);
    expect(sshKubectlProbeOk("loading")).toBe(false);
    expect(sshKubectlProbeOk({ ok: false })).toBe(false);
    expect(sshKubectlProbeOk({ ok: true })).toBe(true);
  });

  it("finds existing ssh_kubectl binding by server_id", () => {
    const clusters = [
      { id: "c1", kind: "kubeconfig", server_id: null },
      { id: "c2", kind: "ssh_kubectl", server_id: "root@10.0.0.1:22" },
    ];
    expect(
      findSshKubectlClusterForServer(clusters, "root@10.0.0.1:22")?.id,
    ).toBe("c2");
    expect(findSshKubectlClusterForServer(clusters, "other")).toBeNull();
  });

  it("prefers live SSH tab over stale binding session_id", () => {
    const cluster = {
      id: "c2",
      kind: "ssh_kubectl",
      server_id: "root@10.0.0.1:22",
      session_id: "dead-session",
    };
    expect(resolveLiveSessionForCluster(cluster, tabs, "s2")).toBe("s2");
    expect(resolveLiveSessionForCluster(cluster, tabs, null)).toBe("s1");
    expect(
      resolveLiveSessionForCluster(
        { ...cluster, server_id: null },
        tabs,
        null,
      ),
    ).toBe("dead-session");
  });

  it("liveJumpHostSessionId ignores stale session when no tab is open", () => {
    const cluster = {
      id: "c2",
      kind: "ssh_kubectl",
      server_id: "root@10.0.0.1:22",
      session_id: "dead-session",
    };
    expect(liveJumpHostSessionId(cluster, [], null)).toBeNull();
    expect(liveJumpHostSessionId(cluster, tabs, null)).toBe("s1");
  });

  it("matches saved connection by server key", () => {
    const saved = {
      id: "sv1",
      name: "lab",
      host: "10.0.0.1",
      port: 22,
      username: "root",
      auth_method: "password",
      has_password: true,
    };
    expect(savedServerKey(saved)).toBe("root@10.0.0.1:22");
    expect(findSavedConnectionForServer([saved], "root@10.0.0.1:22")?.id).toBe(
      "sv1",
    );
    expect(jumpHostNeedsAuth({ ...saved, has_password: false })).toBe(true);
    expect(jumpHostNeedsAuth(saved)).toBe(false);
  });
});
