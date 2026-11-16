# Plan: building the Accountable MVP

This plan turns [intent.md](intent.md) and [spec.md](spec.md) into an order of work. It adds no new requirements: where it names a requirement (R…) or design point (D…), the spec is the source. The stack is in [TECH_STACK.md](TECH_STACK.md) and the look comes from the brand skill and the chosen mockup in [mockups/](mockups/).

Each phase ends at a **commit point**. At each one, `npm test` passes (from Phase 1 on), `docs/STATUS.md` says what's done, and the work is committed. A phase isn't started until the one before it is committed.

---

## 1. Files that change

Nothing exists yet apart from the docs, so almost every file below is new. `README.md` is the course's own guide and stays as it is.

### Repo root

| File | Change |
|---|---|
| `package.json` | New. npm workspaces `["frontend"]`. Scripts `dev`, `test`, `test:unit`, `test:e2e`, `seed`. Dev dependency `concurrently`. |
| `pyproject.toml`, `uv.lock` | New. Python 3.12, FastAPI, Uvicorn, SQLAlchemy Core, Pydantic, pytest, httpx (for the FastAPI test client). |
| `.gitignore` | Add `backend/data/` (D2) and the test database folder. |
| `docs/STATUS.md` | Updated at every commit point. By the end it has install and run steps a non-technical person can follow (R7). |
| `docs/spec.md` | Already updated: direction B with the left sidebar (2.7), the darker text-bearing colours (2.8), and the code layout grouped by feature (2.2). Phase 0 adds the answers on the funnel and rounding rules. |

The layout follows spec 2.2. Both halves are grouped by feature, with no base classes, repositories or generic CRUD helpers.

### Backend: `backend/app/`, eleven modules

| File | What it holds |
|---|---|
| `main.py` | FastAPI app, including each module's router under `/api`. On startup, creates and seeds the database if the file is new (R3). |
| `settings.py` | `ACCOUNTABLE_DB` (default `backend/data/accountable.db`, D2), `ACCOUNTABLE_TODAY`, and the single `today()` (D9). Later settings (Supabase, sign-in) go here too. |
| `api.py` | What every route shares: the request field types and their limits, the 422 field messages (R58), the delete preview shape and `plural()`. |
| `db.py` | Engine, metadata, all four tables (2.4), indexes (D7), `PRAGMA foreign_keys = ON`. |
| `stages.py` | The six stages, probabilities and open flag (R13). The deal rules as plain functions with no database: probability on create and stage change (R14, R15), close date on Won or Lost (R16), late flag (R17), expected revenue in cents (R18). |
| `organizations.py` | Its routes, request and response models, queries, delete preview and delete (R8, R26, R27, R31). |
| `contacts.py` | The same for contacts, including the status filter (R9, R23, R28, R32). |
| `deals.py` | The same for deals, plus `GET /stages`, `POST /deals/{id}/move` with renumbering (D8), and writing stage change entries (R10, R12, R29, R33, R40, R42). |
| `activities.py` | Activities and timelines, mark done, and refusing stage change entries (R11, R30, R34–R38, D5). |
| `dashboard.py` | `GET /dashboard` and its figures (R45–R50). |
| `seed.py` | Sample data generator with a fixed random seed and dates relative to today (R52–R55, D23–D25). `--reset` clears and reloads. |

Tests go in `backend/tests/`: `conftest.py` (a temporary database per test, the FastAPI test client and a fixed today), plus one test file per module (see Proof).

### Frontend: `frontend/src/`

| File | What it holds |
|---|---|
| `../package.json`, `../vite.config.ts`, `../tsconfig.json`, `../index.html` | Vite + React + TypeScript, the `/api` proxy to port 8000 (D1), and the Vitest config. |
| `main.tsx`, `App.tsx` | Routes (D15) and the QueryClient. |
| `api.ts` | The one fetch wrapper: base URL, JSON, and turning a 422 or 409 into messages a form or dialog can show. |
| `format.ts` | Money in cents shown as `$12,500`, the `$1.2M` axis format, and dates and relative times. |
| `styles/tokens.css`, `global.css` | Brand tokens (2.8), the type scale, a focus outline on every focusable element, and `@fontsource` imports (R2). |
| `components/` | Only what two or more features use: `AppShell` (the sidebar with Overview, Pipeline with its open count, Deals, Contacts and Organizations; D16), `DataTable` (R19–R25, D18), `Drawer`, `ConfirmDialog`, `Toast` (Radix; R57, D13, D14, D22), `StageBadge`. |
| `features/overview/` | The Overview page (D17): summary panel, revenue chart, funnel, deals won chart, and panels for follow-ups and recent activity. |
| `features/pipeline/` | The Pipeline page (D21): board, columns, cards, the Move to menu, the optimistic move, and its totals (R39–R44, D12). Probabilities come from `GET /stages`. |
| `features/deals/`, `features/contacts/`, `features/organizations/` | Each holds its table page, record page, form (React Hook Form + Zod), query hooks and types, and its CSS Modules (R8–R10, R19–R33). |
| `features/activities/` | Timeline, ActivityForm and the follow-up chip, used by the contact and deal pages and by Overview (R34–R38, D20). |

Tests sit next to the code they test, as `*.test.ts(x)` (see Proof).

**What was left out on purpose:**
- No separate service, repository or schema layers on the backend; a route can query the database directly.
- No API type generator.
- No shared hooks file.
- No folder per tiny component.

Each of these can be added later, when a real need appears.

### End to end: `e2e/`

| File | What it holds |
|---|---|
| `playwright.config.ts` | Uses the installed Google Chrome. Starts the backend and frontend on their own ports (not 8000/5173), with `ACCOUNTABLE_DB` pointing at a test database and `ACCOUNTABLE_TODAY` fixed. Never reuses a running dev server (R6). |
| `fixtures.ts` | Reseeds the test database before each test file by running the seed command (the same path as R4), and fails any test that logs a console error or warning (R59). |
| `tests/*.spec.ts` | See Proof. |

---

## 2. Order of work

### Phase 0: Decisions before code

1. ~~Pick a mockup direction.~~ Done: direction B for Overview and Pipeline, with the left sidebar (spec 2.7, D16, D17, D21).
2. ~~Add the darker text-bearing colours.~~ Done: `--cerulean-solid` and `--raspberry-solid` in spec 2.8.
3. ~~Settle the code layout.~~ Done: grouped by feature (spec 2.2).
4. ~~Confirm the funnel and rounding rules.~~ Done: the plan's proposed rules went into spec R18 and R48 as the defaults.

**Done when** all four are done. **Commit:** "Plan: decisions".

### Phase 1: Skeleton that runs and tests

1. Root `package.json` with workspaces and the scripts. Root `pyproject.toml`, then `uv sync`.
2. A FastAPI app with `GET /api/stages`, and a Vite React app that shows it through the proxy.
3. `npm run dev` starts both with `concurrently` on Mac, Linux and Windows (R1).
4. Test runners wired up, one smoke test each: pytest, Vitest, and Playwright opening the app.
5. Update `.gitignore`.

**Done when** `npm run dev` opens the app at `http://localhost:5173` and `npm test` passes with three smoke tests. **Commit:** "Build: skeleton".

### Phase 2: Database and sample data

1. `db.py` tables, indexes and foreign keys (2.4, D6, D7). `settings.py`, and the stage list in `stages.py`.
2. Startup creates and seeds the database when the file is new (R3).
3. `seed.py`: the deterministic generator with stage paths and matching stage change entries (R52–R55, D23–D25). It also builds the follow-ups (some overdue, one or two today, some upcoming) and the 3–4 late deals.
4. `npm run seed` clears and reloads rows in one transaction rather than deleting the file, so it works while the app is running (R4).

**Done when** the seed tests pass and `npm run seed` works with and without the app running. **Commit:** "Build: data and seed".

### Phase 3: API and business rules

1. The deal rules as plain functions in `stages.py` (R14–R18), tested first.
2. `organizations.py`, `contacts.py`, `deals.py` and `activities.py`: routes, request and response models, and queries (2.5), with 422 messages per field.
3. In `deals.py`: apply the rules on create and PATCH, write a stage change entry on every stage change, and add `POST /deals/{id}/move` with renumbering (D8). Reads include `is_late` and `expected_cents`.
4. In each record's module: the delete preview with counts, and the delete in one transaction. This includes the 409 for an organization with deals (R26–R30, D6).
5. `dashboard.py` and `GET /dashboard`: summary figures, 12 months of revenue and counts, funnel, recent activity, grouped follow-ups (R45–R50).
6. `activities.py` refuses to create, edit or delete stage change entries (D5).

**Done when** every backend unit test in Proof passes. **Commit:** "Build: API".

### Phase 4: Frontend foundation

1. `tokens.css` and `global.css` from 2.8 and mockup B, with bundled fonts (R2).
2. AppShell with the five-item left sidebar and the current section highlighted (D16). Routes for D15, including `/pipeline` and the back button. Each feature gets an empty page in its folder.
3. `api.ts` and `format.ts`. Agree the query-key convention so that changes invalidate lists, details and `dashboard` (D11).
4. The shared components: Drawer, ConfirmDialog, Toast and StageBadge, all keyboard-usable with visible focus (R57). Anything else waits until a second feature needs it.

**Done when** every route renders inside the shell, the frontend unit tests for formatting pass, and keyboard focus is visible everywhere. **Commit:** "Build: app shell".

### Phase 5: Tables, record pages and activities

1. DataTable, then the Organizations, Contacts (with the status filter) and Deals pages (R19–R25, D18). Late deals marked in the Deals table (R17).
2. Add and edit forms in the drawer, with a toast after saving (D13, D14).
3. Delete dialogs driven by the delete preview. The blocked organization delete offers only Close (R26–R30, D22).
4. Organization, contact and deal pages (R31–R33, D19).
5. Timeline, Log activity, edit, delete and mark done (R34–R38, D20).
6. End-to-end tests for tables, deletes, record pages and timelines.

**Done when** those end-to-end tests pass and every table action works by mouse and by keyboard. **Commit:** "Build: records".

### Phase 6: Pipeline

1. Board in `features/pipeline/` as mockup B draws it: summary strip, column header panels, cards with the probability bar. Six columns in R13's order, with cards in saved order, and the Late tag and red close date (R39, D21). Columns scroll sideways on narrow screens, and each column's cards scroll on their own.
2. dnd-kit drag between and within columns, dropping at any point (R40).
3. Keyboard pick-up, move and drop with the dnd-kit keyboard sensor, plus the "Move to…" menu on each card (R41).
4. Add button per column, creating the deal at the top (R42). Search box and open totals.
5. Optimistic moves that update totals at once, with rollback and a toast on failure (R43, R44, D12).
6. End-to-end tests for the pipeline.

**Done when** the pipeline end-to-end tests pass, including persistence after a reload and the keyboard move. **Commit:** "Build: pipeline".

### Phase 7: Overview (the dashboard)

1. The Midnight summary panel with the bar of open value by stage (R45, D17).
2. Recharts line chart of revenue won, headed by the 12-month total, and bar chart of deals won, with gridlines, axes and tooltips as D17 says (R46, R47).
3. The trapezoid funnel (R48), Follow-ups grouped with mark done (R50), and Recent activity linking to records (R49).
4. Every figure updates after a change (R51).
5. End-to-end tests for the Overview.

**Done when** the Overview end-to-end tests pass and the page matches mockup B by eye. **Commit:** "Build: overview".

### Phase 8: Quality and sign-off

1. **Speed (R56):** a test-only script loads about 1,000 rows per table. Measure search and sort, and page opens. Add row virtualization only if a table misses 200 ms.
2. **Accessibility (R57, R58):** check every page for keyboard use, focus return, labels, field errors and contrast.
3. **Layout (R60):** check widths of 1024, 1280 and 1440 px.
4. **Console (R59):** confirm the console-error fixture is on for every end-to-end test.
5. **Mockup match:** compare each screen with mockup B in Playwright screenshots, at 1440 px and at 1024 px, and fix the differences.
6. **Run instructions:** write the install and run steps in `docs/STATUS.md` (R7).
7. **Manual walkthrough (R61):** the student uses every section and action in a real browser.

**Done when** `npm test` passes, the walkthrough finds nothing open, and STATUS.md is complete. **Commit:** "Build: MVP done".

---

## 3. Risks

| # | Risk | What we do about it |
|---|---|---|
| 1 | **Drag and drop across columns is the hardest part.** Dropping at an exact point, keyboard moves between columns, and keeping the order after a refresh are easy to get subtly wrong (R40, R41). | Use dnd-kit's multi-container sortable pattern with its keyboard sensor, not custom code. The server owns positions and renumbers both columns in one transaction (D8). Test position, not just stage, in pytest and end to end. |
| 2 | **Optimistic updates fighting refetches.** A refetch landing mid-drag can jump cards or totals back (D12). | Cancel board queries before the optimistic write, keep a snapshot to roll back to, and refetch after the server replies. Cover the failure path with a test that forces the move to fail. |
| 3 | **"Today" and time zones.** Late deals, follow-up groups, "this month" and R16 all depend on the date. Tests run near midnight, or in another zone, can flake. | One `today()` on the server (D9) with an `ACCOUNTABLE_TODAY` override for tests. Store timestamps as UTC, and do date-only maths on dates. In end-to-end tests, set the browser clock to the same day. |
| 4 | **Funnel rule gap.** R48 counts a stage as reached if the deal's history passed through it, but a deal created straight at Proposal has no history through New and Qualified. | Proposed rule: a deal has reached every stage up to the highest one in its current stage or history, so the funnel only narrows. Lost deals use their last stage before Lost. Confirm in Phase 0. |
| 5 | **Rounding money.** Expected revenue is cents × probability ÷ 100, which can leave half cents. Totals that round each deal can differ from totals rounded once. | Round each deal's expected cents half-up, sum the rounded values, and use the same rule on the server and in the client copy. Unit-test it on both sides. |
| 6 | **Test data leaking into the user's data (R6).** | Tests always set `ACCOUNTABLE_DB` to a temporary file before the engine is created, end-to-end tests use their own ports, and Playwright never reuses a running server. A test asserts that the real database file is untouched. |
| 7 | **Shared end-to-end state.** Tests change data, so their order can matter. | Reseed before each test file through the seed command. Tests create records with unique names. Dashboard assertions read expected figures from the API rather than hard-coding them. |
| 8 | **Windows and offline.** Path separators, starting `uv` from npm, stopping child processes, and any asset fetched from a CDN would each break R1 or R2. | Use `concurrently` and npm scripts with no shell-only syntax. Fonts come from `@fontsource`. Phase 8 checks the app with the network off. STATUS.md says that installing needs the internet once and running doesn't. |
| 9 | **Seeding while the app runs (R4).** Deleting the file under a running server breaks it, and the open page keeps cached data. | Clear and reload rows in one transaction instead of deleting the file. STATUS.md says to refresh the browser after a reset. |
| 10 | **Contrast on brand colours (R58).** White text on Cerulean (4.0:1) and on Raspberry (3.6:1) fails AA at small sizes. | Use the darker solid tokens from Phase 0 for pills, tags and filled headers. Keep the plain colours for bars, dots and charts. |
| 11 | **Console noise (R59).** Recharts sizing warnings, React key warnings and Radix accessibility warnings are common. | A Playwright fixture fails any test that logs an error or warning, so noise is caught as soon as it appears. |
| 12 | **Speed at about 1,000 rows (R56).** Rendering 1,000 table rows or a long Won column can be slow. | Measure in Phase 8 before optimising. Add TanStack Virtual only to a table that misses 200 ms. Pipeline columns already scroll on their own. |
| 13 | **Scope creep from the mockups.** Mockups A and C have panels the spec doesn't ask for. | Build only what the spec and direction B need. Where the mockup and the spec differ, the spec wins (the sidebar, for example). Anything extra goes to STATUS.md as an idea. |
| 15 | **Schema changes once there's real data.** The MVP creates tables only when the database is new, so a later column change would need hand work on an existing database. | All tables are in `db.py`, so Alembic can be added in one place with the first schema change, or with the move to Supabase (spec 2.2). Not needed for the MVP. |
| 16 | **The layout drifting back into layers.** A fresh session may reach for `services/`, `schemas.py` or a shared `hooks.ts` out of habit. | Spec 2.2 states the grouping rule. A new file goes in its feature's module or folder. Something moves to shared code only when a second feature uses it. |
| 14 | **Delete counts going stale.** Counts in a delete dialog can change before the click (R26, R27). | The delete re-checks inside its transaction, and returns 409 if an organization has gained deals. |

---

## 4. Proof

`npm test` runs all of the tests below and fails if any test fails (R6). Each test names the requirements it covers, so a failure points at the spec.

### Backend unit tests (pytest, `backend/tests/`)

| File | Proves |
|---|---|
| `test_startup.py` | A new database file is created and seeded on startup, and an existing one is left alone (R3). `ACCOUNTABLE_DB` is honoured, and the default database file is never touched by tests (R6, D2). |
| `test_seed.py` | About 15 organizations in 5+ industries, 40 contacts covering all three statuses, 30 deals in all six stages, 80 activities (R52). At least one Won deal in each of the last 12 months, open deals closing ahead, 3–4 late deals, overdue, today and upcoming follow-ups (R53). Every deal past New has stage entries matching its path (R54). `example.com` emails and `555` phones (R55). Same data for the same seed (D23). Reset clears and reloads (R4). |
| `test_stages.py` | The deal rules as plain functions, with no database. A new deal takes its stage's probability unless one is given (R14). A stage change takes the new probability and replaces a hand-set one, and a hand edit without a stage change is kept (R15). Moving to Won or Lost sets the close date to today, and moving out leaves it (R16). The late flag (R17). Expected revenue and its rounding (R18). |
| `test_organizations.py` | Name is required, with a 422 message for the field (R8). The list includes `contact_count`, `deal_count` and `open_deal_value_cents`. The detail page data includes contacts and deals (R31). With deals, delete is blocked with a 409 and a message naming the count. Without deals, delete unlinks its contacts. The preview gives the same counts (R26, R27). |
| `test_contacts.py` | Required name and the allowed status values (R9). The status filter (R23). The detail includes deals and timeline (R32). Delete unlinks its deals, deletes activities linked only to it, and keeps those also on a deal. The preview counts match (R26, R28). |
| `test_deals.py` | Required fields, value ≥ 0 and probability 0–100 (R10). The rules are applied through the API on create and PATCH (R14–R16). Every stage change, by PATCH or move, writes exactly one entry with the old and new stage (R12). Moving within and between columns puts the card at the given index and renumbers both columns 0…n (R40, D8). A new deal goes to the top of its column (R42). Lists include `expected_cents` and `is_late`. Delete removes its stage entries and only-deal activities, and keeps those also on a contact (R29). `GET /stages` (R13). |
| `test_activities.py` | An activity needs a contact or a deal (R11). An activity on both shows in both timelines, newest first (R34, R36). Edit, delete and mark done (R30, R37). Follow-up grouping as overdue, due today and upcoming (R38). Stage change entries can't be created, edited or deleted (D5). |
| `test_dashboard.py` | With a fixed "today" and known data: open value and count, expected revenue, won this month, and the 12-month win rate (R45). Revenue and count for each of 12 months, including the current one (R46, R47). Funnel values and counts, including Lost deals and deals created past New (R48). The 10 most recent activities and stage entries (R49). Open follow-ups grouped and sorted soonest first (R50). Figures change after a deal is won and after a follow-up is added (R51). |

### Frontend unit tests (Vitest + Testing Library, `frontend/src/`)

| File | Proves |
|---|---|
| `format.test.ts` | Cents shown as `$12,500`, with the currency always present; `$1.2M` only in the axis format (2.8 rule 9). Relative and exact times, and the follow-up chip text (D20). |
| `api.test.ts` | A 422 becomes messages per field and a 409 becomes a message a dialog can show. |
| `components/DataTable.test.tsx` | Search filters across visible text columns, case-insensitive (R19). Sort toggles and shows in the heading (R20). The empty and no-results message with the add button (R25). |
| `components/ConfirmDialog.test.tsx` | Delete dialog wording from preview counts, the blocked organization case with only Close (R26, R27, D22), focus trap and return, and Escape (R57). |
| `features/deals/DealForm.test.tsx`, `features/contacts/ContactForm.test.tsx`, `features/organizations/OrganizationForm.test.tsx`, `features/activities/ActivityForm.test.tsx` | Every field has a visible label, errors appear next to the field and are announced, and the required fields and number limits work (R58, R8–R11). The activity form suggests the deal's main contact first (R35). |
| `features/activities/Timeline.test.tsx` | Entry icons, stage-change badges with no edit or delete, the follow-up chip in Raspberry when overdue, and the done checkbox (R34, R37, D20). |
| `features/pipeline/totals.test.ts` | Optimistic board totals: open total, expected revenue and per-column figures after a move, using probabilities from `GET /stages` (R43, D12). Rounding matches the server. |
| `features/pipeline/Board.test.tsx` | A failed move rolls the card and totals back and shows the error toast (R44). |

### End-to-end tests (Playwright with installed Chrome, `e2e/tests/`)

There is one file per success criterion in intent.md, as spec 2.10 asks. Every test also fails on any console error or warning (R59).

| File | Intent criterion | Proves |
|---|---|---|
| `start.spec.ts` | 1 | The app opens on Overview with sample data, and every section in the sidebar shows data (R1, R3). |
| `records.spec.ts` | 2 | For organizations, contacts and deals: add, search, sort, edit and delete. Every change is still there after a reload and after a backend restart (R5, R19–R22, R28, R29). |
| `delete-rules.spec.ts` | 2 | An organization with deals can't be deleted and the dialog names the count. Deleting a contact keeps its deals with no main contact (R26–R28). |
| `reset.spec.ts` | 2 | The seed command, run with the app up, brings back the sample data after changes (R4). |
| `filters-and-links.spec.ts` | 3 | The contact status filter, and each record page showing its linked records with working links (R23, R31–R33). |
| `pipeline-drag.spec.ts` | 4 | Dragging a card to another column changes the stage and probability, and the Deals table shows both. Won sets today's close date. A drop higher or lower in the same column stays after a reload. Board and column totals change before the server replies (R39, R40, R43, R15, R16). |
| `pipeline-keyboard.spec.ts` | 4, 9 | Space to pick up, arrows to move, Space to drop, Escape to cancel. The "Move to…" menu works too (R41). |
| `pipeline-add-and-late.spec.ts` | 4 | A deal added from a column starts at that stage at the top. Late cards show the Late tag and red date (R42, R17). |
| `timeline.spec.ts` | 5 | Log an activity with a follow-up from a contact naming a deal, and it shows in both timelines, newest first. A stage change adds its entry (R12, R34–R36). |
| `follow-ups.spec.ts` | 5, 6 | A new follow-up appears on Overview in the right group, and marking it done removes it (R38, R50). |
| `overview-figures.spec.ts` | 6, 7 | Tiles, both charts and the funnel are shown and match the API. Marking a deal Won changes the figures (R45–R48, R51). |
| `keyboard.spec.ts` | 9 | Every page can be used with the keyboard alone, with visible focus. Dialogs and the drawer trap focus, return it and close on Escape (R57). |
| `navigation.spec.ts` | 1, 4 | The sidebar opens each section. `/pipeline` opens directly and survives a refresh, and the back button works (D15, D16, R39). |

### Proof that isn't a test

- **Speed (R56, intent 8):** the Phase 8 measurement with about 1,000 rows per table, with the timings written in STATUS.md.
- **Look (intent 7):** Playwright screenshots of every screen at 1440 px compared side by side with mockup B, plus a check at 1024 and 1280 px against B's narrower layout (R60).
- **Real-browser walkthrough (R61, intent 10):** the student uses every section and action as a salesperson would, checks each screen by eye and watches the console. Passing tests is necessary but not enough.
