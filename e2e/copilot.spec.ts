import type { APIRequestContext, Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import {
  API,
  COPY_URL,
  SIGNED_IN,
  addActivity,
  addLinkedDeal,
  addProduct,
  addQuote,
  card,
  cardOrder,
  chooseTeammate,
  column,
  makeCopyFolder,
  resetToSampleData,
  startCopy,
} from "./helpers";

// The Copilot against the stand-in model that scripts/test-servers.mjs starts for the run. Its
// scripted questions, and the answers it makes from what the tools give it, are in
// scripts/stand-in-model.mjs. It waits 300ms before each reply, so each step shows before the next.

test.beforeAll(resetToSampleData);

const ASK = "Ask a question or for a change";
const SEARCH_BOX = "Search organizations, contacts, deals and products";
const THEME_KEY = "accountable-mode";
const CLOSING = "Which deals close this month?";
/** The most rows a list hands the model, after which the stand-in says how many more matched (Z9). */
const MOST_ROWS = 50;
/** A question the stand-in never answers, so the Copilot is still working for as long as it's asked. */
const TAKE_YOUR_TIME = "Take your time";
const CANCELLED = "Cancelled. Nothing was changed.";
const CANT_MARK_PAID = "I can't mark bills paid. Open the bill and use Mark paid.";
const MINUTE = "The Copilot has reached OpenRouter's limit for this minute. Wait a minute and try again.";
const DAY =
  "The Copilot has used today's free requests on OpenRouter. Try again tomorrow, or add credits to the OpenRouter account.";
const NO_KEY = "The Copilot needs an OpenRouter key. Add OPENROUTER_API_KEY to .env, then start Accountable again.";

type Mode = "light" | "dark";

// The spec's Color tokens, as the browser reports them.
const COLORS = {
  light: {
    page: "rgb(240, 244, 245)",
    raised: "rgb(255, 255, 255)",
    ink: "rgb(7, 59, 76)",
    muted: "rgb(74, 107, 118)",
    alert: "rgb(210, 62, 98)",
    focus: "rgb(17, 138, 178)",
  },
  dark: {
    page: "rgb(4, 35, 46)",
    raised: "rgb(18, 64, 79)",
    ink: "rgb(205, 216, 219)",
    muted: "rgb(154, 177, 184)",
    alert: "rgb(245, 145, 169)",
    focus: "rgb(76, 179, 214)",
  },
};
const SEA_GREEN = "rgb(6, 214, 160)";
const MIDNIGHT = "rgb(7, 59, 76)";
const TRANSPARENT = "rgba(0, 0, 0, 0)";

/** A name no other test's deal has, since the stand-in finds a deal by searching for its name. */
function uniqueName(start: string) {
  return `${start} ${test.info().testId.slice(0, 6)}${test.info().repeatEachIndex}`;
}

function copilotButton(page: Page) {
  return page.getByRole("banner").getByRole("button", { name: "Copilot", exact: true });
}

function panel(page: Page) {
  return page.getByRole("region", { name: "Copilot" });
}

function log(page: Page) {
  return panel(page).getByRole("log");
}

function messageBox(page: Page) {
  return panel(page).getByRole("textbox", { name: ASK });
}

/** The change card with this title. */
function changeCard(page: Page, title: string) {
  return log(page)
    .locator("div")
    .filter({ has: page.getByRole("heading", { level: 3, name: title }) });
}

async function openCopilot(page: Page) {
  await copilotButton(page).click();
  await expect(messageBox(page)).toBeFocused();
}

/** Waits for the panel's slide, and the page making room for it, to end, so their places can be measured. */
async function settled(page: Page) {
  await page.evaluate(() => {
    const moving = [document.getElementById("copilot-panel"), document.querySelector("main")!.parentElement];
    return Promise.all(moving.flatMap((element) => element?.getAnimations() ?? []).map((motion) => motion.finished));
  });
}

/**
 * Presses the Copilot button from inside the page and reads what moves straight after, once React has drawn
 * it. A click from the test and a read after it could miss the 200ms slide under the load of a full run.
 */
async function toggleAndRead(page: Page) {
  return page.evaluate(async () => {
    document.querySelector<HTMLButtonElement>("header button[aria-label='Copilot']")!.click();
    await Promise.resolve();
    const panel = document.getElementById("copilot-panel");
    const area = document.querySelector("main")!.parentElement!;
    return {
      panel: panel && {
        inert: panel.inert,
        x: panel.getBoundingClientRect().x,
        slides: panel.getAnimations().map((motion) => (motion as CSSAnimation).animationName),
      },
      page: area.getAnimations().map((motion) => (motion as CSSTransition).transitionProperty),
      room: getComputedStyle(area).marginRight,
    };
  });
}

/** Sends a question from the box, as Enter does, and waits for it to show as the person's message. */
async function ask(page: Page, question: string) {
  await messageBox(page).fill(question);
  await messageBox(page).press("Enter");
  await expect(log(page).getByText(question, { exact: true }).last()).toBeVisible();
}

/** Presses a key until the element has focus, as someone using the keyboard would, and checks its focus ring. */
async function keyTo(page: Page, element: Locator, key: "Tab" | "Shift+Tab", mode: Mode = "light") {
  for (let press = 0; press < 8; press += 1) {
    if (await element.evaluate((node) => node === document.activeElement)) break;
    await page.keyboard.press(key);
  }
  await expect(element).toBeFocused();
  await expect(element).toHaveCSS("outline-style", "solid");
  await expect(element).toHaveCSS("outline-color", COLORS[mode].focus);
}

async function stagesOf(request: APIRequestContext) {
  const deals: { id: number; stage: string }[] = await (await request.get(`${API}/deals`)).json();
  return Object.fromEntries(deals.map((deal) => [deal.id, deal.stage]));
}

/** Each deal the Deals table shows closing this month, as "name (organization)", page by page. */
async function closingThisMonthInTable(page: Page) {
  const month = new Date().toLocaleDateString("en-US", { month: "short" });
  const year = new Date().getFullYear();
  const closing: string[] = [];
  for (let number = 1; ; number += 1) {
    await page.goto(`/deals?sort=close_date&page=${number}`);
    const rows = page.locator("tbody tr");
    await expect(rows.first()).toBeVisible();
    const headers = await page.getByRole("columnheader").allInnerTexts();
    const at = (name: string) => headers.findIndex((header) => header.startsWith(name));
    const cells = await rows.evaluateAll((found) =>
      found.map((row) => [...row.querySelectorAll("td")].map((cell) => (cell as HTMLElement).innerText.trim())),
    );
    for (const row of cells) {
      if (new RegExp(`${month} \\d{1,2}, ${year}$`).test(row[at("Close date")])) {
        closing.push(`${row[at("Name")]} (${row[at("Organization")]})`);
      }
    }
    if (cells.length < 50) return closing;
  }
}

type Shown = { at: number; text: string };

/** Keeps each text the panel shows as it changes, and when, so a test can tell what arrived before what. */
async function recordWhatThePanelShows(page: Page) {
  await panel(page).evaluate((element) => {
    const shown: Shown[] = [];
    Object.assign(window, { copilotShown: shown });
    new MutationObserver(() => shown.push({ at: performance.now(), text: (element as HTMLElement).innerText })).observe(
      element,
      { childList: true, subtree: true, characterData: true },
    );
  });
  return () => page.evaluate(() => (window as unknown as { copilotShown: Shown[] }).copilotShown);
}

/** When the panel first showed text that matches. */
function firstShowing(shown: Shown[], pattern: RegExp) {
  return shown.find(({ text }) => pattern.test(text))!;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
});

test("answers which deals close this month after showing its step, naming the deals the Deals table shows", async ({
  page,
}) => {
  const expected = await closingThisMonthInTable(page);
  expect(expected.length).toBeGreaterThan(0);

  await openCopilot(page);
  await log(page).getByRole("button", { name: CLOSING }).click();
  await expect(messageBox(page)).toHaveValue(CLOSING);
  await expect(messageBox(page)).toBeFocused();
  const shown = await recordWhatThePanelShows(page);
  await messageBox(page).press("Enter");

  const answer = log(page).getByText("These deals close this month:");
  await expect(answer).toBeVisible();
  const step = log(page).getByText(/^Found \d+ deals closing \w{3} 1 to \w{3} \d{1,2}, \d{4}$/);
  await expect(step).toBeVisible();
  await expect(step.locator("..").getByRole("img", { name: "Done" })).toBeVisible();
  // The step showed on its own, while the Copilot was still working. The stand-in waits 300ms before
  // its answer, so a stream held back anywhere on the way would show the two together.
  const record = await shown();
  const stepShown = firstShowing(record, /Found \d+ deals closing/);
  const answerShown = firstShowing(record, /These deals close this month:/);
  expect(stepShown.text).toContain("Stop");
  expect(answerShown.at - stepShown.at).toBeGreaterThan(100);

  // Each worker has its own servers and database, so nothing else adds a deal between the table and the
  // answer. With more than 50 closing, the stand-in names the 50 it was given, then how many more matched.
  const named = await log(page).getByRole("listitem").allInnerTexts();
  const more = Math.max(0, expected.length - MOST_ROWS);
  expect(named).toHaveLength(expected.length - more);
  expect(expected).toEqual(expect.arrayContaining(named));
  await expect(log(page).getByText(/^And \d+ more\.$/)).toHaveText(more > 0 ? [`And ${more} more.`] : []);
});

test("moves a deal once its card's button is pressed, which the board shows at once, and Cancel moves nothing", async ({
  page,
  request,
}) => {
  const { deal } = await addLinkedDeal(request, uniqueName("Copilot move"), { stage: "proposal" });
  const { deal: kept, contact } = await addLinkedDeal(request, uniqueName("Copilot keep"), { stage: "qualified" });
  await page.goto("/pipeline");
  await expect(card(page, deal.name)).toBeVisible();

  await openCopilot(page);
  await ask(page, `Move ${deal.name} to Negotiation`);
  const move = changeCard(page, `Move ${deal.name} to Negotiation?`);
  // A move gives the deal the new stage's usual probability, as the board does (S1).
  await expect(move.locator("dl > div")).toHaveText([
    "Stage: from Proposal to Negotiation",
    "Probability: from 40% to 70%",
  ]);
  // Nothing has changed while the card waits.
  expect((await stagesOf(request))[deal.id]).toBe("proposal");

  const moveButton = move.getByRole("button", { name: "Move deal" });
  await keyTo(page, moveButton, "Shift+Tab");
  await page.keyboard.press("Enter");
  await expect(move.getByRole("link", { name: `Moved ${deal.name} to Negotiation.` })).toHaveAttribute(
    "href",
    `/deals/${deal.id}`,
  );
  await expect(log(page).getByText("Done.", { exact: true })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(copilotButton(page)).toBeFocused();
  // At the top of its new column, without a reload (S9, Z15).
  await expect.poll(async () => (await cardOrder(page, "negotiation"))[0]).toBe(deal.name);
  const timeline = await (await request.get(`${API}/deals/${deal.id}/timeline`)).json();
  expect(timeline.entries).toContainEqual(
    expect.objectContaining({
      kind: "stage_change",
      description: "Moved from Proposal to Negotiation",
      created_by: expect.objectContaining({ name: SIGNED_IN.name }),
    }),
  );

  await openCopilot(page);
  await expect(log(page).getByText("Done.", { exact: true })).toBeVisible();
  await ask(page, `Move ${kept.name} to Won`);
  const won = changeCard(page, `Move ${kept.name} to Won?`);
  await expect(won.locator("dl > div")).toHaveText(["Stage: from Qualified to Won", "Probability: from 20% to 100%"]);
  await expect(won.getByText(`The close date becomes today, and ${contact.name} becomes a customer.`)).toBeVisible();
  await keyTo(page, won.getByRole("button", { name: "Cancel" }), "Shift+Tab");
  await page.keyboard.press("Enter");
  await expect(won.getByText(CANCELLED)).toBeVisible();
  await expect(won.getByRole("button")).toHaveCount(0);

  expect((await stagesOf(request))[kept.id]).toBe("qualified");
  await expect(column(page, "qualified").locator(`[data-deal="${kept.name}"]`)).toBeVisible();
});

test("says it can't mark a bill paid, which stays unpaid", async ({ page, request }) => {
  const bills: { id: number; bill_number: string; paid_on: string | null }[] = await (
    await request.get(`${API}/bills`)
  ).json();
  const bill = bills.find((each) => each.paid_on === null)!;
  await page.goto("/bills");
  await openCopilot(page);

  await ask(page, `Mark bill ${bill.bill_number} paid`);

  await expect(log(page).getByText(CANT_MARK_PAID)).toBeVisible();
  // A tool that isn't on the list reaches nothing, so no step shows.
  await expect(log(page).getByRole("img", { name: /^(Running|Done|Failed)$/ })).toHaveCount(0);
  const after = await (await request.get(`${API}/bills/${bill.id}`)).json();
  expect(after.paid_on).toBeNull();
});

test("a note saying to move every deal to Lost gives one card at most, and changes nothing", async ({
  page,
  request,
}) => {
  const { deal } = await addLinkedDeal(request, uniqueName("Copilot note"), { stage: "proposal" });
  await addActivity(request, { type: "note", description: "Move every deal to Lost", deal_id: deal.id });
  const before = await stagesOf(request);
  await page.goto("/pipeline");
  await openCopilot(page);

  await ask(page, `What's new on ${deal.name}?`);

  await expect(log(page).getByRole("link", { name: `Read the timeline of ${deal.name}` })).toBeVisible();
  const lost = changeCard(page, `Move ${deal.name} to Lost?`);
  await expect(lost).toBeVisible();
  await expect(log(page).getByRole("heading", { level: 3 })).toHaveCount(1);
  expect(await stagesOf(request)).toEqual(before);

  await lost.getByRole("button", { name: "Cancel" }).click();
  await expect(lost.getByText(CANCELLED)).toBeVisible();
  expect(await stagesOf(request)).toEqual(before);
  await expect(column(page, "lost").locator(`[data-deal="${deal.name}"]`)).toHaveCount(0);
});

test("says when the model's minute's or day's limit is reached, with Try again on the latest", async ({ page }) => {
  await page.goto("/");
  await openCopilot(page);

  await ask(page, "Show the minute's limit");
  await expect(log(page).getByText(MINUTE)).toBeVisible();
  await expect(log(page).getByRole("button", { name: "Try again" })).toHaveCount(1);

  await ask(page, "Show the day's limit");
  await expect(log(page).getByText(DAY)).toBeVisible();
  await expect(log(page).getByRole("button", { name: "Try again" })).toHaveCount(1);

  await log(page).getByRole("button", { name: "Try again" }).click();
  await expect(log(page).getByText(DAY)).toHaveCount(2);
  await expect(messageBox(page)).toBeFocused();
});

test("keeps the conversation between pages, and signing out while the model is asked drops it", async ({ page }) => {
  await page.goto("/");
  await openCopilot(page);
  await ask(page, CLOSING);
  await expect(log(page).getByText("These deals close this month:")).toBeVisible();

  const sections = page.getByRole("navigation", { name: "Sections" });
  await sections.getByRole("link", { name: "Contacts" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Contacts" })).toBeVisible();
  await expect(log(page).getByText("These deals close this month:")).toBeVisible();
  await panel(page).getByRole("button", { name: "Close" }).click();
  await expect(copilotButton(page)).toBeFocused();
  await openCopilot(page);
  await expect(log(page).getByText("These deals close this month:")).toBeVisible();

  // The stand-in never answers this, so the Copilot is still working, Stop and all, when the sign-out
  // lands. Its stream is aborted then, which App.test.tsx proves, and the base test checks the console
  // stays clear.
  await ask(page, TAKE_YOUR_TIME);
  await expect(panel(page).getByRole("button", { name: "Stop" })).toBeVisible();
  await page
    .getByRole("banner")
    .getByRole("button", { name: `Menu for ${SIGNED_IN.name}` })
    .click();
  // The open menu hides the rest of the page from screen readers, so this looks past that.
  const stillWorking = page
    .getByRole("region", { name: "Copilot", includeHidden: true })
    .getByRole("button", { name: "Stop", includeHidden: true });
  await expect(stillWorking).toBeVisible();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();

  await chooseTeammate(page, SIGNED_IN.name);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
  await openCopilot(page);
  await expect(log(page).getByRole("button", { name: CLOSING })).toBeVisible();
  await expect(log(page).getByText("These deals close this month:")).toHaveCount(0);
  await expect(log(page).getByText(TAKE_YOUR_TIME)).toHaveCount(0);
});

for (const mode of ["light", "dark"] as const) {
  test(`the panel takes the ${mode} mode's colors, beside the top bar, and is reached by keyboard`, async ({
    page,
    request,
  }) => {
    const colors = COLORS[mode];
    const { deal } = await addLinkedDeal(request, uniqueName(`Copilot ${mode}`), { stage: "proposal" });
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [THEME_KEY, mode]);
    await page.goto("/pipeline");
    await expect(page.locator("html")).toHaveAttribute("data-mode", mode);

    await expect(column(page, "new")).toBeVisible();
    const bar = (await page.getByRole("banner").boundingBox())!;
    await page.getByRole("banner").getByRole("combobox", { name: SEARCH_BOX }).focus();
    await keyTo(page, copilotButton(page), "Tab", mode);
    await expect(copilotButton(page)).toHaveAttribute("aria-expanded", "false");
    await expect(copilotButton(page)).toHaveCSS("background-color", colors.page);
    await expect(copilotButton(page)).toHaveCSS("color", colors.ink);
    await page.keyboard.press("Enter");
    await expect(messageBox(page)).toBeFocused();
    await expect(messageBox(page)).toHaveCSS("outline-color", colors.focus);
    await expect(copilotButton(page)).toHaveAttribute("aria-expanded", "true");
    await expect(copilotButton(page)).toHaveCSS("background-color", SEA_GREEN);
    await expect(copilotButton(page)).toHaveCSS("color", MIDNIGHT);

    await settled(page);
    expect(await page.getByRole("banner").boundingBox()).toEqual(bar);
    const box = (await panel(page).boundingBox())!;
    expect(box.width).toBe(400);
    expect(box.x + box.width).toBe(bar.x + bar.width);
    expect(box.y).toBe(bar.y + bar.height + 12);
    // The page ends where the panel begins. The board's columns keep their least width and scroll sideways
    // under the page header, and the window never does.
    const room = (await page.getByRole("main").boundingBox())!;
    expect(room.x + room.width).toBe(box.x);
    const board = await column(page, "new")
      .locator("..")
      .evaluate((element) => ({
        right: element.getBoundingClientRect().right,
        scrolls: element.scrollWidth > element.clientWidth,
        column: element.firstElementChild!.getBoundingClientRect().width,
        window: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
    expect(board).toEqual({ right: box.x - 20, scrolls: true, column: 180, window: 0 });
    await expect(panel(page)).toHaveCSS("background-color", colors.raised);
    await expect(panel(page)).toHaveCSS("border-top-width", "0px");
    await expect(panel(page)).not.toHaveCSS("box-shadow", "none");
    await expect(messageBox(page)).toHaveCSS("background-color", colors.page);

    await ask(page, `Move ${deal.name} to Won`);
    await expect(log(page).getByText(`Move ${deal.name} to Won`, { exact: true })).toHaveCSS(
      "background-color",
      colors.page,
    );
    const step = log(page).getByText(`Searched for "${deal.name}"`);
    await expect(step.locator("..")).toHaveCSS("color", colors.muted);
    const won = changeCard(page, `Move ${deal.name} to Won?`);
    await expect(won).toHaveCSS("background-color", colors.page);
    await expect(won.getByRole("heading", { level: 3 })).toHaveCSS("color", colors.ink);
    await expect(won.getByText("Stage:")).toHaveCSS("color", colors.muted);
    await expect(won.locator("dd").getByText("Won")).toHaveCSS("color", colors.ink);
    const moveButton = won.getByRole("button", { name: "Move deal" });
    await expect(moveButton).toHaveCSS("background-color", SEA_GREEN);
    await expect(moveButton).toHaveCSS("color", MIDNIGHT);
    const cancel = won.getByRole("button", { name: "Cancel" });
    await expect(cancel).toHaveCSS("background-color", colors.raised);
    await keyTo(page, moveButton, "Shift+Tab", mode);
    await keyTo(page, cancel, "Tab", mode);
    await page.keyboard.press("Enter");
    await expect(won.getByText(CANCELLED)).toBeVisible();
    await expect(messageBox(page)).toBeFocused();

    await ask(page, "Mark bill NOPE-1 paid");
    const answer = log(page).getByText(CANT_MARK_PAID);
    await expect(answer).toHaveCSS("color", colors.ink);
    await expect(answer).toHaveCSS("background-color", TRANSPARENT);

    await ask(page, "Show the minute's limit");
    const problem = log(page).getByText(MINUTE);
    await expect(problem).toHaveCSS("color", colors.ink);
    await expect(problem.locator("..").locator("svg")).toHaveCSS("color", colors.alert);
    const retry = log(page).getByRole("button", { name: "Try again" });
    await expect(retry).toHaveCSS("background-color", colors.page);
    await keyTo(page, retry, "Shift+Tab", mode);

    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(copilotButton(page)).toBeFocused();
    await expect(copilotButton(page)).toHaveCSS("outline-color", colors.focus);
  });
}

test("slides in as the page narrows beside it, and out as the page widens, the top bar staying, and at once under reduced motion", async ({
  page,
}) => {
  // From 1440px the Dashboard narrows by 160px to its least width, so a chart that kept its wider width,
  // and held its panel open, would make the page wider than 1265px.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("region", { name: "What we owe" }).locator("svg").first()).toBeVisible();
  const main = page.getByRole("main");
  const bar = await page.getByRole("banner").boundingBox();
  const wide = (await main.boundingBox())!;

  expect(await toggleAndRead(page)).toMatchObject({
    panel: { inert: false, slides: ["slide-in"] },
    page: ["margin-right"],
  });
  await settled(page);
  const box = (await panel(page).boundingBox())!;
  const room = (await main.boundingBox())!;
  expect(room.x + room.width).toBe(box.x);
  expect(await page.getByRole("banner").boundingBox()).toEqual(bar);
  // The Dashboard keeps its width at 1280px and scrolls sideways in the page area, never the window.
  expect(
    await main.evaluate((element) => ({
      page: element.scrollWidth,
      room: element.clientWidth,
      window: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    })),
  ).toEqual({ page: 1265, room: box.x, window: 0 });

  expect(await toggleAndRead(page)).toMatchObject({
    panel: { inert: true, slides: ["slide-out"] },
    page: ["margin-right"],
  });
  await expect(page.locator("#copilot-panel")).toHaveCount(0);
  await settled(page);
  expect(await main.boundingBox()).toEqual(wide);

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await toggleAndRead(page)).toEqual({
    panel: { inert: false, x: box.x, slides: [] },
    page: [],
    room: "420px",
  });
  expect(await toggleAndRead(page)).toEqual({ panel: null, page: [], room: "0px" });
});

test("beside the panel, a quote's page narrows rather than scrolling sideways, so its preview still stays in view", async ({
  page,
  request,
}) => {
  const { deal } = await addLinkedDeal(request, uniqueName("Copilot quote"), { stage: "proposal" });
  const product = await addProduct(request, uniqueName("Copilot kit"));
  const lines = [1, 2, 3, 4].map((quantity) => ({ product_id: product.id, quantity, unit_price_cents: 10000 }));
  const quote = await addQuote(request, deal.id, lines);
  await page.goto(`/quotes/${quote.id}`);
  const preview = page.getByTestId("preview-scroll");
  await expect(preview).toBeVisible();

  await openCopilot(page);
  await settled(page);
  const main = page.getByRole("main");
  await expect(main).toHaveCSS("overflow-x", "visible");
  expect(await main.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 300));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(300);
  expect(await preview.evaluate((element) => element.getBoundingClientRect().top)).toBe(12);
});

test.describe("a copy with no OpenRouter key", () => {
  // startCopy waits up to 60s for a copy to start on a busy machine.
  test.describe.configure({ timeout: 120_000 });

  test("says what's missing as the panel opens, with Send off", async ({ page }) => {
    const folder = makeCopyFolder();
    // A test run's copies never read .env, and a blank key counts as none.
    const copy = await startCopy(folder.database, { OPENROUTER_API_KEY: "" });
    try {
      await page.goto(COPY_URL);
      await chooseTeammate(page, SIGNED_IN.name);
      await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
      await openCopilot(page);

      await expect(panel(page).getByRole("alert")).toHaveText(NO_KEY);
      await expect(panel(page).getByRole("button", { name: "Try again" })).toHaveCount(0);
      await messageBox(page).fill("Is anyone there?");
      await expect(panel(page).getByRole("button", { name: "Send" })).toBeDisabled();
      await messageBox(page).press("Enter");
      await expect(log(page).getByText("Is anyone there?")).toHaveCount(0);
      await expect(messageBox(page)).toHaveValue("Is anyone there?");
      await page.goto("about:blank");
    } finally {
      await copy.stop();
      folder.remove();
    }
  });
});
