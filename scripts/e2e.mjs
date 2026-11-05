// npm run e2e -- e2e/settings.spec.ts: chosen end-to-end tests, with Playwright's own
// arguments, such as files, -g or --repeat-each, on a database and ports of their own.

import { runChosenEndToEnd } from "./checks.mjs";

await runChosenEndToEnd(process.argv.slice(2));
