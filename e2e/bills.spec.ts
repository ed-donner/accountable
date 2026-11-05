import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { addBill, addOrganization, chooseInPicker, emptyDatabase, isoDay } from "./helpers";

// Bills from suppliers (E1 to E24), on a database holding only what each test adds.

test.beforeEach(emptyDatabase);

const TAKEN = "This supplier already has a bill with this number";
const CATEGORIES = ["software", "contractors", "travel", "office", "marketing", "other"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function heading(page: Page, name: string) {
  return page.getByRole("heading", { level: 1, name });
}

function dialog(page: Page) {
  return page.getByRole("dialog");
}

function row(page: Page, supplier: string) {
  return page.getByRole("row", { name: new RegExp(`^${supplier}`) });
}

function suppliers(page: Page) {
  return page.locator("tbody tr td:first-child");
}

function details(page: Page) {
  return page.getByRole("region", { name: "Details" });
}

/** The page title with its chip and its Edit, Mark paid or Mark unpaid, and Delete buttons. */
function pageHeader(page: Page) {
  return page.getByRole("main").getByRole("heading", { level: 1 }).locator("xpath=..");
}

/** A plain date as the app shows it, such as Nov 3, 2026. */
function shown(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function dollars(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function moneyFigure(page: Page, label: RegExp) {
  return page.getByRole("region", { name: "Money" }).getByRole("link", { name: label });
}

test("a bill can be added, edited, marked paid and unpaid, and deleted", async ({ page, request }) => {
  await addOrganization(request, "Northwind Software");
  await page.goto("/bills");
  await expect(page.getByText("No bills yet. Add the first one.")).toBeVisible();

  await page.getByRole("button", { name: "Add bill" }).first().click();
  await chooseInPicker(page, "Supplier", "Northwind Software");
  await dialog(page).getByLabel("Bill number").fill("INV-0042");
  await dialog(page).getByLabel("Category").selectOption("Software");
  await dialog(page).getByLabel("Bill date").fill(isoDay(-10));
  await expect(dialog(page).getByLabel("Due date")).toHaveValue(isoDay(20));
  await dialog(page).getByLabel("Amount").fill("1,240");
  await dialog(page).getByLabel("Tax").fill("110.05");
  await expect(dialog(page).getByTestId("bill-total")).toHaveText("Total$1,350.05");
  await dialog(page).getByRole("button", { name: "Save bill" }).click();
  await expect(page.getByText("Bill saved.")).toBeVisible();
  await expect(row(page, "Northwind Software")).toContainText("$1,350.05");
  await expect(row(page, "Northwind Software")).toContainText(shown(isoDay(20)));

  await row(page, "Northwind Software").getByRole("link", { name: "Northwind Software" }).click();
  await expect(heading(page, "Bill INV-0042")).toBeVisible();
  await expect(details(page)).toContainText("$1,350.05");
  await expect(details(page)).toContainText("Not paid yet");

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(dialog(page).getByLabel("Due date")).toHaveValue(isoDay(20));
  await dialog(page).getByLabel("Due date").fill(isoDay(25));
  await dialog(page).getByRole("button", { name: "Save bill" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(details(page)).toContainText(shown(isoDay(25)));

  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Bills" }).click();
  await page.getByRole("button", { name: "Mark paid bill INV-0042 from Northwind Software" }).click();
  await expect(dialog(page).getByLabel("Paid on")).toHaveValue(isoDay());
  await dialog(page).getByLabel("Paid on").fill(isoDay(-3));
  await dialog(page).getByRole("button", { name: "Mark paid" }).click();
  await expect(page.getByText("Bill marked paid.")).toBeVisible();
  await expect(page.getByText("No unpaid bills.")).toBeVisible();

  await page.getByRole("button", { name: /^Paid/ }).click();
  await expect(suppliers(page)).toHaveText(["Northwind Software"]);
  await row(page, "Northwind Software")
    .getByRole("button", { name: /^Mark unpaid/ })
    .click();
  await expect(page.getByText("Bill marked unpaid.")).toBeVisible();
  await expect(page.getByText("No paid bills.")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(suppliers(page)).toHaveText(["Northwind Software"]);

  await row(page, "Northwind Software").getByRole("link", { name: "Northwind Software" }).click();
  await expect(details(page)).toContainText(shown(isoDay(-3)));
  await pageHeader(page).getByRole("button", { name: "Mark unpaid" }).click();
  await expect(details(page)).toContainText("Not paid yet");
  await expect(pageHeader(page).getByRole("button", { name: "Mark paid" })).toBeVisible();

  await pageHeader(page).getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Delete bill INV-0042 from Northwind Software?");
  await expect(confirm).toContainText("It will leave the dashboard's Money section. This can't be undone.");
  await confirm.getByRole("button", { name: "Delete bill" }).click();
  await expect(page.getByText("Bill deleted.")).toBeVisible();
  await expect(heading(page, "Bills")).toBeVisible();
  await expect(page.getByText("No bills yet. Add the first one.")).toBeVisible();
});

test("a number can't be used twice for one supplier, through the page or the API", async ({
  page,
  request,
  expectConsoleError,
}) => {
  expectConsoleError(/status of 422.*\/api\/bills/);
  const northwind = await addOrganization(request, "Northwind Software");
  const kingsgate = await addOrganization(request, "Kingsgate Properties");
  await addBill(request, { organization_id: northwind.id, bill_number: "INV-0042" });
  await page.goto("/bills");
  await expect(suppliers(page)).toHaveText(["Northwind Software"]);

  await page.getByRole("button", { name: "Add bill" }).click();
  await chooseInPicker(page, "Supplier", "Northwind Software");
  await dialog(page).getByLabel("Bill number").fill("inv-0042");
  await dialog(page).getByLabel("Category").selectOption("Office");
  await dialog(page).getByLabel("Amount").fill("10");
  await dialog(page).getByRole("button", { name: "Save bill" }).click();
  await expect(dialog(page).getByText(TAKEN)).toBeVisible();
  await expect(dialog(page).getByLabel("Bill number")).toHaveAttribute("aria-invalid", "true");

  const reply = await request.post("/api/bills", {
    data: {
      organization_id: northwind.id,
      bill_number: "Inv-0042",
      bill_date: isoDay(),
      amount_cents: 1,
      category: "office",
    },
  });
  expect(reply.status()).toBe(422);
  expect(await reply.json()).toEqual({ detail: "Check the form.", fields: { bill_number: TAKEN } });

  await chooseInPicker(page, "Supplier", "Kingsgate Properties");
  await dialog(page).getByRole("button", { name: "Save bill" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(suppliers(page)).toHaveText(["Northwind Software", "Kingsgate Properties"]);
  const kingsgates = await (await request.get(`/api/bills?organization_id=${kingsgate.id}`)).json();
  expect(kingsgates.map((bill: { bill_number: string }) => bill.bill_number)).toEqual(["inv-0042"]);
});

test("an unpaid bill past its due date shows as overdue in the list, on its page and on the dashboard", async ({
  page,
  request,
}) => {
  const supplier = await addOrganization(request, "Kingsgate Properties");
  const late = await addBill(request, {
    organization_id: supplier.id,
    bill_number: "KP-2610",
    bill_date: isoDay(-31),
    due_date: isoDay(-1),
    amount_cents: 450000,
    category: "office",
  });
  await addBill(request, { organization_id: supplier.id, bill_number: "KP-2611", due_date: isoDay(), amount_cents: 1 });

  await page.goto("/bills");
  await expect(row(page, "Kingsgate Properties").first().getByText("Overdue")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Overdue/ })).toHaveAccessibleName("Overdue (1)");
  await page.getByRole("button", { name: /^Overdue/ }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("KP-2610");

  await page.goto(`/bills/${late.id}`);
  await expect(pageHeader(page).getByText("Overdue")).toBeVisible();

  await page.goto("/");
  await expect(moneyFigure(page, /^Overdue/)).toContainText("$4,500.00");
  await expect(moneyFigure(page, /^Overdue/)).toContainText("1 bill");
  await expect(moneyFigure(page, /^What we owe/)).toContainText("$4,500.01");
  await moneyFigure(page, /^Overdue/).click();
  await expect(page).toHaveURL(/\/bills\?status=overdue$/);
  await expect(page.locator("tbody tr")).toHaveCount(1);
});

test("the Money section matches the bills", async ({ page, request }) => {
  const supplier = await addOrganization(request, "Northwind Software");
  const bills = [
    { bill_number: "A", bill_date: isoDay(-31), amount_cents: 10000, tax_cents: 0, category: "software" },
    { bill_number: "B", bill_date: isoDay(-30), amount_cents: 20000, tax_cents: 1775, category: "travel" },
    { bill_number: "C", bill_date: isoDay(), amount_cents: 30000, tax_cents: 0, category: "office" },
    { bill_number: "D", bill_date: isoDay(1), amount_cents: 40000, tax_cents: 0, category: "marketing" },
    {
      bill_number: "E",
      bill_date: isoDay(-20),
      amount_cents: 50000,
      tax_cents: 0,
      category: "contractors",
      paid_on: isoDay(),
    },
  ];
  for (const bill of bills) await addBill(request, { organization_id: supplier.id, ...bill });

  await page.goto("/");
  const money = page.getByRole("region", { name: "Money" });
  // Due yesterday, today, in 30 days and in 31, with the last paid.
  await expect(moneyFigure(page, /^What we owe/)).toHaveText("What we owe$1,017.754 unpaid bills");
  await expect(moneyFigure(page, /^Overdue/)).toHaveText("Overdue$100.001 bill");
  await expect(money.getByTestId("due-total")).toHaveText("$517.75");
  await expect(money.getByRole("region", { name: "Bills to pay" })).toContainText("2 bills");
  const dueTable = money.getByRole("table", { name: "Bills due in the next 30 days" });
  await expect(dueTable.locator("tbody tr")).toHaveText([
    `${shown(isoDay())}Northwind SoftwareBTravel$217.75`,
    `${shown(isoDay(30))}Northwind SoftwareCOffice$300.00`,
  ]);

  // Each month's spending, by the month of each bill's bill date, paid or not, with tax.
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, back) => new Date(now.getFullYear(), now.getMonth() - 11 + back, 1));
  const rows = months.map((month, index) => {
    const spent = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
    for (const bill of bills) {
      const [year, number] = bill.bill_date.split("-").map(Number);
      if (year === month.getFullYear() && number === month.getMonth() + 1) {
        spent[bill.category] += bill.amount_cents + bill.tax_cents;
      }
    }
    const total = Object.values(spent).reduce((sum, cents) => sum + cents, 0);
    const label = MONTH_LABELS[month.getMonth()] + (index === 11 ? " so far" : "");
    return label + CATEGORIES.map((category) => dollars(spent[category])).join("") + dollars(total);
  });
  const spendingTable = money.getByRole("table", { name: "Spending by category for the last 12 months" });
  await expect(spendingTable.locator("tbody tr")).toHaveText(rows);
});

test("an organization's page lists its bills and can't delete it while it has them", async ({ page, request }) => {
  const supplier = await addOrganization(request, "Northwind Software");
  await addBill(request, {
    organization_id: supplier.id,
    bill_number: "NS-1",
    bill_date: isoDay(-40),
    due_date: isoDay(-10),
    amount_cents: 110000,
  });
  await addBill(request, { organization_id: supplier.id, bill_number: "NS-2", amount_cents: 310000 });
  await addBill(request, {
    organization_id: supplier.id,
    bill_number: "NS-0",
    bill_date: isoDay(-60),
    amount_cents: 99,
    paid_on: isoDay(-50),
  });

  await page.goto(`/organizations/${supplier.id}`);
  const panel = page.getByRole("region", { name: "Bills" });
  await expect(panel.getByRole("link")).toHaveText(["NS-1", "NS-2", "NS-0"]);
  await expect(panel).toContainText("$4,200.00 unpaid, $1,100.00 of it overdue");

  await panel.getByRole("button", { name: "Add bill" }).click();
  await expect(dialog(page).getByRole("combobox", { name: "Supplier" })).toHaveText("Northwind Software");
  await dialog(page).getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("main").getByRole("button", { name: "Delete", exact: true }).click();
  const refusal = page.getByRole("alertdialog");
  await expect(refusal.getByRole("heading")).toHaveText("Northwind Software can't be deleted");
  await expect(refusal).toContainText("This organization has 3 bills, so it can't be deleted.");
  await expect(refusal.getByRole("button")).toHaveText(["Close"]);
  await refusal.getByRole("button", { name: "Close" }).click();
  expect((await request.get(`/api/organizations/${supplier.id}`)).status()).toBe(200);
});

test("the table keeps its search, sort, filter and page, and says what its filter leaves out", async ({
  page,
  request,
}) => {
  const supplier = await addOrganization(request, "Cloudline Hosting");
  for (let number = 1; number <= 54; number += 1) {
    await addBill(request, {
      organization_id: supplier.id,
      bill_number: `CLH-${String(number).padStart(2, "0")}`,
      amount_cents: number * 100,
      paid_on: number % 9 === 0 ? isoDay() : undefined,
    });
  }
  await page.goto("/bills");
  await expect(page.getByRole("button", { name: /^Unpaid/ })).toHaveAccessibleName("Unpaid (48)");

  await page.getByRole("button", { name: /^All/ }).click();
  await page.getByRole("searchbox", { name: "Search bills" }).fill("clh");
  await page.getByRole("button", { name: "Total" }).click();
  await page.getByRole("button", { name: "Total" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("51-54 of 54")).toBeVisible();
  const numbers = page.locator("tbody tr td:nth-child(2)");
  await expect(numbers).toHaveText(["CLH-04", "CLH-03", "CLH-02", "CLH-01"]);
  const view = page.url();

  await page.locator("tbody tr").first().getByRole("link").click();
  await expect(heading(page, "Bill CLH-04")).toBeVisible();
  await page.goBack();

  await expect(page).toHaveURL(view);
  await expect(numbers).toHaveText(["CLH-04", "CLH-03", "CLH-02", "CLH-01"]);
  await expect(page.getByRole("searchbox", { name: "Search bills" })).toHaveValue("clh");
  await expect(page.getByRole("button", { name: /^All/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("columnheader", { name: "Total" })).toHaveAttribute("aria-sort", "descending");

  await page.goto("/bills?q=CLH-27");
  await expect(page.getByText('No unpaid bills match "CLH-27". 1 bill matches under All.')).toBeVisible();
  await page.getByRole("button", { name: "Show all bills" }).click();
  await expect(numbers).toHaveText(["CLH-27"]);

  await page.goto("/bills?status=paid&q=zzz");
  await expect(page.getByText('No paid bills match "zzz".')).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page).toHaveURL(/\/bills\?status=paid$/);
  await expect(page.locator("tbody tr")).toHaveCount(6);
});

test("a bill's page says who added it and who marked it paid", async ({ page, request, requestAs }) => {
  const supplier = await addOrganization(request, "Northwind Software");
  const bill = await addBill(request, { organization_id: supplier.id, bill_number: "NS-1" });
  const dana = await requestAs("Dana Whitfield");
  const paid = await dana.patch(`/api/bills/${bill.id}`, { data: { paid_on: isoDay() } });
  expect(paid.ok()).toBe(true);

  await page.goto(`/bills/${bill.id}`);
  await expect(details(page)).toContainText(`Added by Alex Rivera on ${shown(isoDay())}`);
  await expect(details(page)).toContainText(`Last changed by Dana Whitfield on ${shown(isoDay())}`);
  await expect(pageHeader(page).getByText("Paid", { exact: true })).toBeVisible();
});
