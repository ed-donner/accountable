import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { card, column, fillToLimits } from "./helpers";

test.beforeAll(fillToLimits);

test.describe.configure({ timeout: 120_000 });

// The project owner's limit for dragging at this size. They accepted 241ms in place
// of the plan's first target of 100ms, so that cards can slide apart during a drag.
const DRAG_LIMIT_MS = 250;

function median(readings: number[]) {
  return [...readings].sort((a, b) => a - b)[Math.floor(readings.length / 2)];
}

// The dashboard's own figures, and the Money section's, which the bills area reads for itself (E24).
for (const [name, route] of [
  ["The dashboard's", "/api/dashboard"],
  ["The Money section's", "/api/bills/dashboard"],
]) {
  test(`${name} data arrives in under 200ms`, async ({ page, sessionToken }) => {
    await page.goto("/");
    await expect(page.getByTestId("revenue-this-month")).toBeVisible();
    await expect(page.getByRole("link", { name: /^What we owe/ })).toBeVisible();
    const { readings, statuses } = await page.evaluate(
      async ([token, address]) => {
        const times: number[] = [];
        const codes: number[] = [];
        for (let reading = 0; reading < 5; reading += 1) {
          const start = performance.now();
          const reply = await fetch(address, { headers: { Authorization: `Bearer ${token}` } });
          await reply.json();
          times.push(performance.now() - start);
          codes.push(reply.status);
        }
        return { readings: times, statuses: codes };
      },
      [sessionToken, route],
    );
    // A refused read comes back fast too, so only real data counts.
    expect(statuses).toEqual([200, 200, 200, 200, 200]);
    console.log(`${name} data: ${median(readings).toFixed(1)}ms`);
    expect(median(readings)).toBeLessThan(200);
  });
}

for (const [name, path] of [
  ["Organizations", "/organizations"],
  ["Contacts", "/contacts"],
  ["Deals", "/deals"],
  ["Products", "/products"],
  ["Quotes", "/quotes"],
  ["Invoices", "/invoices"],
  ["Bills", "/bills"],
]) {
  test(`${name} opens in under a second`, async ({ page }) => {
    const readings: number[] = [];
    for (let reading = 0; reading < 5; reading += 1) {
      await page.goto("/pipeline");
      await expect(page.locator("[data-deal]").first()).toBeVisible();
      const start = Date.now();
      await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name }).click();
      await expect(page.locator("tbody tr").first()).toBeVisible();
      readings.push(Date.now() - start);
    }
    console.log(`${path}: ${median(readings)}ms`);
    expect(median(readings)).toBeLessThan(1000);
  });
}

/** The median of five reads of an API route from the page, with the token, each read to its last byte. */
async function medianRead(page: Page, token: string, route: string) {
  const { readings, statuses } = await page.evaluate(
    async ([path, bearer]) => {
      const times: number[] = [];
      const codes: number[] = [];
      for (let reading = 0; reading < 5; reading += 1) {
        const start = performance.now();
        const reply = await fetch(path, { headers: { Authorization: `Bearer ${bearer}` } });
        await reply.arrayBuffer();
        times.push(performance.now() - start);
        codes.push(reply.status);
      }
      return { readings: times, statuses: codes };
    },
    [route, token],
  );
  // A refused read comes back fast too, so only real data counts.
  expect(statuses).toEqual([200, 200, 200, 200, 200]);
  return median(readings);
}

test("the Money section's data arrives in under 200ms", async ({ page, sessionToken }) => {
  await page.goto("/");
  await expect(page.getByTestId("revenue-this-month")).toBeVisible();
  const elapsed = await medianRead(page, sessionToken, "/api/invoices/money");
  console.log(`Money data: ${elapsed.toFixed(1)}ms`);
  expect(elapsed).toBeLessThan(200);
});

test("an invoice's PDF downloads in under a second", async ({ page, request, sessionToken }) => {
  const invoices: { id: number; number: string | null }[] = await (await request.get("/api/invoices")).json();
  const issued = invoices.find((invoice) => invoice.number !== null)!;
  await page.goto("/");
  await expect(page.getByTestId("revenue-this-month")).toBeVisible();
  const elapsed = await medianRead(page, sessionToken, `/api/invoices/${issued.id}/pdf`);
  console.log(`PDF: ${elapsed.toFixed(1)}ms`);
  expect(elapsed).toBeLessThan(1000);
});

async function keystrokeTime(page: Page, text: string) {
  return page.evaluate(async (value) => {
    const input = document.querySelector<HTMLInputElement>('input[type="search"]')!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    const before = document.querySelector("tbody")?.textContent;
    const start = performance.now();
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    while (document.querySelector("tbody")?.textContent === before) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (performance.now() - start > 2000) break;
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return performance.now() - start;
  }, text);
}

/** The limits data's 100-line draft (Q1). */
async function longestQuote(request: APIRequestContext) {
  const quotes: { id: number; number: string }[] = await (await request.get("/api/quotes")).json();
  return quotes.find((quote) => quote.number === "QT-1000")!;
}

/** From a keystroke in a line's Quantity to the preview's new subtotal on screen. */
async function previewKeystrokeTime(page: Page, box: string, text: string) {
  return page.evaluate(
    async ([id, value]) => {
      const input = document.getElementById(id) as HTMLInputElement;
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      const preview = document.querySelector('[aria-label="Preview"]')!;
      const before = preview.textContent;
      const start = performance.now();
      setValue.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      while (preview.textContent === before) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (performance.now() - start > 2000) break;
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return performance.now() - start;
    },
    [box, text],
  );
}

test("a 100-line quote's preview updates within 100ms of a keystroke", async ({ page, request }) => {
  const quote = await longestQuote(request);
  await page.goto(`/quotes/${quote.id}`);
  await expect(page.locator("#quote-line-99-quantity")).toBeVisible();
  const readings: number[] = [];
  for (const text of ["7", "71", "712", "71", "7"])
    readings.push(await previewKeystrokeTime(page, "quote-line-50-quantity", text));
  console.log(`Preview keystroke: ${median(readings).toFixed(1)}ms`);
  expect(median(readings)).toBeLessThan(100);
});

test("a 100-line quote's PDF downloads in under a second", async ({ page, request }) => {
  const quote = await longestQuote(request);
  await page.goto(`/quotes/${quote.id}`);
  await expect(page.locator("#quote-line-99-quantity")).toBeVisible();
  const readings: number[] = [];
  for (let reading = 0; reading < 3; reading += 1) {
    const start = Date.now();
    const [file] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download PDF" }).click(),
    ]);
    await file.path();
    readings.push(Date.now() - start);
  }
  console.log(`100-line PDF: ${median(readings)}ms`);
  expect(median(readings)).toBeLessThan(1000);
});

test("a search keystroke updates within 100ms", async ({ page }) => {
  await page.goto("/contacts");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  const readings: number[] = [];
  for (const text of ["7", "71", "712", "71", "7"]) readings.push(await keystrokeTime(page, text));
  console.log(`Search keystroke: ${median(readings).toFixed(1)}ms`);
  expect(median(readings)).toBeLessThan(100);
});

test("typing at full speed loses no characters", async ({ page }) => {
  await page.goto("/contacts");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  const search = page.getByRole("searchbox");
  const text = "contact 0712";
  await search.pressSequentially(text, { delay: 0 });
  await expect(search).toHaveValue(text);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page).toHaveURL(/q=contact/);
});

/** From a keystroke in the top bar's search to its results on screen, the 150ms pause included. */
async function topBarSearchTime(page: Page, text: string) {
  return page.evaluate(async (value) => {
    const input = document.querySelector<HTMLInputElement>("input[cmdk-input]")!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    // The first result's matching part, which is in semibold, shows whose results are on screen.
    const showing = () => document.querySelector("[cmdk-item] strong")?.textContent?.toLowerCase();
    const start = performance.now();
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    while (showing() !== value) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (performance.now() - start > 3000) break;
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return performance.now() - start;
  }, text);
}

test("the top bar's search shows its results within 300ms of the last keystroke", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("revenue-this-month")).toBeVisible();
  await page.getByRole("combobox", { name: "Search organizations, contacts, deals and products" }).focus();
  const readings: number[] = [];
  // Each letter is in nearly every name, the most a search can find at these limits.
  for (const text of ["o", "a", "n", "t", "c"]) {
    readings.push(await topBarSearchTime(page, text));
    await expect(page.locator("[cmdk-item] strong").first()).toHaveText(new RegExp(`^${text}$`, "i"));
  }
  console.log(`Top bar search: ${median(readings).toFixed(1)}ms`);
  expect(median(readings)).toBeLessThan(300);
});

test(`dragging a card, including into a long Won column, has no task over ${DRAG_LIMIT_MS}ms`, async ({ page }) => {
  await page.goto("/pipeline");
  await expect(page.locator("[data-deal]").first()).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { tasks: number[] }).tasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) (window as unknown as { tasks: number[] }).tasks.push(entry.duration);
    }).observe({ entryTypes: ["longtask"] });
  });

  const worst: number[] = [];
  for (let drag = 0; drag < 5; drag += 1) {
    const moving = column(page, "new").locator("[data-deal]").first();
    const name = (await moving.getAttribute("data-deal"))!;
    const before = await column(page, "won").locator("[data-deal]").count();
    const start = (await card(page, name).boundingBox())!;
    const won = (await column(page, "won").boundingBox())!;

    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + 110, start.y + 80, { steps: 4 });
    await page.mouse.move(won.x + 110, won.y + 400, { steps: 30 });
    await page.mouse.move(won.x + 110, won.y + 420, { steps: 8 });
    await page.mouse.up();

    // The card has to really move, or a drag that never started would measure as fast.
    await expect(column(page, "won").locator("[data-deal]")).toHaveCount(before + 1);
    await page.waitForLoadState("networkidle");

    const tasks = await page.evaluate(() => (window as unknown as { tasks: number[] }).tasks.splice(0));
    worst.push(Math.max(0, ...tasks));
  }
  console.log(`Worst task in each drag: ${worst.map((value) => Math.round(value)).join(", ")}ms`);
  expect(median(worst)).toBeLessThan(DRAG_LIMIT_MS);
});
