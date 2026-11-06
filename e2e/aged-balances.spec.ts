import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { isoDay, resetToSampleData } from "./helpers";

// The Aged balances page (X1 to X20) on the sample data, which has customers and suppliers in every part (X19).

test.describe.configure({ mode: "serial" });
test.beforeAll(resetToSampleData);

const PARTS = ["Not yet due", "1 to 30 days", "31 to 60 days", "61 to 90 days", "Over 90 days"];
const COLORS = {
  light: ["rgb(17, 138, 178)", "rgb(255, 193, 69)", "rgb(247, 140, 107)", "rgb(239, 71, 111)", "rgb(163, 29, 69)"],
  dark: ["rgb(17, 138, 178)", "rgb(255, 193, 69)", "rgb(247, 140, 107)", "rgb(239, 71, 111)", "rgb(194, 53, 96)"],
};
const PANEL = { light: "rgb(255, 255, 255)", dark: "rgb(11, 50, 64)" };
const FOCUS = { light: "rgb(17, 138, 178)", dark: "rgb(76, 179, 214)" };

function dollars(cents: string | number) {
  const whole = BigInt(cents);
  const rest = String(whole % 100n).padStart(2, "0");
  return `$${(whole / 100n).toLocaleString("en-US")}.${rest}`;
}

function table(page: Page) {
  return page.getByRole("region", { name: "Aged balances" });
}

function totalsRow(page: Page) {
  return table(page)
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: "Total" }) });
}

async function openFromMenu(page: Page) {
  await page.goto("/");
  await page
    .getByRole("banner")
    .getByRole("button", { name: /^Menu( for .+)?$/ })
    .click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Aged balances" }).click();
  await expect(page).toHaveURL(/\/accounting\/aged-balances$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Aged balances");
}

async function totalFor(request: APIRequestContext, view: "customers" | "suppliers") {
  const reply = await request.get(`/api/aged-balances/${view}`);
  expect(reply.ok()).toBe(true);
  return (await reply.json()) as {
    rows: { name: string; total_cents: string; parts: { cents: string }[] }[];
    totals: { total_cents: string; parts: { cents: string; count: number }[] };
  };
}

test("opens from the menu on Customers, with organizations in every part, bars of several colors and the totals row", async ({
  page,
  request,
}) => {
  await openFromMenu(page);
  await expect(page.getByRole("radio", { name: "Customers" })).toBeChecked();
  const { rows, totals } = await totalFor(request, "customers");

  await expect(page.getByRole("link", { name: rows[0].name, exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Parts" }).getByRole("listitem")).toHaveText(PARTS);
  for (const [place, name] of PARTS.entries()) {
    expect(Number(totals.parts[place].count), name).toBeGreaterThanOrEqual(2);
  }
  await expect(page.locator("path.recharts-rectangle[fill='var(--color-cerulean)']").first()).toBeVisible();
  for (const color of ["marigold", "coral", "raspberry", "deep-raspberry"]) {
    await expect(page.locator(`path.recharts-rectangle[fill='var(--color-${color})']`).first()).toBeAttached();
  }
  await expect(totalsRow(page).getByRole("cell").last()).toHaveText(dollars(totals.total_cents));
  await expect(totalsRow(page)).toContainText("Total");
});

test("its total equals the dashboard's Owed to us, and Suppliers' equals What we owe", async ({ page, request }) => {
  const customers = await totalFor(request, "customers");
  const suppliers = await totalFor(request, "suppliers");
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Owed to us" })).toContainText(dollars(customers.totals.total_cents));
  await expect(page.getByRole("region", { name: "What we owe" })).toContainText(dollars(suppliers.totals.total_cents));
});

test("a customer's row opens to its invoices, which link to them", async ({ page, request }) => {
  await page.goto("/accounting/aged-balances");
  const { rows } = await totalFor(request, "customers");
  const opener = page.getByRole("button", { name: `Invoices of ${rows[0].name}` });
  await expect(opener).toHaveAttribute("aria-expanded", "false");
  await opener.click();
  await expect(opener).toHaveAttribute("aria-expanded", "true");
  const items = page.getByRole("list", { name: "Invoices" });
  await expect(items.getByRole("listitem").first()).toContainText("$");
  await items.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/invoices\/\d+$/);
});

test("Suppliers by keyboard shows bills linking to them, with the focus ring", async ({ page, request }) => {
  await page.goto("/accounting/aged-balances");
  const customers = page.getByRole("radio", { name: "Customers" });
  // The table has loaded, so nothing redraws under the keys.
  await expect(table(page).getByRole("row").nth(1)).toBeVisible();
  await customers.focus();
  await expect(customers).toHaveCSS("outline-color", FOCUS.light);
  await page.keyboard.press("ArrowRight");
  // The toggle group moves the focus a moment after the key, so wait for it before pressing Space.
  await expect(page.getByRole("radio", { name: "Suppliers" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page).toHaveURL(/view=suppliers/);
  const { rows } = await totalFor(request, "suppliers");
  const opener = page.getByRole("button", { name: `Bills of ${rows[0].name}` });
  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(opener).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("list", { name: "Bills" }).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/bills\/\d+$/);
});

test("picking an earlier day changes the figures and keeps the day in the address, and Back to today returns", async ({
  page,
  request,
}) => {
  await page.goto("/accounting/aged-balances");
  const before = await totalFor(request, "customers");
  await expect(totalsRow(page).getByRole("cell").last()).toHaveText(dollars(before.totals.total_cents));
  const day = isoDay(-40);

  const read = page.waitForResponse((reply) => reply.url().includes(`/api/aged-balances/customers?on=${day}`));
  await page.getByLabel("Balances as of").fill(day);
  const earlier = (await (await read).json()) as { totals: { total_cents: string } };

  await expect(page).toHaveURL(new RegExp(`on=${day}`));
  await expect(page.getByText(/^Balances as of \w{3} \d+, \d{4}$/)).toBeVisible();
  await expect(totalsRow(page).getByRole("cell").last()).toHaveText(dollars(earlier.totals.total_cents));
  expect(earlier.totals.total_cents).not.toBe(before.totals.total_cents);

  await page.reload();
  await expect(page.getByLabel("Balances as of")).toHaveValue(day);
  await expect(totalsRow(page).getByRole("cell").last()).toHaveText(dollars(earlier.totals.total_cents));

  await page.getByRole("button", { name: "Back to today" }).click();
  await expect(page).not.toHaveURL(/on=/);
  await expect(totalsRow(page).getByRole("cell").last()).toHaveText(dollars(before.totals.total_cents));
  await expect(page.getByRole("button", { name: "Back to today" })).toHaveCount(0);
});

for (const mode of ["light", "dark"] as const) {
  test(`in ${mode} mode the panel and the five part colors are the design's`, async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("banner")
      .getByRole("button", { name: /^Menu( for .+)?$/ })
      .click();
    await page
      .getByRole("menu")
      .getByRole("menuitemradio", { name: mode === "dark" ? "Dark" : "Light" })
      .click();
    await page.keyboard.press("Escape");
    await page.goto("/accounting/aged-balances");

    await expect(table(page)).toHaveCSS("background-color", PANEL[mode]);
    const swatches = page.getByRole("list", { name: "Parts" }).getByRole("listitem").locator("span");
    for (const [place, color] of COLORS[mode].entries()) {
      await expect(swatches.nth(place)).toHaveCSS("background-color", color);
    }
  });
}
