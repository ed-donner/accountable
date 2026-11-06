import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { addBill, addIssuedInvoice, isoDay, resetToSampleData } from "./helpers";

// The books (J5 to J7, J13) and the Accounting pages (J15, J16), on the sample data.

test.describe.configure({ mode: "serial" });
test.beforeAll(resetToSampleData);

// The words of each page that is still a placeholder. Balance sheet has its own file, balance-sheet.spec.ts.
const PAGES: { label: string; path: string; words: string | null }[] = [
  {
    label: "Profit and loss",
    path: "/accounting/profit-and-loss",
    words: "What the business earned and what it spent each month, and the profit or loss that leaves.",
  },
  { label: "Balance sheet", path: "/accounting/balance-sheet", words: null },
  {
    label: "Journal",
    path: "/accounting/journal",
    words: "Every entry in the books, newest first, each linking to the invoice, payment or bill it came from.",
  },
  {
    label: "Aged balances",
    path: "/accounting/aged-balances",
    words: "What customers owe and what the business owes, grouped by how late each amount is.",
  },
];
const PANEL = { light: "rgb(255, 255, 255)", dark: "rgb(11, 50, 64)" };
const FOCUS = { light: "rgb(17, 138, 178)", dark: "rgb(76, 179, 214)" };

function menuButton(page: Page) {
  return page.getByRole("banner").getByRole("button", { name: /^Menu( for .+)?$/ });
}

function menu(page: Page) {
  return page.getByRole("menu");
}

function topBarLinks(page: Page) {
  return page.getByRole("navigation", { name: "Sections" }).getByRole("link");
}

test("the menu has Accounting with its four links, in order, between the themes and Company settings", async ({
  page,
}) => {
  await page.goto("/");
  await menuButton(page).click();
  await expect(menu(page).getByRole("menuitem")).toHaveText([
    ...PAGES.map(({ label }) => label),
    "Company settings",
    "Sign out",
  ]);
  await expect(menu(page).getByRole("group", { name: "Accounting" })).toBeVisible();
  await expect(menu(page).getByText("Accounting", { exact: true })).toHaveCSS("font-weight", "600");
  await expect(menu(page)).toHaveCSS("width", "240px");
});

for (const mode of ["light", "dark"] as const) {
  for (const { label, path, words } of PAGES) {
    if (words === null) continue;
    test(`${label} opens from the menu in ${mode} mode with its title and its words`, async ({ page }) => {
      await page.goto("/");
      await menuButton(page).click();
      await menu(page)
        .getByRole("menuitemradio", { name: mode === "dark" ? "Dark" : "Light" })
        .click();
      await menuButton(page).click();
      await menu(page).getByRole("menuitem", { name: label }).click();

      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(menu(page)).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(label);
      const panel = page.getByRole("region", { name: "Report status" });
      await expect(panel.getByText("This report is coming soon.")).toBeVisible();
      await expect(panel.getByText(words)).toBeVisible();
      await expect(panel).toHaveCSS("background-color", PANEL[mode]);
      await expect(panel).toHaveCSS("width", "560px");
      await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
      await expect(topBarLinks(page)).toHaveCount(9);
      await expect(page.locator('nav[aria-label="Sections"] a[aria-current="page"]')).toHaveCount(0);
    });
  }
}

test("an Accounting page is reached by keyboard, with the focus ring on the menu button", async ({ page }) => {
  await page.goto("/organizations");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await menuButton(page).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(menuButton(page)).toBeFocused();
  await expect(menuButton(page)).toHaveCSS("outline-color", FOCUS.light);

  await page.keyboard.press("Enter");
  await expect(menu(page).getByRole("menuitemradio", { name: "Light" })).toBeFocused();
  for (const name of ["Dark", "System"]) {
    await page.keyboard.press("ArrowDown");
    await expect(menu(page).getByRole("menuitemradio", { name })).toBeFocused();
  }
  for (const name of ["Profit and loss", "Balance sheet"]) {
    await page.keyboard.press("ArrowDown");
    await expect(menu(page).getByRole("menuitem", { name })).toBeFocused();
  }
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/accounting\/balance-sheet$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Balance sheet");
});

test("/accounting lands on Profit and loss, and an unknown address under it says the page no longer exists", async ({
  page,
}) => {
  await page.goto("/accounting");
  await expect(page).toHaveURL(/\/accounting\/profit-and-loss$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Profit and loss");

  await page.goto("/accounting/trial-balance");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page no longer exists");
  await expect(topBarLinks(page)).toHaveCount(9);
});

// The books through the app

type Balances = Record<string, bigint>;

async function balances(request: APIRequestContext): Promise<Balances> {
  const reply = await request.get("/api/books/balances");
  expect(reply.ok()).toBe(true);
  const { accounts } = (await reply.json()) as { accounts: { key: string; type: string; balance_cents: string }[] };
  return Object.fromEntries(accounts.map((account) => [account.key, BigInt(account.balance_cents)]));
}

/** Assets and expenses on one side, liabilities, equity and revenue on the other: the books balance. */
async function expectBalanced(request: APIRequestContext) {
  const reply = await request.get("/api/books/balances");
  const { accounts } = (await reply.json()) as { accounts: { type: string; balance_cents: string }[] };
  const sum = (types: string[]) =>
    accounts
      .filter(({ type }) => types.includes(type))
      .reduce((total, { balance_cents }) => total + BigInt(balance_cents), 0n);
  expect(sum(["asset", "expense"])).toBe(sum(["liability", "equity", "revenue"]));
}

async function owedOnInvoices(request: APIRequestContext) {
  const invoices = (await (await request.get("/api/invoices")).json()) as { owed_cents: number }[];
  return BigInt(invoices.reduce((total, invoice) => total + invoice.owed_cents, 0));
}

async function owedOnBills(request: APIRequestContext) {
  const { owed } = (await (await request.get("/api/bills/dashboard")).json()) as { owed: { total_cents: string } };
  return BigInt(owed.total_cents);
}

async function expectBooksToAgree(request: APIRequestContext) {
  const found = await balances(request);
  expect(found.receivable).toBe(await owedOnInvoices(request));
  expect(found.payable).toBe(await owedOnBills(request));
  await expectBalanced(request);
  return found;
}

test("on a fresh copy the Cash account's balance today is the cash flow's Cash today", async ({ request }) => {
  const flow = (await (await request.get("/api/cash-flow")).json()) as { cash_today: string };
  expect((await balances(request)).cash).toBe(BigInt(flow.cash_today));
  await expectBooksToAgree(request);
});

test("an invoice, a payment, a bill and their changes keep Receivable and Payable as the records say and the books balanced", async ({
  request,
}) => {
  const start = await expectBooksToAgree(request);

  const { invoice } = await addIssuedInvoice(request, "Books Co", 100_000);
  let found = await expectBooksToAgree(request);
  expect(found.receivable - start.receivable).toBe(BigInt(invoice.total_cents));
  expect(found.revenue - start.revenue).toBe(100_000n);

  const paid = await request.post(`/api/invoices/${invoice.id}/payments`, {
    data: { paid_on: isoDay(), amount_cents: 50_000, method: "card" },
  });
  expect(paid.ok()).toBe(true);
  found = await expectBooksToAgree(request);
  expect(found.cash - start.cash).toBe(50_000n);

  const [payment] = ((await paid.json()) as { payments: { id: number }[] }).payments;
  expect((await request.delete(`/api/invoices/${invoice.id}/payments/${payment.id}`)).ok()).toBe(true);
  found = await expectBooksToAgree(request);
  expect(found.cash).toBe(start.cash);

  const bill = await addBill(request, { bill_number: "BOOKS-1", organization_id: await anyOrganization(request) });
  await expectBooksToAgree(request);
  for (const change of [{ paid_on: isoDay() }, { amount_cents: 25_000 }, { paid_on: null }, { category: "travel" }]) {
    expect((await request.patch(`/api/bills/${bill.id}`, { data: change })).ok()).toBe(true);
    await expectBooksToAgree(request);
  }
  expect((await request.delete(`/api/bills/${bill.id}`)).status()).toBe(204);
  await expectBooksToAgree(request);
});

async function anyOrganization(request: APIRequestContext) {
  const [first] = (await (await request.get("/api/organizations")).json()) as { id: number }[];
  return first.id;
}
