// Screenshots every page in light mode at 1440x900 and compares it with the
// shots taken before the change. See pixel-check.config.ts for how to run it.
//
// By default the mode button is hidden, and every page must match exactly.
// With PIXEL_SHOW_BUTTON=1 the button is shown, and every pixel that differs
// must lie inside the button's box.

import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { apiGet, expect, test } from "../../../e2e/fixtures";
import { SHOTS } from "./pixel-check.config";

type Ref = { id: number; name: string };
type Deal = Ref & { is_late: boolean; organization: Ref; main_contact: Ref | null };
type Box = { x: number; y: number; width: number; height: number };

const SHOW_BUTTON = process.env.PIXEL_SHOW_BUTTON === "1";
// Matches nothing before the change, so the base shots are untouched by it.
const MODE_BUTTON = 'button[aria-label^="Switch to"]';

// A fixed time today, so the Log activity box's "When" is the same on every run.
function fixedTimeToday() {
  const time = new Date();
  time.setHours(18, 0, 0, 0);
  return time;
}

async function pages(request: Parameters<typeof apiGet>[0]) {
  const deals = await apiGet<Deal[]>(request, "/api/deals");
  // A late deal with a main contact, so its band shows the stage bar and badges.
  const deal = deals.filter((d) => d.is_late && d.main_contact).sort((a, b) => a.name.localeCompare(b.name))[0];
  return [
    ["dashboard", "/"],
    ["organizations", "/organizations"],
    ["organization", `/organizations/${deal.organization.id}`],
    ["contacts", "/contacts"],
    ["contact", `/contacts/${deal.main_contact!.id}`],
    ["deals", "/deals"],
    ["deal", `/deals/${deal.id}`],
    ["pipeline", "/pipeline"],
    ["not-found", "/no-such-page"],
  ] as const;
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/** The box around every pixel that differs between two PNGs, decoded by the browser. */
async function differingBox(page: Page, before: Buffer, after: Buffer) {
  return page.evaluate(
    async ([a, b]) => {
      async function pixels(base64: string) {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height);
      }
      const [one, two] = await Promise.all([pixels(a), pixels(b)]);
      if (one.width !== two.width || one.height !== two.height) {
        return { sizes: `${one.width}x${one.height} and ${two.width}x${two.height}`, count: -1, box: null };
      }
      let count = 0;
      let [left, top, right, bottom] = [Infinity, Infinity, -1, -1];
      for (let i = 0; i < one.data.length; i += 4) {
        const same =
          one.data[i] === two.data[i] &&
          one.data[i + 1] === two.data[i + 1] &&
          one.data[i + 2] === two.data[i + 2] &&
          one.data[i + 3] === two.data[i + 3];
        if (same) continue;
        count += 1;
        const x = (i / 4) % one.width;
        const y = Math.floor(i / 4 / one.width);
        [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x), Math.max(bottom, y)];
      }
      const box = count ? { x: left, y: top, width: right - left + 1, height: bottom - top + 1 } : null;
      return { sizes: `${one.width}x${one.height}`, count, box };
    },
    [before.toString("base64"), after.toString("base64")] as const,
  );
}

function inside(inner: Box, outer: Box) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

test("light mode looks the same on every page", async ({ page, context, request }) => {
  test.setTimeout(180_000);
  await page.clock.setFixedTime(fixedTimeToday());

  for (const [name, path] of await pages(request)) {
    await test.step(name, async () => {
      await open(page, path);
      if (!SHOW_BUTTON) {
        await page.addStyleTag({ content: `${MODE_BUTTON} { visibility: hidden !important; }` });
        await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
        return;
      }
      const after = await page.screenshot({ fullPage: true, animations: "disabled", caret: "hide", scale: "css" });
      const button = (await page.locator(MODE_BUTTON).boundingBox())!;
      const diffPage = await context.newPage();
      const diff = await differingBox(diffPage, readFileSync(`${SHOTS}/${name}.png`), after);
      await diffPage.close();
      console.log(`${name}: ${diff.sizes}, ${diff.count} pixels differ, in ${JSON.stringify(diff.box)}`);
      console.log(`${name}: the button's box is ${JSON.stringify(button)}`);
      expect(diff.count, "the page's size").toBeGreaterThanOrEqual(0);
      if (diff.box) expect(inside(diff.box, button), "every differing pixel is inside the button's box").toBe(true);
    });
  }
});
