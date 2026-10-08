import { expect, test } from "@playwright/test";
import { gotoApp } from "./tw-e2e";

test.describe("Database workbench", () => {
  test("direct connection, query, approval, and status pages", async ({ page }) => {
    await gotoApp(page);
    await page.getByTestId("sidebar-view-db").click();
    await expect(page.getByTestId("db-workbench")).toBeVisible();
    await expect(page.getByTestId("sidebar-view-db").locator("svg")).toBeVisible();
    await page.getByTestId("db-connection-new").click();
    await expect(page.getByTestId("db-connection-form")).toBeVisible();
    const hostBox = await page.getByTestId("db-connection-host").boundingBox();
    const portBox = await page.getByTestId("db-connection-port").boundingBox();
    expect(hostBox && portBox && portBox.x > hostBox.x + hostBox.width / 2).toBeTruthy();
    expect(hostBox && portBox && Math.abs(hostBox.y - portBox.y) < 8).toBeTruthy();
    await expect(page.getByTestId("db-connection-tunnel")).not.toBeChecked();
    await expect(page.getByTestId("db-readonly-hint")).toBeVisible();

    await page.getByTestId("db-connection-name").fill("probe-only");
    await page.getByTestId("db-connection-test").click();
    await expect(page.getByTestId("db-test-ok")).toBeVisible();
    await expect(page.getByTestId("db-nav-empty")).toBeVisible();

    await page.getByTestId("db-connection-name").fill("app");
    await page.getByTestId("db-connection-host").fill("db.internal");
    await page.getByTestId("db-connection-database").fill("app");
    await page.getByTestId("db-connection-user").fill("app");
    await page.getByTestId("db-connection-password").fill("s3cret-value");
    await page.getByTestId("db-connection-save").click();
    await expect(page.getByTestId("db-connection-list")).toContainText("app");
    await expect(page.getByTestId("db-connection-list")).not.toContainText("s3cret-value");
    const connectionRow = page.locator(".db-connection-row").first();
    await connectionRow.hover();
    await expect(connectionRow.locator(".saved-item-action")).toHaveCount(2);
    await expect(connectionRow.locator(".saved-item-delete")).toBeVisible();
    await expect(page.getByTestId("db-connection-form")).toHaveCount(0);

    await page.getByTestId("db-connection-new").click();
    await page.getByTestId("db-connection-tunnel").check();
    await page.getByTestId("db-connection-name").fill("tunneled");
    await page.getByTestId("db-connection-host").fill("db.internal");
    await page.getByTestId("db-connection-database").fill("app");
    await page.getByTestId("db-connection-user").fill("app");
    await page.getByTestId("db-connection-password").fill("s3cret-value");
    await page.getByTestId("db-connection-save").click();
    await expect(page.getByTestId("db-error")).toBeVisible();
    await expect(page.getByTestId("db-connection-list")).not.toContainText("tunneled");
    await page.getByTestId("db-connection-close").click();

    await page.getByTestId("db-connection-new").click();
    await expect(page.getByTestId("db-connection-engine").locator(".db-engine-icon--postgres")).toBeVisible();
    await page.getByTestId("db-connection-engine").click();
    const engineMenu = page.getByTestId("db-connection-engine-menu");
    await expect(engineMenu.locator(".db-engine-icon")).toHaveCount(8);
    await page.getByTestId("db-connection-engine-mysql").click();
    await expect(page.getByTestId("db-connection-port")).toHaveValue("3306");
    await page.getByTestId("db-connection-name").fill("shop");
    await page.getByTestId("db-connection-host").fill("db.internal");
    await page.getByTestId("db-connection-database").fill("shop");
    await page.getByTestId("db-connection-user").fill("shop");
    await page.getByTestId("db-connection-password").fill("s3cret-value");
    await page.getByTestId("db-connection-save").click();
    await expect(page.getByTestId("db-connection-list")).toContainText("mysql");
    await expect(page.getByTestId("db-connect-loading")).toHaveCount(0);
    await page.locator(".db-connection-row").filter({ hasText: "shop" }).locator(".k8s-tree-group-label").click();
    const postgresIcon = await page.locator(".db-engine-icon--postgres").first().innerHTML();
    const mysqlIcon = await page.locator(".db-engine-icon--mysql").first().innerHTML();
    expect(postgresIcon).not.toEqual(mysqlIcon);

    await expect(page.getByTestId("db-schema")).toContainText("orders");
    const editor = page.getByTestId("db-sql");
    await editor.fill("SELECT 9\nSELECT 8");
    await editor.evaluate((node) => {
      const field = node as HTMLTextAreaElement;
      field.focus();
      field.setSelectionRange(0, 8);
      field.dispatchEvent(new Event("select", { bubbles: true }));
    });
    await page.getByTestId("db-run").click();
    await expect(page.getByTestId("db-results")).toContainText("SELECT 9");
    await expect(page.getByTestId("db-results")).not.toContainText("SELECT 8");

    await editor.fill("SELECT empty");
    await page.getByTestId("db-run").click();
    await expect(page.getByTestId("db-empty")).toBeVisible();
    await expect(page.getByTestId("db-results")).toHaveCount(0);

    await editor.fill("BROKEN");
    await page.getByTestId("db-run").click();
    await expect(page.getByTestId("db-error")).toContainText(/password authentication failed/i);
    await expect(page.getByTestId("db-results")).toHaveCount(0);
    await expect(page.getByTestId("db-empty")).toHaveCount(0);

    await editor.fill("UPDATE t SET a = 1");
    await page.getByTestId("db-run").click();
    const card = page.getByTestId("ai-engineer-approval-card");
    await expect(card).toContainText("UPDATE t SET a = 1");
    await expect(card).toContainText("shop");
    await expect(card).not.toContainText("db-2");
    await page.getByTestId("ai-engineer-approval-reject").click();
    await expect(card).toHaveCount(0);
    await editor.fill("UPDATE t SET a = 2");
    await page.getByTestId("db-run").click();
    await expect(card).toContainText("UPDATE t SET a = 2");

    await page.getByTestId("db-status-sessions").click();
    await expect(page.getByTestId("db-results")).toContainText("sessions");
    await page.getByTestId("db-status-locks").click();
    await expect(page.getByTestId("db-results")).toContainText("locks");
    await page.getByTestId("db-status-sizes").click();
    await expect(page.getByTestId("db-results")).toContainText("sizes");

    await expect(page.getByTestId("ai-engineer-tool")).toBeEnabled();
    await expect(page.getByTestId("ai-engineer-tool")).toHaveAttribute(
      "aria-label",
      /Database|数据库/,
    );
    await page.getByTestId("ai-engineer-tool").click();
    await expect(page.getByTestId("ai-engineer-panel")).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("sidebar-view-hosts").click();
    await expect(page.getByTestId("db-workbench")).toHaveCount(0);
    await page.getByTestId("sidebar-view-k8s").click();
    await expect(page.getByTestId("db-workbench")).toHaveCount(0);
    await page.getByTestId("sidebar-view-db").click();
    await expect(page.getByTestId("db-workbench")).toBeVisible();
    await expect(page.getByTestId("db-connection-list")).toContainText("shop");
    await expect(page.getByTestId("db-connect-loading")).toHaveCount(0);
    await expect(page.getByTestId("db-schema")).toHaveCount(0);
  });

  test("opens a table, sorts, filters, and shows export", async ({ page }) => {
    await gotoApp(page);
    await page.getByTestId("sidebar-view-db").click();
    await page.getByTestId("db-connection-new").click();
    await page.getByTestId("db-connection-name").fill("app");
    await page.getByTestId("db-connection-host").fill("db.internal");
    await page.getByTestId("db-connection-database").fill("app");
    await page.getByTestId("db-connection-user").fill("app");
    await page.getByTestId("db-connection-password").fill("s3cret-value");
    await page.getByTestId("db-connection-save").click();
    await expect(page.getByTestId("db-connect-loading")).toHaveCount(0);
    await page.locator(".db-connection-row").filter({ hasText: "app" }).locator(".k8s-tree-group-label").click();
    await expect(page.getByTestId("db-schema")).toContainText("orders");
    const kindPad = await page
      .locator(".db-tree-under-schema")
      .first()
      .evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingLeft));
    const objectPad = await page
      .locator(".db-tree-object")
      .first()
      .evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingLeft));
    expect(objectPad).toBeGreaterThan(kindPad);
    await page.getByRole("button", { name: "orders" }).dblclick();
    await expect(page.getByTestId("db-context")).toContainText("→");
    await expect(page.getByTestId("db-context")).toContainText("orders");
    const editor = page.getByTestId("db-sql");
    await expect(editor).toHaveValue(/LIMIT 100/);
    await expect(editor).toHaveValue(/OFFSET 0/);
    await expect(page.getByTestId("db-export-page")).toBeVisible();
    await page.getByTestId("db-export-page").click();
    await expect(page.getByTestId("db-export-note")).toContainText("current page");
    await page.getByTestId("db-query-name").fill("daily");
    await page.getByTestId("db-save-query").click();
    await expect(page.getByTestId("db-saved-queries")).toContainText("daily");
    await page.getByTestId("db-delete-query").click();
    await expect(page.getByTestId("db-saved-queries")).not.toContainText("daily");
    await page.getByTestId("db-import-file").setInputFiles({
      name: "orders.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("id\n1\nbad,extra\n"),
    });
    await expect(page.getByTestId("db-import-preview")).toBeVisible();
    await expect(page.getByTestId("db-import-rows")).toContainText("1");
    await expect(page.getByTestId("db-import-errors")).toBeVisible();
    await expect(page.getByTestId("db-import-map")).toBeVisible();
    await page.getByTestId("db-import-preview").getByRole("button", { name: "Cancel" }).click();
    await page.getByTestId("db-sort-ok").click();
    await expect(editor).toHaveValue(/ORDER BY/);
    await page.getByTestId("db-grid-filter").fill("abc");
    await page.getByTestId("db-grid-filter").press("Enter");
    await expect(editor).toHaveValue(/LIKE/);
  });

  test("keeps a saved connection collapsed when the server closes it", async ({ page }) => {
    await gotoApp(page);
    await page.getByTestId("sidebar-view-db").click();
    await page.getByTestId("db-connection-new").click();
    await page.getByTestId("db-connection-name").fill("offline");
    await page.getByTestId("db-connection-host").fill("closed.example");
    await page.getByTestId("db-connection-database").fill("app");
    await page.getByTestId("db-connection-user").fill("app");
    await page.getByTestId("db-connection-password").fill("s3cret-value");
    await page.getByTestId("db-connection-save").click();
    await expect(page.getByTestId("db-connection-list")).toContainText("offline");
    await expect(page.getByTestId("db-connect-loading")).toHaveCount(0);
    await page.locator(".db-connection-row").filter({ hasText: "offline" }).locator(".k8s-tree-group-label").click();
    await expect(page.getByTestId("db-connect-loading")).toBeVisible();
    await expect(page.getByTestId("db-schema")).toHaveCount(0);
    await expect(page.getByTestId("db-connect-hint")).toHaveText("Connection failed");
    await expect(page.getByTestId("db-connect-hint")).toHaveAttribute("title", /connection closed/);
    await expect(page.getByTestId("db-connect-loading")).toHaveCount(0);
    await expect(page.getByTestId("db-error")).toHaveCount(0);
  });
});
