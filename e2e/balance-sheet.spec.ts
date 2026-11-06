import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { addBill, addIssuedInvoice, isoDay, resetToSampleData } from "./helpers";

// The Balance sheet page (X1 to X18), on a fresh copy with the sample data.

test.beforeEach(resetToSampleData);

const ACCOUNTS = ["Cash", "Receivable", "Payable", "Tax payable", "Owner's equity", "Profit to date"] as const;
const OWNS = "What the business owns";
const OWES = "What it owes and what's the owner's";
const EXPENSES = ["software", "contractors", "travel", "office", "marketing", "other"].map((name) => `expense_${name}`);
const COLORS = {
  light: { seaGreen: "rgb(6, 214, 160)", ink: "rgb(7, 59, 76)", midnight: "rgb(7, 59, 76)" },
  dark: { seaGreen: "rgb(6, 214, 160)", ink: "rgb(205, 216, 219)", midnight: "rgb(7, 59, 76)" },
};
const FOCUS = "rgb(17, 138, 178)";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const slider = (page: Page) => page.getByRole("slider", { name: "Date" });
const panel = (page: Page) => page.getByRole("region", { name: "Balance sheet" });
const chart = (page: Page) => panel(page).getByRole("img", { name: /^The two sides of the balance sheet/ });

/** An account's figure, which is a button named by the account and the figure. */
function figure(page: Page, name: string) {
  return panel(page).getByRole("button", { name: new RegExp(`^${name}: `) });
}

function menuButton(page: Page) {
  return page.getByRole("banner").getByRole("button", { name: /^Menu( for .+)?$/ });
}

/** Whole cents from an amount as the page shows it, such as -$4,250.00. */
function cents(text: string | null): bigint {
  const found = /(-?)\$([\d,]+)\.(\d\d)/.exec(text ?? "");
  if (!found) throw new Error(`No amount in ${text}`);
  const size = BigInt(found[2].replaceAll(",", "") + found[3]);
  return found[1] ? -size : size;
}

/** A day written out, such as Oct 31, 2026, as 2026-10-31. */
function isoOf(written: string | null) {
  const found = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/.exec(written ?? "");
  if (!found) throw new Error(`No day in ${written}`);
  return `${found[3]}-${String(MONTHS.indexOf(found[1]) + 1).padStart(2, "0")}-${found[2].padStart(2, "0")}`;
}

type Books = Record<string, bigint>;

async function booksOn(request: APIRequestContext, day: string): Promise<Books> {
  const reply = await request.get(`/api/books/balances?on=${day}`);
  expect(reply.ok()).toBe(true);
  const { accounts } = (await reply.json()) as { accounts: { key: string; balance_cents: string }[] };
  return Object.fromEntries(accounts.map((account) => [account.key, BigInt(account.balance_cents)]));
}

/** What the six figures should read, from the books. */
function expected(books: Books): Record<(typeof ACCOUNTS)[number], bigint> {
  return {
    Cash: books.cash,
    Receivable: books.receivable,
    Payable: books.payable,
    "Tax payable": books.tax_payable,
    "Owner's equity": books.owners_equity,
    "Profit to date": EXPENSES.reduce((profit, key) => profit - books[key], books.revenue),
  };
}

async function figures(page: Page) {
  return Object.fromEntries(
    await Promise.all(ACCOUNTS.map(async (name) => [name, cents(await figure(page, name).textContent())] as const)),
  );
}

function column(page: Page, name: string) {
  return panel(page).getByRole("region", { name });
}

async function total(page: Page, name: string) {
  return cents(await column(page, name).getByText("Total").locator("xpath=..").textContent());
}

/** Each bar's top and bottom as drawn, left then right. */
async function bars(page: Page) {
  return chart(page)
    .locator("path.recharts-rectangle")
    .evaluateAll((paths) => {
      const boxes = paths.map((path) => ({
        x: Number(path.getAttribute("x")),
        top: Number(path.getAttribute("y")),
        bottom: Number(path.getAttribute("y")) + Number(path.getAttribute("height")),
      }));
      const middle = (Math.min(...boxes.map((box) => box.x)) + Math.max(...boxes.map((box) => box.x))) / 2;
      return [boxes.filter((box) => box.x <= middle), boxes.filter((box) => box.x > middle)].map((side) => ({
        top: Math.min(...side.map((box) => box.top)),
        bottom: Math.max(...side.map((box) => box.bottom)),
      }));
    });
}

/** Opens the page and waits for the figures of today to be drawn. */
async function open(page: Page) {
  await page.goto("/accounting/balance-sheet");
  await expect(figure(page, "Cash")).toBeVisible();
  await expect(chart(page).locator("path.recharts-rectangle").first()).toBeVisible();
}

test("opens from the menu on today with its title, the 12 stops and the day above the figures", async ({ page }) => {
  await page.goto("/");
  await menuButton(page).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Balance sheet" }).click();

  await expect(page).toHaveURL(/\/accounting\/balance-sheet$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Balance sheet");
  await expect(figure(page, "Cash")).toBeVisible();
  await expect(panel(page).locator("ol > li")).toHaveCount(12);
  await expect(panel(page).locator("ol > li").last()).toHaveText("Today");
  await expect(slider(page)).toHaveAttribute("max", "11");
  await expect(slider(page)).toHaveValue("11");
  await expect(panel(page).getByRole("heading", { level: 2 }).first()).toHaveText(
    new RegExp(`^${MONTHS[new Date().getMonth()]} ${new Date().getDate()}, ${new Date().getFullYear()}$`),
  );
  await expect(page.locator('nav[aria-label="Sections"] a')).toHaveCount(9);
  await expect(page.locator('nav[aria-label="Sections"] a[aria-current="page"]')).toHaveCount(0);
  await expect(panel(page)).toHaveCSS("width", "960px");
});

test("at each of the 12 stops every figure is above zero and the books' own, the sides are equal and the bars match", async ({
  page,
  request,
}) => {
  await open(page);
  await slider(page).focus();
  await page.keyboard.press("Home");
  await expect(slider(page)).toHaveValue("0");

  for (let stop = 0; stop < 12; stop += 1) {
    if (stop > 0) await page.keyboard.press("ArrowRight");
    await expect(slider(page)).toHaveValue(String(stop));
    const day = isoOf(await slider(page).getAttribute("aria-valuetext"));
    await expect(panel(page).getByRole("heading", { level: 2 }).first()).toHaveText(
      (await slider(page).getAttribute("aria-valuetext"))!,
    );
    const want = expected(await booksOn(request, day));
    // The figures for the day have arrived when Cash is the books' Cash.
    await expect(async () => expect((await figures(page)).Cash).toBe(want.Cash)).toPass();
    expect(await figures(page), day).toEqual(want);
    for (const name of ACCOUNTS) expect(want[name], `${name} on ${day}`).toBeGreaterThan(0n);

    const left = await total(page, OWNS);
    const right = await total(page, OWES);
    expect(left).toBe(want.Cash + want.Receivable);
    expect(right).toBe(want.Payable + want["Tax payable"] + want["Owner's equity"] + want["Profit to date"]);
    expect(left).toBe(right);
    await expect(panel(page).getByText("The two sides are equal.")).toBeVisible();
    await expect(panel(page).getByText("Out of balance")).toHaveCount(0);

    await expect(chart(page).locator("path.recharts-rectangle")).toHaveCount(6);
    const [bar, other] = await bars(page);
    expect(bar.top).toBeCloseTo(other.top, 0);
    expect(bar.bottom).toBeCloseTo(other.bottom, 0);
    expect(bar.bottom - bar.top).toBeGreaterThan(100);
  }
});

test("the slider is named Date with the day as its value, moves by keyboard and shows the focus ring", async ({
  page,
}) => {
  await open(page);
  await expect(slider(page)).toHaveAttribute("aria-valuetext", /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
  await slider(page).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(slider(page)).toHaveValue("10");
  await page.keyboard.press("ArrowDown");
  await expect(slider(page)).toHaveValue("9");
  await page.keyboard.press("ArrowUp");
  await expect(slider(page)).toHaveValue("10");
  await page.keyboard.press("Home");
  await expect(slider(page)).toHaveValue("0");
  await expect(panel(page).locator("ol > li").first()).toContainText(/^\w{3}\d{4}$/);
  await page.keyboard.press("End");
  await expect(slider(page)).toHaveValue("11");

  // Chrome doesn't give a slider thumb's computed style, so this checks the slider shows keyboard focus,
  // the thumb's ring rule is in the page's styles, and its color is the app's focus color.
  const ring = await slider(page).evaluate((input) => {
    const flat = (rules: CSSRuleList): CSSRule[] =>
      [...rules].flatMap((rule) => (rule instanceof CSSGroupingRule ? flat(rule.cssRules) : [rule]));
    const rule = [...document.styleSheets]
      .flatMap((sheet) => flat(sheet.cssRules))
      .find(
        (each): each is CSSStyleRule =>
          each instanceof CSSStyleRule && each.selectorText === ".date-slider:focus-visible::-webkit-slider-thumb",
      );
    const probe = document.createElement("span");
    probe.style.color = "var(--color-focus)";
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return { focused: input.matches(":focus-visible"), outline: rule?.style.outline, color };
  });
  expect(ring).toEqual({ focused: true, outline: "2px solid var(--color-focus)", color: FOCUS });
  const chosen = panel(page).locator("ol > li").last().getByText("Today", { exact: true });
  await expect(chosen).toHaveCSS("font-weight", "600");
});

test("clicking Cash lists its entries up to the day, adding up to the figure, and Escape gives focus back", async ({
  page,
}) => {
  await open(page);
  const cash = cents(await figure(page, "Cash").textContent());
  const day = isoOf(await slider(page).getAttribute("aria-valuetext"));
  await figure(page, "Cash").click();

  const dialog = page.getByRole("dialog", { name: /^Cash up to / });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/^Balance on /)).toBeVisible();
  const rows = dialog.getByRole("listitem");
  await expect(rows.first()).toBeVisible();

  const status = dialog.getByText(/^Showing \d+ of \d+$/);
  const [, shown, all] = /(\d+) of (\d+)/.exec((await status.textContent())!)!.map(Number);
  expect(shown).toBe(Math.min(100, all));
  while (await dialog.getByRole("button", { name: "Show more" }).isVisible()) {
    const before = await rows.count();
    await dialog.getByRole("button", { name: "Show more" }).click();
    await expect(async () => expect(await rows.count()).toBeGreaterThan(before)).toPass();
  }
  await expect(status).toHaveText(`Showing ${all} of ${all}`);

  const cells = await rows.evaluateAll((items) =>
    items.map((item) => [...item.querySelectorAll("span")].map((span) => span.textContent)),
  );
  expect(cells).toHaveLength(all);
  let sum = 0n;
  for (const cell of cells) {
    expect(isoOf(cell[0]) <= day, `${cell[0]} is after the day`).toBe(true);
    sum += cents(cell[cell.length - 1]);
  }
  expect(sum).toBe(cash);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(figure(page, "Cash")).toBeFocused();
});

test("clicking Profit to date lists the entries that touch Revenue or an expense account, adding up to the figure", async ({
  page,
}) => {
  await open(page);
  const profit = cents(await figure(page, "Profit to date").textContent());
  await figure(page, "Profit to date").click();
  const dialog = page.getByRole("dialog", { name: /^Profit to date up to / });
  await expect(dialog.getByRole("listitem").first()).toBeVisible();
  while (await dialog.getByRole("button", { name: "Show more" }).isVisible()) {
    const before = await dialog.getByRole("listitem").count();
    await dialog.getByRole("button", { name: "Show more" }).click();
    await expect(async () => expect(await dialog.getByRole("listitem").count()).toBeGreaterThan(before)).toPass();
  }
  const effects = await dialog
    .getByRole("listitem")
    .evaluateAll((items) => items.map((item) => item.lastElementChild?.textContent));
  expect(effects.reduce((sum, text) => sum + cents(text), 0n)).toBe(profit);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("an entry's link opens the page it came from", async ({ page }) => {
  await open(page);
  await figure(page, "Receivable").click();
  const dialog = page.getByRole("dialog", { name: /^Receivable up to / });
  const link = dialog.getByRole("link").first();
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", /^\/(invoices\/\d+|bills\/\d+|settings)$/);
  await link.click();
  await expect(page).toHaveURL(/\/(invoices\/\d+|bills\/\d+|settings)$/);
});

test("issuing an invoice and recording a payment show in Receivable and Cash after a reload, with the sides equal", async ({
  page,
  request,
}) => {
  const before = await booksOn(request, isoDay());
  const { invoice } = await addIssuedInvoice(request, "Sheet Co", 100_000);
  const paid = await request.post(`/api/invoices/${invoice.id}/payments`, {
    data: { paid_on: isoDay(), amount_cents: 50_000, method: "card" },
  });
  expect(paid.ok()).toBe(true);

  await open(page);
  const books = await booksOn(request, isoDay());
  expect(books.cash - before.cash).toBe(50_000n);
  await expect(async () => expect(await figures(page)).toEqual(expected(books))).toPass();
  expect(await total(page, OWNS)).toBe(await total(page, OWES));
  await expect(panel(page).getByText("The two sides are equal.")).toBeVisible();
});

test("a bill dated after today is left out of today's stop, and the page balances", async ({ page, request }) => {
  const [organization] = (await (await request.get("/api/organizations")).json()) as { id: number }[];
  const bill = await addBill(request, {
    organization_id: organization.id,
    bill_number: "NEXT-1",
    bill_date: isoDay(7),
  });
  const today = await booksOn(request, isoDay());
  const later = await booksOn(request, isoDay(7));
  expect(later.payable - today.payable).toBe(BigInt(bill.total_cents));

  await open(page);
  await expect(async () => expect((await figures(page)).Payable).toBe(today.payable)).toPass();
  expect(await figures(page)).toEqual(expected(today));
  await expect(panel(page).getByText("The two sides are equal.")).toBeVisible();
});

test("the money axis's labels fit inside the chart, the top one with its k", async ({ page }) => {
  await open(page);
  const surface = (await chart(page).locator("svg.recharts-surface").boundingBox())!;
  const labels = chart(page).locator(".recharts-cartesian-axis-tick-value").filter({ hasText: /^\$/ });
  await expect(labels).toHaveCount(3);
  // The sample data's total is in the hundreds of thousands, the longest label the axis gets from it.
  await expect(labels.filter({ hasText: /^\$\d+\.\dk$/ })).not.toHaveCount(0);
  for (const label of await labels.all()) {
    const box = (await label.boundingBox())!;
    expect(box.x + box.width, await label.textContent()).toBeLessThanOrEqual(surface.x + surface.width);
  }
});

for (const mode of ["light", "dark"] as const) {
  test(`the figures, swatches, bars and mark take their fonts and tokens in ${mode} mode`, async ({ page }) => {
    await page.goto("/");
    await menuButton(page).click();
    await page
      .getByRole("menu")
      .getByRole("menuitemradio", { name: mode === "dark" ? "Dark" : "Light" })
      .click();
    await page.keyboard.press("Escape");
    await open(page);

    for (const name of ACCOUNTS) await expect(figure(page, name)).toHaveCSS("font-family", /JetBrains Mono/);
    const swatches = column(page, OWNS).locator("li > span[aria-hidden]");
    await expect(swatches.first()).toHaveCSS("background-color", COLORS[mode].seaGreen);
    const fills = await chart(page)
      .locator("path.recharts-rectangle")
      .evaluateAll((paths) => paths.map((path) => getComputedStyle(path).fill));
    expect(fills).toContain(COLORS[mode].seaGreen);
    expect(fills).toContain(COLORS[mode].ink);
    const mark = panel(page).getByText("The two sides are equal.");
    await expect(mark).toHaveCSS("background-color", COLORS[mode].seaGreen);
    await expect(mark).toHaveCSS("color", COLORS[mode].midnight);
  });
}
