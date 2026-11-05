import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import {
  addActivity,
  addContact,
  addDeal,
  addLinkedDeal,
  addOrganization,
  emptyDatabase,
  isoDay,
  resetToSampleData,
} from "./helpers";

const API = "/api";

const MONTH = new Date().toLocaleString("en-US", { month: "long" });
const LAST_MONTH = (() => {
  const day = new Date();
  day.setDate(1);
  day.setMonth(day.getMonth() - 1);
  return day.toLocaleString("en-US", { month: "long" });
})();

/** A day in the month before this one. */
function dayLastMonth() {
  return isoDay(-(new Date().getDate() + 3));
}

function dealFor(request: APIRequestContext) {
  return async () => {
    const organization = await addOrganization(request, "Known Co");
    const contact = await addContact(request, "Known Person", organization.id);
    return { organization_id: organization.id, main_contact_id: contact.id };
  };
}

/** Known answers: two wins this month, one last month, three open deals, one late. */
async function knownData(request: APIRequestContext) {
  const links = await dealFor(request)();
  await addDeal(request, "Win one", { ...links, stage: "won", value: 30000, close_date: isoDay(0) });
  await addDeal(request, "Win two", { ...links, stage: "won", value: 12000, close_date: isoDay(0) });
  await addDeal(request, "Win before", { ...links, stage: "won", value: 7000, close_date: dayLastMonth() });
  await addDeal(request, "Open new", { ...links, stage: "new", value: 1000 });
  await addDeal(request, "Open late", { ...links, stage: "proposal", value: 5000, close_date: isoDay(-2) });
  await addDeal(request, "Open late too", { ...links, stage: "proposal", value: 4000, close_date: isoDay(-9) });
  await addDeal(request, "Lost one", { ...links, stage: "lost", value: 9000, close_date: isoDay(0) });
  return links;
}

function section(page: Page, name: string) {
  return page.getByRole("region", { name });
}

test.describe("with a small known dataset", () => {
  test.beforeEach(emptyDatabase);

  test("the summary line and headline figures are right, and each links to its detail", async ({ page, request }) => {
    const links = await knownData(request);
    const deal = await addDeal(request, "With a follow-up", { ...links, value: 0 });
    await addActivity(request, { deal_id: deal.id, description: "Chase", follow_up_date: isoDay(-1) });

    await page.goto("/");
    await expect(page.getByTestId("summary")).toHaveText("1 follow-up overdue and 2 deals running late.");
    await expect(page.getByTestId("revenue-this-month")).toHaveText("$42,000");
    await expect(page.getByTestId("revenue-last-month")).toHaveText(`${LAST_MONTH} $7,000`);
    await expect(page.getByTestId("deals-this-month")).toHaveText("2");
    await expect(page.getByTestId("deals-last-month")).toHaveText(`${LAST_MONTH} 1`);

    const pipeline = section(page, "Open pipeline");
    await expect(pipeline).toContainText("$10,000");
    await expect(pipeline).toContainText("4 open deals");
    await expect(pipeline).toContainText("$3,650");
    await expect(pipeline).toContainText("37% of open pipeline");

    await section(page, "Revenue won")
      .getByRole("link", { name: /Revenue won in/ })
      .click();
    await expect(page).toHaveURL(/\/deals\?stage=won/);
    await expect(page.locator("tbody tr")).toHaveCount(3);

    await page.goto("/");
    await page.getByRole("link", { name: `Deals won in ${MONTH}` }).click();
    await expect(page).toHaveURL(/\/deals\?stage=won/);

    await page.goto("/");
    await pipeline.getByRole("link", { name: /Open pipeline/ }).click();
    await expect(page).toHaveURL(/\/pipeline$/);

    await page.goto("/");
    await pipeline.getByRole("link", { name: /Expected revenue/ }).click();
    await expect(page).toHaveURL(/\/pipeline$/);
  });

  test("the won links show won deals only, whatever anything else is called", async ({ page, request }) => {
    await knownData(request);
    // Each of these would have matched a text search for "won".
    const { organization, contact } = await addLinkedDeal(request, "Wonderland rollout");
    await addDeal(request, "Renewal", { organization_id: organization.id, main_contact_id: contact.id });
    const other = await addOrganization(request, "Swonky Holdings");
    const person = await addContact(request, "Won Lee", other.id);
    await addDeal(request, "Open deal", { organization_id: other.id, main_contact_id: person.id });

    await page.goto("/");
    await section(page, "Revenue won")
      .getByRole("link", { name: /Revenue won in/ })
      .click();
    await expect(page.locator("tbody tr")).toHaveCount(3);
    await expect(page.getByRole("row", { name: /Wonderland rollout/ })).toHaveCount(0);
    await expect(page.getByRole("row", { name: /Swonky Holdings/ })).toHaveCount(0);

    await page.getByRole("button", { name: "Show every stage" }).click();
    await expect(page).not.toHaveURL(/stage=won/);
    await expect(page.getByRole("link", { name: "Wonderland rollout", exact: true })).toHaveCount(1);
  });

  test("the won list works with search, and clearing a search with no matches shows every stage", async ({
    page,
    request,
  }) => {
    await knownData(request);
    await page.goto("/deals?stage=won&q=nothing-like-this");
    await expect(page.getByText("No deals match.")).toBeVisible();
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page).toHaveURL(/\/deals(\?sort=.*)?$/);
    await expect(page.locator("tbody tr").first()).toBeVisible();
  });

  test("the pipeline band shows each open stage's value and count, and links to the Pipeline", async ({
    page,
    request,
  }) => {
    await knownData(request);
    await page.goto("/");
    await expect(page.getByTestId("band-new")).toContainText("$1,000");
    await expect(page.getByTestId("band-new")).toContainText("1 deal");
    await expect(page.getByTestId("band-proposal")).toContainText("$9,000");
    await expect(page.getByTestId("band-proposal")).toContainText("2 deals");
    await expect(page.getByTestId("band-qualified")).toContainText("$0");
    await expect(page.getByTestId("band-negotiation")).toContainText("0 deals");

    await page.getByRole("link", { name: "Open the pipeline" }).click();
    await expect(page).toHaveURL(/\/pipeline$/);
  });

  test("the funnel shows each stage's value and percentage from New down to Won", async ({ page, request }) => {
    await knownData(request);
    await page.goto("/");
    const funnel = section(page, "Sales funnel");
    // Every deal counts for New, and a deal added at Won counts all the way down.
    await expect(funnel.getByText("$68,000")).toBeVisible();
    await expect(funnel.getByText("$49,000", { exact: true })).toHaveCount(2);
    // $58,000 of $68,000 reached Qualified, and $49,000 of $58,000 reached Negotiation.
    await expect(funnel.getByText("85%")).toBeVisible();
    await expect(funnel.getByText("84%")).toBeVisible();
    for (const stage of ["New", "Qualified", "Proposal", "Negotiation", "Won"]) {
      await expect(funnel.getByText(stage, { exact: true })).toBeVisible();
    }
    await expect(funnel.getByText("Lost", { exact: true })).toHaveCount(0);
  });

  test("follow-ups list overdue first, with the Overdue chip, a link, a tick box and the counts in the heading", async ({
    page,
    request,
  }) => {
    const links = await dealFor(request)();
    const deal = await addDeal(request, "Linked deal", links);
    await addActivity(request, { deal_id: deal.id, description: "Later on", follow_up_date: isoDay(9) });
    await addActivity(request, { deal_id: deal.id, description: "Bit late", follow_up_date: isoDay(-1) });
    await addActivity(request, {
      contact_id: links.main_contact_id,
      description: "Very late",
      follow_up_date: isoDay(-9),
    });
    await addActivity(request, { deal_id: deal.id, description: "Due today", follow_up_date: isoDay(0) });

    await page.goto("/");
    const rows = page.getByTestId("follow-up");
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText("Very late");
    await expect(rows.nth(1)).toContainText("Bit late");
    await expect(rows.nth(2)).toContainText("Due today");
    await expect(rows.nth(2)).toContainText("Today");
    await expect(rows.nth(3)).toContainText("Later on");
    await expect(page.getByTestId("follow-up-counts")).toHaveText("2 overdue, 2 upcoming");

    await expect(rows.nth(0).getByText("Overdue")).toBeVisible();
    await expect(rows.nth(2).getByText("Overdue")).toHaveCount(0);
    await expect(rows.nth(0).getByRole("checkbox")).toBeVisible();

    await rows.nth(0).getByRole("link", { name: "Known Person" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Known Person" })).toBeVisible();

    await page.goto("/");
    await rows.nth(1).getByRole("link", { name: "Linked deal" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Linked deal" })).toBeVisible();
  });

  test("recent activity shows the 10 newest, each with a link, and leaves out future ones", async ({
    page,
    request,
  }) => {
    const links = await dealFor(request)();
    const deal = await addDeal(request, "Busy deal", links);
    const hour = 3_600_000;
    for (let number = 0; number < 12; number += 1) {
      await addActivity(request, {
        deal_id: deal.id,
        description: `Entry ${number}`,
        occurred_at: new Date(Date.now() - number * hour).toISOString(),
      });
    }
    await addActivity(request, {
      deal_id: deal.id,
      description: "In the future",
      occurred_at: new Date(Date.now() + 48 * hour).toISOString(),
    });

    await page.goto("/");
    const rows = page.getByTestId("recent-entry");
    await expect(rows).toHaveCount(10);
    await expect(rows.first()).toContainText("Entry 0");
    await expect(rows.last()).toContainText("Entry 9");
    await expect(page.getByText("In the future")).toHaveCount(0);
    await rows.first().getByRole("link", { name: "Busy deal" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Busy deal" })).toBeVisible();
  });

  test("marking a deal won updates this month's revenue and count, and a new follow-up appears", async ({
    page,
    request,
  }) => {
    const links = await dealFor(request)();
    const deal = await addDeal(request, "About to win", { ...links, value: 2500 });

    await page.goto("/");
    await expect(page.getByTestId("revenue-this-month")).toHaveText("$0");
    await expect(page.getByTestId("deals-this-month")).toHaveText("0");

    await request.post(`${API}/deals/${deal.id}/move`, { data: { stage: "won" } });
    await addActivity(request, { deal_id: deal.id, description: "Send the invoice", follow_up_date: isoDay(1) });

    await page.reload();
    await expect(page.getByTestId("revenue-this-month")).toHaveText("$2,500");
    await expect(page.getByTestId("deals-this-month")).toHaveText("1");
    await expect(page.getByTestId("follow-up").filter({ hasText: "Send the invoice" })).toHaveCount(1);
  });

  test("an empty database shows the designed empty states", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("summary")).toHaveText("No follow-ups overdue and no deals running late.");
    await expect(page.getByText("Revenue will show here once you've won a deal.")).toBeVisible();
    await expect(page.getByText("Wins will show here month by month.")).toBeVisible();
    await expect(page.getByText("Deals will show here once you've added some.")).toBeVisible();
    await expect(page.getByText("No follow-ups due.")).toBeVisible();
    await expect(page.getByText("Nothing has happened yet.")).toBeVisible();
    await expect(section(page, "Open pipeline")).toContainText("0% of open pipeline");
    await expect(page.getByText("NaN")).toHaveCount(0);
    await expect(page.getByText("Infinity")).toHaveCount(0);
  });
});

test.describe("with the sample data", () => {
  test.beforeAll(resetToSampleData);

  test("both charts cover 12 months with the current one marked so far, and each has a hover tooltip", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    const months = await (await request.get(`${API}/dashboard`)).json();
    const labels: string[] = months.months.map((month: { label: string }) => month.label);
    expect(labels).toHaveLength(12);

    const revenue = section(page, "Revenue won");
    for (const label of labels) await expect(revenue.locator("svg text", { hasText: label })).toBeVisible();
    await expect(section(page, "Deals won").getByText("so far")).toBeVisible();

    const line = (await revenue.locator(".recharts-surface").boundingBox())!;
    await page.mouse.move(line.x + line.width * 0.5, line.y + line.height * 0.6);
    await expect(revenue.locator(".recharts-tooltip-wrapper")).toContainText("$");

    await page.mouse.move(line.x + line.width - 60, line.y + line.height * 0.6);
    await expect(revenue.locator(".recharts-tooltip-wrapper")).toContainText("so far");

    const bars = (await section(page, "Deals won").locator(".recharts-surface").boundingBox())!;
    await page.mouse.move(bars.x + bars.width * 0.6, bars.y + bars.height * 0.7);
    await expect(section(page, "Deals won").locator(".recharts-tooltip-wrapper")).toContainText(/deals?/);
  });

  test("the funnel has a hover tooltip", async ({ page }) => {
    await page.goto("/");
    const funnel = section(page, "Sales funnel");
    const box = (await funnel.locator(".recharts-surface").boundingBox())!;
    await page.mouse.move(box.x + (box.width - 196) / 2, box.y + 22);
    await expect(funnel.locator(".recharts-tooltip-wrapper")).toContainText("reached New");
  });

  test("the dashboard's own part fits 1440 by 900 with no scrolling, and the Money section fits below it", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("revenue-this-month")).toBeVisible();
    const money = page.getByRole("region", { name: "Money" });
    await expect(money.getByRole("link", { name: /^What we owe/ })).toBeVisible();
    const sizes = await page.evaluate(() => ({
      windowHeight: window.innerHeight,
      width: document.documentElement.scrollWidth,
      windowWidth: window.innerWidth,
    }));
    expect(sizes.width).toBeLessThanOrEqual(sizes.windowWidth);
    for (const name of ["Revenue won", "Deals won", "Sales funnel", "Follow-ups", "Recent activity"]) {
      const box = (await section(page, name).boundingBox())!;
      expect(box.y + box.height, name).toBeLessThanOrEqual(sizes.windowHeight);
    }
    // Sections other areas add come below that screen (H10), and the Money section fits a window of its own.
    expect((await money.boundingBox())!.y).toBeGreaterThanOrEqual(sizes.windowHeight - 40);
    expect((await money.boundingBox())!.height).toBeLessThanOrEqual(sizes.windowHeight);
  });

  test("follow-ups and recent activity each scroll by themselves", async ({ page }) => {
    await page.goto("/");
    const list = section(page, "Follow-ups").getByRole("list");
    await expect(page.getByTestId("follow-up").first()).toBeVisible();
    const scrolls = await list.evaluate((element) => element.scrollHeight > element.clientHeight);
    expect(scrolls).toBe(true);
  });
});
