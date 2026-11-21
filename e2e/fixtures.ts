import { test as base, expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

type ApiErrorRule = { status: number; url: string | RegExp };

type Guards = {
  /** The API errors this test declared. */
  apiRules: ApiErrorRule[];
  /** Declare an API answer of 400 or more that this test expects. */
  allowApiError: (rule: ApiErrorRule) => void;
  guards: void;
};

function matches(rule: ApiErrorRule, url: string, status: number) {
  if (rule.status !== status) return false;
  return typeof rule.url === "string" ? url.includes(rule.url) : rule.url.test(url);
}

/**
 * The shared test. It fails a test on a console error, on an API answer of 400
 * or more that the test didn't declare, and on any request that leaves this
 * computer (RUN-5).
 */
export const test = base.extend<Guards>({
  apiRules: async ({}, use) => {
    await use([]);
  },
  allowApiError: async ({ apiRules }, use) => {
    await use((rule) => apiRules.push(rule));
  },
  guards: [
    async ({ page, apiRules: allowed }, use) => {
      const problems: string[] = [];
      let allowedFailures = 0;

      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = message.text();
        // Chrome logs every 4xx answer as "Failed to load resource". Those are
        // checked by the response guard below, against the declared rules.
        if (text.startsWith("Failed to load resource") && allowedFailures > 0) {
          allowedFailures -= 1;
          return;
        }
        problems.push(`Console error: ${text}`);
      });
      page.on("pageerror", (error) => problems.push(`Page error: ${error.message}`));
      page.on("response", (response) => {
        const url = response.url();
        const status = response.status();
        if (!url.includes("/api/") || status < 400) return;
        if (allowed.some((rule) => matches(rule, url, status))) {
          allowedFailures += 1;
          return;
        }
        problems.push(`API answered ${status}: ${response.request().method()} ${url}`);
      });
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (!url.protocol.startsWith("http") && !url.protocol.startsWith("ws")) return;
        if (!LOCAL_HOSTS.has(url.hostname)) problems.push(`Request left this computer: ${request.url()}`);
      });

      await use();

      expect(problems, "the console, API and network guards").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

let counter = 0;
/** A name no other test uses, such as "E2E Org 1763560000123-1". */
export function uniqueName(prefix: string) {
  counter += 1;
  return `${prefix} ${Date.now()}-${counter}`;
}

/** Read the API, through the same Vite server the browser uses. */
export async function apiGet<T = unknown>(request: APIRequestContext, path: string): Promise<T> {
  const response = await request.get(path);
  expect(response.ok(), `GET ${path}`).toBeTruthy();
  return (await response.json()) as T;
}

/** Wait until the page has no requests in flight to the API. */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
}

/** Pick an option in one of the app's searchable pickers. */
export async function choose(page: Page, trigger: Locator, name: string) {
  await trigger.click();
  const search = page.getByPlaceholder(/^Search (organizations|contacts)$/);
  await search.fill(name);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await page
    .getByRole("option", { name: new RegExp(`^${escaped}`) })
    .first()
    .click();
  // The picker fades out before it leaves the page. Wait until it has gone, or
  // the next picker's search would find two search boxes.
  await expect(search).toHaveCount(0);
}

/** Choose an option in one of the app's selects, such as Stage or Status. */
export async function pick(page: Page, trigger: Locator, option: string) {
  await trigger.click();
  // The options open in a layer of their own, outside the dialog.
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(trigger).toHaveText(option);
}

/** Add records through the API, through the same Vite server the browser uses. */
export async function apiPost<T = unknown>(request: APIRequestContext, path: string, data: unknown): Promise<T> {
  const response = await request.post(path, { data });
  expect(response.ok(), `POST ${path}: ${await response.text()}`).toBeTruthy();
  return (await response.json()) as T;
}

export async function apiPatch<T = unknown>(request: APIRequestContext, path: string, data: unknown): Promise<T> {
  const response = await request.patch(path, { data });
  expect(response.ok(), `PATCH ${path}: ${await response.text()}`).toBeTruthy();
  return (await response.json()) as T;
}

/**
 * Drag a card with the mouse, in small steps, which dnd-kit needs to notice a
 * drag. "above" drops it just above the target, so it lands in the target's
 * place; "center" drops it in the middle of the target, such as a column.
 */
export async function dragCard(page: Page, card: Locator, target: Locator, where: "above" | "center" = "center") {
  await card.scrollIntoViewIfNeeded();
  const from = await card.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("The card or the place to drop it isn't on screen");
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  const endX = to.x + to.width / 2;
  // The card is held by its middle, so its top edge ends up half a card higher than the pointer.
  const endY = where === "above" ? to.y + Math.min(12, to.height / 4) : to.y + to.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 4, startY + 4, { steps: 4 });
  await page.mouse.move(startX + 12, startY + 12, { steps: 4 });
  await page.mouse.move(endX, endY, { steps: 24 });
  // A last small move, so dnd-kit settles on where the card is now.
  await page.mouse.move(endX, endY + 2, { steps: 4 });
  await page.mouse.up();
}
