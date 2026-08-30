/** Shared E2E fixture data for Tauri invoke mocks. */

export const E2E_SSH_SESSION_ID = "e2e-ssh-session-1";

export const e2eContexts = [
  {
    name: "e2e-context",
    cluster: "e2e-cluster",
    user: "e2e",
    current: true,
    kubeconfig_path: null,
    source: "default",
    display_name: "e2e-k3s-local",
  },
];

export const e2eClusterTarget = {
  id: "kube:e2e-context",
  kind: "kubeconfig" as const,
  display_name: "e2e-k3s-local",
  context: "e2e-context",
  kubeconfig_path: null,
  source: "default",
  namespace: "demo",
};

export const e2ePodRows = [
  {
    namespace: "demo",
    name: "web-abc",
    kind: "Pod",
    status: "Running",
    age: "1d",
    restarts: 0,
    node: "node-1",
    ready: "1/1",
  },
  {
    namespace: "demo",
    name: "broken-pull",
    kind: "Pod",
    status: "Pending",
    age: "2h",
    restarts: 0,
    node: "node-1",
    ready: "0/1",
  },
];

export const e2eClusterSummary = {
  version: "v1.28.0+e2e",
  node_count: 1,
  pod_phases: { Running: 2, Pending: 1 },
  recent_warnings: [
    {
      reason: "Failed",
      message: "ImagePullBackOff",
      involved: "Pod/demo/broken-pull",
      age: "2m",
    },
  ],
};

export const e2eSavedConnection = {
  id: "e2e-conn-1",
  name: "E2E Test Host",
  host: "127.0.0.1",
  port: 22,
  username: "e2e",
  auth_method: "password" as const,
  has_password: true,
};

export const e2eLocalRoots = [{ path: "/tmp", name: "tmp", kind: "dir" }];

export const e2eLocalDir = [
  { name: "e2e-file.txt", path: "/tmp/e2e-file.txt", kind: "file", size: 12 },
  { name: "e2e-dir", path: "/tmp/e2e-dir", kind: "dir", size: 0 },
];

export const e2eRemoteDir = [
  { name: "app.log", path: "/var/log/app.log", kind: "file", size: 4096 },
];

export const e2eHostStats = {
  cpu_percent: 12.5,
  memory_used_bytes: 2_000_000_000,
  memory_total_bytes: 8_000_000_000,
  disk_read_bytes_per_sec: 1024,
  disk_write_bytes_per_sec: 2048,
  net_rx_bytes_per_sec: 512,
  net_tx_bytes_per_sec: 256,
};

export const e2eProcesses = [
  {
    pid: 1001,
    user: "root",
    cpu_percent: 1.2,
    memory_percent: 0.5,
    command: "sshd",
  },
];

export const e2eSystemdUnits = [
  { name: "nginx.service", load: "loaded", active: "active", sub: "running" },
];

export const e2eFindResults = [
  { path: "/var/log/app.log", line: 42, text: "ERROR e2e match" },
];
