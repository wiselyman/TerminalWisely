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
    await page.getByTestId("locale-switcher-trigger").click();
    await expect(page.getByTestId("locale-switcher-menu")).toBeVisible();
    await page.getByTestId("locale-option-zh-CN").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByTestId("workspace-welcome")).toContainText(/自然语言|快速开始/);

    await page.getByTestId("locale-switcher-trigger").click();
    await expect(page.getByTestId("locale-switcher-menu")).toBeVisible();
    await page.getByTestId("locale-option-en").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("workspace-welcome")).toContainText(
      /plain language|Quick start/i,
    );
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
