import { test, expect } from "./fixtures";

test("TE01 every section opens from the sidebar", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  for (const name of ["Pipeline", "Deals", "Contacts", "Organizations", "Dashboard"]) {
    await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name }).click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  }
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that page");
});

test.describe("a link to a deleted record", () => {
  // The browser itself logs the 404; the page explains it plainly.
  test.use({ allowConsoleErrors: [/status of 404/] });
  test("TE01 says it can't be found and links home", async ({ page }) => {
    await page.goto("/deals/99999");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that deal");
    await page.getByRole("link", { name: "Go to the dashboard" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  });
});
