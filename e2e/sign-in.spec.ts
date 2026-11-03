import type { Page, Request } from "@playwright/test";

import { expect, test } from "./fixtures";
import { SESSION_KEY, SIGNED_IN, addLinkedDeal, addOrganization, chooseTeammate } from "./helpers";

const TEAMMATES = [
  { name: "Alex Rivera", email: "alex.rivera@accountable.example", initials: "AR" },
  { name: "Dana Whitfield", email: "dana.whitfield@accountable.example", initials: "DW" },
  { name: "Theo Brandt", email: "theo.brandt@accountable.example", initials: "TB" },
];
const ROBIN = "robin@accountable.example";

function signInHeading(page: Page) {
  return page.getByRole("heading", { level: 1, name: "Sign in" });
}

function pageHeading(page: Page) {
  return page.getByRole("heading", { level: 1 });
}

function topBar(page: Page) {
  return page.getByRole("navigation", { name: "Sections" });
}

async function expectSignInScreen(page: Page) {
  await expect(signInHeading(page)).toBeVisible();
  await expect(topBar(page)).toHaveCount(0);
  await expect(page.getByRole("banner")).toHaveCount(0);
}

function menuButton(page: Page) {
  return page.getByRole("button", { name: /^Menu for / });
}

async function signOut(page: Page) {
  await menuButton(page).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
}

function savedToken(page: Page) {
  return page.evaluate((key) => localStorage.getItem(key), SESSION_KEY);
}

/** Holds back the page's reads of these API paths until the returned function is called. */
async function holdReads(page: Page, paths: string[]) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    (url) => paths.includes(url.pathname),
    async (route) => {
      await held;
      await route.continue();
    },
  );
  return release;
}

function readOf(path: string) {
  return (request: Request) => request.method() === "GET" && new URL(request.url()).pathname === path;
}

test.describe("signed out", () => {
  test.use({ signedIn: false });

  for (const [where, address, opens] of [
    ["the Dashboard", "/", "Dashboard"],
    ["an unknown address", "/no/such/page", "This page no longer exists"],
  ]) {
    test(`${where} shows the sign-in screen, then opens once signed in`, async ({ page }) => {
      await page.goto(address);
      await expectSignInScreen(page);

      await chooseTeammate(page, "Alex Rivera");

      await expect(pageHeading(page)).toHaveText(opens);
      await expect(topBar(page)).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(address);
    });
  }

  test("a deal's address shows the sign-in screen, then the deal once signed in", async ({ page, request }) => {
    const { deal } = await addLinkedDeal(request, "Linked from an email");
    await page.goto(`/deals/${deal.id}`);
    await expectSignInScreen(page);

    await chooseTeammate(page, "Dana Whitfield");

    await expect(pageHeading(page)).toHaveText("Linked from an email");
    expect(new URL(page.url()).pathname).toBe(`/deals/${deal.id}`);
  });

  test("the screen lists the four made-up teammates", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("This is a local copy with made-up data. Choose who to sign in as.")).toBeVisible();
    const buttons = page.getByRole("main").getByRole("button");
    await expect(buttons).toHaveCount(4);

    for (const { name, email, initials } of TEAMMATES) {
      const button = page.getByRole("button", { name: `${name} ${email}` });
      await expect(button.getByText(initials, { exact: true })).toBeVisible();
    }
    // Robin has no display name, so the email stands in for it, shown once.
    const robin = page.getByRole("button", { name: ROBIN, exact: true });
    await expect(robin.getByText("R", { exact: true })).toBeVisible();
    await expect(robin.getByText(ROBIN)).toHaveCount(1);
  });

  test("the sign-in screen opens in the saved theme, with no menu to change it", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("accountable-mode", "dark"));
    await page.goto("/");
    await expect(signInHeading(page)).toBeVisible();

    await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(4, 35, 46)");
    await expect(page.locator("body")).toHaveCSS("color", "rgb(205, 216, 219)");
    await expect(page.getByRole("main").locator(":scope > div")).toHaveCSS("background-color", "rgb(11, 50, 64)");
    await expect(page.getByRole("button", { name: /^Menu for / })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /mode$/ })).toHaveCount(0);
  });
});

test("signed in, a reload and a new tab stay signed in", async ({ page, context }) => {
  await page.goto("/organizations");
  await expect(pageHeading(page)).toHaveText("Organizations");

  await page.reload();
  await expect(pageHeading(page)).toHaveText("Organizations");

  const tab = await context.newPage();
  await tab.goto("/contacts");
  await expect(pageHeading(tab)).toHaveText("Contacts");
  await expect(signInHeading(tab)).toHaveCount(0);
  await tab.close();
});

test("a token the backend refuses shows the sign-in screen, saying the session has ended", async ({
  page,
  expectConsoleError,
}) => {
  expectConsoleError(/status of 401/);
  await page.goto("/organizations");
  await expect(pageHeading(page)).toHaveText("Organizations");

  // As when the local copy's key changes under a saved session.
  await page.evaluate((key) => localStorage.setItem(key, "a-token-from-another-copy"), SESSION_KEY);
  await topBar(page).getByRole("link", { name: "Contacts" }).click();

  await expectSignInScreen(page);
  await expect(page.getByRole("alert")).toHaveText("Your session has ended. Sign in again.");
  expect(await savedToken(page)).toBeNull();

  await chooseTeammate(page, "Theo Brandt");
  await expect(pageHeading(page)).toHaveText("Contacts");
});

test.describe("signing out", () => {
  test("returns to the sign-in screen at the Dashboard's address", async ({ page, request }) => {
    const { deal } = await addLinkedDeal(request, "Open while signing out");
    await page.goto(`/deals/${deal.id}`);
    await expect(pageHeading(page)).toHaveText("Open while signing out");

    await signOut(page);

    await expectSignInScreen(page);
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(await savedToken(page)).toBeNull();

    await page.reload();
    await expectSignInScreen(page);
  });

  test("whoever signs in next sees nothing the first session read", async ({ page, request }) => {
    await addOrganization(request, "Read before signing out");
    await page.goto("/organizations");
    await expect(page.getByText("Read before signing out")).toBeVisible();
    await expect(menuButton(page)).toHaveAccessibleName(`Menu for ${SIGNED_IN.name}`);

    await signOut(page);
    // Kept from the first session, these would show while the new reads are held back.
    const release = await holdReads(page, ["/api/me", "/api/organizations"]);
    const askedWho = page.waitForRequest(readOf("/api/me"));
    await chooseTeammate(page, "Dana Whitfield");
    await askedWho;
    await expect(topBar(page)).toBeVisible();
    await expect(page.getByRole("button", { name: `Menu for ${SIGNED_IN.name}` })).toHaveCount(0);

    const askedForList = page.waitForRequest(readOf("/api/organizations"));
    await topBar(page).getByRole("link", { name: "Organizations" }).click();
    await askedForList;
    await expect(pageHeading(page)).toHaveText("Organizations");
    await expect(page.getByText("Read before signing out")).toHaveCount(0);

    release();
    await expect(menuButton(page)).toHaveAccessibleName("Menu for Dana Whitfield");
    await expect(page.getByText("Read before signing out")).toBeVisible();
  });

  test("other tabs show the sign-in screen straight away", async ({ page, context }) => {
    await page.goto("/organizations");
    await expect(pageHeading(page)).toHaveText("Organizations");
    const other = await context.newPage();
    await other.goto("/contacts");
    await expect(pageHeading(other)).toHaveText("Contacts");

    await signOut(page);

    await expectSignInScreen(other);
    await other.close();
  });
});
