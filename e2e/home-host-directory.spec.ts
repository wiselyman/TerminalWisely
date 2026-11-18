import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

const expectQuick = expect.configure({ timeout: 5_000 });

test.describe("Home host directory", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.title === "dragging a saved host card assigns it to a group") {
      await page.addInitScript(() => {
        localStorage.setItem("tw.entityLayout.hosts", JSON.stringify({
          version: 4,
          groupOrder: ["target-group", "__ungrouped__"],
          groups: [{ id: "target-group", name: "Target" }],
          defaultGroupCollapsed: false,
          assignments: { "e2e-conn-1": null },
          order: { "target-group": [], "__ungrouped__": ["e2e-conn-1"] },
        }));
      });
    }
    if (testInfo.title === "Home supports group and host management") {
      await page.addInitScript(() => {
        localStorage.setItem("tw.entityLayout.hosts", JSON.stringify({
          version: 4,
          groupOrder: ["__ungrouped__"],
          groups: [],
          defaultGroupCollapsed: false,
          assignments: { "e2e-conn-1": null },
          order: { "__ungrouped__": ["e2e-conn-1"] },
        }));
      });
    }
    await gotoApp(page, "directory");
    const api = await twE2e(page);
    await api.resetMocks();
  });

  test("uses an icon Home launcher and shows only saved host cards", async ({ page }) => {
    await expectQuick(page.getByTestId("home-host-directory")).toBeVisible();
    await expectQuick(page.getByTestId("home-directory-button")).toBeVisible();
    await expectQuick(page.getByTestId("home-directory-tab")).toHaveCount(0);
    await expectQuick(page.getByTestId("local-desktop-tab")).toBeVisible();
    await expectQuick(page.getByTestId("chrome-sidebar-views")).toBeHidden();
    await expectQuick(page.getByTestId("sidebar-view-hosts")).toHaveCount(0);
    await expectQuick(page.getByTestId("sidebar-view-home")).toHaveCount(0);
    await expectQuick(page.locator(".tab-bar > .tab").first()).toHaveAttribute("data-testid", "local-desktop-tab");
    await expectQuick(page.getByRole("heading", { name: "Hosts" })).toHaveCount(0);
    await expectQuick(page.getByText("Choose a computer to open its desktop workspace.")).toHaveCount(0);
    await expectQuick(page.getByTestId("home-local-host-card")).toHaveCount(0);
    await expectQuick(page.getByTestId("home-local-section")).toHaveCount(0);
    await expectQuick(page.getByTestId("home-directory-terminal")).toHaveCount(0);
    await expectQuick(page.getByTestId("home-directory-chat")).toHaveCount(0);
    await expectQuick(page.getByRole("button", { name: /collapse sidebar|收起侧栏/i })).toHaveCount(0);
    await expectQuick(page.getByTestId("ai-engineer-tool")).toHaveCount(0);
    await expectQuick(page.getByTestId("local-fs-tool")).toHaveCount(0);
  });

  test("Local Desktop is pinned first and opens without creating an SSH session", async ({ page }) => {
    const api = await twE2e(page);
    const before = await api.getCreateSshCallCount();
    await expectQuick(page.getByTestId("local-desktop-tab")).toBeVisible();
    await expectQuick(page.getByTestId("local-desktop-tab").locator(".tab-close")).toHaveCount(0);
    await page.getByTestId("local-desktop-tab").click();
    await expectQuick(page.getByTestId("host-desktop-panel")).toBeVisible();
    await expectQuick(page.getByTestId("home-terminal-tab")).toHaveCount(0);
    await page.getByTestId("home-directory-button").click();
    await expectQuick(page.getByTestId("home-host-directory")).toBeVisible();
    expect(await api.getCreateSshCallCount()).toBe(before);
  });

  test("plus opens the SSH host form instead of creating a Terminal tab", async ({ page }) => {
    const api = await twE2e(page);
    await api.resetMocks();
    await expectQuick(page.getByTestId("home-terminal-tab")).toHaveCount(0);
    await page.getByTestId("chrome-new-session").click();
    await expectQuick(page.locator(".connection-form")).toBeVisible();
    await expectQuick(page.getByTestId("home-terminal-tab")).toHaveCount(0);
  });

  test("SSH Desktop has no left Hosts list or sidebar collapse control", async ({ page }) => {
    const api = await twE2e(page);
    await api.openSshTab();
    await page.getByTestId("local-fs-tool").click();
    await expectQuick(page.getByTestId("host-desktop-panel")).toBeVisible();
    await expectQuick(page.locator(".sidebar-shell")).toBeHidden();
    await expectQuick(page.getByTestId("sidebar-view-hosts")).toHaveCount(0);
    await expectQuick(page.locator(".chrome-sidebar-toggle")).toHaveCount(0);
    await expectQuick(page.getByTestId("home-terminal-tab")).toHaveCount(0);
  });

  test("opens a saved SSH host in its Desktop workspace", async ({ page }) => {
    const api = await twE2e(page);
    await expectQuick(page.getByTestId("home-host-card-e2e-conn-1")).toBeVisible();
    const before = await api.getCreateSshCallCount();
    await page.getByTestId("home-host-card-e2e-conn-1").click();
    await expectQuick(page.getByTestId("host-desktop-panel")).toBeVisible();
    await expectQuick(page.getByTestId("home-host-directory")).toHaveCount(0);
    await expectQuick(page.locator('[data-tab-kind="ssh"]').filter({ hasText: "E2E Test Host" })).toBeVisible();
    expect(await api.getCreateSshCallCount()).toBe(before + 1);
  });

  test("dragging a saved host card assigns it to a group", async ({ page }) => {
    const api = await twE2e(page);
    await expectQuick(page.getByTestId("home-host-directory")).toBeVisible();
    const createCount = await api.getCreateSshCallCount();
    const boxes = await page.evaluate(() => {
      const source = document.querySelector<HTMLElement>('[data-testid="home-host-card-e2e-conn-1"]');
      const target = document.querySelector<HTMLElement>('[data-testid="home-host-group-target-group"] .home-host-section-empty');
      return {
        source: source?.getBoundingClientRect().toJSON() ?? null,
        target: target?.getBoundingClientRect().toJSON() ?? null,
      };
    });
    const { source: sourceBox, target: targetBox } = boxes;
    expect(sourceBox?.width ?? 0).toBeGreaterThan(0);
    expect(targetBox?.width ?? 0).toBeGreaterThan(0);
    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 8 });
    await page.mouse.up();

    const targetGroup = page.getByTestId("home-host-group-target-group");
    await expectQuick(targetGroup.getByTestId("home-host-card-e2e-conn-1")).toBeVisible();
    await expectQuick(targetGroup.locator(".home-host-section-header span")).toHaveText("1 hosts");
    await expectQuick(page.getByTestId("home-host-group-__ungrouped__").getByTestId("home-host-card-e2e-conn-1")).toHaveCount(0);
    expect(await api.getCreateSshCallCount()).toBe(createCount);
  });

  test("Home supports group and host management", async ({ page }) => {
    await expectQuick(page.getByTestId("home-host-edit-e2e-conn-1")).toBeVisible();
    await expectQuick(page.getByTestId("home-host-delete-e2e-conn-1")).toBeVisible();

    await page.getByTestId("home-host-edit-e2e-conn-1").click();
    await expectQuick(page.locator(".connection-form")).toBeVisible();
    await page.locator(".connection-form input").first().fill("Updated host");
    await page.getByRole("button", { name: /save|保存/i }).click();
    await expectQuick(page.getByTestId("home-host-card-e2e-conn-1").getByText("Updated host")).toBeVisible();

    await page.getByTestId("home-add-group").click();
    const groupByName = page.locator(".home-host-section").filter({ has: page.getByRole("heading", { name: "Group", exact: true }) });
    await expectQuick(groupByName).toBeVisible();
    const boxes = await groupByName.evaluate((target) => {
      const source = document.querySelector<HTMLElement>('[data-testid="home-host-card-e2e-conn-1"]');
      return { source: source?.getBoundingClientRect().toJSON(), target: target.getBoundingClientRect().toJSON(), id: target.getAttribute("data-entity-group-id") };
    });
    const customGroup = page.getByTestId(`home-host-group-${boxes.id}`);
    const deleteGroup = customGroup.locator(`[data-testid="home-host-delete-group-${boxes.id}"]`);
    await customGroup.getByRole("button", { name: /edit Group/i }).click();
    await customGroup.getByRole("textbox", { name: "Group name" }).fill("QA group");
    await customGroup.getByRole("button", { name: "Save" }).click();
    await expectQuick(customGroup.getByRole("heading", { name: "QA group" })).toBeVisible();
    await page.mouse.move(boxes.source!.x + 30, boxes.source!.y + 30);
    await page.mouse.down();
    await page.mouse.move(boxes.target!.x + boxes.target!.width - 10, boxes.target!.y + boxes.target!.height - 10, { steps: 8 });
    await page.mouse.up();
    await expectQuick(customGroup.getByTestId("home-host-card-e2e-conn-1")).toBeVisible();

    await deleteGroup.click();
    await expectQuick(customGroup).toHaveCount(0);
    await expectQuick(page.getByTestId("home-host-group-__ungrouped__").getByTestId("home-host-card-e2e-conn-1")).toBeVisible();

    await page.getByTestId("home-host-delete-e2e-conn-1").click();
    await expectQuick(page.getByTestId("home-host-card-e2e-conn-1")).toHaveCount(0);
  });

  test("active SSH tabs have no folder navigation or directory shortcut controls", async ({ page }) => {
    await page.getByTestId("home-host-card-e2e-conn-1").click();
    const activeTab = page
      .locator('.tab[data-tab-kind="ssh"].active')
      .filter({ hasText: "E2E Test Host" });
    await expectQuick(activeTab).toBeVisible();
    await expectQuick(activeTab.locator(".tab-home, .tab-shortcut-wrap, .tab-shortcut-icons")).toHaveCount(0);
    await expectQuick(page.locator(".tab-context-menu")).toHaveCount(0);
    await expectQuick(page.getByTestId("home-directory-button")).toBeVisible();
  });

  test("switches between Home, pinned Local Desktop, and SSH Desktop", async ({ page }) => {
    await page.getByTestId("local-desktop-tab").click();
    await expectQuick(page.getByRole("heading", { name: "This computer" })).toBeVisible();
    await page.getByTestId("home-directory-button").click();
    await expectQuick(page.getByTestId("home-host-directory")).toBeVisible();
    await page.getByTestId("home-host-card-e2e-conn-1").click();
    await expectQuick(page.getByTestId("host-desktop-panel")).toBeVisible();
    const workspaceTabs = await page.locator(".tab-bar > .tab").evaluateAll((items) =>
      items.map((item) => item.getAttribute("data-testid") ?? item.getAttribute("data-tab-kind")),
    );
    expect(workspaceTabs[0]).toBe("local-desktop-tab");
    expect(workspaceTabs.indexOf("local-desktop-tab")).toBeLessThan(workspaceTabs.indexOf("ssh"));
    await page.getByTestId("local-desktop-tab").click();
    await expectQuick(page.getByRole("heading", { name: "This computer" })).toBeVisible();
    await page.getByTestId("home-directory-button").click();
    await expectQuick(page.getByTestId("home-host-directory")).toBeVisible();
  });
});
