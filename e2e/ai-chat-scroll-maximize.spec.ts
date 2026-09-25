import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("AI chat scroll on maximize", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.resetMocks();
    await api.openSshTab();
    await api.openAiChatForSsh();
    await expect(page.getByTestId("ai-engineer-composer")).toBeVisible({
      timeout: 20_000,
    });
  });

  test("window resize keeps mid-history scrollTop (no 跳)", async ({ page }) => {
    const scroller = page.locator(".ai-engineer-messages");
    await expect(scroller).toBeVisible();

    // Tall synthetic rows so mid-scroll is meaningful (DOM-only for this check).
    await page.evaluate(() => {
      const inner = document.querySelector(".ai-engineer-messages-inner");
      if (!inner) throw new Error("missing messages inner");
      const frag = document.createDocumentFragment();
      for (let i = 0; i < 40; i++) {
        const div = document.createElement("div");
        div.className = "ai-engineer-line assistant";
        div.style.minHeight = "120px";
        div.textContent = `row-${i} ${"x".repeat(80)}`;
        frag.appendChild(div);
      }
      inner.insertBefore(frag, inner.firstChild);
    });

    const before = await scroller.evaluate((el) => {
      el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) / 2);
      // Clear stick the same way a real user would (wheel), so maximize
      // cannot re-pin via the content ResizeObserver.
      el.dispatchEvent(new WheelEvent("wheel", { deltaY: -80, bubbles: true }));
      el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) / 2);
      return {
        scrollTop: el.scrollTop,
        fix: el
          .querySelector("[data-scroll-fix]")
          ?.getAttribute("data-scroll-fix"),
      };
    });
    expect(before.scrollTop).toBeGreaterThan(100);
    expect(before.fix).toBe("2026-09-23-table-stream");

    // Let any pin-ignore window expire before resize.
    await page.waitForTimeout(200);

    await page.setViewportSize({ width: 1400, height: 900 });
    await page.waitForTimeout(450);

    const after = await scroller.evaluate((el) => el.scrollTop);
    expect(Math.abs(after - before.scrollTop)).toBeLessThanOrEqual(30);
  });

  test("window resize keeps near-bottom stick (no mid 跳)", async ({ page }) => {
    const scroller = page.locator(
      ".ai-engineer-panel:not(.ai-engineer-panel-parked) .ai-engineer-messages",
    );
    await expect(scroller).toBeVisible();

    await page.evaluate(() => {
      const inner = document.querySelector(
        ".ai-engineer-panel:not(.ai-engineer-panel-parked) .ai-engineer-messages-inner",
      );
      if (!inner) throw new Error("missing messages inner");
      const frag = document.createDocumentFragment();
      for (let i = 0; i < 40; i++) {
        const div = document.createElement("div");
        div.className = "ai-engineer-line assistant";
        div.style.minHeight = "120px";
        div.textContent = `row-${i} ${"x".repeat(80)}`;
        frag.appendChild(div);
      }
      inner.appendChild(frag);
      const el = document.querySelector(
        ".ai-engineer-panel:not(.ai-engineer-panel-parked) .ai-engineer-messages",
      ) as HTMLElement;
      el.scrollTop = el.scrollHeight;
    });

    await page.waitForTimeout(100);
    const before = await scroller.evaluate((el) => ({
      dist: el.scrollHeight - el.scrollTop - el.clientHeight,
      fix: el
        .querySelector("[data-scroll-fix]")
        ?.getAttribute("data-scroll-fix"),
    }));
    expect(before.dist).toBeLessThanOrEqual(120);
    expect(before.fix).toBe("2026-09-23-table-stream");

    await page.setViewportSize({ width: 1400, height: 900 });
    await page.waitForTimeout(450);

    const after = await scroller.evaluate((el) => ({
      dist: el.scrollHeight - el.scrollTop - el.clientHeight,
    }));
    expect(after.dist).toBeLessThanOrEqual(120);
  });

  // Maximize race: WK yanks scrollTop mid BEFORE resize events. Scroll must
  // not clear remembered near-bottom; resize must re-pin.
  test("yank-before-resize still re-pins when was following", async ({
    page,
  }) => {
    const scroller = page.locator(
      ".ai-engineer-panel:not(.ai-engineer-panel-parked) .ai-engineer-messages",
    );
    await expect(scroller).toBeVisible();

    await page.evaluate(() => {
      const inner = document.querySelector(
        ".ai-engineer-panel:not(.ai-engineer-panel-parked) .ai-engineer-messages-inner",
      );
      if (!inner) throw new Error("missing messages inner");
      const frag = document.createDocumentFragment();
      for (let i = 0; i < 40; i++) {
        const div = document.createElement("div");
        div.className = "ai-engineer-line assistant";
        div.style.minHeight = "120px";
        div.textContent = `row-${i} ${"x".repeat(80)}`;
        frag.appendChild(div);
      }
      inner.appendChild(frag);
      const el = document.querySelector(
        ".ai-engineer-panel:not(.ai-engineer-panel-parked) .ai-engineer-messages",
      ) as HTMLElement;
      el.scrollTop = el.scrollHeight;
    });

    await page.waitForTimeout(100);
    const before = await scroller.evaluate((el) => ({
      dist: el.scrollHeight - el.scrollTop - el.clientHeight,
      fix: el
        .querySelector("[data-scroll-fix]")
        ?.getAttribute("data-scroll-fix"),
    }));
    expect(before.dist).toBeLessThanOrEqual(120);
    expect(before.fix).toBe("2026-09-23-table-stream");

    // Simulate native maximize yank WITHOUT wheel (user did not leave bottom).
    await scroller.evaluate((el) => {
      el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) / 2);
      el.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    await page.setViewportSize({ width: 1400, height: 900 });
    await page.waitForTimeout(500);

    const after = await scroller.evaluate((el) => ({
      dist: el.scrollHeight - el.scrollTop - el.clientHeight,
    }));
    expect(after.dist).toBeLessThanOrEqual(120);
  });
});

test.describe("AI composer chrome keeps chat scroll", () => {
  test("opening model picker does not yank mid scrollTop", async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.resetMocks();
    await api.openSshTab();
    await api.openAiChatForSsh();
    await expect(page.getByTestId("ai-engineer-composer")).toBeVisible({
      timeout: 20_000,
    });

    const scroller = page.locator(
      ".ai-engineer-panel:not(.ai-engineer-panel-parked) .ai-engineer-messages",
    );
    await expect(scroller).toBeVisible();

    await page.evaluate(() => {
      const panel = document.querySelector(
        ".ai-engineer-panel:not(.ai-engineer-panel-parked)",
      );
      const inner = panel?.querySelector(".ai-engineer-messages-inner");
      if (!inner) throw new Error("missing messages inner");
      const frag = document.createDocumentFragment();
      for (let i = 0; i < 40; i++) {
        const div = document.createElement("div");
        div.className = "ai-engineer-line assistant";
        div.style.minHeight = "120px";
        div.textContent = `row-${i} ${"x".repeat(80)}`;
        frag.appendChild(div);
      }
      inner.insertBefore(frag, inner.firstChild);
      const el = panel?.querySelector(".ai-engineer-messages") as HTMLElement;
      el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) / 2);
      el.dispatchEvent(new WheelEvent("wheel", { deltaY: -80, bubbles: true }));
      el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) / 2);
    });

    const before = await scroller.evaluate((el) => el.scrollTop);
    expect(before).toBeGreaterThan(100);

    await page.getByTestId("ai-engineer-model-picker").click();
    await expect(page.getByTestId("ai-engineer-model-menu")).toBeVisible();
    await page.waitForTimeout(400);

    const after = await scroller.evaluate((el) => el.scrollTop);
    expect(Math.abs(after - before)).toBeLessThanOrEqual(30);
  });

  test("selecting another model keeps mid scrollTop", async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.resetMocks();
    await api.openSshTab();
    await api.openAiChatForSsh();
    await expect(page.getByTestId("ai-engineer-composer")).toBeVisible({
      timeout: 20_000,
    });

    const scroller = page.locator(
      ".ai-engineer-panel:not(.ai-engineer-panel-parked) .ai-engineer-messages",
    );
    await expect(scroller).toBeVisible();

    await page.evaluate(() => {
      const panel = document.querySelector(
        ".ai-engineer-panel:not(.ai-engineer-panel-parked)",
      );
      const inner = panel?.querySelector(".ai-engineer-messages-inner");
      if (!inner) throw new Error("missing messages inner");
      const frag = document.createDocumentFragment();
      for (let i = 0; i < 40; i++) {
        const div = document.createElement("div");
        div.className = "ai-engineer-line assistant";
        div.style.minHeight = "120px";
        div.textContent = `row-${i} ${"x".repeat(80)}`;
        frag.appendChild(div);
      }
      inner.insertBefore(frag, inner.firstChild);
      const el = panel?.querySelector(".ai-engineer-messages") as HTMLElement;
      el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) / 2);
      el.dispatchEvent(new WheelEvent("wheel", { deltaY: -80, bubbles: true }));
      el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) / 2);
    });

    const before = await scroller.evaluate((el) => el.scrollTop);
    expect(before).toBeGreaterThan(100);

    await page.getByTestId("ai-engineer-model-picker").click();
    await expect(page.getByTestId("ai-engineer-model-menu")).toBeVisible();
    await page
      .getByTestId("ai-engineer-model-menu")
      .getByRole("menuitem")
      .filter({ hasText: "E2E Alt" })
      .click();
    await expect(page.getByTestId("ai-engineer-model-menu")).toBeHidden({
      timeout: 5_000,
    });
    // Wait past former 600ms lock + settings paint.
    await page.waitForTimeout(900);

    const after = await scroller.evaluate((el) => el.scrollTop);
    expect(Math.abs(after - before)).toBeLessThanOrEqual(40);
  });

  test("selecting another model keeps bottom stick", async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.resetMocks();
    await api.openSshTab();
    await api.openAiChatForSsh();
    await expect(page.getByTestId("ai-engineer-composer")).toBeVisible({
      timeout: 20_000,
    });

    const scroller = page.locator(
      ".ai-engineer-panel:not(.ai-engineer-panel-parked) .ai-engineer-messages",
    );
    await expect(scroller).toBeVisible();

    await page.evaluate(() => {
      const panel = document.querySelector(
        ".ai-engineer-panel:not(.ai-engineer-panel-parked)",
      );
      const inner = panel?.querySelector(".ai-engineer-messages-inner");
      if (!inner) throw new Error("missing messages inner");
      const frag = document.createDocumentFragment();
      for (let i = 0; i < 40; i++) {
        const div = document.createElement("div");
        div.className = "ai-engineer-line assistant";
        div.style.minHeight = "120px";
        div.textContent = `row-${i} ${"x".repeat(80)}`;
        frag.appendChild(div);
      }
      inner.appendChild(frag);
      const el = panel?.querySelector(".ai-engineer-messages") as HTMLElement;
      el.scrollTop = el.scrollHeight;
    });

    expect(
      await scroller.evaluate(
        (el) => el.scrollHeight - el.scrollTop - el.clientHeight,
      ),
    ).toBeLessThanOrEqual(120);

    await page.getByTestId("ai-engineer-model-picker").click();
    await expect(page.getByTestId("ai-engineer-model-menu")).toBeVisible();
    await page
      .getByTestId("ai-engineer-model-menu")
      .getByRole("menuitem")
      .filter({ hasText: "E2E Alt" })
      .click();
    await expect(page.getByTestId("ai-engineer-model-menu")).toBeHidden({
      timeout: 5_000,
    });
    await page.waitForTimeout(900);

    expect(
      await scroller.evaluate(
        (el) => el.scrollHeight - el.scrollTop - el.clientHeight,
      ),
    ).toBeLessThanOrEqual(120);
  });

  test("opening model picker keeps bottom stick", async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.resetMocks();
    await api.openSshTab();
    await api.openAiChatForSsh();
    await expect(page.getByTestId("ai-engineer-composer")).toBeVisible({
      timeout: 20_000,
    });

    const scroller = page.locator(
      ".ai-engineer-panel:not(.ai-engineer-panel-parked) .ai-engineer-messages",
    );
    await expect(scroller).toBeVisible();

    await page.evaluate(() => {
      const panel = document.querySelector(
        ".ai-engineer-panel:not(.ai-engineer-panel-parked)",
      );
      const inner = panel?.querySelector(".ai-engineer-messages-inner");
      if (!inner) throw new Error("missing messages inner");
      const frag = document.createDocumentFragment();
      for (let i = 0; i < 40; i++) {
        const div = document.createElement("div");
        div.className = "ai-engineer-line assistant";
        div.style.minHeight = "120px";
        div.textContent = `row-${i} ${"x".repeat(80)}`;
        frag.appendChild(div);
      }
      inner.appendChild(frag);
      const el = panel?.querySelector(".ai-engineer-messages") as HTMLElement;
      el.scrollTop = el.scrollHeight;
    });

    await page.waitForTimeout(100);
    const before = await scroller.evaluate((el) => ({
      dist: el.scrollHeight - el.scrollTop - el.clientHeight,
      fix: el
        .querySelector("[data-scroll-fix]")
        ?.getAttribute("data-scroll-fix"),
    }));
    expect(before.dist).toBeLessThanOrEqual(120);
    expect(before.fix).toBe("2026-09-23-table-stream");

    await page.getByTestId("ai-engineer-model-picker").click();
    await expect(page.getByTestId("ai-engineer-model-menu")).toBeVisible();
    // Simulate late WKWebView yank after menu layout.
    await page.evaluate(() => {
      const el = document.querySelector(
        ".ai-engineer-panel:not(.ai-engineer-panel-parked) .ai-engineer-messages",
      ) as HTMLElement | null;
      if (!el) return;
      el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) / 2);
    });
    await page.waitForTimeout(450);

    const after = await scroller.evaluate((el) => ({
      dist: el.scrollHeight - el.scrollTop - el.clientHeight,
    }));
    expect(after.dist).toBeLessThanOrEqual(120);
  });

  test("streaming height growth stays near bottom while sticky", async ({
    page,
  }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.resetMocks();
    await api.openSshTab();
    await api.openAiChatForSsh();
    await expect(page.getByTestId("ai-engineer-composer")).toBeVisible({
      timeout: 20_000,
    });

    await api.simulateStreamingAssistantGrow({ reset: true, seedRows: 24 });
    await page.waitForTimeout(80);
    expect(await api.getAiChatScrollDist()).toBeLessThanOrEqual(120);

    for (let i = 0; i < 10; i++) {
      await api.simulateStreamingAssistantGrow({
        chunk: `\nstream chunk ${i} ${"y".repeat(80)}`,
      });
      await page.waitForTimeout(20);
      expect(await api.getAiChatScrollDist()).toBeLessThanOrEqual(120);
    }

    await expect(
      page.locator('[data-scroll-fix="2026-09-23-table-stream"]'),
    ).toHaveCount(1);
  });

  test("mid yank without wheel re-pins on further stream growth", async ({
    page,
  }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.resetMocks();
    await api.openSshTab();
    await api.openAiChatForSsh();
    await expect(page.getByTestId("ai-engineer-composer")).toBeVisible({
      timeout: 20_000,
    });

    await api.simulateStreamingAssistantGrow({ reset: true, seedRows: 24 });
    await page.waitForTimeout(80);
    expect(await api.getAiChatScrollDist()).toBeLessThanOrEqual(120);

    const scroller = page.locator(
      ".ai-engineer-panel:not(.ai-engineer-panel-parked) .ai-engineer-messages",
    );
    await scroller.evaluate((el) => {
      el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) / 2);
      el.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    for (let i = 0; i < 4; i++) {
      await api.simulateStreamingAssistantGrow({
        chunk: `\nyank chunk ${i} ${"z".repeat(80)}`,
      });
      await page.waitForTimeout(30);
    }
    expect(await api.getAiChatScrollDist()).toBeLessThanOrEqual(120);
  });

  test("wheel away from bottom does not re-pin on stream growth", async ({
    page,
  }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.resetMocks();
    await api.openSshTab();
    await api.openAiChatForSsh();
    await expect(page.getByTestId("ai-engineer-composer")).toBeVisible({
      timeout: 20_000,
    });

    await api.simulateStreamingAssistantGrow({ reset: true, seedRows: 24 });
    await page.waitForTimeout(80);

    const scroller = page.locator(
      ".ai-engineer-panel:not(.ai-engineer-panel-parked) .ai-engineer-messages",
    );
    const mid = await scroller.evaluate((el) => {
      el.dispatchEvent(new WheelEvent("wheel", { deltaY: -80, bubbles: true }));
      el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) / 2);
      el.dispatchEvent(new Event("scroll", { bubbles: true }));
      return el.scrollTop;
    });
    expect(mid).toBeGreaterThan(100);

    await api.simulateStreamingAssistantGrow({
      chunk: `\nleave mid ${"w".repeat(120)}`,
    });
    await page.waitForTimeout(80);
    const after = await scroller.evaluate((el) => el.scrollTop);
    expect(Math.abs(after - mid)).toBeLessThanOrEqual(40);
  });
});

test.describe("AI chat open pins to bottom", () => {
  test("soft-hide mid scroll → restore lands at bottom", async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.resetMocks();
    await api.openSshTab();
    await api.openAiChatForSsh();
    await expect(page.getByTestId("ai-engineer-composer")).toBeVisible({
      timeout: 20_000,
    });

    const scroller = page.locator(
      ".ai-engineer-panel:not(.ai-engineer-panel-parked) .ai-engineer-messages",
    );
    await expect(scroller).toBeVisible();

    await page.evaluate(() => {
      const panel = document.querySelector(
        ".ai-engineer-panel:not(.ai-engineer-panel-parked)",
      );
      const inner = panel?.querySelector(".ai-engineer-messages-inner");
      if (!inner) throw new Error("missing messages inner");
      const frag = document.createDocumentFragment();
      for (let i = 0; i < 40; i++) {
        const div = document.createElement("div");
        div.className = "ai-engineer-line assistant";
        div.style.minHeight = "120px";
        div.textContent = `row-${i} ${"x".repeat(80)}`;
        frag.appendChild(div);
      }
      inner.insertBefore(frag, inner.firstChild);
      const el = panel?.querySelector(".ai-engineer-messages") as HTMLElement;
      el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) / 2);
      el.dispatchEvent(new WheelEvent("wheel", { deltaY: -80, bubbles: true }));
      el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) / 2);
    });

    const mid = await scroller.evaluate((el) => el.scrollTop);
    expect(mid).toBeGreaterThan(100);

    await api.openSecondSshTab();
    // While parked, scroller must already be at bottom (no mid inheritance).
    const parked = await page.evaluate(() => {
      const el = document.querySelector(
        ".ai-engineer-panel.ai-engineer-panel-parked .ai-engineer-messages",
      ) as HTMLElement | null;
      if (!el) return { ok: false, dist: 9999 };
      return {
        ok: true,
        dist: el.scrollHeight - el.scrollTop - el.clientHeight,
      };
    });
    expect(parked.ok).toBe(true);
    expect(parked.dist).toBeLessThanOrEqual(120);

    await api.setActiveTab("e2e-ssh-session-1");
    await expect(page.getByTestId("ai-engineer-composer")).toBeVisible({
      timeout: 10_000,
    });

    await page.waitForTimeout(300);

    const after = await scroller.evaluate((el) => {
      const max = el.scrollHeight - el.clientHeight;
      return {
        scrollTop: el.scrollTop,
        max,
        dist: max - el.scrollTop,
        fix: el
          .querySelector("[data-scroll-fix]")
          ?.getAttribute("data-scroll-fix"),
      };
    });
    expect(after.fix).toBe("2026-09-23-table-stream");
    expect(after.dist).toBeLessThanOrEqual(120);
  });
});

test.describe("AI host soft-hide keeps busy", () => {
  test("A busy → B terminal → A still busy", async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.resetMocks();
    await api.openSshTab();
    await api.openAiChatForSsh();
    await expect(page.getByTestId("ai-engineer-composer")).toBeVisible({
      timeout: 20_000,
    });

    await api.simulateAiBusy();
    expect(await api.getAiBusy()).toBe(true);
    await expect(page.getByTestId("ai-engineer-busy-phase")).toBeVisible({
      timeout: 10_000,
    });

    const textBefore = await page
      .locator(".ai-engineer-messages")
      .evaluate((el) => el.textContent?.length ?? 0);

    await api.openSecondSshTab();
    // Soft-hide: AI panel parks; busy must stay true.
    expect(await api.getAiBusy()).toBe(true);

    await api.setActiveTab("e2e-ssh-session-1");
    await expect(page.getByTestId("ai-engineer-composer")).toBeVisible({
      timeout: 10_000,
    });
    expect(await api.getAiBusy()).toBe(true);
    await expect(page.getByTestId("ai-engineer-busy-phase")).toBeVisible({
      timeout: 10_000,
    });

    const textAfter = await page
      .locator(".ai-engineer-messages")
      .evaluate((el) => el.textContent?.length ?? 0);
    // Transcript must not flash empty on restore (length may be hint-only).
    expect(textAfter).toBeGreaterThan(0);
    if (textBefore > 0) {
      expect(textAfter).toBeGreaterThanOrEqual(Math.min(textBefore, 8));
    }
  });
});
