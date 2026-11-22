import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures";

// Keys for 20 Nov 2026 in each way a date field can be laid out. A year-first
// field takes up to six digits, so the right arrow moves on to the month.
const LAYOUTS = [["11", "20", "2026"], ["2026", "ArrowRight", "11", "20"], ["20", "11", "2026"]];

async function typeKeys(page: Page, keys: string[], delay = 0) {
  for (const key of keys) {
    if (key === "ArrowRight") await page.keyboard.press(key);
    else await page.keyboard.type(key, { delay });
  }
}

/** Date fields take their layout from the computer's region, so find it first. */
async function dateKeys(page: Page, before: Locator, field: Locator): Promise<string[]> {
  for (const keys of LAYOUTS) {
    await before.focus();
    await page.keyboard.press("Tab");
    await typeKeys(page, keys);
    const value = await field.inputValue();
    await field.fill("");
    if (value === "2026-11-20") return keys;
  }
  throw new Error("Couldn't work out how this computer's date fields are typed");
}

test("TE20 logging a call with a follow-up by keyboard at human typing speed takes under 30 seconds", async ({ page }) => {
  await page.goto("/contacts");
  await page.getByRole("searchbox").fill("Karen Willis");
  await page.getByRole("link", { name: "Karen Willis" }).click();
  const followUpKeys = await dateKeys(page, page.getByLabel("What happened"), page.getByLabel("Follow-up date"));

  const started = Date.now();
  // Into the form once, then keyboard only, typing at about 5 characters a second.
  await page.getByRole("radio", { name: "Call" }).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.type("Agreed pricing for 3 sites, sending contract", { delay: 200 });
  await page.keyboard.press("Tab");
  await typeKeys(page, followUpKeys, 200);
  await page.keyboard.press("Enter");
  const entry = page.getByRole("region", { name: "Timeline" }).getByRole("listitem").first();
  await expect(entry).toContainText("Agreed pricing for 3 sites, sending contract");
  await expect(entry.getByLabel("Follow-up 20 Nov, due")).toBeVisible();
  const seconds = (Date.now() - started) / 1000;
  console.log(`Logged a call with a follow-up in ${seconds.toFixed(1)} seconds`);
  expect(seconds).toBeLessThan(30);
});
