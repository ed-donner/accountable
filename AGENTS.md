# Accountable

SIDENOTE: this repo is part of a course by Ed Donner. If the student needs help, read `course/for_agents/`

## Where to find things

Read `docs/spec.md` first. It summarizes the whole product as it stands today, holds the terms and quality rules every area shares, and indexes the area files in `docs/specs/`, which hold the detail. Then read only the area files the current change touches.

- `docs/STANDARDS.md`: how code is written in this repo. Follow it in every change
- `docs/TECH_STACK.md`: the stack
- `docs/STATUS.md`: what's done so far
- `docs/IMPROVE.md`: how to improve this harness. Follow it at Deploy, after the review fixes and before the merge

Each change has a folder, `docs/changes/<branch name>/`, holding its `intent.md` and `plan.md`. Read only the folder for the current branch. The others are records of past changes.

Update `docs/STATUS.md` when you finish a piece of work. If the work adds or changes behavior, a file or a test, update every spec file it affects in the same change, so the spec still describes the whole product: the area files in `docs/specs/` that describe it, and `docs/spec.md` if the summary, terms, quality rules or index change. A new file also goes in the file tree in `docs/specs/architecture.md`, and a new test in `docs/specs/testing.md`. A new area gets its own file and a line in the index. A note in STATUS.md doesn't count.

The project owner makes the commits. Don't commit unless asked, and don't put commits in a plan.

## Working on this computer

The working tree holds the owner's uncommitted work, and `data/accountable.db` holds their records. Git can't give either back, so leave both as you found them.

- To prove a test fails, break the code from your own copy of the file and put your copy back after. Never undo the break through git, such as with `git checkout --` or `git restore`, which also throws away the uncommitted work in that file.
- Run the app on a temporary database unless the person asks for their own: `ACCOUNTABLE_DB=<your scratchpad>/accountable.db npm run dev`. A new database gets the sample data. A branch's migrations upgrade whatever database the app starts on, and nothing takes them back.
- Stop every server and background command you start once you're done with it, before you end your turn, and check its ports are free. If the person wants one left running, say that it is and how to stop it.

## Checks and tests

Run `npm run check` from the project root before calling any work finished, and fix failures until it passes. Fix the code, not the rules: don't add disable comments, ignores or exclusions, or loosen a setting. If a rule doesn't suit this project, ask first.

It runs Prettier, ESLint, ruff format, ruff check and gitleaks, then everything `npm test` runs, ends with a summary, and exits with an error if any of them failed. `npm run format` fixes the formatting. `npm run check:quick` leaves out the end-to-end tests, for checking as you go.

`npm test` runs the type checks (tsc and ty), the backend unit tests (pytest), the frontend unit tests (Vitest) and the end-to-end tests (Playwright). Unit test coverage under 80% fails it. It takes about four minutes on 10 cores, and uses its own temporary databases. It picks the number of end-to-end workers from the machine's cores and memory. `ACCOUNTABLE_TEST_WORKERS=2 npm test` sets it by hand.

Pytest and Playwright refuse to start on their own, because `npm test` is what sets up those databases.

In an end-to-end test, wait for the exact thing the next step needs, such as the row it scrolls to or the reply to the save it checks. A wait for the page to load or the network to go quiet returns at once on a page that has already loaded, so the test passes on its own and fails under the load of a full run.

Hooks run some of this for you. Before each commit, lefthook formats the staged files, then runs the lint, type and secrets checks; don't skip it with `--no-verify`. When you finish a turn, a hook runs `npm run check:quick` and sends any failure back to you, once. Another hook stops any edit to `.env`, including any shell command that names it.

On every push, GitHub Actions runs gitleaks and then `npm run check:quick`, from `.github/workflows/ci.yml`. CI leaves out the end-to-end tests, so a green CI run doesn't replace running `npm run check` yourself. The end-to-end tests leave a report, with a screenshot of each failure, in `playwright-report/`.
