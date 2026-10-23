import { expect, test } from "@playwright/test";
import { gotoApp } from "./tw-e2e";

test.describe("Database workbench", () => {
  test("direct connection, query, approval, and status pages", async ({ page }) => {
    await gotoApp(page);
    await page.getByTestId("sidebar-view-db").click();
    // Database is its own space; its directory replaces the Home terminal surface.
    await expect(page.getByTestId("home-local-chat")).toHaveCount(0);
    await expect(page.locator(".sidebar-shell")).toBeVisible();
    await expect(page.locator('[data-tab-role="home"]')).toHaveCount(0);
    await expect(page.getByTestId("chrome-new-session")).toBeVisible();
    await expect(page.getByTestId("db-connection-new")).toBeVisible();
    await expect(page.getByTestId("sidebar-view-db").locator("svg")).toBeVisible();
    await expect(page.getByTestId("db-nav-empty")).toHaveCount(0);
    await expect(page.getByTestId("entity-group-__ungrouped__")).toBeVisible();
    await expect(page.getByTestId("entity-add-group-db")).toBeVisible();
    await expect(page.getByText(/还没有连接|No connections yet/)).toHaveCount(0);
    await page.getByTestId("entity-add-group-db").click();
    await expect(page.locator(".entity-group-title").filter({ hasText: /^(Group|分组)$/ })).toBeVisible();
    await page.getByTestId("chrome-new-session").click();
    await expect(page.getByTestId("db-workbench")).toBeVisible();
    await expect(page.getByTestId("db-connection-form")).toBeVisible();
    const hostBox = await page.getByTestId("db-connection-host").boundingBox();
    const portBox = await page.getByTestId("db-connection-port").boundingBox();
    expect(hostBox && portBox && portBox.x > hostBox.x + hostBox.width / 2).toBeTruthy();
    expect(hostBox && portBox && Math.abs(hostBox.y - portBox.y) < 8).toBeTruthy();
    await expect(page.getByTestId("db-connection-tunnel")).not.toBeChecked();
    await expect(page.getByTestId("db-sql")).toHaveCount(0);
    await expect(page.getByTestId("db-query-tab")).toHaveCount(0);

    await page.getByTestId("db-connection-name").fill("probe-only");
    await page.getByTestId("db-connection-test").click();
    await expect(page.getByTestId("db-test-ok")).toBeVisible();
    await expect(page.getByTestId("db-test-ok")).toHaveAttribute("title", /Connection succeeded/);
    await expect(page.getByTestId("db-test-ok")).not.toHaveText(/Connection succeeded/);
    await expect(page.getByTestId("db-form-status")).toBeVisible();

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
    await expect(page.getByTestId("db-form-error")).toBeVisible();
    await expect(page.getByTestId("db-error")).toHaveCount(0);
    await expect(page.getByTestId("db-connection-list")).not.toContainText("tunneled");
    await page.getByTestId("db-connection-close").click();

    await page.getByTestId("db-connection-new").click();
    await expect(page.getByTestId("db-connection-engine").locator(".db-engine-icon--postgres")).toBeVisible();
    // Regression: ISSUE-001 — engine button accessible name omitted the selected engine
    // Found by /qa on 2026-10-08
    // Report: .gstack/qa-reports/run-20261008T072354Z/qa-report-127.0.0.1-2026-10-08.md
    await expect(page.getByTestId("db-connection-engine")).toHaveAccessibleName(/postgres/);
    await page.getByTestId("db-connection-engine").click();
    const engineMenu = page.getByTestId("db-connection-engine-menu");
    await expect(engineMenu.locator(".db-engine-icon")).toHaveCount(8);
    await page.getByTestId("db-connection-engine-mysql").click();
    await expect(page.getByTestId("db-connection-engine")).toHaveAccessibleName(/mysql/);
    await expect(page.getByTestId("db-connection-port")).toHaveValue("3306");
    await page.getByTestId("db-connection-name").fill("shop");
    await page.getByTestId("db-connection-host").fill("db.internal");
    await page.getByTestId("db-connection-database").fill("shop");
    await page.getByTestId("db-connection-user").fill("shop");
    await page.getByTestId("db-connection-password").fill("s3cret-value");
    await page.getByTestId("db-connection-save").click();
    // Engine is shown by the brand icon only — do not duplicate "mysql" as text.
    await expect(page.getByTestId("db-connection-list")).toContainText("shop");
    await expect(page.getByTestId("db-connection-list")).not.toContainText("mysql");
    const shopRow = page.locator(".db-connection-row").filter({ hasText: "shop" });
    await expect(shopRow.locator(".db-engine-icon--mysql")).toBeVisible();
    await expect(page.getByTestId("db-connect-loading")).toHaveCount(0);
    await shopRow.locator(".saved-item-main").click();
    const postgresIcon = await page.locator(".db-engine-icon--postgres").first().innerHTML();
    const mysqlIcon = await page.locator(".db-engine-icon--mysql").first().innerHTML();
    expect(postgresIcon).not.toEqual(mysqlIcon);
    await expect(page.getByTestId("db-connect-loading")).toHaveCount(0);
    // Navicat: live connection uses brand color; disconnected stay muted
    await expect(shopRow.locator(".db-engine-icon--muted")).toHaveCount(0);
    await expect(shopRow.locator(".db-engine-icon--mysql")).toBeVisible();

    await expect(page.getByTestId("db-schema")).toContainText("shop");
    // Connection Object Pane lists databases (Navicat), not a stale schema table dump
    await expect(page.getByTestId("db-object-list")).toContainText("shop");
    await expect(page.getByTestId("db-new-query")).toHaveClass(/db-object-new-query/);
    await expect(page.locator(".db-object-table")).toBeVisible();
    // Homogeneous DB list: no empty Schema column or repeated "database" Kind labels
    await expect(page.locator(".db-object-table thead")).not.toContainText(/Schema|架构/);
    await expect(page.locator(".db-object-table tbody")).not.toContainText(/数据库|Database/);
    // AI binds to the connection as soon as it is selected — no query tab required.
    await expect(page.getByTestId("ai-engineer-tool")).toBeEnabled();
    // Connecting the service adds its chrome tab while the pane is still the database list.
    await expect(page.getByTestId("db-workspace-tab")).toContainText("shop");
    await expect(
      page.getByTestId("db-workspace-tab").locator(".db-engine-icon--mysql"),
    ).toBeVisible();
    const selectedOutline = await page.locator(".db-connection-row.selected").evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(selectedOutline).toBe("none");
    // Navicat: path is tree + chrome tab — no redundant breadcrumb bar
    await expect(page.getByTestId("db-context")).toHaveCount(0);
    await expect(page.getByTestId("db-tree-object-orders")).toHaveCount(0);
    await page.getByTestId("db-tree-database-shop").click();
    // Chrome DB tab stays the service that connected, not a second tab for the catalog database.
    // MySQL: database click → table object list
    await expect(page.getByTestId("db-object-list")).toContainText("orders");
    await expect(page.getByTestId("db-context")).toHaveCount(0);
    await expect(page.getByTestId("db-tree-kind-table")).toBeVisible();
    await expect(page.getByTestId("db-tree-object-orders")).toHaveCount(0);
    await page.getByTestId("db-tree-kind-table").click();
    await expect(page.getByTestId("db-tree-object-orders")).toBeVisible();
    await expect(page.getByTestId("db-object-list")).toBeVisible();
    await expect(page.getByTestId("db-object-list")).toContainText("orders");
    await expect(page.getByTestId("db-query-tab")).toHaveCount(0);
    await expect(page.getByTestId("db-sql")).toHaveCount(0);
    // Object browse has no orphan "+" tab strip — new query is a toolbar action.
    await expect(page.getByTestId("db-query-tabs")).toHaveCount(0);
    await page.getByTestId("db-new-query").click();
    await expect(page.getByTestId("db-query-tab")).toHaveCount(1);
    await expect(page.getByTestId("db-query-tab")).toContainText("SQL 1");
    await expect(page.getByTestId("db-query-tab").locator(".db-kind-icon--query")).toBeVisible();
    await expect(page.getByTestId("db-readonly-hint")).toBeVisible();
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
    // Result chrome: data only — no Summary / Explain tabs while on grid
    await expect(page.getByTestId("db-result-summary")).toHaveCount(0);
    await expect(page.getByTestId("db-result-plan-tab")).toHaveCount(0);
    await expect(page.getByTestId("db-show-data")).toHaveCount(0);

    // Run / Cancel / Explain share one toolbar type size
    const actionSizes = await page.locator(".db-status-actions > button").evaluateAll((nodes) =>
      nodes.slice(0, 3).map((node) => getComputedStyle(node).fontSize),
    );
    expect(actionSizes).toHaveLength(3);
    expect(new Set(actionSizes).size).toBe(1);

    // Tools is an icon button (accessible name still Tools / 工具)
    const tools = page.getByTestId("db-tools-menu");
    await expect(tools).toHaveAttribute("aria-label", /Tools|工具/);
    await expect(tools.locator("svg")).toBeVisible();
    await expect(tools).not.toHaveText(/Tools|工具/);

    await page.getByTestId("db-explain").click();
    await expect(page.getByTestId("db-plan")).toBeVisible();
    // Explicit path back to the table / result grid (not only re-run)
    await expect(page.getByTestId("db-show-data")).toBeVisible();
    await page.getByTestId("db-show-data").click();
    await expect(page.getByTestId("db-plan")).toHaveCount(0);
    await expect(page.getByTestId("db-results")).toContainText("SELECT 9");
    await expect(page.getByTestId("db-show-data")).toHaveCount(0);

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

    // Ops pages live under Tools menu (Navicat-style chrome)
    await expect(page.getByTestId("db-tools-menu")).toBeVisible();
    await page.getByTestId("db-tools-menu").click();
    await page.getByTestId("db-status-sessions").click();
    await expect(page.getByTestId("db-results")).toContainText("sessions");
    await page.getByTestId("db-tools-menu").click();
    await page.getByTestId("db-status-locks").click();
    await expect(page.getByTestId("db-results")).toContainText("locks");
    await page.getByTestId("db-tools-menu").click();
    await page.getByTestId("db-status-sizes").click();
    await expect(page.getByTestId("db-results")).toContainText("sizes");

    // Open AI lives in the titlebar tool strip — not duplicated in the SQL toolbar
    await expect(page.getByTestId("db-open-ai")).toHaveCount(0);
    await expect(page.getByTestId("ai-engineer-tool")).toBeEnabled();
    await expect(page.getByTestId("ai-engineer-tool")).toHaveAttribute(
      "aria-label",
      /Database|数据库/,
    );
    await page.getByTestId("ai-engineer-tool").click();
    await expect(page.getByTestId("ai-engineer-panel")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("sidebar-view-home").click();
    await expect(page.getByTestId("home-local-chat")).toBeVisible();
    await expect(page.locator(".ai-engineer-panel:not(.is-home-workspace):not(.ai-engineer-panel-parked)")).toHaveCount(0);
    await page.getByTestId("db-workspace-tab").click();
    await expect(page.getByTestId("home-local-chat")).toHaveCount(0);
    await expect(page.locator(".ai-engineer-panel:not(.ai-engineer-panel-parked)")).toBeVisible();

    await page.getByTestId("sidebar-view-hosts").click();
    await expect(page.getByTestId("db-workbench")).toHaveCount(0);
    await page.getByTestId("sidebar-view-k8s").click();
    await expect(page.getByTestId("db-workbench")).toHaveCount(0);
    await page.getByTestId("sidebar-view-db").click();
    // Returning to DB restores the sidebar tree; workspace may stay on Home.
    await expect(page.getByTestId("db-connection-list")).toContainText("shop");
    await expect(page.getByTestId("db-connect-loading")).toHaveCount(0);
    await expect(page.getByTestId("db-schema")).toHaveCount(0);

    // Home hides the database directory with the rest of the side panel; DB state survives.
    await page.getByTestId("sidebar-view-home").click();
    await expect(page.getByTestId("home-local-chat")).toBeVisible();
    await expect(page.locator(".sidebar-shell")).toBeHidden();
    await expect(page.locator(".ai-engineer-panel:not(.is-home-workspace):not(.ai-engineer-panel-parked)")).toHaveCount(0);
    await page.getByTestId("sidebar-view-db").click();
    await expect(page.getByTestId("db-connection-list")).toContainText("shop");
    await expect(page.getByTestId("db-connection-list")).not.toContainText("postgres");
    await expect(page.locator(".db-connection-row.saved-item").first()).toBeVisible();
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
    await page.locator(".db-connection-row").filter({ hasText: "app" }).locator(".saved-item-main").click();
    await expect(page.getByTestId("db-tree-database-app")).toBeVisible();
    await expect(page.getByTestId("db-tree-object-orders")).toHaveCount(0);
    await page.getByTestId("db-tree-database-app").click();
    await expect(page.getByTestId("db-workspace-tab")).toContainText("app");
    await expect(page.getByTestId("db-tree-database-app")).toContainText(/\(\d+\)/);
    await expect(page.getByTestId("db-tree-schema-public")).toBeVisible();
    // Postgres: database click → schema list, not every table across schemas
    await expect(page.getByTestId("db-object-list")).toContainText("public");
    await expect(page.getByTestId("db-object-list")).not.toContainText("orders");
    await expect(page.getByTestId("db-object-summary")).toContainText(/schema/i);
    await expect(page.getByTestId("db-context")).toHaveCount(0);
    await expect(page.getByTestId("db-tree-object-orders")).toHaveCount(0);
    await page.getByTestId("db-tree-schema-public").click();
    // Schema click → default Tables only (not mixed functions)
    await expect(page.getByTestId("db-object-list")).toContainText("orders");
    await expect(page.getByTestId("db-object-list")).not.toContainText("touch_order");
    await expect(page.getByTestId("db-object-summary")).toContainText(/table/i);
    await expect(page.getByTestId("db-context")).toHaveCount(0);
    await expect(page.getByTestId("db-tree-kind-table")).toBeVisible();
    await expect(page.getByTestId("db-tree-kind-table")).toContainText(/\(\d+\)/);
    await expect(page.getByTestId("db-tree-object-orders")).toHaveCount(0);
    await page.getByTestId("db-tree-kind-table").click();
    await expect(page.getByTestId("db-schema")).toContainText("orders");
    await expect(page.getByTestId("db-object-summary")).toContainText(/table/i);
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
    // Opening a table creates an object tab parallel to SQL tabs
    await expect(page.getByTestId("db-object-tab")).toContainText("orders");
    await expect(page.getByTestId("db-object-tab-database")).toHaveText("app");
    await expect(page.getByTestId("db-object-tab-schema")).toHaveText("public");
    await expect(page.getByTestId("db-object-tab").locator(".db-kind-icon--table")).toBeVisible();
    await expect(page.getByTestId("db-query-tab")).toHaveCount(0);
    // Object-table Run must keep browse chrome (funnel + insert), not a full-width 筛选 input
    await expect(page.getByTestId("db-filter-toggle")).toBeVisible();
    await expect(page.getByTestId("db-row-insert")).toBeVisible();
    await expect(page.getByTestId("db-grid-filter")).toHaveCount(0);
    // time(6) columns open a digital Navicat-style time picker (portaled above the grid)
    await page.locator(".db-data-grid tbody tr").first().locator("td").nth(1).click();
    const picker = page.getByTestId("db-cell-input-time");
    await expect(picker).toBeVisible();
    await expect(page.getByTestId("db-cell-picker-hour")).toBeVisible();
    await expect(page.getByTestId("db-cell-picker-clock-face")).toHaveCount(0);
    const box = await picker.boundingBox();
    expect(box && box.width).toBeGreaterThan(120);
    await page.getByTestId("db-cell-picker-cancel").click();
    await page.getByTestId("db-run").click();
    await expect(page.getByTestId("db-filter-toggle")).toBeVisible();
    await expect(page.getByTestId("db-row-insert")).toBeVisible();
    await expect(page.getByTestId("db-grid-filter")).toHaveCount(0);
    await expect(page.getByTestId("db-restore-table")).toHaveCount(0);
    const openCell = page.locator(".db-data-grid tbody tr").first().locator("td").nth(1);
    await expect(openCell).toHaveText("19:30:00.000000");
    await page.getByTestId("db-sql").fill("SELECT 1");
    await expect(page.getByTestId("db-restore-table")).toHaveCount(0);
    await expect(openCell).toHaveText("19:30:00.000000");
    await expect(page.getByTestId("db-filter-toggle")).toBeVisible();
    await page.getByTestId("db-run").click();
    await expect(page.getByTestId("db-restore-table")).toBeVisible();
    await expect(page.getByTestId("db-restore-table")).toHaveAccessibleName(/Default view|默认视图/);
    await expect(page.getByTestId("db-restore-table").locator("svg")).toBeVisible();
    await expect(page.getByTestId("db-restore-table")).not.toHaveText(/Default view|默认视图/);
    await page.getByTestId("db-restore-table").click();
    await expect(page.getByTestId("db-sql")).toHaveValue(/LIMIT 100/);
    await expect(page.getByTestId("db-restore-table")).toHaveCount(0);
    await page.getByTestId("db-new-query").click();
    await expect(page.getByTestId("db-query-tab")).toContainText("SQL 1");
    await expect(page.getByTestId("db-query-tab").locator(".db-kind-icon--query")).toBeVisible();
    await expect(page.getByTestId("db-object-tab")).toContainText("orders");
    await page.getByTestId("db-object-tab").click();
    await expect(page.getByTestId("db-context")).toHaveCount(0);
    const editor = page.getByTestId("db-sql");
    await expect(editor).toHaveValue(/LIMIT 100/);
    await expect(editor).toHaveValue(/OFFSET 0/);
    // Export / named query / import live under Tools — not a flat toolbar row
    await expect(page.locator(".db-status-actions > [data-testid='db-export-page']")).toHaveCount(0);
    await page.getByTestId("db-tools-menu").click();
    await expect(page.getByTestId("db-export-page")).toBeVisible();
    await page.getByTestId("db-export-page").click();
    await expect(page.getByTestId("db-export-note")).toContainText("current page");
    await page.getByTestId("db-tools-menu").click();
    await page.getByTestId("db-query-name").fill("daily");
    await page.getByTestId("db-save-query").click();
    await expect(page.getByTestId("db-saved-queries")).toContainText("daily");
    await page.getByTestId("db-delete-query").click();
    await expect(page.getByTestId("db-saved-queries")).not.toContainText("daily");
    await page.getByTestId("db-tools-menu").click();
    await page.getByTestId("db-import-file").setInputFiles({
      name: "orders.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("id\n1\nbad,extra\n"),
    });
    await expect(page.getByTestId("db-import-preview")).toBeVisible();
    await expect(page.getByTestId("db-import-rows")).toContainText("1");
    await expect(page.getByTestId("db-import-errors")).toBeVisible();
    await expect(page.getByTestId("db-import-map").first()).toBeVisible();
    await page.getByTestId("db-import-preview").getByRole("button", { name: "Cancel" }).click();
    // Navicat: structure ops are not on the data-grid nav
    await expect(page.getByTestId("db-definition")).toHaveCount(0);
    await expect(page.getByTestId("db-drop-table")).toHaveCount(0);
    await expect(page.getByTestId("db-empty-table")).toHaveCount(0);
    await expect(page.getByTestId("db-truncate-table")).toHaveCount(0);
    await expect(page.getByTestId("db-row-insert")).toHaveAttribute("aria-label", /Insert|新增/);
    await expect(page.getByTestId("db-row-insert").locator("svg")).toBeVisible();
    await page.getByTestId("db-sort-id").click();
    await expect(editor).toHaveValue(/ORDER BY/);
    await page.getByTestId("db-column-menu-id").click();
    await expect(page.getByTestId("db-column-menu")).toBeVisible();
    await page.getByTestId("db-column-menu-desc").click();
    await expect(editor).toHaveValue(/ORDER BY/i);
    await expect(editor).toHaveValue(/DESC/);
    await page.getByTestId("db-column-menu-id").click();
    await page.getByTestId("db-column-menu-clear").click();
    await expect(editor).not.toHaveValue(/ORDER BY/);
    await page.getByTestId("db-column-menu-id").click();
    await page.getByTestId("db-column-menu-filter").click();
    await expect(page.getByTestId("db-filter-sort-pane")).toBeVisible();
    const seededValue = page.locator("[data-testid^='db-filter-value-']").first();
    await expect(seededValue).toBeFocused();
    await seededValue.fill("abc");
    await page.getByTestId("db-filter-apply").click();
    await expect(editor).toHaveValue(/WHERE/);
    await expect(editor).toHaveValue(/"id"\s*=\s*'abc'|"id"\s*=\s*abc/i);
    await page.getByTestId("db-filter-toggle").click();
    await expect(page.getByTestId("db-filter-sort-pane")).toHaveCount(0);
    await page.getByTestId("db-filter-toggle").click();
    await expect(page.getByTestId("db-sort-add")).toHaveCount(0);
    await page.getByTestId("db-filter-add").click();
    await page.getByTestId("db-filter-apply").click();
    await expect(page.getByTestId("db-grid-sql")).toHaveCount(0);
    await expect(page.getByTestId("db-grid-prev")).toBeDisabled();
    await page.getByTestId("db-row-insert").click();
    await expect(page.getByTestId("db-insert-row")).toBeVisible();
    await expect(page.locator("table.db-data-grid tr[data-testid='db-insert-row']")).toBeVisible();
    await expect(page.getByTestId("db-insert-cell-0")).toBeVisible();
    await expect(page.getByTestId("db-insert-save")).toBeVisible();
    await page.getByTestId("db-insert-cancel").click();
    await expect(page.getByTestId("db-insert-row")).toHaveCount(0);
  });

  test("connection form keeps status compact when save fails after a good test", async ({ page }) => {
    await gotoApp(page);
    await page.getByTestId("sidebar-view-db").click();
    await page.getByTestId("db-connection-new").click();
    await page.getByTestId("db-connection-name").fill("bad-save");
    await page.getByTestId("db-connection-host").fill("db.internal");
    await page.getByTestId("db-connection-database").fill("app");
    await page.getByTestId("db-connection-user").fill("app");
    await page.getByTestId("db-connection-password").fill("s3cret-value");
    await page.getByTestId("db-connection-test").click();
    await expect(page.getByTestId("db-test-ok")).toBeVisible();
    await page.getByTestId("db-connection-save").click();
    await expect(page.getByTestId("db-form-error")).toBeVisible();
    await expect(page.getByTestId("db-form-error")).toHaveAttribute("title", /could not write the secret file/);
    await expect(page.getByTestId("db-form-error")).toContainText(/could not write|secret file/i);
    await expect(page.getByTestId("db-test-ok")).toHaveCount(0);
    await expect(page.getByTestId("db-error")).toHaveCount(0);
    await expect(page.getByTestId("db-connection-form")).toBeVisible();
  });

  test("engine menu maintain redis ttl and mongo json validation", async ({ page }) => {
    await gotoApp(page);
    await page.getByTestId("sidebar-view-db").click();

    await page.getByTestId("db-connection-new").click();
    await page.getByTestId("db-connection-name").fill("pg-maintain");
    await page.getByTestId("db-connection-host").fill("db.internal");
    await page.getByTestId("db-connection-database").fill("app");
    await page.getByTestId("db-connection-user").fill("app");
    await page.getByTestId("db-connection-password").fill("s3cret-value");
    await page.getByTestId("db-connection-save").click();
    await expect(page.getByTestId("db-connect-loading")).toHaveCount(0);
    await page.locator(".db-connection-row").filter({ hasText: "pg-maintain" }).locator(".saved-item-main").click();
    await page.getByTestId("db-tree-database-app").click();
    await page.getByTestId("db-tree-schema-public").click();
    await page.getByTestId("db-tree-kind-table").click();
    await expect(page.getByTestId("db-tree-object-orders")).toBeVisible();
    await page.getByTestId("db-tree-object-orders").click({ button: "right" });
    await expect(page.getByTestId("db-object-menu-maintain-vacuum")).toBeVisible();
    await page.getByTestId("db-object-menu-maintain-vacuum").click();
    await expect(page.getByTestId("ai-engineer-approval-card")).toContainText("VACUUM");
    await page.getByTestId("ai-engineer-approval-reject").click();

    await page.getByTestId("db-connection-new").click();
    await page.getByTestId("db-connection-engine").click();
    await page.getByTestId("db-connection-engine-redis").click();
    await page.getByTestId("db-connection-name").fill("redis-ttl");
    await page.getByTestId("db-connection-host").fill("db.internal");
    await page.getByTestId("db-connection-database").fill("0");
    await page.getByTestId("db-connection-password").fill("s3cret-value");
    await page.getByTestId("db-connection-save").click();
    await expect(page.getByTestId("db-connect-loading")).toHaveCount(0);
    await page.locator(".db-connection-row").filter({ hasText: "redis-ttl" }).locator(".saved-item-main").click();
    await page.getByTestId("db-tree-database-0").click();
    await page.getByTestId("db-tree-kind-key").click();
    await expect(page.getByTestId("db-tree-object-user:1")).toBeVisible();
    await page.getByTestId("db-tree-object-user:1").click({ button: "right" });
    await expect(page.getByTestId("db-object-menu-truncate")).toHaveCount(0);
    await page.getByTestId("db-object-menu-open").click();
    await expect(page.getByTestId("db-redis-type")).toContainText("string");
    await expect(page.getByTestId("db-redis-ttl")).toContainText("120");
    await page.getByTestId("db-redis-ttl-input").fill("30");
    await page.getByTestId("db-redis-expire").click();
    await expect(page.getByTestId("ai-engineer-approval-card")).toContainText("EXPIRE");
    await page.getByTestId("ai-engineer-approval-reject").click();

    await page.getByTestId("db-connection-new").click();
    await page.getByTestId("db-connection-engine").click();
    await page.getByTestId("db-connection-engine-mongodb").click();
    await page.getByTestId("db-connection-name").fill("mongo-json");
    await page.getByTestId("db-connection-host").fill("db.internal");
    await page.getByTestId("db-connection-database").fill("app");
    await page.getByTestId("db-connection-user").fill("app");
    await page.getByTestId("db-connection-password").fill("s3cret-value");
    await page.getByTestId("db-connection-save").click();
    await expect(page.getByTestId("db-connect-loading")).toHaveCount(0);
    await page.locator(".db-connection-row").filter({ hasText: "mongo-json" }).locator(".saved-item-main").click();
    await page.getByTestId("db-tree-database-app").click();
    await page.getByTestId("db-tree-kind-collection").click();
    await expect(page.getByTestId("db-tree-object-orders")).toBeVisible();
    await page.getByTestId("db-tree-object-orders").dblclick();
    await expect(page.getByTestId("db-mongo-draft")).toBeVisible();
    await page.getByTestId("db-mongo-draft").fill("{");
    await expect(page.getByTestId("db-mongo-json-error")).toBeVisible();
    await expect(page.getByTestId("db-mongo-insert")).toBeDisabled();
    await page.getByTestId("db-mongo-draft").fill('{"n":2}');
    await expect(page.getByTestId("db-mongo-json-error")).toHaveCount(0);
    await expect(page.getByTestId("db-mongo-insert")).toBeEnabled();
  });

  test("object context menu empty truncate rename without null shortcut", async ({ page }) => {
    await gotoApp(page);
    await page.getByTestId("sidebar-view-db").click();
    await page.getByTestId("db-connection-new").click();
    await page.getByTestId("db-connection-name").fill("navicat");
    await page.getByTestId("db-connection-host").fill("db.internal");
    await page.getByTestId("db-connection-database").fill("app");
    await page.getByTestId("db-connection-user").fill("app");
    await page.getByTestId("db-connection-password").fill("s3cret-value");
    await page.getByTestId("db-connection-save").click();
    await expect(page.getByTestId("db-connect-loading")).toHaveCount(0);
    await page.locator(".db-connection-row").filter({ hasText: "navicat" }).locator(".saved-item-main").click();
    await page.getByTestId("db-tree-database-app").click();
    await page.getByTestId("db-tree-schema-public").click();
    await page.getByTestId("db-tree-kind-table").click();
    await expect(page.getByTestId("db-tree-object-orders")).toBeVisible();
    await page.getByTestId("db-tree-object-orders").click({ button: "right" });
    await expect(page.getByTestId("db-object-menu")).toBeVisible();
    await expect(page.getByTestId("db-object-menu-empty")).toHaveText("Empty table");
    await expect(page.getByTestId("db-object-menu-truncate")).toHaveText("Truncate");
    await expect(page.getByTestId("db-object-menu-drop")).toHaveText("Drop table");
    await page.getByTestId("db-object-menu-open").click();
    await expect(page.getByTestId("db-results")).toBeVisible();
    await expect(page.getByTestId("db-empty-table")).toHaveCount(0);
    await expect(page.getByTestId("db-truncate-table")).toHaveCount(0);
    // Navicat-like grid: plain cells; no in-cell NULL shortcut that spams UPDATE approval
    await expect(page.getByTestId("db-results").locator(".db-data-grid .db-cell-null")).toHaveCount(0);
    await expect(page.getByTestId("db-results").locator(".db-data-grid input")).toHaveCount(0);
    const cell = page.getByTestId("db-cell-display");
    await expect(cell).toHaveClass(/db-cell-editable/);
    const border = await cell.evaluate((node) => getComputedStyle(node).borderRightWidth);
    expect(Number.parseFloat(border)).toBeGreaterThan(0);
    await cell.dblclick();
    await expect(page.getByTestId("db-cell-null")).toHaveCount(0);
    await expect(page.getByTestId("db-cell-input")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("ai-engineer-approval-card")).toHaveCount(0);

    await page.getByTestId("db-tree-object-orders").click({ button: "right" });
    await page.getByTestId("db-object-menu-empty").click();
    await expect(page.getByTestId("ai-engineer-approval-card")).toContainText("DELETE FROM");
    await page.getByTestId("ai-engineer-approval-reject").click();

    await page.getByTestId("db-tree-object-orders").click({ button: "right" });
    await page.getByTestId("db-object-menu-truncate").click();
    await expect(page.getByTestId("ai-engineer-approval-card")).toContainText("TRUNCATE");
    await page.getByTestId("ai-engineer-approval-reject").click();

    await page.getByTestId("db-tree-object-orders").click({ button: "right" });
    await page.getByTestId("db-object-menu-drop").click();
    await expect(page.getByTestId("ai-engineer-approval-card")).toContainText("DROP TABLE");
    await page.getByTestId("ai-engineer-approval-reject").click();

    await page.getByTestId("db-tree-object-orders").click({ button: "right" });
    await page.getByTestId("db-object-menu-rename").click();
    await expect(page.getByTestId("db-rename-bar")).toBeVisible();
    await page.getByTestId("db-rename-input").fill("orderz");
    await page.getByTestId("db-rename-apply").click();
    await expect(page.getByTestId("ai-engineer-approval-card")).toContainText("RENAME");
    await page.getByTestId("ai-engineer-approval-once").click();
    await expect(page.getByTestId("db-tree-object-orderz")).toBeVisible();
    await expect(page.getByTestId("db-tree-object-orders")).toHaveCount(0);
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
    const offlineRow = page.locator(".db-connection-row").filter({ hasText: "offline" });
    await offlineRow.locator(".saved-item-main").click();
    await expect(page.getByTestId("db-connect-loading")).toBeVisible();
    await expect(page.getByTestId("db-schema")).toHaveCount(0);
    await expect(page.getByTestId("db-connect-hint")).toHaveText("Connection failed");
    await expect(page.getByTestId("db-connect-hint")).toHaveAttribute("title", /connection closed/);
    await expect(page.getByTestId("db-connect-loading")).toHaveCount(0);
    await expect(page.getByTestId("db-error")).toHaveCount(0);
    await expect(offlineRow.locator(".db-engine-icon--muted")).toBeVisible();
  });

  test("opens a service tab on connect and keeps the other service", async ({ page }) => {
    await gotoApp(page);
    await page.getByTestId("sidebar-view-db").click();
    await page.getByTestId("db-connection-new").click();
    await page.getByTestId("db-connection-name").fill("PostgreSQL");
    await page.getByTestId("db-connection-host").fill("db.internal");
    await page.getByTestId("db-connection-database").fill("twreview");
    await page.getByTestId("db-connection-user").fill("app");
    await page.getByTestId("db-connection-password").fill("s3cret-value");
    await page.getByTestId("db-connection-save").click();
    await page.locator(".db-connection-row").filter({ hasText: "PostgreSQL" }).locator(".saved-item-main").click();
    await expect(page.getByTestId("db-object-list")).toContainText("twreview");
    await expect(page.getByTestId("db-workspace-tab")).toHaveCount(1);
    await expect(page.getByTestId("db-workspace-tab")).toContainText("PostgreSQL");
    await page.getByTestId("db-new-query").click();
    await expect(page.getByTestId("db-query-tab")).toContainText("SQL 1");

    await page.getByTestId("db-connection-new").click();
    await page.getByTestId("db-connection-engine").click();
    await page.getByTestId("db-connection-engine-mysql").click();
    await page.getByTestId("db-connection-name").fill("MySQL");
    await page.getByTestId("db-connection-host").fill("db.internal");
    await page.getByTestId("db-connection-database").fill("shop");
    await page.getByTestId("db-connection-user").fill("shop");
    await page.getByTestId("db-connection-password").fill("s3cret-value");
    await page.getByTestId("db-connection-save").click();
    await page.locator(".db-connection-row").filter({ hasText: "MySQL" }).locator(".saved-item-main").click();
    await expect(page.getByTestId("db-object-list")).toContainText("shop");
    await expect(page.getByTestId("db-workspace-tab")).toHaveCount(2);
    await expect(page.getByTestId("db-workspace-tab").filter({ hasText: "PostgreSQL" })).toBeVisible();
    await expect(page.getByTestId("db-workspace-tab").filter({ hasText: "MySQL" })).toBeVisible();

    await page.getByTestId("db-workspace-tab").filter({ hasText: "PostgreSQL" }).click();
    await expect(page.getByTestId("db-query-tab")).toContainText("SQL 1");
  });
});
