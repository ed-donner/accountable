import type { Page } from "@playwright/test";
import { apiGet, apiPatch, apiPost, expect, test, uniqueName } from "../fixtures";

type Ref = { id: number; name: string };

function addDays(day: string, days: number) {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

async function makeDeal(request: Parameters<typeof apiPost>[0], name: string) {
  const org = await apiPost<Ref>(request, "/api/organizations", { name: `${name} Org` });
  const contact = await apiPost<Ref>(request, "/api/contacts", { name: `${name} Contact`, organization_id: org.id });
  const deal = await apiPost<Ref>(request, "/api/deals", {
    name: `${name} Deal`,
    organization_id: org.id,
    main_contact_id: contact.id,
    stage: "new",
    value: 20000,
    close_date: "2030-01-01",
  });
  return { org, contact, deal };
}

async function logActivity(page: Page, type: "Note" | "Call" | "Email", description: string, followUp?: string) {
  const box = page.getByRole("form", { name: "Log activity" });
  await box.getByRole("radio", { name: type }).click();
  await box.getByLabel("What happened?").fill(description);
  if (followUp) await box.getByLabel("Follow-up date").fill(followUp);
  await box.getByRole("button", { name: "Log activity" }).click();
  await expect(page.getByText("Activity logged")).toBeVisible();
}

test.describe("Activities and timelines", () => {
  test("one follow-up from start to finish (ACT-1 to ACT-5, success criterion 5)", async ({ page, request }) => {
    const name = uniqueName("E2E Follow");
    const { contact, deal } = await makeDeal(request, name);
    const { today } = await apiGet<{ today: string }>(request, "/api/meta");
    const description = `Call about the scope for ${name}`;

    // Log a call on the deal with a follow-up in 3 days.
    await page.goto(`/deals/${deal.id}`);
    await logActivity(page, "Call", description, addDays(today, 3));
    const onDeal = page.getByRole("list", { name: "Timeline entries" }).getByRole("listitem").filter({ hasText: description });
    await expect(onDeal).toBeVisible();
    await expect(onDeal.getByRole("checkbox")).not.toBeChecked();

    // It shows on the main contact's timeline, naming the deal.
    await page.goto(`/contacts/${contact.id}`);
    const onContact = page.getByRole("list", { name: "Timeline entries" }).getByRole("listitem").filter({ hasText: description });
    await expect(onContact).toBeVisible();
    await expect(onContact.getByRole("link", { name: deal.name })).toBeVisible();

    // And on the dashboard; tick it Done there.
    await page.goto("/");
    const followUps = page.getByRole("list", { name: "Follow-ups" });
    const item = followUps.getByRole("listitem").filter({ hasText: description });
    await expect(item).toBeVisible();
    await item.getByRole("checkbox").click();
    await expect(item).toBeHidden();

    // It shows ticked on the timeline.
    await page.goto(`/deals/${deal.id}`);
    await expect(
      page.getByRole("list", { name: "Timeline entries" }).getByRole("listitem").filter({ hasText: description }).getByRole("checkbox"),
    ).toBeChecked();
  });

  test("a follow-up dated yesterday shows as overdue (ACT-6)", async ({ page, request }) => {
    const name = uniqueName("E2E Overdue");
    const { contact } = await makeDeal(request, name);
    const { today } = await apiGet<{ today: string }>(request, "/api/meta");
    await page.goto(`/contacts/${contact.id}`);
    await logActivity(page, "Email", `Overdue for ${name}`, addDays(today, -1));
    const entry = page.getByRole("listitem").filter({ hasText: `Overdue for ${name}` });
    await expect(entry.getByText(/\(overdue\)/)).toBeVisible();

    await page.goto("/");
    const item = page.getByRole("list", { name: "Follow-ups" }).getByRole("listitem").filter({ hasText: `Overdue for ${name}` });
    await expect(item.getByText("1 day late")).toBeVisible();
  });

  test("edit an activity, then delete it (ACT-4, DEL-6)", async ({ page, request }) => {
    const name = uniqueName("E2E Edit");
    const { deal } = await makeDeal(request, name);
    await page.goto(`/deals/${deal.id}`);
    await logActivity(page, "Note", `First draft ${name}`);
    const entries = page.getByRole("list", { name: "Timeline entries" });

    await entries.getByRole("listitem").filter({ hasText: `First draft ${name}` }).getByRole("button", { name: "Edit this note" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit activity" });
    await dialog.getByRole("radio", { name: "Email" }).click();
    await dialog.getByLabel("Description").fill(`Second draft ${name}\nWith a second line`);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Changes saved")).toBeVisible();
    const edited = entries.getByRole("listitem").filter({ hasText: `Second draft ${name}` });
    await expect(edited).toContainText("Email");
    await expect(edited).toContainText("With a second line");

    await edited.getByRole("button", { name: "Delete this email" }).click();
    const confirm = page.getByRole("alertdialog", { name: /^Delete this email from / });
    await confirm.getByRole("button", { name: "Delete activity" }).click();
    await expect(page.getByText("Activity deleted")).toBeVisible();
    await expect(edited).toBeHidden();
  });

  test("a stage change has no Edit or Delete, and descriptions stay text (ACT-4)", async ({ page, request }) => {
    const name = uniqueName("E2E Stage");
    const { deal } = await makeDeal(request, name);
    await apiPatch(request, `/api/deals/${deal.id}`, { stage: "qualified" });
    await apiPost(request, "/api/activities", {
      type: "note",
      description: "<b>not bold</b>",
      occurred_at: "2026-11-01T10:00:00Z",
      deal_id: deal.id,
    });
    await page.goto(`/deals/${deal.id}`);
    const change = page.locator('[data-entry-type="stage_change"]');
    await expect(change).toContainText("Moved from New to Qualified");
    await expect(change.getByRole("button")).toHaveCount(0);
    await expect(change.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByText("<b>not bold</b>")).toBeVisible();
  });
});
