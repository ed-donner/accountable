import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { addProduct, emptyDatabase } from "./helpers";

// The price list (G1 to G12), on a database holding only what each test adds.

test.beforeEach(emptyDatabase);

const TAKEN = "A product with this name already exists";
const ARCHIVED_TAKEN = "An archived product has this name. Restore it or choose another.";

function heading(page: Page, name: string) {
  return page.getByRole("heading", { level: 1, name });
}

/** The page title with its chip and its Edit, Archive and Restore buttons. */
function pageHeader(page: Page) {
  return page.getByRole("main").getByRole("heading", { level: 1 }).locator("xpath=..");
}

function row(page: Page, name: string) {
  return page.getByRole("row", { name: new RegExp(`^${name}`) });
}

function names(page: Page) {
  return page.locator("tbody tr td:first-child");
}

function dialog(page: Page) {
  return page.getByRole("dialog");
}

function showArchived(page: Page) {
  return page.getByRole("checkbox", { name: /^Show archived/ });
}

function searchBox(page: Page) {
  return page.getByRole("combobox", { name: "Search organizations, contacts, deals and products" });
}

function productResults(page: Page) {
  return page
    .getByRole("listbox", { name: "Search results" })
    .getByRole("group", { name: "Products" })
    .getByRole("option");
}

/** Today's date as the record pages show it, such as Nov 3, 2026. */
function today() {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

test("a product can be added, edited, found with the search box, archived and restored", async ({ page }) => {
  await page.goto("/products");
  await expect(page.getByText("No products yet. Add the first one.")).toBeVisible();

  await page.getByRole("button", { name: "Add product" }).first().click();
  await dialog(page).getByLabel("Name").fill("Rooftop survey");
  await dialog(page).getByLabel("Description").fill("Drone and ladder.\nWritten report within a week.");
  await dialog(page).getByLabel("Unit price").fill("1,250.5");
  await dialog(page).getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();
  await expect(row(page, "Rooftop survey")).toContainText("$1,250.50");

  await row(page, "Rooftop survey").getByRole("link", { name: "Rooftop survey" }).click();
  await expect(heading(page, "Rooftop survey")).toBeVisible();
  const details = page.getByRole("region", { name: "Details" });
  await expect(details).toContainText("$1,250.50");
  await expect(details).toContainText("Active");
  await expect(page.getByRole("region", { name: "Description" })).toHaveText(
    /Drone and ladder\.\s*Written report within a week\./,
  );

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(dialog(page).getByLabel("Unit price")).toHaveValue("1250.50");
  await dialog(page).getByLabel("Unit price").fill("$1,300");
  await dialog(page).getByRole("button", { name: "Save product" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(details).toContainText("$1,300.00");

  await searchBox(page).fill("ROOFTOP");
  await expect(productResults(page)).toHaveText(["Rooftop survey$1,300.00"]);
  await page.goto("/");
  await searchBox(page).fill("rooftop");
  await productResults(page).first().click();
  await expect(heading(page, "Rooftop survey")).toBeVisible();

  await pageHeader(page).getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("Product archived.")).toBeVisible();
  await expect(pageHeader(page).getByText("Archived")).toBeVisible();
  await expect(pageHeader(page).getByRole("button", { name: "Restore" })).toBeVisible();
  await searchBox(page).fill("rooftop");
  await expect(page.getByRole("status")).toHaveText('No organizations, contacts, deals or products match "rooftop".');
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Products" }).click();
  await expect(page.getByText("Every product is archived.")).toBeVisible();
  await showArchived(page).check();
  await row(page, "Rooftop survey").getByRole("button", { name: "Restore Rooftop survey" }).click();
  await expect(page.getByText("Product restored.")).toBeVisible();
  await expect(row(page, "Rooftop survey").getByRole("button", { name: "Archive Rooftop survey" })).toBeVisible();

  await searchBox(page).fill("rooftop");
  await expect(productResults(page)).toHaveText(["Rooftop survey$1,300.00"]);
});

test("a name can't be used twice, whatever its case, through the page or the API", async ({
  page,
  request,
  expectConsoleError,
}) => {
  expectConsoleError(/status of 422.*\/api\/products/);
  await addProduct(request, "Rooftop survey");
  await addProduct(request, "Label printer", { active: false });
  await page.goto("/products");
  await expect(row(page, "Rooftop survey")).toBeVisible();

  await page.getByRole("button", { name: "Add product" }).click();
  await dialog(page).getByLabel("Name").fill("ROOFTOP SURVEY");
  await dialog(page).getByLabel("Unit price").fill("10");
  await dialog(page).getByRole("button", { name: "Save product" }).click();
  await expect(dialog(page).getByText(TAKEN)).toBeVisible();
  await expect(dialog(page).getByLabel("Name")).toHaveAttribute("aria-invalid", "true");

  await dialog(page).getByLabel("Name").fill("label PRINTER");
  await dialog(page).getByRole("button", { name: "Save product" }).click();
  await expect(dialog(page).getByText(ARCHIVED_TAKEN)).toBeVisible();
  await dialog(page).getByRole("button", { name: "Cancel" }).click();

  const reply = await request.post("/api/products", { data: { name: "rooftop Survey", unit_price_cents: 1 } });
  expect(reply.status()).toBe(422);
  expect(await reply.json()).toEqual({ detail: "Check the form.", fields: { name: TAKEN } });

  await page.getByRole("button", { name: "Edit Rooftop survey" }).click();
  await dialog(page).getByLabel("Name").fill("ROOFTOP SURVEY");
  await dialog(page).getByRole("button", { name: "Save product" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "ROOFTOP SURVEY" })).toBeVisible();
  await expect(names(page)).toHaveText(["ROOFTOP SURVEY"]);
});

test("Restore on the message undoes an archive, after focus moved to the search box", async ({ page, request }) => {
  await addProduct(request, "Rooftop survey");
  await addProduct(request, "Training day");
  await page.goto("/products");
  await expect(names(page)).toHaveText(["Rooftop survey", "Training day"]);

  await page.getByRole("button", { name: "Archive Training day" }).click();
  await expect(names(page)).toHaveText(["Rooftop survey"]);
  await expect(page.getByRole("searchbox", { name: "Search products" })).toBeFocused();
  await expect(showArchived(page)).toHaveAccessibleName("Show archived (1)");

  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByText("Product restored.")).toBeVisible();
  await expect(names(page)).toHaveText(["Rooftop survey", "Training day"]);
});

test("the table keeps its search, sort, page and Show archived, and says when only archived products are left", async ({
  page,
  request,
}) => {
  for (let number = 1; number <= 54; number += 1) {
    await addProduct(request, `Seat ${String(number).padStart(2, "0")}`, {
      unit_price_cents: number * 100,
      active: number % 9 !== 0,
    });
  }
  await addProduct(request, "Training day");
  await page.goto("/products");
  await expect(showArchived(page)).toHaveAccessibleName("Show archived (6)");

  await page.getByRole("searchbox", { name: "Search products" }).fill("seat");
  await showArchived(page).check();
  await page.getByRole("button", { name: "Unit price" }).click();
  await page.getByRole("button", { name: "Unit price" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("51-54 of 54")).toBeVisible();
  await expect(names(page)).toHaveText(["Seat 04", "Seat 03", "Seat 02", "Seat 01"]);
  const view = page.url();

  await row(page, "Seat 02").getByRole("link", { name: "Seat 02" }).click();
  await expect(heading(page, "Seat 02")).toBeVisible();
  await page.goBack();

  await expect(page).toHaveURL(view);
  await expect(names(page)).toHaveText(["Seat 04", "Seat 03", "Seat 02", "Seat 01"]);
  await expect(page.getByRole("searchbox", { name: "Search products" })).toHaveValue("seat");
  await expect(showArchived(page)).toBeChecked();
  await expect(page.getByRole("columnheader", { name: "Unit price" })).toHaveAttribute("aria-sort", "descending");

  await page.goto("/products?q=Seat%2027");
  await expect(page.getByText("No products match. 1 archived product matches.")).toBeVisible();
  await page.getByRole("button", { name: "Show archived products" }).click();
  await expect(names(page)).toHaveText(["Seat 27Archived"]);

  await page.goto("/products?q=Seat%2027&archived=1");
  await page.getByRole("searchbox", { name: "Search products" }).fill("zzz");
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(showArchived(page)).toBeChecked();
  await expect(page.getByText("1-50 of 55")).toBeVisible();
});

test("every product archived says so, with a button that shows them", async ({ page, request }) => {
  await addProduct(request, "Label printer", { active: false });
  await addProduct(request, "Phone system starter pack", { active: false });
  await page.goto("/products");
  await expect(page.getByText("Every product is archived.")).toBeVisible();
  await page.getByRole("button", { name: "Show archived products" }).click();
  await expect(names(page)).toHaveText(["Label printerArchived", "Phone system starter packArchived"]);
  await expect(page).toHaveURL("/products?archived=1");
});

test("a product's page says who added it and who archived it", async ({ page, request, requestAs }) => {
  const product = await addProduct(request, "Rooftop survey");
  const dana = await requestAs("Dana Whitfield");
  expect((await dana.patch(`/api/products/${product.id}`, { data: { active: false } })).ok()).toBe(true);

  await page.goto(`/products/${product.id}`);
  const details = page.getByRole("region", { name: "Details" });
  await expect(details).toContainText(`Added by Alex Rivera on ${today()}`);
  await expect(details).toContainText(`Last changed by Dana Whitfield on ${today()}`);
  await expect(details).toContainText("Archived");
});
