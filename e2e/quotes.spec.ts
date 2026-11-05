import { readFileSync } from "node:fs";

import type { APIRequestContext, Page, TestInfo } from "@playwright/test";

import { expect, test } from "./fixtures";
import {
  API,
  addLinkedDeal,
  addQuote,
  findDeal,
  findProduct,
  pdfText,
  resetToSampleData,
  sendQuote,
  SIGNED_IN,
} from "./helpers";

// Quotes (Q5 to Q37), from the sample data, with any quote a test needs made through the API.

test.beforeEach(resetToSampleData);

const LICENSE = "Standard license, per user per year";
const TRAINING = "Training day, on site";
const SEAT = "Extra user seat, per month";

function heading(page: Page, name: string | RegExp) {
  return page.getByRole("heading", { level: 1, name });
}

function preview(page: Page) {
  return page.getByRole("article", { name: "Preview" });
}

function dialog(page: Page) {
  return page.getByRole("alertdialog");
}

/** A quote page's title, with its chip, its deal under it and its buttons. */
function pageHeader(page: Page) {
  return page.getByRole("main").getByRole("heading", { level: 1 }).locator("xpath=../../..");
}

/** A deal page's title, with its chips and its Edit and Delete buttons. */
function recordHeader(page: Page) {
  return page.getByRole("main").getByRole("heading", { level: 1 }).locator("xpath=..");
}

/** The figures' and amounts' text, with the spaces a page or PDF puts between words made single. */
function squashed(text: string | null) {
  return (text ?? "").replace(/\s+/g, " ");
}

async function lineOf(request: APIRequestContext, name: string, quantity = 1) {
  const product = await findProduct(request, name);
  return { product_id: product.id, quantity, unit_price_cents: product.unit_price_cents };
}

/** A sent quote on a new deal in Proposal, for tests that need one of their own. */
async function sentQuoteOnANewDeal(request: APIRequestContext, name: string) {
  const { deal, contact } = await addLinkedDeal(request, name, { stage: "proposal" });
  const quote = await sendQuote(request, (await addQuote(request, deal.id, [await lineOf(request, LICENSE, 3)])).id);
  return { deal, contact, quote };
}

async function download(page: Page, testInfo: TestInfo) {
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    pageHeader(page).getByRole("button", { name: "Download PDF" }).click(),
  ]);
  const saved = testInfo.outputPath(file.suggestedFilename());
  await file.saveAs(saved);
  return { name: file.suggestedFilename(), bytes: readFileSync(saved), text: squashed(pdfText(saved)) };
}

async function addProduct(page: Page, name: string) {
  await page.getByRole("button", { name: "Add product" }).click();
  await page.getByPlaceholder("Search products").fill(name);
  await page.getByRole("option", { name: new RegExp(`^${name}`) }).click();
}

test("a quote with three lines adds up the same in the form, the preview, the table and the PDF", async ({
  page,
  request,
}, testInfo) => {
  const deal = await findDeal(request, "Network refresh");
  await page.goto(`/deals/${deal.id}`);
  await page.getByRole("region", { name: "Quotes" }).getByRole("link", { name: "New quote" }).click();
  await expect(heading(page, "New quote")).toBeVisible();

  await addProduct(page, LICENSE);
  await addProduct(page, TRAINING);
  await addProduct(page, SEAT);
  await page.locator("#quote-line-0-quantity").fill("12");
  await page.locator("#quote-line-1-price").fill("1,100");
  await page.locator("#quote-line-2-quantity").fill("3");

  // 12 x $480.00 + 1 x $1,100.00 + 3 x $49.50 = $7,008.50, and 8.875% of that is $622.004375.
  const sums = ["Subtotal $7,008.50", "Sales tax (8.875%) $622.00", "Total $7,630.50"];
  await expect(page.locator("form#quote-form")).toContainText("$5,760.00");
  await expect(preview(page)).toContainText("$1,100.00");
  for (const sum of sums) await expect.poll(async () => squashed(await preview(page).innerText())).toContain(sum);

  const saved = page.waitForResponse(
    (reply) => reply.url().endsWith(`${API}/quotes`) && reply.request().method() === "POST",
  );
  await pageHeader(page).getByRole("button", { name: "Save quote" }).click();
  const quote = await (await saved).json();
  await expect(page.getByText("Quote saved.")).toBeVisible();
  await expect(heading(page, quote.number)).toBeVisible();
  expect([quote.subtotal_cents, quote.tax_cents, quote.total_cents]).toEqual([700850, 62200, 763050]);

  const pdf = await download(page, testInfo);
  for (const sum of sums) expect(pdf.text).toContain(sum);
  expect(pdf.text).toContain(`${LICENSE} 12 $480.00 $5,760.00`);

  await page.goto("/quotes");
  const row = page.getByRole("row", { name: new RegExp(`^${quote.number}`) });
  await expect(row).toContainText("$7,008.50");
  await expect(row).toContainText("$7,630.50");
  await expect(row).toContainText("Draft");
});

test("a sent quote can't be changed, on the page or through the API", async ({ page, request }) => {
  const deal = await findDeal(request, "Retail stock sync");
  const quote = await addQuote(request, deal.id, [await lineOf(request, LICENSE, 2)]);
  await page.goto(`/quotes/${quote.id}`);
  await expect(page.getByLabel("Valid until")).toBeVisible();

  await pageHeader(page).getByRole("button", { name: "Mark as sent" }).click();
  await expect(dialog(page)).toContainText(`Mark ${quote.number} as sent?`);
  await dialog(page).getByRole("button", { name: "Mark as sent" }).click();
  await expect(page.getByText("Quote sent.")).toBeVisible();
  await expect(pageHeader(page)).toContainText("Sent");
  await expect(page.getByLabel("Valid until")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save quote" })).toHaveCount(0);

  const refused = await request.patch(`${API}/quotes/${quote.id}`, { data: { lines: [] } });
  expect(refused.status()).toBe(409);
  expect((await refused.json()).detail).toBe(
    `${quote.number} has been sent, so it can't be changed. Copy it to make a new draft.`,
  );
});

test("accepting wins the deal at the quote's value, declines its other sent quote, and the timeline says who", async ({
  page,
  request,
}) => {
  const { deal, contact, quote: other } = await sentQuoteOnANewDeal(request, "Lakeside renewal");
  const chosen = await sendQuote(request, (await addQuote(request, deal.id, [await lineOf(request, SEAT, 101)])).id);

  await page.goto(`/quotes/${chosen.id}`);
  await pageHeader(page).getByRole("button", { name: "Accept" }).click();
  // 101 x $49.50 = $4,999.50, which makes the deal worth $5,000.
  await expect(dialog(page)).toContainText(
    `Lakeside renewal will move to Won with a value of $5,000, and ${other.number} will be marked declined. This can't be undone.`,
  );
  await dialog(page).getByRole("button", { name: "Accept quote" }).click();
  await expect(
    page.getByText(
      `Quote accepted. Lakeside renewal is now Won at $5,000. Close date set to today. ${contact.name} is now a customer.`,
    ),
  ).toBeVisible();
  await expect(pageHeader(page)).toContainText("Accepted");

  await page.getByRole("link", { name: "Lakeside renewal" }).click();
  await expect(heading(page, "Lakeside renewal")).toBeVisible();
  await expect(recordHeader(page)).toContainText("Won");
  await expect(page.getByRole("region", { name: "Details" })).toContainText("$5,000");
  const quotes = page.getByRole("region", { name: "Quotes" });
  await expect(quotes.getByRole("listitem").filter({ hasText: other.number })).toContainText("Declined");
  await expect(quotes.getByRole("listitem").filter({ hasText: chosen.number })).toContainText("Accepted");
  await expect(page.getByTestId("timeline-entry").first()).toContainText("Moved from Proposal to Won");
  await expect(page.getByTestId("timeline-entry").first()).toContainText(`by ${SIGNED_IN.name}`);

  const reply = await request.get(`${API}/contacts/${contact.id}`);
  expect((await reply.json()).status).toBe("customer");
});

test("copying makes a new draft with the same lines, and declining marks the old one declined", async ({
  page,
  request,
}) => {
  const deal = await findDeal(request, "Case management");
  const original = await addQuote(request, deal.id, [
    await lineOf(request, LICENSE, 4),
    await lineOf(request, SEAT, 2),
  ]);
  await page.goto(`/quotes/${original.id}`);
  await expect(heading(page, original.number)).toBeVisible();

  await pageHeader(page).getByRole("button", { name: "Copy to new draft" }).click();
  const copied = page.getByText(/^Copied to QT-\d{4}\.$/);
  await expect(copied).toBeVisible();
  const number = (await copied.textContent())!.replace("Copied to ", "").replace(".", "");
  await expect(heading(page, number)).toBeVisible();
  expect(number).not.toBe(original.number);
  await expect(preview(page)).toContainText(LICENSE);
  await expect(preview(page)).toContainText(SEAT);

  await page.goto(`/quotes/${original.id}`);
  await pageHeader(page).getByRole("button", { name: "Decline" }).click();
  await expect(dialog(page)).toContainText(`Decline ${original.number}?`);
  await dialog(page).getByRole("button", { name: "Decline quote" }).click();
  await expect(page.getByText("Quote declined.")).toBeVisible();
  await expect(pageHeader(page)).toContainText("Declined");
});

test("the PDF downloads named after its number, with the company, Prepared for and the lines", async ({
  page,
  request,
}, testInfo) => {
  const deal = await findDeal(request, "Press line monitoring");
  const quote = await sendQuote(request, (await addQuote(request, deal.id, [await lineOf(request, TRAINING, 2)])).id);
  await page.goto(`/quotes/${quote.id}`);
  await expect(heading(page, quote.number)).toBeVisible();

  const pdf = await download(page, testInfo);
  expect(pdf.name).toBe(`${quote.number}.pdf`);
  expect(pdf.bytes.subarray(0, 5).toString()).toBe("%PDF-");
  for (const part of [
    "Plainsong Systems 48 Orchard Row, Suite 210 Brooklyn, NY 11201 accounts@plainsong.example (718) 555-0142",
    "Prepared for Redwood Print Peter Novak",
    `${TRAINING} 2 $1,250.00 $2,500.00`,
    `${quote.number} Page 1 of 1`,
  ]) {
    expect(pdf.text).toContain(part);
  }
  expect(pdf.text).not.toContain("Draft");
});

test("the sample quotes fill the Quotes section, the deals and the organizations", async ({ page, request }) => {
  await page.goto("/quotes");
  const figures = page.getByRole("group", { name: "Filter by status" });
  for (const [status, count] of [
    ["All", 40],
    ["Draft", 8],
    ["Sent", 13],
    ["Expired", 2],
    ["Accepted", 15],
    ["Declined", 2],
  ] as const) {
    await expect(figures.getByRole("button", { name: new RegExp(`^${status}`) })).toContainText(`${status}${count}$`);
  }
  await expect(page.locator("tbody tr")).toHaveCount(40);
  await expect(page.locator("tbody tr").first()).toContainText("QT-0040");

  const proposal = await findDeal(request, "Retail stock sync");
  await page.goto(`/deals/${proposal.id}`);
  await expect(page.getByRole("region", { name: "Quotes" }).getByRole("link", { name: /^QT-/ })).not.toHaveCount(0);

  const quotes: { deal_id: number; deal_name: string; status: string; organization_id: number }[] = await (
    await request.get(`${API}/quotes`)
  ).json();
  const accepted = quotes.find((quote) => quote.status === "accepted")!;
  await page.goto(`/deals/${accepted.deal_id}`);
  await expect(recordHeader(page)).toContainText("Won");
  await expect(page.getByRole("region", { name: "Quotes" })).toContainText("Accepted");
  await expect(page.getByRole("region", { name: "Quotes" }).getByRole("link", { name: "New quote" })).toHaveCount(0);

  // An organization with quotes on more than one of its deals, whose panel names each deal.
  const dealsQuoted = new Map<number, Set<string>>();
  for (const quote of quotes) {
    dealsQuoted.set(quote.organization_id, (dealsQuoted.get(quote.organization_id) ?? new Set()).add(quote.deal_name));
  }
  const [busy, names] = [...dealsQuoted].find(([, quoted]) => quoted.size > 1)!;
  await page.goto(`/organizations/${busy}`);
  const panel = page.getByRole("region", { name: "Quotes" });
  for (const name of names) await expect(panel).toContainText(`${name} · $`);
});

test("the status filter shows only its quotes, stays after a refresh, and works with the search", async ({ page }) => {
  await page.goto("/quotes");
  await page
    .getByRole("group", { name: "Filter by status" })
    .getByRole("button", { name: /^Expired/ })
    .click();
  await expect(page).toHaveURL(/status=expired/);
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.locator("tbody tr")).toContainText(["Expired", "Expired"]);

  await page.reload();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^Expired/ })).toHaveAttribute("aria-pressed", "true");

  const first = await page.locator("tbody tr").first().locator("td").nth(1).innerText();
  await page.getByRole("searchbox", { name: "Search quotes" }).fill(first);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Search quotes" }).fill("nothing like it");
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page).not.toHaveURL(/status=/);
  await expect(page.locator("tbody tr")).toHaveCount(40);
});

test("a deal with quotes can't be deleted", async ({ page, request }) => {
  const deal = await findDeal(request, "Renewal and upgrade");
  await page.goto(`/deals/${deal.id}`);
  await recordHeader(page).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog(page)).toContainText("Renewal and upgrade can't be deleted");
  await expect(dialog(page)).toContainText(/This deal has \d+ quotes?, so it can't be deleted\./);
  await expect(dialog(page).getByRole("button")).toHaveText(["Close"]);
});
