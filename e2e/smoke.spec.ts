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

  // RV11: an id that can't exist (too large for the database, or not a number) is
  // simply not found, on every kind of record page.
  for (const [path, kind] of [["organizations", "organization"], ["contacts", "contact"], ["deals", "deal"]]) {
    for (const id of ["99999999999999999999", "9223372036854775808", "abc"]) {
      test(`TE01 /${path}/${id} says it can't find that ${kind}`, async ({ page }) => {
        await page.goto(`/${path}/${id}`);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(`We couldn't find that ${kind}`);
        await expect(page.getByRole("link", { name: "Go to the dashboard" })).toBeVisible();
      });
    }
  }
});
