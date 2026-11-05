import type { APIRequestContext, Browser, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import {
  COPY_URL,
  card,
  cardOrder,
  chooseInPicker,
  chooseTeammate,
  dataCommand,
  dropAbove,
  makeCopyFolder,
  savedMove,
  startCopy,
  tokenFor,
  type AppCopy,
} from "./helpers";

// startCopy waits up to 60s for a copy to start on a busy machine, so anything that starts one
// needs that and time for its own work. Hooks don't take the tests' timeout, so they set it too.
const ONE_START_MS = 120_000;
test.describe.configure({ mode: "serial", timeout: ONE_START_MS });

const SCREENS = [
  "/",
  "/organizations",
  "/contacts",
  "/deals",
  "/pipeline",
  "/products",
  "/quotes",
  "/invoices",
  "/bills",
];
const TEAMMATES = ["Alex Rivera", "Dana Whitfield", "Theo Brandt", "robin@accountable.example"];

let folder: ReturnType<typeof makeCopyFolder>;
let copy: AppCopy;
/** The copy's API, signed in as one of its teammates. The copy has its own key, so the fixture's token won't do. */
let api: APIRequestContext;

test.beforeAll(async ({ playwright }) => {
  test.setTimeout(ONE_START_MS);
  folder = makeCopyFolder();
  copy = await startCopy(folder.database);

  const signedOut = await playwright.request.newContext({ baseURL: COPY_URL });
  const token = await tokenFor(signedOut, "Theo Brandt");
  await signedOut.dispose();
  api = await playwright.request.newContext({
    baseURL: COPY_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
});

// The copy goes first, and each step allows for beforeAll having stopped partway.
test.afterAll(async () => {
  await copy?.stop();
  await api?.dispose();
  folder?.remove();
});

/** Restarts the copy. Left open, the page's Vite client reloads it as the server returns, cutting off the next goto. */
async function restart(page: Page) {
  await page.goto("about:blank");
  await copy.stop();
  copy = await startCopy(folder.database);
}

async function goto(page: Page, path: string) {
  await page.goto(`${COPY_URL}${path}`);
}

/** Opens an address in a browser that hasn't signed in to the copy yet, and signs in there. */
async function openSignedIn(page: Page, path: string) {
  await goto(page, path);
  await chooseTeammate(page, "Alex Rivera");
}

/** Checks a browser that has never signed in can still choose any of the four teammates. */
async function expectAllTeammatesToChooseFrom(browser: Browser) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(COPY_URL);
    for (const name of TEAMMATES) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }
  } finally {
    await context.close();
  }
}

test("changes survive a restart, including a card's place on the board and being signed in", async ({ page }) => {
  await openSignedIn(page, "/pipeline");
  const order = await (async () => {
    await expect(page.locator("[data-deal]").first()).toBeVisible();
    return cardOrder(page, "negotiation");
  })();
  const [first, second, third] = order as string[];

  // Saved before the restart, which would otherwise cut off the request.
  await savedMove(page, third, () => dropAbove(page, third, first));
  await expect
    .poll(() => cardOrder(page, "negotiation"))
    .toEqual([third, first, second, ...(order.slice(3) as string[])]);

  expect((await api.post("/api/organizations", { data: { name: "Survives Restart Ltd" } })).ok()).toBe(true);

  await restart(page);

  await goto(page, "/pipeline");
  await expect(card(page, third)).toBeVisible();
  expect((await cardOrder(page, "negotiation")).slice(0, 3)).toEqual([third, first, second]);

  await goto(page, "/organizations?q=survives");
  await expect(page.locator("tbody tr")).toHaveCount(1);
});

test("without yes, nothing is wiped", async () => {
  const before = (await (await api.get("/api/deals")).json()).length;
  expect(before).toBeGreaterThan(0);

  const declined = dataCommand(folder.database, "empty", [], "no\n");
  expect(declined).toContain("deals");
  expect(declined).toContain("Nothing was changed.");

  const unanswered = dataCommand(folder.database, "seed");
  expect(unanswered).toContain("Nothing was changed.");

  expect((await (await api.get("/api/deals")).json()).length).toBe(before);
});

test("npm run seed with the app running brings back the sample data and keeps the teammates, and a refresh shows it", async ({
  page,
  browser,
}) => {
  await openSignedIn(page, "/organizations?q=survives");
  await expect(page.locator("tbody tr")).toHaveCount(1);

  expect(dataCommand(folder.database, "seed", ["--yes"])).toContain("Sample data restored.");

  await page.reload();
  await expect(page.getByText("No organizations match.")).toBeVisible();

  await goto(page, "/organizations");
  await expect(page.locator("tbody tr")).toHaveCount(30);

  await goto(page, "/products");
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await expect(page.getByRole("checkbox", { name: "Show archived (2)" })).not.toBeChecked();

  // The sample quotes and invoices, with payments against them, filling invoices' row of the Money section (M3).
  await goto(page, "/quotes");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await goto(page, "/invoices");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await goto(page, "/");
  const owed = page.getByRole("region", { name: "Owed to us" });
  await expect(owed.getByRole("link", { name: /^Overdue/ })).toContainText(/\$[1-9][\d,]*\.\d\d/);
  await expect(page.getByRole("region", { name: "Payments received" }).getByRole("img")).toBeVisible();

  // The sample bills: unpaid ones, overdue ones among them, and every part of the Money section full (M3).
  await goto(page, "/bills");
  await expect(page.getByRole("button", { name: /^All/ })).toHaveAccessibleName("All (85)");
  await expect(page.getByRole("button", { name: /^Overdue/ })).toHaveAccessibleName(/^Overdue \([3-9]\)$/);
  await expect(page.locator("tbody tr").first().getByText("Overdue")).toBeVisible();
  await goto(page, "/");
  const money = page.getByRole("region", { name: "Money" });
  await expect(money.getByRole("link", { name: /^What we owe/ })).toContainText(/\$[1-9][\d,]*\.\d\d/);
  await expect(
    money.getByRole("region", { name: "Bills to pay" }).getByRole("link", { name: /^Overdue/ }),
  ).toContainText(/\$[1-9][\d,]*\.\d\d/);
  await expect(money.getByRole("img", { name: /bills due from today/ })).toBeVisible();
  await expect(money.getByRole("img", { name: /^Spending by category/ })).toBeVisible();
  const months = money.getByRole("table", { name: "Spending by category for the last 12 months" }).locator("tbody tr");
  await expect(months).toHaveCount(12);
  for (const month of await months.all()) await expect(month.locator("td").last()).not.toHaveText("$0.00");

  await expectAllTeammatesToChooseFrom(browser);
});

test("npm run empty with the app running keeps the teammates and leaves every screen working and inviting the first record", async ({
  page,
  browser,
}) => {
  await openSignedIn(page, "/deals");
  await expect(page.locator("tbody tr").first()).toBeVisible();

  expect(dataCommand(folder.database, "empty", ["--yes"])).toContain("Database emptied.");

  await page.reload();
  await expect(page.getByText("No deals yet. Add the first one.")).toBeVisible();

  await goto(page, "/organizations");
  await expect(page.getByText("No organizations yet. Add the first one.")).toBeVisible();
  await goto(page, "/contacts");
  await expect(page.getByText("No contacts yet. Add the first one.")).toBeVisible();
  await goto(page, "/products");
  await expect(page.getByText("No products yet. Add the first one.")).toBeVisible();
  await goto(page, "/quotes");
  await expect(page.getByText("No quotes yet. Add the first one from an open deal.")).toBeVisible();
  await goto(page, "/invoices");
  await expect(page.getByText("No invoices yet. Start one from a won deal.")).toBeVisible();
  await goto(page, "/bills");
  await expect(page.getByText("No bills yet. Add the first one.")).toBeVisible();
  await goto(page, "/");
  await expect(page.getByText("No follow-ups due.")).toBeVisible();
  const money = page.getByRole("region", { name: "Money" });
  await expect(money.getByText("Nothing owed.")).toBeVisible();
  await expect(money.getByText("No payments in the last 12 months.")).toBeVisible();
  await expect(money.getByRole("link", { name: /^What we owe/ })).toHaveText("What we owe$0.000 unpaid bills");
  await expect(money.getByText("No bills due in the next 30 days.")).toBeVisible();
  await expect(money.getByText("Spending will show here once you've added bills.")).toBeVisible();
  await goto(page, "/pipeline");
  await expect(page.getByText("No deals yet. Add the first one.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add deal to New" })).toBeVisible();
  for (const path of SCREENS) {
    await goto(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }

  await expectAllTeammatesToChooseFrom(browser);
});

test("an emptied database stays empty after a restart", async ({ page }) => {
  await restart(page);
  await openSignedIn(page, "/deals");
  await expect(page.getByText("No deals yet. Add the first one.")).toBeVisible();
});

test("from an empty database, the first organization, contact, deal, product, bill, quote and invoice can be added", async ({
  page,
}) => {
  await openSignedIn(page, "/organizations");
  await page.getByRole("button", { name: "Add organization" }).first().click();
  await page.getByRole("dialog").getByLabel("Name").fill("First Co");
  await page.getByRole("dialog").getByRole("button", { name: "Save organization" }).click();
  await expect(page.getByRole("link", { name: "First Co" })).toBeVisible();

  await goto(page, "/contacts");
  await page.getByRole("button", { name: "Add contact" }).first().click();
  await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill("First Person");
  await chooseInPicker(page, "Organization", "First Co");
  await page.getByRole("dialog").getByRole("button", { name: "Save contact" }).click();
  await expect(page.getByRole("link", { name: "First Person" })).toBeVisible();

  await goto(page, "/deals");
  await page.getByRole("button", { name: "Add deal" }).first().click();
  await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill("First deal");
  await chooseInPicker(page, "Organization", "First Co");
  await chooseInPicker(page, "Main contact", "First Person");
  await page.getByRole("dialog").getByLabel("Value").fill("5000");
  await page.getByRole("dialog").getByLabel("Close date").fill("2031-01-01");
  await page.getByRole("dialog").getByRole("button", { name: "Save deal" }).click();
  await expect(page.getByRole("link", { name: "First deal" })).toBeVisible();

  await goto(page, "/");
  await expect(page.getByTestId("band-new")).toContainText("$5,000");

  await goto(page, "/products");
  await page.getByRole("button", { name: "Add product" }).first().click();
  await page.getByRole("dialog").getByLabel("Name").fill("First product");
  await page.getByRole("dialog").getByLabel("Unit price").fill("49.50");
  await page.getByRole("dialog").getByRole("button", { name: "Save product" }).click();
  await expect(page.getByRole("row", { name: /^First product/ })).toContainText("$49.50");

  await goto(page, "/bills");
  await page.getByRole("button", { name: "Add bill" }).first().click();
  await chooseInPicker(page, "Supplier", "First Co");
  await page.getByRole("dialog").getByLabel("Bill number").fill("FIRST-1");
  await page.getByRole("dialog").getByLabel("Category").selectOption("Office");
  await page.getByRole("dialog").getByLabel("Amount").fill("120");
  await page.getByRole("dialog").getByRole("button", { name: "Save bill" }).click();
  await expect(page.getByRole("row", { name: /^First Co/ })).toContainText("$120.00");

  await goto(page, "/deals");
  await page.getByRole("link", { name: "First deal" }).click();
  await page.getByRole("region", { name: "Quotes" }).getByRole("link", { name: "New quote" }).click();
  await addFirstProduct(page, "Add product");
  await page.getByRole("button", { name: "Save quote" }).first().click();
  await expect(page.getByText("Quote saved.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "QT-0001" })).toBeVisible();

  // An invoice needs a won deal (V4).
  await page.getByRole("link", { name: "First deal" }).first().click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Stage").selectOption("won");
  await page.getByRole("dialog").getByRole("button", { name: "Save deal" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("region", { name: "Invoices" }).getByRole("button", { name: "New invoice" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Draft invoice" })).toBeVisible();
  await addFirstProduct(page, "Add line");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
});

/** The first product as a line on a quote's or an invoice's draft, from the button that adds one. */
async function addFirstProduct(page: Page, button: string) {
  await page.getByRole("button", { name: button }).click();
  await page.getByPlaceholder("Search products").fill("First product");
  await page.getByRole("option", { name: /^First product/ }).click();
}
