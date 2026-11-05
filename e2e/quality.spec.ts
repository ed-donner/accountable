import type { APIRequestContext, Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import {
  SIGNED_IN,
  addActivity,
  addLinkedDeal,
  addQuote,
  card,
  column,
  dropAtEnd,
  findProduct,
  isoDay,
  resetToSampleData,
  sendQuote,
} from "./helpers";

test.beforeAll(resetToSampleData);

const SECTIONS = ["/", "/organizations", "/contacts", "/deals", "/pipeline", "/products", "/quotes"];
const SIZES = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
];

async function recordPaths(request: APIRequestContext) {
  const get = async (route: string) => (await (await request.get(`/api${route}`)).json())[0].id;
  const quotes: { id: number; status: string }[] = await (await request.get("/api/quotes")).json();
  return [
    `/organizations/${await get("/organizations")}`,
    `/contacts/${await get("/contacts")}`,
    `/deals/${await get("/deals")}`,
    `/products/${await get("/products")}`,
    `/quotes/${quotes[quotes.length - 1].id}`,
    `/quotes/${quotes.find((quote) => quote.status === "draft")!.id}`,
  ];
}

/** A draft on a deal of its own, with two lines from the sample price list. */
async function addDraft(request: APIRequestContext, name: string) {
  const { deal } = await addLinkedDeal(request, name, { stage: "proposal" });
  const product = await findProduct(request, "Standard license, per user per year");
  const line = { product_id: product.id, quantity: 2, unit_price_cents: product.unit_price_cents };
  return addQuote(request, deal.id, [line, line]);
}

function sidewaysOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/** The Company settings page, once its form has the settings in it. */
async function openSettings(page: Page) {
  await page.goto("/settings");
  await expect(page.getByLabel("Company name")).toHaveValue(/./);
}

for (const size of SIZES) {
  test(`no screen scrolls sideways at ${size.width} by ${size.height}`, async ({ page, request }) => {
    await page.setViewportSize(size);
    for (const path of [...SECTIONS, ...(await recordPaths(request))]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await sidewaysOverflow(page), path).toBeLessThanOrEqual(0);
    }
    await openSettings(page);
    expect(await sidewaysOverflow(page), "/settings").toBeLessThanOrEqual(0);
  });
}

test("the top bar's sections show their icons from 1536px wide, and only their labels below", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 900 });
  await page.goto("/");
  const links = page.getByRole("navigation", { name: "Sections" }).getByRole("link");
  await expect(links).toHaveCount(7);
  for (const link of await links.all()) await expect(link.locator("svg")).toBeVisible();

  for (const width of [1535, 1440, 1280]) {
    await page.setViewportSize({ width, height: 720 });
    for (const link of await links.all()) await expect(link.locator("svg"), `${width}px`).toBeHidden();
  }
});

test("a walk through every screen and main action logs no console errors", async ({ page, request }) => {
  const { deal, contact, organization } = await addLinkedDeal(request, "Walked");
  for (const path of SECTIONS) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  for (const path of [`/organizations/${organization.id}`, `/contacts/${contact.id}`, `/deals/${deal.id}`]) {
    await page.goto(path);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toContainText("This can't be undone.");
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  }
  await page.goto(`/deals/${deal.id}`);
  await page.getByRole("button", { name: "Log activity" }).click();
  await page.getByRole("dialog").getByLabel("Description").fill("Walked through it");
  await page.getByRole("dialog").getByRole("button", { name: "Save activity" }).click();
  await expect(page.getByTestId("timeline-entry").first()).toContainText("Walked through it");

  await page.goto("/pipeline");
  await expect(card(page, "Walked")).toBeVisible();
  await dropAtEnd(page, "Walked", "lost");
  await expect(column(page, "lost").locator('[data-deal="Walked"]')).toBeVisible();
  await page.waitForLoadState("networkidle");

  // A quote: a draft saved, each of its dialogs opened, and a sent one's Accept.
  const draft = await addDraft(request, "Quoted");
  await page.goto(`/quotes/${draft.id}`);
  await page.locator("#quote-line-0-quantity").fill("3");
  const quoteSaved = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" && new URL(response.url()).pathname === `/api/quotes/${draft.id}`,
  );
  await page.getByRole("button", { name: "Save quote" }).click();
  expect((await quoteSaved).ok()).toBe(true);
  await expect(page.getByText("Quote saved.")).toBeVisible();
  for (const [button, asks] of [
    ["Mark as sent", "as sent?"],
    ["Decline", "Decline "],
  ]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    await expect(page.getByRole("alertdialog")).toContainText(asks);
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  }
  await sendQuote(request, draft.id);
  await page.goto(`/quotes/${draft.id}`);
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("will move to Won");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await page.goto("/quotes");
  await page.getByRole("button", { name: "New quote" }).click();
  await expect(page.getByRole("dialog", { name: "New quote" })).toBeVisible();
  await page.keyboard.press("Escape");

  // A save with nothing changed, which leaves the settings as they were.
  await openSettings(page);
  const saved = page.waitForResponse(
    (response) => response.request().method() === "PATCH" && new URL(response.url()).pathname === "/api/settings",
  );
  await page.getByRole("button", { name: "Save settings" }).click();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByText("Settings saved.")).toBeVisible();
});

async function tabThrough(page: Page, presses: number) {
  const reached = new Set<string>();
  for (let press = 0; press < presses; press += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) return null;
      const style = getComputedStyle(element);
      // cmdk labels its input through a hidden label element, and a checkbox sits in its label.
      const labelledBy = element.getAttribute("aria-labelledby");
      const label =
        element.getAttribute("aria-label") ??
        (labelledBy && document.getElementById(labelledBy)?.textContent) ??
        (element as HTMLInputElement).labels?.[0]?.textContent;
      return {
        name: `${element.tagName} ${label || element.textContent?.trim().slice(0, 30)}`,
        ring: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2,
      };
    });
    if (!focused) continue;
    expect(focused.ring, `No focus ring on ${focused.name}`).toBe(true);
    reached.add(focused.name);
  }
  return reached;
}

test("every control can be reached by Tab and shows a focus ring", async ({ page }) => {
  await page.goto("/organizations");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  // Past the seven sections, the search box, the menu, Add, the table's search and its headings.
  const table = await tabThrough(page, 22);
  for (const name of [
    "A Dashboard",
    "A Deals",
    "A Products",
    "INPUT Search organizations, contacts, deals and products",
    `BUTTON Menu for ${SIGNED_IN.name}`,
    "BUTTON Add organization",
    "INPUT Search organizations",
    "BUTTON Name",
  ]) {
    expect([...table], name).toContain(name);
  }
  expect([...table].some((name) => name.startsWith("BUTTON Edit "))).toBe(true);
  expect([...table].some((name) => name.startsWith("BUTTON Delete "))).toBe(true);

  await page.goto("/");
  await expect(page.getByTestId("follow-up").first()).toBeVisible();
  const dashboard = await tabThrough(page, 19);
  expect([...dashboard].some((name) => name.startsWith("INPUT Mark "))).toBe(true);
  expect([...dashboard]).toContain("A Open the pipeline");

  await page.goto("/pipeline");
  await expect(page.locator("[data-deal]").first()).toBeVisible();
  const board = await tabThrough(page, 13);
  expect([...board].some((name) => name.startsWith("BUTTON Add deal to "))).toBe(true);
  expect([...board].some((name) => name.startsWith("A $"))).toBe(true);

  await page.goto("/products");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  const products = await tabThrough(page, 18);
  for (const name of ["BUTTON Add product", "INPUT Search products", "INPUT Show archived (2)", "BUTTON Unit price"]) {
    expect([...products], name).toContain(name);
  }
  expect([...products].some((name) => name.startsWith("BUTTON Archive "))).toBe(true);
});

test("a draft quote's form can be tabbed through, with a focus ring on each control", async ({ page, request }) => {
  const draft = await addDraft(request, "Tabbed");
  await page.goto(`/quotes/${draft.id}`);
  await expect(page.getByLabel("Valid until")).toBeVisible();
  await page.getByRole("button", { name: "Download PDF" }).focus();
  const reached = await tabThrough(page, 18);
  for (const name of [
    "INPUT Valid until",
    "BUTTON Remove Standard license, per user per year",
    "TEXTAREA Description",
    "INPUT Quantity",
    "INPUT Unit price",
    "BUTTON Add product",
  ]) {
    expect([...reached], name).toContain(name);
  }
});

/** How many lines each element's text takes up. */
function linesOf(elements: Locator) {
  return elements.evaluateAll((found) =>
    found.map((element) => {
      const tops = new Set<number>();
      for (const node of element.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) tops.add(Math.round(rect.top));
      }
      return tops.size;
    }),
  );
}

test("the top bar stays on one line at 1280 by 720, even with the widest date", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 30, 12, 0) });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/products");
  const bar = page.getByRole("banner");
  await expect(bar).toContainText("Nov 30, 2026");
  await expect(bar.getByRole("button", { name: `Menu for ${SIGNED_IN.name}` })).toBeVisible();

  expect((await bar.boundingBox())!.height).toBe(56);
  expect(await linesOf(bar.getByRole("navigation", { name: "Sections" }).getByRole("link"))).toEqual([
    1, 1, 1, 1, 1, 1, 1,
  ]);
  const date = bar.getByText("Nov 30, 2026");
  expect(await linesOf(date)).toEqual([1]);
  for (const part of [
    bar.getByRole("navigation", { name: "Sections" }),
    bar.getByRole("combobox"),
    date,
    bar.getByRole("button", { name: `Menu for ${SIGNED_IN.name}` }),
  ]) {
    const box = (await part.boundingBox())!;
    const barBox = (await bar.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(barBox.y);
    expect(box.y + box.height).toBeLessThanOrEqual(barBox.y + barBox.height);
    expect(box.x + box.width).toBeLessThanOrEqual(barBox.x + barBox.width);
  }
});

test("the Company settings form can be tabbed through in order, with a focus ring on each box", async ({ page }) => {
  await openSettings(page);
  await page
    .getByRole("banner")
    .getByRole("button", { name: `Menu for ${SIGNED_IN.name}` })
    .focus();
  const reached = [...(await tabThrough(page, 10))];
  expect(reached).toEqual([
    "INPUT Company name",
    "TEXTAREA Address",
    "INPUT Email",
    "INPUT Phone",
    "INPUT Tax label",
    "INPUT Tax rate",
    "INPUT Payment terms",
    "INPUT Quote prefix",
    "INPUT Invoice prefix",
    "BUTTON Save settings",
  ]);
});

/** Opens the dashboard from another screen and records the revenue line on every frame while it mounts. */
async function lineFrames(page: Page) {
  await page.goto("/deals");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  const frames = page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const seen = new Set<string>();
        const start = performance.now();
        const sample = () => {
          const line = document.querySelector(".recharts-line-curve");
          if (line) seen.add(line.getAttribute("stroke-dasharray") ?? "none");
          if (performance.now() - start < 2500) requestAnimationFrame(sample);
          else resolve([...seen]);
        };
        requestAnimationFrame(sample);
      }),
  );
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Dashboard" }).click();
  return frames;
}

test("the revenue line draws in on load", async ({ page }) => {
  expect((await lineFrames(page)).length).toBeGreaterThan(1);
});

test("with reduced motion set, nothing animates", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect((await lineFrames(page)).length).toBe(1);

  await page.goto("/deals");
  await page.getByRole("button", { name: "Add deal" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const running = await page.evaluate(
    () => document.getAnimations().filter((item) => item.playState === "running").length,
  );
  expect(running).toBe(0);
});

test("after the browser reports offline, a drag and a follow-up tick still save", async ({ page, request }) => {
  const { deal } = await addLinkedDeal(request, "Offline drag");
  await addActivity(request, { deal_id: deal.id, description: "Offline tick", follow_up_date: isoDay(-200) });

  await page.goto("/pipeline");
  await expect(card(page, "Offline drag")).toBeVisible();
  // Only the browser's report changes: the backend is still there on this computer,
  // and that's exactly what TanStack Query would otherwise wrongly pause for.
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));

  await dropAtEnd(page, "Offline drag", "qualified");
  await expect(column(page, "qualified").locator('[data-deal="Offline drag"]')).toBeVisible();
  await expect.poll(async () => (await (await request.get(`/api/deals/${deal.id}`)).json()).stage).toBe("qualified");

  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Dashboard" }).click();
  await page.getByTestId("follow-up").filter({ hasText: "Offline tick" }).getByRole("checkbox").click();
  await expect
    .poll(async () => {
      const timeline = await (await request.get(`/api/deals/${deal.id}/timeline`)).json();
      return timeline.entries.find((entry: { description: string }) => entry.description === "Offline tick")
        .follow_up_done;
    })
    .toBe(true);
});

test("the run uses the installed Chrome", async ({ page, browser, browserName }) => {
  expect(browserName).toBe("chromium");
  await page.goto("/");
  const brands = await page.evaluate(() =>
    (navigator as Navigator & { userAgentData: { brands: { brand: string }[] } }).userAgentData.brands.map(
      (item) => item.brand,
    ),
  );
  expect(brands).toContain("Google Chrome");
  expect(browser.version()).toMatch(/^\d+\./);
});

test.describe("a tab left open past midnight", () => {
  const PAST_MIDNIGHT = "03:00";

  function shownDate(offsetDays: number) {
    const day = new Date();
    day.setDate(day.getDate() + offsetDays);
    return day.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  /** Only the browser's clock moves, so the backend stays on today, as it does before midnight. */
  async function openBeforeMidnight(page: Page, path: string) {
    const tonight = new Date();
    tonight.setHours(23, 58, 0, 0);
    await page.clock.install({ time: tonight });
    await page.goto(path);
    await expect(page.getByRole("banner")).toContainText(shownDate(0));
  }

  test("the top bar and a pipeline card move on by themselves", async ({ page, request }) => {
    await addLinkedDeal(request, "Due on the board", { close_date: isoDay() });
    await openBeforeMidnight(page, "/pipeline");
    await expect(card(page, "Due on the board")).toBeVisible();
    await expect(card(page, "Due on the board").getByText("Late")).toHaveCount(0);

    await page.clock.fastForward(PAST_MIDNIGHT);

    await expect(page.getByRole("banner")).toContainText(shownDate(1));
    await expect(card(page, "Due on the board").getByText("Late")).toBeVisible();
  });

  test("the deals table moves on by itself", async ({ page, request }) => {
    await addLinkedDeal(request, "Due in the table", { close_date: isoDay() });
    await openBeforeMidnight(page, "/deals?q=Due%20in%20the%20table");
    const row = page.getByRole("row", { name: /Due in the table/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("Late")).toHaveCount(0);

    await page.clock.fastForward(PAST_MIDNIGHT);

    await expect(row.getByText("Late")).toBeVisible();
  });

  test("a deal's page and its timeline move on by themselves", async ({ page, request }) => {
    const { deal } = await addLinkedDeal(request, "Due on its page", { close_date: isoDay() });
    await addActivity(request, { deal_id: deal.id, description: "Ring them back", follow_up_date: isoDay() });
    await openBeforeMidnight(page, `/deals/${deal.id}`);
    await expect(page.getByText("Ring them back")).toBeVisible();
    await expect(page.getByText("Late", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Overdue", { exact: true })).toHaveCount(0);

    await page.clock.fastForward(PAST_MIDNIGHT);

    await expect(page.getByText("Late", { exact: true })).toBeVisible();
    await expect(page.getByText("Overdue", { exact: true })).toBeVisible();
  });

  test("the dashboard reads its figures again", async ({ page }) => {
    await openBeforeMidnight(page, "/");
    await expect(page.getByTestId("summary")).toBeVisible();

    const reading = page.waitForRequest((sent) => new URL(sent.url()).pathname === "/api/dashboard");
    await page.clock.fastForward(PAST_MIDNIGHT);

    await reading;
  });

  test("a laptop waking the next morning catches up when its window is used", async ({ page, request }) => {
    await addLinkedDeal(request, "Due before the laptop slept", { close_date: isoDay() });
    await openBeforeMidnight(page, "/pipeline");
    await expect(card(page, "Due before the laptop slept")).toBeVisible();

    // The clock jumps and no timer runs, which is what sleeping looks like to the page.
    const morning = new Date();
    morning.setDate(morning.getDate() + 1);
    morning.setHours(8, 0, 0, 0);
    await page.clock.setSystemTime(morning);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));

    await expect(page.getByRole("banner")).toContainText(shownDate(1));
    await expect(card(page, "Due before the laptop slept").getByText("Late")).toBeVisible();
  });
});
