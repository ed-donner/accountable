import type { APIRequestContext, Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import {
  addActivity,
  addBill,
  addDeal,
  addLinkedDeal,
  addOrganization,
  addProduct,
  addQuote,
  card,
  column,
  dropAtEnd,
  emptyDatabase,
  isoDay,
  startInvoice,
} from "./helpers";

// What the app does when things go wrong, which is where the bugs the review found
// were hiding. Each idea runs across every screen it could apply to.

test.beforeEach(emptyDatabase);

const FAILED = { status: 500, contentType: "application/json", body: '{"detail":"Something went wrong."}' };
const OUT_OF_DATE = "Couldn't refresh this, so it may be out of date.";

/** Makes one API path fail until the returned switch is turned off. */
async function breakApi(page: Page, pathname: string, method = "GET") {
  const broken = { on: true };
  await page.route(
    (url) => url.pathname === pathname,
    (route) => (broken.on && route.request().method() === method ? route.fulfill(FAILED) : route.continue()),
  );
  return broken;
}

/** The refetch that happens when someone comes back to the window. */
async function comeBackToTheWindow(page: Page, pathname: string) {
  const reply = page.waitForResponse((response) => new URL(response.url()).pathname === pathname);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange", { bubbles: true })));
  await reply;
}

type Screen = {
  name: string;
  address: (ids: Ids) => string;
  read: (ids: Ids) => string;
  shown: (page: Page, ids: Ids) => Locator;
};
type Ids = {
  deal: number;
  contact: number;
  organization: number;
  product: number;
  bill: number;
  quote: { id: number; number: string };
  invoice: number;
};

const heading = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });

const SCREENS: Screen[] = [
  {
    name: "the dashboard",
    address: () => "/",
    read: () => "/api/dashboard",
    shown: (page) => page.getByTestId("revenue-this-month"),
  },
  {
    name: "Organizations",
    address: () => "/organizations",
    read: () => "/api/organizations",
    shown: (page) => page.locator("tbody tr").first(),
  },
  {
    name: "Contacts",
    address: () => "/contacts",
    read: () => "/api/contacts",
    shown: (page) => page.locator("tbody tr").first(),
  },
  {
    name: "Deals",
    address: () => "/deals",
    read: () => "/api/deals",
    shown: (page) => page.locator("tbody tr").first(),
  },
  { name: "the Pipeline", address: () => "/pipeline", read: () => "/api/deals", shown: (page) => card(page, "Solid") },
  {
    name: "a deal's page",
    address: ({ deal }) => `/deals/${deal}`,
    read: ({ deal }) => `/api/deals/${deal}`,
    shown: (page) => heading(page, "Solid"),
  },
  {
    name: "a contact's page",
    address: ({ contact }) => `/contacts/${contact}`,
    read: ({ contact }) => `/api/contacts/${contact}`,
    shown: (page) => heading(page, "Solid Contact"),
  },
  {
    name: "an organization's page",
    address: ({ organization }) => `/organizations/${organization}`,
    read: ({ organization }) => `/api/organizations/${organization}`,
    shown: (page) => heading(page, "Solid Ltd"),
  },
  {
    name: "a deal's timeline",
    address: ({ deal }) => `/deals/${deal}`,
    read: ({ deal }) => `/api/deals/${deal}/timeline`,
    shown: (page) => page.getByTestId("timeline-entry").first(),
  },
  {
    name: "a contact's timeline",
    address: ({ contact }) => `/contacts/${contact}`,
    read: ({ contact }) => `/api/contacts/${contact}/timeline`,
    shown: (page) => page.getByTestId("timeline-entry").first(),
  },
  {
    name: "an organization's timeline",
    address: ({ organization }) => `/organizations/${organization}`,
    read: ({ organization }) => `/api/organizations/${organization}/timeline`,
    shown: (page) => page.getByTestId("timeline-entry").first(),
  },
  {
    name: "Products",
    address: () => "/products",
    read: () => "/api/products",
    shown: (page) => page.locator("tbody tr").first(),
  },
  {
    name: "a product's page",
    address: ({ product }) => `/products/${product}`,
    read: ({ product }) => `/api/products/${product}`,
    shown: (page) => heading(page, "Solid kit"),
  },
  {
    name: "Quotes",
    address: () => "/quotes",
    read: () => "/api/quotes",
    shown: (page) => page.locator("tbody tr").first(),
  },
  {
    name: "a quote's page",
    address: ({ quote }) => `/quotes/${quote.id}`,
    read: ({ quote }) => `/api/quotes/${quote.id}`,
    shown: (page, { quote }) => heading(page, quote.number),
  },
  {
    name: "Invoices",
    address: () => "/invoices",
    read: () => "/api/invoices",
    shown: (page) => page.locator("tbody tr").first(),
  },
  {
    name: "an invoice's page",
    address: ({ invoice }) => `/invoices/${invoice}`,
    read: ({ invoice }) => `/api/invoices/${invoice}`,
    shown: (page) => heading(page, "Draft invoice"),
  },
  {
    name: "invoices' side of the Money section",
    address: () => "/",
    read: () => "/api/invoices/money",
    shown: (page) => page.getByRole("region", { name: "Owed to us" }),
  },
  {
    name: "Bills",
    address: () => "/bills",
    read: () => "/api/bills",
    shown: (page) => page.locator("tbody tr").first(),
  },
  {
    name: "a bill's page",
    address: ({ bill }) => `/bills/${bill}`,
    read: ({ bill }) => `/api/bills/${bill}`,
    shown: (page) => heading(page, "Bill SOLID-1"),
  },
  {
    name: "bills' side of the Money section",
    address: () => "/",
    read: () => "/api/bills/dashboard",
    shown: (page) => page.getByRole("link", { name: /^What we owe/ }),
  },
];

async function solidRecords(request: APIRequestContext): Promise<Ids> {
  const { deal, contact, organization } = await addLinkedDeal(request, "Solid");
  await addActivity(request, { deal_id: deal.id, description: "Something happened" });
  const product = await addProduct(request, "Solid kit");
  // From a supplier of its own, so the organization above stays free to delete.
  const supplier = await addOrganization(request, "Solid Supplies");
  const bill = await addBill(request, { organization_id: supplier.id, bill_number: "SOLID-1" });
  // On deals of their own, which they hold, so the deal and organization above stay free to delete.
  const offer = await addLinkedDeal(request, "Solid offer", { stage: "proposal" });
  const quote = await addQuote(request, offer.deal.id, [
    { product_id: product.id, quantity: 1, unit_price_cents: 10000 },
  ]);
  // Worth nothing, so the dashboard's revenue this month stays as the tests expect it.
  const win = await addLinkedDeal(request, "Solid win", { stage: "won", close_date: isoDay(), value: 0 });
  const invoice = await startInvoice(request, win.deal.id);
  return {
    deal: deal.id,
    contact: contact.id,
    organization: organization.id,
    product: product.id,
    bill: bill.id,
    quote,
    invoice: invoice.id,
  };
}

for (const screen of SCREENS) {
  test(`${screen.name} says so when it can't load, and Try again works`, async ({
    page,
    request,
    expectConsoleError,
  }) => {
    expectConsoleError(/status of 500/);
    const ids = await solidRecords(request);
    const broken = await breakApi(page, screen.read(ids));

    await page.goto(screen.address(ids));
    await expect(page.getByText("Couldn't load this.")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Sections" })).toBeVisible();

    broken.on = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(screen.shown(page, ids)).toBeVisible();
    await expect(page.getByText("Couldn't load this.")).toHaveCount(0);
  });

  test(`${screen.name} keeps what it's showing if a later read fails, says so, and Try again works`, async ({
    page,
    request,
    expectConsoleError,
  }) => {
    expectConsoleError(/status of 500/);
    const ids = await solidRecords(request);
    await page.goto(screen.address(ids));
    await expect(screen.shown(page, ids)).toBeVisible();

    const broken = await breakApi(page, screen.read(ids));
    await comeBackToTheWindow(page, screen.read(ids));

    await expect(page.getByText(OUT_OF_DATE)).toBeVisible();
    await expect(screen.shown(page, ids)).toBeVisible();
    await expect(page.getByText("Couldn't load this.")).toHaveCount(0);

    broken.on = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText(OUT_OF_DATE)).toHaveCount(0);
    await expect(screen.shown(page, ids)).toBeVisible();
  });
}

test("the dashboard says its figures may be out of date, rather than showing them as real", async ({
  page,
  request,
  expectConsoleError,
}) => {
  expectConsoleError(/status of 500/);
  const ids = await solidRecords(request);
  await page.goto("/");
  await expect(page.getByTestId("revenue-this-month")).toHaveText("$0");

  await addDeal(request, "Won meanwhile", {
    organization_id: ids.organization,
    main_contact_id: ids.contact,
    stage: "won",
    close_date: isoDay(),
  });
  const broken = await breakApi(page, "/api/dashboard");
  await comeBackToTheWindow(page, "/api/dashboard");

  await expect(page.getByText(OUT_OF_DATE)).toBeVisible();
  await expect(page.getByTestId("revenue-this-month")).toHaveText("$0");

  broken.on = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("revenue-this-month")).toHaveText("$10,000");
  await expect(page.getByText(OUT_OF_DATE)).toHaveCount(0);
});

test("a first read that fails just before another succeeds still loads, with no blank screen", async ({
  page,
  request,
  expectConsoleError,
}) => {
  expectConsoleError(/status of 500/);
  await solidRecords(request);
  let reads = 0;
  await page.route(
    (url) => url.pathname === "/api/dashboard",
    (route) => {
      reads += 1;
      return reads === 1 ? route.fulfill({ status: 500, contentType: "text/plain", body: "" }) : route.continue();
    },
  );
  await page.route(
    (url) => url.pathname === "/api/meta",
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.continue();
    },
  );

  await page.goto("/");

  await expect(page.getByTestId("revenue-this-month")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test.describe("a failed read isn't mistaken for no data", () => {
  test("the Pipeline shows no totals", async ({ page, request, expectConsoleError }) => {
    expectConsoleError(/status of 500/);
    await solidRecords(request);
    await breakApi(page, "/api/deals");
    await page.goto("/pipeline");
    await expect(page.getByText("Couldn't load this.")).toBeVisible();
    await expect(page.getByTestId("board-value")).toHaveCount(0);
    await expect(page.getByTestId("board-expected")).toHaveCount(0);
    await expect(page.getByText("No deals yet. Add the first one.")).toHaveCount(0);
  });

  test("Contacts shows no counts", async ({ page, request, expectConsoleError }) => {
    expectConsoleError(/status of 500/);
    await solidRecords(request);
    await breakApi(page, "/api/contacts");
    await page.goto("/contacts");
    await expect(page.getByText("Couldn't load this.")).toBeVisible();
    await expect(page.getByRole("button", { name: "All", exact: true })).toBeVisible();
    await expect(page.getByRole("group", { name: "Filter by status" }).locator(".num")).toHaveCount(0);
    await expect(page.getByText("No contacts yet. Add the first one.")).toHaveCount(0);
  });

  test("the dashboard shows no figures", async ({ page, request, expectConsoleError }) => {
    expectConsoleError(/status of 500/);
    await solidRecords(request);
    await breakApi(page, "/api/dashboard");
    await page.goto("/");
    await expect(page.getByText("Couldn't load this.")).toBeVisible();
    await expect(page.getByTestId("revenue-this-month")).toHaveCount(0);
  });

  test("a timeline doesn't say nothing has happened", async ({ page, request, expectConsoleError }) => {
    expectConsoleError(/status of 500/);
    const ids = await solidRecords(request);
    await breakApi(page, `/api/deals/${ids.deal}/timeline`);
    await page.goto(`/deals/${ids.deal}`);
    await expect(page.getByText("Couldn't load this.")).toBeVisible();
    await expect(page.getByText("Nothing logged yet.")).toHaveCount(0);
  });

  test("a form that can't read its lists doesn't offer an empty picker", async ({
    page,
    request,
    expectConsoleError,
  }) => {
    expectConsoleError(/status of 500/);
    await solidRecords(request);
    await breakApi(page, "/api/organizations");
    await page.goto("/contacts");
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByText("Couldn't open the form. Try again.")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("the deal form says so too, on every Add deal button", async ({ page, request, expectConsoleError }) => {
    expectConsoleError(/status of 500/);
    const ids = await solidRecords(request);
    await breakApi(page, "/api/contacts");

    await page.goto("/deals");
    await page.getByRole("button", { name: "Add deal" }).first().click();
    await expect(page.getByText("Couldn't open the form. Try again.")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.goto(`/organizations/${ids.organization}`);
    await page.getByRole("button", { name: "Add deal" }).click();
    await expect(page.getByText("Couldn't open the form. Try again.")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("a delete dialog that can't read the counts won't delete", async ({ page, request, expectConsoleError }) => {
    expectConsoleError(/status of 500/);
    const ids = await solidRecords(request);
    await breakApi(page, `/api/deals/${ids.deal}/delete-impact`);
    await page.goto(`/deals/${ids.deal}`);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Couldn't check what's linked");
    await expect(page.getByRole("button", { name: "Delete deal" })).toBeDisabled();
  });
});

test("a deleted record's address stays gone after another record is added", async ({
  page,
  request,
  expectConsoleError,
}) => {
  expectConsoleError(/status of 404/);
  const { deal, organization, contact } = await addLinkedDeal(request, "First try");
  await request.delete(`/api/deals/${deal.id}`);
  const next = await addDeal(request, "Second try", { organization_id: organization.id, main_contact_id: contact.id });

  await page.goto(`/deals/${deal.id}`);

  expect(next.id).not.toBe(deal.id);
  await expect(heading(page, "This deal no longer exists")).toBeVisible();
});

test("a product that isn't there says it no longer exists, with a link back", async ({
  page,
  request,
  expectConsoleError,
}) => {
  expectConsoleError(/status of 404/);
  const product = await addProduct(request, "Here");
  await page.goto(`/products/${product.id + 1000}`);
  await expect(heading(page, "This product no longer exists")).toBeVisible();
  await page.getByRole("link", { name: "Back to Products" }).click();
  await expect(heading(page, "Products")).toBeVisible();
});

test("a bill that isn't there says it no longer exists, with a link back", async ({
  page,
  request,
  expectConsoleError,
}) => {
  expectConsoleError(/status of 404/);
  const supplier = await addOrganization(request, "Here Supplies");
  const bill = await addBill(request, { organization_id: supplier.id });
  await page.goto(`/bills/${bill.id + 1000}`);
  await expect(heading(page, "This bill no longer exists")).toBeVisible();
  await page.getByRole("link", { name: "Back to Bills" }).click();
  await expect(heading(page, "Bills")).toBeVisible();
});

test.describe("addresses that lead nowhere", () => {
  const SECTIONS = [
    ["deals", "deal", "Deals"],
    ["contacts", "contact", "Contacts"],
    ["organizations", "organization", "Organizations"],
    ["products", "product", "Products"],
    ["bills", "bill", "Bills"],
  ];

  for (const [folder, word, section] of SECTIONS) {
    test(`a ${word} address that can't be a record says so, with no error in the console`, async ({ page }) => {
      for (const id of ["abc", "0", "-1", "1.5", "1e3", "0x10", "2147483648", "99999999999999999999", "%20"]) {
        await page.goto(`/${folder}/${id}`);
        await expect(heading(page, `This ${word} no longer exists`), id).toBeVisible();
        await expect(page.getByRole("navigation", { name: "Sections" })).toBeVisible();
      }
      await page.getByRole("link", { name: `Back to ${section}` }).click();
      await expect(heading(page, section)).toBeVisible();
    });
  }

  for (const address of ["/nothing-here", "/deals/1/extra", "/pipeline/1", "/organizations/1/contacts"]) {
    test(`${address} says so, keeps the top bar and links home`, async ({ page }) => {
      await page.goto(address);
      await expect(heading(page, "This page no longer exists")).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Sections" })).toBeVisible();
      await page.getByRole("link", { name: "Back to Dashboard" }).click();
      await expect(heading(page, "Dashboard")).toBeVisible();
    });
  }
});

test.describe("a record deleted while it's still on screen", () => {
  test("logging an activity on it says so, and keeps what was typed", async ({ page, request, expectConsoleError }) => {
    expectConsoleError(/status of 422.*\/api\/activities/);
    const { deal } = await addLinkedDeal(request, "Vanishing");
    await page.goto(`/deals/${deal.id}`);
    await page.getByRole("button", { name: "Log activity" }).click();
    const form = page.getByRole("dialog", { name: "Log activity" });
    await form.getByLabel("Description").fill("Called them");
    await request.delete(`/api/deals/${deal.id}`);
    await form.getByRole("button", { name: "Save activity" }).click();

    await expect(page.getByText("That record no longer exists")).toBeVisible();
    await expect(form.getByLabel("Description")).toHaveValue("Called them");
  });

  test("the same goes for a contact", async ({ page, request, expectConsoleError }) => {
    expectConsoleError(/status of 422.*\/api\/activities/);
    const { contact } = await addLinkedDeal(request, "Vanishing person");
    await page.goto(`/contacts/${contact.id}`);
    await page.getByRole("button", { name: "Log activity" }).click();
    const form = page.getByRole("dialog", { name: "Log activity" });
    await form.getByLabel("Description").fill("Called them");
    await request.delete(`/api/contacts/${contact.id}`);
    await form.getByRole("button", { name: "Save activity" }).click();

    await expect(page.getByText("That record no longer exists")).toBeVisible();
  });

  for (const [word, path, label, save] of [
    ["deal", "deals", "Name", "Save deal"],
    ["contact", "contacts", "Name", "Save contact"],
    ["organization", "organizations", "Name", "Save organization"],
  ]) {
    test(`saving an edit to a ${word} says so, and keeps what was typed`, async ({
      page,
      request,
      expectConsoleError,
    }) => {
      expectConsoleError(/status of 404/);
      const { deal, contact, organization } = await addLinkedDeal(request, "Edited");
      const id = { deals: deal.id, contacts: contact.id, organizations: organization.id }[path]!;
      await page.goto(`/${path}/${id}`);
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      const form = page.getByRole("dialog");
      await form.getByLabel(label).fill("Better name");
      await request.delete(`/api/${path}/${id}`);
      await form.getByRole("button", { name: save }).click();

      await expect(page.getByText(new RegExp(`${word} not found`, "i"))).toBeVisible();
      await expect(form.getByLabel(label)).toHaveValue("Better name");
    });

    test(`deleting a ${word} that's already gone says so`, async ({ page, request, expectConsoleError }) => {
      expectConsoleError(/status of 404/);
      const { deal, contact, organization } = await addLinkedDeal(request, "Twice deleted");
      const id = { deals: deal.id, contacts: contact.id, organizations: organization.id }[path]!;
      await page.goto(`/${path}/${id}`);
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      const confirm = page.getByRole("button", { name: `Delete ${word}` });
      await expect(confirm).toBeEnabled();
      await request.delete(`/api/${path}/${id}`);
      await confirm.click();

      await expect(page.getByText(new RegExp(`${word} not found`, "i"))).toBeVisible();
    });
  }

  test("editing an activity says so", async ({ page, request, expectConsoleError }) => {
    expectConsoleError(/status of 404/);
    const { deal } = await addLinkedDeal(request, "Activity gone");
    const activity = await addActivity(request, { deal_id: deal.id, description: "Going soon" });
    await page.goto(`/deals/${deal.id}`);
    await page.getByRole("button", { name: "Edit Going soon" }).click();
    const form = page.getByRole("dialog", { name: "Edit activity" });
    await request.delete(`/api/activities/${activity.id}`);
    await form.getByRole("button", { name: "Save activity" }).click();

    await expect(page.getByText("Activity not found")).toBeVisible();
  });

  test("ticking its follow-up says so, on a timeline", async ({ page, request, expectConsoleError }) => {
    expectConsoleError(/status of 404/);
    const { deal } = await addLinkedDeal(request, "Tick gone");
    const activity = await addActivity(request, {
      deal_id: deal.id,
      description: "Ring back",
      follow_up_date: isoDay(3),
    });
    await page.goto(`/deals/${deal.id}`);
    await expect(page.getByText("Ring back")).toBeVisible();
    await request.delete(`/api/activities/${activity.id}`);
    await page.getByTestId("timeline-entry").filter({ hasText: "Ring back" }).getByRole("checkbox").click();

    await expect(page.getByText("Couldn't save that. Check that Accountable is still running.")).toBeVisible();
  });

  test("ticking its follow-up says so, on the dashboard", async ({ page, request, expectConsoleError }) => {
    expectConsoleError(/status of 404/);
    const { deal } = await addLinkedDeal(request, "Dashboard tick gone");
    const activity = await addActivity(request, {
      deal_id: deal.id,
      description: "Ring back",
      follow_up_date: isoDay(3),
    });
    await page.goto("/");
    const row = page.getByTestId("follow-up").filter({ hasText: "Ring back" });
    await expect(row).toBeVisible();
    await request.delete(`/api/activities/${activity.id}`);
    await row.getByRole("checkbox").click();

    await expect(page.getByText("Couldn't save that. Check that Accountable is still running.")).toBeVisible();
    await expect(row).toHaveCount(0);
  });

  test("dragging its card says so, and the card goes", async ({ page, request, expectConsoleError }) => {
    expectConsoleError(/status of 404/);
    const { deal } = await addLinkedDeal(request, "Card gone");
    await page.goto("/pipeline");
    await expect(card(page, "Card gone")).toBeVisible();
    await request.delete(`/api/deals/${deal.id}`);
    await dropAtEnd(page, "Card gone", "proposal");

    await expect(page.getByText("Couldn't move that deal, so it's back where it was.")).toBeVisible();
    await expect(card(page, "Card gone")).toHaveCount(0);
  });

  test("choosing a deleted organization puts the message beside its field", async ({
    page,
    request,
    expectConsoleError,
  }) => {
    expectConsoleError(/status of 422/);
    const organization = await addOrganization(request, "Short lived");
    await page.goto("/contacts");
    await page.getByRole("button", { name: "Add contact" }).first().click();
    const form = page.getByRole("dialog");
    await form.getByLabel("Name").fill("New person");
    await form.getByRole("combobox", { name: "Organization" }).click();
    await page.getByRole("option", { name: "Short lived" }).click();
    await request.delete(`/api/organizations/${organization.id}`);
    await form.getByRole("button", { name: "Save contact" }).click();

    await expect(form.getByText("Choose an organization")).toBeVisible();
    await expect(form.getByLabel("Name")).toHaveValue("New person");
  });
});

test.describe("saves that fail", () => {
  test("a failed delete leaves the record and the dialog, and says so", async ({
    page,
    request,
    expectConsoleError,
  }) => {
    expectConsoleError(/status of 500/);
    const { deal } = await addLinkedDeal(request, "Hard to delete");
    await breakApi(page, `/api/deals/${deal.id}`, "DELETE");
    await page.goto(`/deals/${deal.id}`);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Delete deal" }).click();

    await expect(page.getByText("Something went wrong.")).toBeVisible();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    expect((await request.get(`/api/deals/${deal.id}`)).status()).toBe(200);
  });

  test("a failed save can be tried again without typing it all again", async ({
    page,
    request,
    expectConsoleError,
  }) => {
    expectConsoleError(/status of 500/);
    const organization = await addOrganization(request, "Second try");
    const broken = await breakApi(page, `/api/organizations/${organization.id}`, "PATCH");
    await page.goto(`/organizations/${organization.id}`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const form = page.getByRole("dialog");
    await form.getByLabel("Industry").fill("Retail");
    await form.getByRole("button", { name: "Save organization" }).click();
    await expect(page.getByText("Something went wrong.")).toBeVisible();

    broken.on = false;
    await form.getByRole("button", { name: "Save organization" }).click();
    await expect(form).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Details" })).toContainText("Retail");
  });

  test("a failed archive says so and leaves the product", async ({ page, request, expectConsoleError }) => {
    expectConsoleError(/status of 500/);
    const product = await addProduct(request, "Hard to archive");
    await breakApi(page, `/api/products/${product.id}`, "PATCH");
    await page.goto(`/products/${product.id}`);
    await page.getByRole("button", { name: "Archive", exact: true }).click();

    await expect(page.getByText("Something went wrong.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Archive", exact: true })).toBeVisible();
    expect((await (await request.get(`/api/products/${product.id}`)).json()).active).toBe(true);
  });

  test("a failed Mark paid says so and leaves the bill unpaid", async ({ page, request, expectConsoleError }) => {
    expectConsoleError(/status of 500/);
    const supplier = await addOrganization(request, "Hard to pay");
    const bill = await addBill(request, { organization_id: supplier.id, bill_number: "HTP-1" });
    await breakApi(page, `/api/bills/${bill.id}`, "PATCH");
    await page.goto("/bills");
    await page.getByRole("button", { name: "Mark paid bill HTP-1 from Hard to pay" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Mark paid" }).click();

    await expect(page.getByText("Something went wrong.")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Mark bill HTP-1 paid" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("row", { name: /^Hard to pay/ }).getByText("Unpaid")).toBeVisible();
    expect((await (await request.get(`/api/bills/${bill.id}`)).json()).paid_on).toBeNull();
  });

  test("a failed tick puts the follow-up back on the dashboard", async ({ page, request, expectConsoleError }) => {
    expectConsoleError(/status of 500/);
    const { deal } = await addLinkedDeal(request, "Tick fails");
    const activity = await addActivity(request, {
      deal_id: deal.id,
      description: "Ring back",
      follow_up_date: isoDay(3),
    });
    await breakApi(page, `/api/activities/${activity.id}`, "PATCH");
    await page.goto("/");
    const row = page.getByTestId("follow-up").filter({ hasText: "Ring back" });
    await row.getByRole("checkbox").click();

    await expect(page.getByText("Couldn't save that. Check that Accountable is still running.")).toBeVisible();
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("checkbox")).not.toBeChecked();
  });
});

test.describe("pressing twice", () => {
  test("a double click on Save adds the record once", async ({ page, request }) => {
    await page.goto("/organizations");
    await page.getByRole("button", { name: "Add organization" }).first().click();
    const form = page.getByRole("dialog");
    await form.getByLabel("Name").fill("Only once");
    await form.getByRole("button", { name: "Save organization" }).dblclick();
    await expect(form).toHaveCount(0);

    await page.waitForLoadState("networkidle");
    const rows = await (await request.get("/api/organizations")).json();
    expect(rows.filter((row: { name: string }) => row.name === "Only once")).toHaveLength(1);
  });

  test("a double click on Save logs the activity once", async ({ page, request }) => {
    const { deal } = await addLinkedDeal(request, "Logged once");
    await page.goto(`/deals/${deal.id}`);
    await page.getByRole("button", { name: "Log activity" }).click();
    const form = page.getByRole("dialog", { name: "Log activity" });
    await form.getByLabel("Description").fill("Only once");
    await form.getByRole("button", { name: "Save activity" }).dblclick();
    await expect(form).toHaveCount(0);

    await page.waitForLoadState("networkidle");
    const timeline = await (await request.get(`/api/deals/${deal.id}/timeline`)).json();
    expect(timeline.total).toBe(1);
  });

  test("a double click on Delete deletes an activity once, with no error", async ({ page, request }) => {
    const { deal } = await addLinkedDeal(request, "Activity deleted once");
    await addActivity(request, { deal_id: deal.id, description: "Going once" });
    await page.goto(`/deals/${deal.id}`);
    await page.getByRole("button", { name: "Delete Going once" }).click();
    await page.getByRole("button", { name: "Delete activity" }).dblclick();
    await expect(page.getByTestId("timeline-entry")).toHaveCount(0);
    await expect(page.getByText("Activity not found")).toHaveCount(0);
  });

  test("a double click on Delete deletes once, with no error", async ({ page, request }) => {
    const { deal } = await addLinkedDeal(request, "Deleted once");
    await page.goto(`/deals/${deal.id}`);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const confirm = page.getByRole("button", { name: "Delete deal" });
    await expect(confirm).toBeEnabled();
    await confirm.dblclick();
    await expect(heading(page, "Deals")).toBeVisible();
    await expect(page.getByText("Deal not found")).toHaveCount(0);
  });

  test("a double click on Archive archives once, with no error", async ({ page, request }) => {
    const product = await addProduct(request, "Archived once");
    const archives: string[] = [];
    page.on("request", (sent) => {
      if (sent.method() === "PATCH" && new URL(sent.url()).pathname === `/api/products/${product.id}`) {
        archives.push(sent.postData() ?? "");
      }
    });
    await page.goto("/products");
    await page.getByRole("button", { name: "Archive Archived once" }).dblclick();

    await expect(page.getByText("Product archived.")).toBeVisible();
    await expect(page.getByRole("row", { name: /^Archived once/ })).toHaveCount(0);
    expect(archives).toEqual(['{"active":false}']);
    expect((await (await request.get(`/api/products/${product.id}`)).json()).active).toBe(false);
  });

  test("a double click on Mark paid in its dialog marks the bill paid once, with no error", async ({
    page,
    request,
  }) => {
    const supplier = await addOrganization(request, "Paid once");
    const bill = await addBill(request, { organization_id: supplier.id, bill_number: "PO-1" });
    const payments: string[] = [];
    page.on("request", (sent) => {
      if (sent.method() === "PATCH" && new URL(sent.url()).pathname === `/api/bills/${bill.id}`) {
        payments.push(sent.postData() ?? "");
      }
    });
    await page.goto("/bills");
    await page.getByRole("button", { name: "Mark paid bill PO-1 from Paid once" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Mark paid" }).dblclick();

    await expect(page.getByText("Bill marked paid.")).toBeVisible();
    await expect(page.getByText("No unpaid bills.")).toBeVisible();
    expect(payments).toEqual([JSON.stringify({ paid_on: isoDay() })]);
    expect((await (await request.get(`/api/bills/${bill.id}`)).json()).paid_on).toBe(isoDay());
  });

  test("a double click on a card's column button opens one form", async ({ page }) => {
    await page.goto("/pipeline");
    await column(page, "new")
      .getByRole("button", { name: /Add deal/ })
      .dblclick();
    await expect(page.getByRole("dialog")).toHaveCount(1);
  });
});
