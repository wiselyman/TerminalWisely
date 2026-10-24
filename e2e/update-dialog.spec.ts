import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("Update dialog", () => {
  test("renders release notes as Markdown and keeps links external", async ({
    page,
  }) => {
    await gotoApp(page);
    const appUrl = page.url();
    const api = await twE2e(page);
    await api.showUpdateDialog(
      "## Highlights\n\n- Rendered list item\n\n| Area | Change |\n| --- | --- |\n| Files | Metadata |\n\n[Release details](https://example.com/releases)",
    );

    const dialog = page.getByRole("dialog");
    const notes = dialog.getByTestId("update-notes");
    await expect(notes.getByRole("heading", { name: "Highlights" })).toBeVisible();
    await expect(notes.getByRole("listitem")).toHaveText("Rendered list item");
    await expect(notes.getByRole("table")).toBeVisible();
    const releaseLink = notes.getByRole("link", { name: "Release details" });
    await expect(releaseLink).toHaveAttribute(
      "href",
      "https://example.com/releases",
    );
    await expect(releaseLink).toHaveAttribute(
      "data-testid",
      "ai-md-external-link",
    );
    await releaseLink.click();
    await expect(page).toHaveURL(appUrl);
    await expect(notes.locator("pre")).toHaveCount(0);
  });
});
