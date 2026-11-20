# Status

The MVP in `docs/plan.md` is built: Phases 0 to 9 are done. Nothing is committed yet.

## One-time setup

You need three things. The first `npm run dev` needs the internet, because it downloads the packages and Python 3.12. After that the app works offline.

| | Windows | Mac | Linux |
|---|---|---|---|
| **Node.js 24 or later** | `winget install OpenJS.NodeJS.LTS` | `brew install node` | The installer from nodejs.org |
| **uv** (Python's package manager) | `winget install astral-sh.uv` | `brew install uv` | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| **Browser** | Chrome or Edge | Chrome or Edge | Chrome or Edge |

The end-to-end tests use the Chrome installed on the computer, so they need Chrome itself.

**Platforms:** the app has only been tried on Windows so far. The start and stop scripts use each system's documented approach, but Mac and Linux haven't been run.

## Day-to-day use

| Command | What it does |
|---|---|
| `npm run dev` | Installs anything missing, starts the backend and the frontend, prints `Accountable is running at http://localhost:5173` and opens the browser. Ctrl+C stops both. |
| `npm run seed` | Replaces all the data with the sample data, after you type `yes`. It works while the app is running; refresh the page afterwards. `npm run seed -- --yes` skips the question. |
| `npm test` | Runs the backend, frontend and end-to-end tests in turn, and says which failed. |
| `npm run test:backend`, `npm run test:frontend`, `npm run test:e2e` | One suite at a time. |

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

`npm test` passes, with every test running and none skipped: backend 225, frontend 96 and end-to-end 41. It also passes while `npm run dev` is running.

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

## Choices the build made (please check)

These fill gaps in the spec or follow library changes since the plan was written.

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
