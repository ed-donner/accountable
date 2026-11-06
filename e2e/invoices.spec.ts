import { readFileSync } from "node:fs";

import type { Page, Response } from "@playwright/test";

import { expect, test } from "./fixtures";
import {
  API,
  addIssuedInvoice,
  addLinkedDeal,
  addProduct,
  isoDay,
  resetToSampleData,
  saveDraft,
  startInvoice,
} from "./helpers";

// The sample company issues invoices, and some tests need the sample invoices, so each starts from them.
test.beforeEach(resetToSampleData);

/** $1,250.00, from whole cents, as the app writes money on invoices. */
function dollars(cents: number) {
  const rest = cents % 100;
  return `$${((cents - rest) / 100).toLocaleString("en-US")}.${String(rest).padStart(2, "0")}`;
}

/** A date as the page writes it, such as Dec 5, 2026. */
function shown(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isWrite(method: string, path: RegExp) {
  return (response: Response) => response.request().method() === method && path.test(new URL(response.url()).pathname);
}

/** Counts what the page sends to this path from now on. */
function countWrites(page: Page, method: string, path: RegExp) {
  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.method() === method && path.test(new URL(request.url()).pathname)) sent.push(request.url());
  });
  return sent;
}

function card(page: Page, place: number) {
  return page.getByTestId("draft-line").nth(place);
}

async function addLine(page: Page, product: string) {
  await page.getByRole("button", { name: "Add line" }).click();
  await page.getByPlaceholder("Search products").fill(product);
  await page.getByRole("option", { name: new RegExp(product) }).click();
  await expect(page.getByTestId("draft-line").filter({ hasText: product })).toHaveCount(1);
}

function header(page: Page) {
  return page.getByRole("heading", { level: 1 });
}

/** The chip beside the page's title, which the preview's own words can't be taken for. */
function chip(page: Page, text: string) {
  return header(page).locator("..").getByText(text, { exact: true });
}

async function recordPayment(page: Page, amount?: string) {
  await page.getByRole("button", { name: "Record payment" }).click();
  const dialog = page.getByRole("dialog", { name: "Record payment" });
  if (amount !== undefined) await dialog.getByLabel("Amount").fill(amount);
  return dialog;
}

test("a won deal's invoice, from draft to paid", async ({ page, request }) => {
  const { deal } = await addLinkedDeal(request, "Flow", { stage: "won", close_date: isoDay() });
  await addProduct(request, "Flow license", { unit_price_cents: 4950 });
  await addProduct(request, "Flow support", { unit_price_cents: 360000 });
  await addProduct(request, "Flow training", { unit_price_cents: 125000 });

  await page.goto(`/deals/${deal.id}`);
  await page.getByRole("region", { name: "Invoices" }).getByRole("button", { name: "New invoice" }).click();
  await expect(header(page)).toHaveText("Draft invoice");
  await expect(page.getByRole("textbox", { name: "Bill to" })).toHaveValue("Flow Ltd\nAttn: Flow Contact");

  await addLine(page, "Flow license");
  await addLine(page, "Flow support");
  await addLine(page, "Flow training");
  await card(page, 0).getByLabel("Quantity").fill("2");
  await card(page, 2).getByLabel("Unit price").fill("1257.00");
  // 2 x $49.50 + $3,600.00 + $1,257.00 = $4,956.00, and 8.875% of it is $439.845, which rounds up.
  const figures = page.getByTestId("draft-figures");
  await expect(figures).toContainText("$4,956.00");
  await expect(figures).toContainText("$439.85");
  await expect(figures).toContainText("$5,395.85");

  const saved = page.waitForResponse(isWrite("PATCH", /^\/api\/invoices\/\d+$/));
  await page.getByRole("button", { name: "Save draft" }).click();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByText("Draft saved.")).toBeVisible();

  await page.getByRole("button", { name: "Issue invoice" }).click();
  const issuing = page.waitForResponse(isWrite("POST", /^\/api\/invoices\/\d+\/issue$/));
  await page
    .getByRole("alertdialog", { name: "Issue this invoice?" })
    .getByRole("button", { name: "Issue invoice" })
    .click();
  const issued = await (await issuing).json();
  expect(issued.number).toMatch(/^INV-\d{4}$/);
  expect(issued.total_cents).toBe(539585);
  await expect(header(page)).toHaveText(issued.number);
  await expect(page.getByRole("region", { name: "Details" })).toContainText(shown(isoDay(30)));

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const pdf = await downloading;
  expect(pdf.suggestedFilename()).toBe(`${issued.number}.pdf`);
  expect(
    readFileSync(await pdf.path())
      .subarray(0, 4)
      .toString(),
  ).toBe("%PDF");

  const tooMuch = await recordPayment(page, "5395.86");
  await tooMuch.getByRole("button", { name: "Record payment" }).click();
  await expect(tooMuch.getByText("That's more than the $5,395.85 still owed")).toBeVisible();
  await tooMuch.getByLabel("Amount").fill("1000.00");
  const part = page.waitForResponse(isWrite("POST", /\/payments$/));
  await tooMuch.getByRole("button", { name: "Record payment" }).click();
  expect((await part).ok()).toBe(true);
  await expect(chip(page, "Part paid")).toBeVisible();
  await expect(page.getByRole("img", { name: "$1,000.00 paid and $4,395.85 owed" })).toBeVisible();

  const rest = await recordPayment(page);
  await expect(rest.getByLabel("Amount")).toHaveValue("4395.85");
  const paid = page.waitForResponse(isWrite("POST", /\/payments$/));
  await rest.getByRole("button", { name: "Record payment" }).click();
  expect((await paid).ok()).toBe(true);
  await expect(chip(page, "Paid")).toBeVisible();
  await expect(page.getByRole("button", { name: "Record payment" })).toHaveCount(0);
});

test("an issued invoice can't be changed", async ({ page, request }) => {
  const { invoice } = await addIssuedInvoice(request, "Fixed");
  await page.goto(`/invoices/${invoice.id}`);
  await expect(header(page)).toHaveText(invoice.number!);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  for (const name of ["Save draft", "Issue invoice", "Delete draft", "Add line"]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }

  const changed = await request.patch(`${API}/invoices/${invoice.id}`, { data: { bill_to: "Someone else" } });
  const deleted = await request.delete(`${API}/invoices/${invoice.id}`);
  for (const refused of [changed, deleted]) {
    expect(refused.status()).toBe(409);
    expect((await refused.json()).detail).toBe("This invoice has been issued, so it can't be changed.");
  }

  expect((await request.patch(`${API}/settings`, { data: { invoice_prefix: "B-" } })).ok()).toBe(true);
  await page.reload();
  await expect(header(page)).toHaveText(invoice.number!);
});

test("overdue shows everywhere", async ({ page, request }) => {
  await page.goto("/invoices?status=overdue");
  const rows = page.locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  await rows.first().getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^INV-\d{4}$/);
  await expect(chip(page, "Overdue")).toBeVisible();
  await expect(page.getByText(/^\d+ days? late$/)).toBeVisible();
  await expect(page.locator("svg text", { hasText: "OVERDUE" })).toBeVisible();

  const listed: { shows_as: string; owed_cents: number }[] = await (await request.get(`${API}/invoices`)).json();
  const owed = listed.filter((row) => row.shows_as === "overdue").reduce((sum, row) => sum + row.owed_cents, 0);
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Owed to us" }).getByRole("link", { name: /Overdue/ })).toContainText(
    dollars(owed),
  );
});

test("leaving a draft asks first", async ({ page, request }) => {
  const { deal } = await addLinkedDeal(request, "Leaving", { stage: "won", close_date: isoDay() });
  const draft = await startInvoice(request, deal.id);
  await page.goto(`/invoices/${draft.id}`);
  const billTo = page.getByRole("textbox", { name: "Bill to" });
  await expect(billTo).toHaveValue("Leaving Ltd\nAttn: Leaving Contact");

  await billTo.fill("Leaving Ltd, typed");
  const sections = page.getByRole("navigation", { name: "Sections" });
  await sections.getByRole("link", { name: "Dashboard" }).click();
  const question = page.getByRole("alertdialog", { name: "Leave without saving?" });
  await expect(question).toContainText("Your changes to this draft will be lost.");
  await question.getByRole("button", { name: "Stay" }).click();
  await expect(page).toHaveURL(new RegExp(`/invoices/${draft.id}$`));
  await expect(billTo).toHaveValue("Leaving Ltd, typed");

  await sections.getByRole("link", { name: "Dashboard" }).click();
  await question.getByRole("button", { name: "Leave" }).click();
  await expect(page.getByTestId("revenue-this-month")).toBeVisible();

  await page.goto(`/invoices/${draft.id}`);
  await expect(billTo).toHaveValue("Leaving Ltd\nAttn: Leaving Contact");
  await sections.getByRole("link", { name: "Dashboard" }).click();
  await expect(page.getByTestId("revenue-this-month")).toBeVisible();
});

test("characters the fonts lack", async ({ page, request }) => {
  const { deal } = await addLinkedDeal(request, "Glyphs", { stage: "won", close_date: isoDay() });
  const product = await addProduct(request, "Glyphs license");
  const draft = await startInvoice(request, deal.id);
  await saveDraft(request, draft.id, { lines: [{ product_id: product.id }] });

  await page.goto(`/invoices/${draft.id}`);
  const saves = countWrites(page, "PATCH", /^\/api\/invoices\//);
  await page.getByRole("textbox", { name: "Bill to" }).fill("Glyphs Ltd \u{1F600}");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText('Invoices can\'t show "\u{1F600}". Take it out to save')).toBeVisible();
  expect(saves).toEqual([]);

  expect((await request.patch(`${API}/settings`, { data: { address: "48 Orchard Row 漢" } })).ok()).toBe(true);
  await page.goto(`/invoices/${draft.id}`);
  await page.getByRole("button", { name: "Issue invoice" }).click();
  await expect(
    page.getByText(
      'The address in Company settings has "漢", which invoices can\'t show. Change it there before issuing.',
    ),
  ).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("void, and delete a payment", async ({ page, request }) => {
  const voided = await addIssuedInvoice(request, "Voided");
  await page.goto(`/invoices/${voided.invoice.id}`);
  await page.getByRole("button", { name: "Void" }).click();
  const voiding = page.waitForResponse(isWrite("POST", /\/void$/));
  await page
    .getByRole("alertdialog", { name: `Void ${voided.invoice.number}?` })
    .getByRole("button", { name: "Void" })
    .click();
  expect((await voiding).ok()).toBe(true);
  await expect(chip(page, "Void")).toBeVisible();
  await expect(header(page)).toHaveText(voided.invoice.number!);
  await expect(page.locator("svg text", { hasText: "VOID" }).first()).toBeVisible();

  const paid = await addIssuedInvoice(request, "Repaid", 125000);
  const payment = await request.post(`${API}/invoices/${paid.invoice.id}/payments`, {
    data: { paid_on: isoDay(), amount_cents: 50000, method: "card", reference: null },
  });
  expect(payment.ok()).toBe(true);
  await page.goto(`/invoices/${paid.invoice.id}`);
  await expect(page.getByText("$500.00 paid")).toBeVisible();
  await expect(page.getByRole("button", { name: "Void" })).toHaveCount(0);

  await page.getByRole("button", { name: "Delete payment of $500.00" }).click();
  const question = page.getByRole("alertdialog", { name: "Delete this payment of $500.00?" });
  await expect(question).toContainText(`What's owed goes back up to ${dollars(paid.invoice.total_cents)}.`);
  const deleting = page.waitForResponse(isWrite("DELETE", /\/payments\/\d+$/));
  await question.getByRole("button", { name: "Delete payment" }).click();
  expect((await deleting).ok()).toBe(true);
  await expect(page.getByText(`${dollars(paid.invoice.total_cents)} owed`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Void" })).toBeVisible();
});

test("an issued invoice's Accounting panel shows its entry, a payment's button its own, and the reversal after voiding", async ({
  page,
  request,
}) => {
  const issued = await addIssuedInvoice(request, "Panel Co", 125000);
  await page.goto(`/invoices/${issued.invoice.id}`);
  const panel = page.getByRole("region", { name: "Accounting", exact: true }).first();
  await expect(panel.getByRole("article")).toHaveCount(1);
  await expect(panel).toContainText(`Invoice ${issued.invoice.number} issued`);

  const recording = page.waitForResponse(isWrite("POST", /\/payments$/));
  await page.getByRole("button", { name: "Record payment" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Record payment" }).click();
  expect((await recording).ok()).toBe(true);
  await page.getByRole("button", { name: /^Accounting for payment of/ }).click();
  await expect(page.getByTestId("payment").getByRole("article")).toContainText(
    `Payment received on ${issued.invoice.number}`,
  );
  // The invoice's own panel shows the invoice's entries only.
  await expect(panel.getByRole("article")).toHaveCount(1);

  const deleting = page.waitForResponse(isWrite("DELETE", /\/payments\/\d+$/));
  await page.getByRole("button", { name: /^Delete payment of/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete payment" }).click();
  expect((await deleting).ok()).toBe(true);
  await expect(page.getByText("No payments yet.")).toBeVisible();

  const voiding = page.waitForResponse(isWrite("POST", /\/void$/));
  await page.getByRole("button", { name: "Void" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Void" }).click();
  expect((await voiding).ok()).toBe(true);
  await expect(panel.getByRole("article")).toHaveCount(2);
  await expect(panel.getByText("Reversal")).toBeVisible();
  await expect(panel.getByText("Reversed", { exact: true })).toBeVisible();
});

test("the sample data fills every part", async ({ page, request }) => {
  await page.goto("/invoices");
  const filter = page.getByRole("group", { name: "Filter by status" });
  await expect(filter.getByRole("button", { name: /^All/ })).toContainText("33");
  for (const status of ["Draft", "Issued", "Part paid", "Overdue", "Paid", "Void"]) {
    await expect(filter.getByRole("button", { name: new RegExp(`^${status}`) }), status).toHaveText(
      new RegExp(`^${status}[1-9]\\d*$`),
    );
  }

  const listed: { deal: { id: number }; number: string | null }[] = await (await request.get(`${API}/invoices`)).json();
  const issued = listed.find((row) => row.number !== null)!;
  await page.goto(`/deals/${issued.deal.id}`);
  await expect(
    page.getByRole("region", { name: "Invoices" }).getByRole("link", { name: issued.number! }),
  ).toBeVisible();

  // Its sums come as digits, because they can pass what a JavaScript number holds exactly.
  const money = await (await request.get(`${API}/invoices/money`)).json();
  expect(Number(money.owed.cents)).toBeGreaterThan(0);
  expect(money.groups.map((group: { cents: string }) => Number(group.cents) > 0)).toEqual([
    true,
    true,
    true,
    true,
    true,
  ]);
  expect(money.payments).toHaveLength(12);
  expect(money.payments.every((month: { cents: string }) => Number(month.cents) > 0)).toBe(true);
  await page.goto("/");
  const owed = page.getByRole("region", { name: "Owed to us" });
  await expect(owed).toContainText(dollars(Number(money.owed.cents)));
  await expect(owed.getByRole("list", { name: "How late" }).getByRole("listitem")).toHaveCount(5);
  await expect(page.getByRole("region", { name: "Payments received" }).locator(".recharts-bar-rectangle")).toHaveCount(
    12,
  );
});
