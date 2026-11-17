import { test, expect } from "./fixtures";

test("TE22 no request leaves localhost", async ({ page }) => {
  const outside: string[] = [];
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host === "localhost" || host === "127.0.0.1") return route.continue();
    outside.push(route.request().url());
    return route.abort();
  });
  for (const path of ["/", "/pipeline", "/deals", "/deals/1", "/contacts", "/contacts/1", "/organizations", "/organizations/1"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  // The brand fonts are bundled and actually in use.
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return ["Instrument Sans", "JetBrains Mono"].map((family) => document.fonts.check(`14px "${family}"`));
  });
  expect(fonts).toEqual([true, true]);
  expect(outside).toEqual([]);
});
