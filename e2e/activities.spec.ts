import { test, expect } from "./fixtures";

test("TE16 log a call with a follow-up on a contact and a deal; newest first; stage changes; deal activity on the main contact", async ({ page }) => {
  await page.goto("/contacts");
  await page.getByRole("searchbox").fill("Karen Willis");
  await page.getByRole("link", { name: "Karen Willis" }).click();

  // TM02 (RV2): the type reads as a labelled choice, not as action buttons.
  const typeChoice = page.getByRole("radiogroup", { name: "Type" });
  await expect(typeChoice).toBeVisible();
  await expect(page.getByText("Type", { exact: true })).toBeVisible();
  await expect(typeChoice.getByRole("radio", { name: "Call" })).toBeChecked();

  await page.getByLabel("What happened").fill("Call about the new budget");
  await page.getByLabel("Follow-up date").fill("2026-11-19");
  await page.getByRole("button", { name: "Log activity" }).click();
  const timeline = page.getByRole("region", { name: "Timeline" }).getByRole("listitem");
  await expect(timeline.first()).toContainText("Call about the new budget");
  await expect(timeline.first().getByLabel("Follow-up 19 Nov, due")).toBeVisible();

  // On the deal where Karen is the main contact.
  await page.getByRole("region", { name: "Deals" }).getByRole("link", { name: "Wilson support renewal" }).click();
  await page.getByRole("radio", { name: "Email" }).check();
  await page.getByLabel("What happened").fill("Sent a new offer");
  await page.getByLabel("Follow-up date").fill("2026-11-12");
  await page.getByLabel("What happened").press("Enter");
  const dealTimeline = page.getByRole("region", { name: "Timeline" }).getByRole("listitem");
  await expect(dealTimeline.first()).toContainText("Sent a new offer");
  await expect(dealTimeline.first().getByLabel("Follow-up 12 Nov, overdue")).toBeVisible();

  // A stage change through the edit form adds an entry.
  await page.getByRole("region", { name: "Details" }).getByRole("button", { name: "Edit" }).click();
  await page.getByRole("dialog").getByLabel("Stage").selectOption("negotiation");
  await page.getByRole("dialog").getByRole("button", { name: "Save deal" }).click();
  await expect(dealTimeline.first()).toContainText("Moved from Lost to Negotiation");

  // Everything shows on Karen's timeline too, newest first, naming the deal.
  await page.getByRole("region", { name: "Details" }).getByRole("link", { name: "Karen Willis" }).click();
  await expect(timeline.nth(0)).toContainText("Moved from Lost to Negotiation");
  await expect(timeline.nth(0)).toContainText("Wilson support renewal");
  await expect(timeline.nth(1)).toContainText("Sent a new offer");
  await expect(timeline.nth(1).getByRole("link", { name: "Wilson support renewal" })).toBeVisible();
  await expect(timeline.nth(2)).toContainText("Call about the new budget");
});

test("TE17 edit and delete an activity, with confirmation", async ({ page }) => {
  await page.goto("/contacts");
  await page.getByRole("searchbox").fill("Karen Willis");
  await page.getByRole("link", { name: "Karen Willis" }).click();
  await page.getByLabel("What happened").fill("Left a voicemail");
  await page.getByRole("button", { name: "Log activity" }).click();
  const entry = page.getByRole("region", { name: "Timeline" }).getByRole("listitem").first();
  await expect(entry).toContainText("Left a voicemail");

  await entry.hover();
  await entry.getByRole("button", { name: "Edit call: Left a voicemail" }).click();
  const panel = page.getByRole("dialog", { name: "Edit activity" });
  await panel.getByLabel("What happened").fill("Left a voicemail about pricing");
  await panel.getByLabel("Follow-up date").fill("2026-11-18");
  await panel.getByRole("button", { name: "Save activity" }).click();
  await expect(panel).toBeHidden();
  await expect(entry).toContainText("Left a voicemail about pricing");

  // Mark done from the timeline.
  await entry.getByRole("button", { name: "Mark done" }).click();
  await expect(entry.getByLabel("Follow-up 18 Nov, done")).toBeVisible();

  await entry.hover();
  await entry.getByRole("button", { name: "Delete call: Left a voicemail about pricing" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete this activity?" });
  await expect(dialog).toContainText("Left a voicemail about pricing");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Left a voicemail about pricing")).toBeVisible();
  await entry.hover();
  await entry.getByRole("button", { name: "Delete call: Left a voicemail about pricing" }).click();
  await page.getByRole("button", { name: "Delete activity" }).click();
  await expect(page.getByText("Left a voicemail about pricing")).toHaveCount(0);
});

test("TE17 changing an activity's type in the edit panel shows on the timeline (RV2)", async ({ page }) => {
  await page.goto("/contacts");
  await page.getByRole("searchbox").fill("Karen Willis");
  await page.getByRole("link", { name: "Karen Willis" }).click();
  const first = page.getByRole("region", { name: "Timeline" }).getByRole("listitem").first();
  const description = (await first.locator(".entry-main > div").first().textContent())!;
  await first.hover();
  await first.getByRole("button", { name: /^Edit / }).click();
  const panel = page.getByRole("dialog", { name: "Edit activity" });
  const type = panel.getByRole("radiogroup", { name: "Type" });
  await expect(type).toBeVisible();
  // The log form's own choice stays on Call while the panel changes this entry's type.
  await panel.getByText("Email", { exact: true }).click();
  await expect(type.getByRole("radio", { name: "Email" })).toBeChecked();
  await expect(page.getByRole("form", { name: "Log activity" }).getByRole("radio", { name: "Call" })).toBeChecked();
  await panel.getByRole("button", { name: "Save activity" }).click();
  await expect(panel).toBeHidden();
  await expect(first.getByRole("button", { name: `Edit email: ${description}` })).toBeAttached();
});
