import net from "node:net";

import { expect, test } from "./fixtures";
import {
  COPY_URL,
  addLinkedDeal,
  copyEnv,
  makeCopyFolder,
  portIsOpen,
  resetToSampleData,
  runDevScript,
  startCopy,
} from "./helpers";

test.describe.configure({ timeout: 120_000 });

test("the top bar links to the five sections and the app opens on the dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

  const sections = page.getByRole("navigation", { name: "Sections" });
  for (const name of ["Organizations", "Contacts", "Deals", "Pipeline", "Dashboard"]) {
    await sections.getByRole("link", { name }).click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(sections.getByRole("link", { name })).toHaveAttribute("aria-current", "page");
  }
});

test("refresh, back and forward work on sections and records", async ({ page }) => {
  resetToSampleData();
  await page.goto("/");
  const sections = page.getByRole("navigation", { name: "Sections" });

  await sections.getByRole("link", { name: "Deals" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Deals" })).toBeVisible();
  await page.locator("tbody tr").first().getByRole("link").click();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  const record = page.url();
  const name = await page.getByRole("heading", { level: 1 }).innerText();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Deals" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

  await page.goForward();
  await expect(page.getByRole("heading", { level: 1, name: "Deals" })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(record);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
});

test("opening a deleted record says so, with a link back", async ({ page, request, expectConsoleError }) => {
  expectConsoleError(/404 \(Not Found\).*\/api\/(deals|contacts|organizations)\/\d+/);
  const { deal, contact, organization } = await addLinkedDeal(request, "Vanished");
  await request.delete(`http://localhost:5199/api/deals/${deal.id}`);
  await request.delete(`http://localhost:5199/api/contacts/${contact.id}`);
  await request.delete(`http://localhost:5199/api/organizations/${organization.id}`);

  for (const [path, word, section] of [
    [`/deals/${deal.id}`, "deal", "Deals"],
    [`/contacts/${contact.id}`, "contact", "Contacts"],
    [`/organizations/${organization.id}`, "organization", "Organizations"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: `This ${word} no longer exists` })).toBeVisible();
    await page.getByRole("link", { name: `Back to ${section}` }).click();
    await expect(page.getByRole("heading", { level: 1, name: section })).toBeVisible();
  }
});

test.describe("a copy of the app of its own", () => {
  test("it prints the address and lands on the dashboard with sample data on every section", async ({ page }) => {
    const folder = makeCopyFolder();
    const copy = await startCopy(folder.database);
    try {
      expect(copy.output()).toContain(`Accountable is running at ${COPY_URL}`);

      await page.goto(COPY_URL);
      await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
      await expect(page.getByTestId("follow-up").first()).toBeVisible();
      await expect(page.getByTestId("recent-entry").first()).toBeVisible();

      await page.goto(`${COPY_URL}/organizations`);
      await expect(page.locator("tbody tr").first()).toBeVisible();
      await page.goto(`${COPY_URL}/contacts`);
      await expect(page.locator("tbody tr").first()).toBeVisible();
      await page.goto(`${COPY_URL}/deals`);
      await expect(page.locator("tbody tr").first()).toBeVisible();
      await page.goto(`${COPY_URL}/pipeline`);
      await expect(page.locator("[data-deal]").first()).toBeVisible();
    } finally {
      await copy.stop();
      folder.remove();
    }
  });

  test("a second start works with every network route pointed at a dead port, and nothing loads from outside", async ({ page }) => {
    const folder = makeCopyFolder();
    const first = await startCopy(folder.database);
    await first.stop();

    const deadPort = "http://127.0.0.1:9";
    const copy = await startCopy(folder.database, {
      HTTP_PROXY: deadPort,
      HTTPS_PROXY: deadPort,
      ALL_PROXY: deadPort,
      http_proxy: deadPort,
      https_proxy: deadPort,
      all_proxy: deadPort,
      NO_PROXY: "",
      no_proxy: "",
      npm_config_proxy: deadPort,
      npm_config_https_proxy: deadPort,
    });
    try {
      await page.goto(COPY_URL);
      await expect(page.getByTestId("follow-up").first()).toBeVisible();

      // Every request is checked by the base test. These confirm the fonts came too.
      const loaded = await page.evaluate(async () => {
        await document.fonts.ready;
        return [...document.fonts].filter((font) => font.status === "loaded").map((font) => font.family.replaceAll('"', ""));
      });
      expect(loaded).toContain("Instrument Sans Variable");
      expect(loaded).toContain("Instrument Serif");
      expect(loaded).toContain("JetBrains Mono Variable");
    } finally {
      await copy.stop();
      folder.remove();
    }
  });

  test("a taken port stops the start with a plain message", async () => {
    const folder = makeCopyFolder();
    const blocker = net.createServer();
    await new Promise<void>((resolve) => blocker.listen(5198, "127.0.0.1", resolve));
    try {
      const { exited, output } = runDevScript(copyEnv(folder.database));
      expect(await exited).toBe(1);
      expect(output()).toContain("Port 5198 is in use. Is Accountable already running?");
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
      folder.remove();
    }
  });

  test("a port taken only on the other local address stops the start too", async () => {
    const folder = makeCopyFolder();
    const blocker = net.createServer();
    await new Promise<void>((resolve) => blocker.listen(5198, "::1", resolve));
    try {
      const { exited, output } = runDevScript(copyEnv(folder.database));
      expect(await exited).toBe(1);
      expect(output()).toContain("Port 5198 is in use.");
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
      folder.remove();
    }
  });

  test("Ctrl+C stops both servers", async () => {
    const folder = makeCopyFolder();
    const copy = await startCopy(folder.database);
    expect(await portIsOpen(5198)).toBe(true);
    expect(await portIsOpen(8798)).toBe(true);

    await copy.stop("SIGINT");

    await expect.poll(() => portIsOpen(5198)).toBe(false);
    await expect.poll(() => portIsOpen(8798)).toBe(false);
    folder.remove();
  });

  test("stopping the backend shows the connection message, not a blank screen", async ({ page, expectConsoleError }) => {
    expectConsoleError(/ERR_CONNECTION_REFUSED|Failed to load resource|Failed to fetch/);
    const folder = makeCopyFolder();
    const copy = await startCopy(folder.database);
    await page.goto(COPY_URL);
    await expect(page.getByTestId("follow-up").first()).toBeVisible();

    await copy.stop();

    await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Organizations" }).click();
    await expect(page.getByRole("alert")).toHaveText("Can't reach Accountable. Check that it's still running.");
    await expect(page.getByRole("heading", { level: 1, name: "Organizations" })).toBeVisible();
    folder.remove();
  });
});
