import { expect, test } from "./fixtures";
import { resetToSampleData } from "./helpers";

test.beforeAll(resetToSampleData);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("summary")).toBeVisible();
});

test("which companies we deal with is one click away", async ({ page }) => {
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Organizations" }).click();
  await expect(page.getByRole("link", { name: "Harbor & Pine" })).toBeVisible();
});

test("who our contacts are is one click away", async ({ page }) => {
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Contacts" }).click();
  await expect(page.getByRole("link", { name: "Aisha Rahman" })).toBeVisible();
});

test("what's in the pipeline is one click away", async ({ page }) => {
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Pipeline" }).click();
  await expect(page.getByTestId("column-negotiation").locator("[data-deal]").first()).toBeVisible();
});

test("what happened last with a customer is two clicks away", async ({ page }) => {
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Contacts" }).click();
  const customer = page
    .locator("tbody tr")
    .filter({ hasText: "Customer" })
    .filter({ hasText: /\d{4}$/ })
    .first();
  await customer.getByRole("link").click();
  await expect(page).toHaveURL(/\/contacts\/\d+$/);
  await expect(page.getByTestId("timeline-entry").first()).toBeVisible();
});

test("what needs doing next is on the dashboard itself", async ({ page }) => {
  await expect(page.getByTestId("follow-up").first()).toBeVisible();
  await expect(page.getByTestId("follow-up-counts")).toContainText("overdue");
});

test("how much cash the business will have, and when, is on the dashboard itself", async ({ page }) => {
  const cashFlow = page.getByRole("region", { name: "Cash flow" });
  await cashFlow.scrollIntoViewIfNeeded();
  await expect(cashFlow).toContainText(/Cash today-?\$[\d,]+\.\d\d/);
  await expect(cashFlow).toContainText(/End of [A-Z][a-z]+-?\$[\d,]+\.\d\dExpected/);
});

test("what customers owe and what's overdue are on the dashboard itself", async ({ page }) => {
  const owed = page.getByRole("region", { name: "Owed to us" });
  await owed.scrollIntoViewIfNeeded();
  await expect(owed).toContainText(/Owed to us\$[\d,]+\.\d\d/);
  await expect(owed.getByRole("link", { name: /Overdue/ })).toContainText(/\$[\d,]+\.\d\d/);
});

test("which invoices are overdue is one click away", async ({ page }) => {
  await page
    .getByRole("region", { name: "Owed to us" })
    .getByRole("link", { name: /Overdue/ })
    .click();
  await expect(page).toHaveURL(/\/invoices\?status=overdue$/);
  await expect(page.locator("tbody tr").first()).toContainText("Overdue");
});

test("who has paid is two clicks away", async ({ page }) => {
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Invoices" }).click();
  await page.getByRole("group", { name: "Filter by status" }).getByRole("button", { name: /^Paid/ }).click();
  const rows = page.locator("tbody tr");
  await expect(rows.first()).toContainText("Paid");
  await expect(rows.filter({ hasNotText: "Paid" })).toHaveCount(0);
});
