# Plan: building the Accountable MVP

Based on `docs/changes/mvp/intent.md` (the bar) and `docs/spec.md` (the design). No code written yet.

Working rule: no new abstraction until it has a second user — no repository or service layers, no generic components "for later", until a real use shows up.

## Files that change

Nothing exists yet, so almost everything is new. Only two files are edited.

**New — root**

- `package.json` — npm scripts `dev`, `test`, `seed` (seed asks for confirmation), `lint`, `format`
- `tsconfig.json` — TypeScript in strict mode, on from day one
- `eslint.config.js`, `.prettierrc` — default ESLint and Prettier configs, no custom rule-writing
- `pyproject.toml`, `uv.lock` — Python deps for the backend
- `frontend/package.json` — npm workspace member, frontend deps

**New — backend (`backend/`)**

- `app/main.py` — FastAPI app, static-free JSON API under `/api`
- `app/db.py` — engine, connection, SQLAlchemy Core schema (organizations, contacts, deals, activities)
- `app/routes/` — `organizations.py`, `contacts.py`, `deals.py`, `activities.py`, `dashboard.py`, plus `common.py` (`require_exists`, the foreign-key check shared by the record routes)
- `app/seed.py` — sample data; fills a new database, rebuilds it on reset
- `app/stats.py` — dashboard aggregations (12-month buckets, pipeline totals, expected revenue, follow-up split)
- `tests/` — `test_seed.py`, `test_crud.py`, `test_cascade.py`, `test_stage_move.py`, `test_dashboard.py`, `test_reset.py`

**New — frontend (`frontend/`)**

- `index.html`, `vite.config.ts`, `src/main.tsx`, `src/routes.tsx` — app shell, five sections
- `src/styles/brand.css` — brand tokens (colors, fonts, radii)
- `public/fonts/` — Instrument Sans, Instrument Serif, JetBrains Mono, bundled for offline use
- `src/api/client.ts` — typed fetch wrapper for the JSON API
- `src/components/DataTable.tsx` — shared table: search, sort, add, edit, delete-confirm with cascade list
- `src/components/Modal.tsx`, `ConfirmDialog.tsx`, `Field.tsx`, `DealForm.tsx` (shared by the deals table and the pipeline's column add), `Timeline.tsx` (shared by the contact and deal pages)
- `src/pages/` — `Dashboard.tsx`, `Organizations.tsx`, `Organization.tsx`, `Contacts.tsx`, `Contact.tsx`, `Deals.tsx`, `Deal.tsx`, `Pipeline.tsx`
- `src/lib/charts.ts` — chart data mapping (API payload → monthly buckets, funnel rows); the Recharts line/bar render inside `Dashboard.tsx`
- `src/components/PipelineBoard.tsx` — dnd-kit board, columns, cards, totals
- `src/lib/` — `money.ts`, `dates.ts`, `pipeline.ts` (positions, expected revenue, late-deal flag), `cascade.ts` (delete confirmation preview), `activity.ts` (activity dot colors), `text.ts`
- `src/**/*.test.ts(x)` — Vitest unit tests

**New — end-to-end (`e2e/`)**

- `playwright.config.ts`
- `helpers.ts` — sample-data reset through the real seed command, console watcher, date helper (always against the e2e database)
- `startup.spec.ts`, `crud.spec.ts`, `contacts.spec.ts`, `pipeline.spec.ts`, `activities.spec.ts`, `dashboard.spec.ts`

**Edited**

- `docs/STATUS.md` — updated as each phase lands
- `docs/changes/mvp/plan.md` — this file, if the plan changes
- `AGENTS.md` — the Testing section: how `npm test` runs, and that e2e owns its own database
- `opencode.jsonc` — formatting only (trailing commas, final newline)

**Untouched**: `README.md` (the course's guide), `docs/changes/mvp/intent.md`, `docs/spec.md`, `docs/mockups/` (reference only).

## Order of work

### Phase 1 — Foundation: commands, database, app shell

Root `npm` scripts (`dev`, `test`, `seed` with confirmation), FastAPI app with the four tables in SQLAlchemy Core, sample-data seed, and the React/Vite shell with routes for the five sections and brand CSS tokens. Frontend gets its data through one typed client.

Lint and format are wired here too: strict TypeScript, ESLint + Prettier with default configs, `npm run lint` clean before Phase 1 is done.

Done when: `npm run dev` starts both sides, the browser lands on an empty dashboard shell, the API returns the seeded records, `npm run lint` is clean, and `npm test` runs green backend seed/schema tests plus a frontend smoke test.

**Status: done — 2026-11-14.** `npm run dev` starts both sides; the browser lands on the dashboard shell with no console errors; `/api` list endpoints return the seeded records; `npm run lint` clean; `npm test` green (backend: `test_seed.py` schema/seed coverage + `test_reset.py` confirmation; frontend: shell smoke test + API client test).

### Phase 2 — Records: tables, detail pages, activities

The shared `DataTable` (search, sortable headings, add/edit modal, delete with a confirmation that lists every linked record and activity that will go), the four record sections and their detail pages (organization → contacts + deals lists; contact/deal → details + timeline, newest first), and activities with follow-ups: log, edit, delete, linked to exactly one record.

Done when: all four records can be added, searched, sorted, edited and deleted from their tables, linked records show on each detail page, and persistence holds across refresh (verified in backend tests).

**Status: done — 2026-11-14.** CRUD endpoints with `q` search, sorting, status/stage filters and cascade-delete responses (covered by `test_crud.py` and `test_cascade.py`); shared `DataTable` with search, sortable headings, filters and add/edit modals; delete confirmations list the exact cascaded records (client-side preview, server lists asserted by tests); detail pages show linked records and newest-first timelines with activity log/edit/delete and follow-up labels. Verified in a real browser (add/search/sort/edit/delete, filters, timeline, cascade dialog, refresh persistence, no console errors); `npm test` green.

### Phase 3 — Pipeline and dashboard

The board: dnd-kit columns, drag between columns (stage + probability change) and within a column (position that persists), add a deal straight into a column, board and column totals updating immediately, overdue deals standing out. Then the dashboard: aggregation endpoint, line chart, bar chart, funnel, recent activity (including automatic stage-change entries), and the upcoming/overdue follow-ups list.

Done when: success criteria 4, 5 and 6 hold — stage moves change probability and totals live, dropped card positions survive a refresh, and dashboard figures match the data.

**Status: done — 2026-11-14.** `POST /deals/{id}/stage` (stage + default probability + renumbered columns + a system `stage_change` entry, read-only from the activity endpoints) returning board/column totals; `stats.py` with the dashboard aggregation (`/api/dashboard`:12-month won buckets, open pipeline, expected revenue, funnel, recent activity, follow-up split) covered by `test_stage_move.py` (7) and `test_dashboard.py` (7); dnd-kit board (`PipelineBoard.tsx`) with cross- and within-column drops, optimistic totals, column add, late cards standing out; dashboard page with KPI cards, Recharts line/bar, funnel bars, recent activity and follow-ups with mark-done. Verified in a real browser,12 steps covering criteria 4-6 with server round-trips asserted and a clean console. Two bugs found and fixed on the way: list endpoints iterated results after closing the connection (now materialized inside the `with` block), and same-column drops computed the target index after removing the dragged card (now the over-card's index in the full column). `npm test` green.

### Phase 4 — Finish: brand pass, tests, walkthrough

Visual pass against `docs/mockups/dashboard.html` and the brand skill (fonts bundled, light mode, no borders on one edge, no gradients), the full Playwright suite in `e2e/`, and the manual end-to-end walkthrough in a real browser with a clean console — every success criterion in `docs/changes/mvp/intent.md` checked by eye, then `docs/STATUS.md` updated.

**Status: done — 2026-11-14.** Visual pass: app chrome reshaped to the mockup (top bar with wordmark + Sea Green dot, pill navigation, "New deal" action, serif italic dashboard subtitle, larger mono KPIs); brand rules held throughout (bundled fonts, light mode, rounded panels, no edge borders, no gradients). Full Playwright suite: six specs in `e2e/` — `startup` (landing, sample data on every section, clean console), `crud` (add/search/sort/edit, cascade dialog lists and cancel, confirmed delete removes everything, `npm run seed` restores the sample data), `contacts` (status filter, detail pages with linked records and timelines), `pipeline` (cross-column drag changes stage/probability/totals, within-column slot survives refresh, column add starts at that stage, late cards stand out), `activities` (log with follow-up, newest first, read-only stage entries, follow-ups until marked done, edit/delete), `dashboard` (figures matched against independently computed API data, mark-won deltas, new follow-up reflected) — each spec resetting to sample data first,27 tests total. Criterion 8 walkthrough done in a real browser: all sections and actions exercised, screenshots reviewed, **zero console errors and zero external requests** (offline requirement verified by blocking everything non-localhost). `npm test` green:123 tests (53 backend,43 frontend,27 e2e). Final sign-off of the intent's criterion 8: given by the user on 2026-11-14 — the MVP is accepted.

Done when: `npm test` is green and the intent's criterion 8 walkthrough has been done and noted.

## Risks

1. **Offline fonts.** Google Fonts links break the no-internet requirement. Mitigation: download the font files into `frontend/public/fonts/` in Phase 1 and use `@font-face`.
2. **Card position persistence.** "Stays where it was dropped" is easy to fake and hard to keep honest. Mitigation: store a `position` per deal, renumber on drop, and cover exact-slot persistence with an e2e test that refreshes mid-board.
3. **Stage-change entries.** They are not user activities but must appear in timelines and recent activity. Mitigation: `type = stage_change` rows written server-side on stage move, excluded from activity create/edit endpoints, read-only in the UI (spec concern 4).
4. **Cascade delete correctness.** The confirmation must list everything that will go, including nested activities under contacts/deals of an organization. Mitigation: the delete endpoint computes the list in one query set; backend tests assert the exact lists.
5. **Dashboard figures drifting from the data.** Aggregations in SQL can disagree with what tables show. Mitigation: aggregation lives in one module (`stats.py`) with unit tests against a fixed fixture; e2e re-checks totals after a deal is marked won.
6. **SQLAlchemy Core without raw SQL.** Joins for search and cascade counts are more verbose in Core. Mitigation: keep queries in the route modules, small and tested; no ORM migration machinery to fight.
7. **Scope creep.** Intent's "not in the MVP" list is long (no sign-in, dark mode, mobile, tags, import/export). Mitigation: anything outside the five sections, four records and dashboard gets parked in `docs/STATUS.md`.
8. **Drag-and-drop across libraries.** dnd-kit within-column reordering plus totals recalculation is the most complex UI piece. Mitigation: isolate it in `PipelineBoard.tsx` with unit tests on the position/total logic, built in Phase 3 after the data layer is trusted.

## Proof

### Unit — backend (pytest, `backend/tests/`)

- `test_seed.py` — fresh database is seeded; sample data covers every stage and contact status; re-seeding is idempotent.
- `test_crud.py` — create/read/update for all four records; `q` search matches name/email/website; sort by each sortable column; contact status filter; stage filter; activity rejected unless linked to exactly one of contact/deal.
- `test_cascade.py` — deleting an organization returns the lists of its contacts, deals and their activities; deleting a contact or deal returns its activities; records are actually gone afterwards.
- `test_stage_move.py` — moving a stage sets the new stage's default probability; a manual probability survives until the stage changes; a `stage_change` entry is written with the right text; `position` updates persist.
- `test_dashboard.py` — won count and revenue bucketed into the last 12 months; open pipeline value and deal count; expected revenue = value × probability over open deals only; recent activity ordering; follow-ups split into upcoming and overdue.
- `test_reset.py` — reset restores the sample data after confirmation and refuses without it.

### Unit — frontend (Vitest, `frontend/src/**/*.test.ts(x)`)

- `DataTable` — search, sort and status/stage filter reducers.
- `money.ts` / `dates.ts` — USD formatting, close-date parsing, overdue/upcoming classification around "today".
- `pipeline.ts` — position renumbering after a drop, board and column totals, expected revenue, late-deal flag.
- Chart data mapping — API payload → 12 monthly buckets and funnel stage rows.
- Delete confirmation — cascaded payload → the exact list shown in the dialog.

### End-to-end (Playwright, `e2e/`, installed Chrome)

- `startup.spec.ts` — the one command starts the app; browser lands on the dashboard; every section shows sample data; no console errors (intent criterion 1).
- `crud.spec.ts` — add, search, sort, edit, delete for organization, contact and deal; the delete dialog lists linked records and activities; changes survive a refresh; `npm run seed` with confirmation brings back the sample data (criterion 2).
- `contacts.spec.ts` — filter contacts by status; detail pages show linked organization, contacts/deals and timeline (criterion 3).
- `pipeline.spec.ts` — drag between columns changes stage and probability in the deals list; drag within a column keeps the exact slot after refresh; board and column totals change on the move; a deal added in a column starts at that stage; overdue deals stand out (criterion 4).
- `activities.spec.ts` — log an activity with a follow-up; it appears in the timeline newest first; stage moves add their own entry; follow-ups show on the dashboard until marked done (criterion 5).
- `dashboard.spec.ts` — figures match the data after marking a deal won and after adding a follow-up; line, bar and funnel are present and correct (criteria 6 and 7).

Tests run on their own database, so `npm test` never touches real data. Passing tests still isn't enough: intent criterion 8 requires the manual walkthrough, recorded in `docs/STATUS.md`.
