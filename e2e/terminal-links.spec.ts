import { expect, test, type Page } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

async function printedPathPoint(page: Page, path: string) {
  const rows = page.locator(".xterm-rows");
  await expect(rows).toContainText(path);
  return rows.evaluate((root, target) => {
    for (const row of Array.from(root.children)) {
      const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      let text = "";
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        nodes.push(node);
        text += node.data;
      }
      const start = text.indexOf(target);
      if (start < 0) continue;
      let offset = 0;
      let startNode: Text | null = null;
      let endNode: Text | null = null;
      let startOffset = 0;
      let endOffset = 0;
      for (const node of nodes) {
        const nodeStart = offset;
        const nodeEnd = nodeStart + node.data.length;
        if (!startNode && start >= nodeStart && start < nodeEnd) {
          startNode = node;
          startOffset = start - nodeStart;
        }
        if (start + target.length > nodeStart && start + target.length <= nodeEnd) {
          endNode = node;
          endOffset = start + target.length - nodeStart;
          break;
        }
        offset = nodeEnd;
      }
      if (!startNode || !endNode) continue;
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      const rect = range.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }
    return null;
  }, path);
}

test.describe("Terminal file actions", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.resetMocks();
    await api.openSshTab();
  });

  test("right-clicking a printed remote file does not open a file menu", async ({ page }) => {
    const api = await twE2e(page);
    const path = "app.log";
    await api.emitTerminalPrompt(`\r\ne2e@127.0.0.1:~$ ls -l\r\n-rw-r--r-- 1 e2e e2e 1 Jan 1 00:00 ${path}\r\ne2e@127.0.0.1:~$ `);
    const point = await printedPathPoint(page, path);
    expect(point).not.toBeNull();

    await page.mouse.click(point!.x, point!.y, { button: "right" });
    await expect(page.getByRole("menu", { name: "File actions" })).toHaveCount(0, { timeout: 1_000 });
  });

  test("clicking a printed remote file does not open preview", async ({ page }) => {
    const api = await twE2e(page);
    const path = "app.log";
    await api.emitTerminalPrompt(`\r\ne2e@127.0.0.1:~$ ls -l\r\n-rw-r--r-- 1 e2e e2e 1 Jan 1 00:00 ${path}\r\ne2e@127.0.0.1:~$ `);
    const point = await printedPathPoint(page, path);
    expect(point).not.toBeNull();

    await page.mouse.click(point!.x, point!.y);
    await expect(page.locator(".preview-panel")).toHaveCount(0, { timeout: 1_000 });
  });
});
