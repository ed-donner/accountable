import { test, expect } from "./fixtures";

// The fixture fails any test with a console error (G11). This one walks every
// page and opens every panel and dialog, so nothing is missed between the other tests.
test("TE21 every page and action runs with no console errors", async ({ page }) => {
  await page.goto("/");
  const sections = page.getByRole("navigation", { name: "Sections" });
  for (const name of ["Dashboard", "Pipeline", "Deals", "Contacts", "Organizations"]) {
    await sections.getByRole("link", { name }).click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  }

  for (const [path, add, edit] of [
    ["/organizations", "Add organization", "Edit organization"],
    ["/contacts", "Add contact", "Edit contact"],
    ["/deals", "Add deal", "Edit deal"],
  ] as const) {
    await page.goto(path);
    await page.getByRole("button", { name: add }).first().click();
    await expect(page.getByRole("dialog", { name: add })).toBeVisible();
    await page.keyboard.press("Escape");
    const row = page.locator("tbody tr").first();
    await row.hover();
    await row.getByRole("button", { name: /^Edit / }).click();
    await expect(page.getByRole("dialog", { name: edit })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await row.getByRole("button", { name: /^Delete / }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    // Sort every column and page through.
    for (const header of await page.locator("thead th .sort").all()) await header.click();
    if ((await page.getByRole("button", { name: "Next page" }).count()) > 0) {
      await page.getByRole("button", { name: "Next page" }).click();
    }
    await row.click();
    await expect(page.getByRole("region", { name: "Details" })).toBeVisible();
    await page.getByRole("region", { name: "Details" }).getByRole("button", { name: "Edit" }).click();
    await page.keyboard.press("Escape");
  }

  // Filters and the board's search.
  await page.goto("/contacts?status=customer");
  await page.goto("/deals?stage=lost");
  await page.goto("/pipeline");
  await page.getByRole("searchbox").fill("Wilson");
  await page.getByRole("button", { name: "Add deal in Won" }).click();
  await page.keyboard.press("Escape");
});
