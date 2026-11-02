# Plan: building the Accountable MVP

This plan turns `docs/spec.md` into build work: which files, in what order, what could go wrong and how we'll know it works. IDs such as S1 and P4 are the spec's requirements. The intent wins over the spec and the spec wins over this plan, apart from the [spec corrections](#spec-corrections) below, which Phase 1 makes to the spec itself.

A fresh session builds from this plan, so it says everything that session needs beyond the intent, the spec and the chosen mockup.

## Files that change

Only documents exist so far, so nearly every file is new.

### Existing files

| File | Change |
|---|---|
| `docs/spec.md` | The corrections below, made at the start of Phase 1 |
| `docs/STATUS.md` | Updated after each phase. Phase 8 adds the run instructions the spec describes |

`docs/intent.md`, `docs/TECH_STACK.md`, `docs/mockups/` and `README.md` don't change. `.gitignore` already covers the database and its journal files.

### New files: root and scripts

| File | What it holds |
|---|---|
| `package.json`, `package-lock.json` | Root scripts, the `frontend/` workspace, `concurrently`, `@playwright/test` |
| `pyproject.toml`, `uv.lock` | Python 3.12, the backend's dependencies, and `backend/accountable/` as an installable package built by `uv_build`, so uvicorn, pytest and the commands need no import-path settings |
| `playwright.config.ts` | Installed Chrome, ports 5199 and 8799, `reuseExistingServer` off, one worker |
| `shared/expected-revenue-cases.json` | One set of cases, read by both unit test suites |
| `scripts/setup.mjs` | Checks Node and uv and fetches what's missing, using Node built-ins only |
| `scripts/dev.mjs` | `npm run dev`: setup, port check, both servers, prints the address |
| `scripts/test.mjs` | `npm test`: setup, picks one temporary database path, then runs the type check, pytest, Vitest and Playwright |
| `scripts/data.mjs` | `npm run seed` and `npm run empty`: setup, then hands over to `cli.py` with the keyboard attached |
| `scripts/setup.test.mjs` | Unit tests for the setup decisions, run by Vitest |

### New files: backend

| File | What it holds |
|---|---|
| `backend/accountable/main.py` | App, trusted hosts, the JSON-only check, startup, connecting the routers |
| `backend/accountable/db.py` | Engine, the shared `metadata`, foreign keys, the write lock, database path, migrations on start, building a new database |
| `backend/accountable/cli.py` | The seed and empty commands |
| `backend/accountable/migrations/` | Alembic's `env.py` with batch mode on, so later SQLite table changes work, and the first migration |
| `backend/accountable/crm/tables.py` | SQLAlchemy Core tables |
| `backend/accountable/crm/schemas.py` | Pydantic request and reply models |
| `backend/accountable/crm/rules.py` | Stage-change rules, usual probabilities, expected revenue |
| `backend/accountable/crm/timeline.py` | Merged timelines and the last-activity queries |
| `backend/accountable/crm/sample_data.py` | Sample records, dated from a given day |
| `backend/accountable/crm/routers/` | `meta`, `organizations`, `contacts`, `deals`, `activities`, and `dashboard`, which also holds the dashboard figures and the funnel |
| `backend/tests/` | `conftest.py`, the test files under [Proof](#proof), and `limits_data.py`, which fills a database to the Q1 limits |

### New files: frontend

| File | What it holds |
|---|---|
| `frontend/package.json`, `index.html`, `vite.config.ts`, `tsconfig.json` | Build setup. Vite stays on the local machine, uses a strict port and reads the backend's port from the environment |
| `frontend/src/main.tsx`, `App.tsx` | Entry point, routes, query client |
| `frontend/src/styles.css` | Tailwind theme, taking its values from the tokens in `docs/mockups/shared.css` |
| `frontend/src/lib/` | `api.ts` for the fetch client, `money.ts`, `dates.ts` |
| `frontend/src/components/` | `Shell`, `DataTable`, `RecordPicker`, `ConfirmDelete`, `Chip`, `ConnectionMessage`, `EmptyState`, `MissingRecord` |
| `frontend/src/crm/queries.ts` | Types and TanStack Query hooks |
| `frontend/src/crm/deals.ts` | Expected revenue, the late rule, board totals and the result of a move |
| `frontend/src/crm/Timeline.tsx` | The timeline used by all three record pages |
| `frontend/src/crm/forms/` | Organization, contact, deal and activity forms |
| `frontend/src/crm/board/` | `Board`, `Column`, `DealCard` |
| `frontend/src/crm/charts/` | `RevenueChart`, `DealsWonChart`, `SalesFunnel`, `PipelineBand` |
| `frontend/src/crm/pages/` | `Dashboard`, `Organizations`, `Organization`, `Contacts`, `Contact`, `Deals`, `Deal`, `Pipeline` |

### New files: end-to-end tests

| File | What it holds |
|---|---|
| `e2e/fixtures.ts` | The base test: fails on console errors and on requests that leave the computer |
| `e2e/helpers.ts` | Reset the test database, drag a card, start a separate copy of the app |
| `e2e/*.spec.ts` | The nine test files under [Proof](#proof) |

### Layout rules

The intent says Accountable will grow from a sales CRM into a Business OS, including ERP, so the layout leaves room for the next business area and adds nothing else.

- **`crm/` holds everything specific to the sales CRM, on both sides.** A later business area gets a folder beside it with its own tables, routers and pages.
- **The top level holds only what every area needs.** `crm/` can import `db.py`, but `db.py` never imports `crm/`, so `main.py` passes it the function that fills a new database. Only `main.py`, `cli.py` and the migrations name `crm/`.
- **One database setup.** All tables share one `metadata` and one migration history, and SQLite-specific code stays in `db.py`, so the later move to Supabase's database starts in one file.
- **A router file holds its routes and their queries.** A module outside `routers/` exists only because several files use it.
- **`components/` and `lib/` hold only what any area could use.** Anything that knows about deals or contacts goes in `crm/`.
- **No extra layers.** No service or repository classes, base classes, generic routers that build routes for each record, or a folder per record type. Split a file when it's become hard to work in, not before.
- **Tests stay flat for now.** Nothing imports them, so moving them later costs nothing.

### Spec corrections

Writing this plan turned up gaps in the spec. Phase 1 makes these changes to `docs/spec.md`, so the two documents agree before any code exists.

1. **Libraries.** Add `cmdk` with Radix Popover for the searchable pickers, because Radix has no combobox. Add `@hookform/resolvers`, which connects React Hook Form to Zod. Add the tools the table leaves out: `typescript`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `jsdom`, `pytest` and `httpx`.
2. **Expected revenue.** Say how halves round: up, on both sides, using whole-number arithmetic. See risk 3.
3. **First run.** Step 2 reinstalls only if `package-lock.json` is more than 2 seconds newer than `node_modules/.package-lock.json`, and a failed install with `node_modules` already there warns and carries on. Step 3 runs `uv sync --frozen` on every start, with no date check. See risk 14.
4. **New database.** A first start builds the database under a temporary name and renames it once the migrations and sample data are done. See risk 7.
5. **Layout.** Replace the folder tree under Architecture with the files listed here. That moves the backend from `backend/app/` to `backend/accountable/`, puts the sales CRM in `crm/` on both sides, moves the migrations into the package and folds `dashboard.py` into its router. It also adds `scripts/test.mjs`, `scripts/data.mjs` and `shared/`. `npm run seed` and `npm run empty` also run setup, so they work before the first `npm run dev`.
6. **Testing table.** Add `e2e/quality.spec.ts` for N3 and Q2 to Q4, and `e2e/stress.spec.ts` for Q1. The table has no file for these. Add a TypeScript type check to `npm test`, because Vite doesn't check types.
7. **Calls made.** Add these to the list of calls made where the intent was silent: the Stage column sorts in pipeline order and the Status column sorts Lead, Qualified, Customer. Overdue follow-ups list oldest first. An activity's contact or deal can't be changed once it's logged, so the activity form needs no contact-or-deal picker. Sample Won and Lost columns start newest first.

## Order of work

There are eight phases, done in this order. Each ends with the app running and `npm test` passing. A requirement listed under more than one phase is built in parts, and it's complete in the last one.

For every phase:

- Start by reading `docs/intent.md`, `docs/spec.md`, `docs/TECH_STACK.md` and this plan. Use the brand skill for all UI work and the dataviz skill for the charts.
- Write the phase's tests from [Proof](#proof) in that phase, not at the end. A test that needs a later phase's screen, such as ticking a follow-up on the dashboard, waits for that phase.
- Open every new screen in Chrome and compare it with `docs/mockups/4-chosen-design.html`, or for screens the mockup doesn't show, with the spec's Screens section.
- Update `docs/STATUS.md` when the phase is done.
- Don't commit. The project owner commits at the end of the stage.

### Phase 1: a shell that runs

1. Make the spec corrections above.
2. Set up the root `package.json`, the `frontend/` workspace and `pyproject.toml`, then write `scripts/setup.mjs`, `dev.mjs` and `test.mjs`.
3. Build FastAPI with `GET /api/meta`, local-only listening, trusted hosts and the JSON-only check.
4. Build the React app: router, query client with `networkMode: 'always'`, Tailwind theme, the three fonts, messages, the top bar, five empty sections and the connection-lost message.
5. Set up all three test layers and the `e2e/fixtures.ts` checks, with the guards from risk 1.

Covers N1, N2, N3, N5, C1, C2, Q2, Q3 and Q4.

Done when `npm run dev` prints the address and the top bar matches the mockup, `npm test` runs one real test in each layer, and a console error added on purpose fails the end-to-end test before being removed.

### Phase 2: database, rules and sample data

1. Write `tables.py` and the first migration.
2. Write `db.py`: foreign keys on every connection, the database path worked out from the code's location so it never depends on the current folder, migrations on start, and the new-database build from risk 7.
3. Write `rules.py`, with today's date as an argument.
4. Write `sample_data.py`. Walk each sample deal through `rules.py` with an explicit date, so its stage history can't contradict the rules.
5. Write `cli.py` and `scripts/data.mjs`.

Covers S1, S4, S5, S6, M1 to M5, C3, C4 and C6.

Done when `npm run seed` and `npm run empty` work and ask first, a new database fills itself, and an emptied one stays empty after a restart.

### Phase 3: the API

1. Write `schemas.py` and the organization, contact and deal routers, including `delete-impact`.
2. Write the activities router and `timeline.py`.
3. Write `POST /deals/{id}/move` with column renumbering and the write lock from risk 6.
4. Write the dashboard router, with its figures and the funnel.
5. Write `backend/tests/limits_data.py` and time the list and dashboard replies at the Q1 limits now, while a slow query is cheap to fix.

Covers S1, S2, S3, S6, D1 to D3, F2, F5 to F7, F9, A1 to A5, T9, Q1 and the figures behind H1 to H8.

Done when every route in the spec's API table has tests, and the dashboard reply is under 200ms at the Q1 limits.

### Phase 4: tables and forms

1. Write the `lib/` files, `crm/queries.ts` and `crm/deals.ts`.
2. Build `DataTable` on Organizations, with its dialog form and `ConfirmDelete`.
3. Build Contacts, adding the status filter and `RecordPicker`.
4. Build Deals, adding the deal form's linked behavior.

Covers T1 to T9, F1 to F9, D1 to D3, S1, S4, S6, C3 and C5.

Done when each of the three tables can add, find, sort, edit and delete, and every change survives a refresh.

### Phase 5: record pages and timelines

1. Build the organization, contact and deal pages.
2. Build `Timeline` and the activity form.
3. Build the page for a record that no longer exists.

Covers R1 to R5, A1 to A5, N2, N4, S2, T1, T4, F1, F2 and D1.

Done when each record's page shows what it's linked to, and an activity logged on a deal shows on the deal, its main contact and its organization, once each.

### Phase 6: pipeline

1. Build a plain board with working drag, on a database filled to the Q1 limits, before any styling. Measure it. See risk 4.
2. Add the instant update, rollback and one-at-a-time saving.
3. Add the board and column figures.
4. Style it to the mockup.
5. Add Add deal, the message after a drop on Won or Lost, and keyboard moves.

Covers P1 to P9, S1, S3, S4, F1 and Q1.

Done when a card dropped anywhere stays there after a refresh, the figures change as it lands, and the keyboard can do everything the mouse can.

### Phase 7: dashboard

1. Build the page layout at 1440 by 900 with the summary line and headline figures.
2. Build the revenue chart first, because it's the one bold thing on the screen.
3. Build the pipeline band, the bar chart and the funnel.
4. Build Follow-ups and Recent activity.
5. Build every empty state.

Covers H1 to H9, S2, A3, D2 and C5.

Done when the dashboard matches the mockup at 1440 by 900 and 1280 by 720, with sample data, with an empty database and with the Q1 data.

Phases 6 and 7 depend on Phase 4 but not on each other, so they could swap if one gets stuck.

### Phase 8: finish the build

1. Finish `e2e/start.spec.ts`, `data.spec.ts`, `problem.spec.ts`, `quality.spec.ts` and `stress.spec.ts`.
2. Go through every screen on an empty database and fix what it finds.
3. Write the run instructions in `docs/STATUS.md`, for someone non-technical.
4. Clone the branch into a temporary folder and run `npm run dev` and `npm test` from scratch, then start it again with the network off.

Covers C5 and Q1 to Q4, and finishes N3, C1 to C4, C6 and H9.

Done when `npm test` passes from a fresh clone. The checks by hand under [Proof](#proof) then happen in the Test stage.

## Risks

Most damaging first. Where a risk says "checked", it was confirmed while writing this plan, by reading the package's source or running it.

1. **Tests wipe real data.** The end-to-end tests reset a database, so a wrong path destroys real records. Playwright reads its config again in every worker, so a temporary path made there would differ between the server and the reset. `scripts/test.mjs` picks the path once and passes it down. `playwright.config.ts` and `conftest.py` both stop if the path is missing or points at `data/accountable.db`. Phase 1.
2. **Losing Wi-Fi freezes the app.** TanStack Query pauses reads and saves when the browser reports being offline, even though the backend is on the same computer (checked: `networkMode` defaults to `online`). A card would land and never save. Set `networkMode: 'always'` on queries and mutations, and test it. Phase 1.
3. **The board and the dashboard disagree by a dollar.** Python rounds halves to the nearest even number and JavaScript rounds them up (checked: $1,010 at 5% gives $50 in Python and $51 in JavaScript). Floating-point values can make this worse. Both sides use whole-number arithmetic, multiplying first and rounding halves up, and both test suites read `shared/expected-revenue-cases.json`. The board also repeats part of the stage rules in the browser for the instant update, so the server's reply always replaces the browser's guess. Phases 2, 4 and 6.
4. **Dragging is slow at 500 deals.** A column can hold hundreds of cards and can't be virtualized (spec concerns 9 and 10). Phase 6 proves this first, on the Q1 data, before any styling. "Smooth" here means no task over 100ms during a drag. If memoized cards and tuned measuring don't get there, stop and take the numbers to the project owner before changing library.
5. **Enter on a card starts a drag.** dnd-kit's keyboard sensor picks up on Space and Enter by default (checked), so a keyboard user couldn't open a deal. Set it to Space only, so Enter opens the deal. Moving between columns by keyboard may also need its own coordinate logic, so try that before styling the board. Phase 6.
6. **Quick moves overlap.** Two fast drags send two requests, FastAPI runs them on separate threads, and renumbering reads a column before writing it, so one could undo the other. Moves share one TanStack Query mutation scope, so they're sent one at a time and in order (checked: `scope` exists in this version). All backend writes take one lock. Reads for the deals list are cancelled before the instant update, so an older reply can't overwrite it. Phases 3 and 6.
7. **An interrupted first start leaves an empty app for good.** M1 only fills a database that was just created. If the first start stops between creating the tables and adding the sample data, later starts would see an existing, empty database. The new database is built under a temporary name and renamed when finished, so "new" simply means the file isn't there. Phase 2.
8. **Times and dates shift.** SQLite stores no time zone, so a UTC time comes back unmarked and the browser reads it as local. The API always sends times with a `Z`. Plain dates always go through `parseISO`. The backend's "today" is the computer's local date, passed as an argument so tests can fix it. Phases 2 and 4.
9. **Expected failures trip the console check.** Chrome logs every failed request as a console error, including the 404 behind N4 and the failed save in P4. The mockup work hit this with a missing favicon. Those tests name the exact message they expect, and anything else still fails. Q2 therefore means no unexpected errors. Phases 1, 5 and 6.
10. **Pickers misbehave inside dialogs.** `cmdk` sits in a popover inside a dialog, with a second dialog on top for F3, so focus and Escape have to close one layer at a time. React passes events up through portals, so saving a new organization in the second dialog could also submit the deal form underneath. The inner form stops its submit event from going further, with a test for it. Phase 4.
11. **Recharts can't quite match the mockup.** The mockup's charts are hand-drawn SVG. The funnel's segment shape, leader lines and pills all go in the custom `shape`, and the line's dashed last segment is a second series. Build each chart alone against the mockup's screenshot. If an option falls short, use a custom shape or label before changing the design. Leave `isAnimationActive` at its default of `auto`, which already honors reduced motion (checked). Phase 7.
12. **Real figures break the layout.** The mockup was tuned to its own numbers. A stage with no deals, a $12,500,000 deal, a long organization name or an empty list could break the one-screen layout. Phase 7 checks each screen with sample, empty and Q1 data.
13. **Lists get slow at the limits.** Last activity comes from the whole timeline, so one query per row would be thousands. Each list reply uses grouped queries, and Phase 3 times them.
14. **Offline starts rest on a fine margin.** If the install check fires needlessly, the app won't start offline. npm rewrites `package-lock.json` on every install and writes the hidden lockfile only 0.3 to 0.6ms later (checked, five runs), so the spec's check passes by less than a millisecond. The spec's `.venv` check is wrong too: after a sync that changes packages, the folder's date stays put and reads as older than `uv.lock` for good (checked). Correction 3 fixes both. `uv sync --frozen` with nothing to do took about a millisecond and reached no network, with a dead proxy as the control (checked). Making the backend an installable package doesn't change that: `uv_build` comes inside uv, so installing and rebuilding the project worked with an empty cache and no network on uv 0.13.6 (checked). Phase 1, proved in Phase 8.
15. **Vite reloads on first load.** When Vite finds a new package during a first visit it reloads the page, which can fail the first test or log a failed request. List the large packages in `optimizeDeps.include`, and give the tests their own Vite cache so they can't disturb a running copy. Phase 1.
16. **Sample data fails on awkward dates.** M3 needs two wins this month, even on the 1st, no won date in the future, and 12 months counted back from days like the 31st. `sample_data.py` takes the date as an argument, and tests seed on several awkward days. Phase 2.
17. **Library knowledge is out of date.** TanStack Table 9, React Router 8, Vite 8, Vitest 5, Zod 4 and TypeScript 7 are all recent. Read the installed package's types or current docs before using each one, and keep TanStack Table behind `DataTable`. For example, a third click on a heading must not clear the sort, which is a library default to check. All phases.
18. **Windows and Linux stay unproven** (spec concern 5). On Windows, Node's `spawn` won't run `npm.cmd` directly. All process starting goes through one helper in `scripts/setup.mjs`, and `concurrently` runs through Node from its own script file. `docs/STATUS.md` says these platforms are untested. Phases 1 and 8.

## Proof

`npm test` runs the type check, then everything below, and fails if anything fails. The spec's Testing table links each success criterion to these files.

### Unit tests: backend (pytest)

In `backend/tests/`. Each test gets a fresh temporary database and a fixed today.

| File | What it proves | Requirements |
|---|---|---|
| `test_rules.py` | Every row of the S1 table. A probability or close date given in the request is kept. A hand-set probability survives edits and goes when the stage changes. Naming the deal's current stage changes nothing and adds no entry. A won deal with no main contact. A reopened deal leaves its contact a customer. Moving to Qualified leaves the contact's status alone. A deal added at Won makes its contact a customer with no stage-change row. A failure partway leaves nothing changed. | S1, S4, S5, S6 |
| `test_move.py` | A move to a chosen place, to the end of a column and into an empty column. Moving within a column changes only the place and adds no entry. A form stage change and a new deal go to the top. Two moves at once leave a clean column. | S3, P2 |
| `test_records_api.py` | Required fields for each record. A set link can't be cleared and a blank one can stay blank. Email, website, value and probability rules, and `https://` being added. A won or lost close date can't be in the future. Two records can share a name. Errors are 422 with a message per field, and a missing record is 404. An activity needs exactly one of contact and deal. List replies have the right counts, open value and last activity. | F2, F5, F6, F7, F9, A1, T9 |
| `test_delete.py` | Each row of the delete table, with `delete-impact` counts matching what really happens. A won deal stays counted after its organization and contact go. A deal's activities stay when its main contact goes. | D1, D2, D3 |
| `test_timeline.py` | All three timelines, newest first, each entry once. Paging stays stable when entries share a time. Changing a deal's main contact moves its entries. Stage-change entries can't be edited or deleted. Done follow-ups stay on the timeline. All times carry a `Z`. | A2, A3, A4, A5, S2 |
| `test_dashboard.py` | Summary counts, headline figures, pipeline band and 12-month series against a small dataset with known answers. Month boundaries, an edited close date, a reopened deal and months with no wins. Follow-up order. The 10 newest entries, leaving out future ones. An empty database, with nothing dividing by zero. | H1, H2, H3, H4, H6, H7, H8 |
| `test_funnel.py` | Skipped stages, a deal moved backwards, a lost deal, a deal added at Won, every deal counting for New, and the percentage after a stage with no value. | H5 |
| `test_sample_data.py` | Every line of M3, seeded on Jan 1, Mar 1, Feb 29, Jan 31 and an ordinary day. Dates follow the seeding day. Every deal has a full stage history. Only `.example` addresses. The same content each time. | M2, M3, M4, M5 |
| `test_db.py` | Foreign keys are on for every connection. A new database fills itself. An emptied one stays empty after a restart. An interrupted first start leaves no half-built file. The path doesn't depend on the current folder. Data survives a restart. | M1, C3 |
| `test_migrations.py` | Migrations build the same tables as `tables.py`, including the check constraint and indexes, which the automatic comparison doesn't fully cover. | Data model |
| `test_cli.py` | Both commands show what will be lost and need `yes`. Any other answer, or nobody at the keyboard, wipes nothing. `--yes` skips the question. Both work with the app's connection open, and leave the file and tables in place. | C4, C6 |
| `test_security.py` | A wrong host is refused. A non-JSON body is refused. No cross-origin headers are sent. A `javascript:` website is refused. | Security section, F6 |
| `test_expected_revenue.py` | The shared cases, including halves, and open deals only. | Terms |
| `test_limits.py` | Dashboard reply under 200ms at the Q1 limits, and list replies timed. | Q1 |

### Unit tests: frontend (Vitest)

Beside the code they test, in `frontend/src/`, plus `scripts/setup.test.mjs`.

| File | What it proves | Requirements |
|---|---|---|
| `lib/money.test.ts` | `$48,000`, `$40k`, `$1.2M`, zero and large values. Money always has its currency. | Words |
| `lib/dates.test.ts` | `Oct 31, 2026` and `Oct 31, 3:20 PM`. Plain dates don't shift near midnight in US and Asian time zones. UTC times show as local. | Terms |
| `crm/deals.test.ts` | Expected revenue from the shared cases. Due today isn't late, yesterday is, and closed deals never are. Board totals count open deals only. The result of a move: stage, probability, close date and place, for each row of S1. | P3, P4, S1, T8 |
| `lib/api.test.ts` | A 422 becomes messages per field, a 404 becomes a missing record, and no reply becomes the connection-lost state. Reads and saves still run after the browser reports offline. | F2, N4, N5, C2 |
| `components/DataTable.test.tsx` | Search ignores case and matches any text column. Sort goes ascending then descending, and a third click doesn't clear it. Blanks sort last both ways. Stage sorts in pipeline order. 50 rows a page. Search and sort cover every row. Search, sort and page are read from the address and written to it. | T2, T3, T4, T5 |
| `crm/forms/DealForm.test.tsx` | Defaults from the column's stage. Choosing an organization narrows the contacts, and choosing a contact fills in the organization. A stage change shows the new probability and close date, and both can be overtyped. A blank link stays "None". Error wording. | F1, F2, F4, F5, F7, F8 |
| `components/RecordPicker.test.tsx` | Searching, offering to add when nothing matches, selecting the new record, and the inner form not submitting the outer one. | F3 |
| `crm/Timeline.test.tsx` | Each entry shows its type, time, description, any follow-up and its link. Stage-change entries have no Edit or Delete. Show more after 50 entries. A done follow-up is marked done. | A2, A3, A4, A5 |
| `scripts/setup.test.mjs` | Node version and uv checks with their messages. Installs when `node_modules` is missing or the lockfile is more than 2 seconds newer. Skips on a tie or a smaller gap. Carries on with a warning if an install fails with `node_modules` present. | C1 |

### End-to-end tests (Playwright Test)

Every test uses the installed Chrome, and fails on any console error it didn't name in advance and on any request outside the computer. Tests run on ports 5199 and 8799 against a temporary database, with `reuseExistingServer` off, and one worker. The database resets before each file. `start.spec.ts` and `data.spec.ts` start their own copy on ports 5198 and 8798, because they stop and restart it.

**`e2e/start.spec.ts`**

- `scripts/dev.mjs` prints the address and the app lands on the dashboard with sample data on every section (C1, N1, M1)
- A second start works with every network route pointed at a dead port, and nothing loads from outside the computer, including all three fonts (C2)
- A taken port stops the start with the spec's message (C1)
- Ctrl+C stops both servers (C1)
- Refresh, back and forward work on sections and records (N2)
- Opening a deleted record shows "This deal no longer exists" with a link back, and the same for the other records (N4)
- Stopping the backend shows "Can't reach Accountable. Check that it's still running." (N5)

**`e2e/records.spec.ts`**

- Organizations, Contacts and Deals: add, find by search, sort, edit and delete, with each change still there after a refresh (T1, T2, T3, C3)
- Clicking a row opens the record (T1)
- The status filter shows a count for each status and works with search (T6)
- Search, sort and page stay in the address, and coming back from a record returns to the same view (T4)
- Tables page at 50 rows (T5)
- An empty table invites the first record, and a search with no matches offers to clear it (T7)
- The Late chip shows beside a late deal's close date, and Last activity is right (T8, T9)
- Errors show beside the field (F2)
- Add buttons on record pages and columns fill in what they know (F1)
- A missing organization can be added from the picker and is then selected, with the deal form still open (F3)
- The deal form narrows contacts and fills in the organization (F4)
- A blank link shows "None" and saves blank (F5)
- Bad email, website, value and probability are refused (F6)
- A future close date is refused for a won deal (F7)
- Changing stage in the form shows the new probability and close date, and what's shown is what's saved (F8)
- Two records can share a name (F9)
- A contact's status can be changed by hand and stays that way (S6)
- Each delete dialog names the record and gives real counts, and the linked records end up as it said (D1, D2, D3)
- The organization, contact and deal pages show what R1 to R3 list, with the contacts and deals as short linked lists, plus Edit and Delete, and a delete returns to the table (R1, R2, R3, R4, R5)

**`e2e/data.spec.ts`**

- Changes survive a restart, including a card's place on the board (C3, P2)
- `npm run seed` with the app running brings back the sample data, and a refresh shows it (C4, C6)
- `npm run empty` with the app running leaves every screen working and inviting the first record (C4, C5, C6)
- An emptied database stays empty after a restart (M1)
- Without `yes`, nothing is wiped (C4)
- From an empty database, the first organization, contact and deal can be added (C5)

**`e2e/pipeline.spec.ts`**

- Six columns in order, each headed by its stage color (P1)
- Dragging to another column changes the stage and probability, and the Deals table shows both (P2, S1)
- A card dropped at the top, middle or bottom of a column, or higher or lower in its own, stays there after a refresh (P2, S3)
- A card dropped in an empty column lands there (P2)
- Board and column figures change before a delayed server reply arrives (P3, P4)
- Won and Lost show their count and value with no expected revenue (P3)
- A failed save returns the card and says so (P4)
- A card shows all its fields, a click opens the deal, and a short drag doesn't (P5)
- A late card has the chip and tint, and loses both when moved to Won (P6)
- Add deal in a column starts at that stage, at the top (P7)
- A drop on Won or Lost shows the message, sets the close date and adds the timeline entry, and Won makes the contact a customer (P8, S1, S2)
- A deal dragged back from Won follows S1, and its contact stays a customer (S1, S6)
- A hand-set probability stays until the stage changes (S4)
- A deal with no main contact can be won, and the message names no contact (S5, P8)
- With the keyboard, Space picks up, arrows move within and across columns, and Space drops. Enter opens the deal (P9)

**`e2e/activities.spec.ts`**

- A note, call and email can be logged from a contact and a deal, with a follow-up, and show newest first (A1, A4)
- An activity on a deal shows on its main contact's and organization's timelines, once each (A4)
- A stage change shows on the deal, contact and organization timelines and in recent activity (S2)
- Activities can be edited and deleted from any timeline they're on, and stage-change entries can't (A2)
- A follow-up can be ticked done on the dashboard or a timeline, and unticked on a timeline, leaving the dashboard but not the timeline (A3, H6)
- Show more loads entries after the first 50 (A5)

**`e2e/dashboard.spec.ts`**

- With a small known dataset, the summary line and four headline figures are right, and each links to its detail (H1, H2)
- The pipeline band shows each open stage's value and count, and links to the Pipeline (H3)
- Both charts cover 12 months with the current one marked "so far", and each has a hover tooltip (H4)
- The funnel shows each stage's value and percentage from New down to Won (H5)
- Follow-ups list overdue first, each with a link and tick box, with the Overdue chip and the counts in the heading (H6)
- Recent activity shows the 10 newest, each with a link, and leaves out future ones (H7)
- An empty database shows the designed empty states (H8)
- Marking a deal won updates this month's revenue and count, and a new follow-up appears (S1, H2, H6)
- The dashboard fits 1440 by 900 with no page scrolling

**`e2e/problem.spec.ts`**

- Starting from the dashboard, each of these is reached within two clicks: which companies we deal with, who our contacts are, what's in the pipeline, what happened last with a customer and what needs doing next (H9)

**`e2e/quality.spec.ts`**

- Every screen has no horizontal scrolling at 1280 by 720 and 1440 by 900 (N3)
- A walk through every screen and main action logs no console errors (Q2)
- Every control can be reached by Tab and shows a focus ring (Q3)
- With reduced motion set, nothing animates (Q3)
- After the browser reports offline, a drag and a follow-up tick still save (C2)
- The run uses the installed Chrome (Q4)

**`e2e/stress.spec.ts`**

At 1,000 contacts, 500 deals and 5,000 activities, taking the median of five readings so one slow moment doesn't fail the run:

- The dashboard's data arrives in under 200ms (Q1)
- Each table opens in under a second (Q1)
- A search keystroke updates within 100ms (Q1)
- Dragging a card, including into a long Won column, has no task over 100ms (Q1, P2)

### By hand

Tests can't settle these, so they happen in the Test stage.

- **Criterion 7:** compare every screen with the chosen mockup at 1440 by 900 and 1280 by 720.
- **Criterion 8:** the project owner checks the five answers with no instructions (spec concern 7).
- **Criterion 9:** the agent uses every section and action in a real browser, including an emptied database, a restart and a start with the network off, and fixes what it finds. Then the project owner uses it and has the final say.
