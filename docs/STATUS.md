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
- `docs/plan.md`: the build plan. Phases 0–7 are done. Phase 8 is done apart from step 5, comparing screenshots with mockup B, and step 7, your walkthrough; both are under "Next".
- Navigation: Pipeline is its own item in the left menu (Overview, Pipeline, Deals, Contacts, Organizations), and Overview is the landing page.
- **The app** (spec 2.2, grouped by feature):
  - Backend (`backend/app/`): FastAPI and SQLAlchemy Core on SQLite. It holds all business rules: stages and probabilities (R13–R18), stage change entries (R12), moves (D8), delete rules (R26–R30) and the dashboard figures (R45–R50). It also holds the sample data (R52–R55).
  - Frontend (`frontend/src/`): React and Vite, matching mockup B. It has:
    - **Overview:** a summary panel, revenue line chart, funnel, deals-won bar chart, follow-ups and recent activity.
    - **Pipeline:** drag with the mouse or move with Space and the arrow keys, plus a Move to… menu on each card. Moves show at once and roll back with a message if saving fails.
    - **Deals, Contacts and Organizations:** tables with search, sort, add, edit and delete, and record pages with timelines.
  - Brand: colours and fonts from the brand skill, bundled so the app works offline (R2). White text sits only on the darker Cerulean and Raspberry fills, to meet contrast (R58).
- **Tests** (`npm test`), all passing. `npm test` runs all three kinds even if one fails, and exits non-zero if any test fails or a stray `.only` is left in. This was checked with deliberately failing tests in each kind.
  - 57 backend tests (pytest).
  - 42 frontend unit tests (Vitest).
  - 37 end-to-end tests (Playwright with the installed Chrome), one file per intent success criterion. Any browser console error or warning fails a test (R59).
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

- **Review against `docs/REVIEW.md`** (Deploy stage): every finding below is dealt with. Each code fix has a test, except 7: it's a one-frame glitch, so the existing drag tests only guard against breaking drops.
  - Important
    1. [fixed] The funnel (R48) ignored stage history for open and Won deals, so a deal moved back dropped out of stages it had reached. It now counts every deal up to the furthest stage in its current stage or its history (`dashboard.py`).
  - Minor: bugs
    2. [no change] A Lost deal that was once Won counts in the funnel's Won step. R48 says a Lost deal counts "up to the furthest stage it reached before Lost", and Won is one of those, so this is what the spec asks for. Change R48 if you'd rather leave Lost deals out of Won.
    3. [fixed] Very large values or ids gave a 500. Ids beyond SQLite's range now give 404 (or 422 for a linked record), a deal's value is capped at $10 billion (`MAX_CENTS`), and the deal form says so.
    4. [fixed] The Overview follow-up checkbox stayed ticked after a failed save. It's now controlled: ticked while saving, unticked again if saving fails.
    5. [fixed] Optimistic pipeline cards now take today's close date when moved into Won or Lost (R16), and work out Late when a deal reopens (R17), before the server replies.
    6. [fixed] When two moves overlapped, a failure in the first undid the second. The board is now the last saved deals plus every move still saving, so a failed move drops out alone, and the deals are refetched only once no move is in flight.
    7. [fixed] A dropped card could snap back for a frame. The board keeps showing the drop until the optimistic update arrives.
    8. [fixed] Two moves at the same moment could read stale positions. Each transaction now takes SQLite's write lock as it starts (`BEGIN IMMEDIATE`, in `db.py`).
    9. [fixed] Sorting a mostly-empty text column could be unstable. Those columns sort as text, empty first.
  - Minor: security
    10. [fixed] The backend answers only to `localhost` and `127.0.0.1` (TrustedHostMiddleware), which blocks DNS rebinding. `ACCOUNTABLE_ALLOWED_HOSTS` adds a deployed host name later.
    11. [fixed] Text has limits: 200 characters for names, 5,000 for notes and descriptions, and requests over 1 MB are refused. The forms check the same limits.
    12. [fixed] A website must be an http(s) address (`acme.com` is saved as `https://acme.com`), and an email must look like one, on both sides.
    13. [fixed] `.mcp.json` pins `@playwright/mcp@0.0.85`, the version already in use.
  - Minor: spec and plan
    14. [fixed] R26: the deal delete dialog says how many stage changes go, for example "Its stage history (3 stage changes) will be deleted."
    15. [fixed] Cards can now be dragged while the pipeline is filtered by search (R40); a card lands next to the card it's dropped on.
    16. [fixed] Plan proof gaps:
        - an end-to-end test restarts a backend and finds the saved data (R5);
        - another holds the server's reply and checks the totals, card and close date change first (D12);
        - the backend tests check that your own database file is unchanged after the run (R6).
    17. [fixed] Docs drift: `plan.md` lists `api.py` (eleven modules). Plan risk 8's network-off check is now an end-to-end test, which fails if the app requests anything beyond this computer. Phase 8's screenshot comparison with mockup B was never recorded, so it's part of your walkthrough under "Next".
  - Nits (the five from the review)
    - N1 [fixed] One `errorMessage()` and `GENERIC_ERROR` in `api.ts` replace seven copies of the same fallback.
    - N2 [fixed] Marking a follow-up done is one hook, `useSetDone()` in `features/activities/api.ts`, used by the Overview and the timelines.
    - N3 [fixed] The note, call and email kinds are listed once (`ENTERED_KINDS`).
    - N4 [fixed] The Pipeline reads each stage's `open` flag from the server. The frontend type is now `StageInfo`, as on the backend.
    - N5 [fixed] Spec 2.2's list of shared components includes Field, PageHeader, RecordLayout, RowMenu and useReturnFocus.
  - Found while fixing: the end-to-end test "the Move to menu moves a card" failed about 1 run in 5, before and after these changes. It focused the Lost item before the menu had finished focusing its first item, so Enter sometimes chose New. It now waits for the menu first, and passed 25 runs in a row.
  - Also found while fixing: the Website, Industry and Notes fields (organizations) and Job title and Phone (contacts) never showed their errors. They do now.

## Notes

- `npm install` may say one package's install script, `fsevents`, is waiting for approval. It's an optional macOS file-watching helper; the app and tests work without it.
- The backend tests print one warning from Starlette suggesting the `httpx2` package. It doesn't affect the tests. It wasn't added, because it hasn't been checked yet.
- Times are stored in UTC and shown in your computer's time zone. "Today" (late deals, follow-up groups, Won/Lost close dates) is your computer's date (D9).

## Next

- **Your walkthrough (R61, plan Phase 8 steps 5 and 7):** use every section and action as a salesperson would, and check each screen by eye against `docs/mockups/b-summary-*.png`. Watch the browser console (View → Developer → JavaScript Console in Chrome). Note anything that looks or feels wrong here.
- **Before moving to Supabase (Postgres):** dates and timestamps are stored as text, which suits SQLite. Decide whether to switch them to real `Date`/`DateTime` columns as part of that move. The response models already declare them as dates and times, so the API won't change.
- Then commit the review fixes and merge `mvp-moni` into `main`.
