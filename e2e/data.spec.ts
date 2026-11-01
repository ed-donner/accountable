import { expect, test } from "./fixtures";
import {
  COPY_URL,
  card,
  cardOrder,
  chooseInPicker,
  dataCommand,
  dropAbove,
  makeCopyFolder,
  startCopy,
  type AppCopy,
} from "./helpers";

test.describe.configure({ mode: "serial", timeout: 120_000 });

const COPY_API = `${COPY_URL}/api`;
const SCREENS = ["/", "/organizations", "/contacts", "/deals", "/pipeline"];

let folder: ReturnType<typeof makeCopyFolder>;
let copy: AppCopy;

test.beforeAll(async () => {
  folder = makeCopyFolder();
  copy = await startCopy(folder.database);
});

test.afterAll(async () => {
  await copy.stop();
  folder.remove();
});

async function restart() {
  await copy.stop();
  copy = await startCopy(folder.database);
}

async function goto(page: import("@playwright/test").Page, path: string) {
  await page.goto(`${COPY_URL}${path}`);
}

test("changes survive a restart, including a card's place on the board", async ({ page, request }) => {
  await goto(page, "/pipeline");
  const order = await (async () => {
    await expect(page.locator("[data-deal]").first()).toBeVisible();
    return cardOrder(page, "negotiation");
  })();
  const [first, second, third] = order as string[];

  await dropAbove(page, third, first);
  await expect.poll(() => cardOrder(page, "negotiation")).toEqual([third, first, second, ...(order.slice(3) as string[])]);
  await page.waitForLoadState("networkidle");

  await request.post(`${COPY_API}/organizations`, { data: { name: "Survives Restart Ltd" } });

  await restart();

  await goto(page, "/pipeline");
  await expect(card(page, third)).toBeVisible();
  expect((await cardOrder(page, "negotiation")).slice(0, 3)).toEqual([third, first, second]);

  await goto(page, "/organizations?q=survives");
  await expect(page.locator("tbody tr")).toHaveCount(1);
});

test("without yes, nothing is wiped", async ({ request }) => {
  const before = (await (await request.get(`${COPY_API}/deals`)).json()).length;
  expect(before).toBeGreaterThan(0);

  const declined = dataCommand(folder.database, "empty", [], "no\n");
  expect(declined).toContain("deals");
  expect(declined).toContain("Nothing was changed.");

  const unanswered = dataCommand(folder.database, "seed");
  expect(unanswered).toContain("Nothing was changed.");

  expect((await (await request.get(`${COPY_API}/deals`)).json()).length).toBe(before);
});

test("npm run seed with the app running brings back the sample data, and a refresh shows it", async ({ page }) => {
  await goto(page, "/organizations?q=survives");
  await expect(page.locator("tbody tr")).toHaveCount(1);

  expect(dataCommand(folder.database, "seed", ["--yes"])).toContain("Sample data restored.");

  await page.reload();
  await expect(page.getByText("No organizations match.")).toBeVisible();

  await goto(page, "/organizations");
  await expect(page.locator("tbody tr")).toHaveCount(24);
});

test("npm run empty with the app running leaves every screen working and inviting the first record", async ({ page }) => {
  await goto(page, "/deals");
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
});

test("an emptied database stays empty after a restart", async ({ page }) => {
  await restart();
  await goto(page, "/deals");
  await expect(page.getByText("No deals yet. Add the first one.")).toBeVisible();
});

test("from an empty database, the first organization, contact and deal can be added", async ({ page }) => {
  await goto(page, "/organizations");
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
