import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("./findStore", () => ({ useFindStore: { getState: () => ({ close: vi.fn() }) } }));
vi.mock("./hostStatsStore", () => ({ useHostStatsStore: { getState: () => ({ close: vi.fn() }) } }));
vi.mock("./sessionStore", () => ({ useSessionStore: { getState: () => ({ disconnectedSessionIds: new Set() }) } }));
vi.mock("./toastStore", () => ({ useToastStore: { getState: () => ({ pushToast: vi.fn() }) } }));

describe("taskManagerStore desktop target routing", () => {
  beforeEach(() => {
    vi.resetModules();
    invoke.mockReset();
    invoke.mockImplementation(async (command: string) => {
      if (command === "list_local_processes") return { processes: [
        { pid: 42, name: "local-worker", command: "worker --local", cpu_percent: 1, memory_bytes: 2048, ports: [] },
      ] };
      return { processes: [] };
    });
  });

  it("lists and kills local processes without an SSH session id", async () => {
    const { useTaskManagerStore } = await import("./taskManagerStore");
    await useTaskManagerStore.getState().fetchProcesses({ kind: "local" }, { initial: true });
    await vi.waitFor(() => expect(useTaskManagerStore.getState().processes[0]?.name).toBe("local-worker"));
    await useTaskManagerStore.getState().killProcess({ kind: "local" }, 42, "local-worker");
    expect(invoke).toHaveBeenCalledWith("list_local_processes");
    expect(invoke).toHaveBeenCalledWith("kill_local_process", { pid: 42, force: false });
    expect(invoke.mock.calls.flatMap(([, args]) => JSON.stringify(args ?? "")).join(" ")).not.toContain("session_id");
  });

  it("continues to route SSH process requests using the actual session id", async () => {
    const { useTaskManagerStore } = await import("./taskManagerStore");
    await useTaskManagerStore.getState().fetchProcesses({ kind: "ssh", sessionId: "host-session-17" }, { initial: true });
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith("list_processes", {
      request: { session_id: "host-session-17", mode: "basic" },
    }));
    expect(invoke).not.toHaveBeenCalledWith("list_local_processes");
  });
});
