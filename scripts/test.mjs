// `npm test`: runs every suite (backend, frontend unit, end-to-end).
// The unit suites fail below 80% coverage.
import { runSteps } from "./steps.mjs";

export const unitSuites = [
  ["Backend (pytest)", "npm run test:backend"],
  ["Frontend unit (Vitest)", "npm run test:frontend"],
];

export const allSuites = [...unitSuites, ["End-to-end (Playwright)", "npm run test:e2e"]];

if (import.meta.url === `file://${process.argv[1]}`) runSteps(allSuites);
