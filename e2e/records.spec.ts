import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import {
  addContact,
  addDeal,
  addIssuedInvoice,
  addLinkedDeal,
  addOrganization,
  chooseInPicker,
  emptyDatabase,
  isoDay,
  resetToSampleData,
  SIGNED_IN,
  signInAs,
  startInvoice,
} from "./helpers";

function heading(page: Page, name: string) {
  return page.getByRole("heading", { level: 1, name });
}

function row(page: Page, name: string | RegExp) {
  return page.getByRole("row", { name });
}

function bodyRows(page: Page) {
  return page.locator("tbody tr");
}

function dialog(page: Page) {
  return page.getByRole("dialog");
}

/** Today's date as the record pages show it, such as Nov 3, 2026. */
function today() {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

test.describe("tables", () => {
  test.beforeAll(resetToSampleData);

  test("organizations can be added, found, sorted, edited and deleted, and each change survives a refresh", async ({
    page,
  }) => {
    await page.goto("/organizations");

    await page.getByRole("button", { name: "Add organization" }).click();
    await dialog(page).getByLabel("Name").fill("Aardvark Analytics");
    await dialog(page).getByLabel("Website").fill("aardvark.example");
    await dialog(page).getByLabel("Industry").fill("Software");
    await dialog(page).getByRole("button", { name: "Save organization" }).click();
    await expect(page.getByText("Organization saved.")).toBeVisible();

    await page.reload();
    await page.getByRole("searchbox").fill("aardvark");
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(row(page, /Aardvark Analytics/)).toContainText("Software");
    await expect(row(page, /Aardvark Analytics/)).toContainText("aardvark.example");

    await page.getByRole("button", { name: "Edit Aardvark Analytics" }).click();
    await dialog(page).getByLabel("Name").fill("Aardvark Data");
    await dialog(page).getByRole("button", { name: "Save organization" }).click();
    await expect(row(page, /Aardvark Data/)).toBeVisible();

    await page.reload();
    await page.getByRole("searchbox").fill("aardvark");
    await expect(row(page, /Aardvark Data/)).toBeVisible();

    await page.getByRole("button", { name: "Delete Aardvark Data" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete organization" }).click();
    await expect(page.getByText("Organization deleted.")).toBeVisible();

    await page.reload();
    await page.getByRole("searchbox").fill("aardvark");
    await expect(page.getByText("No organizations match.")).toBeVisible();
  });

  test("contacts can be added, found, sorted, edited and deleted, and each change survives a refresh", async ({
    page,
  }) => {
    await page.goto("/contacts");

    await page.getByRole("button", { name: "Add contact" }).click();
    await dialog(page).getByLabel("Name", { exact: true }).fill("Zelda Fitzgerald");
    await chooseInPicker(page, "Organization", "Harbor & Pine");
    await dialog(page).getByLabel("Email").fill("zelda@harbor.example");
    await dialog(page).getByRole("button", { name: "Save contact" }).click();
    await expect(page.getByText("Contact saved.")).toBeVisible();

    await page.reload();
    await page.getByRole("searchbox").fill("zelda");
    await expect(row(page, /Zelda Fitzgerald/)).toContainText("Harbor & Pine");
    await expect(row(page, /Zelda Fitzgerald/)).toContainText("Lead");

    await page.getByRole("button", { name: "Edit Zelda Fitzgerald" }).click();
    await dialog(page).getByLabel("Job title").fill("Buyer");
    await dialog(page).getByRole("button", { name: "Save contact" }).click();
    await expect(row(page, /Zelda Fitzgerald/)).toContainText("Buyer");

    await page.reload();
    await page.getByRole("searchbox").fill("zelda");
    await expect(row(page, /Zelda Fitzgerald/)).toContainText("Buyer");

    await page.getByRole("button", { name: "Delete Zelda Fitzgerald" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete contact" }).click();
    await expect(page.getByText("No contacts match.")).toBeVisible();

    await page.reload();
    await page.getByRole("searchbox").fill("zelda");
    await expect(page.getByText("No contacts match.")).toBeVisible();
  });

  test("deals can be added, found, sorted, edited and deleted, and each change survives a refresh", async ({
    page,
  }) => {
    await page.goto("/deals");

    await page.getByRole("button", { name: "Add deal" }).click();
    await dialog(page).getByLabel("Name", { exact: true }).fill("Zebra crossing");
    await chooseInPicker(page, "Organization", "Lantern Hotels");
    await chooseInPicker(page, "Main contact", "Elena Petrova");
    await dialog(page).getByLabel("Value").fill("48000");
    await dialog(page).getByLabel("Close date").fill(isoDay(40));
    await dialog(page).getByRole("button", { name: "Save deal" }).click();
    await expect(page.getByText("Deal saved.")).toBeVisible();

    await page.reload();
    await page.getByRole("searchbox").fill("zebra");
    await expect(row(page, /Zebra crossing/)).toContainText("$48,000");
    await expect(row(page, /Zebra crossing/)).toContainText("$2,400");

    await page.getByRole("button", { name: "Edit Zebra crossing" }).click();
    await dialog(page).getByLabel("Value").fill("50000");
    await dialog(page).getByRole("button", { name: "Save deal" }).click();
    await expect(row(page, /Zebra crossing/)).toContainText("$50,000");

    await page.reload();
    await page.getByRole("searchbox").fill("zebra");
    await expect(row(page, /Zebra crossing/)).toContainText("$50,000");

    await page.getByRole("button", { name: "Delete Zebra crossing" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete deal" }).click();
    await expect(page.getByText("No deals match.")).toBeVisible();

    await page.reload();
    await page.getByRole("searchbox").fill("zebra");
    await expect(page.getByText("No deals match.")).toBeVisible();
  });

  test("headings sort, ascending then descending", async ({ page }) => {
    await page.goto("/deals");
    const firstValue = () => bodyRows(page).first().locator("td").nth(4);

    await page.getByRole("button", { name: "Value" }).click();
    await expect(page.getByRole("columnheader", { name: "Value" })).toHaveAttribute("aria-sort", "ascending");
    await expect(firstValue()).toHaveText("$3,000");

    await page.getByRole("button", { name: "Value" }).click();
    await expect(page.getByRole("columnheader", { name: "Value" })).toHaveAttribute("aria-sort", "descending");
    await expect(firstValue()).toHaveText("$96,000");
  });

  test("the status filter shows a count for each status and works with search", async ({ page }) => {
    await page.goto("/contacts");
    const filter = page.getByRole("group", { name: "Filter by status" });
    const customers = filter.getByRole("button", { name: /Customer/ });
    await expect(bodyRows(page).first()).toBeVisible();
    const count = Number((await customers.innerText()).replace(/\D/g, ""));
    expect(count).toBeGreaterThan(0);

    await customers.click();
    await expect(customers).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Next" })).toHaveCount(0);
    await expect(bodyRows(page)).toHaveCount(count);
    await expect(bodyRows(page).filter({ hasNotText: "Customer" })).toHaveCount(0);

    await page.getByRole("searchbox").fill("sam");
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(bodyRows(page).first()).toContainText("Sam Carter");

    await filter.getByRole("button", { name: /Lead/ }).click();
    await expect(page.getByText("No contacts match.")).toBeVisible();

    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(filter.getByRole("button", { name: /All/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("searchbox")).toHaveValue("");
  });

  test("search, sort and page stay in the address, and coming back from a record returns to the same view", async ({
    page,
  }) => {
    await page.goto("/contacts");
    await page.getByRole("button", { name: "Job title" }).click();
    await page.getByRole("button", { name: "Job title" }).click();
    await page.getByRole("searchbox").fill("a");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page).toHaveURL(/q=a/);
    await expect(page).toHaveURL(/sort=job_title/);
    await expect(page).toHaveURL(/dir=desc/);
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText(/^51-\d+ of \d+$/)).toBeVisible();
    const before = (await bodyRows(page).first().textContent()) ?? "";

    await bodyRows(page).first().getByRole("link").click();
    await expect(page).toHaveURL(/\/contacts\/\d+$/);
    await page.goBack();

    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByRole("searchbox")).toHaveValue("a");
    await expect(bodyRows(page).first()).toHaveText(before);
  });

  test("the search box follows the address through back and forward, and Clear search empties it", async ({ page }) => {
    await page.goto("/deals");
    await expect(bodyRows(page).first()).toBeVisible();
    await page.getByRole("searchbox").pressSequentially("security", { delay: 0 });
    await expect(page).toHaveURL(/q=security/);
    await bodyRows(page).first().getByRole("link").click();
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();

    await page.goBack();
    await expect(page.getByRole("searchbox")).toHaveValue("security");

    await page.getByRole("searchbox").fill("zzz");
    await expect(page.getByText("No deals match.")).toBeVisible();
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page.getByRole("searchbox")).toHaveValue("");
    await expect(bodyRows(page).first()).toBeVisible();
  });

  test("tables page at 50 rows", async ({ page }) => {
    await page.goto("/deals");
    await expect(bodyRows(page)).toHaveCount(50);
    await expect(page.getByText(/1-50 of \d+/)).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText(/51-\d+ of \d+/)).toBeVisible();
    await expect(bodyRows(page).first()).toBeVisible();
    expect(await bodyRows(page).count()).toBeLessThanOrEqual(50);
  });

  test("the Late chip shows beside a late deal's close date, and Last activity is right", async ({ page, request }) => {
    const { deal, contact } = await addLinkedDeal(request, "Running late", { close_date: isoDay(-3) });
    await request.post(`/api/activities`, {
      data: { contact_id: contact.id, description: "Spoke to them", occurred_at: "2026-02-03T12:00:00Z" },
    });
    await request.post(`/api/deals/${deal.id}/move`, { data: { stage: "new" } });

    await page.goto("/deals?q=running+late");
    await expect(row(page, /Running late/).getByText("Late", { exact: true })).toBeVisible();

    await page.goto("/contacts?q=running+late");
    await expect(row(page, /Running late Contact/)).toContainText("Feb 3, 2026");
  });

  test("errors show beside the field", async ({ page }) => {
    await page.goto("/organizations");
    await page.getByRole("button", { name: "Add organization" }).click();
    await dialog(page).getByRole("button", { name: "Save organization" }).click();
    await expect(dialog(page).getByRole("alert")).toHaveText("Enter a name");
  });

  test("bad email, website, value and probability are refused", async ({ page }) => {
    await page.goto("/organizations");
    await page.getByRole("button", { name: "Add organization" }).click();
    await dialog(page).getByLabel("Name").fill("Bad site");
    await dialog(page).getByLabel("Website").fill("javascript:alert(1)");
    await dialog(page).getByRole("button", { name: "Save organization" }).click();
    await expect(dialog(page).getByRole("alert")).toHaveText("Enter a website address, such as https://example.com");
    await dialog(page).getByRole("button", { name: "Cancel" }).click();

    await page.goto("/contacts");
    await page.getByRole("button", { name: "Add contact" }).click();
    await dialog(page).getByLabel("Name", { exact: true }).fill("Bad email");
    await chooseInPicker(page, "Organization", "Harbor & Pine");
    await dialog(page).getByLabel("Email").fill("not an email");
    await dialog(page).getByRole("button", { name: "Save contact" }).click();
    await expect(dialog(page).getByRole("alert")).toHaveText("Enter a valid email address");
    await dialog(page).getByRole("button", { name: "Cancel" }).click();

    await page.goto("/deals");
    await page.getByRole("button", { name: "Add deal" }).click();
    await dialog(page).getByLabel("Value").fill("12.5");
    await dialog(page).getByLabel("Probability").fill("140");
    await dialog(page).getByRole("button", { name: "Save deal" }).click();
    await expect(dialog(page).getByText("Enter a whole number of dollars, zero or more")).toBeVisible();
    await expect(dialog(page).getByText("Enter a whole number from 0 to 100")).toBeVisible();
  });

  test("a future close date is refused for a won deal", async ({ page, request }) => {
    await addLinkedDeal(request, "Future win", { stage: "won", close_date: isoDay(0) });
    await page.goto("/deals?q=future+win");
    await page.getByRole("button", { name: "Edit Future win" }).click();
    await dialog(page).getByLabel("Close date").fill(isoDay(10));
    await dialog(page).getByRole("button", { name: "Save deal" }).click();
    await expect(dialog(page).getByRole("alert")).toHaveText(
      "A won or lost deal can't have a close date in the future",
    );
  });

  test("a missing organization can be added from the picker and is then selected, with the deal form still open", async ({
    page,
  }) => {
    await page.goto("/deals");
    await page.getByRole("button", { name: "Add deal" }).click();
    await dialog(page).getByLabel("Name", { exact: true }).fill("From the picker");

    await page.getByRole("combobox", { name: "Organization", exact: true }).click();
    await page.getByPlaceholder("Search organizations").fill("Brand New Co");
    await expect(page.getByText("No organizations match.")).toBeVisible();
    await page.getByRole("option", { name: 'Add "Brand New Co"' }).click();

    const second = page.getByRole("dialog", { name: "Add organization" });
    await expect(second.getByLabel("Name")).toHaveValue("Brand New Co");
    await second.getByRole("button", { name: "Save organization" }).click();

    const first = page.getByRole("dialog", { name: "Add deal" });
    await expect(first.getByRole("combobox", { name: "Organization" })).toContainText("Brand New Co");
    await expect(first.getByLabel("Name", { exact: true })).toHaveValue("From the picker");
    await expect(page.getByText("Deal saved.")).toHaveCount(0);
  });

  test("Escape closes one layer at a time", async ({ page }) => {
    await page.goto("/deals");
    await page.getByRole("button", { name: "Add deal" }).click();
    await page.getByRole("combobox", { name: "Organization", exact: true }).click();
    await expect(page.getByPlaceholder("Search organizations")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByPlaceholder("Search organizations")).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Add deal" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Add deal" })).toHaveCount(0);
  });

  test("the deal form narrows contacts and fills in the organization", async ({ page }) => {
    await page.goto("/deals");
    await page.getByRole("button", { name: "Add deal" }).click();
    await chooseInPicker(page, "Organization", "Lantern Hotels");
    await page.getByRole("combobox", { name: "Main contact", exact: true }).click();
    const options = page.getByRole("listbox").getByRole("option");
    await expect(options.first()).toBeVisible();
    await expect(options.filter({ hasNotText: "Lantern Hotels" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Add deal" }).click();
    await chooseInPicker(page, "Main contact", "Noah Kim");
    await expect(page.getByRole("combobox", { name: "Organization", exact: true })).toContainText("Saltmarsh Studio");
  });

  test("a blank link shows None and saves blank", async ({ page, request }) => {
    const { organization, contact } = await addLinkedDeal(request, "Blank links");
    await request.delete(`/api/organizations/${organization.id}`);
    await request.delete(`/api/contacts/${contact.id}`);

    await page.goto("/deals?q=blank+links");
    await expect(row(page, /Blank links/)).toContainText("None");

    await page.getByRole("button", { name: "Edit Blank links" }).click();
    await expect(page.getByRole("combobox", { name: "Organization", exact: true })).toContainText("None");
    await expect(page.getByRole("combobox", { name: "Main contact", exact: true })).toContainText("None");
    await dialog(page).getByLabel("Value").fill("11111");
    await dialog(page).getByRole("button", { name: "Save deal" }).click();
    await expect(row(page, /Blank links/)).toContainText("$11,111");
    await expect(row(page, /Blank links/)).toContainText("None");
  });

  test("changing stage in the form shows the new probability and close date, and what's shown is what's saved", async ({
    page,
    request,
  }) => {
    await addLinkedDeal(request, "Stage in form");
    await page.goto("/deals?q=stage+in+form");
    await page.getByRole("button", { name: "Edit Stage in form" }).click();

    await dialog(page).getByLabel("Stage").selectOption("won");
    await expect(dialog(page).getByLabel("Probability")).toHaveValue("100");
    await expect(dialog(page).getByLabel("Close date")).toHaveValue(isoDay(0));

    await dialog(page).getByLabel("Probability").fill("90");
    await dialog(page).getByLabel("Close date").fill(isoDay(-2));
    await dialog(page).getByRole("button", { name: "Save deal" }).click();

    await expect(row(page, /Stage in form/)).toContainText("Won");
    await expect(row(page, /Stage in form/)).toContainText("90%");
  });

  test("two records can share a name", async ({ page, request }) => {
    await addOrganization(request, "Twin Peaks Trading");
    await addOrganization(request, "Twin Peaks Trading");
    await page.goto("/organizations?q=twin+peaks");
    await expect(bodyRows(page)).toHaveCount(2);
  });

  test("a contact's status can be changed by hand and stays that way", async ({ page, request }) => {
    const organization = await addOrganization(request, "Status Co");
    await addContact(request, "Status Person", organization.id, { status: "customer" });

    await page.goto("/contacts?q=status+person");
    await page.getByRole("button", { name: "Edit Status Person" }).click();
    await dialog(page).getByLabel("Status").selectOption("lead");
    await dialog(page).getByRole("button", { name: "Save contact" }).click();
    await expect(row(page, /Status Person/)).toContainText("Lead");

    await page.reload();
    await expect(row(page, /Status Person/)).toContainText("Lead");
  });

  test("each delete dialog names the record and gives real counts, and the linked records end up as it said", async ({
    page,
    request,
  }) => {
    const organization = await addOrganization(request, "Delete Me Inc");
    const contactOne = await addContact(request, "Keeper One", organization.id);
    await addContact(request, "Keeper Two", organization.id);
    const deal = await addDeal(request, "Kept deal", {
      organization_id: organization.id,
      main_contact_id: contactOne.id,
    });
    await request.post(`/api/activities`, { data: { contact_id: contactOne.id, description: "Hello" } });
    await request.post(`/api/activities`, { data: { deal_id: deal.id, description: "On the deal" } });

    await page.goto("/organizations?q=delete+me");
    await page.getByRole("button", { name: "Delete Delete Me Inc" }).click();
    const alert = page.getByRole("alertdialog");
    await expect(alert).toContainText("Delete Delete Me Inc?");
    await expect(alert).toContainText(
      "Its 2 contacts and 1 deal will stay, with no organization. This can't be undone.",
    );
    await alert.getByRole("button", { name: "Delete organization" }).click();
    await expect(page.getByText("Organization deleted.")).toBeVisible();

    await page.goto("/contacts?q=keeper");
    await expect(bodyRows(page)).toHaveCount(2);
    await expect(row(page, /Keeper One/)).toContainText("None");

    await page.getByRole("button", { name: "Delete Keeper One" }).click();
    await expect(page.getByRole("alertdialog")).toContainText(
      "Their 1 deal will stay, with no main contact. 1 activity logged on this contact will be deleted. This can't be undone.",
    );
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete contact" }).click();
    await expect(page.getByText("Contact deleted.")).toBeVisible();

    await page.goto("/deals?q=kept+deal");
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(row(page, /Kept deal/)).toContainText("None");

    await page.getByRole("button", { name: "Delete Kept deal" }).click();
    await expect(page.getByRole("alertdialog")).toContainText(
      "Its 1 activity and 0 stage-change entries will be deleted. This can't be undone.",
    );
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(row(page, /Kept deal/)).toBeVisible();
  });

  test("deleting a won deal says its revenue will leave the dashboard", async ({ page, request }) => {
    await addLinkedDeal(request, "Big win", { stage: "won", value: 48000, close_date: isoDay(0) });
    await page.goto("/deals?q=big+win");
    await page.getByRole("button", { name: "Delete Big win" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Its revenue of $48,000 will leave the dashboard.");
  });
});

test.describe("record pages", () => {
  test.beforeAll(resetToSampleData);

  test("clicking a row opens the record", async ({ page }) => {
    await page.goto("/deals?q=security+review");
    await page.getByRole("cell", { name: "Marlowe Insurance" }).click();
    await expect(heading(page, "Security review")).toBeVisible();
    await expect(page).toHaveURL(/\/deals\/\d+$/);
  });

  test("an organization's page shows its details, contacts, deals and timeline", async ({ page }) => {
    await page.goto("/organizations?q=harbor");
    await page.getByRole("link", { name: "Harbor & Pine" }).click();
    await expect(heading(page, "Harbor & Pine")).toBeVisible();

    const details = page.getByRole("region", { name: "Details" });
    await expect(details).toContainText("Hospitality");
    await expect(details.getByRole("link", { name: /harborandpine\.example/ })).toBeVisible();
    await expect(details).toContainText("Two restaurants");

    const contacts = page.getByRole("region", { name: "Contacts" });
    await expect(contacts.getByRole("link", { name: "Sam Carter" })).toBeVisible();

    const deals = page.getByRole("region", { name: "Deals" });
    await expect(deals.getByRole("link", { name: "Annual support plan" })).toBeVisible();
    await expect(deals.getByRole("link", { name: "Renewal and upgrade" })).toBeVisible();

    await expect(page.getByTestId("timeline-entry").first()).toBeVisible();

    await contacts.getByRole("link", { name: "Sam Carter" }).click();
    await expect(heading(page, "Sam Carter")).toBeVisible();
  });

  test("a contact's page shows their details, status, organization, deals and timeline", async ({ page }) => {
    await page.goto("/contacts?q=sam+carter");
    await page.getByRole("link", { name: "Sam Carter" }).click();

    const details = page.getByRole("region", { name: "Details" });
    await expect(details.getByRole("link", { name: "Harbor & Pine" })).toBeVisible();
    await expect(details).toContainText("Owner");
    await expect(details.getByRole("link", { name: /sam\.carter@/ })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Deals" }).getByRole("link", { name: "Annual support plan" }),
    ).toBeVisible();
    await expect(page.getByTestId("timeline-entry").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Log activity" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add deal" })).toBeVisible();
  });

  test("a deal's page shows its details, a Late chip if late, and its timeline", async ({ page, request }) => {
    const { deal } = await addLinkedDeal(request, "Late page", { value: 1010, stage: "new", close_date: isoDay(-2) });
    await page.goto(`/deals/${deal.id}`);

    await expect(heading(page, "Late page")).toBeVisible();
    await expect(page.getByText("Late", { exact: true })).toBeVisible();
    await expect(page.getByText("New", { exact: true })).toBeVisible();
    const details = page.getByRole("region", { name: "Details" });
    await expect(details).toContainText("$1,010");
    await expect(details).toContainText("5%");
    await expect(details).toContainText("$51");
    await expect(details.getByRole("link", { name: "Late page Ltd" })).toBeVisible();
    await expect(details.getByRole("link", { name: "Late page Contact" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Timeline" })).toBeVisible();
  });

  test("Add buttons on record pages fill in what they know", async ({ page, request }) => {
    const organization = await addOrganization(request, "Knows Things Ltd");
    const contact = await addContact(request, "Known Person", organization.id);

    await page.goto(`/organizations/${organization.id}`);
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByRole("combobox", { name: "Organization", exact: true })).toContainText("Knows Things Ltd");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Add deal" }).click();
    await expect(page.getByRole("combobox", { name: "Organization", exact: true })).toContainText("Knows Things Ltd");
    await page.keyboard.press("Escape");

    await page.goto(`/contacts/${contact.id}`);
    await page.getByRole("button", { name: "Add deal" }).click();
    await expect(page.getByRole("combobox", { name: "Main contact", exact: true })).toContainText("Known Person");
    await expect(page.getByRole("combobox", { name: "Organization", exact: true })).toContainText("Knows Things Ltd");
  });

  test("Edit works from a record page", async ({ page, request }) => {
    const { deal } = await addLinkedDeal(request, "Edit from page");
    await page.goto(`/deals/${deal.id}`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await dialog(page).getByLabel("Name", { exact: true }).fill("Edited from page");
    await dialog(page).getByRole("button", { name: "Save deal" }).click();
    await expect(heading(page, "Edited from page")).toBeVisible();
  });

  test("a delete from a record page returns to the table", async ({ page, request }) => {
    const { deal, contact, organization } = await addLinkedDeal(request, "Gone soon");

    await page.goto(`/deals/${deal.id}`);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete deal" }).click();
    await expect(heading(page, "Deals")).toBeVisible();
    await expect(page).toHaveURL(/\/deals$/);

    await page.goto(`/contacts/${contact.id}`);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete contact" }).click();
    await expect(heading(page, "Contacts")).toBeVisible();

    await page.goto(`/organizations/${organization.id}`);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete organization" }).click();
    await expect(heading(page, "Organizations")).toBeVisible();
  });

  test("a new organization shows who added it, and who last changed it once another teammate edits it", async ({
    page,
  }) => {
    await page.goto("/organizations");
    await page.getByRole("button", { name: "Add organization" }).click();
    await dialog(page).getByLabel("Name").fill("Whose Idea Ltd");
    await dialog(page).getByRole("button", { name: "Save organization" }).click();
    await expect(page.getByText("Organization saved.")).toBeVisible();

    await page.getByRole("searchbox").fill("whose idea");
    await page.getByRole("link", { name: "Whose Idea Ltd" }).click();
    const details = page.getByRole("region", { name: "Details" });
    await expect(details).toContainText(`Added by ${SIGNED_IN.name} on ${today()}`);
    await expect(details).not.toContainText("Last changed");

    await signInAs(page, "teammate-dana-whitfield");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await dialog(page).getByLabel("Industry").fill("Consulting");
    await dialog(page).getByRole("button", { name: "Save organization" }).click();
    await expect(details).toContainText(`Last changed by Dana Whitfield on ${today()}`);
    await expect(details).toContainText(`Added by ${SIGNED_IN.name} on ${today()}`);
  });
});

test.describe("empty tables", () => {
  test.beforeAll(emptyDatabase);

  test("an empty table invites the first record, and a search with no matches offers to clear it", async ({ page }) => {
    for (const [path, noun] of [
      ["/organizations", "organization"],
      ["/contacts", "contact"],
      ["/deals", "deal"],
    ]) {
      await page.goto(path);
      await expect(page.getByText(`No ${noun}s yet. Add the first one.`)).toBeVisible();
      await expect(heading(page, `${noun[0].toUpperCase()}${noun.slice(1)}s`)).toBeVisible();

      await page.getByRole("searchbox").fill("anything");
      await expect(page.getByText(`No ${noun}s match.`)).toBeVisible();
      await page.getByRole("button", { name: "Clear search" }).click();
      await expect(page.getByText(`No ${noun}s yet. Add the first one.`)).toBeVisible();
    }
  });
});

test.describe("the edges of a table", () => {
  test.beforeEach(emptyDatabase);

  test("deleting the only row on the last page goes back a page", async ({ page, request }) => {
    for (let number = 0; number < 51; number += 1)
      await addOrganization(request, `Company ${String(number).padStart(2, "0")}`);

    await page.goto("/organizations?page=2");
    await expect(bodyRows(page)).toHaveCount(1);
    await bodyRows(page)
      .first()
      .getByRole("button", { name: /^Delete / })
      .click();
    await page.getByRole("button", { name: "Delete organization" }).click();

    await expect(bodyRows(page)).toHaveCount(50);
    await expect(page).toHaveURL(/\/organizations$/);
    await page.reload();
    await expect(bodyRows(page)).toHaveCount(50);
  });

  test("deleting the last row of all invites the first record", async ({ page, request }) => {
    await addOrganization(request, "The only one");
    await page.goto("/organizations");
    await bodyRows(page)
      .first()
      .getByRole("button", { name: /^Delete / })
      .click();
    await page.getByRole("button", { name: "Delete organization" }).click();
    await expect(page.getByText("No organizations yet. Add the first one.")).toBeVisible();
  });

  test("an old link past the last page goes to the last page, keeping the rest of the address", async ({
    page,
    request,
  }) => {
    const organization = await addOrganization(request, "Staffed");
    await addContact(request, "Lee Lead", organization.id);

    await page.goto("/contacts?status=lead&sort=name&dir=desc&page=9");
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(page).not.toHaveURL(/page=/);
    await expect(page).toHaveURL(/status=lead/);
    await expect(page).toHaveURL(/dir=desc/);
  });

  test("coming back to a later page from a record stays on that page", async ({ page, request }) => {
    for (let number = 0; number < 55; number += 1)
      await addOrganization(request, `Company ${String(number).padStart(2, "0")}`);

    await page.goto("/organizations?page=2");
    await bodyRows(page).first().getByRole("link").first().click();
    await expect(page).toHaveURL(/\/organizations\/\d+$/);
    await page.goBack();
    await expect(page).toHaveURL(/page=2/);
    await expect(bodyRows(page)).toHaveCount(5);
  });

  test("settings in the address that make no sense are ignored", async ({ page, request }) => {
    const { deal } = await addLinkedDeal(request, "Still here");

    for (const address of [
      "/deals?stage=nothing",
      "/deals?sort=nothing&dir=sideways",
      "/deals?page=abc",
      "/contacts?status=nothing",
    ]) {
      await page.goto(address);
      await expect(bodyRows(page)).toHaveCount(1);
    }
    expect(deal.id).toBeGreaterThan(0);
  });

  test("the status filter goes by a contact's status, not by words in their details", async ({ page, request }) => {
    const organization = await addOrganization(request, "Lead Generation Ltd");
    await addContact(request, "Lead Singer", organization.id, {
      status: "customer",
      job_title: "Qualified electrician",
    });

    await page.goto("/contacts?status=lead");
    await expect(page.getByText("No contacts match.")).toBeVisible();
    await page.goto("/contacts?status=qualified");
    await expect(page.getByText("No contacts match.")).toBeVisible();
    await page.goto("/contacts?status=customer");
    await expect(bodyRows(page)).toHaveCount(1);
  });
});

test.describe("held by invoices", () => {
  test("a deal with a draft can't be deleted, and its dialog offers only Close", async ({ page, request }) => {
    const { deal } = await addLinkedDeal(request, "Held deal", { stage: "won", close_date: isoDay() });
    await startInvoice(request, deal.id);
    await page.goto(`/deals/${deal.id}`);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "Held deal can't be deleted" });
    await expect(dialog).toContainText("This deal has 1 invoice, so it can't be deleted.");
    await expect(dialog.getByRole("button")).toHaveText(["Close"]);
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(heading(page, "Held deal")).toBeVisible();
  });

  test("an organization with an issued invoice can't be deleted", async ({ page, request }) => {
    const { organization } = await addIssuedInvoice(request, "Held organization");
    await page.goto(`/organizations/${organization.id}`);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "Held organization Ltd can't be deleted" });
    await expect(dialog).toContainText("This organization has 1 invoice, so it can't be deleted.");
    await expect(dialog.getByRole("button")).toHaveText(["Close"]);
  });
});
