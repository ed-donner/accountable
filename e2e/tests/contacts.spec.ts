import { apiGet, apiPost, choose, expect, test, uniqueName } from "../fixtures";

type Contact = { id: number; name: string; status: string };

test.describe("Contacts", () => {
  test("add a lead, filter by status and search (CON-1, CON-2)", async ({ page, request }) => {
    const name = uniqueName("E2E Lead");
    await page.goto("/contacts");
    await expect(page).toHaveTitle("Contacts · Accountable");

    await page.getByRole("button", { name: "Add contact" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add contact" });
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Email").fill("e2e.lead@test.example");
    await expect(dialog.getByLabel("Status")).toHaveValue("lead");
    await dialog.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByText("Contact added")).toBeVisible();

    // Each filter's count matches the API, whatever the search says.
    const contacts = await apiGet<Contact[]>(request, "/api/contacts");
    const count = (status?: string) => contacts.filter((c) => !status || c.status === status).length;
    const filters = page.getByRole("group", { name: "Filter by status" });
    await expect(filters.getByRole("button", { name: `All ${count()}` })).toBeVisible();
    for (const [label, status] of [
      ["Leads", "lead"],
      ["Qualified", "qualified"],
      ["Customers", "customer"],
    ] as const) {
      const button = filters.getByRole("button", { name: `${label} ${count(status)}` });
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByText(`${count(status)} of ${count()} contacts`)).toBeVisible();
      await expect(page.locator("tbody tr")).toHaveCount(count(status));
    }

    // The filter and the search work together.
    await filters.getByRole("button", { name: /^Leads/ }).click();
    await page.getByRole("searchbox", { name: "Search contacts" }).fill(name);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await filters.getByRole("button", { name: /^Customers/ }).click();
    await expect(page.getByText(`No contacts match "${name}"`)).toBeVisible();
  });

  test("change a status and refresh (CON-4)", async ({ page }) => {
    const name = uniqueName("E2E Status");
    await page.goto("/contacts");
    await page.getByRole("button", { name: "Add contact" }).first().click();
    const add = page.getByRole("dialog", { name: "Add contact" });
    await add.getByLabel("Name").fill(name);
    await add.getByRole("button", { name: "Add contact" }).click();
    await expect(add).toBeHidden();

    await page.getByRole("searchbox", { name: "Search contacts" }).fill(name);
    await page.getByRole("button", { name: `Edit ${name}` }).click();
    const edit = page.getByRole("dialog", { name: `Edit ${name}` });
    await edit.getByLabel("Status").selectOption("customer");
    await edit.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Changes saved")).toBeVisible();

    await page.reload();
    await page.getByRole("searchbox", { name: "Search contacts" }).fill(name);
    await expect(page.locator("tbody tr").first()).toContainText("Customer");
  });

  test("the contact page shows its links (CON-3)", async ({ page, request }) => {
    type Full = Contact & { email: string; phone: string; organization: { id: number; name: string } };
    const contacts = await apiGet<Full[]>(request, "/api/contacts");
    const sarah = contacts.find((c) => c.name === "Sarah Chen")!;
    await page.goto(`/contacts/${sarah.id}`);
    await expect(page).toHaveTitle("Sarah Chen · Accountable");
    await expect(page.getByRole("link", { name: sarah.email })).toHaveAttribute("href", `mailto:${sarah.email}`);
    await expect(page.getByRole("link", { name: sarah.phone })).toHaveAttribute("href", /^tel:/);
    await page.getByRole("main").getByRole("link", { name: sarah.organization.name }).click();
    await expect(page).toHaveURL(`/organizations/${sarah.organization.id}`);
  });

  test("changing the organization of a main contact lists the deal, then unlinks it (CON-5)", async ({ page, request }) => {
    const name = uniqueName("E2E Mover");
    const from = await apiPost<{ id: number; name: string }>(request, "/api/organizations", { name: `${name} From` });
    await apiPost(request, "/api/organizations", { name: `${name} To` });
    const contact = await apiPost<{ id: number }>(request, "/api/contacts", { name, organization_id: from.id });
    const deal = await apiPost<{ id: number; name: string }>(request, "/api/deals", {
      name: `${name} Deal`,
      organization_id: from.id,
      main_contact_id: contact.id,
      stage: "proposal",
      value: 5000,
      close_date: "2030-01-01",
    });

    await page.goto(`/contacts/${contact.id}`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: `Edit ${name}` });
    await choose(page, dialog.getByLabel("Organization"), `${name} To`);
    await expect(dialog.getByText(`${name} will stop being the main contact on this deal:`)).toBeVisible();
    await expect(dialog.getByText(deal.name)).toBeVisible();
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Changes saved")).toBeVisible();

    const saved = await apiGet<{ main_contact: unknown }>(request, `/api/deals/${deal.id}`);
    expect(saved.main_contact).toBeNull();
    await expect(page.getByText("Not the main contact on any deals.")).toBeVisible();
  });
});
