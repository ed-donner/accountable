import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import {
  addContact,
  addDeal,
  addLinkedDeal,
  addOrganization,
  card,
  cardOrder,
  column,
  dropAbove,
  dropAtEnd,
  emptyDatabase,
  holdDatabaseWrites,
  holdOver,
  isoDay,
  pressKeys,
} from "./helpers";

test.beforeEach(emptyDatabase);

const API = "/api";

async function threeInProposal(request: Parameters<typeof addOrganization>[0]) {
  const organization = await addOrganization(request, "Board Co");
  const contact = await addContact(request, "Board Person", organization.id);
  const links = { organization_id: organization.id, main_contact_id: contact.id };
  // Each new deal goes in at the top.
  for (const name of ["C", "B", "A"]) await addDeal(request, name, { ...links, stage: "proposal" });
  return links;
}

test("six columns in order, each headed by its stage color", async ({ page }) => {
  await page.goto("/pipeline");
  const expected = [
    ["new", "New", "rgb(6, 214, 160)"],
    ["qualified", "Qualified", "rgb(255, 193, 69)"],
    ["proposal", "Proposal", "rgb(247, 140, 107)"],
    ["negotiation", "Negotiation", "rgb(17, 138, 178)"],
    ["won", "Won", "rgb(7, 59, 76)"],
    ["lost", "Lost", "rgb(239, 71, 111)"],
  ];
  const headings = page.locator('section[data-testid^="column-"]');
  await expect(headings).toHaveCount(6);
  for (const [index, [stage, name, color]] of expected.entries()) {
    await expect(headings.nth(index)).toHaveAttribute("data-testid", `column-${stage}`);
    await expect(headings.nth(index).locator("> div").first()).toContainText(name);
    await expect(headings.nth(index).locator("> div").first()).toHaveCSS("background-color", color);
  }
});

test("dragging to another column changes the stage and probability, and the Deals table shows both", async ({ page, request }) => {
  await addLinkedDeal(request, "Moving deal");
  await page.goto("/pipeline");
  await expect(card(page, "Moving deal")).toContainText("5%");

  await dropAtEnd(page, "Moving deal", "negotiation");

  await expect(column(page, "negotiation").locator('[data-deal="Moving deal"]')).toContainText("70%");
  await expect(column(page, "new").locator("[data-deal]")).toHaveCount(0);

  await page.goto("/deals?q=moving");
  const row = page.getByRole("row", { name: /Moving deal/ });
  await expect(row).toContainText("Negotiation");
  await expect(row).toContainText("70%");
});

test("a card dropped at the top, middle or bottom of a column stays there after a refresh", async ({ page, request }) => {
  const links = await threeInProposal(request);
  await addDeal(request, "Top", links);
  await addDeal(request, "Middle", links);
  await addDeal(request, "Bottom", links);
  await page.goto("/pipeline");
  await expect(card(page, "A")).toBeVisible();

  await dropAbove(page, "Top", "A");
  await expect.poll(() => cardOrder(page, "proposal")).toEqual(["Top", "A", "B", "C"]);

  await dropAbove(page, "Middle", "B");
  await expect.poll(() => cardOrder(page, "proposal")).toEqual(["Top", "A", "Middle", "B", "C"]);

  await dropAtEnd(page, "Bottom", "proposal");
  await expect.poll(() => cardOrder(page, "proposal")).toEqual(["Top", "A", "Middle", "B", "C", "Bottom"]);

  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(card(page, "A")).toBeVisible();
  expect(await cardOrder(page, "proposal")).toEqual(["Top", "A", "Middle", "B", "C", "Bottom"]);
});

test("a card moved higher or lower in its own column stays there, with no entry", async ({ page, request }) => {
  await threeInProposal(request);
  await page.goto("/pipeline");
  await expect(card(page, "A")).toBeVisible();

  await dropAbove(page, "C", "A");
  await expect.poll(() => cardOrder(page, "proposal")).toEqual(["C", "A", "B"]);

  await dropAtEnd(page, "A", "proposal");
  await expect.poll(() => cardOrder(page, "proposal")).toEqual(["C", "B", "A"]);

  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(card(page, "A")).toBeVisible();
  expect(await cardOrder(page, "proposal")).toEqual(["C", "B", "A"]);

  const deals = await (await request.get(`${API}/deals`)).json();
  const timeline = await (await request.get(`${API}/deals/${deals[0].id}/timeline`)).json();
  expect(timeline.total).toBe(0);
});

test("holding a card near the bottom of a long column scrolls it", async ({ page, request }) => {
  const organization = await addOrganization(request, "Long Co");
  const contact = await addContact(request, "Long Person", organization.id);
  const links = { organization_id: organization.id, main_contact_id: contact.id };
  for (let number = 0; number < 12; number += 1) {
    await addDeal(request, `Filler ${number}`, { ...links, stage: "lost", close_date: isoDay(-1) });
  }
  await addDeal(request, "Scroller", links);

  await page.goto("/pipeline");
  const list = page.getByTestId("cards-lost");
  await expect(card(page, "Scroller")).toBeVisible();
  expect(await list.evaluate((element) => element.scrollTop)).toBe(0);

  const start = (await card(page, "Scroller").boundingBox())!;
  const box = (await list.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + 110, start.y + 80, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 12, { steps: 12 });
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(200);
  await page.mouse.up();

  await expect(column(page, "lost").locator('[data-deal="Scroller"]')).toBeVisible();
});

test.describe("cards slide apart while one is dragged", () => {
  const top = async (page: Page, name: string) => (await card(page, name).boundingBox())!.y;
  const settled = (page: Page, name: string) =>
    expect.poll(() => card(page, name).evaluate((element) => getComputedStyle(element).transform));

  test("over another column, the cards below make room, and on landing they take their new places", async ({ page, request }) => {
    const links = await threeInProposal(request);
    await addDeal(request, "Mover", links);
    await page.goto("/pipeline");
    await expect(card(page, "A")).toBeVisible();
    const [a, b, c] = [await top(page, "A"), await top(page, "B"), await top(page, "C")];
    const step = b - a;

    const box = (await card(page, "B").boundingBox())!;
    await holdOver(page, "Mover", { x: box.x + box.width / 2, y: box.y + 4 });

    await expect(page.getByTestId("drop-gap")).toBeVisible();
    await expect.poll(() => top(page, "B")).toBeCloseTo(b + step, 0);
    await expect.poll(() => top(page, "C")).toBeCloseTo(c + step, 0);
    expect(await top(page, "A")).toBeCloseTo(a, 0);

    await page.mouse.up();

    await expect.poll(() => cardOrder(page, "proposal")).toEqual(["A", "Mover", "B", "C"]);
    await expect(page.getByTestId("drop-gap")).toHaveCount(0);
    await settled(page, "B").toBe("none");
    expect(await top(page, "B")).toBeCloseTo(b + step, 0);
  });

  test("the gap closes behind a card that has left its column", async ({ page, request }) => {
    await threeInProposal(request);
    await page.goto("/pipeline");
    await expect(card(page, "A")).toBeVisible();
    const [a, b, c] = [await top(page, "A"), await top(page, "B"), await top(page, "C")];

    const over = (await column(page, "qualified").boundingBox())!;
    await holdOver(page, "A", { x: over.x + over.width / 2, y: over.y + 300 });

    await expect.poll(() => top(page, "B")).toBeCloseTo(a, 0);
    await expect.poll(() => top(page, "C")).toBeCloseTo(b, 0);
    expect(c).toBeGreaterThan(b);

    await page.mouse.up();
    await expect(column(page, "qualified").locator('[data-deal="A"]')).toBeVisible();
  });

  test("within a column, only the cards it passes move", async ({ page, request }) => {
    const links = await threeInProposal(request);
    await addDeal(request, "Bottom", { ...links, stage: "proposal" });
    await page.goto("/pipeline");
    await expect(card(page, "A")).toBeVisible();
    expect(await cardOrder(page, "proposal")).toEqual(["Bottom", "A", "B", "C"]);
    const [bottom, a, c] = [await top(page, "Bottom"), await top(page, "A"), await top(page, "C")];
    const step = a - bottom;

    const box = (await card(page, "A").boundingBox())!;
    await holdOver(page, "C", { x: box.x + box.width / 2, y: box.y + 4 });

    await expect.poll(() => top(page, "A")).toBeCloseTo(a + step, 0);
    expect(await top(page, "Bottom")).toBeCloseTo(bottom, 0);

    await page.keyboard.press("Escape");
    await expect.poll(() => top(page, "A")).toBeCloseTo(a, 0);
    expect(await top(page, "C")).toBeCloseTo(c, 0);
    await page.mouse.up();
  });

  test("a dropped card goes straight to its new place, with no frame back in its old one", async ({ page, request }) => {
    const links = await threeInProposal(request);
    await addDeal(request, "Lander", links);
    await page.goto("/pipeline");
    await expect(card(page, "A")).toBeVisible();

    const box = (await card(page, "B").boundingBox())!;
    await holdOver(page, "Lander", { x: box.x + box.width / 2, y: box.y + 4 });
    await expect(page.getByTestId("drop-gap")).toBeVisible();

    await page.evaluate(() => {
      const frames: string[] = [];
      (window as unknown as { frames_: string[] }).frames_ = frames;
      const start = performance.now();
      const sample = () => {
        const lander = document.querySelector<HTMLElement>('[data-deal="Lander"]');
        const shown = lander && getComputedStyle(lander).opacity !== "0";
        frames.push(shown ? (lander.closest("section")?.dataset.testid ?? "") : "unseen");
        if (performance.now() - start < 500) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.mouse.up();
    await expect.poll(() => cardOrder(page, "proposal")).toEqual(["A", "Lander", "B", "C"]);
    await page.waitForTimeout(600);

    const frames = await page.evaluate(() => (window as unknown as { frames_: string[] }).frames_);
    expect(frames.length).toBeGreaterThan(5);
    expect(frames).not.toContain("column-new");
    expect(frames.at(-1)).toBe("column-proposal");
  });

  test("the keyboard slides them too", async ({ page, request }) => {
    await threeInProposal(request);
    await page.goto("/pipeline");
    await expect(card(page, "A")).toBeVisible();
    const [a, b] = [await top(page, "A"), await top(page, "B")];

    await card(page, "A").focus();
    await pressKeys(page, "Space", "ArrowDown");

    await expect(page.getByTestId("drop-gap")).toBeVisible();
    await expect.poll(() => top(page, "B")).toBeCloseTo(a, 0);
    expect(b).toBeGreaterThan(a);

    await pressKeys(page, "Space");
    await expect.poll(() => cardOrder(page, "proposal")).toEqual(["B", "A", "C"]);
  });

  test("with reduced motion set, they move without sliding", async ({ page, request }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await threeInProposal(request);
    await page.goto("/pipeline");
    await expect(card(page, "A")).toBeVisible();

    const over = (await column(page, "qualified").boundingBox())!;
    await holdOver(page, "A", { x: over.x + over.width / 2, y: over.y + 300 });

    expect(await card(page, "B").evaluate((element) => getComputedStyle(element).transitionDuration)).toBe("0s");
    await page.mouse.up();
  });
});

test("a card dropped in an empty column lands there", async ({ page, request }) => {
  await addLinkedDeal(request, "Into the empty");
  await page.goto("/pipeline");
  await dropAtEnd(page, "Into the empty", "qualified");
  await expect(column(page, "qualified").locator('[data-deal="Into the empty"]')).toBeVisible();
});

test("board and column figures change before a delayed server reply arrives", async ({ page, request }) => {
  await addLinkedDeal(request, "Figures", { value: 1010, stage: "new" });
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/deals/*/move", async (route) => {
    await held;
    await route.continue();
  });

  await page.goto("/pipeline");
  await expect(page.getByTestId("board-value")).toHaveText("$1,010");
  await expect(page.getByTestId("board-expected")).toHaveText("$51");
  await expect(column(page, "new").getByTestId("column-count")).toHaveText("1");
  await expect(column(page, "new").getByTestId("column-expected")).toHaveText("Expected $51");

  await dropAtEnd(page, "Figures", "negotiation");

  await expect(page.getByTestId("board-expected")).toHaveText("$707");
  await expect(column(page, "new").getByTestId("column-count")).toHaveText("0");
  await expect(column(page, "new").getByTestId("column-value")).toHaveText("$0");
  await expect(column(page, "negotiation").getByTestId("column-count")).toHaveText("1");
  await expect(column(page, "negotiation").getByTestId("column-value")).toHaveText("$1,010");
  await expect(column(page, "negotiation").getByTestId("column-expected")).toHaveText("Expected $707");

  release();
  await expect(page.getByTestId("board-expected")).toHaveText("$707");
});

test("Won and Lost show their count and value with no expected revenue", async ({ page, request }) => {
  await addLinkedDeal(request, "A win", { stage: "won", value: 2000, close_date: isoDay(0) });
  await addLinkedDeal(request, "A loss", { stage: "lost", value: 3000, close_date: isoDay(0) });
  await page.goto("/pipeline");

  await expect(column(page, "won").getByTestId("column-count")).toHaveText("1");
  await expect(column(page, "won").getByTestId("column-value")).toHaveText("$2,000");
  await expect(column(page, "won").getByTestId("column-expected")).toHaveCount(0);
  await expect(column(page, "lost").getByTestId("column-value")).toHaveText("$3,000");
  await expect(column(page, "lost").getByTestId("column-expected")).toHaveCount(0);
  await expect(page.getByTestId("board-value")).toHaveText("$0");
});

test("a failed save returns the card and says so", async ({ page, request, expectConsoleError }) => {
  expectConsoleError(/status of 500.*\/api\/deals\/\d+\/move/);
  await addLinkedDeal(request, "Stuck");
  await page.route("**/api/deals/*/move", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"Something went wrong."}' }),
  );
  await page.goto("/pipeline");

  await dropAtEnd(page, "Stuck", "proposal");

  await expect(page.getByText("Couldn't move that deal, so it's back where it was.")).toBeVisible();
  await expect(column(page, "new").locator('[data-deal="Stuck"]')).toBeVisible();
  await expect(column(page, "proposal").locator("[data-deal]")).toHaveCount(0);
});

/** Holds every move back until told to go, so a second drop lands while the first is still saving. */
async function holdMoves(page: Page, answer: (call: number) => "save" | "fail" = () => "save") {
  let release = () => undefined as void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route("**/api/deals/*/move", async (route) => {
    calls += 1;
    const outcome = answer(calls);
    await held;
    // Not route.continue(): if the page has moved on, it can lose the request.
    if (outcome === "save") await route.fulfill({ response: await route.fetch() });
    else await route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"Something went wrong."}' });
  });
  return release;
}

/**
 * After a drop, dnd-kit swallows clicks for 50ms so the drop can't count as one. A
 * click on a link in that window never reaches React, so the browser loads the page
 * afresh, which no person's hand is quick enough to do.
 */
async function leaveTheBoardFor(page: Page, section: string) {
  await page.waitForTimeout(150);
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: section }).click();
  await expect(page.getByRole("heading", { level: 1, name: section })).toBeVisible();
}

test.describe("moves that overlap", () => {
  test("two drops in a row each show their message", async ({ page, request }) => {
    await addLinkedDeal(request, "First win");
    await addLinkedDeal(request, "First loss");
    const release = await holdMoves(page);
    await page.goto("/pipeline");

    await dropAtEnd(page, "First win", "won");
    await dropAtEnd(page, "First loss", "lost");
    release();

    await expect(page.getByText(/^Marked as Lost\./)).toBeVisible();
    await expect(page.getByText(/^Marked as Won\./)).toBeVisible();
    await expect(column(page, "won").locator('[data-deal="First win"]')).toBeVisible();
    await expect(column(page, "lost").locator('[data-deal="First loss"]')).toBeVisible();
  });

  test("if the first of two moves fails it says so, and the second still lands", async ({ page, request, expectConsoleError }) => {
    expectConsoleError(/status of 500.*\/api\/deals\/\d+\/move/);
    await addLinkedDeal(request, "Bounced");
    await addLinkedDeal(request, "Landed");
    const release = await holdMoves(page, (call) => (call === 1 ? "fail" : "save"));
    await page.goto("/pipeline");

    await dropAtEnd(page, "Bounced", "proposal");
    await dropAtEnd(page, "Landed", "lost");
    release();

    await expect(page.getByText("Couldn't move that deal, so it's back where it was.")).toBeVisible();
    await expect(column(page, "new").locator('[data-deal="Bounced"]')).toBeVisible();
    await expect(column(page, "lost").locator('[data-deal="Landed"]')).toBeVisible();
    await expect(page.getByText(/^Marked as Lost\./)).toBeVisible();
  });

  test("if the second of two moves fails it says so, and the first stays", async ({ page, request, expectConsoleError }) => {
    expectConsoleError(/status of 500.*\/api\/deals\/\d+\/move/);
    await addLinkedDeal(request, "Stayed");
    await addLinkedDeal(request, "Bounced late");
    const release = await holdMoves(page, (call) => (call === 2 ? "fail" : "save"));
    await page.goto("/pipeline");

    await dropAtEnd(page, "Stayed", "negotiation");
    await dropAtEnd(page, "Bounced late", "qualified");
    release();

    await expect(page.getByText("Couldn't move that deal, so it's back where it was.")).toBeVisible();
    await expect(column(page, "negotiation").locator('[data-deal="Stayed"]')).toBeVisible();
    await expect(column(page, "new").locator('[data-deal="Bounced late"]')).toBeVisible();
  });

  test("if both of two moves fail and nothing can be read, both cards go back", async ({ page, request, expectConsoleError }) => {
    expectConsoleError(/status of 500.*\/api\/deals\/\d+\/move|Failed to load resource/);
    await addLinkedDeal(request, "Back first");
    await addLinkedDeal(request, "Back second");
    const release = await holdMoves(page, () => "fail");
    await page.goto("/pipeline");
    const total = await page.getByTestId("board-value").innerText();

    await dropAtEnd(page, "Back first", "won");
    await dropAtEnd(page, "Back second", "lost");
    await page.route(
      (url) => url.pathname === "/api/deals",
      (route) => route.abort(),
    );
    release();

    await expect(page.getByText("Couldn't move that deal, so it's back where it was.")).toHaveCount(2);
    await expect(column(page, "new").locator('[data-deal="Back first"]')).toBeVisible();
    await expect(column(page, "new").locator('[data-deal="Back second"]')).toBeVisible();
    await expect(page.getByTestId("board-value")).toHaveText(total);
  });

  test("leaving the board before the reply still shows the message", async ({ page, request }) => {
    await addLinkedDeal(request, "Left behind");
    const release = await holdMoves(page);
    await page.goto("/pipeline");

    await dropAtEnd(page, "Left behind", "won");
    await leaveTheBoardFor(page, "Deals");
    release();

    await expect(page.getByText(/^Marked as Won\./)).toBeVisible();
  });

  test("a save held up by a busy database still lands after leaving the board", async ({ page, request }) => {
    const { deal } = await addLinkedDeal(request, "Slow save");
    await page.goto("/pipeline");
    await expect(card(page, "Slow save")).toBeVisible();

    const release = await holdDatabaseWrites();
    try {
      await dropAtEnd(page, "Slow save", "won");
      await leaveTheBoardFor(page, "Deals");
      expect((await (await request.get(`/api/deals/${deal.id}`)).json()).stage).toBe("new");
    } finally {
      // Left locked, every test after this one on the same worker would stall.
      release();
    }

    await expect(page.getByText(/^Marked as Won\./)).toBeVisible();
    await expect(page.getByRole("row", { name: /Slow save/ })).toContainText("Won");
  });

  test("leaving the board before a failed reply still says so", async ({ page, request, expectConsoleError }) => {
    expectConsoleError(/status of 500.*\/api\/deals\/\d+\/move/);
    await addLinkedDeal(request, "Left and failed");
    const release = await holdMoves(page, () => "fail");
    await page.goto("/pipeline");

    await dropAtEnd(page, "Left and failed", "proposal");
    await leaveTheBoardFor(page, "Contacts");
    release();

    await expect(page.getByText("Couldn't move that deal, so it's back where it was.")).toBeVisible();
  });
});

test("a card shows all its fields, a click opens the deal, and a short drag doesn't", async ({ page, request }) => {
  await addLinkedDeal(request, "Full card", { value: 48000, close_date: "2031-05-06" });
  await page.goto("/pipeline");
  const fields = card(page, "Full card");
  await expect(fields).toContainText("$48,000");
  await expect(fields).toContainText("Full card");
  await expect(fields).toContainText("Full card Ltd");
  await expect(fields).toContainText("Full card Contact");
  await expect(fields).toContainText("5%");
  await expect(fields).toContainText("May 6, 2031");

  const box = (await fields.boundingBox())!;
  await page.mouse.move(box.x + 50, box.y + 50);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 58, { steps: 4 });
  await page.mouse.up();
  await expect(page).toHaveURL(/\/pipeline$/);

  await fields.click();
  await expect(page).toHaveURL(/\/deals\/\d+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Full card" })).toBeVisible();
});

test("a late card has the chip and tint, and loses both when moved to Won", async ({ page, request }) => {
  await addLinkedDeal(request, "Late one", { close_date: isoDay(-2) });
  await page.goto("/pipeline");
  await expect(card(page, "Late one").getByText("Late", { exact: true })).toBeVisible();
  await expect(card(page, "Late one")).toHaveCSS("background-color", "rgb(253, 236, 241)");

  await dropAtEnd(page, "Late one", "won");

  const moved = column(page, "won").locator('[data-deal="Late one"]');
  await expect(moved).toBeVisible();
  await expect(moved.getByText("Late", { exact: true })).toHaveCount(0);
  await expect(moved).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

test("Add deal in a column starts at that stage, at the top", async ({ page, request }) => {
  const links = await threeInProposal(request);
  await page.goto("/pipeline");
  await expect(card(page, "A")).toBeVisible();

  await page.getByRole("button", { name: "Add deal to Proposal" }).click();
  const form = page.getByRole("dialog", { name: "Add deal" });
  await expect(form.getByLabel("Stage")).toHaveValue("proposal");
  await expect(form.getByLabel("Probability")).toHaveValue("40");
  await form.getByLabel("Name", { exact: true }).fill("Fresh");
  await form.getByRole("combobox", { name: "Organization" }).click();
  await page.getByRole("option", { name: "Board Co" }).click();
  await form.getByRole("combobox", { name: "Main contact" }).click();
  await page.getByRole("option", { name: /Board Person/ }).click();
  await form.getByLabel("Value").fill("1000");
  await form.getByLabel("Close date").fill(isoDay(10));
  await form.getByRole("button", { name: "Save deal" }).click();

  await expect.poll(() => cardOrder(page, "proposal")).toEqual(["Fresh", "A", "B", "C"]);
  expect(links.organization_id).toBeGreaterThan(0);
});

test("Add deal on Won starts with today's close date", async ({ page }) => {
  await page.goto("/pipeline");
  await page.getByRole("button", { name: "Add deal to Won" }).click();
  const form = page.getByRole("dialog", { name: "Add deal" });
  await expect(form.getByLabel("Close date")).toHaveValue(isoDay(0));
  await expect(form.getByLabel("Probability")).toHaveValue("100");
});

test("a drop on Won shows the message, sets the close date, adds the entry and makes the contact a customer", async ({ page, request }) => {
  const { deal, contact } = await addLinkedDeal(request, "Winner", { close_date: isoDay(30) });
  await page.goto("/pipeline");

  await dropAtEnd(page, "Winner", "won");

  await expect(page.getByText("Marked as Won. Close date set to today. Winner Contact is now a customer.")).toBeVisible();

  const saved = await (await request.get(`${API}/deals/${deal.id}`)).json();
  expect(saved.close_date).toBe(isoDay(0));
  expect(saved.probability).toBe(100);
  expect((await (await request.get(`${API}/contacts/${contact.id}`)).json()).status).toBe("customer");

  await page.goto(`/deals/${deal.id}`);
  await expect(page.getByText("Moved from New to Won")).toBeVisible();
});

test("a drop on Lost shows the message and sets the close date", async ({ page, request }) => {
  const { deal, contact } = await addLinkedDeal(request, "Loser", { close_date: isoDay(30) });
  await page.goto("/pipeline");

  await dropAtEnd(page, "Loser", "lost");

  await expect(page.getByText("Marked as Lost. Close date set to today.")).toBeVisible();
  const saved = await (await request.get(`${API}/deals/${deal.id}`)).json();
  expect(saved.close_date).toBe(isoDay(0));
  expect(saved.probability).toBe(0);
  expect((await (await request.get(`${API}/contacts/${contact.id}`)).json()).status).toBe("lead");
});

test("a deal dragged back from Won follows the rules, and its contact stays a customer", async ({ page, request }) => {
  const { deal, contact } = await addLinkedDeal(request, "Reopened");
  await page.goto("/pipeline");
  await dropAtEnd(page, "Reopened", "won");
  await expect(column(page, "won").locator('[data-deal="Reopened"]')).toBeVisible();
  await page.waitForLoadState("networkidle");

  await dropAtEnd(page, "Reopened", "qualified");
  await expect(column(page, "qualified").locator('[data-deal="Reopened"]')).toContainText("20%");

  await page.waitForLoadState("networkidle");
  const saved = await (await request.get(`${API}/deals/${deal.id}`)).json();
  expect(saved.stage).toBe("qualified");
  expect(saved.close_date).toBe(isoDay(0));
  expect((await (await request.get(`${API}/contacts/${contact.id}`)).json()).status).toBe("customer");
});

test("a hand-set probability stays until the stage changes", async ({ page, request }) => {
  const { deal } = await addLinkedDeal(request, "Hand set");
  await request.patch(`${API}/deals/${deal.id}`, { data: { probability: 33 } });
  await addLinkedDeal(request, "Neighbor");
  await page.goto("/pipeline");
  await expect(card(page, "Hand set")).toContainText("33%");

  await dropAtEnd(page, "Hand set", "new");
  await page.waitForLoadState("networkidle");
  await expect(card(page, "Hand set")).toContainText("33%");

  await dropAtEnd(page, "Hand set", "proposal");
  await expect(column(page, "proposal").locator('[data-deal="Hand set"]')).toContainText("40%");
});

test("a deal with no main contact can be won, and the message names no contact", async ({ page, request }) => {
  const { contact } = await addLinkedDeal(request, "No contact");
  await request.delete(`${API}/contacts/${contact.id}`);
  await page.goto("/pipeline");
  await expect(card(page, "No contact")).toContainText("None");

  await dropAtEnd(page, "No contact", "won");

  await expect(page.getByText("Marked as Won. Close date set to today.", { exact: true })).toBeVisible();
  await expect(column(page, "won").locator('[data-deal="No contact"]')).toBeVisible();
});

test("with the keyboard, Space picks up, arrows move within and across columns, and Space drops", async ({ page, request }) => {
  const links = await threeInProposal(request);
  await addDeal(request, "Keyed", { ...links, stage: "qualified" });
  await page.goto("/pipeline");
  await expect(card(page, "A")).toBeVisible();

  await card(page, "A").focus();
  await pressKeys(page, "Space", "ArrowDown", "ArrowDown", "Space");
  await expect.poll(() => cardOrder(page, "proposal")).toEqual(["B", "C", "A"]);
  await expect(page).toHaveURL(/\/pipeline$/);

  await card(page, "Keyed").focus();
  await pressKeys(page, "Space", "ArrowRight", "Space");
  await expect(column(page, "proposal").locator('[data-deal="Keyed"]')).toContainText("40%");

  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(column(page, "proposal").locator('[data-deal="Keyed"]')).toBeVisible();
});

test("one arrow press moves a card one place, up as well as down", async ({ page, request }) => {
  await threeInProposal(request);
  await page.goto("/pipeline");
  await expect(card(page, "A")).toBeVisible();

  await card(page, "B").focus();
  await pressKeys(page, "Space", "ArrowUp", "Space");
  await expect.poll(() => cardOrder(page, "proposal")).toEqual(["B", "A", "C"]);
  await page.waitForLoadState("networkidle");

  await card(page, "A").focus();
  await pressKeys(page, "Space", "ArrowDown", "Space");
  await expect.poll(() => cardOrder(page, "proposal")).toEqual(["B", "C", "A"]);
  await page.waitForLoadState("networkidle");

  await card(page, "A").focus();
  await pressKeys(page, "Space", "ArrowUp", "ArrowUp", "Space");
  await expect.poll(() => cardOrder(page, "proposal")).toEqual(["A", "B", "C"]);
});

test("the keyboard can reach the bottom of a long column", async ({ page, request }) => {
  const organization = await addOrganization(request, "Long Co");
  const contact = await addContact(request, "Long Person", organization.id);
  const links = { organization_id: organization.id, main_contact_id: contact.id };
  for (let number = 9; number >= 0; number -= 1) {
    await addDeal(request, `Row ${number}`, { ...links, stage: "proposal" });
  }

  await page.goto("/pipeline");
  await expect(card(page, "Row 0")).toBeVisible();
  const list = page.getByTestId("cards-proposal");

  await card(page, "Row 0").focus();
  await pressKeys(page, "Space", ...Array<string>(9).fill("ArrowDown"), "Space");

  await expect.poll(() => cardOrder(page, "proposal")).toEqual([
    "Row 1", "Row 2", "Row 3", "Row 4", "Row 5", "Row 6", "Row 7", "Row 8", "Row 9", "Row 0",
  ]);
  expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

test("Escape puts a picked-up card back", async ({ page, request }) => {
  await threeInProposal(request);
  await page.goto("/pipeline");
  await card(page, "A").focus();
  await pressKeys(page, "Space", "ArrowRight", "Escape");
  await expect(column(page, "proposal").locator('[data-deal="A"]')).toBeVisible();
  await page.waitForTimeout(200);
  expect(await cardOrder(page, "proposal")).toEqual(["A", "B", "C"]);
});

test("Enter opens the deal", async ({ page, request }) => {
  await addLinkedDeal(request, "Open me");
  await page.goto("/pipeline");
  await card(page, "Open me").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Open me" })).toBeVisible();
});
