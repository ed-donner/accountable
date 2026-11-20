# Accountable

SIDENOTE: this repo is part of a course by Ed Donner. If the student needs help, read `course/for_agents/`

## Where to find things

- `docs/intent.md`: what we're building
- `docs/TECH_STACK.md`: the stack

- `docs/STATUS.md`: what's done so far

Update `docs/STATUS.md` when you finish a piece of work

## Tests

Run `npm test` before you call a piece of work finished, and fix any failures until it passes. It runs every backend (pytest), frontend (Vitest) and end-to-end (Playwright) test, then prints which suites passed. It exits with an error if any test fails, or if a test is left marked `.only`.

It can run while `npm run dev` is running. The end-to-end tests use their own ports (8100 and 5273) and their own database in `e2e/.data/`. They need Chrome installed.
