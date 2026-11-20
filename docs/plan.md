# Plan: building the Accountable MVP

This plan turns `docs/spec.md` into a build. It lists the files, the order to build them in, what could go wrong, and the tests that prove the app works. Requirement IDs such as `DEAL-2` point to the spec. Where this plan and the spec disagree, the spec wins.

How to use it:

- Build the phases in order. Each phase ends with a "Done when" check, and the next phase starts only once that check passes.
- Write each phase's tests during that phase and run them as you go. Section 4, Proof, lists them all.
- Update `docs/STATUS.md` at the end of each phase, as AGENTS.md asks. The student makes the commits; the build doesn't.
- Add Python packages with `uv add` (or `uv add --dev`) and run Python with `uv run`. Never use `pip install` or `python3`.
- Install the current stable version of each library, and read its current docs (Context7) before using it. React 19, Tailwind 4, React Router 7, Recharts 3 and Zod 4 all changed their APIs recently.
- No emojis in code, logs or messages.

This machine runs Windows 11, with Node 24.17, npm 11.13, uv 0.13.7, Chrome 157 and Edge 157. Python 3.12 isn't installed yet; uv downloads it the first time the backend runs.

## 1. Files that change

Everything here is new except the files marked "changed". The build leaves `README.md`, `AGENTS.md`, `docs/intent.md`, `docs/spec.md` and `docs/mockups/` as they are.

### Root

| File | What it holds |
|---|---|
| `package.json` | `"private": true`, `"type": "module"`, `"workspaces": ["frontend"]`, `"engines": {"node": ">=24"}`. Scripts: `dev` (`node scripts/dev.mjs`), `seed` (`uv run python -m backend.app.seed`), `test` (`node scripts/test.mjs`), `test:backend` (`uv run pytest`), `test:frontend` (`npm run test -w frontend`), `test:e2e` (`playwright test -c e2e/playwright.config.ts`). Dev dependency: `@playwright/test`. |
| `package-lock.json` | Written by npm. |
| `pyproject.toml` | Python project `accountable`, with `requires-python = ">=3.12,<3.13"`, `[tool.uv] package = false`, and pytest settings `pythonpath = ["."]` and `testpaths = ["backend/tests"]`. |
| `uv.lock` | Written by uv. |
| `.python-version` | `3.12` |
| `alembic.ini` | `script_location = backend/migrations`. The database address comes from the settings, not from this file. |
| `.gitignore` (changed) | Add `data/` and `e2e/.data/`. The `*.db`, `*.db-wal` and `*.db-shm` lines are already there. |

### Scripts

These use only Node's built-in modules, so they work before anything is installed.

| File | What it holds |
|---|---|
| `scripts/lib/proc.mjs` | Helpers to: start a child process with its output prefixed (`[api]`, `[web]`); wait until a URL answers; stop a process and all its children; check that a port is free; open the browser. |
| `scripts/dev.mjs` | `npm run dev`, as spec 2.8 describes. |
| `scripts/test.mjs` | `npm test`. It runs `test:backend`, `test:frontend` and `test:e2e` in turn, running all three even if one fails. It then prints which passed and which failed, and exits with 1 if any failed. |
| `scripts/e2e-backend.mjs` | Used by Playwright. It deletes `e2e/.data/`, then starts the backend on port 8100 with `ACCOUNTABLE_DB_PATH=e2e/.data/test.db`, so each run starts from fresh sample data. |

### Backend

| File | What it holds |
|---|---|
| `backend/__init__.py`, `backend/app/__init__.py`, `backend/app/routers/__init__.py` | Empty files, so `backend.app` can be imported from the repo root. |
| `backend/app/config.py` | `Settings`, a dataclass read from `ACCOUNTABLE_DB_PATH`, `ACCOUNTABLE_API_PORT` and `ACCOUNTABLE_WEB_PORT`, with the defaults from spec 2.8. |
| `backend/app/clock.py` | `today()` gives the computer's local date, and `now()` gives the time in UTC with its time zone. Tests use `freeze(today, now)` and `unfreeze()`. |
| `backend/app/db.py` | `metadata` and the four tables (spec 2.2). `make_engine(path)` applies the SQLite settings. `get_conn` is a FastAPI dependency that gives each request one transaction. |
| `backend/app/rules.py` | Pure functions, with no database: stages, usual probabilities, open and closed, late, expected revenue, the 30-day window, the 12 months, the furthest stage and the funnel. |
| `backend/app/schemas.py` | Pydantic models for every request and answer. A UTC date-time type always writes a `Z`. |
| `backend/app/main.py` | `create_app(settings, seed_new=True)`, plus `app = create_app()` for Uvicorn. On start it creates `data/`, runs the migrations, seeds a new database, and keeps the engine on `app.state`. |
| `backend/app/routers/meta.py` | `GET /api/meta` |
| `backend/app/routers/organizations.py` | The organization endpoints, including delete-impact and delete. |
| `backend/app/routers/contacts.py` | The contact endpoints, the timeline, delete-impact and delete. |
| `backend/app/routers/deals.py` | The deal endpoints, `change_stage()`, move, the timeline, delete-impact and delete. |
| `backend/app/routers/activities.py` | Logging, changing and deleting activities. |
| `backend/app/routers/pipeline.py` | `GET /api/pipeline` |
| `backend/app/routers/dashboard.py` | `GET /api/dashboard` |
| `backend/app/seed_data.py` | The fixed sample content. Dates are written as offsets from the seed day. |
| `backend/app/seed.py` | `load_sample_data(conn, today, now)`, and the `npm run seed` command. `--yes` skips the question. |
| `backend/migrations/env.py`, `backend/migrations/script.py.mako` | The Alembic setup, using `db.metadata` and `render_as_batch=True`. |
| `backend/migrations/versions/0001_initial.py` | The four tables, with their checks, foreign keys and indexes. |
| `backend/tests/conftest.py` | Fixtures: a temporary database, a frozen clock, a test client for an empty database and one for a seeded database, and helpers that add records through the API. |
| `backend/tests/test_*.py` | The backend tests listed in Proof. |

### Frontend

Paths under `src/` are inside `frontend/`.

| File | What it holds |
|---|---|
| `frontend/package.json` | Dependencies, and the scripts `dev` (`vite`), `build` and `test` (`vitest run`). |
| `frontend/index.html`, `frontend/public/favicon.svg` | The page, and a favicon so the browser doesn't log a 404. |
| `frontend/vite.config.ts` | Settings for the Vite server: the port comes from `ACCOUNTABLE_WEB_PORT` (default 5173), with `strictPort`, and the host is `127.0.0.1`. `/api` passes to `http://127.0.0.1:<ACCOUNTABLE_API_PORT>`, and `cacheDir` comes from `ACCOUNTABLE_VITE_CACHE`. It also sets up the `@/` alias, React and Tailwind. Vitest settings: jsdom, the setup file, and `env.TZ = "America/Los_Angeles"`. |
| `frontend/tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` | TypeScript in strict mode. |
| `frontend/components.json` | shadcn/ui settings. |
| `src/main.tsx` | Fontsource imports, the query client, the router and the toaster. |
| `src/App.tsx` | The routes (spec 2.5, Pages) and the layout. |
| `src/styles/index.css` | Tailwind, the brand tokens from spec 2.6 as CSS variables mapped into Tailwind's theme, base type, the focus outline, and turning motion off when the computer asks. |
| `src/api/client.ts` | `api()`, a fetch wrapper that sends and reads JSON. On an error it throws `ApiError`, which carries the status, the message, and any field errors from a 422. |
| `src/api/types.ts` | TypeScript types for every API answer. |
| `src/api/meta.ts`, `organizations.ts`, `contacts.ts`, `deals.ts`, `activities.ts`, `pipeline.ts`, `dashboard.ts` | TanStack Query hooks that read and change each kind of record. |
| `src/lib/format.ts` | Formats money, short money, percentages, dates, date-times, the dashboard's date line and plural counts. |
| `src/lib/dates.ts` | Reads `YYYY-MM-DD` as a local day, converts a local date-time to UTC and back, and counts days late. |
| `src/lib/rules.ts` | The rules from `rules.py` that the browser needs, plus `safeHref()` for websites. |
| `src/lib/rules-cases.json` | Rule cases that both the backend and the frontend tests check. |
| `src/lib/board.ts` | `moveCard()`, `beforeIdAfterDrop()`, `columnTotals()` and `boardTotals()`. |
| `src/lib/words.ts` | The wording of the delete dialogs and the short messages. |
| `src/components/ui/*` | shadcn/ui components: button, dialog, alert-dialog, input, textarea, label, select, popover, command, tooltip, checkbox, skeleton, sonner and toggle-group. |
| `src/components/layout/TopBar.tsx`, `Band.tsx`, `PageBody.tsx` | The top bar, the Midnight band and the light content area. |
| `src/components/Badges.tsx` | The stage, status and Late badges. |
| `src/components/DataTable.tsx` | One table used by all three sections. It handles search, sorting, counts, pages, empty states and the buttons on each row. |
| `src/components/forms/schemas.ts` | Zod schemas with the spec's field rules and messages. |
| `src/components/forms/FormDialog.tsx` | The dialog every form opens in. It shows errors from the server. |
| `src/components/forms/OrganizationForm.tsx`, `ContactForm.tsx`, `DealForm.tsx`, `ActivityForm.tsx` | The four forms. |
| `src/components/forms/OrganizationPicker.tsx`, `ContactPicker.tsx` | Searchable pickers built from Popover and Command. |
| `src/components/DeleteDialog.tsx` | Loads the delete impact and shows the confirmation (spec 1.10). |
| `src/components/StageBar.tsx` | The deal's stage bar (DEAL-5). |
| `src/components/timeline/Timeline.tsx`, `TimelineEntry.tsx`, `LogActivity.tsx` | The timeline and its "Log activity" box. |
| `src/components/board/Board.tsx`, `ColumnHeading.tsx`, `BoardColumn.tsx`, `DealCard.tsx` | The pipeline board. |
| `src/components/dashboard/HeadlineFigures.tsx`, `PipelineStrip.tsx`, `RevenueChart.tsx`, `DealsWonChart.tsx`, `Funnel.tsx`, `FollowUps.tsx`, `RecentActivity.tsx` | The parts of the dashboard. |
| `src/components/states.tsx` | Placeholder blocks, empty states, "Page not found", and "This contact no longer exists". |
| `src/pages/*.tsx` | `DashboardPage`, `OrganizationsPage`, `OrganizationPage`, `ContactsPage`, `ContactPage`, `DealsPage`, `DealPage`, `PipelinePage` and `NotFoundPage`. |
| `src/test/setup.ts` | The Testing Library matchers and cleanup. |
| `src/**/*.test.ts(x)` | The frontend tests listed in Proof, each beside the code it tests. |

**Dependencies.**

| Part | Packages | Dev-only packages |
|---|---|---|
| Frontend | react, react-dom, react-router, @tanstack/react-query, @tanstack/react-table, recharts, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, react-hook-form, zod, @hookform/resolvers, sonner, lucide-react, date-fns. The Fontsource packages for Instrument Sans, Instrument Serif and JetBrains Mono. Whatever shadcn/ui adds: the Radix packages, cmdk, class-variance-authority, clsx and tailwind-merge. | vite, @vitejs/plugin-react, typescript, tailwindcss, @tailwindcss/vite, vitest, jsdom, @testing-library/react, @testing-library/user-event, @testing-library/jest-dom |
| Backend | fastapi, `uvicorn[standard]`, sqlalchemy, alembic | pytest, httpx |

### End to end

| File | What it holds |
|---|---|
| `e2e/playwright.config.ts` | Uses Chrome (`channel: "chrome"`) with the base URL `http://127.0.0.1:5273`. It runs one worker with no retries, and keeps traces of failures. **Two web servers**, both with `cwd` at the repo root: `node scripts/e2e-backend.mjs`, which is ready when `http://127.0.0.1:8100/api/meta` answers, and `npm run dev -w frontend`, with `ACCOUNTABLE_WEB_PORT=5273`, `ACCOUNTABLE_API_PORT=8100` and `ACCOUNTABLE_VITE_CACHE=node_modules/.vite-e2e`. **Two projects:** `app` runs every journey, then `reset` runs after it. |
| `e2e/fixtures.ts` | The shared `test`, with guards that fail a test on a console error, on a failed API answer the test didn't expect, or on a request to any address off this computer. Helpers: unique names, reading the API, and dragging a card. |
| `e2e/tests/*.spec.ts` | The journeys listed in Proof. |

### Docs

| File | What it holds |
|---|---|
| `docs/plan.md` | This plan. |
| `docs/STATUS.md` (changed) | What's built, the one-time setup for Mac, Windows and Linux, and how to run, reset and test the app (concern 6). Updated at the end of every phase. |

## 2. Order of work

### Decisions for every phase

These settle things the spec leaves to the build, so nobody has to decide them twice.

1. **Python layout.** Every command runs from the repo root, and the code imports `backend.app...`. Uvicorn and `python -m` both find it from the current folder, and pytest finds it through `pythonpath = ["."]`.
2. **Partial changes.** A `PATCH` changes only the fields it sends. The routers use `model_dump(exclude_unset=True)`, so leaving a field out keeps its value, while sending `null` clears it.
3. **Stage changes in a `PATCH`.** These rules let the edit form save exactly what it shows (STG-2), and let the stage bar, which sends only the stage, get the defaults:
   - **Probability:** if the new stage is open and a probability was sent, that figure is saved; otherwise the deal gets the stage's usual figure. Won is always 100 and Lost always 0.
   - **Close date:** if one was sent, it's saved. Otherwise a deal moving to Won or Lost gets today, and any other deal keeps its date.
4. **Rules are checked twice.** The API checks every rule. The database checks the same rules where SQLite can (foreign keys, `CHECK`s and the unique name), as a backstop.
5. **Today in the browser.** It always comes from `GET /api/meta`, never from the browser's own clock. A `YYYY-MM-DD` string is read with date-fns `parseISO`, which gives local midnight. `new Date(string)` is never used, because it reads the string as UTC, and in the Americas that turns it into the day before.
6. **Date-times** are stored in UTC and always sent with a `Z`. The "When" field is a native `datetime-local` input, converted to UTC before it's sent.
7. **Native date inputs.** Dates use `<input type="date">` and `<input type="datetime-local">`, styled to the brand. Both work in Chrome and Edge, so the app needs no date-picker library.
8. **The email check** is one simple pattern, `^[^@\s]+@[^@\s]+\.[^@\s]+$`, used in both Zod and Pydantic. Its message is "Enter an email address, such as sarah@bluefin.example".
9. **Industry suggestions** come from a native `<datalist>`, filled with the industries already in use.
10. **Duplicate organization names.**
    - The form checks the name against the loaded list as you type.
    - The API checks again, and answers 422 with the error on `name`: "An organization called Bluefin Logistics already exists."
11. **Refreshing after a change.** After any change succeeds, the app refreshes every query with `queryClient.invalidateQueries()`. TanStack Query refetches only what's on screen and marks the rest as stale. The API is local and fast, and this way no screen can be missed. The card move is the one special case (Phase 7).
12. **The board's figures** are worked out in the browser by `lib/board.ts`, from the cards that `GET /api/pipeline` returns. That keeps one source for the totals, and they change the moment a card moves.
13. **Charts.** Recharts draws the line chart and the bar chart. The funnel and the pipeline strip are labeled bars built with HTML and CSS, so they line up with the text around them.
14. **Page titles** use React 19's `<title>` element in each page.
15. **No lazy-loaded routes**, so Vite finds every dependency when it starts. Risk 9 explains why.
16. **The funnel's share** is each step's value divided by the step before it, rounded to a whole percent, as in "62% carried on".
17. **The status filter's counts** (CON-2) count every contact at each status, whatever the search says.
18. **Wording the spec doesn't give:**
    - **Blocked organization delete** (DEL-3): "Bluefin Logistics can't be deleted while it has deals. Move these deals to another organization or delete them first:", followed by the list.
    - **Counts in delete dialogs:**
      - A sentence about linked records is left out when there are none.
      - A count of one uses the singular noun, as in "Its 1 contact will stay, with no organization."
      - "including its stage changes" appears only when the deal has some.
    - **A failed save** (GEN-6): "Couldn't save. Try again."
    - **After a delete:** "Organization deleted", "Contact deleted", "Deal deleted" and "Activity deleted".
    - **A deleted record:** "This deal no longer exists.", with a link back to the table.

### Phase 0: a skeleton that starts with one command

This phase comes first because starting and stopping two servers from one command on Windows is the riskiest piece of setup, and every later phase depends on it.

1. Create the root `package.json`, `pyproject.toml`, `.python-version` and `alembic.ini` as described in Files. Run `uv add fastapi "uvicorn[standard]" sqlalchemy alembic` and `uv add --dev pytest httpx`.
2. **Backend:** `config.py`, `clock.py`, and a `main.py` with `create_app()` and `GET /api/meta`, which answers `{"today": "2026-11-19"}`.
3. **Frontend:**
   1. Create a Vite React TypeScript app in `frontend/`, and remove the template's demo content.
   2. Add Tailwind 4 through `@tailwindcss/vite`, set up the `@/` alias, and add shadcn/ui: run `npx shadcn@latest init`, then add the components listed in Files.
   3. Put the brand tokens from spec 2.6 in `styles/index.css`.
   4. Import the three Fontsource fonts in `main.tsx`. There's no Google Fonts link anywhere.
4. Write `vite.config.ts` as described in Files. The proxy points at `127.0.0.1`, never `localhost` (risk 3).
5. Write `App.tsx` with the top bar (GEN-1), an empty band, the routes from spec 2.5 pointing at placeholder pages, and "Page not found".
6. Write `scripts/lib/proc.mjs`:
   - **Start:** on Windows, use `spawn` with `shell: true`, because Node won't start `npm.cmd` without it. On Mac and Linux, use `detached: true`, so the child gets its own process group.
   - **Stop:** on Windows, run `taskkill /pid <pid> /T /F`, which also stops Uvicorn's reload worker. On Mac and Linux, call `process.kill(-pid, "SIGTERM")`.
   - **Wait:** ask a URL every 250ms until it answers. If the time limit runs out, say which server didn't start.
   - **Port check:** try to listen on the port. If it can't, say "Port 8000 is in use. Is Accountable already running?"
   - **Open:** use `cmd /c start "" <url>` on Windows, `open` on Mac and `xdg-open` on Linux.
7. Write `scripts/dev.mjs` as spec 2.8 describes. It stops both servers on Ctrl+C, when either one exits, and on any error.
8. Write `scripts/test.mjs` and `scripts/e2e-backend.mjs`.
9. Add `e2e/playwright.config.ts`, `e2e/fixtures.ts`, and `smoke.spec.ts` with its first test only: open `/` and see the top bar.
10. Add `test_meta.py` and the money cases of `format.test.ts`, so each suite has a test to run.
11. Add the new lines to `.gitignore`.

**Done when:**

- With no `node_modules` and no `.venv`, `npm run dev` installs everything and prints `Accountable is running at http://localhost:5173`. It opens the browser on a page with the Midnight top bar in Instrument Sans, and the console shows no errors.
- After Ctrl+C, nothing is listening on port 8000 or 5173. Check with `netstat -ano | findstr ":8000 :5173"`.
- `npm test` runs all three suites and passes, including while `npm run dev` is running.

### Phase 1: the database, the clock and the rules

1. **The tables** in `db.py`, from spec 2.2:
   - **Times:** each table has `id`, `created_at` and `updated_at`. The API sets both times from `clock.now()`, so the tests and the seed control them.
   - **Checks:**
     - stage, status and type only take their listed values
     - probability is 0 to 100, and value is 0 or more
     - each activity has exactly one of `contact_id` and `deal_id`
   - **Foreign keys:**
     - `contacts.organization_id`: SET NULL
     - `deals.organization_id`: RESTRICT
     - `deals.main_contact_id`: SET NULL
     - `activities.contact_id` and `activities.deal_id`: CASCADE
   - **Indexes:**
     - a unique index on `lower(name)` for organizations
     - the indexes listed in spec 2.2. The `(stage, position)` index isn't unique, because positions are renumbered.
   - **Connection settings:** `make_engine(path)` sets `PRAGMA foreign_keys=ON`, `journal_mode=WAL` and `busy_timeout=5000` on every connection.
2. **Alembic:**
   - `env.py` takes its connection from the caller and uses `db.metadata` with `render_as_batch=True`.
   - It sets up logging only when run from the `alembic` command, so it can't silence Uvicorn's logs (risk 7).
   - Generate `0001_initial.py` with autogenerate, then check the functional index, the checks and the `ondelete` rules by hand.
3. **On start** (`main.py`):
   1. Note whether the database file exists yet.
   2. Create `data/`.
   3. Run `upgrade head`.
   4. Seed the database if the file was new. The seed loads nothing until Phase 3.
4. **Rules:** `rules.py` holds the rules in spec 2.4, plus `furthest_stage(current, changes)` and `funnel(deals, today)`.
5. **Shared cases:** `rules-cases.json` (listed in Proof).
6. **Tests:** `test_rules.py`, `test_migrations.py`, and the restart tests in `test_startup.py`.

**Done when** the backend tests pass.

### Phase 2: the records API

Build in this order, with each part's tests alongside it: schemas, organizations, contacts, deals, stage changes, move, activities, timelines, pipeline, then delete-impact and deletes. The endpoints are listed in spec 2.3. Here is what each part must do.

- **Organizations.**
  - The list works out the contact count, open deal count and open pipeline with grouped subqueries in one query, so it doesn't query once per row.
  - An organization's own page adds its open pipeline and its revenue won to date (ORG-2), and lists its contacts and deals (ORG-3).
- **Contacts.**
  - New contacts start as Lead.
  - A `PATCH` that changes or removes the contact's organization also clears `main_contact_id` on that contact's deals at the old organization, in the same transaction. It answers `{"contact": {...}, "unlinked_deals": [{"id": 12, "name": "Website redesign"}]}` (CON-5).
- **Deals.**
  - **A new deal** goes to the top of its stage's column: add 1 to every position in that stage, then insert the deal at 0.
  - **Its probability** is the stage's usual figure, unless one is sent at an open stage.
  - **Its close date:** at Won or Lost it defaults to today (STG-6). At an open stage the form sends one, which starts 30 days from today.
  - **The main contact** must work at the deal's organization. If not, the API answers 422 on `main_contact_id`: "Choose a contact from Bluefin Logistics." If the organization changes and no main contact is sent, the main contact is cleared.
  - **Every answer** includes `expected_value` and `is_late`, worked out by `rules.py`.
- **Stage changes.** One function, `change_stage(conn, deal, new_stage, sent)`, is used by both `PATCH` and move. It:
  1. applies decision 3
  2. puts the deal at the top of its new column, unless move places it
  3. numbers the old column again from 0
  4. adds the stage-change activity: `type = "stage_change"`, the `deal_id`, `from_stage`, `to_stage`, `occurred_at` set to now, and the description "Moved from Proposal to Negotiation"
- **Move** (`POST /api/deals/{id}/move` with `{stage, before_id}`). All of this happens in one transaction:
  1. Answer 404 if the deal doesn't exist, and 422 if `before_id` is the deal itself or isn't a deal in the target stage.
  2. If the stage changes, call `change_stage` with nothing sent, so the probability becomes the usual figure and Won or Lost sets the close date to today.
  3. Take the target column in order, without the deal. Put the deal before `before_id`, or at the end if `before_id` is `null`. Number the column from 0, and number the old column again too.
  4. Answer with the updated deal.

  Won and Lost cards older than 30 days are hidden on the board, but they keep their places in their column. `before_id` is always a card the user can see, and `null` puts the deal after every card, hidden or not. Either way the board looks the same.
- **Activities.**
  - **The link:** an activity has exactly one of `contact_id` and `deal_id`, and that record must exist; otherwise the API answers 422.
  - **The type** can only be note, call or email.
  - **Done:** an activity without a follow-up date always has `done` false.
  - **Changes:** a `PATCH` can change the type, description, when, follow-up date and done, but never the contact or deal it belongs to.
  - **Stage changes:** a `PATCH` or `DELETE` of a stage change answers 409: "Stage changes can't be changed or deleted."
- **Timelines.**
  - Newest first by `occurred_at`. When two entries have the same time, the higher `id` comes first (ACT-2).
  - A contact's timeline holds their own activities, plus every activity on the deals where they're the main contact now (ACT-3).
  - Each entry names its deal or contact.
- **Pipeline.**
  - Six columns in stage order, with the cards in each ordered by position and then by id.
  - The open stages show every deal. Won and Lost show only the deals with a close date on or after today minus 30 days.
- **Delete-impact and deletes** (spec 1.10).
  - **Unlinking in the API:** each delete unlinks and deletes linked records itself, in one transaction, as well as through the foreign keys.
  - **A refused organization delete** answers 409 with `{"detail": "...", "deals": [...]}`.
  - **A deal's delete impact** is `{"activities": 5, "stage_changes": 2}`, so the dialog says "including its stage changes" only when there are some. This adds `stage_changes` to the answer in spec 2.3.
- **Errors.**
  - **A missing record:** 404, as in `{"detail": "Deal not found"}`.
  - **A duplicate name:** 422 in FastAPI's own shape, with `loc: ["body", "name"]`, so the form shows the error under the field.

The frontend relies on these answer shapes. A deal looks as it does in spec 2.3.

```jsonc
// A timeline entry. The dashboard's follow-ups and recent activity use the same shape.
{
  "id": 41,
  "type": "call",                       // note, call, email or stage_change
  "description": "Walked through the scope.",
  "occurred_at": "2026-11-10T15:15:00Z",
  "follow_up_date": "2026-11-21",       // or null
  "done": false,
  "from_stage": null, "to_stage": null, // set on stage changes only
  "contact": {"id": 8, "name": "Sarah Chen"}, // exactly one of contact and deal
  "deal": null
}

// GET /api/pipeline
{"columns": [{"stage": "new", "deals": [/* deals, in order */]} /* ...six columns */]}
```

**Done when** every backend test for this phase passes.

### Phase 3: dashboard figures and the sample data

1. **`GET /api/dashboard`**, worked out on the server:

   ```jsonc
   {
     "today": "2026-11-19",
     "open_pipeline": {"value": 1011000, "count": 19},
     "expected_revenue": 502300,
     "won_this_month": {"value": 54000, "count": 1, "last_month_value": 8500},
     "follow_up_counts": {"overdue": 3, "due_soon": 4},
     "months": [{"month": "2025-12", "revenue": 42000, "deals": 1} /* 12, oldest first */],
     "funnel": [{"stage": "new", "count": 35, "value": 1728000} /* New to Won */],
     "open_by_stage": [{"stage": "new", "count": 5, "value": 100500, "expected": 10050} /* the 4 open stages */],
     "follow_ups": [/* timeline entries, each with "days_late" */],
     "recent": [/* the 10 latest timeline entries */]
   }
   ```

   - `due_soon` counts follow-ups due from today to today plus 7 days.
   - Expected revenue adds up each deal's rounded figure, so the dashboard matches the Deals table.
2. **The sample data** in `seed_data.py` is fixed content that meets DATA-2 to DATA-8. Each deal lists its path through the stages, such as `["new", "qualified", "proposal", "won"]`, and the seed writes one stage change for each step. Positions follow the order in the file. The figures don't need to match the mockup's.

   Every date is an offset from the seed day:
   - **Open deals:** the close date is a number of days from today. For the late ones it's in the past.
   - **Won and lost deals:** a number of months ago plus a day of the month. The day is held to the length of that month and is never after today.
   - **The deal won this month** closes today, so it's in this month and in the last 30 days, whatever day of the year it is.
   - **The other recent closes:** the second deal won in the last 30 days and the two recent lost deals use a number of days ago, within 30.
   - **Creation dates:** each deal's `created_at` comes before its first stage change.
   - **Stage changes** fall between the deal's `created_at` and its close date, or today if it's earlier.
   - **Activities and follow-ups:** a number of days from today.
3. **The seed command** (`seed.py`):
   - **`load_sample_data(conn, today, now)`** deletes the activities, deals, contacts and organizations, in that order, then loads the sample data.
   - **`npm run seed`:**
     1. Asks "This replaces all your data with the sample data. Type yes to continue:".
     2. Runs the migrations.
     3. Loads everything in one transaction.
     4. Prints "Sample data loaded: 15 organizations, 40 contacts, 35 deals, 80 activities."

     Any answer other than `yes` prints "Nothing changed." and stops before touching the database. Otherwise, on a new install, it would leave an empty database, and the app's first start would never load the sample data into it.
4. Turn on seeding when the app starts with a new database.

**Done when** `test_dashboard.py`, `test_seed.py` and the rest of `test_startup.py` pass. Running `npm run seed` while `npm run dev` runs works, and a browser refresh then shows the sample data.

### Phase 4: frontend foundations

1. **The API layer:** `api/client.ts`, `api/types.ts` and the query hooks.
   - **Query keys:** `["meta"]`, `["organizations"]`, `["organization", id]`, `["contacts"]`, `["contact", id]`, `["contact-timeline", id]`, `["deals"]`, `["deal", id]`, `["deal-timeline", id]`, `["pipeline"]` and `["dashboard"]`.
   - Every hook that changes data refreshes everything once it succeeds (decision 11).
2. **The helpers:** `lib/format.ts`, `lib/dates.ts`, `lib/rules.ts` and `lib/words.ts`, with their tests.
3. **The layout:**
   - `TopBar`: the current section shows as a Sea Green pill.
   - `Band`: the title, the line under it, the figures, the main button, and space for the stage bar or the column headings.
   - `PageBody`: 32px padding, up to 1440px wide and centered, except on the pipeline, which uses the full width.
4. **Shared pieces:**
   - the brand's four kinds of button (spec 2.6), built on shadcn's button
   - badges
   - placeholder blocks
   - empty states
   - "Page not found" and the "no longer exists" state
   - the Sonner toaster

**Done when** the frontend tests pass and every page shows its band and its title.

### Phase 5: tables, forms and deletes

1. **`DataTable`**, built on TanStack Table:
   - one search box that matches any part of the listed fields, ignoring capitals (TBL-1)
   - sorting when a heading is clicked, with an arrow and `aria-sort` (TBL-2)
   - the count line (TBL-6), and pages of 50 with Previous and Next
   - the empty states (TBL-7)
   - Edit and Delete icon buttons, with tooltips and names for screen readers (TBL-4)
   - clicking anywhere else on a row opens the record (TBL-5). The name cell is also a link, so a keyboard user can reach the record.
2. **Forms:** `FormDialog`, the Zod schemas and the four forms. A field error from the server shows under its field (GEN-6). When a save fails, the dialog stays open with what was typed.
3. **`DealForm`:**
   - The organization is chosen with the picker.
   - The main contact picker lists only that organization's contacts, and clears when the organization changes.
   - Choosing a stage fills in its probability. Choosing Won or Lost also fills in today and locks the probability (STG-2, STG-4).
   - A new deal's close date starts 30 days from today.
4. **`ContactForm`:** the status starts at Lead. If the organization changes on a contact who is the main contact on deals, the form lists those deals above the buttons (CON-5).
5. **`DeleteDialog`:**
   - It loads the delete impact when it opens, and shows the wording from `lib/words.ts` (DEL-1 to DEL-6).
   - For an organization with deals, it lists them as links and offers only a Close button.
   - After a delete from a record's page, it goes to that section's table (DEL-7).
6. **The table pages:** Organizations, Contacts and Deals, each with its columns (ORG-1, CON-1, DEAL-1), its band and its Add button. Contacts gets the status filter (CON-2), and Deals gets the Late badges (DEAL-2).
7. **End-to-end tests:** the table parts of `organizations.spec.ts`, `contacts.spec.ts`, `deals.spec.ts` and `deletes.spec.ts`.

**Done when** those tests and the frontend tests pass.

### Phase 6: record pages, timelines and activities

1. **The record pages:** `OrganizationPage`, `ContactPage` and `DealPage`, as in spec 2.5, Record pages.
   - The band holds the back link, the name, the badges, the links, and Edit and Delete.
   - The website link goes through `safeHref`. The email is a `mailto:` link and the phone a `tel:` link.
2. **`StageBar`** sits in the deal page's band. Clicking a stage sends `PATCH {stage}`, then shows "Deal moved to Negotiation".
3. **The timeline:** `Timeline`, `TimelineEntry` and `LogActivity` (ACT-1 to ACT-6).
   - Notes, calls and emails have a Done tickbox, Edit and Delete. Stage changes have none of these.
   - Descriptions keep their line breaks with `white-space: pre-wrap`, and are shown as text, never as HTML.
4. **A record that no longer exists** shows "This deal no longer exists."
5. **End-to-end tests:** `activities.spec.ts`, plus the record-page parts of the specs started in Phase 5.

**Done when** those tests pass.

### Phase 7: the pipeline board

This is the riskiest frontend phase. Phase 2's tests already prove the server's move, so this phase only has to get the browser right.

1. **The board logic** in `lib/board.ts`, written test-first:
   - **`moveCard(board, dealId, toStage, beforeId, today)`** returns a new board with the card moved. If the stage changes, it applies the server's rules: the usual probability, today's date for Won and Lost, and the close date kept when a deal is reopened. Then it works out `is_late` again.
   - **`columnTotals(column)` and `boardTotals(board)`** (PIPE-1, PIPE-3).
   - **`beforeIdAfterDrop(column, dealId)`** gives the id of the card just below the dropped card, or `null` if there isn't one.
2. **`Board`**, built with dnd-kit:
   - **Sensors:**
     - A pointer sensor that starts dragging only after 6px of movement, so a click still opens the deal (PIPE-4).
     - The keyboard sensor with `sortableKeyboardCoordinates` (PIPE-8): Space picks a card up, the arrow keys move it, Space drops it and Escape puts it back.
   - **Columns:** each column has its own `SortableContext`, and is also a drop target, so an empty column still takes cards.
   - **Local state while dragging:** the board keeps the cards in local state.
     - `onDragOver` moves the card between columns, so a gap opens where it will land.
     - `onDragEnd` works out `before_id` and saves.
     - `onDragCancel` puts everything back.
   - **The lifted card:** a `DragOverlay` shows it with the stronger shadow, and the column under it gets a light tint. The drop animation is turned off when the computer asks for reduced motion.
   - **Announcements** for screen readers, in plain words: "Picked up Website redesign", "Website redesign is over Negotiation, position 2" and "Dropped Website redesign in Negotiation".
3. **Saving a move** follows TanStack Query's optimistic update pattern:
   1. Cancel the pipeline query, and keep a copy of the board as it was.
   2. Write the board from `moveCard` into the cache, then save.
   3. If the save fails, put the old board back and show "Couldn't move the deal. Try again." (PIPE-6). If it succeeds and the stage changed, show "Deal moved to Negotiation".
   4. Either way, refresh everything afterwards.
4. **Layout:** `ColumnHeading` sits in the band and `BoardColumn` below it, sharing one six-column grid. Both sit inside one container that scrolls sideways below 1280px, so the headings and the columns stay lined up. Each column scrolls on its own, below its heading.
5. **`DealCard`** (PIPE-4), and the Add deal button in each heading (PIPE-7), which opens `DealForm` at that column's stage.
6. **End-to-end tests:** `pipeline.spec.ts`.

**Done when** `board.test.ts` and `pipeline.spec.ts` pass, and a drag by hand in Chrome feels right: a gap opens, the figures change on the drop, and a click still opens the deal.

### Phase 8: the dashboard

1. **In the band:** the title, the date line (DASH-1), the four headline figures (DASH-2) and `PipelineStrip` (DASH-6) with its key, following spec 2.5 and the mockup.
2. **The charts:**
   - **`RevenueChart`:**
     - a Recharts area with a flat 14% Sea Green fill, under a 2.5px `#05A87E` line
     - a dot on the latest month
     - the 12-month total above the chart
     - short money on the axis, and the full figures in the tooltip
   - **`DealsWonChart`:** Marigold bars with rounded tops, each labeled with its count.
   - **Both charts:** each sits in a box with a fixed height, so `ResponsiveContainer` never measures zero, and neither animates when the computer asks for reduced motion.
3. **The other parts:** `Funnel` (DASH-5); `FollowUps` (DASH-7), with a Done tickbox and the days late; and `RecentActivity` (DASH-8).
4. **For screen readers:** each chart has a short text summary, such as "Revenue won over the last 12 months: $511,000. Highest in August: $140,000."
5. **End-to-end tests:** `dashboard.spec.ts`.

**Done when** `dashboard.spec.ts` passes.

### Phase 9: finishing

1. **Tests:** write `reset.spec.ts`, then run the full `npm test`.
2. **First-run check:** delete `node_modules`, `frontend/node_modules`, `.venv` and `data/`, then run `npm run dev`. The app should land on the dashboard with sample data (success criterion 1).
3. **A quick look** at every section in Chrome and Edge, at 1280px and 1024px wide, against `docs/mockups/2-midnight-deck.png`, with the console open. The full comparison with the mockup belongs to the Test stage.
4. **`docs/STATUS.md`** should cover:
   - **What's built.**
   - **One-time setup:**
     - **Node.js 24 or later:** the installer from nodejs.org, or `winget install OpenJS.NodeJS.LTS` on Windows, or `brew install node` on Mac.
     - **uv:** `winget install astral-sh.uv` on Windows, `brew install uv` on Mac, or the install script from astral.sh on Linux.
     - **Browser:** Chrome or Edge.
   - **The first run needs the internet:** the first `npm run dev` downloads the packages and Python 3.12. After that the app works offline.
   - **Day-to-day use:** `npm run dev`, `npm run seed` and `npm test`, where the data lives, the ports, and the settings.
   - **Platforms:** the app has only been tried on Windows so far.

**Done when** `npm test` passes, the first-run check lands on the dashboard, and `docs/STATUS.md` is updated.

## 3. Risks

The riskiest come first. Each risk says what could go wrong and what the build does about it.

1. **Dragging cards on the board.** This is the most complex screen.
   - **What could go wrong:**
     - cards move between columns and within them
     - the board changes before the server answers
     - Won and Lost hide their older cards
     - a click must still open the deal
     - the keyboard must work too
   - **What the build does:**
     - The server's move is built and tested first, in Phase 2.
     - The browser's half is a pure function, `moveCard`, which is tested on its own.
     - `before_id` always comes from the order on screen after the drop.
     - The end-to-end tests drag with the mouse in small steps, which dnd-kit needs to notice a drag, and they also move a card with the keyboard.
     - A test makes the save fail on purpose, to prove the card goes back.
2. **Starting and stopping on Windows.**
   - **What could go wrong:** Node won't start `npm.cmd` without a shell. Ctrl+C can also leave Uvicorn's reload worker running and holding port 8000, so the next start fails.
   - **What the build does:**
     - Phase 0 proves this before anything else.
     - `proc.mjs` stops the whole process tree with `taskkill /T /F`.
     - `dev.mjs` checks the ports before it starts, and says plainly when one is in use.
   - **Mac and Linux** can't be tried on this machine. `proc.mjs` uses each system's documented approach, process groups, and `docs/STATUS.md` says the app has only been tried on Windows.
3. **`localhost` in Node.**
   - **What could go wrong:** Node 17 and later look up `localhost` as `::1` first, while the backend listens on `127.0.0.1`. So a proxy to `localhost:8000` fails with ECONNREFUSED.
   - **What the build does:** every address the app uses internally is written as `127.0.0.1`.
4. **Dates and time zones.**
   - **What could go wrong:**
     - `new Date("2026-11-19")` means midnight UTC, which is still Nov 18 in the Americas.
     - A date-time without a `Z` is read as local time.

     Either mistake shows the wrong day without any error.
   - **What the build does:**
     - It follows decisions 5 and 6.
     - Vitest runs with the time zone set to America/Los_Angeles, so the mistake shows up on any computer, and one test checks that the setting took effect.
     - A backend test checks that date-times come back with a `Z`.
5. **Sample dates on awkward days.**
   - **What could go wrong:** month ends, the 1st of a month, January and leap years can push a "this month" deal into last month, or produce an impossible date such as Feb 30.
   - **What the build does:**
     - Each date is held to the length of its month and never falls after today.
     - The deal won this month closes today.
     - `test_seed.py` checks the DATA rules for a list of awkward seed days.
6. **The funnel's figures.**
   - **What could go wrong:** the figures are easy to get slightly wrong for deals that skip stages, lost deals, reopened deals, and deals created more than 12 months ago.
   - **What the build does:** `furthest_stage` and `funnel` are pure functions, tested with cases worked out by hand.
7. **Alembic and SQLite.**
   - **What could go wrong:**
     - Autogenerate can miss the functional index and some checks.
     - Alembic's default `env.py` resets logging, which silences Uvicorn.
     - SQLite can't change most columns in place, which matters for later migrations.
   - **What the build does:**
     - The first migration is checked by hand.
     - A test checks that the migrations build the same tables as `db.py`.
     - Logging is set up only from the `alembic` command.
     - Batch mode is on.
8. **Two programs using the database at once.**
   - **What could go wrong:** `npm run seed` can run while the app is running, and the tests can run beside `npm run dev`.
   - **What the build does:**
     - SQLite runs in WAL mode with a 5-second busy timeout.
     - The seed runs in one transaction.
     - The tests have their own database, ports and Vite cache folder.
9. **Vite reloading the page in the middle of a test.**
   - **What could go wrong:**
     - When Vite finds a new dependency after it has started, it reloads the page, which breaks a test halfway.
     - Two Vite servers sharing `node_modules/.vite` can also get in each other's way.
   - **What the build does:**
     - There are no lazy-loaded routes, and the end-to-end Vite server has its own cache folder.
     - If Vite ever logs "new dependencies optimized", add those packages to `optimizeDeps.include`.
10. **False alarms from the console guard.**
    - **What could go wrong:** Chrome logs a missing favicon, and logs every 4xx answer as "Failed to load resource".
    - **What the build does:**
      - The app ships a favicon.
      - The form checks for duplicate names itself (decision 10), so normal use never sends a request that fails.
      - A test that expects an error status says so, and the guard lets that one through.
11. **End-to-end tests getting in each other's way.**
    - **What could go wrong:** every test in a run shares one database.
    - **What the build does:**
      - The tests run with one worker, starting from fresh sample data each run.
      - Each test gives its records unique names, such as `E2E Org 1763560000123`.
      - Tests compare the screen with the API's answer, rather than with fixed counts.
      - The reset test runs last, as a project of its own.
12. **Working offline.**
    - **What could go wrong:** a stray Google Fonts link or a script from a CDN would quietly break RUN-5, and nobody would notice on a computer that's online.
    - **What the build does:** the fonts come only from Fontsource, and the end-to-end guard fails any request that leaves this computer.
13. **Library changes.**
    - **What could go wrong:** several libraries had major releases recently:
      - React Router 7's package is `react-router`.
      - Tailwind 4 has no `tailwind.config.js`.
      - Zod 4 needs version 5 of `@hookform/resolvers`.
      - Recharts 3 changed some of its components.
    - **What the build does:** it installs the current stable versions and reads their current docs before using them, rather than relying on memory.
14. **Unsafe links and text.**
    - **What could go wrong:** a website saved as `javascript:...` must never become a link, and an activity's description must never be read as HTML.
    - **What the build does:**
      - `safeHref` turns only `http` and `https` addresses into links, and the app never uses `dangerouslySetInnerHTML`.
      - SQLAlchemy Core always passes values as parameters.
      - The backend listens on `127.0.0.1` only.
15. **Gaps in the spec.**
    - **What could go wrong:** the build may find something the spec doesn't cover.
    - **What the build does:** it takes the simplest choice that fits the spec and the intent, and notes it in `docs/STATUS.md` for the student to check. The build neither stops nor changes the spec.

### What this could break

- **Features:** nothing runs yet, so there's no working feature to break.
- **The user's data:**
  - The tests never touch `data/accountable.db`: pytest uses a temporary database, and the end-to-end tests use `e2e/.data/test.db`.
  - `npm run seed` replaces the data, so it asks first.
- **Ports:** another program using port 8000, 5173, 8100 or 5273 stops the app or the tests from starting. When that happens, the scripts say which port is taken.
- **Docs:** the build changes only `docs/STATUS.md` and `docs/plan.md`, and only adds lines to `.gitignore`.

### Decided against

- **A production build for the end-to-end tests** (`vite build`, then `vite preview`). It's closer to a release, but it hides the React warnings that `npm run dev` shows, and GEN-7 is about the console the user sees.
- **Refreshing only the queries each change affects.** That saves a few local requests, but missing a single query leaves a screen out of date.
- **Board totals worked out on the server.** The board has to change before the server answers anyway, and server totals would need a second answer after every move.
- **Recharts for the funnel and the strip.** Both are labeled bars, and HTML lines them up with the text around them more easily.
- **A date-picker library.** Native inputs do the job in Chrome and Edge.
- **`concurrently` or `npm-run-all` for `npm run dev`.** `dev.mjs` has to work before anything is installed.
- **pydantic-settings or python-dotenv.** The app has only three settings.
- **The `email-validator` package.** It's stricter than the spec asks for, and the browser has to run the same check.
- **An ORM.** The stack asks for SQLAlchemy Core.
- **Parallel end-to-end workers.** They'd be faster, but each worker would need its own servers and database. The course offers this as an optional step after the Test stage.
- **Storing the main contact on each deal activity.** Concern 5 leaves this for a later change.
- **A fixed clock in the end-to-end tests.** The sample data is relative to today, so the real clock works, and the backend tests fix the clock to check the exact figures.

## 4. Proof

### Running the tests

| Command | What it runs |
|---|---|
| `npm test` | All three suites in turn. It fails if any test fails. |
| `npm run test:backend` | pytest (`uv run pytest`) |
| `npm run test:frontend` | Vitest |
| `npm run test:e2e` | Playwright. It starts its own servers on ports 8100 and 5273. |

**The build is done** when `npm test` passes with every test running, none skipped, and the checks under "By eye" are done.

### Shared rule cases

`frontend/src/lib/rules-cases.json` holds these cases. `test_rules.py` and `rules.test.ts` both run them, so the backend and the browser agree (spec 2.4). The cases use today = 2026-11-19.

- **Expected revenue**, as `value, probability → result`:
  - `48500, 50 → 24250`
  - `1, 50 → 1`
  - `3, 50 → 2`
  - `10, 5 → 1`
  - `1, 49 → 0`
  - `101, 50 → 51`
  - `99, 25 → 25`
  - `0, 75 → 0`
  - `100000000, 75 → 75000000`
- **Late:**
  - an open deal with yesterday's date is late
  - an open deal with today's or tomorrow's date isn't
  - a Won or Lost deal with yesterday's date isn't
- **The 30-day window:** 2026-10-20 is in, 2026-10-19 is out, and a future date is in.
- **Usual probabilities:** the six from STG-1.
- **Furthest stage** (backend only):
  - New with no changes: New
  - Lost after New to Qualified, then Qualified to Lost: Qualified
  - Lost with no changes: New
  - New straight to Negotiation: Negotiation
  - Won, then reopened to Proposal: Won
- **The 12 months** (backend only):
  - for 2026-11-19: 2025-12 to 2026-11
  - for 2027-01-01: 2026-02 to 2027-01

### Backend tests (pytest)

Each test gets a new temporary database and a frozen clock: today is Thursday 2026-11-19, and now is 2026-11-19T15:00:00Z. The tests use an empty database unless they say they need the sample data.

| File | What it proves |
|---|---|
| `test_meta.py` | `GET /api/meta` gives the clock's today. |
| `test_rules.py` | The shared cases, plus funnel cases with several deals. |
| `test_migrations.py` | `upgrade head` on an empty file creates the four tables. Alembic's `compare_metadata` finds no difference from `db.metadata`. Foreign keys are on, and WAL mode is set. |
| `test_startup.py` | A new database file is created and seeded (DATA-1). A restart on the same file doesn't seed again, and keeps a record added before it (GEN-2, success criterion 2). |
| `test_organizations.py` | Add, list, get and change. Name rules: required, at most 120 characters, and unique ignoring capitals on add and on rename, with the spec's message. Website, industry and notes lengths. The list figures count only open deals (ORG-1). The page's open pipeline, revenue won to date, contacts and deals (ORG-2, ORG-3). 404 for an unknown id. |
| `test_contacts.py` | A new contact starts as Lead. Only the three statuses are accepted. The email pattern. The organization is optional but must exist. The list includes the organization's name. The page lists the deals where they're the main contact. Winning a deal leaves the contact's status alone (CON-4). Changing or removing the organization unlinks the contact's deals at the old one and lists them in the answer; an unchanged organization unlinks nothing (CON-5). |
| `test_deals.py` | Defaults on add: the stage's probability; 100 or 0 at Won or Lost; today as the close date at Won or Lost; the top of the column (STG-6). The organization is required. The value must be a whole number from 0 to 100,000,000. The main contact must be from the deal's organization (422), and changing the organization clears it. `expected_value` and `is_late` (DEAL-2, DEAL-3). The list includes the organization and contact names. |
| `test_stage_changes.py` | Changing the stage sets the usual probability, unless an open stage is sent with a probability. Won and Lost are forced to 100 and 0 (STG-2.1, STG-4). Won or Lost sets today unless a close date is sent (STG-2.2). The stage change is recorded with its from and to stages, its description and its time (STG-2.3). Adding a deal records no stage change, and neither does a change that keeps the stage (STG-6). A probability set by hand survives other edits (STG-3). Reopening keeps the close date, and the deal shows as late (STG-5). A deal moved by `PATCH` goes to the top of its new column (STG-2.4). |
| `test_move.py` | **Within a column:** moves up and down. **Across columns:** moves to a given place, and to the bottom with `null`. **Positions:** after every move, both columns are numbered 0 to n-1 with no gaps. **Stage rules:** a move across columns applies the stage rules, and one within a column records no stage change. A move to Won sets 100% and today. **Refusals:** 422 for a `before_id` in another column, and for the deal itself; 404 for an unknown deal. |
| `test_pipeline.py` | Six columns in order, with cards in position order. Won and Lost include a deal closed on 2026-10-20 and leave out one closed on 2026-10-19 (PIPE-2). Open columns show late deals. |
| `test_activities.py` | Log on a contact and on a deal. Both or neither link gives 422, and so does type `stage_change`. The description is required, at most 5,000 characters. A follow-up is optional, starts as not done, and can be in the past (ACT-6). Edit every editable field. Done can be ticked and unticked (ACT-5). Changing or deleting a stage change gives 409 (ACT-4). `occurred_at` sent with a +05:30 offset is stored and returned as the same moment, with a `Z`. |
| `test_timelines.py` | A deal's timeline is newest first, and the entry added last comes first when two times match (ACT-2). A contact's timeline holds their own activities and the activities and stage changes on deals where they're the main contact now, each naming its deal (ACT-3). When the main contact changes, those entries move to the new contact (concern 5). |
| `test_deletes.py` | **An organization without deals:** the impact counts its contacts, and after the delete they stay with no organization (DEL-2). **An organization with deals:** the impact lists the deals, the delete gives 409 with them, and nothing changes (DEL-3). **A contact:** the impact counts the activities and lists the deals; the delete removes the activities and unlinks the deals (DEL-4). **A deal:** the impact counts the activities and stage changes, and the delete removes them all (DEL-5). **An activity** can be deleted (DEL-6). Every deleted record then gives 404. |
| `test_dashboard.py` | **Headline figures:** open pipeline value and count; expected revenue as the sum of each deal's rounded figure; won this month and last month across month boundaries; follow-ups overdue and due soon at today and today + 7, leaving out ones marked done (DASH-2). **The 12 months:** a month with no wins shows 0; deals on the first and last day of a month land in it; a deal from 13 months ago is left out (DASH-3, DASH-4). **The funnel:** a deal still at New; a deal lost from Proposal; a deal lost with no changes; a deal won; a deal that skipped stages; a deal created 13 months ago, which is left out (DASH-5). **Open pipeline by stage** (DASH-6). **Follow-ups:** order, days late, and each one's contact or deal (DASH-7). **Recent activity:** the 10 latest, including stage changes, leaving out future times (DASH-8). **Fresh figures:** a deal just moved to Won shows straight away (DASH-9). |
| `test_seed.py` | **The rules** checked on the sample data: 15 organizations across at least 8 industries; 18 leads (4 with no organization), 10 qualified and 12 customers; 35 deals at every stage, worth $5,000 to $150,000; 19 open, 3 or 4 of them late; 10 won, with at least one this month and 2 in the last 30 days; 6 lost, 2 of them in the last 30 days; 80 activities; 3 overdue follow-ups and 4 due in the next 7 days (DATA-3 to DATA-6). **Correctness:** every main contact is from the deal's organization; each deal's stage changes join up, from New to its current stage; every email and website ends in `.example` (DATA-8). **Seed days:** the rules hold for 2026-11-19, 2026-12-31, 2027-01-01, 2027-01-31, 2027-03-01 and 2028-02-29 (DATA-7). **Repeatability:** two seeds give the same content (DATA-9). **The command:** reseeding works while another connection is open, and `--yes` skips the question (RUN-3). |

### Frontend tests (Vitest)

They run with the time zone set to America/Los_Angeles.

| File | What it proves |
|---|---|
| `lib/format.test.ts` | **Money:** `$48,500` and `$0`, never with cents. **Short money:** `$1.2M`, `$48.5k` and `$50k` (GEN-3). **Dates:** `Nov 19, 2026`, and `"2026-11-19"` stays Nov 19. **Date-times:** `Nov 19, 2026, 2:30 PM`, from a UTC string shown in local time (GEN-4). **The dashboard's date line:** "Thursday, November 19". **Counts:** "1 contact", "40 contacts" and "3 of 40 contacts". **The time zone setting:** a check that it took effect. |
| `lib/dates.test.ts` | A local date-time becomes UTC and comes back unchanged. Days late are counted. |
| `lib/rules.test.ts` | **The shared cases**, giving the same answers as the backend. **`safeHref`:** adds `https://` to `bluefin.example`, keeps `http://` addresses, and refuses `javascript:` and `ftp:`. |
| `lib/board.test.ts` | **`moveCard`:** moves within a column and across columns, with the stage, the probability, today for Won, the close date kept when reopening, and `is_late`. `null` moves the card to the bottom. **Column and board totals** after a move (PIPE-1, PIPE-3, PIPE-6). **`beforeIdAfterDrop`.** |
| `lib/words.test.ts` | Each delete dialog's exact wording from DEL-2 to DEL-6, including the singular, sentences left out when there's nothing linked, and the blocked organization. |
| `components/DataTable.test.tsx` | **Search** across fields, ignoring capitals (TBL-1). **Sorting:** a heading toggles the order, with the arrow and `aria-sort` (TBL-2). **Counts and pages:** the count line, and pages from row 51 (TBL-6). **Both empty states** (TBL-7). **Clicks:** clicking a row opens it, and Edit and Delete don't (TBL-4, TBL-5). |
| `components/forms/DealForm.test.tsx` | Choosing a stage fills in the probability. Won fills in today and locks the probability. Changing the organization clears the main contact and narrows the list. The required-field messages. A field error from the server shows under its field (GEN-6). |
| `components/forms/ContactForm.test.tsx` | Changing the organization lists the deals that will lose their main contact (CON-5). |
| `components/forms/OrganizationForm.test.tsx` | A duplicate name, with different capitals, shows its message before saving. |
| `components/DeleteDialog.test.tsx` | A blocked organization shows its deals as links, with only a Close button (DEL-3). Cancel does nothing, and confirming deletes (DEL-1). |

### End-to-end tests (Playwright)

Every test uses the shared fixture. It fails the test on any console error, on any API answer of 400 or more that the test didn't declare, and on any request that leaves this computer (RUN-5).

| File | Journeys |
|---|---|
| `smoke.spec.ts` | `/` lands on the dashboard with data. The top bar reaches all five sections, and each has its own title and address. The back button works. An unknown address shows "Page not found" (GEN-1, GEN-5, success criterion 1). |
| `organizations.spec.ts` | **Changing records:** add one (with the message and the new row), search, sort by name and by open pipeline, edit, refresh, and see the change kept. **The page** shows its contacts and deals, and Add contact fills in the organization. **A duplicate name** shows its message (ORG-1 to ORG-3, TBL-1 to TBL-7). |
| `contacts.spec.ts` | Add a lead, filter by each status and check the counts, and combine the filter with a search (CON-2). Change a status, refresh, and see it kept. The contact page's links. Changing the organization of a contact who is a deal's main contact lists the deal first, then leaves that deal with no main contact (CON-5). |
| `deals.spec.ts` | **Adding:** add a deal with an organization and a main contact. **The table:** a late deal shows Late, and sorting by value and by close date works. **The form:** choosing Proposal in the edit form fills in 50%. **The deal page:** shows its four figures. **The stage bar:** moves the deal and adds the entry to its timeline (DEAL-1 to DEAL-6). |
| `deletes.spec.ts` | Each dialog's wording and result (DEL-2 to DEL-6). An organization with deals shows only Close, and its deal links work. Cancel and Escape leave everything as it was. A delete from a record's page returns to the table with a message (DEL-7). A deleted record's address says it no longer exists; this test declares the 404. |
| `activities.spec.ts` | **One follow-up, from start to finish:** log a call on a deal with a follow-up in 3 days. It shows on the deal's timeline, on its main contact's timeline and on the dashboard. Tick it Done on the dashboard; it leaves the list and shows ticked on the timeline. **Other checks:** a follow-up dated yesterday shows as overdue; edit an activity, then delete it; a stage change has no Edit or Delete (ACT-1 to ACT-6, success criterion 5). |
| `pipeline.spec.ts` | **Headings:** each column's count, value and expected revenue match the API. Won and Lost say "Closed in the last 30 days" (PIPE-1 to PIPE-3). **Dragging to another column:** the card moves and the board and column figures change at once. The Deals table then shows the new stage and probability, the deal's page shows "Moved from ... to ...", and a refresh keeps it all (success criterion 4). **Within a column:** reorder, refresh, and the order is kept (PIPE-5). **To Won:** the close date becomes today. **Keyboard:** Space, Arrow and Space move a card; Escape puts it back (PIPE-8). **A failed save:** the move request is made to fail with `page.route`; the card goes back and the message shows, with the failure declared (PIPE-6). **Adding:** Add deal in Qualified starts the form at Qualified, and the card appears at the top (PIPE-7). **Clicking:** a card opens its deal (PIPE-4). |
| `dashboard.spec.ts` | **Figures:** the headline figures and the strip match `/api/dashboard` (DASH-2, DASH-6). **Charts:** both show 12 months, and hovering shows full figures (DASH-3, DASH-4, DASH-9). **The funnel's five steps** (DASH-5). **Links:** follow-ups and recent activity link to their records (DASH-7, DASH-8). **A deal moved to Won** raises "Won this month" and this month's revenue by its value, and its stage change shows in recent activity (success criterion 6). |
| `reset.spec.ts` | Runs last, as the `reset` project. It runs `uv run python -m backend.app.seed --yes` against the test database while the app is running. After a refresh, a record added earlier in the run is gone, and the counts match the sample data (RUN-3, success criterion 2). |

### Success criteria, and what proves each

| Criterion in the intent | Proof |
|---|---|
| 1. Starts with one command and lands on the dashboard with data | The Phase 9 first-run check, and `smoke.spec.ts` |
| 2. Add, search, sort, edit and delete; kept after a refresh and a restart; delete rules; reset | `organizations`, `contacts`, `deals`, `deletes` and `reset.spec.ts`; `test_startup.py`; `test_deletes.py` |
| 3. Contacts filtered by status; each page shows its linked records | `contacts.spec.ts`, `organizations.spec.ts`, `deals.spec.ts` |
| 4. The pipeline: drag, stage and probability, close date, positions, figures, adding, late cards, the 30-day columns | `pipeline.spec.ts`, `board.test.ts`, `test_move.py`, `test_pipeline.py`, `test_stage_changes.py` |
| 5. Timelines, stage-change entries, main contact timelines, follow-ups | `activities.spec.ts`, `test_activities.py`, `test_timelines.py` |
| 6. The dashboard matches the data and reacts to changes | `dashboard.spec.ts`, `test_dashboard.py` |
| 7. Sharp, on brand, and a stunning dashboard | By eye, here and in the Test stage's comparison with the mockup |
| 8. Used end to end in a real browser, with no console errors | The console guard on every end-to-end test, plus the by-eye checks below |
| 9. A week of real use without a missing basic or a bug | The by-eye checks below, then the Maintain stage |

### By eye

At the end of Phase 9, check these in Chrome and in Edge:

- **Every section and action,** used the way a salesperson would, with the console open and no errors in it.
- **Widths:** each screen at 1280px wide, plus the pipeline scrolling sideways at 1024px.
- **The mockup:** the dashboard and the pipeline next to `docs/mockups/2-midnight-deck.png`.
- **Reduced motion:** with the system's reduced-motion setting on, nothing animates.
- **Keyboard:** a deal moved through the pipeline by keyboard alone, with the focus outline visible all the way.
