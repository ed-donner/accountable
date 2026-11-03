import { expect, test as base, type APIRequestContext, type Page, type PlaywrightWorkerArgs } from "@playwright/test";

import { SESSION_KEY, SIGNED_IN, stack, tokenFor } from "./helpers";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

type Fixtures = {
  /** Names a console error this test expects. Anything else fails it. */
  expectConsoleError: (pattern: RegExp) => void;
  appChecks: void;
  /** The made-up teammate this test signs in as, by id or name, or by email for one with no display name. */
  teammate: string;
  /** Whether the page starts signed in. The sign-in tests start signed out, to use the screen. */
  signedIn: boolean;
  /** The teammate's token, from the local copy's sign-in route. */
  sessionToken: string;
  /** The API, signed in as another teammate. */
  requestAs: (teammate: string) => Promise<APIRequestContext>;
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

const BASE_URL = `http://127.0.0.1:${stack.webPort}`;

type Playwright = PlaywrightWorkerArgs["playwright"];

async function tokenOf(playwright: Playwright, teammate: string) {
  const signedOut = await playwright.request.newContext({ baseURL: BASE_URL });
  try {
    return await tokenFor(signedOut, teammate);
  } finally {
    await signedOut.dispose();
  }
}

function signedInApi(playwright: Playwright, token: string) {
  return playwright.request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
}

export const test = base.extend<Fixtures>({
  baseURL: BASE_URL,

  teammate: [SIGNED_IN.name, { option: true }],
  signedIn: [true, { option: true }],

  sessionToken: async ({ playwright, teammate }, use) => {
    await use(await tokenOf(playwright, teammate));
  },

  // The page keeps its token where the app keeps it, never in a header the browser
  // adds for it, so a request the app sends without one can't pass unnoticed.
  storageState: async ({ signedIn, sessionToken }, use) => {
    const localStorage = signedIn ? [{ name: SESSION_KEY, value: sessionToken }] : [];
    await use({ cookies: [], origins: [{ origin: BASE_URL, localStorage }] });
  },

  request: async ({ playwright, sessionToken }, use) => {
    const request = await signedInApi(playwright, sessionToken);
    await use(request);
    await request.dispose();
  },

  requestAs: async ({ playwright }, use) => {
    const opened: APIRequestContext[] = [];
    await use(async (teammate) => {
      const request = await signedInApi(playwright, await tokenOf(playwright, teammate));
      opened.push(request);
      return request;
    });
    await Promise.all(opened.map((request) => request.dispose()));
  },

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
