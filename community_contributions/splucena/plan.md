# Plan: building the Accountable MVP

This plan builds what `docs/intent.md` asks for, as `docs/spec.md` specifies it. Requirement numbers (R1 to R49) and decision and concern numbers refer to the spec. Concerns 8 to 13 are still open in the spec; the build follows their proposed answers unless they change before it starts.

## Files that change

Everything below is new except where it says otherwise.

### Repo root

| File | Purpose |
|---|---|
| `package.json` | npm workspace with `frontend`; the scripts `dev`, `dev:api`, `dev:web`, `seed`, `test`, `test:web`, `test:api`, `test:e2e`; dev dependencies `concurrently` and `@playwright/test`. `engines.node` set to `>=24`. |
| `package-lock.json` | Written by `npm install`. |
| `pyproject.toml` | The `backend` package; dependencies FastAPI, uvicorn, SQLAlchemy, Pydantic; dev dependencies pytest and httpx; `requires-python = ">=3.12,<3.13"`; pytest settings (`testpaths = ["backend/tests"]`). |
| `uv.lock` | Written by `uv sync`. |
| `.python-version` | `3.12`, so uv picks the right Python. |
| `.gitignore` (changed) | Adds `data/`, `e2e/.tmp/`, `test-results/`, `frontend/dist/`, `.venv/`, `__pycache__/`. |
| `AGENTS.md` (changed) | The commands, and how to run the app and the tests. |
| `docs/STATUS.md` (changed) | What's done and how to run it. |

### Backend: `backend/`

| File | Purpose |
|---|---|
| `backend/__init__.py` | Package marker. |
| `backend/config.py` | Reads `ACCOUNTABLE_DB` (default `data/accountable.db` at the repo root), `ACCOUNTABLE_TEST` (turns on the reset endpoint for end-to-end tests) and `ACCOUNTABLE_TODAY` (fixes "today" for tests). |
| `backend/clock.py` | `today()` and `now()`, using the computer's local date (Concern 12), overridden by `ACCOUNTABLE_TODAY` or by tests directly. Nothing else calls `date.today()`. |
| `backend/db/engine.py` | Creates the SQLAlchemy engine for the SQLite file, turns on foreign keys, creates the tables if they're missing, and reports whether the database is new. |
| `backend/db/schema.py` | The four tables and their indexes, with SQLAlchemy Core types that also work in Postgres (Concern 13). |
| `backend/db/organizations.py`, `contacts.py`, `deals.py`, `activities.py` | All queries for each table: list with search, sort, filter and paging; get; insert; update; delete; lookups; delete-impact counts. No raw SQL. |
| `backend/db/dashboard.py` | The dashboard's aggregate queries. |
| `backend/db/pipeline.py` | The board's cards and column totals. |
| `backend/domain/stages.py` | The six stages in order, their default probabilities, "open" and "closed", and the stage colors' names. One source of truth. |
| `backend/domain/money.py` | Converting dollars to and from whole cents. |
| `backend/services/deals.py` | Creating and updating deals, and changing stage. On a stage change it sets the probability (R17), writes the "Moved from ... to ..." entry (R30), updates `furthest_stage` and `lost_from_stage` (Decision 1), sets the close date and `closed_at` on Won or Lost (Decision 2), and makes the main contact a customer on Won (R31). The board and the form both go through it. |
| `backend/services/positions.py` | Board positions: placing a card between two others, putting new deals at the top, and renumbering a column when there's no gap left. |
| `backend/services/deletes.py` | Deleting organizations, contacts and deals by the rules in R19 to R21, in one transaction. |
| `backend/services/followups.py` | Follow-up state (`overdue`, `today`, `upcoming`, `later`) and whether a deal is late (Decision 3). |
| `backend/api/models.py` | Pydantic request and response models, with the field checks and messages of R23. |
| `backend/api/organizations.py`, `contacts.py`, `deals.py`, `activities.py`, `pipeline.py`, `dashboard.py`, `lookup.py` | The routes in the spec's API table. |
| `backend/api/testing.py` | `POST /api/test/reset`, which reloads the sample data. It's only added when `ACCOUNTABLE_TEST=1`. |
| `backend/main.py` | The FastAPI app: includes the routers, returns validation errors as `{ field: message }`, and seeds the database on start if it's new (R4). |
| `backend/seed.py` | The sample data (R46 to R49), with fixed random seed and dates relative to today. `python -m backend.seed` deletes the database and loads it again. |
| `backend/tests/conftest.py` | A fresh temporary database and a fixed "today" for each test; an API client; small factories for building records. |
| `backend/tests/test_*.py` | The tests listed under Proof. |

### Frontend: `frontend/`

| File | Purpose |
|---|---|
| `frontend/package.json` | React, React DOM, React Router, TanStack Query, TanStack Table, Recharts, dnd-kit (`core`, `sortable`, `utilities`), Radix UI (`dialog`, `alert-dialog`, `popover`, `select`, `toggle-group`), React Hook Form, Zod, `@hookform/resolvers`, Lucide, date-fns, and the three `@fontsource` fonts. Dev: Vite, TypeScript, `@vitejs/plugin-react`, Vitest, Testing Library, jsdom. Scripts `dev`, `build`, `test` (`vitest run`). |
| `frontend/vite.config.ts` | Port 5173; proxies `/api` to `API_TARGET` (default `http://127.0.0.1:8000`); Vitest settings. |
| `frontend/tsconfig.json`, `frontend/index.html` | Strict TypeScript; the page title and favicon. |
| `frontend/public/favicon.svg` | The Accountable mark, so there's no 404 in the console (R7). |
| `frontend/src/main.tsx` | Imports the fonts and global styles, and sets up React Query and the router. |
| `frontend/src/App.tsx` | Routes: `/` dashboard, `/pipeline`, `/deals`, `/deals/:id`, `/contacts`, `/contacts/:id`, `/organizations`, `/organizations/:id`. |
| `frontend/src/styles/tokens.css` | Brand colors, including Slate and the deep shades; fonts; radii (18px panels, 14px cards); spacing. |
| `frontend/src/styles/global.css` | Base styles, the shell and shared component styles. |
| `frontend/src/lib/api.ts` | `fetch` wrapper that turns 422 responses into field errors. |
| `frontend/src/lib/types.ts` | Types matching the API's models. |
| `frontend/src/lib/format.ts` | Money (`$12,500`, `$1.2M`), dates and percentages. |
| `frontend/src/lib/stages.ts` | Stage order, labels, colors and default probabilities, matching `backend/domain/stages.py`. |
| `frontend/src/lib/board.ts` | Pure functions for the board: moving a card in the client's copy of the columns and working out the totals (R35). |
| `frontend/src/lib/schemas.ts` | Zod schemas for the four forms, with the same messages as the backend. |
| `frontend/src/hooks/*.ts` | React Query hooks for each resource and its changes. |
| `frontend/src/components/Shell.tsx`, `IconRail.tsx`, `PageHeader.tsx` | The layout of mockup B. |
| `frontend/src/components/DataTable.tsx`, `SearchBox.tsx`, `Pagination.tsx` | The shared table with server-side sorting, searching and paging (R8 to R11). |
| `frontend/src/components/FormDialog.tsx`, `ConfirmDelete.tsx`, `Field.tsx`, `RecordSelect.tsx` | Dialogs, the delete confirmation that names the effect on linked records (R12), labelled fields with their messages, and the searchable record select (R25). |
| `frontend/src/components/StageChip.tsx`, `StatusChip.tsx`, `LateChip.tsx`, `Money.tsx` | Small display pieces. |
| `frontend/src/components/Timeline.tsx`, `ActivityForm.tsx` | A record's timeline and the form to log or edit an activity (R26 to R29). |
| `frontend/src/forms/OrganizationForm.tsx`, `ContactForm.tsx`, `DealForm.tsx` | The three record forms. The deal form fills in the stage's probability when the stage changes (Concern 9). |
| `frontend/src/pages/OrganizationsPage.tsx`, `OrganizationPage.tsx`, `ContactsPage.tsx`, `ContactPage.tsx`, `DealsPage.tsx`, `DealPage.tsx` | The tables and record pages. |
| `frontend/src/pages/PipelinePage.tsx` and `frontend/src/features/pipeline/Board.tsx`, `Column.tsx`, `DealCard.tsx`, `SummaryBar.tsx` | The board (R32 to R37). |
| `frontend/src/pages/DashboardPage.tsx` and `frontend/src/features/dashboard/HeroPanel.tsx`, `RevenueChart.tsx`, `PipelineByStage.tsx`, `Funnel.tsx`, `LostPanel.tsx`, `DealsWonChart.tsx`, `FollowUpLanes.tsx`, `ActivityTimeline.tsx` | The dashboard (R38 to R45). |
| `frontend/src/**/*.test.ts(x)` | The tests listed under Proof. |

### End-to-end tests: `e2e/`

| File | Purpose |
|---|---|
| `e2e/playwright.config.ts` | Uses the installed Google Chrome (`channel: "chrome"`). Starts its own backend on port 8100 with `ACCOUNTABLE_DB=e2e/.tmp/e2e.db` and `ACCOUNTABLE_TEST=1`, and its own frontend on port 5180 pointing at it. One worker, so tests don't share changing data. |
| `e2e/fixtures.ts` | Resets the data before each test through `/api/test/reset`, and fails any test that logs a console error or warning (R7). |
| `e2e/*.spec.ts` | The tests listed under Proof. |

## Order of work

Each phase ends with its checks passing. The student commits at the end of each phase.

### Phase 1: Scaffolding

1. Check Node 24 or later and uv are installed; stop and say so if not (see Risks).
2. Root `package.json` with the workspace and scripts, `pyproject.toml`, `.python-version`, `.gitignore`.
3. A minimal FastAPI app with `GET /api/health`, and a minimal Vite React app that calls it.
4. Vitest, pytest and Playwright each with one trivial test, wired into `npm test` so it fails if any of them fail.
5. `npm install`, `uv sync`.

Check: `npm run dev` starts both servers and the page shows the health response; `npm test` runs all three runners and passes.

### Phase 2: Data and business rules

1. `config.py`, `clock.py`, `domain/stages.py`, `domain/money.py`.
2. `db/schema.py` and `db/engine.py`.
3. The query modules for the four tables.
4. `services/deals.py`, `services/positions.py`, `services/deletes.py`, `services/followups.py`.
5. `seed.py` and the `npm run seed` script; seeding on start when the database is new.

Check: the Phase 2 pytest tests pass; `npm run seed` builds a database with the sample data.

### Phase 3: API

1. `api/models.py` with every check and message from R23.
2. The routers for organizations, contacts, deals (including `move` and `delete-impact`), activities, lookup, pipeline and dashboard.
3. The 422 error shape, and `is_late` and follow-up state on every response that needs them.
4. `api/testing.py`, added only under `ACCOUNTABLE_TEST=1`.
5. A speed test with a large data set (Proof).

Check: the Phase 3 pytest tests pass, including speed.

### Phase 4: Frontend foundations

1. `tokens.css` and `global.css` from the brand skill and mockup B; the fonts through `@fontsource`.
2. `Shell`, `IconRail`, `PageHeader` and the routes, with placeholder pages.
3. `lib/api.ts`, `lib/types.ts`, `lib/format.ts`, `lib/stages.ts`, `lib/schemas.ts`.
4. The shared components: `DataTable`, `SearchBox`, `Pagination`, `FormDialog`, `ConfirmDelete`, `Field`, `RecordSelect`, the chips and `Money`.

Check: the Phase 4 Vitest tests pass; the app shows the icon rail and moves between pages.

### Phase 5: Tables and record pages

1. Organizations: table, form, delete, page with its contacts and deals.
2. Contacts: table with the status filter, form, delete, page with its organization, deals and timeline.
3. Deals: table with Late badges, form, delete, page with its organization, contact and timeline.
4. `Timeline` and `ActivityForm`: log, edit, delete, mark a follow-up done; the contact choice on deals (Concern 11).

Check: the Phase 5 Vitest tests and the end-to-end tests for tables, records, forms and activities pass.

### Phase 6: Pipeline

1. `GET /api/pipeline` on the page; `SummaryBar`, `Board`, `Column`, `DealCard` as in mockup B.
2. dnd-kit with mouse and keyboard sensors; moving between and within columns; an optimistic update through `lib/board.ts`, rolled back with a message if the save fails (R35).
3. Adding a deal from a column; Won and Lost limited to 50 cards with "Show all" (R37); opening a deal from its card.

Check: the Phase 6 Vitest tests and the pipeline end-to-end tests pass.

### Phase 7: Dashboard

1. `HeroPanel` with the four figures and `RevenueChart`.
2. `PipelineByStage`, `Funnel`, `LostPanel`, `DealsWonChart`.
3. `FollowUpLanes` with "Done", and `ActivityTimeline`.

Check: the Phase 7 Vitest tests and the dashboard end-to-end tests pass.

### Phase 8: Finish

1. Run the whole end-to-end suite, including keyboard use, console errors and the speed check.
2. Compare each screen with mockup B's screenshots using Playwright, and fix what differs.
3. Update `docs/STATUS.md` and `AGENTS.md` with how to install, run, seed and test.
4. Go through every success criterion in `docs/intent.md` in a real browser, the way a salesperson would (criterion 9).

Check: `npm test` passes from a clean clone after `npm install` and `uv sync`.

## Risks

| Risk | What could go wrong | What the plan does about it |
|---|---|---|
| **Node version** | This computer has Node 22.16, but the stack needs Node 24 or later. Some packages or `engines` checks may fail. | Phase 1 checks first and stops with clear instructions to install Node 24 LTS before anything is built. |
| **Dragging on the board** | This is the riskiest part. dnd-kit across columns, dropping at any position, optimistic totals, saving the order and rolling back are fiddly, and dragging is hard to test reliably in Playwright. | Positions and totals are pure functions (`services/positions.py`, `lib/board.ts`) with their own unit tests. The server takes the cards either side, not raw numbers. End-to-end tests drag with small mouse steps, as dnd-kit needs, and also test the keyboard sensor. |
| **Stage-change rules in two places** | If the board and the form changed stage by different paths, a rule (probability, timeline entry, customer, funnel fields, close date) could be missed on one of them. | Both go through `services/deals.py`, and tests cover a stage change by `move` and by `PUT`. |
| **Dates and "today"** | Due, overdue, late and "this month" could differ between the browser and the server, or tests could fail depending on the day they run. | Only the backend works these out (Concern 12), through `clock.py`. pytest fixes "today"; the sample data is relative to the day it's seeded. |
| **Commands on Windows** | Shell syntax such as `VAR=x cmd` or `&&` chains that break in PowerShell. | Settings are passed by Playwright's `webServer.env` and by defaults in `config.py`, not on the command line. The scripts use only `concurrently`, `uv run` and `npm run`. |
| **Speed with 2,000 deals** | Slow searches, or a board that slows down with many cards. | Search, sort and paging are done in SQL with indexes. Won and Lost show 50 cards (Concern 8). A pytest test times the list, pipeline and dashboard endpoints with a large data set. |
| **Console warnings** | Recharts warns about zero-size containers; React warns about keys or controlled inputs. R7 allows neither. | The end-to-end fixture fails any test with a console error or warning, so they're found as they appear. |
| **Tests changing the student's data** | An end-to-end run could change `data/accountable.db`. | The tests use their own database file, ports and a reset endpoint that only exists in test mode. |
| **Money rounding** | Floating-point totals such as `$252,679.99`. | Values are stored in whole cents and summed as integers. |
| **Deleting the wrong things** | A delete could remove an activity that also belongs to the record that remains, or leave links to a deleted record. | `services/deletes.py` does it in one transaction, with a test for each rule, including the shared-activity case. |
| **Looking unlike the mockup** | The built screens drift from mockup B. | Tokens come from the brand skill and the mockup's CSS; Phase 8 compares screenshots. |

**Decided against:**

- **Alembic migrations**: the tables are created when the database is new, and the MVP has no existing data to migrate. Migrations come with Supabase later.
- **Global state libraries such as Redux**: React Query handles server data, and the board's optimistic update needs nothing more.
- **A component kit such as MUI**: its look would fight the brand. Radix gives accessible dialogs and selects without styling.
- **Database cascades for deletes**: the rules are easier to read and test in the service layer.

## Proof

`npm test` runs all of these and fails if any fail.

### Backend unit and API tests (pytest)

| File | What it proves |
|---|---|
| `test_stages.py` | The default probability for each stage; which stages are open and closed. |
| `test_deal_rules.py` | A new deal takes its stage's probability; a hand-set probability is kept until the stage changes, then replaced (R17). A stage change writes "Moved from X to Y" (R30). Moving to Won makes a lead or qualified main contact a customer and writes the status entry; nothing changes if it's already a customer, or if there's no main contact; nothing changes back when the deal leaves Won (R31). Won or Lost sets the close date to today and `closed_at` (Decision 2). `furthest_stage` only moves forward; `lost_from_stage` is set on Lost and cleared when the deal leaves Lost (Decision 1). |
| `test_positions.py` | Dropping at the top, middle and bottom of a column; moving within a column up and down; renumbering when there's no gap; new deals go to the top (R33, R34). |
| `test_deletes.py` | Deleting an organization keeps and unlinks its contacts and deals (R19). Deleting a contact keeps and unlinks its deals (R20). Activities linked only to the deleted record are deleted; shared ones keep the remaining link (R21). Delete-impact counts match. |
| `test_followups.py` | Overdue, due today, coming up (up to 7 days) and later, around the edges of each; done follow-ups don't show (R29). Late deals: open and past their close date; Won and Lost never late (Decision 3). |
| `test_validation.py` | Each message in R23: missing names, bad email, bad website, negative value, probability outside 0 to 100, a deal without an organization, an activity without a contact or deal; nothing is saved. |
| `test_api_lists.py` | Search across the named fields, sort both ways on each column, paging and totals, the contacts status filter, the deals stage and late filters (R8 to R10, R15). |
| `test_api_records.py` | Create, read, update and delete for each resource; record pages include their linked records and timelines newest first (R13 to R16, R27). |
| `test_api_activities.py` | Logging on a contact, a deal and both; an activity on a deal naming a contact appears in both timelines; system entries can't be edited or deleted (403) (R26 to R28). |
| `test_api_pipeline.py` | Column order and totals, open-only board totals, Won and Lost limited to 50 with `all=true` showing every card, and `move` changing stage and place (R32 to R37). |
| `test_dashboard.py` | Against a small known data set: the four figures, 12 months of revenue and deal counts with empty months as zero, pipeline by stage, the funnel and its Lost category by stage, the 10 latest activities, and the follow-up lists. Winning a deal and adding a follow-up change the figures (R38 to R45). |
| `test_persistence.py` | Data written through one engine is all there after opening a new engine on the same file, as after a restart; a new database is seeded on start, an existing one is not (R3, R4). |
| `test_seed.py` | The seed meets R46 to R48: the counts, every status and stage, won and lost deals spread over 12 months, at least 4 late deals, follow-ups in every state. Running it twice gives the same data. |
| `test_speed.py` | With 1,000 organizations, 5,000 contacts and 2,000 deals, each list, the pipeline and the dashboard respond in under 300 ms (R5). |

### Frontend unit tests (Vitest)

| File | What it proves |
|---|---|
| `format.test.ts` | Money with the currency, short money (`$1.2M`), dates and percentages. |
| `schemas.test.ts` | Each form's checks and messages, matching the backend's. |
| `board.test.ts` | Moving a card between and within columns in the client's copy, and the open, column, Won and Lost totals that follow (R35). |
| `DealForm.test.tsx` | Changing the stage fills in its probability, and a typed probability is kept on save (Concern 9). |
| `ConfirmDelete.test.tsx` | The dialog names the linked records and what happens to them (R12). |
| `FormDialog.test.tsx` | The first field has focus, Enter submits, Escape closes without saving, and focus returns to the opening button (R24). |
| `FollowUpLanes.test.tsx` | Follow-ups land in the right lane, and "Done" calls the API. |

### End-to-end tests (Playwright with Google Chrome)

Each test starts from the sample data and fails on any console error or warning.

| File | What it proves | Success criterion |
|---|---|---|
| `start.spec.ts` | The app opens on the dashboard, and every screen shows sample data. | 1 |
| `organizations.spec.ts` | Add, search, sort, edit, delete with confirmation; contacts and deals are kept and unlinked; the organization's page lists its contacts and deals; changes survive a reload. | 2, 3 |
| `contacts.spec.ts` | The same for contacts, the status filter, and the contact's page with its organization and timeline. | 2, 3 |
| `deals.spec.ts` | The same for deals, Late badges, and the deal's page with its links and timeline. | 2, 3 |
| `forms.spec.ts` | Bad input shows the message beside the field and saves nothing; a form can be filled and submitted from the keyboard; Escape closes a dialog. | 2, 8 |
| `activities.spec.ts` | Logging a note, call and email with a follow-up on a contact and a deal; newest first; the activity appears in both timelines when it names a contact; edit and delete. | 5 |
| `pipeline.spec.ts` | Dragging a card to another column changes its stage and probability, which the Deals table shows; dropping higher and lower in a column, and the order surviving a reload; totals changing as soon as the card drops; adding a deal in a column starts it at that stage; late cards stand out; moving a card by keyboard. | 4 |
| `won.spec.ts` | Dragging a deal to Won makes its main contact a customer, with the entry in the contact's timeline, and the dashboard's figures change. | 5, 6 |
| `dashboard.spec.ts` | The figures match the API's data; the line chart, bar chart, pipeline visual and funnel with its Lost category are drawn; a new follow-up shows in the right lane and leaves when marked done. | 6, 7 |
| `persistence.spec.ts` | Changes survive a browser reload, and resetting brings back the sample data, as `npm run seed` does. Surviving a restart is proven in `test_persistence.py`, since the end-to-end servers stay up for the whole run. | 2 |
| `speed.spec.ts` | Each screen loads and each main action responds in under a second with the sample data. | 8 |

### By hand

Before the MVP is called done, someone uses every section and action in a real browser, checks each screen against mockup B and the brand, and confirms there are no errors in the console (success criteria 7 and 9).
