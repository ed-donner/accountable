import { apiGet, apiPatch, apiPost, expect, test, uniqueName } from "../fixtures";

type Ref = { id: number; name: string };
type Contact = Ref & { organization: Ref | null };
type Deal = Ref & { main_contact: Ref | null };

test.describe("Deletes", () => {
  test("an organization without deals keeps its contacts (DEL-2)", async ({ page, request }) => {
    const name = uniqueName("E2E Delete Org");
    const org = await apiPost<Ref>(request, "/api/organizations", { name });
    const contacts = [];
    for (const person of ["One", "Two"]) {
      contacts.push(await apiPost<Contact>(request, "/api/contacts", { name: `${name} ${person}`, organization_id: org.id }));
    }

    await page.goto("/organizations");
    await page.getByRole("searchbox", { name: "Search organizations" }).fill(name);
    await page.getByRole("button", { name: `Delete ${name}` }).click();
    const dialog = page.getByRole("alertdialog", { name: `Delete ${name}?` });
    await expect(dialog.getByText("Its 2 contacts will stay, with no organization.")).toBeVisible();
    await dialog.getByRole("button", { name: "Delete organization" }).click();
    await expect(page.getByText("Organization deleted")).toBeVisible();
    await expect(page.getByText(`No organizations match "${name}"`)).toBeVisible();

    for (const contact of contacts) {
      expect((await apiGet<Contact>(request, `/api/contacts/${contact.id}`)).organization).toBeNull();
    }
  });

  test("an organization with deals shows only Close, and its deal links work (DEL-3)", async ({ page }) => {
    await page.goto("/organizations");
    await page.getByRole("searchbox", { name: "Search organizations" }).fill("Bluefin Logistics");
    await page.getByRole("button", { name: "Delete Bluefin Logistics" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Bluefin Logistics can't be deleted" });
    await expect(
      dialog.getByText(
        "Bluefin Logistics can't be deleted while it has deals. Move these deals to another organization or delete them first:",
      ),
    ).toBeVisible();
    await expect(dialog.getByRole("button")).toHaveText(["Close"]);
    await dialog.getByRole("link", { name: /Website redesign/ }).click();
    await expect(page).toHaveURL(/\/deals\/\d+$/);
    await expect(page.getByRole("heading", { level: 1, name: "Website redesign" })).toBeVisible();
  });

  test("a contact: activities deleted, deals unlinked (DEL-4)", async ({ page, request }) => {
    const name = uniqueName("E2E Delete Contact");
    const org = await apiPost<Ref>(request, "/api/organizations", { name: `${name} Org` });
    const contact = await apiPost<Ref>(request, "/api/contacts", { name, organization_id: org.id });
    const deal = await apiPost<Deal>(request, "/api/deals", {
      name: `${name} Deal`,
      organization_id: org.id,
      main_contact_id: contact.id,
      stage: "new",
      value: 1000,
      close_date: "2030-01-01",
    });
    for (const description of ["First", "Second"]) {
      await apiPost(request, "/api/activities", {
        type: "note",
        description,
        occurred_at: "2026-11-01T10:00:00Z",
        contact_id: contact.id,
      });
    }

    await page.goto("/contacts");
    await page.getByRole("searchbox", { name: "Search contacts" }).fill(name);
    await page.getByRole("button", { name: `Delete ${name}` }).click();
    const dialog = page.getByRole("alertdialog", { name: `Delete ${name}?` });
    await expect(dialog.getByText(`${name}'s 2 activities will be deleted.`)).toBeVisible();
    await expect(dialog.getByText(`This deal will stay, with no main contact: ${name} Deal.`)).toBeVisible();
    await dialog.getByRole("button", { name: "Delete contact" }).click();
    await expect(page.getByText("Contact deleted")).toBeVisible();
    expect((await apiGet<Deal>(request, `/api/deals/${deal.id}`)).main_contact).toBeNull();
  });

  test("a deal: its activities and stage changes go (DEL-5)", async ({ page, request }) => {
    const name = uniqueName("E2E Delete Deal");
    const org = await apiPost<Ref>(request, "/api/organizations", { name: `${name} Org` });
    const deal = await apiPost<Deal>(request, "/api/deals", {
      name,
      organization_id: org.id,
      stage: "new",
      value: 1000,
      close_date: "2030-01-01",
    });
    await apiPatch(request, `/api/deals/${deal.id}`, { stage: "qualified" });
    await apiPost(request, "/api/activities", {
      type: "call",
      description: "Called",
      occurred_at: "2026-11-01T10:00:00Z",
      deal_id: deal.id,
    });

    await page.goto("/deals");
    await page.getByRole("searchbox", { name: "Search deals" }).fill(name);
    await page.getByRole("button", { name: `Delete ${name}` }).click();
    const dialog = page.getByRole("alertdialog", { name: `Delete ${name}?` });
    await expect(dialog.getByText("Its 2 activities, including its stage change, will be deleted.")).toBeVisible();
    await dialog.getByRole("button", { name: "Delete deal" }).click();
    await expect(page.getByText("Deal deleted")).toBeVisible();
    await expect(page.getByText(`No deals match "${name}"`)).toBeVisible();
  });

  test("Cancel and Escape leave everything as it was (DEL-1)", async ({ page, request }) => {
    const before = await apiGet<Ref[]>(request, "/api/contacts");
    await page.goto("/contacts");
    await page.getByRole("searchbox", { name: "Search contacts" }).fill("Sarah Chen");

    await page.getByRole("button", { name: "Delete Sarah Chen" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete Sarah Chen?" });
    // Her activities in the sample data are on her deals, so only the deals are named.
    await expect(dialog.getByText(/These deals will stay, with no main contact: .*Website redesign/)).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "Delete Sarah Chen" }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    expect(await apiGet<Ref[]>(request, "/api/contacts")).toEqual(before);
  });

  test("a delete from a record page returns to the table, and the old address says it no longer exists (DEL-7)", async ({
    page,
    request,
    allowApiError,
  }) => {
    const name = uniqueName("E2E Gone");
    const org = await apiPost<Ref>(request, "/api/organizations", { name: `${name} Org` });
    const deal = await apiPost<Ref>(request, "/api/deals", {
      name,
      organization_id: org.id,
      stage: "new",
      value: 1000,
      close_date: "2030-01-01",
    });

    await page.goto(`/deals/${deal.id}`);
    await page.getByRole("button", { name: "Delete deal" }).click();
    await page.getByRole("alertdialog", { name: `Delete ${name}?` }).getByRole("button", { name: "Delete deal" }).click();
    await expect(page).toHaveURL("/deals");
    await expect(page.getByText("Deal deleted")).toBeVisible();

    allowApiError({ status: 404, url: `/api/deals/${deal.id}` });
    await page.goto(`/deals/${deal.id}`);
    await expect(page.getByRole("heading", { level: 1, name: "This deal no longer exists." })).toBeVisible();
    await page.getByRole("link", { name: "Go to deals" }).click();
    await expect(page).toHaveURL("/deals");
  });
});
