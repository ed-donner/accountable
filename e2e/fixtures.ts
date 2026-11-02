import { expect, test as base, type Page } from "@playwright/test";

import { stack } from "./helpers";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

type Fixtures = {
  /** Names a console error this test expects. Anything else fails it. */
  expectConsoleError: (pattern: RegExp) => void;
  appChecks: void;
};

type WatchState = { allowed: RegExp[]; problems: string[] };

// Each test gets a new page, so keeping the state with the page keeps it to one test.
const watchStates = new WeakMap<Page, WatchState>();

function watchStateOf(page: Page): WatchState {
  let watchState = watchStates.get(page);
  if (!watchState) {
    watchState = { allowed: [], problems: [] };
    watchStates.set(page, watchState);
  }
  return watchState;
}

export const test = base.extend<Fixtures>({
  baseURL: `http://127.0.0.1:${stack.webPort}`,

  expectConsoleError: async ({ page }, use) => {
    await use((pattern) => watchStateOf(page).allowed.push(pattern));
  },

  appChecks: [
    async ({ page }, use) => {
      const watchState = watchStateOf(page);
      const isAllowed = (text: string) => watchState.allowed.some((pattern) => pattern.test(text));

      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const where = message.location().url;
        const text = `${message.text()} ${where}`;
        if (!isAllowed(text)) watchState.problems.push(`Console error: ${text}`);
      });
      page.on("pageerror", (error) => {
        if (!isAllowed(error.message)) watchState.problems.push(`Page error: ${error.message}`);
      });
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) return;
        if (!LOCAL_HOSTS.has(url.hostname)) watchState.problems.push(`Left the computer: ${request.url()}`);
      });

      await use();

      expect(watchState.problems, "Console errors or outside requests").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
