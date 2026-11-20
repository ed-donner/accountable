# Status

The MVP in `docs/changes/mvp/plan.md` is built: Phases 0 to 9 and the fixes from the review below are done and committed on `main`. The docs were then reorganized for future changes (see Docs layout below).

## One-time setup

You need three things. The first `npm run dev` needs the internet, because it downloads the packages and Python 3.12. After that the app works offline.

| | Windows | Mac | Linux |
|---|---|---|---|
| **Node.js 24 or later** | `winget install OpenJS.NodeJS.LTS` | `brew install node` | The installer from nodejs.org |
| **uv** (Python's package manager) | `winget install astral-sh.uv` | `brew install uv` | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| **Browser** | Chrome or Edge | Chrome or Edge | Chrome or Edge |
| **gitleaks**, for `npm run check` and the commit hook | `winget install Gitleaks.Gitleaks` | `brew install gitleaks` | The release for Linux from github.com/gitleaks/gitleaks |

The end-to-end tests use the Chrome installed on the computer, so they need Chrome itself. After installing gitleaks, open a new terminal so it's on the path, and start Claude Code from a new terminal too, since its end-of-turn check uses the path it started with. `npm install` also installs the git pre-commit hook.

**Platforms:** the app has only been tried on Windows so far. The start and stop scripts use each system's documented approach, but Mac and Linux haven't been run.

## Day-to-day use

| Command | What it does |
|---|---|
| `npm run dev` | Installs anything missing, starts the backend and the frontend, prints `Accountable is running at http://localhost:5173` and opens the browser. Ctrl+C stops both. |
| `npm run seed` | Replaces all the data with the sample data, after you type `yes`. It works while the app is running; refresh the page afterwards. `npm run seed -- --yes` skips the question. |
| `npm test` | Runs the backend, frontend and end-to-end tests in turn, and says which failed. |
| `npm run test:backend`, `npm run test:frontend`, `npm run test:e2e` | One suite at a time. |
| `npm run check` | Formatting, lint, complexity, types, secrets, then `npm test`. Says which checks failed. |
| `npm run check:quick` | The same without the end-to-end tests. |
| `npm run format` | Fixes the formatting (Prettier and ruff). |

- **Your data** lives in `data/accountable.db`, a single SQLite file. A new file is filled with the sample data the first time the app starts. To back it up, copy the file while the app is stopped.
- **Ports:** the app uses 8000 (backend) and 5173 (the page). The end-to-end tests use 8100 and 5273, with their own database in `e2e/.data/`, so they can run while `npm run dev` is running. If a port is taken, the scripts say which one.
- **Settings** (optional, as environment variables): `ACCOUNTABLE_DB_PATH` (default `data/accountable.db`), `ACCOUNTABLE_API_PORT` (default 8000) and `ACCOUNTABLE_WEB_PORT` (default 5173).
- **In `cmd.exe`**, Ctrl+C is followed by cmd's own "Terminate batch job (Y/N)?" prompt, which appears for any npm script there. The servers have already stopped by then.

## What's built

- **Phase 0, the skeleton:** `npm run dev` and `npm test`, with scripts that use only Node's built-in modules, so they work before anything is installed.
- **Phase 1, the database and the rules:** four tables in SQLAlchemy Core, built by Alembic, with foreign keys, checks, WAL mode and a 5-second busy timeout. `backend/app/rules.py` holds the rules, checked against `frontend/src/lib/rules-cases.json`.
- **Phase 2, the records API:** every endpoint in spec 2.3, including stage changes, card moves, timelines, delete impact and deletes.
- **Phase 3, dashboard figures and sample data:** `GET /api/dashboard`, and fixed sample data dated relative to the day it's loaded.
- **Phase 4, frontend foundations:** the API client and query hooks, formatting, dates, rules and wording helpers, the top bar and band, badges, placeholders, and the brand restyle of the shadcn/ui parts.
- **Phase 5, tables, forms and deletes:** one table for all three sections (search, sort, counts, pages of 50, empty states), the four forms, the searchable pickers and the delete dialogs.
- **Phase 6, record pages:** the organization, contact and deal pages, the stage bar, and timelines with logging, editing, deleting and Done.
- **Phase 7, the pipeline board:** dragging with the mouse and the keyboard, a gap where the card will land, figures that change on the drop, plain-words announcements for screen readers, and a card that goes back with a message if the save fails. The column headings sit in the band, and the board scrolls sideways below 1280px.
- **Phase 8, the dashboard:** the date line, four headline figures and the pipeline strip in the band; the revenue and deals-won charts with their totals, tooltips and text summaries; the sales funnel, follow-ups with a Done tickbox, and recent activity.
- **Phase 9, finishing:** the reset and smoke journeys, a full `npm test`, the first-run check, a look at every screen, and this file.

## Tests

`npm test` passes, with every test running and none skipped: backend 235, frontend 98 and end-to-end 41 (after the review fixes). It also passes while `npm run dev` is running.

It exits with an error if any test fails. To check, a failing test was added to each suite: all three were reported FAILED and the exit code was 1. A test left marked `.only` is refused as well, since it would otherwise run alone and skip the rest. Vitest and Playwright only refuse `.only` on CI by default, so both configs now refuse it everywhere. AGENTS.md tells agents to run `npm test` before calling work finished.

- **Backend (pytest):** the files listed in the plan's Proof, from `test_meta.py` to `test_seed.py`.
- **Frontend (Vitest):** formatting, dates, rules (the shared cases), the board logic, the dashboard helpers, wording, the table, the forms and the delete dialog. They run in the America/Los_Angeles time zone.
- **End to end (Playwright, in Chrome):** smoke, organizations, contacts, deals, deletes, activities, pipeline, dashboard, and reset last. A shared guard fails any test on a console error, an API error it didn't expect, or a request that leaves the computer.

## Checked by hand

- **First run:** with `node_modules`, `frontend/node_modules`, `.venv` and `data/` removed, `npm run dev` installed everything, created and seeded a new database, and the dashboard showed the sample data ($1,011,000 open pipeline, $502,300 expected revenue). Your own `data/` was moved aside for this and put back afterwards. In Phase 0 the same check also confirmed the printed address and the browser opening.
- **Stopping:** a real Ctrl+C left nothing on ports 8000 or 5173 (Phase 0).
- **Resetting:** `npm run seed` worked while the app was running (Phase 0, and `reset.spec.ts` every run).
- **A look at every screen** in Chrome at 1280px, and the pipeline at 1024px, where it scrolls sideways. No console errors. With reduced motion on, the charts draw without animating.
- **Against the chosen mockup:** Playwright opened `docs/mockups/2-midnight-deck.html` next to the running app, both 1440px wide, and compared the position, size and font of each part. The dashboard and the pipeline now match it to within 1px; only the sample data differs. Fixed along the way:
  - The pipeline's cards were 20px narrower than their headings.
  - The dashboard's band was 10px too tall, because the word "overdue" took the figures' 50px line height.
  - The revenue chart's points ran edge to edge instead of sitting mid-month under the bars.
  - The two chart panels were 4px off the mockup's 7 to 5 split.
  - Recent activity's 10 entries stretched the bottom row 200px past the mockup.
  - A handful of smaller gaps in the column headings and cards.
- **Not yet checked by a person:** Microsoft Edge, dragging cards by hand to judge the feel, and moving a deal through the pipeline by keyboard alone while watching the focus outline. The end-to-end tests drag with the mouse and the keyboard, but how it feels needs a person.

## Review against main (Nov 20, 2026)

The `mvp` branch was reviewed against `main` with `docs/REVIEW.md`. `npm test` passed before any fixes. These are what it found, and how each was fixed. Each fix has a test that fails without it.

**Important**

1. **The sales funnel left out deals added in the evening, west of UTC.** It compared each deal's creation date in UTC with today's local date. In Los Angeles, a deal added after about 4pm was missing from the funnel until midnight (DASH-5, DASH-9). East of UTC, a deal added just after local midnight at the start of the 12-month window was dropped.
   **Fixed:** the funnel turns each creation time into a local date first (`clock.local_date`).
   - The sample data's times use the same clock (`clock.local_time`).
   - A frozen clock now fixes the time zone too, UTC unless a test gives one, so the backend tests give the same answers on any computer.
   - Two tests in `test_dashboard.py` add a deal at 6pm in Los Angeles and at 2am in India.
2. **Answering "no" to `npm run seed` on a new install left an empty database.** The command ran the migrations before it asked, so it created an empty `data/accountable.db` while printing "Nothing changed." The app then saw the file and never loaded the sample data (DATA-1).
   **Fixed:** the command asks first, and touches nothing unless the answer is `yes`. `docs/changes/mvp/plan.md` Phase 3 now has the steps in that order. A test in `test_seed.py` answers "no" on a new install, checks that nothing was created, then checks that the app's first start loads the sample data.

**Other bugs**

3. **Log activity's "When" kept the time the page was opened.** Logging a call 40 minutes after opening the page saved it 40 minutes early, so it also sorted below entries logged in between (ACT-1, ACT-2).
   **Fixed:** "When" keeps up with the clock, checked every 5 seconds, until it's changed by hand, and starts again after each log. `LogActivity.test.tsx` checks all three.

**Nits**

4. The Note, Call and Email picker was marked up as radio buttons, but the arrow keys didn't move between them.
   **Fixed:** it's built on the shadcn toggle group, which is a single Tab stop, with the arrow keys moving between the types.
5. `ui/select`, `ui/skeleton`, `ui/toggle-group` and `ui/toggle` were installed but unused, and Stage and Status used the browser's own select where spec 2.1 names shadcn/ui.
   **Fixed:** all four are used now.
   - Stage (deal form) and Status (contact form) use the shadcn Select.
   - The grey placeholders are built on Skeleton.
   - The type picker uses the toggle group.
   - The select's and toggle's own focus rings were taken out, so they show the brand's focus outline like every other control.
6. This file still said "Nothing is committed yet."
   **Fixed:** the top of this file now says what's committed.
7. The API didn't check the Host header, so a DNS-rebinding page could in principle reach it.
   **Fixed:** the API answers only requests addressed to `127.0.0.1` or `localhost`, and refuses any other host with a 400.
   - Tests in `test_meta.py` cover both cases.
   - The backend tests' clients now call it at `127.0.0.1`, since FastAPI's test client calls itself `testserver` by default.

## Docs layout (Nov 20, 2026)

The docs are set up for changes after the MVP. No code changed.

- `docs/intent.md` and `docs/plan.md` moved to `docs/changes/mvp/`. Each later change gets its own `docs/changes/<branch name>/` with its `intent.md` and `plan.md`, and agents read only the current branch's folder (AGENTS.md).
- `docs/spec.md` now describes the whole product as it stands today. It opens with the problem from the MVP's intent, no longer points to the intent as its source, and takes in what the build and the review settled: the choices below, the plan's decisions that change what the app does, and the review fixes. Its section numbers, requirement IDs and concerns 1 to 10 are unchanged, since code comments cite them. Concerns 11 (local dates) and 12 (the host check) and RUN-6 are new.
- `docs/REVIEW.md` has a new pass that flags code `docs/spec.md` doesn't describe, and points to the change's own `plan.md`.
- `AGENTS.md` points to `docs/STANDARDS.md`, the coding standards, and `docs/REVIEW.md` has a pass that checks each change against them. A standards finding is a nit unless it also breaks behavior or leaks data.
- **Left as they were:** some code comments cite the MVP plan ("plan, decision 11", "risk 9", "Phase 7") or its intent ("success criterion 2"). Those now live in `docs/changes/mvp/`, which agents on other branches don't read. Most of what they point to is in `docs/spec.md` now, so a later change could make them cite the spec instead.

## Code checks (Nov 20, 2026)

`npm run check` runs every check in `scripts/check.mjs`, then `npm test`, and says which failed. `npm run check:quick` leaves out the end-to-end tests, and `npm run format` fixes the formatting. AGENTS.md tells agents to run `npm run check` before calling work finished.

**How it's set up**

- ESLint replaces oxlint. Its config, `eslint.config.js`, is at the root and covers `frontend/`, `e2e/` and `scripts/`, as Prettier does. Prettier and ruff wrap at 120 characters, the width the code already used.
- typescript-eslint doesn't support TypeScript 7 (the Go compiler) yet. So the root has TypeScript 6.0 for ESLint's parser only, and `frontend/` keeps 7.0 for `tsc`. Once typescript-eslint supports 7, the root's copy can go.
- ESLint is version 10, since 9 is out of support. eslint-plugin-jsx-a11y still names ESLint 9 as its peer but uses nothing 10 removed, so `package.json` has an `overrides` entry for that peer.
- Coverage counts lines. The backend measures `backend/app`. The frontend measures every file in `src/`, not only the ones a test imports, apart from the test helpers and `main.tsx`.
- gitleaks scans every commit and every file with its default rules. `.gitleaks.toml` allows `.env` and the installed packages in `.venv/` and `node_modules/`, where it found 2 false positives inside SQLAlchemy. In a scratch folder, a token in `.env`, `.venv/` or `node_modules/` passed, and the same token in `backend/` failed.

**What the checks found, and the fixes**

- **Complexity:** `DeleteDialog` (41), `ContactForm` (25) and `DealForm` (20). The dialog now loads the impact, chooses the words and runs the delete in separate pieces. Each form keeps its logic apart from its fields.
- **React Hooks:** the table reset its page in an effect after a new search. It now resets while rendering, the pattern React suggests.
- **Accessibility:** the two Done tickboxes' labels point at their tickbox, and the picker names the list it opens (`aria-controls`). A pipeline card spells out the `role="button"` and `tabIndex` that dnd-kit already gave it, so the linter can see them. The magnifier in a picker's search box no longer focuses the box when clicked, because that was a click handler on a non-interactive element. The box already has focus when the picker opens.
- **ty:** the update models declared fields like `name: str = None` with mypy ignores, which ty doesn't accept. They're now `Change[...]`: `None` when left out, and still refusing a null that's sent, now with "This can't be empty." instead of the field's own message. New ids come back with `RETURNING`, the dashboard's counters are TypedDicts, and Pydantic errors use a literal template.
- **ruff:** its defaults now include pyupgrade, isort and simplify rules: `datetime.UTC`, `X | None`, import order, two nested `if`s and a list index.
- **Formatting:** Prettier reformatted 125 files and ruff 12. The one-line records in `seed_data.py` now wrap.

**Agreed before changing**

- Frontend unit coverage was 48% of lines. New Vitest tests render each page against the fake API (`App.test.tsx` and `pages/*.test.tsx`), which brought it to 83%. The backend is at 98%. The board's drag handlers need real layout, so Playwright still covers dragging.
- `no-empty-pattern` allows `({}, use)` as a parameter in `e2e/` only, since that's how Playwright writes a fixture with no dependencies.
- gitleaks allows `.venv/` and `node_modules/` as well as `.env`.

**Last run:** two checks failed, and the rest passed, end-to-end tests included. Prettier failed on four test files written after `npm run format`, and on Vitest's generated `frontend/.vitest/`. The files are formatted now, and `.vitest/` is git-ignored. gitleaks also failed, but it passes when started the way `npm run check` starts it, from a terminal with today's path. The likely cause is a terminal that doesn't have gitleaks on its path, so the message for that now says to open a new terminal.

**Left alone:** `npm audit` reports 4 moderate issues, all in the shadcn CLI's dependencies (`ts-morph`, `minimatch`). They were there before; the fix is a major shadcn upgrade.

## Hooks (Nov 20, 2026)

Three hooks, described in `docs/spec.md` 2.8:

- **Git pre-commit** (lefthook 2.2, `lefthook.yml`): formats the staged files and stages the result, then lints them and checks types and secrets. No tests. A frontend file takes about 8 seconds, docs alone under 1.
- **Claude Code, end of a turn** (`scripts/claude-hooks/check-on-stop.mjs`): runs `npm run check:quick`, about 2 minutes, and sends any failure back to Claude once a turn. It skips the run when no file has changed since the checks last passed.
- **Claude Code, `.env`** (`scripts/claude-hooks/protect-env.mjs`): refuses any change to `.env`.

The `gitleaks` step in `npm run check` now prints each finding's file, line and rule (`--verbose`), with the secret still hidden. Before, it said only how many it found.

**How they were tested**

- **Pre-commit:** each case staged a scratch file and ran `git commit -m ""`. Git runs the hook first and then stops at the empty message, so no commit was made either way. Results:
  - Badly formatted TypeScript, partly staged: it was formatted and staged again, and the unstaged line was back afterwards.
  - An ESLint error (`prefer-const`), a type error, and Python with an unused import and a type error: each stopped the commit, with the error shown. The Python file was formatted first.
  - A fake GitHub token in a docs file was stopped, with the file, line and rule shown. With gitleaks off the path, the commit was stopped with a message saying so.
  - A clean docs file passed with only gitleaks run.
- **End of a turn:** fed the JSON Claude Code sends:
  - As a second stop: it let Claude stop at once.
  - With an ESLint error in a new file: it ran `check:quick` and blocked, sending back only the ESLint output (470 characters).
  - With the file removed: it passed silently, and a second run with nothing changed was skipped in 0.3 seconds.
  - The real index was untouched each time.
- **`.env`:** fed 20 cases: edits and writes to `.env` in any folder, and shell commands that write, copy, delete or open it, were refused. `.env.example`, `.envrc` and other commands were let through. In this session, real Write and shell calls aimed at a `.env` in a scratch folder were refused, and ordinary edits and commands still ran.

## CI (Nov 20, 2026)

`.github/workflows/ci.yml` runs on every push to any branch, in one job named `check` (see `docs/spec.md` 2.8). gitleaks scans every commit and file first. Then Node 26 and uv are installed and `npm run check` runs, with the runner's own Google Chrome. If that fails, the Playwright report is uploaded. It uses no secrets.

Versions, looked up on Nov 20, 2026: `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7`, `astral-sh/setup-uv@v10.3.3` (its latest release; it has no `v10` tag) and gitleaks 8.30.1.

**How it was tested.** Before the first push:

- actionlint (with shellcheck) found no problems. With quotes taken off two variables in a copy, it reported both, so shellcheck was running.
- zizmor found only that the actions are named by version rather than by commit hash.
- The two gitleaks steps were run word for word in WSL Ubuntu, in a throwaway clone with the workflow committed:
  - With a wrong checksum, the install stopped and added nothing to the path.
  - As written, it installed gitleaks and put it on the next step's path, and the scan found no leaks.
  - With a fake GitHub token committed and then deleted in the next commit, the scan failed and showed the file, commit and rule.

**The first run on GitHub** (the `harness` branch, on your fork) got through gitleaks, the installs and every check, and 38 of the 40 end-to-end tests passed. The reset test then didn't run, since it waits for the others to pass. The two failures were races in the tests, which the slower runner lost:

- DEAL-1: `choose()` in `e2e/fixtures.ts` looked for a picker's search box across the whole page while the last picker was still fading out, so it found two. It now waits for the picker to go once an option is chosen.
- PIPE-8: dnd-kit starts listening for the arrow keys in a timer it sets at the pick-up, and the second round pressed ArrowRight straight after Space. Both rounds now go through `pickUp()` in `pipeline.spec.ts`, which waits for "Picked up" and then for a timer of its own. Timers with no delay run in the order they were set, so dnd-kit's has run by then.
- Shown on Windows by stretching each delay. With the picker's fade at 1 second, DEAL-1 failed 2 of 2 before the fix, and the tests that use `choose()` passed 18 of 18 after it. With zero-delay timers 300 ms late, PIPE-8 failed 2 of 2 before and passed 5 of 5 after. Waiting for "Picked up" alone wasn't enough: PIPE-8 still failed 3 of 3. Slowing Chrome's CPU 6 times over didn't bring out either race.
- After the fix, the deals, contacts and pipeline tests passed at normal speed, and so did `npm run check:quick`. The next run on GitHub, on commit 1554503, passed every step: 235 backend tests, 145 frontend tests and all 41 end-to-end tests, the reset test among them.

## Choices the build made (please check)

These fill gaps in the spec or follow library changes since the plan was written. `docs/spec.md` now describes the ones that change what the app does.

1. **Newer library versions.** The plan named React Router 7, Recharts 3, Zod 4 and Tailwind 4. The current stable versions installed are React Router 8, TanStack Table 9, TypeScript 7, Vite 8, Vitest 5, Recharts 3.11 and `@hookform/resolvers` 7. React Router 8 drops the `react-router-dom` package; the app imports from `react-router`.
2. **`httpx2` instead of `httpx`** for FastAPI's test client. Starlette 1.10 warns that `httpx` support is going away.
3. **Saving before answering.** Each request's transaction uses FastAPI's `Depends(..., scope="function")`, so the change is committed before the answer is sent. FastAPI's default commits after, and the browser's next request could miss the change.
4. **Write locks.** A request that changes data starts with `BEGIN IMMEDIATE`, so it waits its turn behind another writer (such as `npm run seed`) instead of failing halfway.
5. **Uvicorn watches only `backend/`** (`--reload-dir backend`), so it doesn't watch `node_modules`.
6. **An interrupted first install is repaired.** `npm run dev` checks for `node_modules/.package-lock.json`, which npm writes only when an install finishes, and runs `npm ci`. Plain `npm install` trusted half-unpacked packages and the frontend then failed to start.
7. **"80 activities" means notes, calls and emails.** The sample data has 80 of them, plus 64 stage changes that match each deal's path. `npm run seed` prints: "Sample data loaded: 15 organizations, 40 contacts, 35 deals, 80 activities (plus 64 stage changes)."
8. **"Created in the last 12 months" for the funnel** means created on or after the first day of the oldest month on the charts, so the funnel and the charts cover the same months.
9. **Wording the spec doesn't give:**
   - Field messages, such as "Enter a name.", "Use 120 characters or fewer.", "Enter a whole number of dollars from $0 to $100,000,000." and "Choose an organization from the list."
   - Empty board columns: "No deals here", and "None closed in the last 30 days" for Won and Lost.
   - The pipeline's line with a single late deal: "1 open deal, and it's late".
   - The dashboard with nothing to show: "Nothing due in the next 7 days." and "Nothing logged yet."
   - Recent activity's times: "Today, 9:01 AM", "Yesterday, 4:30 PM", then "Nov 18, 4:05 PM".
10. **Vitest stays on its default `forks` pool.** The `threads` pool ignores the America/Los_Angeles time zone the date tests need.
11. **Focus outline in the Midnight band** is Sea Mist rather than Cerulean, because Cerulean barely shows on Midnight.
12. **On the board, Enter opens a card and Space picks it up.** dnd-kit also picks a card up with Enter by default, which would leave no key to open it.
13. **With the mouse, the card goes where the pointer is.** Over the gap between two columns, the card stays where it was. dnd-kit's usual fallback, which goes by the card's outline, made a card bounce between two columns until React stopped with "Maximum update depth exceeded". A journey in `pipeline.spec.ts` holds a card in that gap to keep it fixed.
14. **Card dates stay in full** ("Dec 11, 2026", GEN-4). On a narrow column the date moves under the value rather than breaking in two.
15. **Charts draw in 400ms** rather than Recharts' default 1.5 seconds, since spec 2.6 keeps movement short. With reduced motion they don't animate.
16. **The revenue axis uses round steps** ($0, $50k, $100k, $150k). Recharts' own steps came out as $35k, $70k, $105k.
17. **The follow-ups and recent activity lists scroll** once they're taller than seven follow-ups, the height in the mockup, so the bottom row keeps the mockup's height. Recent activity holds 10 entries (DASH-8) where the mockup shows 6, so the last few are a scroll away.
18. **Frontend tests may take up to 15 seconds each** (Vitest's default is 5). A form test that opens a picker three times takes about 2 seconds, and passed 5 while `npm run dev` and the end-to-end servers were busy at the same time.
19. **Board columns have a 4px scrollbar.** The 12px between two columns has to hold both cards' focus outlines (4px each) and the scrollbar, so the cards can be as wide as their headings, as in the mockup. Chrome and Edge draw it at 4px. Other browsers use their own thin scrollbar, which makes the cards a few pixels narrower there.
20. **Two places keep the spec rather than the mockup.** The chart totals keep the spec's 30px line height (the mockup's comes out at 20px); their margins put the charts where the mockup has them. The main Add deal button stays 40px tall like the inputs on other pages (the mockup's is 37px).
