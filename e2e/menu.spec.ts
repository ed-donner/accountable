import type { Locator, Page, Route } from "@playwright/test";

import { expect, test } from "./fixtures";
import { SIGNED_IN, addLinkedDeal, card, chooseTeammate, column, isoDay, resetToSampleData } from "./helpers";

test.beforeAll(resetToSampleData);

type Mode = "light" | "dark";
type Theme = "Light" | "Dark" | "System";

// The spec's Color tokens, as the browser reports them.
const SURFACES = {
  light: { page: "rgb(240, 244, 245)", panel: "rgb(255, 255, 255)", ink: "rgb(7, 59, 76)" },
  dark: { page: "rgb(4, 35, 46)", panel: "rgb(11, 50, 64)", ink: "rgb(205, 216, 219)" },
};
const RAISED = { light: "rgb(255, 255, 255)", dark: "rgb(18, 64, 79)" };
const FOCUS = { light: "rgb(17, 138, 178)", dark: "rgb(76, 179, 214)" };
const MARIGOLD = "rgb(255, 193, 69)";
const MIDNIGHT = "rgb(7, 59, 76)";
const SECTIONS = [
  "/",
  "/organizations",
  "/contacts",
  "/deals",
  "/pipeline",
  "/products",
  "/quotes",
  "/invoices",
  "/bills",
];
const SEARCH_BOX = "Search organizations, contacts, deals and products";

/** Named for the person once the backend says who's signed in, and plain "Menu" until then. */
function menuButton(page: Page) {
  return page.getByRole("banner").getByRole("button", { name: /^Menu( for .+)?$/ });
}

function menu(page: Page) {
  return page.getByRole("menu");
}

/** Chooses a theme from the menu, which closes once it's chosen. */
async function chooseTheme(page: Page, theme: Theme) {
  await menuButton(page).click();
  await menu(page).getByRole("menuitemradio", { name: theme }).click();
  await expect(menu(page)).toHaveCount(0);
}

async function expectChecked(page: Page, theme: Theme) {
  await menuButton(page).click();
  await expect(menu(page).getByRole("menuitemradio", { checked: true })).toHaveText(theme);
  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);
}

async function signOut(page: Page) {
  await menuButton(page).click();
  await menu(page).getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
}

function signInPanel(page: Page) {
  return page.getByRole("main").locator(":scope > div");
}

/** The page in this mode, judged by its colors and a panel on it: the top bar unless another is named. */
async function expectMode(page: Page, mode: Mode, panel: Locator = page.getByRole("banner")) {
  const colors = SURFACES[mode];
  await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
  await expect(page.locator("html")).toHaveCSS("color-scheme", mode === "dark" ? "dark" : /^(normal|light)$/);
  await expect(page.locator("body")).toHaveCSS("background-color", colors.page);
  await expect(page.locator("body")).toHaveCSS("color", colors.ink);
  await expect(panel).toHaveCSS("background-color", colors.panel);
}

/** Switches to dark mode and back with the menu, from wherever the page is. */
async function switchBothWays(page: Page) {
  await chooseTheme(page, "Dark");
  await expectMode(page, "dark");
  await chooseTheme(page, "Light");
  await expectMode(page, "light");
}

test("the menu shows the initials, the name and email, the themes, Company settings and Sign out", async ({
  page,
  request,
}) => {
  const me = await (await request.get("/api/me")).json();
  expect(me.name).toBe(SIGNED_IN.name);
  await page.goto("/");
  const button = menuButton(page);
  await expect(button).toHaveAccessibleName(`Menu for ${me.name}`);
  await expect(button).toHaveText(me.initials);
  await expect(button).toHaveCSS("background-color", MARIGOLD);
  await expect(button).toHaveCSS("color", MIDNIGHT);
  await expect(button).toHaveCSS("width", "32px");
  await expect(button).toHaveCSS("height", "32px");
  // Measured first: while the menu is open, Radix hides the rest of the page from the accessibility tree.
  const buttonBox = (await button.boundingBox())!;

  await button.click();
  await expect(menu(page)).toContainText(me.name);
  await expect(menu(page)).toContainText(me.email);
  await expect(menu(page).getByRole("menuitemradio")).toHaveText(["Light", "Dark", "System"]);
  await expect(menu(page).getByRole("menuitemradio", { checked: true })).toHaveText("Light");
  await expect(menu(page).getByRole("menuitem")).toHaveText([
    "Profit and loss",
    "Balance sheet",
    "Journal",
    "Aged balances",
    "Company settings",
    "Sign out",
  ]);

  // 240px wide on the raised surface, below the button and lined up with its right edge.
  await expect(menu(page)).toHaveCSS("width", "240px");
  await expect(menu(page)).toHaveCSS("background-color", RAISED.light);
  const menuBox = (await menu(page).boundingBox())!;
  expect(menuBox.y).toBeGreaterThan(buttonBox.y + buttonBox.height);
  expect(Math.abs(menuBox.x + menuBox.width - (buttonBox.x + buttonBox.width))).toBeLessThanOrEqual(1);

  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);
  await expect(button).toBeFocused();
});

test("the menu button can be reached by Tab, shows a focus ring, and its menu works by keyboard", async ({ page }) => {
  await page.goto("/organizations");
  await expect(page.locator("tbody tr").first()).toBeVisible();

  const sections = page.getByRole("navigation", { name: "Sections" }).getByRole("link");
  await expect(sections).toHaveCount(9);
  for (let index = 0; index < 9; index += 1) {
    await page.keyboard.press("Tab");
    await expect(sections.nth(index)).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(page.getByRole("banner").getByLabel(SEARCH_BOX)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(menuButton(page)).toBeFocused();
  await expect(menuButton(page)).toHaveCSS("outline-color", FOCUS.light);
  await expect(menuButton(page)).toHaveCSS("outline-style", "solid");

  await page.keyboard.press("Enter");
  await expect(menu(page).getByRole("menuitemradio", { name: "Light" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu(page).getByRole("menuitemradio", { name: "Dark" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expectMode(page, "dark");
  await expect(menu(page)).toHaveCount(0);
  await expect(menuButton(page)).toBeFocused();
  await expect(menuButton(page)).toHaveCSS("outline-color", FOCUS.dark);

  await page.keyboard.press("Space");
  await expect(menu(page).getByRole("menuitemradio", { name: "Light" })).toBeFocused();
  await page.keyboard.press("Space");
  await expectMode(page, "light");

  await page.keyboard.press("Enter");
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);
  await expect(menuButton(page)).toBeFocused();
  await expect(menuButton(page)).toHaveCSS("outline-color", FOCUS.light);
});

test("the app opens in light mode whatever the device's setting, and the menu switches to dark and back", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.getByTestId("summary")).toBeVisible();
  await expectMode(page, "light");

  await switchBothWays(page);
});

for (const [theme, mode] of [
  ["Dark", "dark"],
  ["System", "dark"],
  ["Light", "light"],
] as const) {
  test(`${theme} on a dark device survives a reload, a new tab and signing out`, async ({ page, context }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await chooseTheme(page, theme);
    await expectMode(page, mode);

    await page.reload();
    await expectMode(page, mode);
    await expectChecked(page, theme);

    const tab = await context.newPage();
    await tab.emulateMedia({ colorScheme: "dark" });
    await tab.goto("/pipeline");
    await expectMode(tab, mode);
    await tab.close();

    await signOut(page);
    await expectMode(page, mode, signInPanel(page));
    await chooseTeammate(page, SIGNED_IN.name);
    await expectMode(page, mode);
    await expectChecked(page, theme);
  });
}

test("System follows the device while the page is open, on the sign-in screen too", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/organizations");
  await chooseTheme(page, "System");
  await expectMode(page, "light");
  await page.evaluate(() => Object.assign(window, { notReloaded: true }));

  await page.emulateMedia({ colorScheme: "dark" });
  await expectMode(page, "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expectMode(page, "light");

  await signOut(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expectMode(page, "dark", signInPanel(page));
  expect(await page.evaluate(() => "notReloaded" in window)).toBe(true);
});

for (const [theme, device] of [
  ["Dark", "light"],
  ["System", "dark"],
] as const) {
  test(`${theme} saved on a ${device} device is in place before the app's script runs`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: device });
    await page.goto("/");
    await chooseTheme(page, theme);
    await expectMode(page, "dark");

    // The app's script also brings the styles, so until it runs the page has none.
    const held: Route[] = [];
    await page.route("**/src/main.tsx", (route) => {
      held.push(route);
    });
    await page.reload({ waitUntil: "commit" });
    await expect.poll(() => held.length).toBe(1);

    const early = await page.evaluate(() => ({
      mode: document.documentElement.dataset.mode,
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      appStarted: Boolean(document.getElementById("root")?.childElementCount),
    }));
    expect(early).toEqual({ mode: "dark", colorScheme: "dark", appStarted: false });

    await held[0].continue();
    await expectMode(page, "dark");
  });
}

test("the menu is on every screen and works there", async ({ page, request, expectConsoleError }) => {
  expectConsoleError(/404 \(Not Found\).*\/api\/deals\/\d+/);
  expectConsoleError(/ERR_CONNECTION_REFUSED|Failed to fetch/);
  const { deal } = await addLinkedDeal(request, "Menu everywhere");
  const { deal: gone } = await addLinkedDeal(request, "Menu gone");
  await request.delete(`/api/deals/${gone.id}`);

  const screens: [string, RegExp | string][] = [
    ...SECTIONS.map((path): [string, RegExp] => [
      path,
      /^(Dashboard|Organizations|Contacts|Deals|Pipeline|Products|Quotes|Invoices|Bills)$/,
    ]),
    [`/deals/${deal.id}`, "Menu everywhere"],
    [`/deals/${gone.id}`, "This deal no longer exists"],
    ["/nothing-here", "This page no longer exists"],
  ];
  for (const [path, heading] of screens) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading }), path).toBeVisible();
    await switchBothWays(page);
  }

  // With the backend out of reach, nobody can be named, but the themes are still there.
  await page.route("**/api/**", (route) => route.abort("connectionrefused"));
  await page.goto("/organizations");
  await expect(page.getByRole("alert")).toHaveText("Can't reach Accountable. Check that it's still running.");
  await expect(menuButton(page)).toHaveAccessibleName("Menu");
  await switchBothWays(page);
});

test("switching keeps what's on screen", async ({ page }) => {
  await page.goto("/organizations");
  await page.getByRole("searchbox", { name: "Search organizations" }).fill("e");
  await expect(page).toHaveURL(/q=e/);
  // The page is only tall enough to scroll once the rows are in.
  await expect(page.locator("tbody tr").first()).toBeVisible();
  const address = page.url();
  const rows = await page.locator("tbody tr").count();
  // Far enough to tell, and not so far that the button leaves the screen.
  await page.evaluate(() => window.scrollTo(0, 20));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(20);
  await page.evaluate(() => Object.assign(window, { notReloaded: true }));

  await chooseTheme(page, "Dark");
  await expectMode(page, "dark");

  expect(page.url()).toBe(address);
  await expect(page.getByRole("searchbox", { name: "Search organizations" })).toHaveValue("e");
  await expect(page.locator("tbody tr")).toHaveCount(rows);
  expect(await page.evaluate(() => window.scrollY)).toBe(20);
  expect(await page.evaluate(() => "notReloaded" in window)).toBe(true);
});

const WON = {
  light: { fill: "rgb(7, 59, 76)", text: "rgb(205, 216, 219)" },
  dark: { fill: "rgb(205, 216, 219)", text: "rgb(7, 59, 76)" },
};
const LATE_TINT = { light: "rgb(253, 236, 241)", dark: "rgb(75, 36, 54)" };
const MESSAGE_SHADOW = { light: "rgba(7, 59, 76, 0.18) 0px 6px 20px 0px", dark: "rgba(0, 0, 0, 0.4) 0px 6px 20px 0px" };

async function expectMessage(page: Page, text: string, mode: Mode) {
  const message = page.locator("[data-sonner-toast]").filter({ hasText: text }).first();
  await expect(message).toHaveCSS("background-color", RAISED[mode]);
  await expect(message).toHaveCSS("color", SURFACES[mode].ink);
  await expect(message.locator("[data-icon]")).toHaveCSS("color", SURFACES[mode].ink);
  await expect(message).toHaveCSS("border-top-width", "0px");
  await expect(message).toHaveCSS("outline-style", "none");
  await expect(message).toHaveCSS("box-shadow", MESSAGE_SHADOW[mode]);
}

async function saveDealFromItsPage(page: Page, id: number) {
  await page.goto(`/deals/${id}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save deal" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("dialogs, picker lists, chart tooltips and messages follow the mode", async ({ page, request }) => {
  const { deal } = await addLinkedDeal(request, "Floating");
  await page.goto("/deals");
  await chooseTheme(page, "Dark");
  await expectMode(page, "dark");

  await page.getByRole("button", { name: "Add deal" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCSS("background-color", RAISED.dark);
  await expect(dialog.locator("xpath=..")).toHaveCSS("background-color", "rgba(0, 0, 0, 0.5)");
  await expect(dialog.getByLabel("Close date")).toHaveCSS("color-scheme", "dark");
  await expect(dialog.getByLabel("Stage")).toHaveCSS("color-scheme", "dark");

  await dialog.getByRole("combobox", { name: "Organization" }).click();
  const pickerList = page.getByRole("dialog").last();
  await expect(pickerList.getByPlaceholder("Search organizations")).toBeVisible();
  await expect(pickerList).toHaveCSS("background-color", RAISED.dark);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto("/");
  const revenue = page.getByRole("img", { name: /^Revenue won per month/ });
  const box = (await revenue.boundingBox())!;
  await revenue.hover({ position: { x: box.width - 64, y: box.height / 2 } });
  const tooltip = page.locator(".recharts-tooltip-wrapper > div").filter({ hasText: "so far" });
  await expect(tooltip).toHaveCSS("background-color", RAISED.dark);

  await saveDealFromItsPage(page, deal.id);
  await expectMessage(page, "Deal saved.", "dark");

  await chooseTheme(page, "Light");
  await expectMode(page, "light");
  await saveDealFromItsPage(page, deal.id);
  await expectMessage(page, "Deal saved.", "light");
});

test("the Won stage and late cards take their dark colors", async ({ page, request }) => {
  await addLinkedDeal(request, "Won in either mode", { stage: "won", close_date: isoDay(-1) });
  await addLinkedDeal(request, "Late in either mode", { close_date: isoDay(-3) });

  for (const mode of ["light", "dark"] as const) {
    await page.goto("/pipeline");
    if (mode === "dark") await chooseTheme(page, "Dark");
    await expectMode(page, mode);
    const head = column(page, "won").locator("div").first();
    await expect(head).toHaveCSS("background-color", WON[mode].fill);
    await expect(head).toHaveCSS("color", WON[mode].text);
    await expect(card(page, "Late in either mode")).toHaveCSS("background-color", LATE_TINT[mode]);

    await page.goto("/deals?q=Won%20in%20either%20mode");
    const chip = page.getByRole("row", { name: /Won in either mode/ }).getByText("Won", { exact: true });
    await expect(chip).toHaveCSS("background-color", WON[mode].fill);
    await expect(chip).toHaveCSS("color", WON[mode].text);
  }
});

type LowContrast = { text: string; color: string; background: string; ratio: number };

/**
 * Every HTML text on the page, and every form control's text, under 4.5:1 against what's
 * behind it. SVG text is left to the chart tests, because what's behind it is drawn
 * too, and disabled controls are faded on purpose. The two agreed exceptions are allowed:
 * white on the brand's Cerulean and Raspberry fills.
 */
function findLowContrast(page: Page): Promise<LowContrast[]> {
  return page.evaluate(() => {
    type Rgba = [number, number, number, number];
    const pixel = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true })!;
    const known = new Map<string, Rgba>();
    // The canvas turns any CSS color, color-mix and oklab included, into sRGB.
    function rgba(color: string): Rgba {
      if (!known.has(color)) {
        pixel.clearRect(0, 0, 1, 1);
        pixel.fillStyle = color;
        pixel.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data;
        known.set(color, [r, g, b, a / 255]);
      }
      return known.get(color)!;
    }
    function over(top: Rgba, below: Rgba): Rgba {
      const mix = (index: number) => top[index] * top[3] + below[index] * (1 - top[3]);
      return [mix(0), mix(1), mix(2), 1];
    }
    function luminance([r, g, b]: Rgba) {
      const linear = (value: number) => {
        const share = value / 255;
        return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    }
    function ratio(one: Rgba, two: Rgba) {
      const [light, dark] = [luminance(one), luminance(two)].sort((a, b) => b - a);
      return (light + 0.05) / (dark + 0.05);
    }
    function behind(element: Element): Rgba {
      const layers: Rgba[] = [];
      for (let node: Element | null = element; node; node = node.parentElement) {
        const color = rgba(getComputedStyle(node).backgroundColor);
        if (color[3] > 0) layers.push(color);
        if (color[3] === 1) break;
      }
      return layers.reduceRight((below, layer) => over(layer, below), [255, 255, 255, 1] as Rgba);
    }
    function hidden(element: Element) {
      if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return true;
      if (element.closest(":disabled, [aria-disabled='true']")) return true;
      for (let node: Element | null = element; node; node = node.parentElement) {
        if (getComputedStyle(node).clipPath === "inset(50%)") return true; // Screen readers only
      }
      return false;
    }
    const BRAND_FILLS = ["17,138,178", "239,71,111"];
    const found: LowContrast[] = [];
    function check(element: Element, text: string, color: string) {
      const background = behind(element);
      const shown = over(rgba(color), background);
      const contrast = ratio(shown, background);
      const fill = background.slice(0, 3).map(Math.round).join();
      const agreed = BRAND_FILLS.includes(fill) && shown.slice(0, 3).every((value) => value === 255);
      if (contrast < 4.5 && !agreed) {
        found.push({ text: text.slice(0, 40), color, background: `rgb(${fill})`, ratio: Number(contrast.toFixed(2)) });
      }
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const element = node.parentElement!;
      const text = node.textContent!.trim();
      if (!text || element.closest("svg, script, style") || hidden(element)) continue;
      check(element, text, getComputedStyle(element).color);
    }
    for (const control of document.querySelectorAll<HTMLInputElement>(
      "input:not([type=checkbox]):not([type=hidden]), select, textarea",
    )) {
      if (hidden(control)) continue;
      if (control.value) check(control, control.value, getComputedStyle(control).color);
      else if (control.placeholder)
        check(control, control.placeholder, getComputedStyle(control, "::placeholder").color);
    }
    return found;
  });
}

for (const mode of ["light", "dark"] as const) {
  test(`text on every screen meets the contrast rules in ${mode} mode`, async ({ page, request }) => {
    test.slow();
    await page.emulateMedia({ reducedMotion: "reduce" });
    const firstId = async (route: string) => (await (await request.get(`/api${route}`)).json())[0].id;
    const records = [
      `/organizations/${await firstId("/organizations")}`,
      `/contacts/${await firstId("/contacts")}`,
      `/deals/${await firstId("/deals")}`,
    ];
    const products: { id: number; active: boolean }[] = await (await request.get("/api/products")).json();
    const invoices: { id: number; shows_as: string }[] = await (await request.get("/api/invoices")).json();
    const invoiceShowing = (shows: string) => `/invoices/${invoices.find((invoice) => invoice.shows_as === shows)!.id}`;
    const archived = products.find((product) => !product.active)!;
    const quotes: { id: number; status: string }[] = await (await request.get("/api/quotes")).json();
    const draft = quotes.find((quote) => quote.status === "draft")!;
    const sent = quotes.find((quote) => quote.status === "sent")!;
    const bills: { id: number; due_date: string; paid_on: string | null }[] = await (
      await request.get("/api/bills")
    ).json();
    const overdue = bills.find((bill) => bill.paid_on === null && bill.due_date < isoDay())!;
    await addLinkedDeal(request, `Late for the ${mode} sweep`, { close_date: isoDay(-3) });

    const screens: { path: string; ready: (page: Page) => Promise<void> }[] = [
      { path: "/", ready: (page) => expect(page.getByTestId("follow-up").first()).toBeVisible() },
      ...["/organizations", "/contacts?status=lead", "/deals"].map((path) => ({
        path,
        ready: (page: Page) => expect(page.locator("tbody tr").first()).toBeVisible(),
      })),
      ...records.map((path) => ({
        path,
        ready: (page: Page) => expect(page.getByTestId("timeline-entry").first()).toBeVisible(),
      })),
      { path: "/pipeline", ready: (page) => expect(card(page, `Late for the ${mode} sweep`)).toBeVisible() },
      { path: "/settings", ready: (page) => expect(page.getByLabel("Company name")).toBeVisible() },
      {
        path: "/settings",
        ready: async (page) => {
          await page.getByLabel("Company name").fill("");
          await page.getByRole("button", { name: "Save settings" }).click();
          await expect(page.getByText("Enter the company name")).toBeVisible();
        },
      },
      { path: "/quotes", ready: (page) => expect(page.locator("tbody tr").first()).toBeVisible() },
      { path: "/quotes?status=sent", ready: (page) => expect(page.locator("tbody tr").first()).toBeVisible() },
      ...[draft, sent].map((quote) => ({
        path: `/quotes/${quote.id}`,
        ready: (page: Page) => expect(page.getByRole("article", { name: "Preview" })).toContainText("Total"),
      })),
      {
        path: `/quotes/${draft.id}`,
        ready: async (page: Page) => {
          await page.locator("#quote-line-0-quantity").fill("lots");
          await page.getByRole("button", { name: "Save quote" }).click();
          await expect(page.getByText("Enter a whole number from 1 to 1,000,000")).toBeVisible();
        },
      },
      { path: "/invoices", ready: (page) => expect(page.locator("tbody tr").first()).toBeVisible() },
      ...["draft", "part_paid", "overdue", "paid", "void"].map((shows) => ({
        path: invoiceShowing(shows),
        ready: (page: Page) => expect(page.getByRole("img", { name: /^Invoice preview, page 1/ })).toBeVisible(),
      })),
      {
        path: invoiceShowing("issued"),
        ready: async (page) => {
          await page.getByRole("button", { name: "Record payment" }).click();
          await page.getByRole("dialog").getByLabel("Amount").fill("0");
          await page.getByRole("dialog").getByRole("button", { name: "Record payment" }).click();
          await expect(page.getByRole("dialog").getByText("Enter an amount more than $0.00")).toBeVisible();
        },
      },
      {
        path: "/",
        ready: async (page) => {
          await page.getByRole("heading", { level: 2, name: "Money" }).scrollIntoViewIfNeeded();
          await expect(page.getByRole("list", { name: "How late" })).toBeVisible();
        },
      },
      {
        path: "/products?archived=1",
        ready: (page) => expect(page.locator("tbody").getByText("Archived").first()).toBeVisible(),
      },
      {
        path: `/products/${archived.id}`,
        ready: (page) => expect(page.getByRole("button", { name: "Restore", exact: true })).toBeVisible(),
      },
      {
        // Overdue first, so every status's chip is on the first page.
        path: "/bills?status=all&sort=status&dir=asc",
        ready: async (page) => {
          await expect(page.locator("tbody tr").first()).toBeVisible();
          for (const status of ["Overdue", "Unpaid", "Paid"]) {
            await expect(page.locator("tbody").getByText(status, { exact: true }).first()).toBeVisible();
          }
        },
      },
      {
        path: `/bills/${overdue.id}`,
        ready: (page) => expect(page.getByRole("main").getByText("Overdue", { exact: true })).toBeVisible(),
      },
      {
        path: "/",
        ready: async (page) => {
          const money = page.getByRole("region", { name: "Money" });
          await money.getByRole("img", { name: /^Spending by category/ }).scrollIntoViewIfNeeded();
          await expect(money.getByRole("img", { name: /bills due from today/ })).toBeVisible();
          await expect(
            money.getByRole("region", { name: "Spending by category" }).getByText("so far", { exact: true }),
          ).toBeVisible();
        },
      },
      {
        path: "/deals",
        ready: async (page) => {
          await page.getByRole("button", { name: "Add deal" }).click();
          await page.getByRole("dialog").getByRole("button", { name: "Save deal" }).click();
          await expect(page.getByRole("dialog").getByText("Enter a name")).toBeVisible();
        },
      },
      {
        path: records[2],
        ready: async (page) => {
          await page.getByRole("button", { name: "Delete", exact: true }).click();
          await expect(page.getByRole("alertdialog")).toContainText("This can't be undone.");
        },
      },
      {
        path: "/",
        ready: async (page) => {
          await menuButton(page).click();
          await expect(menu(page)).toContainText(SIGNED_IN.name);
        },
      },
      {
        path: "/",
        ready: async (page) => {
          await page.getByRole("combobox", { name: SEARCH_BOX }).fill("an");
          const results = page.getByRole("listbox", { name: "Search results" });
          await expect(results.getByRole("option").first()).toBeVisible();
        },
      },
      // Last, since it signs out.
      {
        path: "/",
        ready: async (page) => {
          await signOut(page);
          await expect(page.getByRole("button", { name: SIGNED_IN.name })).toBeVisible();
        },
      },
    ];

    await page.goto("/");
    if (mode === "dark") await chooseTheme(page, "Dark");
    const low: Record<string, LowContrast[]> = {};
    for (const screen of screens) {
      await page.goto(screen.path);
      await expectMode(page, mode);
      await screen.ready(page);
      const found = await findLowContrast(page);
      if (found.length) low[screen.path] = found;
    }
    expect(low).toEqual({});
  });
}

test("choosing Profit and loss in the menu opens its page", async ({ page }) => {
  await page.goto("/");
  await menuButton(page).click();
  await menu(page).getByRole("menuitem", { name: "Profit and loss" }).click();

  await expect(page).toHaveURL(/\/accounting\/profit-and-loss$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Profit and loss");
  await expect(page.getByRole("region", { name: "Statement" })).toBeVisible();
});
