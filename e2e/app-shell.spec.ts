import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("App shell & welcome", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openHome();
  });

  test("shows workspace welcome with feature cards", async ({ page }) => {
    await expect(page.getByTestId("workspace-welcome")).toBeVisible();
    await expect(page.getByTestId("workspace-welcome")).toContainText(/TerminalWisely/i);
  });

  test("switches locale en ↔ zh-CN", async ({ page }) => {
    await page.getByRole("button", { name: /Language|语言/i }).click();
    await page.getByRole("menuitemradio", { name: /中文/i }).click();
    await expect(page.getByTestId("workspace-welcome")).toContainText(/TerminalWisely|终端/);
    await page.getByRole("button", { name: /Language|语言/i }).click();
    await page.getByRole("menuitemradio", { name: /English/i }).click();
  });

  test("sidebar hosts and k8s view toggles", async ({ page }) => {
    const api = await twE2e(page);
    await api.openK8sWorkbench();
    await api.openHome();
    await expect(page.getByTestId("workspace-welcome")).toBeVisible();
    await page.getByRole("tab", { name: /Hosts|主机/i }).click();
    await expect(page.getByRole("tab", { name: /Hosts|主机/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.getByRole("tab", { name: /Kubernetes/i }).click();
    await expect(page.getByRole("tab", { name: /Kubernetes/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
