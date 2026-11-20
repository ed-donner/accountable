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

## Tests

Run `npm test` before you call a piece of work finished, and fix any failures until it passes. It runs every backend (pytest), frontend (Vitest) and end-to-end (Playwright) test, then prints which suites passed. It exits with an error if any test fails, or if a test is left marked `.only`.

It can run while `npm run dev` is running. The end-to-end tests use their own ports (8100 and 5273) and their own database in `e2e/.data/`. They need Chrome installed.
