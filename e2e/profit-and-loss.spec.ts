import type { APIRequestContext, Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { API, addBill, addIssuedInvoice, isoDay, resetToSampleData } from "./helpers";

// The Profit and loss page (X1 to X19), on a fresh copy with the sample data.

test.beforeEach(resetToSampleData);

const CATEGORIES = ["software", "contractors", "travel", "office", "marketing", "other"];
const RGB = {
  light: {
    ink: "rgb(7, 59, 76)",
    seaGreen: "rgb(6, 214, 160)",
    coral: "rgb(247, 140, 107)",
    panel: "rgb(255, 255, 255)",
  },
  dark: {
    ink: "rgb(205, 216, 219)",
    seaGreen: "rgb(6, 214, 160)",
    coral: "rgb(247, 140, 107)",
    panel: "rgb(11, 50, 64)",
  },
};

type Account = { key: string; debit_cents: string; credit_cents: string };
type Statement = {
  months: { month: string; revenue_cents: string; expenses_cents: string; profit_cents: string }[];
  period: {
    label: string;
    revenue_cents: string;
    expenses_cents: string;
    profit_cents: string;
    categories: { category: string; cents: string }[];
    back_on: string | null;
    forward_on: string | null;
  };
};

async function read(request: APIRequestContext, query = ""): Promise<Statement> {
  const reply = await request.get(`${API}/books/profit-and-loss${query}`);
  expect(reply.ok()).toBe(true);
  return reply.json();
}

function statement(page: Page) {
  return page.getByRole("region", { name: "Statement" });
}

function months(page: Page) {
  return page.getByRole("table", { name: "Profit and loss for the last 12 months" });
}

/** The page, once its read has arrived and the chart is drawn. */
async function open(page: Page) {
  await page.goto("/accounting/profit-and-loss");
  await expect(statement(page).getByRole("button", { name: /^Revenue, / })).toBeVisible();
  await expect(page.locator("path.recharts-rectangle").first()).toBeVisible();
}

/** Whole cents from an amount as the page shows it, such as -$4,250.00. */
function cents(text: string | null): bigint {
  const found = /(-?)\$([\d,]+)\.(\d\d)/.exec(text ?? "");
  if (!found) throw new Error(`No amount in ${text}`);
  const size = BigInt(found[2].replaceAll(",", "")) * 100n + BigInt(found[3]);
  return found[1] ? -size : size;
}

function dollars(value: bigint) {
  const size = value < 0n ? -value : value;
  const whole = (size / 100n).toLocaleString("en-US");
  return `${value < 0n ? "-" : ""}$${whole}.${String(size % 100n).padStart(2, "0")}`;
}

function monthName(day: Date) {
  return day.toLocaleString("en-US", { month: "long", year: "numeric" });
}

/** The dialog's headline figure and the sum of its rows' amounts. */
async function dialogSums(dialog: Locator) {
  await expect(dialog.getByRole("listitem").first()).toBeVisible();
  const headline = cents(await dialog.locator("span.num").first().textContent());
  // Each row ends with its own amount, after its date and the link.
  const amounts = await dialog.getByRole("listitem").locator("xpath=./span[last()]").allTextContents();
  return { headline, rows: amounts.length, sum: amounts.reduce((total, each) => total + cents(each), 0n) };
}

test("the chart has the last 12 months and each month's revenue and expenses are the books'", async ({
  page,
  request,
}) => {
  await open(page);
  const reply = await (await request.get(`${API}/books/months`)).json();
  const table = months(page);
  await expect(table.getByRole("row")).toHaveCount(13);
  for (const [index, month] of (reply.months as { month: string; accounts: Account[] }[]).entries()) {
    const sum = (keys: (key: string) => boolean, side: "expense" | "revenue") =>
      month.accounts
        .filter(({ key }) => keys(key))
        .reduce(
          (total, account) =>
            total +
            (side === "revenue"
              ? BigInt(account.credit_cents) - BigInt(account.debit_cents)
              : BigInt(account.debit_cents) - BigInt(account.credit_cents)),
          0n,
        );
    const revenue = sum((key) => key === "revenue", "revenue");
    const expenses = sum((key) => key.startsWith("expense_"), "expense");
    const cells = await table
      .getByRole("row")
      .nth(index + 1)
      .locator("th, td")
      .allTextContents();
    expect(cells[1], month.month).toBe(dollars(revenue));
    expect(cells[8], month.month).toBe(dollars(expenses));
    expect(cells[9], month.month).toBe(dollars(revenue - expenses));
  }
  // The sample data gives every one of the 12 months revenue and expenses (X19).
  const shown = await read(request);
  expect(shown.months).toHaveLength(12);
  for (const each of shown.months) {
    expect(BigInt(each.revenue_cents), each.month).toBeGreaterThan(0n);
    expect(BigInt(each.expenses_cents), each.month).toBeGreaterThan(0n);
  }
  await expect(page.getByText("so far")).toHaveCount(2);
});

test("the statement for this month adds up, and says profit isn't the same as cash", async ({ page, request }) => {
  await open(page);
  await expect(
    page.getByText(
      "Revenue counts on the day an invoice is issued and expenses on the bill date, so profit isn't the same as cash.",
    ),
  ).toBeVisible();
  await expect(statement(page).getByText(monthName(new Date()))).toBeVisible();
  const amount = async (name: RegExp) => cents(await statement(page).getByRole("button", { name }).textContent());
  const revenue = await amount(/^Revenue, /);
  const expenses = await amount(/^Total expenses, /);
  const profit = await amount(/^Profit, /);
  let categories = 0n;
  for (const name of CATEGORIES) {
    categories += await amount(new RegExp(`^${name[0].toUpperCase()}${name.slice(1)}, `));
  }
  expect(categories).toBe(expenses);
  expect(revenue - expenses).toBe(profit);
  const shown = await read(request);
  expect(BigInt(shown.period.revenue_cents)).toBe(revenue);
});

test("Quarter and Year show their labels, the arrows step back and forward, and each is off at its end", async ({
  page,
}) => {
  await open(page);
  const today = new Date();
  const switchTo = async (name: string, label: string) => {
    await statement(page).getByRole("button", { name, exact: true }).click();
    await expect(statement(page).getByText(label, { exact: true })).toBeVisible();
  };
  await switchTo("Quarter", `Q${Math.floor(today.getMonth() / 3) + 1} ${today.getFullYear()}`);
  await switchTo("Year", String(today.getFullYear()));
  await switchTo("Month", monthName(today));

  const back = statement(page).getByRole("button", { name: "Earlier period" });
  const forward = statement(page).getByRole("button", { name: "Later period" });
  await expect(forward).toBeDisabled();
  await back.click();
  const earlier = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  await expect(statement(page).getByText(monthName(earlier), { exact: true })).toBeVisible();
  await expect(statement(page).getByText("so far")).toHaveCount(0);
  await expect(forward).toBeEnabled();
  await forward.click();
  await expect(statement(page).getByText(monthName(today), { exact: true })).toBeVisible();
  await expect(forward).toBeDisabled();

  for (let steps = 0; steps < 60 && (await back.isEnabled()); steps++) {
    const label = await statement(page).locator("p span[aria-live]").textContent();
    await back.click();
    await expect(statement(page).locator("p span[aria-live]")).not.toHaveText(label ?? "");
  }
  await expect(back).toBeDisabled();
});

test("a statement amount, the margin and each part of the chart open the entries behind them", async ({
  page,
  request,
}) => {
  await open(page);
  const dialog = page.getByRole("dialog");
  const { period } = await read(request);

  await statement(page)
    .getByRole("button", { name: /^Revenue, / })
    .click();
  await expect(dialog).toBeVisible();
  const revenue = await dialogSums(dialog);
  expect(revenue.headline).toBe(BigInt(period.revenue_cents));
  expect(revenue.sum).toBe(revenue.headline);
  await dialog.getByRole("button", { name: "Close" }).click();

  await statement(page)
    .getByRole("button", { name: /^Profit margin, / })
    .click();
  await expect(dialog.getByRole("heading")).toContainText("Profit,");
  const profit = await dialogSums(dialog);
  expect(profit.headline).toBe(BigInt(period.profit_cents));
  expect(profit.sum).toBe(profit.headline);
  await dialog.getByRole("button", { name: "Close" }).click();

  const march = months(page).getByRole("row").nth(6);
  await march.getByRole("button").first().click();
  await expect(dialog).toBeVisible();
  const column = await dialogSums(dialog);
  expect(column.sum).toBe(column.headline);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.locator("path.recharts-rectangle").first().click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator("circle[r='5']").nth(4).click();
  await expect(dialog.getByRole("heading")).toContainText("Profit,");
});

test("the keyboard reaches a figure, opens its entries, and focus returns to it on Close", async ({ page }) => {
  await open(page);
  const amount = statement(page).getByRole("button", { name: /^Travel, / });
  await amount.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toContainText("Travel,");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(amount).toBeFocused();
});

test("an invoice's link and a bill's link open their pages", async ({ page }) => {
  await open(page);
  const dialog = page.getByRole("dialog");
  await statement(page)
    .getByRole("button", { name: /^Revenue, / })
    .click();
  await dialog
    .getByRole("link", { name: /^Invoice / })
    .first()
    .click();
  await expect(page).toHaveURL(/\/invoices\/\d+$/);

  await open(page);
  await statement(page)
    .getByRole("button", { name: /^Total expenses, / })
    .click();
  await dialog
    .getByRole("link", { name: /^Bill / })
    .first()
    .click();
  await expect(page).toHaveURL(/\/bills\/\d+$/);
});

test("issuing an invoice raises revenue by its subtotal, adding a bill raises its category, and a payment changes nothing", async ({
  request,
}) => {
  const figures = async () => (await read(request)).period;
  const before = await figures();

  const issued = await addIssuedInvoice(request, "Profit check", 100000);
  const afterInvoice = await figures();
  expect(BigInt(afterInvoice.revenue_cents) - BigInt(before.revenue_cents)).toBe(100000n);

  const supplier = (await (await request.get(`${API}/organizations`)).json())[0] as { id: number };
  const bill = await addBill(request, {
    organization_id: supplier.id,
    bill_number: "PL-1",
    bill_date: isoDay(),
    amount_cents: 20000,
    tax_cents: 2000,
    category: "travel",
  });
  const afterBill = await figures();
  const travel = (period: typeof before) => BigInt(period.categories.find((each) => each.category === "travel")!.cents);
  expect(travel(afterBill) - travel(afterInvoice)).toBe(BigInt(bill.total_cents));
  expect(BigInt(afterBill.expenses_cents) - BigInt(afterInvoice.expenses_cents)).toBe(BigInt(bill.total_cents));

  const payment = await request.post(`${API}/invoices/${issued.invoice.id}/payments`, {
    data: { paid_on: isoDay(), amount_cents: 50000, method: "card", reference: null },
  });
  expect(payment.ok()).toBe(true);
  await request.patch(`${API}/bills/${bill.id}`, { data: { paid_on: isoDay() } });
  expect(await figures()).toEqual(afterBill);
});

for (const mode of ["light", "dark"] as const) {
  test(`the figures are in JetBrains Mono, and the columns, segments and line take their colors in ${mode} mode`, async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("banner")
      .getByRole("button", { name: /^Menu( for .+)?$/ })
      .click();
    await page.getByRole("menuitemradio", { name: mode === "dark" ? "Dark" : "Light" }).click();
    await page.keyboard.press("Escape");
    await open(page);

    await expect(statement(page).getByRole("button", { name: /^Revenue, / })).toHaveCSS(
      "font-family",
      /JetBrains Mono/,
    );
    const ink = page.locator('path.recharts-rectangle[fill="var(--color-ink)"]').first();
    await expect(ink).toHaveCSS("fill", RGB[mode].ink);
    await expect(page.locator('path.recharts-rectangle[fill="var(--color-sea-green)"]').first()).toHaveCSS(
      "fill",
      RGB[mode].seaGreen,
    );
    await expect(page.locator('path.recharts-rectangle[fill="var(--color-coral)"]').first()).toHaveCSS(
      "fill",
      RGB[mode].coral,
    );
    const line = page.locator('path.recharts-line-curve[stroke="var(--color-ink)"]');
    await expect(line).toHaveCSS("stroke", RGB[mode].ink);
    await expect(page.locator('path.recharts-line-curve[stroke="var(--color-panel)"]')).toHaveCSS(
      "stroke",
      RGB[mode].panel,
    );
    await expect(statement(page)).toHaveCSS("background-color", RGB[mode].panel);
  });
}
