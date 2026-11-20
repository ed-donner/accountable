import { apiGet, expect, test, uniqueName } from "../fixtures";

type Org = { id: number; name: string; open_pipeline: number };

test.describe("Organizations", () => {
  test("add, search, sort, edit and refresh (ORG-1, TBL-1 to TBL-6)", async ({ page, request }) => {
    const name = uniqueName("E2E Org");
    await page.goto("/organizations");
    await expect(page).toHaveTitle("Organizations · Accountable");
    const before = (await apiGet<Org[]>(request, "/api/organizations")).length;
    await expect(page.getByText(`${before} organizations`).first()).toBeVisible();

    // Add one.
    await page.getByRole("button", { name: "Add organization" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add organization" });
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Industry").fill("Testing");
    await dialog.getByLabel("Website").fill("e2e.example");
    await dialog.getByRole("button", { name: "Add organization" }).click();
    await expect(page.getByText("Organization added")).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();

    // Search matches any part, ignoring capitals.
    const search = page.getByRole("searchbox", { name: "Search organizations" });
    await search.fill(name.toUpperCase().slice(0, 12));
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    await search.fill("logist");
    await expect(page.getByRole("link", { name: "Bluefin Logistics" })).toBeVisible();
    await expect(page.getByRole("link", { name, exact: true })).toBeHidden();
    await search.fill("zzzz-nothing");
    await expect(page.getByText('No organizations match "zzzz-nothing"')).toBeVisible();
    await search.fill("");

    // Sort by name, then by open pipeline.
    const rows = page.locator("tbody tr");
    const names = await apiGet<Org[]>(request, "/api/organizations");
    const sortedByName = names.map((o) => o.name).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
    await expect(rows.first()).toContainText(sortedByName[0]);
    await page.getByRole("button", { name: "Name" }).click();
    await expect(page.getByRole("columnheader", { name: "Name" })).toHaveAttribute("aria-sort", "descending");
    await expect(rows.first()).toContainText(sortedByName[sortedByName.length - 1]);

    await page.getByRole("button", { name: "Open pipeline" }).click();
    await page.getByRole("button", { name: "Open pipeline" }).click();
    await expect(page.getByRole("columnheader", { name: "Open pipeline" })).toHaveAttribute("aria-sort", "descending");
    const biggest = [...names].sort((a, b) => b.open_pipeline - a.open_pipeline)[0];
    await expect(rows.first()).toContainText(biggest.name);

    // Edit, refresh, and the change is kept.
    await search.fill(name);
    await page.getByRole("button", { name: `Edit ${name}` }).click();
    const edit = page.getByRole("dialog", { name: `Edit ${name}` });
    await edit.getByLabel("Industry").fill("Quality assurance");
    await edit.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Changes saved")).toBeVisible();
    await page.reload();
    await page.getByRole("searchbox", { name: "Search organizations" }).fill(name);
    await expect(page.locator("tbody tr").first()).toContainText("Quality assurance");
  });

  test("a duplicate name shows its message before saving (ORG-1)", async ({ page }) => {
    await page.goto("/organizations");
    await page.getByRole("button", { name: "Add organization" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add organization" });
    await dialog.getByLabel("Name").fill("bluefin LOGISTICS");
    await expect(dialog.getByText("An organization called Bluefin Logistics already exists.")).toBeVisible();
    await dialog.getByRole("button", { name: "Add organization" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("clicking a row opens the organization (TBL-5)", async ({ page }) => {
    await page.goto("/organizations");
    await page.locator("tbody tr", { hasText: "Bluefin Logistics" }).getByText("Logistics", { exact: true }).click();
    await expect(page).toHaveURL(/\/organizations\/\d+$/);
  });

  test("the page shows its figures, contacts and deals, and Add contact fills in the organization (ORG-2, ORG-3)", async ({
    page,
    request,
  }) => {
    const orgs = await apiGet<Org[]>(request, "/api/organizations");
    const bluefin = orgs.find((o) => o.name === "Bluefin Logistics")!;
    const detail = await apiGet<{ revenue_won: number; contacts: { name: string }[]; deals: { name: string }[] }>(
      request,
      `/api/organizations/${bluefin.id}`,
    );
    await page.goto(`/organizations/${bluefin.id}`);
    await expect(page).toHaveTitle("Bluefin Logistics · Accountable");
    await expect(page.getByText("Open pipeline")).toBeVisible();
    await expect(page.getByText(`${bluefin.open_pipeline.toLocaleString("en-US")}`).first()).toBeVisible();
    await expect(page.getByText(`${detail.revenue_won.toLocaleString("en-US")}`).first()).toBeVisible();
    for (const contact of detail.contacts) {
      await expect(page.getByRole("list", { name: "Contacts" }).getByText(contact.name, { exact: true })).toBeVisible();
    }
    for (const deal of detail.deals) {
      await expect(page.getByRole("list", { name: "Deals" }).getByText(deal.name, { exact: true })).toBeVisible();
    }

    const name = uniqueName("E2E Org Contact");
    await page.getByRole("button", { name: "Add contact" }).click();
    const dialog = page.getByRole("dialog", { name: "Add contact" });
    await expect(dialog.getByLabel("Organization")).toHaveText(/Bluefin Logistics/);
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByRole("list", { name: "Contacts" }).getByText(name)).toBeVisible();

    // A contact in the list opens its page.
    await page.getByRole("list", { name: "Contacts" }).getByText(name).click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  });
});
