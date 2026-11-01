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
  const customer = page.locator("tbody tr").filter({ hasText: "Customer" }).filter({ hasText: /\d{4}$/ }).first();
  await customer.getByRole("link").click();
  await expect(page).toHaveURL(/\/contacts\/\d+$/);
  await expect(page.getByTestId("timeline-entry").first()).toBeVisible();
});

test("what needs doing next is on the dashboard itself", async ({ page }) => {
  await expect(page.getByTestId("follow-up").first()).toBeVisible();
  await expect(page.getByTestId("follow-up-counts")).toContainText("overdue");
});
