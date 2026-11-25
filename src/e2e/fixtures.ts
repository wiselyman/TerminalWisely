/** Shared E2E fixture data for Tauri invoke mocks. */

export const E2E_SSH_SESSION_ID = "e2e-ssh-session-1";

export const e2eSavedConnection = {
  id: "e2e-conn-1",
  name: "E2E Test Host",
  host: "127.0.0.1",
  port: 22,
  username: "e2e",
  auth_method: "password" as const,
  has_password: true,
};

export const e2eLocalRoots = ["/tmp"];

export const e2eLocalDir = [
  { name: "e2e-file.txt", path: "/tmp/e2e-file.txt", kind: "file", size_bytes: 12 },
  { name: "e2e-dir", path: "/tmp/e2e-dir", kind: "directory", size_bytes: 0 },
];

export const e2eRemoteDir = [
  {
    name: "manual.pdf",
    path: "/home/e2e/manual.pdf",
    kind: "file",
    size_bytes: 128,
  },
  {
    name: "photo.png",
    path: "/home/e2e/photo.png",
    kind: "file",
    size_bytes: 64,
  },
  {
    name: "broken.pdf",
    path: "/home/e2e/broken.pdf",
    kind: "file",
    size_bytes: 0,
  },
  {
    name: "guide.md",
    path: "/home/e2e/guide.md",
    kind: "file",
    size_bytes: 64,
  },
  {
    name: "logs",
    path: "/home/e2e/logs",
    kind: "directory",
    size_bytes: null,
  },
  {
    name: "app.log",
    path: "/var/log/app.log",
    kind: "file",
    size_bytes: 4096,
    permissions: "-rw-r-----",
    owner: "ubuntu",
    group: "adm",
    modified_ms: 1_729_700_000_125,
  },
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
  { path: "/var/log/app.log", kind: "file" as const, size_bytes: 2048 },
  { path: "/home/e2e/logs", kind: "directory" as const, size_bytes: null },
];
