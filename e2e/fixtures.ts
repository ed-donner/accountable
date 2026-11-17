import { test as base, expect } from "@playwright/test";
import { API_PORT, TODAY } from "../playwright.config";

export const API = `http://127.0.0.1:${API_PORT}/api`;
export { TODAY };

type Options = {
  /** Console errors a test expects, such as a save failing on purpose. */
  allowConsoleErrors: RegExp[];
};

/**
 * Every test starts from fresh sample data, with today fixed and the console
 * watched: any error fails the test (G11).
 */
export const test = base.extend<Options & { consoleErrors: string[] }>({
  allowConsoleErrors: [[], { option: true }],
  consoleErrors: [
    async ({ page, request, allowConsoleErrors }, use) => {
      const reset = await request.post(`${API}/testing/reset`, { headers: { "X-Local-Date": TODAY } });
      expect(reset.ok()).toBeTruthy();
      await page.clock.setFixedTime(new Date(`${TODAY}T10:00:00`));

      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await use(errors);

      const unexpected = errors.filter((text) => !allowConsoleErrors.some((pattern) => pattern.test(text)));
      expect(unexpected, "console errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
