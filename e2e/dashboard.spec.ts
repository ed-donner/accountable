import { test, expect, API, TODAY } from "./fixtures";

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

async function figures(request: import("@playwright/test").APIRequestContext) {
  const response = await request.get(`${API}/dashboard`, { headers: { "X-Local-Date": TODAY } });
  return response.json();
}

test("TE18 every figure, chart and list matches the data; each headline links to the right screen", async ({ page, request }) => {
  const data = await figures(request);
  await page.goto("/");
  await expect(page.getByText("Monday 16 November 2026")).toBeVisible();

  const tiles = page.getByRole("region", { name: "Headline figures" });
  await expect(tiles.getByRole("link", { name: `Open pipeline: ${money(data.headline.open_value)}` })).toContainText(`${data.headline.open_count} open deals`);
  await expect(tiles.getByRole("link", { name: `Expected revenue: ${money(data.headline.expected_revenue)}` })).toBeVisible();
  await expect(tiles.getByRole("link", { name: `Won this month: ${money(data.headline.won_this_month_value)}` })).toBeVisible();
  await expect(tiles.getByRole("link", { name: `Follow-ups due: ${data.headline.follow_ups_due}` })).toContainText(
    `${data.headline.follow_ups_overdue} overdue`,
  );

  // The charts carry their figures.
  const revenue = page.getByRole("img", { name: /^Revenue won per month/ });
  for (const m of data.months) await expect(revenue).toHaveAttribute("aria-label", new RegExp(money(m.won_value).replace("$", "\\$")));
  await expect(page.getByRole("img", { name: /^Deals won and lost per month/ })).toHaveAttribute(
    "aria-label",
    new RegExp(`Nov 2026 ${data.months[11].won_count} won, ${data.months[11].lost_count} lost`),
  );
  await expect(page.locator(".recharts-surface").first()).toBeVisible();

  // Funnel and pipeline by stage.
  const funnel = page.getByRole("list", { name: "Sales funnel" }).getByRole("listitem");
  await expect(funnel).toHaveCount(5);
  await expect(funnel.nth(0)).toContainText(`${data.funnel[0].count} deals`);
  await expect(funnel.nth(4)).toContainText(`${Math.round(data.funnel[4].share_of_previous * 100)}% of previous`);
  for (const s of data.pipeline) {
    await expect(page.getByRole("region", { name: "Open pipeline by stage" })).toContainText(`${money(s.value)} / ${money(s.expected_revenue)}`);
  }

  // Follow-ups, overdue first, and recent activity.
  const follow = page.getByRole("region", { name: "Follow-ups" }).getByRole("listitem");
  await expect(follow).toHaveCount(data.follow_ups.length);
  await expect(follow.first()).toContainText(data.follow_ups[0].description);
  await expect(follow.first().locator(".chip.overdue")).toBeVisible();
  await expect(page.getByRole("region", { name: "Recent activity" }).getByRole("listitem")).toHaveCount(10);

  // Each headline is one click from the answer.
  await tiles.getByRole("link", { name: /^Open pipeline/ }).click();
  await expect(page).toHaveURL(/\/pipeline$/);
  await page.goto("/");
  await tiles.getByRole("link", { name: /^Won this month/ }).click();
  await expect(page).toHaveURL(/\/deals\?stage=won$/);
  await expect(page.getByLabel("Filter by stage")).toHaveValue("won");
  await page.goto("/");
  await tiles.getByRole("link", { name: /^Follow-ups due/ }).click();
  await expect(page).toHaveURL(/#follow-ups$/);
  await expect(page.getByRole("region", { name: "Follow-ups" })).toBeInViewport();
  // A customer's last contact is one click away too.
  await follow.first().getByRole("link").click();
  await expect(page.getByRole("region", { name: "Timeline" })).toBeVisible();
});

test("TE19 a won deal and a new follow-up show on the dashboard; Mark done removes it", async ({ page, request }) => {
  const before = (await figures(request)).headline;
  await page.goto("/pipeline");
  // Win a deal from the deal's page.
  await page.goto("/deals");
  await page.getByRole("searchbox").fill("Logan second site expansion");
  await page.getByRole("button", { name: "Edit Logan second site expansion" }).click();
  await page.getByRole("dialog").getByLabel("Stage").selectOption("won");
  await page.getByRole("dialog").getByRole("button", { name: "Save deal" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  // Log a follow-up due tomorrow on a contact.
  await page.goto("/contacts");
  await page.getByRole("searchbox").fill("Karen Willis");
  await page.getByRole("link", { name: "Karen Willis" }).click();
  await page.getByLabel("What happened").fill("Send the signed order form");
  await page.getByLabel("Follow-up date").fill("2026-11-17");
  await page.getByRole("button", { name: "Log activity" }).click();
  await expect(page.getByRole("region", { name: "Timeline" }).getByText("Send the signed order form")).toBeVisible();

  // The dashboard shows both, with no refresh.
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Dashboard" }).click();
  const tiles = page.getByRole("region", { name: "Headline figures" });
  await expect(tiles.getByRole("link", { name: `Won this month: ${money(before.won_this_month_value + 9000)}` })).toBeVisible();
  await expect(tiles.getByRole("link", { name: `Open pipeline: ${money(before.open_value - 9000)}` })).toBeVisible();
  const recent = page.getByRole("region", { name: "Recent activity" }).getByRole("listitem");
  await expect(recent.first()).toContainText("Send the signed order form");
  await expect(page.getByRole("region", { name: "Recent activity" })).toContainText("Moved from Negotiation to Won");
  const follow = page.getByRole("region", { name: "Follow-ups" });
  const item = follow.getByRole("listitem").filter({ hasText: "Send the signed order form" });
  await expect(item).toContainText("17 Nov");

  await item.getByRole("button", { name: "Mark done: Send the signed order form" }).click();
  await expect(item).toHaveCount(0);
});
