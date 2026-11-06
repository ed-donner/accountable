import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { isoDay, resetToSampleData } from "./helpers";

// The Journal, the ledgers and the Accounting panels (J17 to J22), on the sample data.

test.describe.configure({ mode: "serial" });
test.beforeAll(resetToSampleData);

const PANEL = { light: "rgb(255, 255, 255)", dark: "rgb(11, 50, 64)" };
const FOCUS = { light: "rgb(17, 138, 178)", dark: "rgb(76, 179, 214)" };

/** Whole cents as the app writes money: $1,250.00, and -$4,250.00 below zero. */
function dollars(cents: bigint) {
  const size = cents < 0n ? -cents : cents;
  const rest = size % 100n;
  const whole = ((size - rest) / 100n).toLocaleString("en-US");
  return `${cents < 0n ? "-" : ""}$${whole}.${String(rest).padStart(2, "0")}`;
}

type Entries = { total: number; entries: { entry_date: string; description: string; link: string }[] };

async function entries(request: APIRequestContext, query = "limit=100"): Promise<Entries> {
  const reply = await request.get(`/api/books/entries?${query}`);
  expect(reply.ok()).toBe(true);
  return (await reply.json()) as Entries;
}

async function balance(request: APIRequestContext, key: string) {
  const reply = await request.get("/api/books/balances");
  const { accounts } = (await reply.json()) as { accounts: { key: string; balance_cents: string }[] };
  return BigInt(accounts.find((account) => account.key === key)!.balance_cents);
}

function articles(page: Page) {
  return page.getByRole("region", { name: "Entries" }).getByRole("article");
}

function count(page: Page) {
  return page.getByRole("heading", { level: 1, name: "Journal" }).locator("xpath=following-sibling::span");
}

test("the Journal is full, newest first, with equal totals, and a document link opens its record", async ({
  page,
  request,
}) => {
  const { total, entries: newest } = await entries(request);
  expect(total).toBeGreaterThan(200);
  await page.goto("/accounting/journal");
  await expect(count(page)).toHaveText(`${total} entries`);
  await expect(articles(page)).toHaveCount(100);
  await expect(articles(page).first()).toContainText(newest[0].description);

  for (let place = 0; place < 5; place += 1) {
    const rows = articles(page).nth(place).getByRole("row");
    const totals = (await rows.last().getByRole("cell").allTextContents()).map((text) => text.trim());
    expect(totals[0]).toBe(totals[1]);
    expect(totals[0]).toMatch(/^\$[\d,]+\.\d\d$/);
  }

  const link = articles(page).locator('a[href^="/invoices/"], a[href^="/bills/"]').first();
  const to = await link.getAttribute("href");
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${to}$`));
  await expect(page.getByRole("region", { name: "Accounting" })).toBeVisible();
});

test("the account, the dates and the search narrow it, stay in the address through a refresh, and clear", async ({
  page,
  request,
}) => {
  await page.goto("/accounting/journal");
  await expect(articles(page)).toHaveCount(100);
  await expect(page.getByRole("button", { name: "Clear filters" })).toHaveCount(0);

  const filtered = page.waitForResponse((reply) => reply.url().includes("account=payable"));
  await page.getByRole("combobox", { name: "Account" }).selectOption("payable");
  await filtered;
  const payable = await entries(request, "account=payable&limit=1");
  await expect(page).toHaveURL(/\?account=payable$/);
  await expect(count(page)).toHaveText(new RegExp(`^${payable.total} of \\d+ entries$`));

  const searched = page.waitForResponse((reply) => reply.url().includes("q=northwind"));
  await page.getByRole("searchbox", { name: "Search entries" }).fill("northwind");
  await searched;
  await expect(page).toHaveURL(/account=payable&q=northwind$/);
  const found = await entries(request, "account=payable&q=northwind&limit=500");
  await expect(articles(page)).toHaveCount(Math.min(found.total, 100));
  for (const description of await articles(page).locator("span.font-semibold").allTextContents()) {
    expect(description.toLowerCase()).toContain("northwind");
  }

  await page.reload();
  await expect(page).toHaveURL(/account=payable&q=northwind$/);
  await expect(page.getByRole("combobox", { name: "Account" })).toHaveValue("payable");
  await expect(page.getByRole("searchbox", { name: "Search entries" })).toHaveValue("northwind");
  await expect(articles(page)).toHaveCount(Math.min(found.total, 100));

  const from = isoDay(-60);
  const dated = page.waitForResponse((reply) => reply.url().includes(`from=${from}`));
  await page.getByLabel("From", { exact: true }).fill(from);
  await dated;
  const recent = await entries(request, `account=payable&q=northwind&from=${from}&limit=500`);
  await expect(articles(page)).toHaveCount(recent.total);
  if (recent.total === 0) await expect(page.getByText("No entries match.")).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(page).toHaveURL(/\/accounting\/journal$/);
  await expect(page.getByRole("searchbox", { name: "Search entries" })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Clear filters" })).toHaveCount(0);
  await expect(articles(page)).toHaveCount(100);
});

test("scrolling to the end loads the next page, and Load more does too from the keyboard", async ({
  page,
  request,
}) => {
  const { total } = await entries(request, "limit=1");
  await page.goto("/accounting/journal");
  await expect(page.getByText(`Showing 100 of ${total} entries`)).toBeVisible();

  await page.getByText(`Showing 100 of ${total} entries`).scrollIntoViewIfNeeded();
  await expect(page.getByText(/^Showing 200 of/)).toBeVisible();

  // The real observer loads the rest of a short list by itself, so the button is tried on a fresh page.
  await page.goto("/accounting/journal");
  await expect(articles(page)).toHaveCount(100);
  const more = page.getByRole("button", { name: "Load more" });
  await more.focus();
  await expect(more).toHaveCSS("outline-color", FOCUS.light);
  await page.keyboard.press("Enter");
  await expect(page.getByText(/^Showing (200|\d{3}) of/)).toBeVisible();
});

test("clicking an account opens its ledger, whose newest balance is the account's balance in the books", async ({
  page,
  request,
}) => {
  await page.goto("/accounting/journal");
  await articles(page).first().getByRole("link", { name: "Receivable" }).first().click();
  await expect(page).toHaveURL(/\/accounting\/accounts\/receivable$/);
  await expect(page.getByRole("heading", { level: 1, name: "Receivable" })).toBeVisible();
  await expect(
    page.getByRole("img", { name: /^Receivable balance at the end of each of the last 12 months/ }),
  ).toBeVisible();

  const cents = await balance(request, "receivable");
  await expect(page.getByTestId("balance")).toHaveText(dollars(cents));
  const lines = page.getByRole("region", { name: "Lines" }).getByRole("row");
  await expect(lines.nth(1).getByRole("cell").last()).toHaveText(dollars(cents));
  await expect(page.getByRole("link", { name: "All entries" })).toBeVisible();
});

test("every account's ledger ends at its balance in the books", async ({ page, request }) => {
  const reply = await request.get("/api/books/balances");
  const { accounts } = (await reply.json()) as { accounts: { key: string; name: string; balance_cents: string }[] };
  for (const account of accounts) {
    await page.goto(`/accounting/accounts/${account.key}`);
    await expect(page.getByRole("heading", { level: 1, name: account.name })).toBeVisible();
    await expect(page.getByTestId("balance")).toHaveText(dollars(BigInt(account.balance_cents)));
  }
});

test("an unknown account says it no longer exists", async ({ page }) => {
  await page.goto("/accounting/accounts/bank");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This account no longer exists");
  await page.getByRole("link", { name: "Back to Journal" }).click();
  await expect(page).toHaveURL(/\/accounting\/journal$/);
});

for (const mode of ["light", "dark"] as const) {
  test(`the Journal and a ledger are on the panel colour in ${mode} mode, with the focus ring`, async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("banner")
      .getByRole("button", { name: /^Menu( for .+)?$/ })
      .click();
    await page.getByRole("menuitemradio", { name: mode === "dark" ? "Dark" : "Light" }).click();
    await page.keyboard.press("Escape");

    await page.goto("/accounting/journal");
    await expect(articles(page).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Entries" })).toHaveCSS("background-color", PANEL[mode]);
    await page.getByRole("searchbox", { name: "Search entries" }).focus();
    await expect(page.getByRole("searchbox", { name: "Search entries" })).toHaveCSS("outline-color", FOCUS[mode]);

    await page.goto("/accounting/accounts/cash");
    await expect(page.getByTestId("balance")).toContainText("$");
    await expect(page.getByRole("region", { name: "Lines" })).toHaveCSS("background-color", PANEL[mode]);
    await expect(page.getByRole("region", { name: "Balance by month" })).toHaveCSS("background-color", PANEL[mode]);
  });
}

test("a sample invoice's, payment's and bill's Accounting panels are full", async ({ page, request }) => {
  const invoices = (await (await request.get("/api/invoices")).json()) as {
    id: number;
    shows_as: string;
    total_cents: number;
    owed_cents: number;
  }[];
  const paid = invoices.find(
    (invoice) =>
      invoice.shows_as !== "draft" && invoice.shows_as !== "void" && invoice.owed_cents < invoice.total_cents,
  )!;
  await page.goto(`/invoices/${paid.id}`);
  const panel = page.getByRole("region", { name: "Accounting" });
  await expect(panel.getByRole("article")).toHaveCount(1);
  await page
    .getByRole("button", { name: /^Accounting for payment of/ })
    .first()
    .click();
  await expect(page.getByTestId("payment").first().getByRole("article").first()).toContainText("Payment received on");

  const bills = (await (await request.get("/api/bills")).json()) as { id: number; paid_on: string | null }[];
  const billPaid = bills.find((bill) => bill.paid_on !== null)!;
  await page.goto(`/bills/${billPaid.id}`);
  await expect(page.getByRole("region", { name: "Accounting" }).getByRole("article")).toHaveCount(2);
});
