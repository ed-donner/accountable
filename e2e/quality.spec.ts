import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { SIGNED_IN, addActivity, addLinkedDeal, card, column, dropAtEnd, isoDay, resetToSampleData } from "./helpers";

test.beforeAll(resetToSampleData);

const SECTIONS = ["/", "/organizations", "/contacts", "/deals", "/pipeline"];
const SIZES = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
];

async function recordPaths(request: APIRequestContext) {
  const get = async (route: string) => (await (await request.get(`/api${route}`)).json())[0].id;
  return [
    `/organizations/${await get("/organizations")}`,
    `/contacts/${await get("/contacts")}`,
    `/deals/${await get("/deals")}`,
  ];
}

for (const size of SIZES) {
  test(`no screen scrolls sideways at ${size.width} by ${size.height}`, async ({ page, request }) => {
    await page.setViewportSize(size);
    for (const path of [...SECTIONS, ...(await recordPaths(request))]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
}

test("a walk through every screen and main action logs no console errors", async ({ page, request }) => {
  const { deal, contact, organization } = await addLinkedDeal(request, "Walked");
  for (const path of SECTIONS) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  for (const path of [`/organizations/${organization.id}`, `/contacts/${contact.id}`, `/deals/${deal.id}`]) {
    await page.goto(path);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toContainText("This can't be undone.");
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  }
  await page.goto(`/deals/${deal.id}`);
  await page.getByRole("button", { name: "Log activity" }).click();
  await page.getByRole("dialog").getByLabel("Description").fill("Walked through it");
  await page.getByRole("dialog").getByRole("button", { name: "Save activity" }).click();
  await expect(page.getByTestId("timeline-entry").first()).toContainText("Walked through it");

  await page.goto("/pipeline");
  await expect(card(page, "Walked")).toBeVisible();
  await dropAtEnd(page, "Walked", "lost");
  await expect(column(page, "lost").locator('[data-deal="Walked"]')).toBeVisible();
  await page.waitForLoadState("networkidle");
});

async function tabThrough(page: Page, presses: number) {
  const reached = new Set<string>();
  for (let press = 0; press < presses; press += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) return null;
      const style = getComputedStyle(element);
      // cmdk labels its input through a hidden label element.
      const labelledBy = element.getAttribute("aria-labelledby");
      const label =
        element.getAttribute("aria-label") ?? (labelledBy && document.getElementById(labelledBy)?.textContent);
      return {
        name: `${element.tagName} ${label || element.textContent?.trim().slice(0, 30)}`,
        ring: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2,
      };
    });
    if (!focused) continue;
    expect(focused.ring, `No focus ring on ${focused.name}`).toBe(true);
    reached.add(focused.name);
  }
  return reached;
}

test("every control can be reached by Tab and shows a focus ring", async ({ page }) => {
  await page.goto("/organizations");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  const table = await tabThrough(page, 20);
  for (const name of [
    "A Dashboard",
    "A Deals",
    "INPUT Search organizations, contacts and deals",
    `BUTTON Menu for ${SIGNED_IN.name}`,
    "BUTTON Add organization",
    "INPUT Search organizations",
    "BUTTON Name",
  ]) {
    expect([...table], name).toContain(name);
  }
  expect([...table].some((name) => name.startsWith("BUTTON Edit "))).toBe(true);
  expect([...table].some((name) => name.startsWith("BUTTON Delete "))).toBe(true);

  await page.goto("/");
  await expect(page.getByTestId("follow-up").first()).toBeVisible();
  const dashboard = await tabThrough(page, 18);
  expect([...dashboard].some((name) => name.startsWith("INPUT Mark "))).toBe(true);
  expect([...dashboard]).toContain("A Open the pipeline");

  await page.goto("/pipeline");
  await expect(page.locator("[data-deal]").first()).toBeVisible();
  const board = await tabThrough(page, 12);
  expect([...board].some((name) => name.startsWith("BUTTON Add deal to "))).toBe(true);
  expect([...board].some((name) => name.startsWith("A $"))).toBe(true);
});

/** Opens the dashboard from another screen and records the revenue line on every frame while it mounts. */
async function lineFrames(page: Page) {
  await page.goto("/deals");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  const frames = page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const seen = new Set<string>();
        const start = performance.now();
        const sample = () => {
          const line = document.querySelector(".recharts-line-curve");
          if (line) seen.add(line.getAttribute("stroke-dasharray") ?? "none");
          if (performance.now() - start < 2500) requestAnimationFrame(sample);
          else resolve([...seen]);
        };
        requestAnimationFrame(sample);
      }),
  );
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Dashboard" }).click();
  return frames;
}

test("the revenue line draws in on load", async ({ page }) => {
  expect((await lineFrames(page)).length).toBeGreaterThan(1);
});

test("with reduced motion set, nothing animates", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect((await lineFrames(page)).length).toBe(1);

  await page.goto("/deals");
  await page.getByRole("button", { name: "Add deal" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const running = await page.evaluate(
    () => document.getAnimations().filter((item) => item.playState === "running").length,
  );
  expect(running).toBe(0);
});

test("after the browser reports offline, a drag and a follow-up tick still save", async ({ page, request }) => {
  const { deal } = await addLinkedDeal(request, "Offline drag");
  await addActivity(request, { deal_id: deal.id, description: "Offline tick", follow_up_date: isoDay(-200) });

  await page.goto("/pipeline");
  await expect(card(page, "Offline drag")).toBeVisible();
  // Only the browser's report changes: the backend is still there on this computer,
  // and that's exactly what TanStack Query would otherwise wrongly pause for.
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));

  await dropAtEnd(page, "Offline drag", "qualified");
  await expect(column(page, "qualified").locator('[data-deal="Offline drag"]')).toBeVisible();
  await expect.poll(async () => (await (await request.get(`/api/deals/${deal.id}`)).json()).stage).toBe("qualified");

  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Dashboard" }).click();
  await page.getByTestId("follow-up").filter({ hasText: "Offline tick" }).getByRole("checkbox").click();
  await expect
    .poll(async () => {
      const timeline = await (await request.get(`/api/deals/${deal.id}/timeline`)).json();
      return timeline.entries.find((entry: { description: string }) => entry.description === "Offline tick")
        .follow_up_done;
    })
    .toBe(true);
});

test("the run uses the installed Chrome", async ({ page, browser, browserName }) => {
  expect(browserName).toBe("chromium");
  await page.goto("/");
  const brands = await page.evaluate(() =>
    (navigator as Navigator & { userAgentData: { brands: { brand: string }[] } }).userAgentData.brands.map(
      (item) => item.brand,
    ),
  );
  expect(brands).toContain("Google Chrome");
  expect(browser.version()).toMatch(/^\d+\./);
});

test.describe("a tab left open past midnight", () => {
  const PAST_MIDNIGHT = "03:00";

  function shownDate(offsetDays: number) {
    const day = new Date();
    day.setDate(day.getDate() + offsetDays);
    return day.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  /** Only the browser's clock moves, so the backend stays on today, as it does before midnight. */
  async function openBeforeMidnight(page: Page, path: string) {
    const tonight = new Date();
    tonight.setHours(23, 58, 0, 0);
    await page.clock.install({ time: tonight });
    await page.goto(path);
    await expect(page.getByRole("banner")).toContainText(shownDate(0));
  }

  test("the top bar and a pipeline card move on by themselves", async ({ page, request }) => {
    await addLinkedDeal(request, "Due on the board", { close_date: isoDay() });
    await openBeforeMidnight(page, "/pipeline");
    await expect(card(page, "Due on the board")).toBeVisible();
    await expect(card(page, "Due on the board").getByText("Late")).toHaveCount(0);

    await page.clock.fastForward(PAST_MIDNIGHT);

    await expect(page.getByRole("banner")).toContainText(shownDate(1));
    await expect(card(page, "Due on the board").getByText("Late")).toBeVisible();
  });

  test("the deals table moves on by itself", async ({ page, request }) => {
    await addLinkedDeal(request, "Due in the table", { close_date: isoDay() });
    await openBeforeMidnight(page, "/deals?q=Due%20in%20the%20table");
    const row = page.getByRole("row", { name: /Due in the table/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("Late")).toHaveCount(0);

    await page.clock.fastForward(PAST_MIDNIGHT);

    await expect(row.getByText("Late")).toBeVisible();
  });

  test("a deal's page and its timeline move on by themselves", async ({ page, request }) => {
    const { deal } = await addLinkedDeal(request, "Due on its page", { close_date: isoDay() });
    await addActivity(request, { deal_id: deal.id, description: "Ring them back", follow_up_date: isoDay() });
    await openBeforeMidnight(page, `/deals/${deal.id}`);
    await expect(page.getByText("Ring them back")).toBeVisible();
    await expect(page.getByText("Late", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Overdue", { exact: true })).toHaveCount(0);

    await page.clock.fastForward(PAST_MIDNIGHT);

    await expect(page.getByText("Late", { exact: true })).toBeVisible();
    await expect(page.getByText("Overdue", { exact: true })).toBeVisible();
  });

  test("the dashboard reads its figures again", async ({ page }) => {
    await openBeforeMidnight(page, "/");
    await expect(page.getByTestId("summary")).toBeVisible();

    const reading = page.waitForRequest((sent) => new URL(sent.url()).pathname === "/api/dashboard");
    await page.clock.fastForward(PAST_MIDNIGHT);

    await reading;
  });

  test("a laptop waking the next morning catches up when its window is used", async ({ page, request }) => {
    await addLinkedDeal(request, "Due before the laptop slept", { close_date: isoDay() });
    await openBeforeMidnight(page, "/pipeline");
    await expect(card(page, "Due before the laptop slept")).toBeVisible();

    // The clock jumps and no timer runs, which is what sleeping looks like to the page.
    const morning = new Date();
    morning.setDate(morning.getDate() + 1);
    morning.setHours(8, 0, 0, 0);
    await page.clock.setSystemTime(morning);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));

    await expect(page.getByRole("banner")).toContainText(shownDate(1));
    await expect(card(page, "Due before the laptop slept").getByText("Late")).toBeVisible();
  });
});
