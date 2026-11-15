# Status

The MVP is built and every automated test passes. What's left is your own walkthrough in a real browser (R61, see "Next").

## How to install and run Accountable

You need these installed once:

- **Node.js 24 or later** (26 recommended): https://nodejs.org
- **uv**, the Python tool: https://docs.astral.sh/uv/getting-started/installation/
- **Google Chrome**, only for running the tests

Then, in a terminal, from the `accountable` folder:

1. **Install** (needs the internet, once):
   ```
   npm install
   uv sync
   ```
   `uv sync` also downloads Python 3.12 if you don't have it.
2. **Start the app**:
   ```
   npm run dev
   ```
   Wait until you see `Local: http://localhost:5173/`. Then open **http://localhost:5173** in your browser. You land on Overview with the sample data.
   The first time, the app creates its database at `backend/data/accountable.db` and fills it with sample data. After that it never needs the internet.
3. **Stop the app**: press `Ctrl+C` in the terminal.
4. **Start again from the sample data** (this deletes your changes):
   ```
   npm run seed
   ```
   This works whether or not the app is running. If it is running, refresh the browser afterwards.
5. **Run all the tests**:
   ```
   npm test
   ```
   The tests use their own database (`e2e/.data/`) and ports (8100 and 5180), so they never touch your data. You can leave the app running while they run.

## Done

- `docs/intent.md`: scope, users, constraints and success criteria agreed, including delete rules, stage probabilities, required links, scale, speed and accessibility.
- `docs/spec.md`: numbered requirements (R1–R61) and the design for the MVP: architecture, data model, API, screens, brand-based visual design and test plan.
  - Phase 0 decisions are recorded in it:
    - direction B with the left sidebar (2.7)
    - the darker text-bearing colours (2.8)
    - the funnel and rounding rules (R48, R18)
    - the code layout grouped by feature (2.2)
- `docs/mockups/`: three design directions (A classic sidebar, B summary-led, C icon rail with a Today column). B is the chosen direction, drawn with the left sidebar. It has a 1440 px screenshot of each section, and a layout for 1024–1279 px. Rebuild them with `node docs/mockups/generate.mjs docs/mockups`.
- `docs/plan.md`: the build plan. All phases are done (0–8). Phase 8's own walkthrough is yours, under "Next".
- Navigation: Pipeline is its own item in the left menu (Overview, Pipeline, Deals, Contacts, Organizations), and Overview is the landing page.
- **The app** (spec 2.2, grouped by feature):
  - Backend (`backend/app/`): FastAPI and SQLAlchemy Core on SQLite. It holds all business rules: stages and probabilities (R13–R18), stage change entries (R12), moves (D8), delete rules (R26–R30) and the dashboard figures (R45–R50). It also holds the sample data (R52–R55).
  - Frontend (`frontend/src/`): React and Vite, matching mockup B. It has:
    - **Overview:** a summary panel, revenue line chart, funnel, deals-won bar chart, follow-ups and recent activity.
    - **Pipeline:** drag with the mouse or move with Space and the arrow keys, plus a Move to… menu on each card. Moves show at once and roll back with a message if saving fails.
    - **Deals, Contacts and Organizations:** tables with search, sort, add, edit and delete, and record pages with timelines.
  - Brand: colours and fonts from the brand skill, bundled so the app works offline (R2). White text sits only on the darker Cerulean and Raspberry fills, to meet contrast (R58).
- **Tests** (`npm test`), all passing. `npm test` runs all three kinds even if one fails, and exits non-zero if any test fails or a stray `.only` is left in. This was checked with deliberately failing tests in each kind.
  - 49 backend tests (pytest).
  - 36 frontend unit tests (Vitest).
  - 32 end-to-end tests (Playwright with the installed Chrome), one file per intent success criterion. Any browser console error or warning fails a test (R59).
- **Checked in a real browser (Playwright):**
  - At 1024, 1280 and 1440 px, nothing scrolls sideways except the pipeline board (R60).
  - The console stays clean.
  - Keyboard moves, focus return from dialogs and screen-reader announcements on the board all work (R41, R57).
- **Speed (R56)**, measured in development mode with 1,000 organizations, contacts and deals and about 1,170 activities:

  | Action | Time |
  |---|---|
  | Open a table | about 150 ms |
  | Search a table | 15–23 ms |
  | Sort a table | 7–14 ms |
  | Open the Pipeline (1,000 cards) | about 600 ms |
  | A pipeline move showing on the board | about 320 ms |

  Tables over 200 rows draw only the rows in view (TanStack Virtual). The board's figures are a little over the 200 ms aim at that size in development mode, and well under it at the sample size.

- **Backend foundation tidy-up**, after the MVP:
  - Every route has a response model (spec 2.2), so the OpenAPI schema at `/docs` is the full contract for the frontend. A test fails if a new route returns a bare `dict`.
  - The stages are listed once, in `stages.py`. The API types, the database check and the funnel are all built from that list. Contact statuses and activity kinds are listed once, in `db.py`.
  - `api.py` holds what every route shares: the `Name`/`Text` field types, the 422 field messages (moved from `main.py` and `db.py`), the delete preview shape and `plural()`.
  - Fixed: an organization's contacts now include `organization_name`, which the frontend type already expected.
  - The API's output is otherwise unchanged. This was checked by comparing every GET response before and after.

## Notes

- `npm install` may say one package's install script, `fsevents`, is waiting for approval. It's an optional macOS file-watching helper; the app and tests work without it.
- The backend tests print one warning from Starlette suggesting the `httpx2` package. It doesn't affect the tests. It wasn't added, because it hasn't been checked yet.
- Times are stored in UTC and shown in your computer's time zone. "Today" (late deals, follow-up groups, Won/Lost close dates) is your computer's date (D9).

## Next

- **Your walkthrough (R61):** use every section and action as a salesperson would, and check each screen by eye against `docs/mockups/b-summary-*.png`. Watch the browser console (View → Developer → JavaScript Console in Chrome). Note anything that looks or feels wrong here.
- **Before moving to Supabase (Postgres):** dates and timestamps are stored as text, which suits SQLite. Decide whether to switch them to real `Date`/`DateTime` columns as part of that move. The response models already declare them as dates and times, so the API won't change.
- Then the course's Deploy stage: a review of this branch against `docs/REVIEW.md`.
