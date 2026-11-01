import { expect, test as base } from "@playwright/test";

import { stack } from "./helpers";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

type Fixtures = {
  /** Names a console error this test expects. Anything else fails it. */
  expectConsoleError: (pattern: RegExp) => void;
  appChecks: void;
};

type WatchState = { allowed: RegExp[]; problems: string[] };

export const test = base.extend<Fixtures & { watchState: WatchState }>({
  baseURL: `http://127.0.0.1:${stack.webPort}`,

  watchState: async ({}, use) => {
    await use({ allowed: [], problems: [] });
  },

  expectConsoleError: async ({ watchState }, use) => {
    await use((pattern) => watchState.allowed.push(pattern));
  },

  appChecks: [
    async ({ page, watchState }, use) => {
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
