import { beforeEach, describe, expect, it, vi } from "vitest";

const { checkForAppUpdate } = vi.hoisted(() => ({
  checkForAppUpdate: vi.fn(),
}));

vi.mock("../lib/appUpdater", () => ({ checkForAppUpdate }));

import { useAppUpdateStore } from "./appUpdateStore";

describe("appUpdateStore quiet startup check", () => {
  beforeEach(() => {
    checkForAppUpdate.mockReset();
    useAppUpdateStore.setState({
      pending: null,
      dialog: null,
      checking: false,
    });
  });

  it("opens the update dialog when a newer release is available", async () => {
    const update = { version: "0.0.8" };
    checkForAppUpdate.mockResolvedValue({
      update,
      currentVersion: "0.0.7",
      needsPrivilege: false,
    });

    await useAppUpdateStore.getState().quietCheck();

    const { pending, dialog } = useAppUpdateStore.getState();
    expect(pending?.update).toBe(update);
    expect(dialog).toBe(pending);
  });

  it("clears pending update and dialog when the app is current", async () => {
    useAppUpdateStore.setState({
      pending: { update: {} as never, currentVersion: "0.0.7", needsPrivilege: false },
      dialog: { update: {} as never, currentVersion: "0.0.7", needsPrivilege: false },
    });
    checkForAppUpdate.mockResolvedValue({
      update: null,
      currentVersion: "0.0.8",
      needsPrivilege: false,
    });

    await useAppUpdateStore.getState().quietCheck();

    expect(useAppUpdateStore.getState().pending).toBeNull();
    expect(useAppUpdateStore.getState().dialog).toBeNull();
  });

  it("keeps startup quiet when the update check fails", async () => {
    checkForAppUpdate.mockRejectedValue(new Error("offline"));

    await useAppUpdateStore.getState().quietCheck();

    expect(useAppUpdateStore.getState().pending).toBeNull();
    expect(useAppUpdateStore.getState().dialog).toBeNull();
  });
});
