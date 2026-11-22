import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures";

const column = (page: Page, name: string) => page.locator("section.col", { has: page.getByRole("heading", { name, exact: true }) });
const titles = (page: Page, name: string) => column(page, name).locator(".card .t").allTextContents();
const card = (page: Page, name: string) => page.locator(".board .card", { hasText: name });

/** A mouse drag in small steps, so dnd-kit sees it as a person would (R1). */
async function drag(page: Page, from: Locator, to: Locator, where: "above" | "below") {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 12, { steps: 4 });
  const y = where === "above" ? b.y + b.height * 0.2 : b.y + b.height * 0.8;
  await page.mouse.move(b.x + b.width / 2, y, { steps: 20 });
  await page.mouse.move(b.x + b.width / 2, y + 2, { steps: 4 });
  await page.mouse.up();
}

/**
 * Waits for the next card move to reach the server and checks it saved. Start it
 * before the drag or key press, then await it before a reload or navigation: the
 * board updates before the server answers (P6), and "network idle" returns at once
 * on a page that has already been idle, so neither shows the save has finished.
 */
function moveSaved(page: Page) {
  return page
    .waitForResponse((r) => r.request().method() === "POST" && /\/api\/deals\/\d+\/move$/.test(new URL(r.url()).pathname))
    .then((r) => expect(r.status(), "move saved").toBe(200));
}

const money = (text: string | null) => Number((text ?? "").replace(/[^0-9]/g, ""));

test("TE10 six columns; dragging to another column changes stage and probability, shown in the deals table", async ({ page }) => {
  await page.goto("/pipeline");
  await expect(page.locator("section.col h2")).toHaveText(["New", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]);
  const logan = card(page, "Logan training package");
  await expect(logan.getByRole("img", { name: "10% probability" })).toBeVisible();

  const saved = moveSaved(page);
  await drag(page, logan, card(page, "Tate hardware refresh"), "above");
  await expect(column(page, "Qualified").locator(".card", { hasText: "Logan training package" })).toBeVisible();
  await expect(card(page, "Logan training package").getByRole("img", { name: "25% probability" })).toBeVisible();
  await saved;

  await page.goto("/deals");
  await page.getByRole("searchbox").fill("Logan training package");
  const row = page.getByRole("row", { name: /Logan training package/ });
  await expect(row).toContainText("Qualified");
  await expect(row).toContainText("25%");
});

test("TE11 a card dropped above or below cards, in its own or another column, stays there after a reload", async ({ page }) => {
  await page.goto("/pipeline");
  expect(await titles(page, "New")).toEqual(["Logan training package", "Shaw second site expansion", "Burke consulting retainer"]);

  // Higher in its own column.
  let saved = moveSaved(page);
  await drag(page, card(page, "Burke consulting retainer"), card(page, "Logan training package"), "above");
  await expect.poll(() => titles(page, "New")).toEqual(["Burke consulting retainer", "Logan training package", "Shaw second site expansion"]);
  await saved;

  // Between two cards in another column.
  saved = moveSaved(page);
  await drag(page, card(page, "Cross fleet rollout"), card(page, "Logan second site expansion"), "above");
  const negotiation = ["Heath training package", "Cross fleet rollout", "Logan second site expansion", "Shaw consulting retainer"];
  await expect.poll(() => titles(page, "Negotiation")).toEqual(negotiation);
  await saved;

  // Lower in its own column.
  saved = moveSaved(page);
  await drag(page, card(page, "Hawkins annual licence"), card(page, "Walker platform upgrade"), "below");
  const proposal = ["Wilson pilot project", "Walker platform upgrade", "Hawkins annual licence"];
  await expect.poll(() => titles(page, "Proposal")).toEqual(proposal);
  await saved;

  await page.reload();
  expect(await titles(page, "New")).toEqual(["Burke consulting retainer", "Logan training package", "Shaw second site expansion"]);
  expect(await titles(page, "Negotiation")).toEqual(negotiation);
  expect(await titles(page, "Proposal")).toEqual(proposal);
});

test("TE12 column and board totals change the moment a card drops", async ({ page }) => {
  await page.goto("/pipeline");
  const boardValue = page.getByTestId("board-value");
  const before = money(await boardValue.textContent());
  const negotiationBefore = money(await column(page, "Negotiation").getByTestId("column-value").textContent());
  const wonBefore = money(await column(page, "Won").getByTestId("column-value").textContent());
  const value = money(await card(page, "Heath training package").locator(".v").textContent());

  // Hold the server's reply, to show the totals change before it answers.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/deals/*/move", async (route) => {
    await held;
    await route.continue();
  });

  const saved = moveSaved(page);
  await drag(page, card(page, "Heath training package"), card(page, "Wilson annual licence"), "above");
  await expect(boardValue).toHaveText(`$${(before - value).toLocaleString("en-US")}`);
  await expect(column(page, "Negotiation").getByTestId("column-value")).toHaveText(`$${(negotiationBefore - value).toLocaleString("en-US")}`);
  await expect(column(page, "Won").getByTestId("column-value")).toHaveText(`$${(wonBefore + value).toLocaleString("en-US")}`);
  // P5 (RV8): Won and Lost show expected revenue too; Won expects all of it, Lost none.
  await expect(column(page, "Won").getByTestId("column-expected")).toHaveText(`exp. $${(wonBefore + value).toLocaleString("en-US")}`);
  await expect(column(page, "Lost").getByTestId("column-expected")).toHaveText("exp. $0");
  release();
  await saved;
  await page.reload();
  await expect(boardValue).toHaveText(`$${(before - value).toLocaleString("en-US")}`);
});

test("TE13 Add deal in a column starts at that stage, at the top", async ({ page }) => {
  await page.goto("/pipeline");
  await page.getByRole("button", { name: "Add deal in Proposal" }).click();
  const panel = page.getByRole("dialog", { name: "Add deal" });
  await expect(panel.getByLabel("Stage")).toHaveValue("proposal");
  await panel.getByLabel("Name").fill("Hunt imaging upgrade");
  await panel.getByLabel("Organization").selectOption({ label: "Hunt Clinics" });
  await panel.getByLabel("Value (US dollars)").fill("30000");
  await panel.getByRole("button", { name: "Add deal" }).click();
  await expect(panel).toBeHidden();
  await expect.poll(async () => (await titles(page, "Proposal"))[0]).toBe("Hunt imaging upgrade");
  await expect(card(page, "Hunt imaging upgrade").getByRole("img", { name: "50% probability" })).toBeVisible();
});

test("TE14 moving a card with the keyboard", async ({ page }) => {
  await page.goto("/pipeline");
  await card(page, "Shaw second site expansion").focus();
  const saved = moveSaved(page);
  // Short pauses, as a person makes between keys.
  for (const key of ["Space", "ArrowRight", "Space"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
  }
  await expect(column(page, "Qualified").locator(".card", { hasText: "Shaw second site expansion" })).toBeVisible();
  await saved;
  await page.reload();
  await expect(column(page, "Qualified").locator(".card", { hasText: "Shaw second site expansion" })).toBeVisible();
  // Enter opens the deal.
  await card(page, "Shaw second site expansion").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Shaw second site expansion" })).toBeVisible();
});

test("TE15 dropping into Won closes the deal: close date today, contact becomes a customer", async ({ page }) => {
  await page.goto("/pipeline");
  const tate = card(page, "Tate hardware refresh");
  await expect(tate).toContainText("Late");
  const saved = moveSaved(page);
  await drag(page, tate, card(page, "Wilson annual licence"), "above");
  const won = column(page, "Won").locator(".card", { hasText: "Tate hardware refresh" });
  await expect(won).toContainText("Closed 16 Nov 2026");
  await expect(won).not.toContainText("Late");
  await expect(won.getByRole("img")).toHaveCount(0);

  await saved;
  await won.click();
  await expect(page.getByRole("heading", { level: 1, name: "Tate hardware refresh" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Details" })).toContainText("16 Nov 2026");
  await expect(page.getByRole("region", { name: "Timeline" }).getByRole("listitem").first()).toContainText("Moved from Qualified to Won");
  await page.getByRole("region", { name: "Details" }).getByRole("link", { name: "Susan Marsh" }).click();
  await expect(page.getByRole("region", { name: "Details" })).toContainText("Customer");
});
