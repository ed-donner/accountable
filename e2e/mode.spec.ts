import type { Page, Route } from "@playwright/test";

import { expect, test } from "./fixtures";
import { addLinkedDeal, card, column, isoDay, resetToSampleData } from "./helpers";

test.beforeAll(resetToSampleData);

type Mode = "light" | "dark";

// The spec's Color tokens, as the browser reports them.
const SURFACES = {
  light: { page: "rgb(240, 244, 245)", panel: "rgb(255, 255, 255)", ink: "rgb(7, 59, 76)" },
  dark: { page: "rgb(4, 35, 46)", panel: "rgb(11, 50, 64)", ink: "rgb(205, 216, 219)" },
};
const FOCUS = { light: "rgb(17, 138, 178)", dark: "rgb(76, 179, 214)" };
const SECTIONS = ["/", "/organizations", "/contacts", "/deals", "/pipeline"];

function modeButton(page: Page) {
  return page.getByRole("banner").getByRole("button", { name: /^Switch to (dark|light) mode$/ });
}

async function expectMode(page: Page, mode: Mode) {
  const colors = SURFACES[mode];
  await expect(page.locator("html")).toHaveCSS("color-scheme", mode === "dark" ? "dark" : /^(normal|light)$/);
  await expect(page.locator("body")).toHaveCSS("background-color", colors.page);
  await expect(page.locator("body")).toHaveCSS("color", colors.ink);
  await expect(page.getByRole("banner")).toHaveCSS("background-color", colors.panel);
  await expect(modeButton(page)).toHaveAccessibleName(`Switch to ${mode === "dark" ? "light" : "dark"} mode`);
}

/** Switches to dark mode and back, from wherever the page is. */
async function switchBothWays(page: Page) {
  await modeButton(page).click();
  await expectMode(page, "dark");
  await modeButton(page).click();
  await expectMode(page, "light");
}

test("the app opens in light mode, and the button switches to dark and back", async ({ page }) => {
  // Light is the default whatever the device's own setting.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.getByTestId("summary")).toBeVisible();
  await expectMode(page, "light");

  await switchBothWays(page);
});

test("the choice is remembered after a reload and in a new tab", async ({ page }) => {
  await page.goto("/");
  await modeButton(page).click();
  await expectMode(page, "dark");

  await page.reload();
  await expectMode(page, "dark");

  const tab = await page.context().newPage();
  await tab.goto("/pipeline");
  await expectMode(tab, "dark");
  await tab.close();

  await modeButton(page).click();
  await expectMode(page, "light");
  await page.reload();
  await expectMode(page, "light");
});

test("a saved dark choice is in place before the app's script runs", async ({ page }) => {
  await page.goto("/");
  await modeButton(page).click();
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

test("the button is on every screen and works there", async ({ page, request, expectConsoleError }) => {
  expectConsoleError(/404 \(Not Found\).*\/api\/deals\/\d+/);
  expectConsoleError(/ERR_CONNECTION_REFUSED|Failed to fetch/);
  const { deal } = await addLinkedDeal(request, "Mode everywhere");
  const { deal: gone } = await addLinkedDeal(request, "Mode gone");
  await request.delete(`/api/deals/${gone.id}`);

  const screens: [string, RegExp | string][] = [
    ...SECTIONS.map((path): [string, RegExp] => [path, /^(Dashboard|Organizations|Contacts|Deals|Pipeline)$/]),
    [`/deals/${deal.id}`, "Mode everywhere"],
    [`/deals/${gone.id}`, "This deal no longer exists"],
    ["/nothing-here", "This page no longer exists"],
  ];
  for (const [path, heading] of screens) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading }), path).toBeVisible();
    await switchBothWays(page);
  }

  await page.route("**/api/**", (route) => route.abort("connectionrefused"));
  await page.goto("/organizations");
  await expect(page.getByRole("alert")).toHaveText("Can't reach Accountable. Check that it's still running.");
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

  await modeButton(page).click();
  await expectMode(page, "dark");

  expect(page.url()).toBe(address);
  await expect(page.getByRole("searchbox", { name: "Search organizations" })).toHaveValue("e");
  await expect(page.locator("tbody tr")).toHaveCount(rows);
  expect(await page.evaluate(() => window.scrollY)).toBe(20);
  expect(await page.evaluate(() => "notReloaded" in window)).toBe(true);
});

test("the button can be reached by Tab, shows a focus ring, and works with Enter and Space", async ({ page }) => {
  await page.goto("/organizations");
  await expect(page.locator("tbody tr").first()).toBeVisible();

  const sections = page.getByRole("navigation", { name: "Sections" }).getByRole("link");
  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press("Tab");
    await expect(sections.nth(index)).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(modeButton(page)).toBeFocused();
  await expect(modeButton(page)).toHaveCSS("outline-color", FOCUS.light);
  await expect(modeButton(page)).toHaveCSS("outline-style", "solid");

  await page.keyboard.press("Enter");
  await expectMode(page, "dark");
  await expect(modeButton(page)).toBeFocused();
  await expect(modeButton(page)).toHaveCSS("outline-color", FOCUS.dark);

  await page.keyboard.press("Space");
  await expectMode(page, "light");
  await expect(modeButton(page)).toHaveCSS("outline-color", FOCUS.light);
});

const RAISED = { light: "rgb(255, 255, 255)", dark: "rgb(18, 64, 79)" };
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
  await modeButton(page).click();
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

  await modeButton(page).click();
  await expectMode(page, "light");
  await saveDealFromItsPage(page, deal.id);
  await expectMessage(page, "Deal saved.", "light");
});

test("the Won stage and late cards take their dark colors", async ({ page, request }) => {
  await addLinkedDeal(request, "Won in either mode", { stage: "won", close_date: isoDay(-1) });
  await addLinkedDeal(request, "Late in either mode", { close_date: isoDay(-3) });

  for (const mode of ["light", "dark"] as const) {
    await page.goto("/pipeline");
    if (mode === "dark") await modeButton(page).click();
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
    ];

    await page.goto("/");
    if (mode === "dark") await modeButton(page).click();
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
