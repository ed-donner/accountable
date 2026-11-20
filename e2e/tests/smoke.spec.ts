import { apiGet, expect, test } from "../fixtures";

const SECTIONS = [
  { name: "Dashboard", path: "/" },
  { name: "Organizations", path: "/organizations" },
  { name: "Contacts", path: "/contacts" },
  { name: "Deals", path: "/deals" },
  { name: "Pipeline", path: "/pipeline" },
];

test("the app opens with the top bar", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Sections" });
  await expect(nav).toBeVisible();
  for (const { name } of SECTIONS) {
    await expect(nav.getByRole("link", { name })).toBeVisible();
  }
  await expect(page).toHaveTitle("Dashboard · Accountable");
});

test("/ lands on the dashboard with data (success criterion 1)", async ({ page, request }) => {
  const dashboard = await apiGet<{ open_pipeline: { value: number } }>(request, "/api/dashboard");
  expect(dashboard.open_pipeline.value).toBeGreaterThan(0);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(page.locator('[data-figure="open-pipeline"]')).toContainText(`$${dashboard.open_pipeline.value.toLocaleString("en-US")}`);
  await expect(page.locator('[data-chart="revenue"] svg').first()).toBeVisible();
  await expect(page.getByRole("list", { name: "Recent activity" }).getByRole("listitem").first()).toBeVisible();
});

test("the top bar reaches every section, each with its own title and address, and Back works (GEN-1, GEN-5)", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Sections" });
  for (const { name, path } of [...SECTIONS.slice(1), SECTIONS[0]]) {
    await nav.getByRole("link", { name }).click();
    await expect(page).toHaveURL(path);
    await expect(page).toHaveTitle(`${name} · Accountable`);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(nav.getByRole("link", { name })).toHaveAttribute("aria-current", "page");
  }

  // Back goes to the section before, then the one before that.
  await page.goBack();
  await expect(page).toHaveURL("/pipeline");
  await expect(page).toHaveTitle("Pipeline · Accountable");
  await page.goBack();
  await expect(page).toHaveURL("/deals");
  await expect(page.getByRole("heading", { level: 1, name: "Deals" })).toBeVisible();
});

test("an unknown address shows Page not found, with a way back (GEN-5)", async ({ page }) => {
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page).toHaveTitle("Page not found · Accountable");
  await page.getByRole("link", { name: "Go to the dashboard", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
});
