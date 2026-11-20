# Week 1 Day 3: the documents behind my Accountable MVP

I built the Accountable MVP: a sales CRM with a dashboard, organizations, contacts, deals and a drag-and-drop pipeline — FastAPI + SQLAlchemy on SQLite, React/Vite/TypeScript, tested with pytest, Vitest and Playwright.

The four documents I wrote before and during the build, one per stage of Anthropic's AI-native SDLC as the course teaches it:

- `intent.md` — the problem, the outcome, the success criteria and the exclusions.
- `spec.md` — requirements, concerns and the design. It is the summary that points at the area files in `docs/specs/`, which live in my fork, so those links don't resolve here.
- `plan.md` — the files that change, four phases, risks and the test proof list.
- `REVIEW.md` — the review policy every change was reviewed against.

## How I worked

The course's Week 1 Day 3 route, run in OpenCode with `mimo-v2.6-flash` as the model — the route for cheap or free models rather than Claude Code. What that meant in practice: small steps, `npm run check:quick` at the end of every turn so a regression came back to the agent straight away, and patience around the end-to-end tests. The process carried the build more than the model did.

The finished build is in my fork: https://github.com/RuiFSP/accountable

Also in `week1/`: the coding guidelines and the improve-the-harness procedure I worked to in `day4/`, and my reviewer and UI-check subagents in `day5/`.
