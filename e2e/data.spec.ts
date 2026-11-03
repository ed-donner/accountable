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

const SCREENS = ["/", "/organizations", "/contacts", "/deals", "/pipeline"];
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
  await expect(page.locator("tbody tr")).toHaveCount(24);

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
  await goto(page, "/");
  await expect(page.getByText("No follow-ups due.")).toBeVisible();
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

test("from an empty database, the first organization, contact and deal can be added", async ({ page }) => {
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
});
