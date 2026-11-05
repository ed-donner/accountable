import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { addContact, addDeal, addOrganization, addProduct, emptyDatabase } from "./helpers";

// The top bar's search (K1 to K7), on a database holding only what each test adds.

test.beforeEach(emptyDatabase);

function searchBox(page: Page) {
  return page.getByRole("combobox", { name: "Search organizations, contacts, deals and products" });
}

function results(page: Page) {
  return page.getByRole("listbox", { name: "Search results" });
}

function result(page: Page, name: string) {
  return results(page).getByRole("option", { name: new RegExp(`^${name}`) });
}

function heading(page: Page, name: string) {
  return page.getByRole("heading", { level: 1, name });
}

async function addHarbor(request: APIRequestContext) {
  const organization = await addOrganization(request, "Harbor & Pine", { industry: "Logistics" });
  const contact = await addContact(request, "Émile Harbinger", organization.id);
  const deal = await addDeal(request, "Harbor refit", {
    organization_id: organization.id,
    main_contact_id: contact.id,
    stage: "proposal",
  });
  return { organization, contact, deal };
}

test("finds an organization, a contact and a deal by part of a name in another case, and opens each by click", async ({
  page,
  request,
}) => {
  const { organization, contact, deal } = await addHarbor(request);
  await page.goto("/");

  await searchBox(page).fill("HARB");
  await expect(results(page).getByRole("group")).toHaveCount(3);
  const organizations = results(page).getByRole("group", { name: "Organizations" });
  await expect(organizations.getByRole("option")).toHaveText(["Harbor & PineLogistics"]);
  await expect(organizations.getByRole("option").locator("strong")).toHaveText("Harb");
  const contacts = results(page).getByRole("group", { name: "Contacts" });
  await expect(contacts.getByRole("option")).toHaveText(["Émile HarbingerHarbor & Pine"]);
  const deals = results(page).getByRole("group", { name: "Deals" });
  await expect(deals.getByRole("option")).toHaveText(["Harbor refitProposalHarbor & Pine"]);

  await result(page, "Harbor & Pine").click();
  await expect(page).toHaveURL(`/organizations/${organization.id}`);
  await expect(heading(page, "Harbor & Pine")).toBeVisible();
  await expect(searchBox(page)).toHaveValue("");
  await expect(results(page)).toHaveCount(0);

  await searchBox(page).fill("ÉMILE");
  await result(page, "Émile Harbinger").click();
  await expect(page).toHaveURL(`/contacts/${contact.id}`);
  await expect(heading(page, "Émile Harbinger")).toBeVisible();

  await searchBox(page).fill("REFIT");
  await result(page, "Harbor refit").click();
  await expect(page).toHaveURL(`/deals/${deal.id}`);
  await expect(heading(page, "Harbor refit")).toBeVisible();
});

test("opens each kind by keyboard, with the arrow keys and Enter", async ({ page, request }) => {
  const { organization, contact, deal } = await addHarbor(request);
  await page.goto("/pipeline");

  for (const [presses, address] of [
    [0, `/organizations/${organization.id}`],
    [1, `/contacts/${contact.id}`],
    [2, `/deals/${deal.id}`],
  ] as const) {
    await searchBox(page).focus();
    await page.keyboard.type("harb");
    await expect(result(page, "Harbor & Pine")).toHaveAttribute("aria-selected", "true");
    for (let press = 0; press < presses; press += 1) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(address);
    await expect(searchBox(page)).toHaveValue("");
    await expect(results(page)).toHaveCount(0);
  }
});

test("See all opens the table with the same search", async ({ page, request }) => {
  const organization = await addOrganization(request, "Lantern Hotels");
  for (const name of ["Sam Carter", "Sam Okafor", "Samira Haddad", "Sami Lund", "Sammy Diaz", "Samuel Price"]) {
    await addContact(request, name, organization.id);
  }
  await addContact(request, "Robin Moss", organization.id);
  await page.goto("/");

  await searchBox(page).fill("sam");
  await expect(results(page).getByRole("group", { name: "Contacts" }).getByRole("option")).toHaveCount(6);
  await result(page, "See all 6 contacts").click();

  await expect(page).toHaveURL("/contacts?q=sam");
  await expect(page.getByRole("searchbox", { name: "Search contacts" })).toHaveValue("sam");
  await expect(page.locator("tbody tr")).toHaveCount(6);
  await expect(searchBox(page)).toHaveValue("");
});

test("says so when nothing matches", async ({ page, request }) => {
  await addHarbor(request);
  await page.goto("/");
  await searchBox(page).fill("harbour");
  await expect(page.getByRole("status")).toHaveText('No organizations, contacts, deals or products match "harbour".');
});

test("% and _ match only themselves", async ({ page, request }) => {
  await addOrganization(request, "100% Organic");
  await addOrganization(request, "Snake_case Ltd");
  await addOrganization(request, "Plain Name");
  await page.goto("/");

  await searchBox(page).fill("%");
  await expect(results(page).getByRole("option")).toHaveText(["100% Organic"]);
  await searchBox(page).fill("_");
  await expect(results(page).getByRole("option")).toHaveText(["Snake_case Ltd"]);
});

test("a failed search says so and keeps what was typed", async ({ page, request, expectConsoleError }) => {
  expectConsoleError(/status of 500/);
  await addHarbor(request);
  const search = (url: URL) => url.pathname === "/api/search";
  await page.route(search, (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"Something went wrong."}' }),
  );
  await page.goto("/");

  await searchBox(page).fill("harb");
  await expect(page.getByRole("status")).toHaveText("Couldn't search. Try again.");
  await expect(searchBox(page)).toHaveValue("harb");

  await page.unroute(search);
  await searchBox(page).click();
  await expect(result(page, "Harbor & Pine")).toBeVisible();
});

test("Escape closes the list, and a second Escape clears the box", async ({ page, request }) => {
  await addHarbor(request);
  await page.goto("/");

  await searchBox(page).fill("harb");
  await expect(result(page, "Harbor & Pine")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(results(page)).toHaveCount(0);
  await expect(searchBox(page)).toHaveValue("harb");
  await expect(searchBox(page)).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(searchBox(page)).toHaveValue("");
  await expect(page).toHaveURL("/");
});

test("finds active products, fourth, with their prices, and opens one", async ({ page, request }) => {
  await addHarbor(request);
  const survey = await addProduct(request, "Harbor survey", { unit_price_cents: 125050 });
  await addProduct(request, "Harbor seat", { unit_price_cents: 4950 });
  await addProduct(request, "Harbor printer", { unit_price_cents: 28995, active: false });
  await page.goto("/");

  await searchBox(page).fill("harb");
  const groups = results(page).getByRole("group");
  await expect(groups).toHaveCount(4);
  for (const [index, name] of ["Organizations", "Contacts", "Deals", "Products"].entries()) {
    await expect(groups.nth(index)).toHaveAccessibleName(name);
  }
  const products = results(page).getByRole("group", { name: "Products" });
  await expect(products.getByRole("option")).toHaveText(["Harbor seat$49.50", "Harbor survey$1,250.50"]);
  await expect(products.getByText("$1,250.50")).toHaveCSS("font-family", /JetBrains Mono/);

  await result(page, "Harbor survey").click();
  await expect(page).toHaveURL(`/products/${survey.id}`);
  await expect(heading(page, "Harbor survey")).toBeVisible();
});

test("See all 6 products opens Products with the same search", async ({ page, request }) => {
  for (const name of ["Seat pack", "Pro seat", "Team seat", "Extra seat", "Basic seat", "Annual seat"]) {
    await addProduct(request, name);
  }
  await addProduct(request, "Old seat", { active: false });
  await page.goto("/");

  await searchBox(page).fill("seat");
  await expect(results(page).getByRole("group", { name: "Products" }).getByRole("option")).toHaveCount(6);
  await result(page, "See all 6 products").click();

  await expect(page).toHaveURL("/products?q=seat");
  await expect(page.getByRole("searchbox", { name: "Search products" })).toHaveValue("seat");
  await expect(page.locator("tbody tr")).toHaveCount(6);
});
