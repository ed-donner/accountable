import { test, expect } from "./fixtures";

test("TE06 add, search, sort, edit and filter deals; late badge; the page shows details and timeline", async ({ page }) => {
  await page.goto("/deals");
  await page.getByRole("button", { name: "Add deal" }).first().click();
  const panel = page.getByRole("dialog", { name: "Add deal" });
  await panel.getByLabel("Name").fill("Wilson data platform");
  await panel.getByLabel("Organization").selectOption({ label: "Wilson Software" });
  // D2: the organization's contacts come first.
  await expect(panel.locator("#deal-contact optgroup").first()).toHaveAttribute("label", "At Wilson Software");
  await panel.getByLabel("Main contact").selectOption({ label: "Karen Willis" });
  await panel.getByLabel("Stage").selectOption("proposal");
  await panel.getByLabel("Value (US dollars)").fill("48,200");
  await panel.getByLabel("Close date").fill("2026-12-20");
  await panel.getByRole("button", { name: "Add deal" }).click();
  await expect(panel).toBeHidden();

  const search = page.getByRole("searchbox", { name: "Search deals" });
  await search.fill("data platform");
  const row = page.getByRole("row", { name: /Wilson data platform/ });
  await expect(row).toContainText("Proposal");
  await expect(row).toContainText("$48,200");
  await expect(row).toContainText("50%");
  await expect(row).toContainText("$24,100");
  await expect(row).toContainText("20 Dec 2026");

  // Search covers organization and main contact.
  await search.fill("Karen Willis");
  await expect(page.getByRole("row")).toHaveCount(3);

  // Sort by value, highest first on the second click.
  await search.fill("");
  const value = page.getByRole("columnheader", { name: "Value" });
  await value.getByRole("button").click();
  await value.getByRole("button").click();
  await expect(value).toHaveAttribute("aria-sort", "descending");
  const first = await page.getByRole("row").nth(1).locator("td").nth(4).textContent();
  const second = await page.getByRole("row").nth(2).locator("td").nth(4).textContent();
  expect(Number(first!.replace(/\D/g, ""))).toBeGreaterThanOrEqual(Number(second!.replace(/\D/g, "")));

  // Late deals stand out.
  await search.fill("Garcia data migration");
  await expect(page.getByRole("row", { name: /Garcia data migration/ }).getByText("Late")).toBeVisible();

  // Edit: a new stage resets the probability.
  await search.fill("data platform");
  await page.getByRole("button", { name: "Edit Wilson data platform" }).click();
  const edit = page.getByRole("dialog", { name: "Edit deal" });
  await edit.getByLabel("Stage").selectOption("negotiation");
  await edit.getByRole("button", { name: "Save deal" }).click();
  await expect(row).toContainText("Negotiation");
  await expect(row).toContainText("75%");

  // Stage filter.
  await search.fill("");
  await page.getByLabel("Filter by stage").selectOption("won");
  await expect(page).toHaveURL(/stage=won/);
  await expect(page.getByText("11 deals in Won")).toBeVisible();
  const stages = await page.locator("tbody .stage-pill").allTextContents();
  expect(new Set(stages)).toEqual(new Set(["Won"]));

  // The deal's page.
  await page.getByLabel("Filter by stage").selectOption("");
  await search.fill("data platform");
  await row.click();
  await expect(page.getByRole("heading", { level: 1, name: "Wilson data platform" })).toBeVisible();
  const details = page.getByRole("region", { name: "Details" });
  await expect(details.getByRole("link", { name: "Wilson Software" })).toBeVisible();
  await expect(details.getByRole("link", { name: "Karen Willis" })).toBeVisible();
  const timeline = page.getByRole("region", { name: "Timeline" }).getByRole("listitem");
  await expect(timeline.nth(0)).toContainText("Moved from Proposal to Negotiation");
  await expect(timeline.nth(1)).toContainText("Added in Proposal");

  // A late deal's page shows the badge too.
  await page.goto("/deals");
  await page.getByRole("searchbox").fill("Garcia data migration");
  await page.getByRole("link", { name: "Garcia data migration" }).click();
  await expect(page.getByRole("region", { name: "Details" }).getByText("Late")).toBeVisible();
});

test("TE07 deleting a deal removes its activities from the contact's timeline", async ({ page }) => {
  await page.goto("/deals");
  await page.getByRole("searchbox").fill("Wilson support renewal");
  await page.getByRole("link", { name: "Wilson support renewal" }).click();
  await page.getByLabel("What happened").fill("Asked about reopening the deal");
  await page.getByRole("button", { name: "Log activity" }).click();
  await expect(page.getByRole("region", { name: "Timeline" }).getByRole("listitem").first()).toContainText("Asked about reopening the deal");

  await page.getByRole("region", { name: "Details" }).getByRole("link", { name: "Karen Willis" }).click();
  const timeline = page.getByRole("region", { name: "Timeline" });
  await expect(timeline.getByText("Asked about reopening the deal")).toBeVisible();

  await page.goBack();
  await page.getByRole("button", { name: "Delete deal" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("They'll be deleted with it.");
  await dialog.getByRole("button", { name: "Delete deal" }).click();
  await expect(page).toHaveURL(/\/deals$/);

  await page.goto("/contacts");
  await page.getByRole("searchbox").fill("Karen Willis");
  await page.getByRole("link", { name: "Karen Willis" }).click();
  await expect(page.getByRole("region", { name: "Timeline" }).getByRole("listitem").first()).toBeVisible();
  await expect(page.getByText("Asked about reopening the deal")).toHaveCount(0);
  await expect(page.getByText("Wilson support renewal")).toHaveCount(0);
});
