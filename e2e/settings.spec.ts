import type { Page, Response } from "@playwright/test";

import { expect, test } from "./fixtures";
import { SESSION_KEY, SIGNED_IN, resetToSampleData, tokenFor } from "./helpers";

// Each test starts from the sample company, and no other spec reads the settings.
test.beforeEach(resetToSampleData);

const SAMPLE_COMPANY = {
  "Company name": "Plainsong Systems",
  Address: "48 Orchard Row, Suite 210\nBrooklyn, NY 11201",
  Email: "accounts@plainsong.example",
  Phone: "(718) 555-0142",
  "Tax label": "Sales tax",
  "Tax rate": "8.875",
  "Payment terms": "30",
  "Quote prefix": "QT-",
  "Invoice prefix": "INV-",
};
type Label = keyof typeof SAMPLE_COMPANY;

const CLASH = "Clashes with the quote prefix. Neither can start with the other, ignoring capitals";

/** Today's date as the page shows it, such as Nov 5, 2026. */
function today() {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function box(page: Page, label: Label) {
  return page.getByLabel(label, { exact: true });
}

function saveButton(page: Page) {
  return page.getByRole("button", { name: "Save settings" });
}

async function openSettings(page: Page) {
  await page.goto("/settings");
  await expect(box(page, "Company name")).toBeVisible();
}

async function expectValues(page: Page, values: Record<Label, string>) {
  for (const [label, value] of Object.entries(values)) {
    await expect(box(page, label as Label), label).toHaveValue(value);
  }
}

function isSettingsSave(response: Response) {
  return response.request().method() === "PATCH" && new URL(response.url()).pathname === "/api/settings";
}

/** Counts the saves the page sends from now on. */
function countSaves(page: Page) {
  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "PATCH" && new URL(request.url()).pathname === "/api/settings") sent.push(request.url());
  });
  return sent;
}

/** Saves with the button and waits for the backend's reply, and the message saying so. */
async function save(page: Page) {
  const saved = page.waitForResponse(isSettingsSave);
  await saveButton(page).click();
  const reply = await saved;
  expect(reply.ok(), await reply.text()).toBe(true);
  await expect(page.getByText("Settings saved.")).toBeVisible();
  return reply;
}

test("the menu opens Company settings, with no section marked as current", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await page
    .getByRole("banner")
    .getByRole("button", { name: `Menu for ${SIGNED_IN.name}` })
    .click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Company settings" }).click();

  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Company settings");
  await expect(page).toHaveTitle("Company settings | Accountable");
  await expectValues(page, SAMPLE_COMPANY);
  await expect(page.getByText(`Last changed by Dana Whitfield on ${today()}`)).toBeVisible();
  await expect(page.getByText("No company name yet.")).toHaveCount(0);
  const sections = page.getByRole("navigation", { name: "Sections" });
  await expect(sections.getByRole("link")).toHaveCount(8);
  await expect(sections.locator('[aria-current="page"]')).toHaveCount(0);
});

test("a save is seen by every teammate", async ({ page, browser, baseURL, request }) => {
  const changed: Record<Label, string> = {
    "Company name": "Harbour Light Consulting",
    Address: "12 Quay Street\nPortland, ME 04101",
    Email: "billing@harbourlight.example",
    Phone: "(207) 555-0117",
    "Tax label": "State sales tax",
    "Tax rate": "7.25",
    "Payment terms": "14",
    "Quote prefix": "EST-",
    "Invoice prefix": "BILL-",
  };
  await openSettings(page);
  for (const [label, value] of Object.entries(changed)) await box(page, label as Label).fill(value);

  await save(page);

  await expect(page.getByText(`Last changed by ${SIGNED_IN.name} on ${today()}`)).toBeVisible();
  await page.reload();
  await expectValues(page, changed);

  // Dana Whitfield, signed in on another browser.
  const token = await tokenFor(request, "Dana Whitfield");
  const elsewhere = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [{ origin: baseURL!, localStorage: [{ name: SESSION_KEY, value: token }] }] },
  });
  try {
    const danasPage = await elsewhere.newPage();
    await openSettings(danasPage);
    await expect(danasPage.getByRole("banner").getByRole("button", { name: "Menu for Dana Whitfield" })).toBeVisible();
    await expectValues(danasPage, changed);
    await expect(danasPage.getByText(`Last changed by ${SIGNED_IN.name} on ${today()}`)).toBeVisible();
  } finally {
    await elsewhere.close();
  }
});

test("out-of-range values are refused on the page, without sending anything", async ({ page }) => {
  await openSettings(page);
  const saves = countSaves(page);

  await box(page, "Company name").fill("");
  await box(page, "Tax rate").fill("150");
  await box(page, "Payment terms").fill("400");
  await box(page, "Invoice prefix").fill("inv-");
  await box(page, "Quote prefix").fill("INV-");
  await saveButton(page).click();

  await expect(box(page, "Company name")).toHaveAccessibleDescription("Enter the company name");
  await expect(box(page, "Tax rate")).toHaveAccessibleDescription("Enter a rate from 0 to 100%");
  await expect(box(page, "Payment terms")).toHaveAccessibleDescription("Enter a whole number of days from 0 to 365");
  await expect(box(page, "Invoice prefix")).toHaveAccessibleDescription(CLASH);
  await expect(box(page, "Quote prefix")).toHaveAccessibleDescription("Up to 10 letters, digits and hyphens.");
  await expect(page.getByText(CLASH)).toBeVisible();
  expect(saves).toEqual([]);

  await page.reload();
  await expectValues(page, SAMPLE_COMPANY);
});

test("the API refuses them too", async ({ request }) => {
  const before = await (await request.get("/api/settings")).json();
  const refused: [object, string, string][] = [
    [{ tax_rate: 150 }, "tax_rate", "Enter a rate from 0 to 100%"],
    [{ tax_rate: "8.8751" }, "tax_rate", "Use at most three decimal places"],
    [{ payment_terms_days: 400 }, "payment_terms_days", "Enter a whole number of days from 0 to 365"],
    [{ quote_prefix: "INV-", invoice_prefix: "inv-" }, "invoice_prefix", CLASH],
    [{ quote_prefix: "inv-" }, "invoice_prefix", CLASH],
    [{ company_name: " " }, "company_name", "Enter the company name"],
  ];
  for (const [body, field, message] of refused) {
    const reply = await request.patch("/api/settings", { data: body });
    expect(reply.status(), JSON.stringify(body)).toBe(422);
    expect(await reply.json(), JSON.stringify(body)).toEqual({
      detail: "Check the form.",
      fields: { [field]: message },
    });
  }
  expect(await (await request.get("/api/settings")).json()).toEqual(before);
});

test("the form fits at 1280 by 720, Enter in the address adds a line, and Enter in a box saves", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openSettings(page);
  await expect(saveButton(page)).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0);

  const saves = countSaves(page);
  await box(page, "Address").click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("USA");
  await expect(box(page, "Address")).toHaveValue(`${SAMPLE_COMPANY.Address}\nUSA`);
  expect(saves).toEqual([]);

  const saved = page.waitForResponse(isSettingsSave);
  await box(page, "Phone").press("Enter");
  const reply = await saved;
  expect((await reply.json()).address).toBe(`${SAMPLE_COMPANY.Address}\nUSA`);
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await expect(saveButton(page)).toBeInViewport({ ratio: 1 });
});
