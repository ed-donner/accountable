The MVP is built and its automated tests pass. `docs/spec.md` describes the whole product as it stands today, and `docs/TECH_STACK.md` has the stack. The MVP's intent and the build plan that was followed are in `docs/changes/mvp/`. Stage 6 is complete.

## Docs reorganized

The docs are ready for future changes. `docs/intent.md` and `docs/plan.md` moved, unchanged, to `docs/changes/mvp/`, and each later change gets its own `docs/changes/<branch name>/`. `docs/spec.md` was rewritten to describe the whole product: it now holds the problem statement and the list of what's not in Accountable yet, and the decisions from its old Concerns list, the plan's layout rules and the lasting design points from the plan's Risks are folded into the requirements and design. `AGENTS.md` points to the spec first, and `docs/REVIEW.md` flags code the spec doesn't describe. No app code changed. `e2e/security.spec.ts` now looks for the spec's new title, "Spec: Accountable", when checking that Vite won't serve `docs/spec.md`, because the old title was gone and that check could no longer fail.

## Coding standards

`docs/STANDARDS.md` holds the project owner's coding standards. `AGENTS.md` points to it, and `docs/REVIEW.md` checks every change against it.

## Code checks

`npm run check` runs Prettier, ESLint (the recommended JavaScript, TypeScript, React Hooks and accessibility rules), ruff format, ruff check, a complexity limit of 15 per function, tsc, ty and gitleaks, then everything `npm test` runs, and fails if any of them fail. `npm run check:quick` leaves out the end-to-end and speed tests, and `npm run format` fixes the formatting. `npm test` now also fails if the unit tests cover less than 80% of the app code. gitleaks has to be installed separately, and the check says how if it's missing.

Everything the checks found was fixed in the code, with no rule turned off or loosened:

- **Formatting:** Prettier and ruff format reformatted the code at 120 characters wide, as it was already written.
- **Complexity:** the deal, contact and organization forms, `api()`, the data table and the board were split into smaller functions and components. The deal form was at 42.
- **React Hooks:** the forms use `useWatch` in place of `watch`, the table's search box no longer sets state in an effect, and the board reads its refs only in effects and handlers.
- **Accessibility:** the record picker says what it opens, and the board's pick-up handlers sit on the cards instead of a plain `div`.
- **Types:** ty found 71 problems. The routes now build the reply models they say they return, updates mark an unsent field with Pydantic's `MISSING` instead of `None`, new ids come back through `RETURNING`, and FastAPI's dependencies use `Annotated`. The same 741 requests gave byte-identical replies before and after.
- **Coverage:** frontend unit coverage was 56%. New tests cover every page, the charts, the shell, the routes and the pipeline board, and it's now about 98% of lines and 95% of branches. The backend is at 99%. A slow timeline test, which timed out with coverage on, now finds its button once instead of searching the page each time.

`typescript-eslint` can't read TypeScript 7, so the root has TypeScript 6.0 for ESLint alone, and the type check still uses TypeScript 7. `docs/spec.md` has the details.

## Build progress

- **Phase 1, a shell that runs:** done.
- **Phase 2, database, rules and sample data:** done.
- **Phase 3, the API:** done. At the 1,000 contacts, 500 deals and 5,000 activities limit, the dashboard's data arrives in about 22ms against a 200ms limit.
- **Phase 4, tables and forms:** done.
- **Phase 5, record pages and timelines:** done.
- **Phase 6, pipeline:** done. The first board used `@dnd-kit/sortable` and had a 241ms task at the limits, so it now has one draggable and a droppable per column, and slides the cards apart itself. The longest task while dragging into a 240-card column is about 70ms to 180ms, against the project owner's limit of about 250ms. `@dnd-kit/sortable` is gone and the spec says why.
- **Phase 7, dashboard:** done. It was checked against the mockup at both sizes with sample data, an empty database and data at the limits.
- **Phase 8, finish the build:** done.

## Compared with the chosen mockup

The app was compared with `docs/mockups/4-chosen-design.html` using Playwright, at 1440 by 900 and 1280 by 720, with the sample data seeded for the mockup's date of Oct 31, 2026. The Pipeline matches the mockup exactly. The Dashboard's layout, figures and charts match to within a pixel, and its Recent activity list holds different entries, because the mockup's are examples. Organizations, Contacts and Deals aren't in the mockup, and use the same shell, colors and type.

## Review findings

The `mvp` branch was reviewed against `main` using `docs/REVIEW.md`. `npm test` passed at the time (657 tests), so none of these were caught by a test. Each was reproduced on a throwaway copy of the app. All of them are now fixed, with tests.

### Important

1. **Other local pages could reach the data.** Vite's default CORS setting trusts localhost origins, so a page on another local port could read and change every record through `/api`, and download `data/accountable.db` through `/@fs/`. Outside websites were still blocked. (Spec: Security) Fixed: CORS is off in Vite, and it serves only `frontend/` and the packages.
2. **Show more blanked the timeline at 500 entries.** The list asked for a growing `limit`, the API caps `limit` at 500, and the 422 that followed emptied the list. (A5) Fixed: timelines load a page at a time, and a failed Show more keeps what's showing.
3. **Changing the stage overwrote a typed close date.** Moving between open stages cleared it when adding a deal and put back the saved date when editing one. (S1, F8) Fixed.
4. **Deleting the only row on the last page left an empty table with no paging.** The page number stayed in the address, so a refresh didn't help. (T5) Fixed: an address past the end moves to the last page.
5. **Overlapping moves lost their messages.** Only the latest move showed its message, and a failed first move said nothing. (P4, P8) Fixed: the messages run for every move, even after leaving the board.
6. **A failed read showed a blank page with no message.** This covered the dashboard, the tables, the pipeline, the record pages and the timelines. Fixed: each says so and offers Try again. (N6)

### Nits

1. **Bad addresses:** `/deals/abc` and very large ids showed a blank page, a very large id was a 500 from the backend, and an unknown address showed React Router's developer error page with no top bar. (N4, Q2) Fixed.
2. **Invisible save error:** an error on a field the form doesn't show, such as logging an activity on a deal that has since been deleted, showed nothing. Fixed: it shows as a message.
3. **The dashboard's won links used a text search for "won"**, so an open deal called "Wonderland rollout" appeared among the wins. (H2) Fixed: they filter on the stage.
4. **The activity delete dialog didn't name the activity.** (D1) Fixed.
5. **`components/Shell.tsx` imported from `crm/`**, which the plan's layout rules don't allow. Fixed, and a test now enforces the rule.

### Found while testing the same ideas elsewhere

Applying each failure above to other features turned up these, all fixed:

- **A failed read looked like real data:** the Pipeline showed $0 totals and Contacts showed zero counts.
- **Forms hid failed reads:** the contact form offered "No organizations match" and an Add button, the deal form's button did nothing, and a delete dialog stayed on "Checking what's linked" for good.
- **Input the backend couldn't store crashed it with a 500:** text with no valid encoding in any text field, and an activity time at the very start or end of the calendar.
- **The When box dropped the seconds:** an activity logged just now sorted below things that happened moments earlier, and any edit quietly moved its time.
- **A double click sent twice:** in Chrome, an instant double click logged an activity twice, and sent a delete twice, which could leave the dialog open with an error. Saving an organization, contact or deal was already safe.

### What the tests now cover

`backend/tests/test_every_route.py` takes the list of routes from the app, so a new route gets its checks automatically. `e2e/security.spec.ts` goes through the Vite address, because the old security tests only reached the backend. `e2e/failures.spec.ts` runs each failure across every screen it applies to.

That brought `npm test` to 1,291 tests. The new ones were also run against the code as it was before the fixes: 123 backend, 64 frontend and 54 end-to-end tests fail there. The rest pass on both, because they guard behavior that was already right.

## Second review

A second review of the `mvp` branch against `main` using `docs/REVIEW.md` found these, with all 1,291 tests passing. Each was reproduced in Chrome or with a test before the fix, and all are now fixed, with tests.

### Important

1. **A failed refresh said nothing.** A screen only reported a failed read if it had nothing to show, so the dashboard could keep showing $84,500 with $184,500 on the server. A test asserted this on all 11 screens, which is why nothing caught it. (N6) Fixed: the screen keeps what it has, says "Couldn't refresh this, so it may be out of date" and offers Try again.
2. **Two failed moves could leave a card in the wrong place.** Each failure put back a copy of the whole board, and the later copy still held the earlier move. With the backend gone, a card stayed in Won under a message saying it was back, with the wrong board total. Ticks did the same. (P4) Fixed: the board shows what the server has confirmed plus the moves still on their way, and a failed tick puts back only its own follow-up.
3. **The first load could stay blank.** Any good reply cleared the connection message without reading again what had failed, which left no message and no Try again. (N5) Fixed: whichever reply shows the connection is back, what failed is read again.
4. **Ids were reused.** Deleting the newest record freed its id for the next one, so an old address opened a different record. (N4) Fixed: the `0002` migration rebuilds every table so ids are never reused, and `data/accountable.db` picks this up by itself at the next start, keeping every row. Migrations now run in one transaction with foreign keys off, because rebuilding a table with them on deletes linked activities and blanks links.

### Nits

1. **Ticks could flicker back:** two quick ticks read everything again after the first, which brought the second back for a moment. Fixed: it reads once, after the last.
2. **Empty-looking picker:** while its list loaded, the contact form said "No organizations match" and offered Add. Fixed: the form waits, as the deal form does.
3. **Timeline paging:** a change in another window could repeat or skip an entry on Show more. Fixed: each entry shows once, and the timeline reads again if the list moved.
4. **Website checks disagreed:** the browser passed `http:example.com` and the backend refused it. Fixed: both now run the same cases from `shared/website-cases.json`.
5. **Raw SQL:** the check constraint was a SQL string. Fixed: it's a SQLAlchemy expression, and a test now enforces that.

Three smaller points from the same review are fixed too:

- **Stale error:** adding a contact from the deal form filled in the organization but left "Choose an organization" showing.
- **A card moved above itself:** an API call that moved a card across columns with itself as the place left it unplaced, tied with another card. It now goes to the end. The app can't send this.
- **The spec's file tree** now lists `test-plan.mjs`, `test-report.mjs` and `test-servers.mjs`.

`npm test` now runs 1,352 tests.

## Third review

A third review of the `mvp` branch against `main` using `docs/REVIEW.md` found these, with all 1,352 tests passing.

### Important

1. **"Today" froze in an open tab.** The top bar's date and the Late and Overdue chips read the clock once while drawing. A tab left open overnight kept yesterday's date until a full reload, and a deal due yesterday didn't show as late on the Pipeline. Reproduced in Chrome by moving the clock past midnight. (T8, P6) Fixed: `lib/useToday.ts` checks the clock every minute and whenever the window is used again, because timers stop while a laptop sleeps. The dashboard reads its figures again when the day changes, because the backend works them out for one day. The 16 new tests were also run against the code before the fix, and all but the one guarding against needless reads fail there.
2. **The fixes from the first two reviews aren't committed.** `frontend/vite.config.ts` at the last commit has neither `cors: false` nor `fs.allow`, and the `0002` migration isn't tracked, so merging the branch as committed would bring those problems back. Still open: the plan leaves commits to the project owner, and this has to happen before the merge.

### Nits

Both still open:

1. **Clear search also clears the filter:** with a status or stage filter on, it drops the filter as well as the search, though T7 only mentions the search. A test asserts this for the won list, so it's deliberate, but the spec doesn't say so.
2. **SQLite handling outside `db.py`:** `crm/timeline.py` works around SQLite returning union columns as text, and the plan keeps SQLite-specific code in `db.py`. It's harmless today.

`npm test` now runs 1,368 tests.

## Running Accountable

This runs on your own computer, and nothing you enter leaves it.

### Install two things, once

1. **Node**, version 24 or later: get the LTS installer from <https://nodejs.org>.
2. **uv**: follow the steps at <https://docs.astral.sh/uv/getting-started/installation/>.

You'll also need Google Chrome, which is the one browser Accountable is tested with.

### Start it

Open a terminal in this folder and run:

```
npm run dev
```

The first time, this downloads what Accountable needs, so it takes a few minutes and needs an internet connection. After that it starts in seconds and works with no connection at all. When it's ready it prints an address:

```
Accountable is running at http://localhost:5173
```

Open that address in Chrome. Keep the terminal window open while you use Accountable.

If it says a port is in use, Accountable is probably already running in another window.

### Stop it

Click on the terminal window and press Ctrl+C.

### Start again from the sample data, or start with your own

Accountable comes with made-up sample data so you can look around.

- `npm run seed` replaces everything with fresh sample data.
- `npm run empty` removes everything, so you can type in your own records.

Both tell you what will be lost and only go ahead if you type `yes`. Both are safe with the app running: refresh the browser to see the result.

### Back up your data

Everything lives in one file, `data/accountable.db`. Copy that file somewhere safe to back it up. There's no undo, and nothing is backed up for you, so if the file is lost or this folder is deleted, your records go with it.

### Not yet proven

Accountable has only been run on a Mac. It's built to work the same on Windows and Linux, but nobody has tried it there yet. Safari and Firefox may work, but only Chrome is checked.

## Running the tests

`npm run check` runs the code checks and then `npm test`. `npm test` runs the type checks and every test: backend, frontend and end-to-end. It takes about two minutes on a 10-core Mac, and ends with a short summary. It keeps going if one part fails, names what failed at the end, and exits with an error. A leftover `.only` in a test also counts as a failure, because it would quietly skip other tests. It uses its own temporary databases, so it never touches your data.

The end-to-end tests run side by side, using a number of workers chosen from your computer's cores and memory, so a smaller computer runs fewer at once and takes longer. To set the number yourself, for example while the computer is busy, run `ACCOUNTABLE_TEST_WORKERS=2 npm test`. The speed tests always run last and alone, so their timings are fair.
