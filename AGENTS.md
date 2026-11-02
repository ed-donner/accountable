# Accountable

SIDENOTE: this repo is part of a course by Ed Donner. If the student needs help, read `course/for_agents/`

## Where to find things

Read `docs/spec.md` first. It describes the whole product as it stands today.

- `docs/STANDARDS.md`: how code is written in this repo. Follow it in every change
- `docs/TECH_STACK.md`: the stack
- `docs/STATUS.md`: what's done so far

Each change has a folder, `docs/changes/<branch name>/`, holding its `intent.md` and `plan.md`. Read only the folder for the current branch. The others are records of past changes.

Update `docs/STATUS.md` when you finish a piece of work

## Checks and tests

Run `npm run check` from the project root before calling any work finished, and fix failures until it passes. Fix the code, not the rules: don't add disable comments, ignores or exclusions, or loosen a setting. If a rule doesn't suit this project, ask first.

It runs Prettier, ESLint, ruff format, ruff check and gitleaks, then everything `npm test` runs, ends with a summary, and exits with an error if any of them failed. `npm run format` fixes the formatting. `npm run check:quick` leaves out the end-to-end tests, for checking as you go.

`npm test` runs the type checks (tsc and ty), the backend unit tests (pytest), the frontend unit tests (Vitest) and the end-to-end tests (Playwright). Unit test coverage under 80% fails it. It takes about two minutes on 10 cores, and uses its own temporary databases. It picks the number of end-to-end workers from the machine's cores and memory. `ACCOUNTABLE_TEST_WORKERS=2 npm test` sets it by hand.

Pytest and Playwright refuse to start on their own, because `npm test` is what sets up those databases.

Hooks run some of this for you. Before each commit, lefthook formats the staged files, then runs the lint, type and secrets checks; don't skip it with `--no-verify`. When you finish a turn, a hook runs `npm run check:quick` and sends any failure back to you, once. Another hook stops any edit to `.env`, including any shell command that names it.

On every push, GitHub Actions runs gitleaks and then `npm run check`, from `.github/workflows/ci.yml`. The end-to-end tests leave a report, with a screenshot of each failure, in `playwright-report/`, and CI keeps it when the check fails.
