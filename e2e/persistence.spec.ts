import { execSync, spawn } from "node:child_process";
import { test, expect, TODAY } from "./fixtures";
import { E2E_DB } from "../playwright.config";

const RESTART_PORT = 8101;

async function waitFor(url: string) {
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${url} didn't start`);
}

test("TE09 changes survive a refresh and a backend restart; npm run seed restores the sample data", async ({ page }) => {
  test.setTimeout(90_000);
  const env = { ...process.env, ACCOUNTABLE_DB: E2E_DB, ACCOUNTABLE_TODAY: TODAY };

  await page.goto("/organizations");
  await page.getByRole("button", { name: "Add organization" }).first().click();
  await page.getByRole("dialog").getByLabel("Name").fill("Kept Over Restart Ltd");
  await page.getByRole("dialog").getByRole("button", { name: "Add organization" }).click();
  await expect(page.getByRole("row", { name: /Kept Over Restart Ltd/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("row", { name: /Kept Over Restart Ltd/ })).toBeVisible();

  // A freshly started backend on the same database still has it.
  const backend = spawn("uv", ["run", "uvicorn", "app.main:app", "--port", String(RESTART_PORT)], { env, stdio: "ignore" });
  try {
    await waitFor(`http://127.0.0.1:${RESTART_PORT}/api/health`);
    const list = await (await fetch(`http://127.0.0.1:${RESTART_PORT}/api/organizations`)).json();
    expect(list.items.map((o: { name: string }) => o.name)).toContain("Kept Over Restart Ltd");
  } finally {
    backend.kill();
  }

  // The reset command brings back the sample data.
  execSync("npm run seed", { env, stdio: "ignore" });
  await page.reload();
  await expect(page.getByText("12 organizations")).toBeVisible();
  await expect(page.getByRole("row", { name: /Kept Over Restart Ltd/ })).toHaveCount(0);
});
