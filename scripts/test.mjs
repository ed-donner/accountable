// npm test: the type checks and every test layer. Unit coverage under 80% fails it.

import { runChecks } from "./checks.mjs";

await runChecks({ withCodeChecks: false, withBrowserTests: true });
