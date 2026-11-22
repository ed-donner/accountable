The MVP is built and its automated tests pass. Accountable runs on a Mac. Two checks remain before it's called done: TM04 (how fast it feels at full size) and TM05 (code review), listed at the end.

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

- `docs/intent.md` (now `docs/changes/mvp/intent.md`) was clarified through an interview with the product owner: delete rules, timelines, pipeline columns, stage probabilities, close dates on Won and Lost, contact status on a win, required fields, the dashboard's period, scale, sample data size, the user, and success in everyday use. No code yet.

## Spec

- `docs/spec.md` has the requirements and design for the MVP, following the brand, with concerns listed at the top. The product owner confirmed all of them. No code yet.

## Mockups

- `docs/mockups/` has three design directions for the dashboard and the pipeline, each an HTML file with a screenshot beside it. A uses a Midnight sidebar and follows the spec's layout. B uses a top navigation bar, a tapered funnel and a stacked pipeline strip. C uses a slim icon rail, a dark hero panel, and Won and Lost as drop zones. The sample data and chart helpers they share are in `docs/mockups/shared/`.
- Chosen design: A, with the funnel from C and the probability ring from B, in `docs/mockups/final-dashboard.html` and `docs/mockups/final-pipeline.html`. `docs/spec.md` is updated to match.

## Plan

- `docs/plan.md` (now `docs/changes/mvp/plan.md`) has the build plan: the files that change, eight phases of work, the risks and the tests that prove each requirement, with IDs linked to the spec and intent and a traceability matrix. No code yet.

## Structure review

- The layout is now grouped by section on both sides, with one backend module per section holding its endpoints and queries, and one frontend folder per section. Alembic migrations run on every start (new requirement G12), and the frontend's API types are generated with openapi-typescript. `docs/spec.md` (repository layout, libraries, G4, G12) and `docs/plan.md` (files, W2.1, W2.2, W2.4, W2.5, W3.9, W4.2, W4.7, TB42, TF17, R15, R16) are updated to match.

## Build

Following `docs/changes/mvp/plan.md`, phase by phase.

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
- Tiles link to the pipeline, the pipeline, the deals table filtered to Won, and the dashboard's own follow-ups panel (R12: there's no separate follow-ups screen; confirmed by the product owner in the MVP review).
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
| TM02 Full walk-through as a salesperson, console open (SC8) | Done: walked through by the product owner. The Call, Email and Note choice looked like action buttons; now a labelled "Type" choice (RV2). Walked through again by hand after the fix, with no further issues. |
| TM03 Fresh setup and `npm run dev` on a Mac, following the guide | Done: checked on a Mac by the product owner. |
| TM04 Search, sort and screen changes feel instant at full size | To do soon. Measured above; needs a person's feel. |
| TM05 Code review of layout rules, rules only in the backend, API ready for paging | Not done. |
| R12 Follow-ups tile links to the dashboard's follow-ups panel | Confirmed by the product owner in the MVP review. |

All eight success criteria in the intent are met: covered by passing automated tests, with SC1, SC7 and SC8 also checked by hand (SC1 on a Mac only). SC8 was only met once the Log activity type choice was fixed in the MVP review (RV2).

## Known issues

- None open from TM02: the Log activity type choice was fixed in the MVP review (RV2).

## Review of the MVP branch (21 Nov)

Reviewed against `docs/REVIEW.md` (bugs, security, spec and plan). `npm test` passed before the review. All findings below are fixed on this branch and covered by tests; `npm test` passes.

Important:

- **RV1 Very large deal value gives a server error.** Typing `99999999999999999999` as a deal's value passes the form, overflows SQLite and shows "Something went wrong" instead of a field error. Sending `"inf"` or `"nan"` straight to the API also gives a 500 or a raw Python message.
- **RV2 STATUS claimed SC8 met with a known broken action.** The Log activity type buttons (from TM02) break A3 and SC8, so PH8 can't be called done until they're fixed.
- **RV3 R12 was built before the product owner's decision**, which the plan required first.
- **RV4 spec.md out of date on D3 and D4.** The code lets a probability or close date the user types win over the stage's usual one, and accepts a typed probability on a new deal; the spec still says the stage's values always apply.

Nits:

- **RV5 A Won or Lost deal could lose its close date** when it was cleared during the move or later, which dropped it from the dashboard's won figures.
- **RV6 Migrations ran with foreign keys on**, so a future batch migration rebuilding a parent table would cascade-delete or null its related rows.
- **RV7 Two quick pipeline drags could undo each other** for a moment when the first one's save failed.
- **RV8 Won and Lost column headers left out expected revenue**, which spec P5 asks for on every column.
- **RV9 The revenue line chart used the darker text green and hard-coded colours**, where the spec asks for Sea Green defined once as CSS variables.
- **RV10 Security (minor):** the API didn't check the Host header, and text fields and `limit` had no size caps.

Fixes:

| Finding | Fix | Test |
| --- | --- | --- |
| RV1 | Deal value capped at $1,000,000,000 on both sides, with the message "Enter a value from 0 to 1,000,000,000, in whole dollars."; `inf` and `nan` are field errors. Spec D1 updated. | `test_value_zero_or_more_whole_dollars`, TF validation test |
| RV2 | The type was wired correctly; it looked like three action buttons. It's now a segmented control with a visible "Type" label, the chosen type raised on white. | TE16 |
| RV3 | Product owner confirmed the follow-ups tile linking to the dashboard's panel. Plan R12 and spec H1 updated. | TE18 (unchanged) |
| RV4 | Product owner chose the code's rule: a typed probability or close date wins. Spec D3 and D4 updated. | Existing TB tests |
| RV5 | A Won or Lost deal saved with no close date gets today, as on create. | `test_closed_deal_never_loses_its_close_date` |
| RV6 | Migrations run on a connection with foreign keys off, check every link afterwards, then turn them back on. Without this, rebuilding two tables in a test lost half the activities and every contact's organization. | `test_table_rebuild_in_a_migration_keeps_linked_rows` |
| RV7 | A failed move puts back only its own card, and the board reloads only once the last move has saved. | TF15, second case |
| RV8 | Won and Lost headers show expected revenue (all of the value for Won, $0 for Lost). | TE12 |
| RV9 | Charts take their colors from the CSS tokens; the revenue line is Sea Green. Spec's token path corrected. | Checked by eye |
| RV10 | Security: the API answers only requests addressed to 127.0.0.1 or localhost (against DNS rebinding); names, emails and websites capped at 200 characters, other text at 10,000; list `limit` at 1,000. | `test_requests_for_another_host_are_refused`, `test_text_and_page_size_are_capped` |

Not fixed, as they were below the review's cut: with a search active, a drop is placed relative to the visible cards only (since fixed, RV23); and two moves into the same gap at the same moment can get equal positions (the next drop renumbers the column, so it fixes itself).

### Tests widened to similar areas (21 Nov)

Each fix above was tested only where the review found it. The tests now cover every endpoint, field and component of the same kind. Doing so found one more bug, fixed here:

- **RV11 Record ids and offsets beyond the database's range gave a server error.** Any id over 2^63 - 1 in a URL (every record page, timeline, delete and delete impact) or in a request body (every link to an organization, contact, deal or neighbouring card), and any such `offset` on the lists, crashed SQLite. Ids in a URL that can't exist, too large or not a number, are now "not found", like a deleted record. In a body they're a field error, and `offset` is capped.

Two smaller changes came out of the same sweep:

- **Text caps in the forms too.** Spec V4 has the frontend check the same rules as the backend, so the forms now refuse over-long text before sending it, with the backend's messages.
- **Every color is a token.** The stylesheets still had 26 color values outside `tokens.css` (the same rule as RV9). They're now named tokens with the same values, so nothing looks different.

New and widened tests:

| Area | Tests |
| --- | --- |
| Bad input on every endpoint (RV1, RV10, RV11) | TB43 `test_inputs.py`: 18 URL endpoints with impossible ids; 10 body links; paging on all 3 lists; value and probability edge cases on add and edit; all 10 text fields at and over their limit, on add and edit; 5 foreign Host headers against reads and writes, checking nothing changed |
| Close dates and typed values (RV4, RV5) | `test_rules.py`: every way into Won or Lost (add, edit, clear, drag, Won to Lost) sets a close date; no way in allows a future one; typed probability and close date win, an unchanged one sent back doesn't; a drag always takes the stage's figures |
| Migrations (RV6) | TB42: foreign keys back on in every pooled connection and cascades still work after migrating; a migration that breaks links is stopped; a failed one still restores foreign keys; the command-line upgrade path keeps data |
| Pipeline (RV7, RV8) | `board.test.tsx`: every column's totals, Won and Lost included; drops into Won, Lost and back to open; the board reloads only after the last of several moves |
| Activity type (RV2) | `LogActivityForm.test.tsx`: labelled Type group when logging and editing; two forms on one page keep their own choice; click and arrow keys, with wrapping; the last type is kept; an edit saves the new type. TE17: changing type in the edit panel shows on the timeline |
| Form limits (RV1, RV10) | `validation.test.ts`: value and probability edge cases; all 10 text fields at and over their limit. TE08: too long or too large shows under the field, keeps the text and saves nothing, on all four forms |
| Colors (RV9) | `colors.test.ts`: no color values outside `tokens.css` in any source file; every `var(--...)` used exists; the brand colors match the spec. TE18: the charts render Sea Green and Coral |
| Not found (RV11) | TE01: too-large and non-numeric ids on organization, contact and deal pages say the record can't be found |

## Second review of the MVP branch (21 Nov)

Reviewed again against `docs/REVIEW.md`. Two Important bugs were found and are fixed on this branch, each with a test that fails without the fix, along with one minor test race (RV14); `npm test` passes. The product owner also updated `docs/intent.md` and walked through the app by hand again after RV2.

| Finding | Fix | Test |
| --- | --- | --- |
| RV12 A pipeline move whose neighbouring cards were reversed or the same card (for example from a stale board in another tab) crashed with a server error. | The move is refused with "Choose where to put the deal." and nothing changes. | `test_neighbours_in_the_wrong_order_are_refused` |
| RV13 Table search skipped any column whose first row was empty, so one contact with no email stopped email search for every contact (all three list pages). | Columns are searchable whenever they opt in, whatever the first row holds. | TF03 `search still covers a column whose first row is empty` |
| RV14 TE10, TE11, TE12, TE14 and TE15 could reload or leave the board before the move they check had saved. Their "network idle" wait returns at once on a page that has already been idle. With moves slowed by 500 ms, TE10 and TE11 failed. | Each test waits for its own move's response and checks it saved before reloading or navigating. The other e2e specs were checked for the same race: only the board updates before the server answers, so they're unaffected. | TE10 to TE15 pass 20 times in a row, and with moves slowed by 500 ms |

### Minor findings, resolved (21 Nov)

The product owner chose a fix for each minor finding and parked none. Each code change has a test; `npm test` passes.

| Finding | Fix | Test |
| --- | --- | --- |
| RV15 A date far outside the normal range in `X-Local-Date` (year 1 or 9999) gave a server error on the dashboard and timelines. | A date outside 1900 to 2999 is ignored and the server's date is used, as for a missing header. | `test_a_date_outside_the_normal_range_falls_back_to_the_server_date` |
| RV16 A long crafted email address made the format check take seconds (about 9 s at 80 KB). | The 200-character limit is checked first, and the domain pattern can no longer backtrack, on both backend and frontend. Valid addresses are unaffected; malformed ones such as `a@b..c` are now refused. | `test_a_long_crafted_email_is_refused_quickly`, `test_email_format`, matching cases in `validation.test.ts` |
| RV17 A request for another host was refused with plain text, not the API's error shape. | The Host check now replies `{"message", "fields"}` like every other error. | `test_requests_for_another_host_are_refused` |
| RV18 `GET /api/activities/{id}` wasn't in the spec and nothing called it. | Removed; tests that used it now check the database directly. | `test_there_is_no_endpoint_to_read_one_activity` |
| RV19 On a descending sort, empty values came first. | Empty values sort last in both directions (spec T2). | TF04 `empty values sort last in both directions` |
| RV20 Changing the Deals stage filter briefly showed the previous stage's rows and total. | The page shows Loading until the new stage's list arrives. | TE07 `changing the stage filter shows loading` |
| RV21 Logging an activity on a deal or contact deleted elsewhere said "Check the highlighted fields" with nothing highlighted. | A server message about something the form has no field for is shown for the whole form, for example "That deal no longer exists." This applies to every form. | `forms.test.ts` |
| RV22 When the organizations or contacts list failed to load, the deal and contact forms got stuck: fetching the list again swapped the form back to Loading, round and round, so the form never appeared. | Only the first load shows Loading. A failed list says "Couldn't load the organizations." under its field with a Retry button; what was typed and a preset choice are kept. | `DealForm.test.tsx`, `ContactForm.test.tsx` |
| RV23 With a board search on, a drop between two visible cards could land on either side of a hidden card. | The card goes directly under the visible card above it, ahead of hidden cards (spec P4). | TF14, three cases |
| RV24 Dropping a card next to one still saving could be refused and snap back. | Moves are sent one after another; the board still updates the moment a card drops (spec P6). | TF15 `moves save one after another` |
| RV25 Behaviour in the code but not the spec. | Spec updated and signed off by the product owner: D1 value cap, V5 text limits, `limit` at most 1,000, the localhost-only Host check (G6), the 404 console exception (G11), the Retry message (G8), the date fallback range. | Docs only |
| RV26 Plan test descriptions out of date. | TB01 to TB03, TB17, TF14 and TF15 updated to the current rules and file names. | Docs only |

## Docs reorganized for future changes (22 Nov)

- `docs/spec.md` now describes the whole product as it stands, with the problem, users and goals brought in from the MVP intent, and a roadmap. Nothing in it defers to an intent any more.
- The MVP's `intent.md` and `plan.md` moved to `docs/changes/mvp/`. Each future change gets its own `docs/changes/<branch name>/` folder with its intent and plan.
- `AGENTS.md` says to read `docs/spec.md` first, and only the current change's folder.
- `docs/REVIEW.md` has a new pass that flags code `docs/spec.md` doesn't describe.
- No code changed.
