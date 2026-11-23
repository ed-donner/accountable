// `npm run check`: formatting, lint, complexity, types, secrets and every test.
// `npm run check:quick` (--quick) skips the end-to-end tests.
import { runSteps } from "./steps.mjs";
import { allSuites, unitSuites } from "./test.mjs";

const quick = process.argv.includes("--quick");

runSteps([
  ["Frontend format (Prettier)", "npm run format:check --workspace frontend"],
  ["Frontend lint (ESLint)", "npm run lint --workspace frontend"],
  ["Frontend types (tsc)", "npm run typecheck --workspace frontend"],
  ["Backend format (ruff format)", "uv run ruff format --check"],
  ["Backend lint (ruff check)", "uv run ruff check"],
  ["Backend types (ty)", "uv run ty check"],
  ["Secrets in the working tree (gitleaks)", "gitleaks dir . --config .gitleaks.toml --no-banner --redact"],
  ["Secrets in git history (gitleaks)", "gitleaks git . --config .gitleaks.toml --no-banner --redact"],
  ...(quick ? unitSuites : allSuites),
]);
