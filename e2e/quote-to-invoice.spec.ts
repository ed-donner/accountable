import type { APIRequestContext, Page, Response } from "@playwright/test";

import { expect, test } from "./fixtures";
import { API, addLinkedDeal, addProduct, addQuote, resetToSampleData, sendQuote } from "./helpers";

// An invoice made from an accepted quote (V33 to V38, Q38), on a temporary database.

test.beforeEach(resetToSampleData);

type Line = {
  product_id: number;
  name: string;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
};
type Made = { id: number; number: string; deal_id: number; lines: Line[]; subtotal_cents: number };

function isPost(path: RegExp) {
  return (response: Response) => response.request().method() === "POST" && path.test(new URL(response.url()).pathname);
}

/** The deal's header and buttons are the quote page's first heading's surroundings. */
function pageHeader(page: Page) {
  return page.getByRole("main").getByRole("heading", { level: 1 }).locator("xpath=../../..");
}

async function readJson<T>(request: APIRequestContext, path: string) {
  const reply = await request.get(`${API}${path}`);
  expect(reply.ok()).toBe(true);
  return (await reply.json()) as T;
}

/** An accepted quote with three lines, priced by hand, on a new deal that the accepting makes won. */
async function acceptedQuote(request: APIRequestContext, name: string) {
  const set = await request.patch(`${API}/settings`, { data: { tax_label: "Sales tax", tax_rate: "8.875" } });
  expect(set.ok()).toBe(true);
  const { deal } = await addLinkedDeal(request, name, { stage: "proposal" });
  const license = await addProduct(request, `${name} license`, { unit_price_cents: 5000 });
  const support = await addProduct(request, `${name} support`, { unit_price_cents: 360000 });
  const training = await addProduct(request, `${name} training`, { unit_price_cents: 125000 });
  const lines = [
    { product_id: license.id, quantity: 3, unit_price_cents: 4500 },
    { product_id: support.id, quantity: 1, unit_price_cents: 360000 },
    { product_id: training.id, quantity: 2, unit_price_cents: 99999 },
  ];
  const sent = await sendQuote(request, (await addQuote(request, deal.id, lines)).id);
  const accepted = await request.post(`${API}/quotes/${sent.id}/accept`, { data: {} });
  expect(accepted.ok()).toBe(true);
  const quote = await readJson<Made>(request, `/quotes/${sent.id}`);
  return { deal, quote, products: { license, support, training } };
}

function written(lines: Line[]) {
  return lines.map(({ product_id, name, description, quantity, unit_price_cents }) => ({
    product_id,
    name,
    description,
    quantity,
    unit_price_cents,
  }));
}

async function createInvoice(page: Page) {
  const reply = page.waitForResponse(isPost(/^\/api\/invoices\/from-quote\/\d+$/));
  await page.getByRole("button", { name: "Create invoice" }).click();
  return (await reply).json() as Promise<{ id: number; lines: Line[]; bill_to: string }>;
}

test("Create invoice makes a draft with the quote's lines to the cent, and the quote and invoice link to each other", async ({
  page,
  request,
}) => {
  const { quote } = await acceptedQuote(request, "Linked");
  await page.goto(`/quotes/${quote.id}`);
  expect(await page.getByRole("button", { name: "Open invoice" }).count()).toBe(0);

  const made = await createInvoice(page);
  await expect(page.getByText(`Invoice created from ${quote.number}.`)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/invoices/${made.id}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Draft invoice" })).toBeVisible();

  expect(written(made.lines)).toEqual(written(quote.lines));
  expect(made.bill_to).toBe("Linked Ltd\nAttn: Linked Contact");
  const cards = page.getByTestId("draft-line");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0).getByLabel("Quantity")).toHaveValue("3");
  await expect(cards.nth(2).getByLabel("Quantity")).toHaveValue("2");
  await expect(page.getByRole("textbox", { name: "Bill to" })).toHaveValue("Linked Ltd\nAttn: Linked Contact");

  const link = page.getByRole("link", { name: `From quote ${quote.number}` });
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/quotes/${quote.id}$`));
  await expect(page.getByRole("button", { name: "Create invoice" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Draft" })).toBeVisible();

  await page.getByRole("button", { name: "Open invoice" }).click();
  await expect(page).toHaveURL(new RegExp(`/invoices/${made.id}$`));
  const issued = page.waitForResponse(isPost(/\/issue$/));
  await page.getByRole("button", { name: "Issue invoice" }).click();
  await page
    .getByRole("alertdialog", { name: "Issue this invoice?" })
    .getByRole("button", { name: "Issue invoice" })
    .click();
  const number = ((await (await issued).json()) as { number: string }).number;
  await expect(page.getByRole("heading", { level: 1, name: number })).toBeVisible();
  await expect(page.getByRole("link", { name: `From quote ${quote.number}` })).toBeVisible();

  await page.goto(`/quotes/${quote.id}`);
  await expect(page.getByRole("link", { name: number })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open invoice" })).toBeVisible();
});

test("a repriced product leaves the lines alone, and a changed tax rate shows its notice until it's put back", async ({
  page,
  request,
}) => {
  const { quote, products } = await acceptedQuote(request, "Repriced");
  expect(
    (await request.patch(`${API}/products/${products.license.id}`, { data: { unit_price_cents: 9900 } })).ok(),
  ).toBe(true);
  expect((await request.patch(`${API}/settings`, { data: { tax_rate: "10" } })).ok()).toBe(true);

  await page.goto(`/quotes/${quote.id}`);
  const made = await createInvoice(page);
  expect(written(made.lines)).toEqual(written(quote.lines));
  await expect(page.getByRole("heading", { level: 1, name: "Draft invoice" })).toBeVisible();
  const notice = page.getByRole("status").filter({ hasText: "was priced with" });
  await expect(notice).toHaveText(
    `${quote.number} was priced with Sales tax at 8.875%. Company settings now say 10%, so this draft's tax is worked out at 10%.`,
  );

  const invoice = await readJson<{ subtotal_cents: number; tax_rate: string }>(request, `/invoices/${made.id}`);
  expect(invoice.subtotal_cents).toBe(quote.subtotal_cents);
  expect(invoice.tax_rate).toBe("10");

  expect((await request.patch(`${API}/settings`, { data: { tax_rate: "8.875" } })).ok()).toBe(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Draft invoice" })).toBeVisible();
  await expect(notice).toHaveCount(0);
});

test("a second invoice from the quote is refused through the API, and the page's second try shows Open invoice", async ({
  page,
  request,
  expectConsoleError,
}) => {
  expectConsoleError(/status of 409/);
  const { quote } = await acceptedQuote(request, "Twice");
  await page.goto(`/quotes/${quote.id}`);
  const create = page.getByRole("button", { name: "Create invoice" });
  await expect(create).toBeEnabled();

  // Made in another tab, after this page read that the quote has none.
  const first = await request.post(`${API}/invoices/from-quote/${quote.id}`, { data: {} });
  expect(first.status()).toBe(201);
  const second = await request.post(`${API}/invoices/from-quote/${quote.id}`, { data: {} });
  expect(second.status()).toBe(409);
  expect((await second.json()).detail).toBe(`${quote.number} already has a draft invoice.`);

  const refused = page.waitForResponse(isPost(/\/from-quote\//));
  await create.click();
  expect((await refused).status()).toBe(409);
  await expect(page.getByText(`${quote.number} already has a draft invoice.`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Open invoice" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create invoice" })).toHaveCount(0);
});

test("deleting the draft gives the quote its Create invoice back", async ({ page, request }) => {
  const { quote } = await acceptedQuote(request, "Freed");
  await page.goto(`/quotes/${quote.id}`);
  const made = await createInvoice(page);
  await expect(page.getByRole("heading", { level: 1, name: "Draft invoice" })).toBeVisible();

  await page.getByRole("button", { name: "Delete draft" }).click();
  const deleted = page.waitForResponse(
    (response) => response.request().method() === "DELETE" && response.url().endsWith(`/api/invoices/${made.id}`),
  );
  await page
    .getByRole("alertdialog", { name: "Delete this draft?" })
    .getByRole("button", { name: "Delete draft" })
    .click();
  expect((await deleted).status()).toBe(204);

  await page.goto(`/quotes/${quote.id}`);
  await expect(page.getByRole("button", { name: "Create invoice" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Open invoice" })).toHaveCount(0);
});

test("a fresh copy's accepted quotes each have an invoice with the quote's lines", async ({ page, request }) => {
  const quotes = await readJson<{ id: number; number: string; status: string }[]>(request, "/quotes");
  const accepted = quotes.filter((quote) => quote.status === "accepted");
  expect(accepted.length).toBeGreaterThan(0);
  for (const quote of accepted) {
    const invoices = await readJson<{ id: number }[]>(request, `/invoices?quote_id=${quote.id}`);
    expect(invoices).toHaveLength(1);
    const [detail, original] = await Promise.all([
      readJson<{ lines: Line[]; quote: { number: string } }>(request, `/invoices/${invoices[0].id}`),
      readJson<Made>(request, `/quotes/${quote.id}`),
    ]);
    expect(written(detail.lines)).toEqual(written(original.lines));
    expect(detail.quote.number).toBe(quote.number);
  }

  const [first] = accepted;
  await page.goto(`/quotes/${first.id}`);
  await page.getByRole("button", { name: "Open invoice" }).click();
  await expect(page).toHaveURL(/\/invoices\/\d+$/);
  await expect(page.getByRole("link", { name: `From quote ${first.number}` })).toBeVisible();
});

test("a deal moved out of Won leaves Create invoice off, with the reason beside it", async ({ page, request }) => {
  const { deal, quote } = await acceptedQuote(request, "Moved");
  const moved = await request.post(`${API}/deals/${deal.id}/move`, { data: { stage: "negotiation" } });
  expect(moved.ok()).toBe(true);
  await page.goto(`/quotes/${quote.id}`);
  await expect(pageHeader(page).getByRole("button", { name: "Create invoice" })).toBeDisabled();
  await expect(page.getByText("Move the deal back to Won to invoice this quote.")).toBeVisible();
});
