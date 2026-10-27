/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));

describe("browserStore desktop target routing", () => {
  beforeEach(() => {
    vi.resetModules();
    invoke.mockReset();
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    vi.spyOn(document, "querySelector").mockReturnValue({
      getBoundingClientRect: () => ({ left: 12, top: 24, width: 720, height: 480 }),
    } as Element);
    invoke.mockImplementation(async (command: string) => {
      if (command === "browser_local_ensure") {
        return { profile_key: "local", webview_label: "tw-local-browser--tab", created: true };
      }
      if (command === "browser_ensure") {
        return { session_id: "ssh-a", profile_key: "ssh-a", socks_port: 1080, webview_label: "tw-ssh-browser--tab", created: true };
      }
      return undefined;
    });
  });

  it("opens Local browser without an SSH session or SOCKS ensure", async () => {
    const { useBrowserStore } = await import("./browserStore");
    await useBrowserStore.getState().openForTarget({ kind: "local" });

    expect(useBrowserStore.getState()).toMatchObject({
      open: true,
      target: { kind: "local" },
      sessionId: null,
      profileKey: "local",
    });
    expect(invoke).toHaveBeenCalledWith("browser_local_ensure", expect.objectContaining({
      request: expect.objectContaining({ tab_id: expect.any(String) }),
    }));
    expect(invoke).not.toHaveBeenCalledWith("browser_ensure", expect.anything());
    await useBrowserStore.getState().navigate("https://local.example");
    expect(invoke).toHaveBeenCalledWith("browser_local_navigate", expect.objectContaining({
      request: expect.objectContaining({ url: "https://local.example", tab_id: expect.any(String) }),
    }));
    expect(invoke).not.toHaveBeenCalledWith("browser_navigate", expect.anything());
  });

  it("keeps Local and SSH browser buckets separate", async () => {
    const { useBrowserStore } = await import("./browserStore");
    await useBrowserStore.getState().openForTarget({ kind: "local" });
    useBrowserStore.getState().setUrl("https://local.example");
    await useBrowserStore.getState().openForTarget({ kind: "ssh", sessionId: "ssh-a" });
    useBrowserStore.getState().setUrl("https://host.example");
    await useBrowserStore.getState().openForTarget({ kind: "local" });

    expect(useBrowserStore.getState().url).toBe("https://local.example");
    expect(invoke).toHaveBeenCalledWith("browser_ensure", expect.objectContaining({
      request: expect.objectContaining({ session_id: "ssh-a" }),
    }));
  });
});
