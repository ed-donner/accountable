import { test, expect } from "./fixtures";

test("TE04 add, search, sort, edit and filter contacts; the page shows organization, deals and timeline", async ({ page }) => {
  await page.goto("/contacts");
  await expect(page.getByText("Showing 1 to 25 of 40")).toBeVisible();

  await page.getByRole("button", { name: "Add contact" }).first().click();
  const panel = page.getByRole("dialog", { name: "Add contact" });
  await panel.getByLabel("Name").fill("Aaron Quill");
  await panel.getByLabel("Organization").selectOption({ label: "Wilson Software" });
  await panel.getByLabel("Job title").fill("Head of IT");
  await panel.getByLabel("Email").fill("aaron.quill@wilsonsoftware.example.com");
  await panel.getByLabel("Phone").fill("(555) 010-2030");
  await expect(panel.getByLabel("Status")).toHaveValue("lead");
  await panel.getByRole("button", { name: "Add contact" }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByRole("row").nth(1)).toContainText("Aaron Quill");
  await expect(page.getByRole("row").nth(1)).toContainText("Lead");

  // Search covers email, phone, job title and organization too.
  const search = page.getByRole("searchbox", { name: "Search contacts" });
  for (const term of ["aaron.quill@", "010-2030", "Head of IT"]) {
    await search.fill(term);
    await expect(page.getByRole("row")).toHaveCount(2);
  }
  await search.fill("Wilson Software");
  await expect(page.getByRole("row")).toHaveCount(6);
  await search.fill("");

  // Sort by last activity.
  const last = page.getByRole("columnheader", { name: "Last activity" });
  await last.getByRole("button").click();
  await expect(last).toHaveAttribute("aria-sort", "ascending");

  // Edit the status from the row.
  await search.fill("Aaron");
  await page.getByRole("button", { name: "Edit Aaron Quill" }).click();
  const edit = page.getByRole("dialog", { name: "Edit contact" });
  await edit.getByLabel("Status").selectOption("qualified");
  await edit.getByRole("button", { name: "Save contact" }).click();
  await expect(page.getByRole("row", { name: /Aaron Quill/ })).toContainText("Qualified");

  // Status filter with counts.
  await search.fill("");
  const filter = page.getByRole("group", { name: "Filter by status" });
  await expect(filter.getByRole("button", { name: /^All/ })).toContainText("41");
  const qualified = filter.getByRole("button", { name: /^Qualified/ });
  const count = Number((await qualified.locator(".count").textContent()) ?? "0");
  await qualified.click();
  await expect(qualified).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(`Showing 1 to ${count} of ${count}`)).toBeVisible();
  const statuses = await page.locator("tbody .status").allTextContents();
  expect(new Set(statuses)).toEqual(new Set(["Qualified"]));

  // The contact's page.
  await page.goto("/contacts");
  await page.getByRole("searchbox").fill("Karen Willis");
  await page.getByRole("link", { name: "Karen Willis" }).click();
  const details = page.getByRole("region", { name: "Details" });
  await expect(details.getByRole("link", { name: "Wilson Software" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Deals" }).getByRole("link", { name: "Wilson support renewal" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Timeline" }).getByText("Moved from Qualified to Lost")).toBeVisible();
});

test("TE05 deleting a contact leaves their deals with no main contact", async ({ page }) => {
  await page.goto("/contacts");
  await page.getByRole("searchbox").fill("Karen Willis");
  await page.getByRole("link", { name: "Karen Willis" }).click();
  await page.getByRole("button", { name: "Delete contact" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Karen Willis is the main contact on 1 deal. They'll be kept, with no main contact.");
  await dialog.getByRole("button", { name: "Delete contact" }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await page.getByRole("searchbox").fill("Karen Willis");
  await expect(page.getByText("No contacts match “Karen Willis”.")).toBeVisible();

  await page.goto("/deals");
  await page.getByRole("searchbox").fill("Wilson support renewal");
  await page.getByRole("link", { name: "Wilson support renewal" }).click();
  await expect(page.getByRole("region", { name: "Details" })).toContainText("No main contact");
});
