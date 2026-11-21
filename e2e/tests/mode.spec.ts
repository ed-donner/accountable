import type { Page } from "@playwright/test";
import { apiGet, expect, test } from "../fixtures";

// Light and dark mode (GEN-9 to GEN-11, spec 2.6). Each test gets a fresh
// browser profile, so each starts in light mode.

const PAGE_LIGHT = "rgb(240, 244, 245)";
const PAGE_DARK = "rgb(4, 35, 46)";
const BLACK = "rgb(0, 0, 0)";
const WHITE = "rgb(255, 255, 255)";
const MIDNIGHT = "rgb(7, 59, 76)";
const DARK_CLASS = /(^|\s)dark(\s|$)/;

const html = (page: Page) => page.locator("html");
const body = (page: Page) => page.locator("body");
const modeButton = (page: Page) => page.getByRole("banner").getByRole("button");

/** Start in dark mode, as if it had been chosen on an earlier visit. */
async function savedDark(page: Page) {
  await page.addInitScript(() => localStorage.setItem("accountable-mode", "dark"));
}

test("switch to dark, see another section follow, reload, then switch back (GEN-9, GEN-10, success criterion 2)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(html(page)).not.toHaveClass(DARK_CLASS);
  await expect(body(page)).toHaveCSS("background-color", PAGE_LIGHT);

  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(html(page)).toHaveClass(DARK_CLASS);
  await expect(body(page)).toHaveCSS("background-color", PAGE_DARK);

  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Pipeline" }).click();
  await expect(page).toHaveURL("/pipeline");
  const card = page.getByRole("list", { name: "New deals" }).locator("article").first();
  await expect(card).toHaveCSS("background-color", BLACK);

  await page.reload();
  await expect(html(page)).toHaveClass(DARK_CLASS);
  await expect(card).toHaveCSS("background-color", BLACK);

  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(html(page)).not.toHaveClass(DARK_CLASS);
  await page.reload();
  await expect(page.getByRole("button", { name: "Switch to dark mode" })).toBeVisible();
  await expect(html(page)).not.toHaveClass(DARK_CLASS);
  await expect(card).toHaveCSS("background-color", WHITE);
});

test("switching leaves the page as it was, with no reload and no fade (GEN-11)", async ({ page }) => {
  await page.goto("/contacts");
  const search = page.getByRole("searchbox", { name: "Search contacts" });
  await search.fill("a");
  const rows = page.locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  const rowsBefore = await rows.allTextContents();
  expect(rowsBefore.length).toBeGreaterThan(10);

  await page.evaluate(() => {
    window.scrollTo(0, 500);
    (window as Window & { beforeSwitch?: boolean }).beforeSwitch = true;
  });
  const scrollBefore = await page.evaluate(() => window.scrollY);
  expect(scrollBefore).toBeGreaterThan(0);

  // Click with no scrolling into view, and read the search box's color at once.
  // It has a 150ms color transition, so a fade would still show the old white.
  const searchBox = await search.elementHandle();
  const searchBackground = await modeButton(page).evaluate((button: HTMLElement, input) => {
    button.click();
    return getComputedStyle(input!).backgroundColor;
  }, searchBox);
  expect(searchBackground, "the search box is black at once").toBe(BLACK);

  await expect(html(page)).toHaveClass(DARK_CLASS);
  await expect(search).toHaveValue("a");
  expect(await rows.allTextContents()).toEqual(rowsBefore);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  expect(await page.evaluate(() => (window as Window & { beforeSwitch?: boolean }).beforeSwitch)).toBe(true);
});

test("a saved dark mode is on before the app's code runs, so there's no flash (GEN-10)", async ({ page }) => {
  await savedDark(page);
  await page.route(
    (url) => url.pathname === "/src/main.tsx",
    (route) => route.fulfill({ contentType: "text/javascript", body: "" }),
  );
  await page.goto("/", { waitUntil: "load" });
  await expect(page.locator("#root")).toBeEmpty();
  await expect(html(page)).toHaveClass(DARK_CLASS);
  await expect(body(page)).toHaveCSS("background-color", PAGE_DARK);
});

test.describe("on a computer set to dark", () => {
  test.use({ colorScheme: "dark" });

  test("the app still opens in light mode, and selects have no grey tint (GEN-10, concern 16)", async ({ page }) => {
    await page.goto("/deals");
    await expect(page.getByRole("heading", { level: 1, name: "Deals" })).toBeVisible();
    await expect(html(page)).not.toHaveClass(DARK_CLASS);
    await expect(body(page)).toHaveCSS("background-color", PAGE_LIGHT);

    await page.getByRole("button", { name: "Add deal" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add deal" });
    await expect(dialog.getByLabel("Stage")).toHaveCSS("background-color", WHITE);
  });
});

test("dialogs, menus, messages and chart tooltips follow dark mode (GEN-9, concern 14)", async ({ page }) => {
  await savedDark(page);
  await page.goto("/contacts");
  await page.getByRole("button", { name: "Add contact" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add contact" });
  await expect(dialog).toHaveCSS("background-color", MIDNIGHT);

  await dialog.getByLabel("Status").click();
  await expect(page.getByRole("listbox")).toHaveCSS("background-color", BLACK);
  await page.getByRole("option", { name: "Lead", exact: true }).click();

  await dialog.getByLabel("Name").fill(`E2E Dark ${Date.now()}`);
  await dialog.getByRole("button", { name: "Add contact" }).click();
  const message = page.locator("[data-sonner-toast]").filter({ hasText: "Contact added" });
  await expect(message).toHaveCSS("background-color", MIDNIGHT);

  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Dashboard" }).click();
  const chart = page.locator('[data-chart="revenue"]');
  const area = (await chart.boundingBox())!;
  await page.mouse.move(area.x + area.width - 40, area.y + area.height / 2, { steps: 4 });
  await expect(chart.locator(".recharts-tooltip-wrapper > div")).toHaveCSS("background-color", MIDNIGHT);
});

test("the top bar and band look exactly the same in both modes (concern 13)", async ({ page, request }) => {
  type Deal = { id: number; name: string; is_late: boolean; main_contact: unknown };
  const deals = await apiGet<Deal[]>(request, "/api/deals");
  // A late deal, so the band has the stage bar, the stage badge and the Late badge.
  const late = deals.find((deal) => deal.is_late && deal.main_contact)!;
  await page.goto(`/deals/${late.id}`);
  const heading = page.getByRole("heading", { level: 1, name: late.name });
  await expect(heading).toBeVisible();
  await page.waitForLoadState("networkidle");

  const band = (await page.locator("section", { has: heading }).boundingBox())!;
  const shot = () =>
    page.screenshot({
      clip: { x: 0, y: 0, width: 1440, height: band.y + band.height },
      mask: [modeButton(page)],
      animations: "disabled",
      caret: "hide",
    });
  const light = await shot();

  await modeButton(page).dispatchEvent("click");
  await expect(body(page)).toHaveCSS("background-color", PAGE_DARK);
  const dark = await shot();

  expect(dark.equals(light), "the top bar and band match, pixel for pixel").toBe(true);
});
