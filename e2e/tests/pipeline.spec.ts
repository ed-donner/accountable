import type { APIRequestContext, Page } from "@playwright/test";
import { apiGet, apiPost, choose, dragCard, expect, test, uniqueName } from "../fixtures";

type Stage = "new" | "qualified" | "proposal" | "negotiation" | "won" | "lost";
type Deal = {
  id: number;
  name: string;
  stage: Stage;
  value: number;
  probability: number;
  expected_value: number;
  close_date: string;
  is_late: boolean;
};
type Pipeline = { columns: { stage: Stage; deals: Deal[] }[] };

const NAMES: Record<Stage, string> = {
  new: "New",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};
const OPEN: Stage[] = ["new", "qualified", "proposal", "negotiation"];

const money = (value: number) => `$${value.toLocaleString("en-US")}`;

function totals(deals: Deal[]) {
  return {
    count: deals.length,
    value: deals.reduce((sum, deal) => sum + deal.value, 0),
    expected: deals.reduce((sum, deal) => sum + deal.expected_value, 0),
  };
}

const heading = (page: Page, stage: Stage) => page.getByRole("region", { name: NAMES[stage], exact: true });
const column = (page: Page, stage: Stage) => page.getByRole("list", { name: `${NAMES[stage]} deals` });
const cards = (page: Page, stage: Stage) => column(page, stage).getByRole("button");
const cardNamed = (page: Page, name: string) => page.getByRole("button").filter({ hasText: name });

async function expectHeading(page: Page, stage: Stage, figures: { count: number; value: number; expected: number }) {
  const head = heading(page, stage);
  await expect(head.locator('[data-figure="count"]')).toHaveText(String(figures.count));
  await expect(head.locator('[data-figure="value"]')).toHaveText(money(figures.value));
  await expect(head.locator('[data-figure="expected"]')).toHaveText(money(figures.expected));
}

async function columnFigures(request: APIRequestContext, stage: Stage) {
  const pipeline = await apiGet<Pipeline>(request, "/api/pipeline");
  return totals(pipeline.columns.find((c) => c.stage === stage)!.deals);
}

async function makeDeals(request: APIRequestContext, prefix: string, stage: Stage, names: string[], value = 10_000) {
  const org = await apiPost<{ id: number }>(request, "/api/organizations", { name: `${prefix} Org` });
  const made: Deal[] = [];
  for (const name of names) {
    made.push(
      await apiPost<Deal>(request, "/api/deals", {
        name,
        organization_id: org.id,
        stage,
        value,
        close_date: "2030-01-01",
      }),
    );
  }
  return made;
}

test.describe("Pipeline", () => {
  test("each heading's figures match the API, and Won and Lost say what they show (PIPE-1 to PIPE-3)", async ({
    page,
    request,
  }) => {
    const pipeline = await apiGet<Pipeline>(request, "/api/pipeline");
    await page.goto("/pipeline");
    await expect(page).toHaveTitle("Pipeline · Accountable");

    for (const { stage, deals } of pipeline.columns) {
      await expectHeading(page, stage, totals(deals));
      const note = heading(page, stage).getByText("Closed in the last 30 days");
      await expect(note).toHaveCount(OPEN.includes(stage) ? 0 : 1);
      // The cards, in the order the server keeps.
      await expect(cards(page, stage)).toHaveText(
        deals.map((deal) => new RegExp(deal.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))),
      );
    }

    const open = pipeline.columns.filter((c) => OPEN.includes(c.stage)).flatMap((c) => c.deals);
    const late = open.filter((deal) => deal.is_late).length;
    const band = page.locator("section.on-band").first();
    await expect(band.getByText(`${open.length} open deals${late ? `, ${late} of them late` : ""}`)).toBeVisible();
    await expect(band.getByText(money(totals(open).value), { exact: true })).toBeVisible();
    await expect(band.getByText(money(totals(open).expected), { exact: true })).toBeVisible();
  });

  test("dragging to another column changes the board at once, and the change is kept (PIPE-5, PIPE-6, success criterion 4)", async ({
    page,
    request,
  }) => {
    const name = uniqueName("E2E Drag");
    const [deal] = await makeDeals(request, name, "new", [name], 40_000);
    const newBefore = await columnFigures(request, "new");
    const negotiationBefore = await columnFigures(request, "negotiation");
    const open = (await apiGet<Pipeline>(request, "/api/pipeline")).columns
      .filter((c) => OPEN.includes(c.stage))
      .flatMap((c) => c.deals);

    await page.goto("/pipeline");
    await expect(cardNamed(page, name)).toBeVisible();

    // Hold the save, to see that the board changes before the server answers.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/deals/*/move", async (route) => {
      await held;
      await route.continue();
    });

    await dragCard(page, cardNamed(page, name), column(page, "negotiation"), "above");
    await expect(cards(page, "negotiation").first()).toContainText(name);
    await expectHeading(page, "negotiation", {
      count: negotiationBefore.count + 1,
      value: negotiationBefore.value + 40_000,
      expected: negotiationBefore.expected + 30_000,
    });
    await expectHeading(page, "new", {
      count: newBefore.count - 1,
      value: newBefore.value - 40_000,
      expected: newBefore.expected - 4_000,
    });
    const band = page.locator("section.on-band").first();
    await expect(band.getByText(money(totals(open).expected - 4_000 + 30_000), { exact: true })).toBeVisible();

    release();
    await expect(page.getByText("Deal moved to Negotiation")).toBeVisible();
    await page.unrouteAll({ behavior: "wait" });

    // The Deals table shows the new stage and probability.
    await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Deals" }).click();
    await page.getByRole("searchbox", { name: "Search deals" }).fill(name);
    const row = page.locator("tbody tr").first();
    await expect(row).toContainText("Negotiation");
    await expect(row).toContainText("75%");

    // The deal's page shows the stage change.
    await page.goto(`/deals/${deal.id}`);
    await expect(page.locator('[data-entry-type="stage_change"]').first()).toContainText(
      "Moved from New to Negotiation",
    );

    // A refresh keeps it.
    await page.goto("/pipeline");
    await expect(cards(page, "negotiation").first()).toContainText(name);
  });

  test("a card held in the gap between two columns stays put, then drops (PIPE-5)", async ({ page, request }) => {
    // Going by the card's outline here once made it bounce between Proposal and
    // Negotiation until React stopped with "Maximum update depth exceeded".
    const name = uniqueName("E2E Gap");
    await makeDeals(request, name, "new", [name]);
    await page.goto("/pipeline");
    const card = cardNamed(page, name);
    const from = (await card.boundingBox())!;
    const proposal = (await column(page, "proposal").boundingBox())!;
    const negotiation = (await column(page, "negotiation").boundingBox())!;
    const gapX = (proposal.x + proposal.width + negotiation.x) / 2;
    const y = proposal.y + 40;

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, { steps: 4 });
    await page.mouse.move(proposal.x + proposal.width / 2, y, { steps: 12 });
    for (let step = 0; step < 6; step += 1) {
      await page.mouse.move(gapX + (step % 2), y + step, { steps: 2 });
      await page.waitForTimeout(100);
    }
    await page.mouse.move(negotiation.x + negotiation.width / 2, negotiation.y + 12, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByText("Deal moved to Negotiation")).toBeVisible();
    await expect(cards(page, "negotiation").filter({ hasText: name })).toHaveCount(1);
  });

  test("a card dropped higher in its own column stays there after a refresh (PIPE-5)", async ({ page, request }) => {
    const prefix = uniqueName("E2E Order");
    const [first, second, third] = [`${prefix} A`, `${prefix} B`, `${prefix} C`];
    // Each new deal goes to the top, so the column starts C, B, A.
    await makeDeals(request, prefix, "proposal", [first, second, third]);

    await page.goto("/pipeline");
    const top3 = () => cards(page, "proposal").filter({ hasText: prefix });
    await expect(top3()).toHaveText([new RegExp(third), new RegExp(second), new RegExp(first)]);

    await dragCard(page, cardNamed(page, first), cardNamed(page, third), "above");
    await expect(top3()).toHaveText([new RegExp(first), new RegExp(third), new RegExp(second)]);
    // A move within a column says nothing, so wait for the save itself.
    await expect
      .poll(async () => {
        const pipeline = await apiGet<Pipeline>(request, "/api/pipeline");
        return pipeline.columns
          .find((c) => c.stage === "proposal")!
          .deals.filter((deal) => deal.name.startsWith(prefix))
          .map((deal) => deal.name);
      })
      .toEqual([first, third, second]);

    await page.reload();
    await expect(top3()).toHaveText([new RegExp(first), new RegExp(third), new RegExp(second)]);
    await expect(cards(page, "proposal").first()).toContainText(first);
  });

  test("a card dragged to Won closes today, at 100% (STG-2)", async ({ page, request }) => {
    const name = uniqueName("E2E Win");
    const [deal] = await makeDeals(request, name, "negotiation", [name], 12_000);
    const { today } = await apiGet<{ today: string }>(request, "/api/meta");
    const [y, m, d] = today.split("-").map(Number);
    const todayText = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });

    await page.goto("/pipeline");
    await dragCard(page, cardNamed(page, name), column(page, "won"));
    await expect(page.getByText("Deal moved to Won")).toBeVisible();
    const card = cards(page, "won").filter({ hasText: name });
    await expect(card).toContainText(todayText);
    await expect(card).not.toContainText("Late");

    const saved = await apiGet<Deal>(request, `/api/deals/${deal.id}`);
    expect(saved).toMatchObject({ stage: "won", probability: 100, close_date: today });
  });

  test("the keyboard moves a card, and Escape puts it back (PIPE-8)", async ({ page, request }) => {
    const name = uniqueName("E2E Keys");
    const [deal] = await makeDeals(request, name, "new", [name]);
    await page.goto("/pipeline");

    await cardNamed(page, name).focus();
    await page.keyboard.press("Space");
    await expect(page.getByText(`Picked up ${name}.`)).toBeAttached();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText(new RegExp(`${name} is over Qualified`))).toBeAttached();
    await page.keyboard.press("Space");
    await expect(page.getByText("Deal moved to Qualified")).toBeVisible();
    await expect(cards(page, "qualified").filter({ hasText: name })).toHaveCount(1);
    expect((await apiGet<Deal>(request, `/api/deals/${deal.id}`)).stage).toBe("qualified");

    // Escape puts it back where it was, and nothing is saved.
    let moves = 0;
    page.on("request", (r) => {
      if (r.url().includes("/move")) moves += 1;
    });
    await cardNamed(page, name).focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText(new RegExp(`${name} is over Proposal`))).toBeAttached();
    await page.keyboard.press("Escape");
    await expect(page.getByText(`${name} was put back where it was.`)).toBeAttached();
    await expect(cards(page, "qualified").filter({ hasText: name })).toHaveCount(1);
    await expect(cards(page, "proposal").filter({ hasText: name })).toHaveCount(0);
    expect(moves).toBe(0);
    expect((await apiGet<Deal>(request, `/api/deals/${deal.id}`)).stage).toBe("qualified");
  });

  test("a failed save puts the card back and says so (PIPE-6)", async ({ page, request, allowApiError }) => {
    const name = uniqueName("E2E Fail");
    const [deal] = await makeDeals(request, name, "new", [name]);
    const newBefore = await columnFigures(request, "new");
    const proposalBefore = await columnFigures(request, "proposal");

    allowApiError({ status: 500, url: "/move" });
    await page.route("**/api/deals/*/move", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Made to fail by the test" }),
      }),
    );
    await page.goto("/pipeline");
    await dragCard(page, cardNamed(page, name), column(page, "proposal"), "above");

    await expect(page.getByText("Couldn't move the deal. Try again.")).toBeVisible();
    await expect(cards(page, "new").filter({ hasText: name })).toHaveCount(1);
    await expect(cards(page, "proposal").filter({ hasText: name })).toHaveCount(0);
    await expectHeading(page, "new", newBefore);
    await expectHeading(page, "proposal", proposalBefore);
    expect((await apiGet<Deal>(request, `/api/deals/${deal.id}`)).stage).toBe("new");
  });

  test("Add deal in a column starts at that stage, and the card goes to the top (PIPE-7)", async ({ page }) => {
    const name = uniqueName("E2E Column add");
    await page.goto("/pipeline");
    await page.getByRole("button", { name: "Add deal in Qualified" }).click();
    const dialog = page.getByRole("dialog", { name: "Add deal" });
    await expect(dialog.getByLabel("Stage")).toHaveText("Qualified");
    await expect(dialog.getByLabel("Probability")).toHaveValue("25");
    await dialog.getByLabel("Name").fill(name);
    await choose(page, dialog.getByLabel("Organization"), "Bluefin Logistics");
    await dialog.getByLabel("Value").fill("9,000");
    await dialog.getByRole("button", { name: "Add deal" }).click();
    await expect(page.getByText("Deal added")).toBeVisible();
    await expect(cards(page, "qualified").first()).toContainText(name);
    await expect(cards(page, "qualified").first()).toContainText("$9,000");
  });

  test("a click or Enter on a card opens its deal (PIPE-4)", async ({ page, request }) => {
    const name = uniqueName("E2E Open");
    const [deal] = await makeDeals(request, name, "qualified", [name]);

    await page.goto("/pipeline");
    await cardNamed(page, name).click();
    await expect(page).toHaveURL(`/deals/${deal.id}`);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

    await page.goBack();
    await cardNamed(page, name).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`/deals/${deal.id}`);
  });
});
