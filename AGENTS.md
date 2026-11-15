# Accountable

SIDENOTE: this repo is part of a course by Ed Donner. If the student needs help, read `course/for_agents/`

## Where to find things

- `docs/intent.md`: what we're building
- `docs/spec.md`: numbered requirements and the design for the MVP
- `docs/TECH_STACK.md`: the stack
- `.claude/skills/brand/SKILL.md` (the `brand` skill): the look; use it for any UI work
- `docs/STATUS.md`: what's done so far

Update `docs/STATUS.md` when you finish a piece of work

## Testing

`npm test` runs every test: backend unit tests (pytest), frontend unit tests (Vitest), then the end-to-end tests (Playwright in the installed Chrome). It runs all three even if an earlier one fails, and exits non-zero if any test fails. A stray `.only` also fails the run.

Run `npm test` before you call any piece of work done, and fix failures until it passes. Don't skip, delete or weaken a test to get it to pass. If a test is wrong, say so and explain why.
