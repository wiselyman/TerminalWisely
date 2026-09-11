import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("SSH drag-and-drop upload", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.resetUpload();
    await api.openSshTab();
    await expect(page.getByTestId("terminal-view")).toBeVisible({ timeout: 15_000 });
  });

  test("shows drop overlay on drag enter", async ({ page }) => {
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-testid="terminal-view"].active .terminal-view-inner',
      );
      if (!el) throw new Error("terminal-view-inner missing");
      const dataTransfer = new DataTransfer();
      const file = new File(["e2e"], "e2e-drag.txt", { type: "text/plain" });
      Object.assign(file, { path: "/tmp/e2e-drag.txt" });
      dataTransfer.items.add(file);
      Object.defineProperty(dataTransfer, "types", {
        get: () => ["Files"],
      });
      const dragEnter = new DragEvent("dragenter", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });
      Object.defineProperty(dragEnter, "dataTransfer", { value: dataTransfer });
      el.dispatchEvent(dragEnter);
    });

    await expect(page.locator(".terminal-drop-overlay")).toBeVisible({ timeout: 5_000 });
  });

  test("HTML5 drop invokes upload_files with local paths", async ({ page }) => {
    const api = await twE2e(page);
    const localPath = "/tmp/tw-e2e-drag-upload.txt";

    await api.simulateTerminalDrop([localPath]);

    const upload = await api.getLastUpload();
    expect(upload).not.toBeNull();
    expect(upload?.session_id).toBeTruthy();
    expect(upload?.local_paths).toEqual([localPath]);
  });
});
