import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { addActivity, addLinkedDeal, isoDay, resetToSampleData } from "./helpers";

test.beforeAll(resetToSampleData);

function entries(page: Page) {
  return page.getByTestId("timeline-entry");
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

test("a note, call and email can be logged from a contact and a deal, with a follow-up, and show newest first", async ({ page, request }) => {
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

test("an activity on a deal shows on its main contact's and organization's timelines, once each", async ({ page, request }) => {
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

test("a stage change shows in recent activity", async ({ page, request }) => {
  const { deal } = await addLinkedDeal(request, "Recently moved");
  await request.post(`http://localhost:5199/api/deals/${deal.id}/move`, { data: { stage: "negotiation" } });

  await page.goto("/");
  const entry = page.getByTestId("recent-entry").filter({ hasText: "Moved from New to Negotiation" });
  await expect(entry).toHaveCount(1);
  await expect(entry.getByRole("link", { name: "Recently moved" })).toBeVisible();
});

test("activities can be edited and deleted from any timeline they're on, and stage-change entries can't", async ({ page, request }) => {
  const { deal, contact } = await addLinkedDeal(request, "Changing");
  await addActivity(request, { deal_id: deal.id, description: "Original words" });
  await request.post(`http://localhost:5199/api/deals/${deal.id}/move`, { data: { stage: "qualified" } });

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
  await expect(page.getByRole("alertdialog")).toContainText("It will be removed from every timeline and from the dashboard.");
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

test("a follow-up can be ticked done on the dashboard, leaving it but not the timeline", async ({ page, request }) => {
  const { deal } = await addLinkedDeal(request, "Tick on dashboard");
  await addActivity(request, { deal_id: deal.id, description: "Ring them back", follow_up_date: isoDay(-40) });

  await page.goto("/");
  const row = page.getByTestId("follow-up").filter({ hasText: "Ring them back" });
  await expect(row).toHaveCount(1);
  await row.getByRole("checkbox").click();
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
  await addActivity(request, { deal_id: deal.id, description: "Send the deck", follow_up_date: isoDay(2) });

  await page.goto(`/deals/${deal.id}`);
  const entry = entries(page).filter({ hasText: "Send the deck" });
  await entry.getByRole("checkbox").click();
  await expect(entry).toContainText("Done");

  await page.goto("/");
  await expect(page.getByTestId("follow-up").first()).toBeVisible();
  await expect(page.getByTestId("follow-up").filter({ hasText: "Send the deck" })).toHaveCount(0);

  await page.goto(`/deals/${deal.id}`);
  await entry.getByRole("checkbox").click();
  await expect(entry.getByText("Done", { exact: true })).toHaveCount(0);

  await page.goto("/");
  await expect(page.getByTestId("follow-up").filter({ hasText: "Send the deck" })).toHaveCount(1);
});
