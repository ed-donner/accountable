import type { Page } from "@playwright/test";
import { apiGet, apiPost, expect, test, uniqueName } from "../fixtures";

type Stage = "new" | "qualified" | "proposal" | "negotiation" | "won" | "lost";
type Ref = { id: number; name: string };
type Entry = { id: number; type: string; description: string; contact: Ref | null; deal: Ref | null };
type Dashboard = {
  today: string;
  open_pipeline: { value: number; count: number };
  expected_revenue: number;
  won_this_month: { value: number; count: number; last_month_value: number };
  follow_up_counts: { overdue: number; due_soon: number };
  months: { month: string; revenue: number; deals: number }[];
  funnel: { stage: Stage; count: number; value: number }[];
  open_by_stage: { stage: Stage; count: number; value: number; expected: number }[];
  follow_ups: (Entry & { follow_up_date: string; days_late: number })[];
  recent: Entry[];
};

const NAMES: Record<Stage, string> = {
  new: "New",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};
const money = (value: number) => `$${value.toLocaleString("en-US")}`;
const deals = (count: number) => `${count} ${count === 1 ? "deal" : "deals"}`;
const monthDate = (month: string) => new Date(`${month}-01T00:00:00Z`);
const shortMonth = (month: string) => monthDate(month).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
const longMonth = (month: string) =>
  monthDate(month).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

const figure = (page: Page, id: string) => page.locator(`[data-figure="${id}"]`);

/** Hover over the last month of a chart, where its x-axis label sits. */
async function hoverLastMonth(page: Page, chart: string) {
  const box = page.locator(`[data-chart="${chart}"]`);
  const label = (await box.locator(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value").last().boundingBox())!;
  const area = (await box.boundingBox())!;
  await page.mouse.move(label.x + label.width / 2, area.y + area.height / 2, { steps: 4 });
  return box.locator(".recharts-tooltip-wrapper");
}

test.describe("Dashboard", () => {
  test("the headline figures and the strip match the API (DASH-1, DASH-2, DASH-6)", async ({ page, request }) => {
    const data = await apiGet<Dashboard>(request, "/api/dashboard");
    await page.goto("/");
    await expect(page).toHaveTitle("Dashboard · Accountable");
    const [y, m, d] = data.today.split("-").map(Number);
    const dateLine = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
    await expect(page.getByText(dateLine, { exact: true })).toBeVisible();

    await expect(figure(page, "open-pipeline")).toContainText(money(data.open_pipeline.value));
    await expect(figure(page, "open-pipeline")).toContainText(`${data.open_pipeline.count} open deal`);
    await expect(figure(page, "expected-revenue")).toContainText(money(data.expected_revenue));
    await expect(figure(page, "won-this-month")).toContainText(money(data.won_this_month.value));
    await expect(figure(page, "won-this-month")).toContainText(
      `${deals(data.won_this_month.count)}. Last month ${money(data.won_this_month.last_month_value)}`,
    );
    await expect(figure(page, "follow-ups")).toContainText(`${data.follow_up_counts.overdue} overdue`);
    await expect(figure(page, "follow-ups")).toContainText(`${data.follow_up_counts.due_soon} due in the next 7 days`);

    const strip = page.getByRole("list", { name: "Open pipeline by stage" });
    await expect(strip.getByRole("listitem")).toHaveCount(4);
    for (const stage of data.open_by_stage) {
      const segment = strip.locator(`[data-stage="${stage.stage}"]`);
      await expect(segment).toContainText(NAMES[stage.stage]);
      await expect(segment.locator('[data-figure="value"]')).toHaveText(money(stage.value));
      await expect(segment.locator('[data-figure="expected"]')).toHaveText(money(stage.expected));
    }
  });

  test("both charts show 12 months, with totals, and hovering shows full figures (DASH-3, DASH-4, DASH-9)", async ({
    page,
    request,
  }) => {
    const data = await apiGet<Dashboard>(request, "/api/dashboard");
    const labels = data.months.map((m) => shortMonth(m.month));
    const last = data.months[data.months.length - 1];
    await page.goto("/");

    const revenue = page.locator('[data-chart="revenue"]');
    await expect(revenue.locator(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value")).toHaveText(labels);
    await expect(page.getByRole("region", { name: "Revenue won" }).locator('[data-figure="total"]')).toHaveText(
      money(sum(data.months.map((m) => m.revenue))),
    );
    const revenueTip = await hoverLastMonth(page, "revenue");
    await expect(revenueTip).toContainText(longMonth(last.month));
    await expect(revenueTip).toContainText(`${money(last.revenue)} won`);

    const won = page.locator('[data-chart="deals-won"]');
    await expect(won.locator(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value")).toHaveText(labels);
    await expect(page.getByRole("region", { name: "Deals won" }).locator('[data-figure="total"]')).toHaveText(
      String(sum(data.months.map((m) => m.deals))),
    );
    const wonTip = await hoverLastMonth(page, "deals-won");
    await expect(wonTip).toContainText(longMonth(last.month));
    await expect(wonTip).toContainText(`${deals(last.deals)} won`);
  });

  test("the funnel shows its five steps, with the share carried on (DASH-5)", async ({ page, request }) => {
    const data = await apiGet<Dashboard>(request, "/api/dashboard");
    await page.goto("/");
    const funnel = page.getByRole("list", { name: "Sales funnel" });
    const steps = funnel.locator("[data-stage]");
    await expect(steps).toHaveCount(5);
    for (const [i, step] of data.funnel.entries()) {
      const row = steps.nth(i);
      await expect(row).toContainText(NAMES[step.stage]);
      await expect(row.locator('[data-figure="value"]')).toHaveText(money(step.value));
      await expect(row.locator('[data-figure="count"]')).toHaveText(deals(step.count));
      if (i > 0 && data.funnel[i - 1].value > 0) {
        const share = Math.round((step.value / data.funnel[i - 1].value) * 100);
        await expect(funnel.getByText(`${share}% carried on`).first()).toBeVisible();
      }
    }
  });

  test("follow-ups and recent activity link to their records (DASH-7, DASH-8)", async ({ page, request }) => {
    const data = await apiGet<Dashboard>(request, "/api/dashboard");
    await page.goto("/");

    const first = data.follow_ups[0];
    const followUps = page.getByRole("list", { name: "Follow-ups" });
    await expect(followUps.getByRole("listitem")).toHaveCount(data.follow_ups.length);
    const late = data.follow_ups.find((f) => f.days_late > 0);
    if (late) {
      const text = `${late.days_late} ${late.days_late === 1 ? "day" : "days"} late`;
      await expect(followUps.getByRole("listitem").filter({ hasText: late.description.slice(0, 30) })).toContainText(text);
    }
    const target = first.deal ? { path: `/deals/${first.deal.id}`, name: first.deal.name } : { path: `/contacts/${first.contact!.id}`, name: first.contact!.name };
    await followUps.getByRole("listitem").first().getByRole("link", { name: target.name }).click();
    await expect(page).toHaveURL(target.path);

    await page.goBack();
    const recent = page.getByRole("list", { name: "Recent activity" });
    await expect(recent.getByRole("listitem")).toHaveCount(Math.min(10, data.recent.length));
    const entry = data.recent[0];
    const link = entry.deal ? { path: `/deals/${entry.deal.id}`, name: entry.deal.name } : { path: `/contacts/${entry.contact!.id}`, name: entry.contact!.name };
    await expect(recent.getByRole("listitem").first()).toContainText(entry.description);
    await recent.getByRole("listitem").first().getByRole("link", { name: link.name }).click();
    await expect(page).toHaveURL(link.path);
  });

  test("a deal moved to Won raises the month's figures and shows in recent activity (success criterion 6)", async ({
    page,
    request,
  }) => {
    const name = uniqueName("E2E Big win");
    const org = await apiPost<Ref>(request, "/api/organizations", { name: `${name} Org` });
    const deal = await apiPost<Ref>(request, "/api/deals", {
      name,
      organization_id: org.id,
      stage: "negotiation",
      value: 7_000,
      close_date: "2030-01-01",
    });
    const before = await apiGet<Dashboard>(request, "/api/dashboard");
    const thisMonth = before.months[before.months.length - 1];

    // Move it with the stage bar, then go to the dashboard without reloading.
    await page.goto(`/deals/${deal.id}`);
    await page.getByRole("navigation", { name: "Stage" }).getByRole("button", { name: "Move to Won" }).click();
    await expect(page.getByText("Deal moved to Won")).toBeVisible();
    await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Dashboard" }).click();

    await expect(figure(page, "won-this-month")).toContainText(money(before.won_this_month.value + 7_000));
    await expect(figure(page, "won-this-month")).toContainText(deals(before.won_this_month.count + 1));
    await expect(page.getByRole("region", { name: "Revenue won" }).locator('[data-figure="total"]')).toHaveText(
      money(sum(before.months.map((m) => m.revenue)) + 7_000),
    );
    const tip = await hoverLastMonth(page, "revenue");
    await expect(tip).toContainText(`${money(thisMonth.revenue + 7_000)} won`);

    const latest = page.getByRole("list", { name: "Recent activity" }).getByRole("listitem").first();
    await expect(latest).toContainText("Moved from Negotiation to Won");
    await expect(latest.getByRole("link", { name })).toHaveAttribute("href", `/deals/${deal.id}`);
  });
});
