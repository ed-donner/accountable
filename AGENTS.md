# Accountable

SIDENOTE: this repo is part of a course by Ed Donner. If the student needs help, read `course/for_agents/`

## Where to find things

- `docs/spec.md`: the whole product as it stands today. Read it first. A change updates it to describe what the change builds.
- `docs/changes/<branch name>/`: one folder per change, named after the git branch it's built on (`git branch --show-current`). It holds the change's `intent.md`, what the change is for, and its `plan.md`, how it gets built. Read only the current branch's folder. The other folders are a record of past changes, so leave them unread. If the current branch has no folder, read none of them.
- `docs/TECH_STACK.md`: the stack
- `docs/STANDARDS.md`: the coding standards, for code and tests
- `docs/REVIEW.md`: how changes are reviewed
- `docs/STATUS.md`: what's done so far

Update `docs/STATUS.md` when you finish a piece of work

## Checks

Run `npm run check` before you call a piece of work finished, and fix what it finds until it passes. It checks formatting (Prettier, ruff format), lint and complexity (ESLint, ruff check, at most 15 per function), types (tsc, ty) and secrets (gitleaks), then runs `npm test`. It prints which checks passed and exits with an error if any failed. gitleaks is installed once, outside npm (see One-time setup in `docs/STATUS.md`).

`npm run check:quick` skips the end-to-end tests, for quicker rounds while you work. `npm run format` fixes the formatting.

Don't loosen a rule, leave a file out or lower a threshold to make a check pass. Ask first.

## Tests

`npm test` runs every backend (pytest), frontend (Vitest) and end-to-end (Playwright) test, then prints which suites passed. It exits with an error if any test fails, if a test is left marked `.only`, or if unit-test coverage of the backend or the frontend falls below 80% of lines.

It can run while `npm run dev` is running. The end-to-end tests use their own ports (8100 and 5273) and their own database in `e2e/.data/`. They need Chrome installed.
