import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { API, isoDay, resetToSampleData, setOpeningBalance } from "./helpers";

// A fresh copy each time, with the sample company's opening balance as of the chart's first day (B12).
test.beforeEach(resetToSampleData);

function row(page: Page) {
  return page.getByRole("region", { name: "Cash flow" });
}

function chart(page: Page) {
  return row(page).getByRole("img", { name: /^Money in and out each month/ });
}

/** The dashboard, scrolled to the cash flow once its balance line is drawn. */
async function openCashFlow(page: Page) {
  await page.goto("/");
  await row(page).scrollIntoViewIfNeeded();
  await expect(chart(page).locator("path.recharts-line-curve").first()).toBeVisible();
}

/** The balance line as drawn, solid then dashed, each as its points. */
async function lines(page: Page) {
  const curves = chart(page).locator("path.recharts-line-curve");
  const points = (d: string | null) => [...(d ?? "").matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(([, x, y]) => [+x, +y]);
  const all = await curves.evaluateAll((paths) =>
    paths.map((path) => ({ d: path.getAttribute("d"), dashed: Boolean(path.getAttribute("stroke-dasharray")) })),
  );
  return {
    solid: points(all.find((curve) => !curve.dashed)?.d ?? null),
    dashed: points(all.find((curve) => curve.dashed)?.d ?? null),
  };
}

/** Whole cents from an amount as the page shows it, such as -$4,250.00. */
function cents(text: string | null) {
  const found = /(-?)\$([\d,]+)\.(\d\d)/.exec(text ?? "");
  if (!found) throw new Error(`No amount in ${text}`);
  const size = Number(found[2].replaceAll(",", "")) * 100 + Number(found[3]);
  return found[1] ? -size : size;
}

/** A figure above the chart, by its label, as its label, amount and what's under it. */
function figure(page: Page, label: string | RegExp) {
  const named = typeof label === "string" ? new RegExp(`^${label}$`) : label;
  return row(page).locator("span.block").filter({ hasText: named }).locator("xpath=..");
}

/** A month's cells in the table behind the chart, for anyone who can't see it. */
async function monthCells(page: Page, name: RegExp) {
  return row(page).getByRole("table").getByRole("row", { name }).locator("th, td").allTextContents();
}

function monthLabels(page: Page) {
  return row(page).locator("ol > li");
}

function monthButtons(page: Page) {
  return monthLabels(page).getByRole("button");
}

test("a fresh copy shows a year of history and three months of forecast at the top of the Money section", async ({
  page,
}) => {
  await openCashFlow(page);
  const money = page.getByRole("region", { name: "Money" });
  const first = (await row(page).boundingBox())!;
  for (const name of ["Owed to us", "What we owe"]) {
    expect((await money.getByRole("region", { name }).boundingBox())!.y, name).toBeGreaterThan(first.y + first.height);
  }

  // 15 months: the last 12, then 3 to come, which can be opened as this month can.
  await expect(monthLabels(page)).toHaveCount(15);
  await expect(monthButtons(page)).toHaveCount(4);
  await expect(monthButtons(page).first()).toHaveAccessibleName(/^Still expected in /);
  await expect(row(page).getByText("so far", { exact: true })).toBeVisible();
  await expect(row(page).getByText("Forecast", { exact: true }).first()).toBeVisible();

  // Each past month has money in, and the line runs from the first month, dashed from last month's point.
  const table = await row(page).getByRole("table").getByRole("row").allTextContents();
  expect(table).toHaveLength(16);
  for (const month of table.slice(1, 12))
    expect(cents(month.replace(/^[A-Za-z]+ \d{4}/, "")), month).toBeGreaterThan(0);
  const { solid, dashed } = await lines(page);
  expect(solid).toHaveLength(11);
  expect(dashed).toHaveLength(5);
  expect(dashed[0]).toEqual(solid[10]);
  expect(cents(await figure(page, "Cash today").textContent())).toBeGreaterThan(0);
  await expect(figure(page, /^End of /)).toContainText("Expected");
});

/** Each month's balance at its end, from the table behind the chart, which the line is drawn from. */
async function monthEnds(page: Page) {
  const table = row(page).getByRole("table");
  const column = (await table.getByRole("columnheader").allTextContents()).indexOf("Cash at the end");
  const rows = await table.getByRole("row").all();
  return Promise.all(rows.slice(1).map((month) => month.locator("th, td").nth(column).textContent()));
}

/** The highest figure on the money axis, in cents. */
async function axisTop(page: Page) {
  const figures = await chart(page).locator(".recharts-cartesian-axis-tick-value").allTextContents();
  return Math.max(
    ...figures.map((text) => {
      const [, sign, amount, unit] = /^(-?)\$([\d.]+)(k|M)?$/.exec(text) ?? [];
      const cents = Number(amount) * (unit === "M" ? 1e8 : unit === "k" ? 1e5 : 100);
      return sign ? -cents : cents;
    }),
  );
}

test("turning on likely deals adds the band and its figure, and leaves the forecast's balances as they were", async ({
  page,
}) => {
  await openCashFlow(page);
  const before = {
    ends: await monthEnds(page),
    end: await figure(page, /^End of /).textContent(),
    top: await axisTop(page),
  };
  await expect(chart(page).locator(".recharts-area-area")).toHaveCount(0);

  await row(page).getByRole("switch", { name: "Likely deals" }).click();

  await expect(chart(page).locator(".recharts-area-area")).toHaveCount(1);
  await expect(figure(page, "With likely deals")).toBeVisible();
  // The axis fits what's shown, so it makes room for the band, while the line shows the same balances.
  expect(await axisTop(page)).toBeGreaterThanOrEqual(before.top);
  expect(await monthEnds(page)).toEqual(before.ends);
  expect(await figure(page, /^End of /).textContent()).toBe(before.end);

  await row(page).getByRole("switch", { name: "Likely deals" }).click();
  await expect(chart(page).locator(".recharts-area-area")).toHaveCount(0);
  await expect(row(page).getByText("With likely deals")).toHaveCount(0);
  expect(await axisTop(page)).toBe(before.top);
  expect(await monthEnds(page)).toEqual(before.ends);
});

/**
 * Opens a month's list and waits until it's drawn, as its groups or the line saying nothing is expected.
 * The reply arrives before the list is drawn, and the dialog is empty until it is.
 */
async function waitForList(page: Page, open: () => Promise<void>) {
  const listed = page.waitForResponse((response) => new URL(response.url()).pathname === `${API}/cash-flow/expected`);
  await open();
  expect((await listed).ok()).toBe(true);
  const dialog = page.getByRole("dialog");
  const drawn = dialog.getByRole("region").or(dialog.getByText(/^Nothing expected in /));
  await expect(drawn.first()).toBeVisible();
  return dialog;
}

test("a forecast month's list opens from its column and from its label, and closes back to the label", async ({
  page,
}) => {
  await openCashFlow(page);
  const label = monthButtons(page).nth(1);
  const name = await label.getAttribute("aria-label");
  const labelBox = (await label.boundingBox())!;
  const chartBox = (await chart(page).boundingBox())!;
  const column = { x: labelBox.x + labelBox.width / 2, y: chartBox.y + chartBox.height / 2 };

  // The click needs the chart to know the column, which pointing at it shows by its tooltip.
  await page.mouse.move(column.x, column.y);
  await expect(chart(page).locator(".recharts-tooltip-wrapper")).toContainText("Expected cash at the end of");
  const dialog = await waitForList(page, () => page.mouse.click(column.x, column.y));
  await expect(dialog).toHaveAccessibleName(name!);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(label).toBeFocused();

  const again = await waitForList(page, () => page.keyboard.press("Enter"));
  await expect(again).toHaveAccessibleName(name!);
  await again.getByRole("button", { name: "Close" }).click();
  await expect(label).toBeFocused();
});

test("an invoice in a month's list opens its own page", async ({ page }) => {
  await openCashFlow(page);
  // Every open invoice is expected from tomorrow to the forecast's end, so one of the four lists has one.
  let invoice: Locator | null = null;
  for (let month = 0; month < 4 && !invoice; month += 1) {
    const dialog = await waitForList(page, () => monthButtons(page).nth(month).click());
    const comingIn = dialog.getByRole("region", { name: "Coming in" });
    if (await comingIn.count()) {
      invoice = comingIn.getByRole("link").first();
    } else {
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    }
  }
  const number = await invoice!.textContent();
  await invoice!.click();
  await expect(page).toHaveURL(/\/invoices\/\d+$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(number!);
});

test("a payment recorded raises this month's money in and cash today by its amount", async ({ page, request }) => {
  await openCashFlow(page);
  const thisMonth = /, so far/;
  const before = {
    today: cents(await figure(page, "Cash today").textContent()),
    cells: await monthCells(page, thisMonth),
  };

  const invoices: { id: number; owed_cents: number }[] = await (await request.get(`${API}/invoices`)).json();
  const open = invoices.find((invoice) => invoice.owed_cents > 1234);
  const paid = await request.post(`${API}/invoices/${open!.id}/payments`, {
    data: { paid_on: isoDay(), amount_cents: 1234, method: "card" },
  });
  expect(paid.ok()).toBe(true);

  await openCashFlow(page);
  await expect.poll(async () => cents(await figure(page, "Cash today").textContent())).toBe(before.today + 1234);
  const after = await monthCells(page, thisMonth);
  expect(cents(after[1])).toBe(cents(before.cells[1]) + 1234);
});

test("clearing the opening balance in Company settings leaves money in and out, with how to add one", async ({
  page,
}) => {
  await page.goto("/settings");
  const amount = page.getByLabel("Opening balance");
  await expect(amount).toHaveValue(/^\d+\.\d\d$/);
  await amount.fill("");
  await page.getByLabel("As of").fill("");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();

  await page.goto("/");
  await row(page).scrollIntoViewIfNeeded();
  await expect(row(page).getByText(/^No opening balance yet\./)).toBeVisible();
  await expect(chart(page).locator("path.recharts-rectangle").first()).toBeVisible();
  expect(await lines(page)).toEqual({ solid: [], dashed: [] });
  await expect(row(page).getByText("Cash today")).toHaveCount(0);
  await expect(row(page).getByRole("switch")).toHaveCount(0);

  await row(page).getByRole("link", { name: "Company settings" }).click();
  await expect(page.getByLabel("Company name")).toHaveValue(/./);
  await expect(amount).toHaveValue("");
  await amount.fill("25,000.00");
  await page.getByLabel("As of").fill(isoDay(-40));
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();

  await openCashFlow(page);
  await expect(figure(page, "Cash today")).toBeVisible();
});

test("a balance below zero shows with its minus sign, on the figures and the axis", async ({ page, request }) => {
  await setOpeningBalance(request, -50_000_000, isoDay(-1));
  await openCashFlow(page);
  expect(cents(await figure(page, "Cash today").textContent())).toBeLessThan(0);
  await expect(figure(page, "Cash today")).toContainText("-$");
  await expect(chart(page).locator(".recharts-cartesian-axis-tick-value").filter({ hasText: /^-\$/ })).not.toHaveCount(
    0,
  );
});

const COLORS = {
  light: {
    in: "rgb(6, 214, 160)",
    expectedIn: "rgb(131, 235, 208)",
    line: "rgb(7, 59, 76)",
    band: "rgb(255, 224, 162)",
  },
  dark: {
    in: "rgb(6, 214, 160)",
    expectedIn: "rgb(9, 132, 112)",
    line: "rgb(205, 216, 219)",
    band: "rgb(133, 122, 67)",
  },
};

async function expectColors(page: Page, mode: keyof typeof COLORS) {
  const colors = COLORS[mode];
  await expect(chart(page).locator('path[fill="var(--color-sea-green)"]').first()).toHaveCSS("fill", colors.in);
  await expect(chart(page).locator('path[fill="var(--color-sea-green-soft)"]').first()).toHaveCSS(
    "fill",
    colors.expectedIn,
  );
  await expect(chart(page).locator("path.recharts-line-curve").first()).toHaveCSS("stroke", colors.line);
  await expect(chart(page).locator(".recharts-area-area")).toHaveCSS("fill", colors.band);
}

test("the figures are in JetBrains Mono, and the chart takes its colors in light and dark mode", async ({ page }) => {
  await openCashFlow(page);
  await expect(figure(page, "Cash today").locator(".num")).toHaveCSS("font-family", /JetBrains Mono/);
  await row(page).getByRole("switch", { name: "Likely deals" }).click();
  await expectColors(page, "light");

  await page
    .getByRole("banner")
    .getByRole("button", { name: /^Menu( for .+)?$/ })
    .click();
  await page.getByRole("menu").getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  await expectColors(page, "dark");
});
