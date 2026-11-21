The MVP is built and its automated tests pass. Accountable runs on a Mac only; Windows is future work on the roadmap in `docs/intent.md`. Two checks remain before it's called done: TM04 (how fast it feels at full size) and TM05 (code review), listed at the end.

## How to start Accountable

You need two free tools on your computer, installed once. After that, starting Accountable is one command, and it works with no internet connection.

### The first time

1. **Install Node.js.** Go to [nodejs.org](https://nodejs.org), download the version marked LTS, and run the installer with its usual choices.
2. **Install uv**, which runs the part of Accountable that keeps your data.
   Open the Terminal app (in Applications, then Utilities), paste this line and press Return:
   `curl -LsSf https://astral.sh/uv/install.sh | sh`
   Then close that window. The full instructions are at [docs.astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/).
3. **Open a terminal in the Accountable folder.** Open Terminal, type `cd ` (with a space), drag the Accountable folder onto the window and press Return.
4. **Install Accountable's parts** by typing this and pressing Return. It takes a minute or two, and needs the internet this once:
   `npm install`

### Every day

1. Open a terminal in the Accountable folder, as in step 3.
2. Type `npm run dev` and press Return.
3. Your browser opens Accountable at http://localhost:5173 after a few seconds. The first start takes longer while it gets ready, and fills Accountable with sample data.
4. Leave the terminal window open while you work. To stop Accountable, click the terminal window and press Ctrl+C, or just close it.

Everything you change is saved straight away, in the file `data/accountable.db` inside the Accountable folder. To keep a backup, copy that file somewhere safe while Accountable is stopped.

### Starting again with the sample data

Type `npm run seed` in the terminal. **This deletes everything you've entered** and loads the sample data again. If Accountable is running, refresh the browser afterwards.

### If something goes wrong

- **"Accountable needs a tool called uv"** or **"needs Node.js"**: that tool isn't installed yet. Follow the matching step above, then close the terminal window, open a new one and try again.
- **"Accountable's packages aren't installed yet"**: type `npm install`, then `npm run dev`.
- **A message says a port or address is already in use**: Accountable is probably already running in another terminal window. Use that one, or close it and start again.
- **The browser says it can't connect**: check the terminal window is still open and showing no error, then refresh the page.

## For developers

- `npm run dev` starts the backend (FastAPI, port 8000) and the frontend (Vite, port 5173).
- `npm test` runs the backend tests (pytest), the frontend tests (Vitest) and the end-to-end tests (Playwright with the installed Google Chrome). It runs all three even when one fails, prints a pass or fail summary, and exits with an error if any failed. `npm run test:backend`, `test:frontend` and `test:e2e` run one suite. The end-to-end tests start their own copy of the app on ports 8100 and 5273 with `data/e2e.db`, so they never touch your data.
- `npm run types` regenerates `frontend/src/shared/api-types.ts` after a change to the backend's models or routes; a test fails if you forget.
- `npm run seed` reloads the sample data into `ACCOUNTABLE_DB` (default `data/accountable.db`).
- Every schema change is an Alembic migration in `backend/migrations/versions/`, applied when the backend starts.

## Intent

- `docs/intent.md` was clarified through an interview with the product owner: delete rules, timelines, pipeline columns, stage probabilities, close dates on Won and Lost, contact status on a win, required fields, the dashboard's period, scale, sample data size, the user, and success in everyday use. No code yet.

## Spec

- `docs/spec.md` has the requirements and design for the MVP, following the brand, with concerns listed at the top. The product owner confirmed all of them. No code yet.

## Mockups

- `docs/mockups/` has three design directions for the dashboard and the pipeline, each an HTML file with a screenshot beside it. A uses a Midnight sidebar and follows the spec's layout. B uses a top navigation bar, a tapered funnel and a stacked pipeline strip. C uses a slim icon rail, a dark hero panel, and Won and Lost as drop zones. The sample data and chart helpers they share are in `docs/mockups/shared/`.
- Chosen design: A, with the funnel from C and the probability ring from B, in `docs/mockups/final-dashboard.html` and `docs/mockups/final-pipeline.html`. `docs/spec.md` is updated to match.

## Plan

- `docs/plan.md` has the build plan: the files that change, eight phases of work, the risks and the tests that prove each requirement, with IDs linked to the spec and intent and a traceability matrix. No code yet.

## Structure review

- The layout is now grouped by section on both sides, with one backend module per section holding its endpoints and queries, and one frontend folder per section. Alembic migrations run on every start (new requirement G12), and the frontend's API types are generated with openapi-typescript. `docs/spec.md` (repository layout, libraries, G4, G12) and `docs/plan.md` (files, W2.1, W2.2, W2.4, W2.5, W3.9, W4.2, W4.7, TB42, TF17, R15, R16) are updated to match.

## Build

Following `docs/plan.md`, phase by phase.

### PH1 Skeleton: done

- Root npm workspace with `dev`, `test`, `seed`, `types` and the three `test:*` scripts; `pyproject.toml` with uv and Python 3.12.
- `scripts/dev.mjs` checks for Node.js 24+, uv and installed packages, explaining any gap in plain words, starts both servers with concurrently and opens the browser once both answer.
- Vite React TypeScript app with the `/api` proxy and Vitest; FastAPI app with `/api/health` and the error format.
- Test harness: pytest gives each test its own database file; Playwright runs the app on ports 8100 and 5273 with `data/e2e.db`, resets the sample data before each test through a test-only endpoint (mounted only when `ACCOUNTABLE_TESTING=1`), fixes the clock at 16 Nov 2026 and fails on any console error.
- Versions pinned (R11): Node 26.13, React 19.3, Vite 8.3, Vitest 4.1, Playwright 1.65, FastAPI with SQLAlchemy 2 and Alembic. TypeScript is held at 5.9 because openapi-typescript 7 doesn't yet accept TypeScript 7.

### PH2 Data and rules: done

- Tables, foreign keys (turned on per connection), the one-parent check and indexes in `backend/app/db.py`, with the first Alembic migration in `backend/migrations/versions/0001_first_schema.py`. The backend migrates on every start and seeds only a brand-new database file.
- `ACCOUNTABLE_DB`, `ACCOUNTABLE_TODAY` and `X-Local-Date` handled in `config.py` and `deps.py`.
- Stage rules in `rules.py`; card positions with renumbering in `routers/deals.py`.
- Sample data in `seed.py`: 12 organizations over 7 industries, 40 contacts, 30 deals (11 won in 11 of the last 12 months, 5 lost, 14 open of which 4 are late) and 120 activities with overdue, upcoming, later and done follow-ups. `npm run seed` reloads it; it refuses the default database while tests run.

### PH3 API: done

- Every endpoint in the spec's API table, one router per section, plus `GET /activities/{id}`. Lists return `{items, total}` and take `limit` and `offset`; contacts add `status_counts`.
- Deal responses carry `expected_revenue` and `is_late`; activities and timeline entries carry `follow_up_status`, so the frontend shows rules without applying them.
- When a deal's stage changes through the edit form and the same request also changes the probability or close date, the typed values win over the stage's defaults; otherwise D3 and D4 apply.
- Errors: 400 with a plain message per field, friendly 404s naming the record, and a general 500 message with nothing technical in it.
- `npm run types` writes `frontend/src/shared/api-types.ts` with openapi-typescript; a Vitest test fails when it's out of date.

### PH4 Frontend shell: done

- Brand tokens, global and component styles in `frontend/src/shared/theme/`, with Fontsource fonts bundled.
- Layout with the Midnight sidebar and routes for every section, plus a not-found page for bad links.
- API client that sends `X-Local-Date` and turns every failure into a plain message; TanStack Query refetches whatever is on screen after any change, so figures stay in step (H8).
- Shared pieces: DataTable (TanStack Table: search across chosen columns, sort with arrows, 25 rows a page, row actions on hover and focus, empty and no-results states), SidePanel, ConfirmDialog with the delete wording, toasts, Late badge, probability ring and follow-up chip; money, date and stage helpers; form rules and messages matching the backend.

### PH5 Organizations, contacts and deals: done

- Tables, side-panel forms and record pages for organizations, contacts (status filter with counts, in the URL as `?status=`) and deals (stage filter, `?stage=`, and the Late badge). Record pages put details and linked records on the left and the timeline on the right; organization and contact pages add a contact or deal already linked.
- Deal form lists the chosen organization's contacts first (D2), allows an empty organization only when the deal already lost it (Concern 1), and leaves probability blank for the stage's usual one.
- Timeline with the Log activity form at the top, edit and delete (asks first) and Mark done. The form's order is type, description, follow-up date, then the date it happened, because Chrome gives each part of a date field its own tab stop; the follow-up is the field people fill in. Logging a call with a follow-up by keyboard takes about 11 seconds in TE20.
- Deletes ask first with the linked-record counts, and the refresh afterwards skips queries about the deleted record, so the browser never asks for something that's gone (a 404 would show as a console error).
- Date fields are checked for a complete date before saving, so a half-typed date shows a message under the field rather than reaching the server.

### PH6 Pipeline: done

- Board with six columns, column and board totals (open deals only), cards with the probability ring, Late badge and "Closed" date, a search box and Add deal per column (new deals go to the top).
- Drag and drop with dnd-kit by mouse and keyboard (Space to pick up, arrows to move, Space to drop, Enter opens the deal). The dragged card keeps its size in the list with a Sea Green line where it will land.
- Totals change the moment a card drops: the move is applied to the cached list straight away and rolled back with a message if the save fails (R6); a card can't be moved again until its save finishes.
- Three dnd-kit fixes worth knowing for later changes:
  - The pointer in the gap between columns keeps its last target. Guessing the nearest there made the card flip between two columns forever.
  - The dragged card's slot keeps its full height, so measurements stay right.
  - Left and right arrows jump to the next column; up and down use the sortable default.
- At 1440 px the six 196 px columns don't fit, so the board scrolls sideways, as the spec allows.

### PH7 Dashboard: done

- Headline tiles, revenue won line chart (Recharts, Sea Green with the page's one gradient), funnel, open pipeline by stage, won and lost bar chart, follow-ups with Mark done, and recent activity, laid out on the 12-column grid of the final mockup.
- Tiles link to the pipeline, the pipeline, the deals table filtered to Won, and the dashboard's own follow-ups panel (R12: the plan's proposed answer, as there's no separate follow-ups screen; **still to be confirmed by the product owner**).
- "Won this month" compares with last month ("up 78% on Oct"), as in the mockup. Charts carry their figures in an accessible label, which TE18 checks against the API.
- Differences from the mockup, following the spec: no "Log activity" button on the dashboard (activities are logged on a contact or deal), no user name in the sidebar (single user, no sign-in), and the funnel's "% of previous" is by value (Concern 6), not count.

### PH8 Finish: done, apart from TM04 and TM05

- **W8.1 Performance (G7):** TB41 builds 2,000 contacts, 1,000 deals and 10,000 activities. Every list, page and the dashboard answers in 2 to 14 ms against a 200 ms budget. In Chrome at that size, a keystroke in the contacts search takes 15 to 50 ms, a sort 48 ms, and a full page reload in dev mode 80 to 340 ms (the pipeline with 1,000 cards is the slowest).
- **W8.2 Copy:** no exclamation marks or dashes in UI text; buttons say what they do; every table, list and timeline has an empty state.
- **W8.3 Offline (G2):** TE22 blocks any request that leaves localhost and checks the bundled fonts are in use.
- **W8.4 Setup guide:** at the top of this file.
- **W8.6 Console (G11):** every end-to-end test fails on a console error, and TE21 walks every page, panel and dialog. The one allowed error is the browser's own 404 note when a link points to a deleted record; the page itself explains it plainly.
- A timeline ordering bug, found on 21 Nov when TE16 failed and now fixed and covered by TB28: on a day when the user's today differed from the computer's clock (a fixed test date, or near midnight across time zones), a stage change could show below an activity made before it. Same-day entries are now ordered by when they were really made, on the timelines and the dashboard's recent list.
- A bug found while checking the screens by eye, now fixed and covered by a test: adding a deal from an organization's page, opened directly, didn't preselect the organization, because the form drew before its list of organizations arrived.

#### By-hand checks

| Check | Status |
| --- | --- |
| TM01 Every screen against the final mockups and brand | Done: checked by the product owner. |
| TM02 Full walk-through as a salesperson, console open (SC8) | Done: walked through by the product owner. Known issue, accepted for now: the Call, Email and Note buttons in the Log activity form didn't work as expected. |
| TM03 Fresh setup and `npm run dev` on a Mac, following the guide | Done: checked on a Mac by the product owner. ~~Windows (W8.5)~~: dropped for the MVP; Windows is future work on the roadmap. |
| TM04 Search, sort and screen changes feel instant at full size | To do soon. Measured above; needs a person's feel. |
| TM05 Code review of layout rules, rules only in the backend, API ready for paging | Not done. |
| R12 Follow-ups tile links to the dashboard's follow-ups panel | Built as the plan proposed; needs the product owner's OK. |

All eight success criteria in the intent are met: covered by passing automated tests, with SC1, SC7 and SC8 also checked by hand (SC1 on a Mac only).

## Known issues

- **Log activity type buttons (from TM02):** the Call, Email and Note buttons at the top of the Log activity form on contact and deal pages didn't work as expected in the walk-through. Accepted for now; to be looked at later.
