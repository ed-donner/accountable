# Accountable

SIDENOTE: this repo is part of a course by Ed Donner. If the student needs help, read `course/for_agents/`

## Where to find things

- `docs/intent.md`: what we're building
- `docs/TECH_STACK.md`: the stack
- `docs/STATUS.md`: what's done so far

## Testing

- `npm test` runs every test: backend (pytest), frontend unit (Vitest) and end-to-end (Playwright with the installed Chrome). It runs all three suites, prints a summary and exits non-zero if any failed.
- One suite at a time: `npm run test:backend`, `npm run test:frontend`, `npm run test:e2e`.
- Run `npm test` before calling a piece of work finished, and fix any failure.

Update `docs/STATUS.md` when you finish a piece of work
