import type { Page, Response } from "@playwright/test";

import { expect, test } from "./fixtures";
import {
  addActivity,
  addLinkedDeal,
  card,
  column,
  dropAtEnd,
  isoDay,
  resetToSampleData,
  SIGNED_IN,
  signInAs,
} from "./helpers";

test.beforeAll(resetToSampleData);

function entries(page: Page) {
  return page.getByTestId("timeline-entry");
}

function isTickSaved(reply: Response, id: number) {
  return reply.request().method() === "PATCH" && new URL(reply.url()).pathname === `/api/activities/${id}`;
}

/**
 * A tick shows before it's saved, so a reload or a new page straight after it could
 * cancel the save. This waits until the backend has it.
 */
async function savedTick(page: Page, id: number, tick: () => Promise<void>) {
  const saved = page.waitForResponse((reply) => isTickSaved(reply, id));
  await tick();
  expect((await saved).ok(), "tick saved").toBe(true);
}

async function logActivity(page: Page, description: string, type = "note", followUp?: string) {
  await page.getByRole("button", { name: "Log activity" }).click();
  const form = page.getByRole("dialog", { name: "Log activity" });
  await form.getByLabel("Type").selectOption(type);
  await form.getByLabel("Description").fill(description);
  if (followUp) await form.getByLabel("Follow-up date").fill(followUp);
  await form.getByRole("button", { name: "Save activity" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("a note, call and email can be logged from a contact and a deal, with a follow-up, and show newest first", async ({
  page,
  request,
}) => {
  const { deal, contact } = await addLinkedDeal(request, "Logged");

  await page.goto(`/contacts/${contact.id}`);
  await expect(page.getByText("Nothing logged yet.")).toBeVisible();
  await logActivity(page, "First note", "note");
  await page.waitForTimeout(1100);
  await logActivity(page, "Then a call", "call", isoDay(4));

  await expect(entries(page)).toHaveCount(2);
  await expect(entries(page).nth(0)).toContainText("Then a call");
  await expect(entries(page).nth(0)).toContainText("Call");
  await expect(entries(page).nth(0)).toContainText("Follow up");
  await expect(entries(page).nth(1)).toContainText("First note");

  await page.goto(`/deals/${deal.id}`);
  await logActivity(page, "Sent an email", "email");
  await expect(entries(page).first()).toContainText("Sent an email");
  await expect(entries(page).first()).toContainText("Email");
});

test("an activity logged with a back date lands in the right place", async ({ page, request }) => {
  const { deal } = await addLinkedDeal(request, "Back dated");
  await addActivity(request, { deal_id: deal.id, description: "Today", occurred_at: new Date().toISOString() });

  await page.goto(`/deals/${deal.id}`);
  await page.getByRole("button", { name: "Log activity" }).click();
  const form = page.getByRole("dialog", { name: "Log activity" });
  await form.getByLabel("Description").fill("Last week");
  await form.getByLabel("When").fill(`${isoDay(-7)}T09:30`);
  await form.getByRole("button", { name: "Save activity" }).click();

  await expect(entries(page)).toHaveCount(2);
  await expect(entries(page).nth(1)).toContainText("Last week");
});

test("an activity on a deal shows on its main contact's and organization's timelines, once each", async ({
  page,
  request,
}) => {
  const { deal, contact, organization } = await addLinkedDeal(request, "Spread");
  await addActivity(request, { deal_id: deal.id, description: "Reached everywhere" });

  for (const path of [`/deals/${deal.id}`, `/contacts/${contact.id}`, `/organizations/${organization.id}`]) {
    await page.goto(path);
    await expect(entries(page).filter({ hasText: "Reached everywhere" })).toHaveCount(1);
  }
});

test("a stage change shows on the deal, contact and organization timelines", async ({ page, request }) => {
  const { deal, contact, organization } = await addLinkedDeal(request, "Stage entry");
  await page.goto(`/deals/${deal.id}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Stage").selectOption("proposal");
  await form.getByRole("button", { name: "Save deal" }).click();

  const wording = "Moved from New to Proposal";
  await expect(entries(page).filter({ hasText: wording })).toHaveCount(1);

  for (const path of [`/contacts/${contact.id}`, `/organizations/${organization.id}`]) {
    await page.goto(path);
    await expect(entries(page).filter({ hasText: wording })).toHaveCount(1);
  }
});

test("each logged activity shows who logged it", async ({ page, request }) => {
  const { deal } = await addLinkedDeal(request, "Whose words");
  await page.goto(`/deals/${deal.id}`);
  await logActivity(page, "Asked about the budget");

  await signInAs(page, "teammate-dana-whitfield");
  await logActivity(page, "Sent the price list");

  await expect(entries(page).filter({ hasText: "Asked about the budget" })).toContainText(`by ${SIGNED_IN.name}`);
  await expect(entries(page).filter({ hasText: "Sent the price list" })).toContainText("by Dana Whitfield");
});

test("a deal moved on the board shows who moved it on the deal's timeline", async ({ page, request }) => {
  const { deal } = await addLinkedDeal(request, "Whose move");
  await page.goto("/pipeline");
  await signInAs(page, "teammate-dana-whitfield");
  await expect(card(page, "Whose move")).toBeVisible();

  const moved = page.waitForResponse((reply) => reply.url().endsWith(`/api/deals/${deal.id}/move`));
  await dropAtEnd(page, "Whose move", "qualified");
  expect((await moved).ok()).toBe(true);
  await expect(column(page, "qualified").locator('[data-deal="Whose move"]')).toBeVisible();

  await page.goto(`/deals/${deal.id}`);
  await expect(entries(page).filter({ hasText: "Moved from New to Qualified" })).toContainText("by Dana Whitfield");
});

test("a stage change shows in recent activity", async ({ page, request }) => {
  const { deal } = await addLinkedDeal(request, "Recently moved");
  await request.post(`/api/deals/${deal.id}/move`, { data: { stage: "negotiation" } });

  await page.goto("/");
  const entry = page.getByTestId("recent-entry").filter({ hasText: "Moved from New to Negotiation" });
  await expect(entry).toHaveCount(1);
  await expect(entry.getByRole("link", { name: "Recently moved" })).toBeVisible();
});

test("activities can be edited and deleted from any timeline they're on, and stage-change entries can't", async ({
  page,
  request,
}) => {
  const { deal, contact } = await addLinkedDeal(request, "Changing");
  await addActivity(request, { deal_id: deal.id, description: "Original words" });
  await request.post(`/api/deals/${deal.id}/move`, { data: { stage: "qualified" } });

  await page.goto(`/contacts/${contact.id}`);
  await page.getByRole("button", { name: "Edit Original words" }).click();
  const form = page.getByRole("dialog", { name: "Edit activity" });
  await expect(form.getByLabel("Description")).toHaveValue("Original words");
  await form.getByLabel("Description").fill("Better words");
  await form.getByRole("button", { name: "Save activity" }).click();
  await expect(entries(page).filter({ hasText: "Better words" })).toHaveCount(1);

  const stageEntry = entries(page).filter({ hasText: "Moved from New to Qualified" });
  await expect(stageEntry).toHaveCount(1);
  await expect(stageEntry.getByRole("button")).toHaveCount(0);

  await page.goto(`/deals/${deal.id}`);
  await page.getByRole("button", { name: "Delete Better words" }).click();
  await expect(page.getByRole("alertdialog")).toContainText(
    "It will be removed from every timeline and from the dashboard.",
  );
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete activity" }).click();
  await expect(entries(page).filter({ hasText: "Better words" })).toHaveCount(0);

  await page.goto(`/contacts/${contact.id}`);
  await expect(entries(page).filter({ hasText: "Better words" })).toHaveCount(0);
});

test("show more loads entries after the first 50", async ({ page, request }) => {
  const { deal } = await addLinkedDeal(request, "Busy");
  for (let number = 0; number < 55; number += 1) {
    await addActivity(request, { deal_id: deal.id, description: `Entry ${number}` });
  }

  await page.goto(`/deals/${deal.id}`);
  await expect(entries(page)).toHaveCount(50);
  await page.getByRole("button", { name: "Show more" }).click();
  await expect(entries(page)).toHaveCount(55);
  await expect(page.getByRole("button", { name: "Show more" })).toHaveCount(0);
});

test("a timeline longer than one reply can hold can be read to the end, on all three record pages", async ({
  page,
  request,
}) => {
  test.slow();
  const { deal, contact, organization } = await addLinkedDeal(request, "Very busy");
  const numbers = Array.from({ length: 520 }, (_, number) => number);
  while (numbers.length > 0) {
    await Promise.all(
      numbers.splice(0, 25).map((number) => addActivity(request, { deal_id: deal.id, description: `Entry ${number}` })),
    );
  }

  for (const path of [`/deals/${deal.id}`, `/contacts/${contact.id}`, `/organizations/${organization.id}`]) {
    await page.goto(path);
    await expect(entries(page)).toHaveCount(50);
    for (let shown = 100; shown <= 500; shown += 50) {
      await page.getByRole("button", { name: "Show more" }).click();
      await expect(entries(page)).toHaveCount(shown);
    }
    await page.getByRole("button", { name: "Show more" }).click();
    await expect(entries(page)).toHaveCount(520);
    await expect(page.getByRole("button", { name: "Show more" })).toHaveCount(0);
  }
});

test.describe("a long timeline with more showing", () => {
  async function longTimeline(page: Page, request: Parameters<typeof addLinkedDeal>[0]) {
    const { deal } = await addLinkedDeal(request, "Long one");
    await addActivity(request, {
      deal_id: deal.id,
      description: "Oldest entry",
      occurred_at: "2020-01-01T09:00:00Z",
      follow_up_date: isoDay(30),
    });
    for (let number = 0; number < 54; number += 1) {
      await addActivity(request, { deal_id: deal.id, description: `Entry ${number}` });
    }
    await page.goto(`/deals/${deal.id}`);
    await expect(entries(page)).toHaveCount(50);
    await page.getByRole("button", { name: "Show more" }).click();
    await expect(entries(page)).toHaveCount(55);
    return deal;
  }

  test("logging an activity keeps everything showing, each entry once", async ({ page, request }) => {
    await longTimeline(page, request);
    await logActivity(page, "Brand new entry");
    await expect(entries(page)).toHaveCount(56);
    await expect(entries(page).first()).toContainText("Brand new entry");
    await expect(entries(page).filter({ hasText: "Brand new entry" })).toHaveCount(1);
  });

  test("deleting an entry keeps everything showing", async ({ page, request }) => {
    await longTimeline(page, request);
    await page.getByRole("button", { name: "Delete Entry 3", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete activity" }).click();
    await expect(entries(page)).toHaveCount(54);
    await expect(page.getByRole("button", { name: "Show more" })).toHaveCount(0);
  });

  test("a follow-up on a later page can be ticked", async ({ page, request }) => {
    await longTimeline(page, request);
    const entry = entries(page).filter({ hasText: "Oldest entry" });
    await entry.getByRole("checkbox").click();
    await expect(entry).toContainText("Done");
    await expect(entries(page)).toHaveCount(55);
  });

  test("showing more doesn't change what's already showing", async ({ page, request }) => {
    const { deal } = await addLinkedDeal(request, "Stable order");
    for (let number = 0; number < 60; number += 1) {
      await addActivity(request, {
        deal_id: deal.id,
        description: `Entry ${number}`,
        occurred_at: "2026-01-01T09:00:00Z",
      });
    }
    await page.goto(`/deals/${deal.id}`);
    await expect(entries(page)).toHaveCount(50);
    const before = await entries(page).allTextContents();
    await page.getByRole("button", { name: "Show more" }).click();
    await expect(entries(page)).toHaveCount(60);
    const after = await entries(page).allTextContents();
    expect(after.slice(0, 50)).toEqual(before);
    expect(new Set(after).size).toBe(60);
  });
});

test("the delete dialog names the activity, and copes with a long one", async ({ page, request }) => {
  const { deal } = await addLinkedDeal(request, "Named");
  const words = "A very long note about what was said on the call ".repeat(12).trim();
  await addActivity(request, { deal_id: deal.id, description: "Short note" });
  await addActivity(request, { deal_id: deal.id, description: words });

  await page.goto(`/deals/${deal.id}`);
  await page.getByRole("button", { name: "Delete Short note" }).click();
  await expect(page.getByRole("alertdialog")).toContainText('Delete "Short note"?');
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: `Delete ${words}` }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("button", { name: "Delete activity" })).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.height).toBeLessThan(300);
});

test("a follow-up can be ticked done on the dashboard, leaving it but not the timeline", async ({ page, request }) => {
  const { deal } = await addLinkedDeal(request, "Tick on dashboard");
  const ringBack = await addActivity(request, {
    deal_id: deal.id,
    description: "Ring them back",
    follow_up_date: isoDay(-40),
  });

  await page.goto("/");
  const row = page.getByTestId("follow-up").filter({ hasText: "Ring them back" });
  await expect(row).toHaveCount(1);
  await savedTick(page, ringBack.id, () => row.getByRole("checkbox").click());
  await expect(row).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("follow-up").first()).toBeVisible();
  await expect(row).toHaveCount(0);

  await page.goto(`/deals/${deal.id}`);
  const entry = entries(page).filter({ hasText: "Ring them back" });
  await expect(entry).toContainText("Done");
  await expect(entry.getByRole("checkbox")).toBeChecked();
});

test("a follow-up can be ticked and unticked on a timeline", async ({ page, request }) => {
  const { deal } = await addLinkedDeal(request, "Tick on timeline");
  const sendDeck = await addActivity(request, {
    deal_id: deal.id,
    description: "Send the deck",
    follow_up_date: isoDay(2),
  });

  await page.goto(`/deals/${deal.id}`);
  const entry = entries(page).filter({ hasText: "Send the deck" });
  await savedTick(page, sendDeck.id, () => entry.getByRole("checkbox").click());
  await expect(entry).toContainText("Done");

  await page.goto("/");
  await expect(page.getByTestId("follow-up").first()).toBeVisible();
  await expect(page.getByTestId("follow-up").filter({ hasText: "Send the deck" })).toHaveCount(0);

  await page.goto(`/deals/${deal.id}`);
  await savedTick(page, sendDeck.id, () => entry.getByRole("checkbox").click());
  await expect(entry.getByText("Done", { exact: true })).toHaveCount(0);

  await page.goto("/");
  await expect(page.getByTestId("follow-up").filter({ hasText: "Send the deck" })).toHaveCount(1);
});

test("two quick ticks each stay gone from the dashboard", async ({ page, request }) => {
  const { deal } = await addLinkedDeal(request, "Two ticks");
  await addActivity(request, { deal_id: deal.id, description: "Quick tick one", follow_up_date: isoDay(2) });
  const two = await addActivity(request, {
    deal_id: deal.id,
    description: "Quick tick two",
    follow_up_date: isoDay(2),
  });
  await page.route(
    (url) => /\/api\/activities\/\d+$/.test(url.pathname),
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.continue();
    },
  );

  await page.goto("/");
  const row = (text: string) => page.getByTestId("follow-up").filter({ hasText: text });
  await expect(row("Quick tick two")).toBeVisible();
  await page.evaluate(() => {
    const seen: number[] = [];
    (window as unknown as { rowsSeen: number[] }).rowsSeen = seen;
    setInterval(() => {
      const rows = [...document.querySelectorAll('[data-testid="follow-up"]')];
      const now = rows.filter((item) => item.textContent?.includes("Quick tick")).length;
      if (seen.at(-1) !== now) seen.push(now);
    }, 5);
  });

  // Ticks are saved one at a time, so the second is saved last. A row coming back would
  // show by the time the dashboard has been read again after it.
  let lastSaved = false;
  const readAfterLastSave = page.waitForResponse((reply) => {
    if (isTickSaved(reply, two.id) && reply.ok()) lastSaved = true;
    return lastSaved && reply.request().method() === "GET" && new URL(reply.url()).pathname === "/api/dashboard";
  });

  await row("Quick tick one").getByRole("checkbox").click();
  await row("Quick tick two").getByRole("checkbox").click();
  await expect(page.getByTestId("follow-up").filter({ hasText: "Quick tick" })).toHaveCount(0);
  await readAfterLastSave;

  expect(await page.evaluate(() => (window as unknown as { rowsSeen: number[] }).rowsSeen)).toEqual([2, 1, 0]);
});
