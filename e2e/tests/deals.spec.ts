import { apiGet, apiPost, choose, expect, pick, test, uniqueName } from "../fixtures";

type Deal = { id: number; name: string; value: number; close_date: string; is_late: boolean; stage: string };

test.describe("Deals", () => {
  test("add a deal with an organization and a main contact (DEAL-1)", async ({ page }) => {
    const name = uniqueName("E2E Deal");
    await page.goto("/deals");
    await expect(page).toHaveTitle("Deals · Accountable");
    await page.getByRole("button", { name: "Add deal" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add deal" });
    await dialog.getByLabel("Name").fill(name);
    await choose(page, dialog.getByLabel("Organization"), "Bluefin Logistics");
    await choose(page, dialog.getByLabel("Main contact"), "Sarah Chen");
    await pick(page, dialog.getByLabel("Stage"), "Qualified");
    await expect(dialog.getByLabel("Probability")).toHaveValue("25");
    await dialog.getByLabel("Value").fill("12,500");
    await dialog.getByRole("button", { name: "Add deal" }).click();
    await expect(page.getByText("Deal added")).toBeVisible();

    await page.getByRole("searchbox", { name: "Search deals" }).fill(name);
    const row = page.locator("tbody tr").first();
    await expect(row).toContainText("Bluefin Logistics");
    await expect(row).toContainText("Sarah Chen");
    await expect(row).toContainText("$12,500");
    await expect(row).toContainText("25%");
    await expect(row).toContainText("$3,125");
  });

  test("late deals show Late, and sorting by value and close date works (DEAL-2)", async ({ page, request }) => {
    const deals = await apiGet<Deal[]>(request, "/api/deals");
    await page.goto("/deals");
    const rows = page.locator("tbody tr");
    for (const deal of deals.filter((d) => d.is_late)) {
      await expect(rows.filter({ hasText: deal.name }).getByText("Late", { exact: true })).toBeVisible();
    }
    // Sorted by close date, earliest first, at first.
    const earliest = [...deals].sort((a, b) => a.close_date.localeCompare(b.close_date) || a.id - b.id)[0];
    await expect(rows.first()).toContainText(earliest.name);

    await page.getByRole("button", { name: "Value", exact: true }).click();
    const cheapest = [...deals].sort((a, b) => a.value - b.value)[0];
    await expect(rows.first()).toContainText(cheapest.name);
    await page.getByRole("button", { name: "Value", exact: true }).click();
    const dearest = [...deals].sort((a, b) => b.value - a.value)[0];
    await expect(rows.first()).toContainText(dearest.name);

    await page.getByRole("button", { name: "Close date" }).click();
    await page.getByRole("button", { name: "Close date" }).click();
    const latest = [...deals].sort((a, b) => b.close_date.localeCompare(a.close_date))[0];
    await expect(rows.first()).toContainText(latest.name);
  });

  test("choosing Proposal in the edit form fills in 50% (STG-2)", async ({ page }) => {
    await page.goto("/deals");
    await page.getByRole("searchbox", { name: "Search deals" }).fill("Data dashboard build");
    await page.getByRole("button", { name: "Edit Data dashboard build" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit Data dashboard build" });
    await expect(dialog.getByLabel("Probability")).toHaveValue("25");
    await pick(page, dialog.getByLabel("Stage"), "Proposal");
    await expect(dialog.getByLabel("Probability")).toHaveValue("50");
    await pick(page, dialog.getByLabel("Stage"), "Won");
    await expect(dialog.getByLabel("Probability")).toHaveValue("100");
    await expect(dialog.getByLabel("Probability")).toHaveAttribute("readonly", "");
    await dialog.getByRole("button", { name: "Cancel" }).click();
  });

  test("the deal page shows its figures, and the stage bar moves it (DEAL-4, DEAL-5)", async ({ page, request }) => {
    const deal = await apiPost<Deal>(request, "/api/deals", {
      name: uniqueName("E2E Stage bar"),
      organization_id: (await apiGet<{ id: number }[]>(request, "/api/organizations"))[0].id,
      stage: "proposal",
      value: 48500,
      close_date: "2030-03-15",
    });
    await page.goto(`/deals/${deal.id}`);
    await expect(page).toHaveTitle(`${deal.name} · Accountable`);
    const details = page.getByRole("main");
    await expect(details.getByText("$48,500")).toBeVisible();
    await expect(details.getByText("50%")).toBeVisible();
    await expect(details.getByText("$24,250")).toBeVisible();
    await expect(details.getByText("Mar 15, 2030")).toBeVisible();

    await page.getByRole("navigation", { name: "Stage" }).getByRole("button", { name: "Move to Negotiation" }).click();
    await expect(page.getByText("Deal moved to Negotiation")).toBeVisible();
    await expect(details.getByText("75%")).toBeVisible();
    await expect(page.getByRole("button", { name: "Negotiation, the current stage" })).toBeVisible();
    await expect(page.locator('[data-entry-type="stage_change"]').first()).toContainText("Moved from Proposal to Negotiation");

    await page.reload();
    await expect(page.getByRole("button", { name: "Negotiation, the current stage" })).toBeVisible();
  });
});
