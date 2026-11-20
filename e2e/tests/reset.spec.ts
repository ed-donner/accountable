import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apiGet, apiPost, expect, test, uniqueName } from "../fixtures";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Runs last, as the "reset" project, because it replaces every record the
// other journeys made.
test("npm run seed resets the data while the app is running (RUN-3, success criterion 2)", async ({ page, request }) => {
  const name = uniqueName("E2E Before reset");
  await apiPost(request, "/api/organizations", { name });
  await page.goto("/organizations");
  await page.getByRole("searchbox", { name: "Search organizations" }).fill(name);
  await expect(page.locator("tbody tr")).toHaveCount(1);

  // The same command as npm run seed, against the test database, with the app still running.
  const output = execFileSync("uv", ["run", "python", "-m", "backend.app.seed", "--yes"], {
    cwd: root,
    env: { ...process.env, ACCOUNTABLE_DB_PATH: "e2e/.data/test.db" },
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  expect(output).toContain("Sample data loaded: 15 organizations, 40 contacts, 35 deals, 80 activities");

  // After a refresh, the record added earlier is gone, and so is every other test record.
  await page.reload();
  await page.getByRole("searchbox", { name: "Search organizations" }).fill(name);
  await expect(page.getByText(`No organizations match "${name}"`)).toBeVisible();
  await page.getByRole("searchbox", { name: "Search organizations" }).fill("E2E");
  await expect(page.getByText('No organizations match "E2E"')).toBeVisible();

  // The counts match the sample data, on screen and in the API.
  for (const [path, noun, count] of [
    ["/organizations", "organizations", 15],
    ["/contacts", "contacts", 40],
    ["/deals", "deals", 35],
  ] as const) {
    await page.goto(path);
    await expect(page.locator("section.on-band").getByText(`${count} ${noun}`, { exact: true })).toBeVisible();
    expect(await apiGet<unknown[]>(request, `/api${path}`)).toHaveLength(count);
  }
});
