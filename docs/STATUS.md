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

`typescript-eslint` can't read TypeScript 7, so the root has TypeScript 6.0 for ESLint alone, and the type check still uses TypeScript 7. `docs/specs/architecture.md` has the details.

## Hooks

Three hooks run the checks without anyone having to remember them:

- **Before each commit:** lefthook formats the staged files and adds the changes to the commit, then runs ESLint, ruff check, tsc, ty and gitleaks. It leaves out the tests and takes a few seconds. `npm install` sets it up.
- **When the coding agent finishes a turn:** a hook runs `npm run check:quick` and sends any failure back to the agent, once a turn, so it can't loop.
- **Edits to `.env`:** a hook stops the agent's file tools on any file called `.env`, and any shell command that names it.

Testing them showed that gitleaks only said how many secrets it found, not where, in the hook and in `npm run check` alike. Both now name the file and line, with the secret hidden. `npm run check:quick -- --failures-only` is new: it shows only what failed, and the agent's hook sends that.

## CI

`.github/workflows/ci.yml` runs on every push, to any branch, on GitHub's Ubuntu runner. It installs gitleaks and scans every commit first, so a leaked secret fails the run straight away. Then it installs Node 26 and the latest uv, and runs `npm run check:quick`. It uses no secrets.

CI used to run `npm run check`, and the end-to-end tests took up most of each 15-minute run. It now leaves them out, along with the speed tests, so they run only in `npm run check` on your own computer. The step that uploaded the Playwright report went with them.

Running the checks on Linux for the first time found two things, both now fixed:

- **`npm run dev` could finish before the backend had stopped.** concurrently starts each server through a shell, and on Linux that shell stays in between. A stop ends the shell at once, so the script exited while the backend still held its port, for up to about 100ms. Starting again straight away said the port was in use, and one end-to-end test failed that way. Each server now starts with `exec`, so the shell becomes the server. The Mac wasn't affected.
- **There was no Playwright report to keep.** Playwright only wrote the results the summary reads, into the temporary folder, and the screenshots of any failures went with that folder at the end of each run. An HTML report with those screenshots is now kept in `playwright-report/main` and `playwright-report/speed`.

## Improving the harness

`docs/IMPROVE.md` is a short routine for Deploy, after the review fixes and before the merge. It looks back at what went wrong on the change, turns a mistake that has happened twice into a rule or a check, removes what's out of date, and ends by improving itself. `AGENTS.md` points to it.

It was first run on `dark-mode`, before that branch's review fixes, using the review's four findings, the session logs and the hook results. Two mistakes had happened more than once, and `AGENTS.md` now has a rule for each:

- **Commits:** the project owner had to say "Leave the commits to me" in three sessions, and the dark-mode plan still said to commit after each phase. The owner makes the commits, and plans don't schedule them.
- **The spec fell behind the code:** every review so far found something the spec didn't describe, and on `dark-mode` a change was noted in STATUS.md but not in the spec. Work that adds or changes behavior, a file or a test now updates the spec in the same change.

`docs/IMPROVE.md` now says where to look for what went wrong and keeps a list of mistakes seen once, so the next run can tell when one comes back. This section and the third review's open items above were brought up to date.

The second run was on `multi-user`, after the fix for the review's Important finding. It used that review, the person's messages and the Stop hook's results from the branch's nine sessions, and the agents' shell commands. Four mistakes had happened more than once:

- **Servers left running:** the owner asked for the app to be stopped on `subagents`, and twice on this branch. The `npm run dev` that the last ui-check used then ran for an hour after its session ended, until the owner had it stopped. `AGENTS.md` now says to stop every server and background command you start, and to check its ports are free.
- **What git can't give back:** on `dark-mode`, `git checkout --` wiped new code while proving a test failed. On this branch, that same `npm run dev` ran on the owner's own `data/accountable.db`, so the branch's migration upgraded it. `AGENTS.md` now says to break code from your own copy and never undo it through git, and to run the app on a temporary database unless the person asks for their own. This takes the lost-work entry out of Seen once.
- **End-to-end tests that didn't wait:** `mode.spec.ts` scrolled before the table had drawn, and several tests read the API after a move, using a wait that returns at once on a page that's already loaded. Both failed only under a full run's load. `AGENTS.md` now says to wait for the exact thing the next step needs. A lint rule could ban one kind of wait, but the first test had no wait at all, so it's a rule, not a check.
- **Spec claims no test tried:** the spec said the test summary names slow tests, that the local sign-in can't be reached from elsewhere, and that Supabase's keys are fetched at most every 30 seconds. None of those held, and no test tried them. `docs/REVIEW.md`'s spec pass now asks for the test that would catch each such claim being false.

Five mistakes seen once are now in `docs/IMPROVE.md`: `python` in a comment, slowness on a remote database, a check on a header the client sets, the Stop hook running all through a team build, and a fixable bug presented as a library's way. "Leave the commits to me" was said again in three sessions, but no agent committed, and `AGENTS.md` already says it, so nothing was added. `AGENTS.md` and the test instructions below now say `npm test` takes about four minutes, not two. `docs/IMPROVE.md` now says how to find a change's sessions, how to leave out teammate messages, where the Stop hook's failures are, and to read the agents' shell commands for what the person never saw.

## Dark mode

Built on the `dark-mode` branch, following `docs/changes/dark-mode/plan.md`. A round button in the top bar, just before the date, switches between light and dark mode on every screen. It shows a moon in light mode and a sun in dark mode. Light mode is the default. The choice is saved in this browser under `accountable-mode`, and a short script at the top of `frontend/index.html` applies it before anything draws, so a reload in dark mode doesn't flash light first.

- **Colors:** every color is now a token in `frontend/src/styles.css`, with the dark values in one block under `[data-mode="dark"]`. `frontend/src/colors.test.ts` fails if any other file names a color value, or if the dark block sets a token `@theme` doesn't have. Text that sat on Sea Green, Marigold or Coral by inheriting ink now names Midnight, so it stays readable when ink turns Sea Mist.
- **Messages:** they now use the brand's colors in both modes, on the raised surface with no outline. This is the one planned change to light mode besides the button. They also get the brand's focus ring, which Sonner's own styles had hidden.
- **Shadows:** a token like `--shadow-dialog` is used as `shadow-(--shadow-dialog)`, because Tailwind copies a plain `shadow-dialog`'s value into the class, and the dark value then couldn't replace it.
- **Spec change:** the contrast sweep found that error messages beside a field, in the small Alert chip's red, were 2.46:1 on a dark dialog. `docs/spec.md` now has a Raspberry text token for them: the same `#D23E62` in light mode, and `#F591A9` in dark mode, at 5.08:1.

Light mode was compared pixel by pixel with the commit before this change, on the dashboard, the three tables, the three kinds of record page, the pipeline and the Add deal dialog, at 1440 by 900 and 1280 by 720. The local `main` branch is the course's own and has no app in it, so the comparison used commit `f48c944` instead. Before the button went in, every screen was identical. At the end, the only difference was the button's 15px moon icon.

Every screen was also walked in both modes at both sizes, on a temporary database. `docs/changes/dark-mode/` holds the dashboard and the pipeline in both modes. Two things are left for the project owner to judge. In dark mode, a dragged card is the same color as the cards beneath it, as the spec says, so it stands out by its shadow alone, which shows less on the dark board. The browser's own date picker and select lists open outside the page, where screenshots can't reach, so only their `color-scheme: dark` is tested.

`npm test` now runs 1,636 tests, including 50 new ones for dark mode.

## Subagents

Built on the `subagents` branch. The coding agent has two subagents in `.claude/agents/`, and `docs/specs/testing.md` describes them:

- **reviewer** reviews a branch, a commit or a range against `docs/REVIEW.md` and reports Important findings and nits. It runs on Sonnet. A hook in its file lets its shell run only commands that read, such as `git diff`, `git log`, `git show`, `git grep` and `grep`, and stops anything that could write, such as `git checkout`, a redirect into a file or `$( )`.
- **ui-check** checks each page of the running app in the browser, with the Playwright MCP server, against the brand skill and the spec, in light and dark mode, and reports what's broken or off-brand. It runs on Sonnet. It has no tools to edit files or type into the app, and a hook keeps every file it saves in `.playwright-mcp/`, which git ignores.

Claude Code loads a new `.claude/agents/` folder only when a session starts, so restart it before using them. The hooks in the agents' files run only once the project folder is trusted, and not in a `claude -p` run. Both agents were started with `claude -p --agent`, which confirmed they load and that the reviewer runs on Sonnet. The hooks are tested through their scripts in `scripts/agent-hooks.test.mjs`, but neither agent has done a full run yet. `npm test` now runs 1,689 tests.

## Spec split by area

Done on the `multi-user` branch, before its design. The spec had grown past 850 lines, so it's now split by area, with the wording unchanged. `docs/spec.md` keeps the problem, what Accountable is, the terms, the quality rules and an index. The detail is in twelve files in `docs/specs/`: six product areas, each with its requirements and screen (`shell.md`, `records.md`, `deals.md`, `activities.md`, `dashboard.md`, `running.md`), and six that cover every area (`visual-design.md`, `architecture.md`, `backend.md`, `frontend.md`, `security.md`, `testing.md`). The only edits are links and words like "this file" and "below" that pointed across sections, which now name the file. `AGENTS.md` says to read `docs/spec.md` and then only the area files a change touches, and to keep every file a change affects up to date. `docs/REVIEW.md`'s spec passes cover the area files, and the reviewer and ui-check subagents read them. No code changed.

Two fixes followed. The spec and this file said ui-check runs on the session's model, but its file sets Sonnet, and both now say Sonnet. And `e2e/mode.spec.ts`'s "switching keeps what's on screen" failed once in `npm run check`: it scrolled the page straight after typing, and if the table hadn't drawn yet, the page was too short to scroll and stayed at 0. Holding back the organizations reply for 1.5 seconds made it fail the same way every time. It now waits for the first row before it scrolls, and passes with the delay in place.

## Independent review of multi-user

On 2026-11-04, the branch was reviewed against `week1day5-end`, with an emphasis on code quality and readability. `docs/INDEPENDENT_REVIEW.md` records four Important findings, reproduced with temporary tests outside the repository: a late 401 ending a newer session, a pending move restoring cached data after sign-out, ArrowDown failing to retry an open search error, and local sign-in losing its token when storage writes fail. It also records four non-blocking maintainability recommendations. The review itself changed no application code. `npm run check -- --failures-only` passed all 2,868 existing tests and the code checks in 3m 56s.

The fixes that followed. Each new test was run against the code with its fix taken out, and failed there.

1. **A late 401 could sign out a newer session.** Fixed: each sign-in begins a session with a new id, and `api()` ends the session only if the one the request went out in is still going.
2. **A pending move could put the last session's deals back.** Worse than reported: with a move pending at sign-out, the next person's first move showed the previous person's deals, because the move's saved list outlived the cleared cache. Fixed: `SignedIn` gives each session its own query cache, keyed by the session's id, in place of one cache emptied at sign-out. A late reply now lands in the old cache, which nothing reads. `queryDefaults` moved from `App.tsx` to `lib/queryDefaults.ts`, so `SignedIn` can use it without importing `App.tsx`.
3. **ArrowDown didn't retry with the error showing.** Fixed: ArrowDown always opens the list and tries a failed search again, and a held-down key joins the try already on its way.
4. **Local sign-in lost its token when storage refused it.** Fixed: `session.ts` keeps the token itself when storage can't, until the page is reloaded. Storage stays where each request reads the token, so another tab's sign-out still shows on the next request.

Nits:

1. **The import cycle:** fixed. `session.ts` no longer imports `api.ts`. The sign-in screen asks the local sign-in route for the token and hands it to `signInWithToken()`. `connectionMessage()` is a constant again, `CONNECTION_MESSAGE`.
2. **Typed authorship helpers:** not changed. The helpers are short and named for what they do, and a type for the row would have to describe SQLAlchemy rows, whose columns the type checkers can't see, so it would promise more than it checks.
3. **One Supabase stand-in:** fixed. `frontend/src/test-supabase.ts` replaces the four that differed, and its saved session and events agree, as the real client's do.
4. **The organization query:** fixed. Both halves of the union name every column, and the linked contacts and deals each have a small conversion function.

`main.test.tsx` now imports `App.tsx` up front. `test-utils.tsx` used to load the whole app by importing `queryDefaults` from it, and without that the test paid the app's loading time itself and showed in the slow-test list.

`npm run check` passes, with 2,878 tests.

## Sign-in, search and a user menu: design

On the `multi-user` branch, `docs/spec.md`, the area files and `docs/TECH_STACK.md` now describe Accountable with sign-in, search and the user menu in it, as it will be once the branch merges. Three area files are new: `sign-in.md`, `search.md` and `deploy.md`.

The build plan is in `docs/changes/multi-user/plan.md`. It splits the work into nine parts that share no files, in three phases: sign-in and the database, then search, then the user menu.

## Sign-in, search and a user menu: build

The build was done by an agent team, one agent per part of the plan, each editing only its own files, with the lead merging their work and keeping the spec and this file up to date.

- **Phase 1, sign-in and the database:** done. `npm run check` passes, 2,587 tests, and the project owner walked the shared app on Supabase from `npm start`. The run instructions below describe the local copy's sign-in and how to set up the shared app.
- **Phase 2, search:** done. `npm run check` passes, 2,830 tests. On Supabase, from `npm start`, the project owner searched with the same terms as the local copy and got the same results in the same order, and found the screens quicker after the queries were cut down: "all acceptable", with the Dashboard, at three queries, the slowest.
- **Phase 3, the user menu:** done. `npm run check` passes, 2,856 tests. The menu under your initials holds the theme, Light, Dark or System, and Sign out, and the mode button, `lib/mode.ts` and `e2e/mode.spec.ts` are gone, replaced by `lib/theme.ts` and `e2e/menu.spec.ts`. Until the app knows who's signed in, or if it can't reach the backend, the button shows a person icon and the menu still offers the themes and Sign out. `.claude/agents/ui-check.md` now signs in by choosing a made-up teammate, switches the theme with the menu, and leaves search results to the end-to-end tests.
- **Phase 4, finish:** built and checked, apart from three steps for the project owner below. The last `npm run check` passes, 2,857 tests. Its slow list names two frontend tests at 1.0 and 1.1 seconds, which take 310 and 378ms on their own: every unit layer runs at once in a full check.
  - `npm run check` with the three Supabase settings in `.env` passes, and doesn't reach Supabase: its count of statements on the app's tables, read through the Supabase MCP server, was 1,607 before a run of the backend tests and 1,607 after.
  - ui-check, on a copy from `npm run dev` with a temporary database, found nothing broken or off-brand on the sign-in screen, every page, the menu and the search box, in both modes, with no console errors and nothing loaded from outside.
  - The reviewer found no Important problems. Two of its nits are fixed: pytest now refuses to start with any of the Supabase settings set, since a by-hand run would have pointed the tests at Postgres, and making the local signing key is locked, since two first requests on a new database could race and one get a 500.
  - Known and left as they are: a key fetch that fails isn't rate-limited, so while Supabase is down a request naming an unseen key waits its full 10 seconds and others queue behind it, though it still refuses. Search fetches every match and keeps 5 in Python, fine locally but the heaviest call on Render at the limits. "Last changed by … on Aug 28, 2026" can break inside the date. The Dashboard's "Deals won in November" heading wraps at 1280 wide. The tables' search boxes use the panel color, not the page color. Long emails in the Contacts table end in "…".
  - Fixed after a later ui-check: the search box told screen readers its list was open while it was closed. cmdk sets `aria-expanded` to true on its input after any props it's given, so `Search.tsx` now sets it from whether the list shows. A new unit test fails on the code before the fix. `npm run check` passes, 2,858 tests.
  - Fixed after a later review against `week1day5-end`: the local copy decided "this computer" from the Host header alone, which the client sets, and the trusted host check always lets `localhost` through. Run as Render would run it without its settings, on `0.0.0.0` with `RENDER_EXTERNAL_HOSTNAME` set, a request over this machine's network address with `Host: localhost` listed the teammates, got a token and was signed in. The local sign-in and local tokens now also need the connection to come from a loopback address, which uvicorn takes from X-Forwarded-For only on a connection from this computer. `test_auth.py` sends the local address from four other addresses, and the tests' local clients now come from `127.0.0.1`, as the browser and Vite's proxy do. The 8 new tests fail on the code before the fix, and nothing else does. `npm run check` passes, 2,868 tests.
  - Still open from that review, for the review fixes: the trusted host check may refuse Render's health check, or a custom domain, if they arrive with another Host (unconfirmed until the first deploy). Reads on Postgres run without a transaction, so a page made of several queries, such as the Dashboard, can mix data from before and after a save. `GET /me` gives a 500, not a 401, if the person's `users` row is deleted by hand while the app runs. Its other two nits are the key fetch and search items in "Known and left" above.
  - The owner's own database is already upgraded: the session that ran the last ui-check started `npm run dev` without a temporary database, so `data/accountable.db` has been at migration `0003` since Nov 3 at 22:29, with the four made-up teammates added, and that session kept no copy from before. It still holds its 24 organizations.
  - Still to do: `npm run check` with `.env` moved aside, and a last look at the menu and Sign out on `npm start`. The check on a copy of the owner's own database can no longer show the upgrade from `0002`, unless the owner has a backup from before then.

What Phase 1 added: the `users` table and who added and last changed every record, migration `0003`, Postgres through psycopg with the row-level security check, `settings.py` choosing the copy, the token check in `auth.py` for both copies, the local sign-in routes and four made-up teammates, the sign-in screen and session in the frontend, "Added by" and "Last changed by" on record pages and timelines, `npm start`, `render.yaml`, and a local environment for every other command that leaves out the Supabase settings.

Changes to the plan and spec found during the build:

- **Times on record pages:** R6 shows when a record was added and last changed, but the agreed replies carried only who. The organization, contact and deal replies now carry `created_at` and `updated_at` too, and a record counts as changed when the two differ. So an add sets both from one moment, and renumbering a column leaves the other cards' times alone. Records from before sign-in can have their two times a moment apart, so on those a difference under a second doesn't count. `docs/specs/backend.md` says so.
- **What counts as a change (U10):** a save that alters nothing writes nothing, since the Edit dialogs send every field. A move within a column counts, and dropping a card back where it was doesn't.
- **`settings.py`** is new, and `deals.value` is a 64-bit integer, because Postgres's `integer` stops at about $2.1 billion and the API accepts up to $1 trillion. Both are in the spec.
- **Ids stop at 2,147,483,647,** the largest Postgres's `integer` holds. The API accepted ids up to 2^63, and on Postgres a bigger one would have been a 500. The frontend treats an address past the limit as a missing record without asking.
- **Display names:** Supabase's docs don't say where the dashboard's Display name column comes from. The dashboard's own code takes the first of `name`, `displayName`, `display_name`, then `fullName` and `full_name`, from the person's user metadata, and the backend reads them in the same order.
- **The 401 comes first:** the token check started as a FastAPI dependency, which runs after the body is read, so a request with no token and broken JSON got a 422. It's now a middleware, so every address under `/api` refuses anyone not signed in, whatever the body.
- **`GET /me`** lives in `auth.py`, so `users.py` never imports it and the two don't import each other.
- **Keys:** PyJWT drops Supabase's key set after 5 minutes by default (plan risk 5). The backend keeps it until a token names a key it hasn't seen, fetching at most once every 30 seconds.
- **The slow-test list:** the spec said the summary at the end of `npm test` names any unit test that took a second or more, but it didn't. It does now. Two tests it found are being cut down: a timeline test from before this branch, and a new one that paid psycopg's first import.
- **A save that fails in the shared app** now says to check the internet connection (N5), not that Accountable is still running.
- **Tests that raced:** several end-to-end tests checked the API right after a move or tick shown on screen, with a wait that returns at once on a page that's already loaded. They failed under the load of a full run. They now wait for the save's reply. Two copy tests could leave a copy of the app holding its ports when they timed out, and now always stop it.
- **Fewer queries (Phase 2):** each list, record page and timeline is now one query, and the Dashboard three, where Organizations had made 9 and Contacts and the Dashboard 5 each. Every reply is byte-for-byte what it was, checked on 1,524 replies, and `test_limits.py` caps the queries per call so they can't creep back. With the sign-in check and reads fixed in Phase 1, a screen costs about 2 round trips on Postgres, where it took 8 to 16 at the walk.
- **Search (Phase 2):** one query answers all three kinds at once, so a keystroke costs one round trip. SQLAlchemy's `autoescape` can't go with `func.lower` on the search text, so `search.py` escapes `%` and `_` itself. SQLite's `lower` is replaced with Python's, so "ÉMILE" finds "émile" on both databases. While the next search loads, the last results stay on screen (K8, new).
- **NUL in text (Phase 2):** Postgres can't store a NUL character in text, so any request body or search holding one was a 500 there, though SQLite stored it. Every text field and search's `q` now refuse it with a 422, and `test_every_route.py` sends one to every text field the app has.

`TZ` is Europe/London, the team's time zone. The Supabase project is in us-east, so the Render region is `virginia`, beside it.

The walk on Supabase so far, with `npm start` on this computer:

- **Tables and row-level security:** the first start built every table with the sample data, and row-level security is on for all seven, `alembic_version` included, confirmed through the Supabase MCP server. The security advisors list the seven tables having row-level security with no policies, which is intended, since no policies shuts the Data API out, and suggest turning on leaked password protection in Supabase Auth. The performance advisors list only unused indexes on a database nobody has used yet.
- **Nothing secret in the page:** `frontend/dist` holds the Supabase URL and the publishable key, and no database host or address. `gitleaks dir` finds nothing with `frontend/dist` in place (plan risk 9). The local signing key was tested separately and isn't flagged either.
- **Slow from London:** every screen took about 5 seconds the first time, and a rename felt slow. The cause: each API call made 8 to 16 round trips to the database, one after another. The sign-in check took a connection of its own on every request just to read the `users` row, and every read paid for a BEGIN and a ROLLBACK. From London to us-east each round trip costs about 80 to 150ms. Inside Postgres, every query took under half a millisecond. The sign-in check now remembers each person in the process, and reads on Postgres skip the transaction. Render runs beside the database, where a round trip is 1 to 2ms. The region in `render.yaml` had been `frankfurt`, which would have made every query on Render cross the Atlantic too.

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
2. **The fixes from the first two reviews aren't committed.** `frontend/vite.config.ts` at the last commit has neither `cors: false` nor `fs.allow`, and the `0002` migration isn't tracked, so merging the branch as committed would bring those problems back. Fixed: committed in `27c1570`.

### Nits

1. **Clear search also clears the filter:** with a status or stage filter on, it drops the filter as well as the search, though T7 only mentions the search. A test asserts this for the won list, so it's deliberate, but the spec doesn't say so. Fixed: T7 now says so.
2. **SQLite handling outside `db.py`:** `crm/timeline.py` works around SQLite returning union columns as text, and the plan keeps SQLite-specific code in `db.py`. It's harmless today. Still open.

`npm test` now runs 1,368 tests.

## Shared code out of crm/

Done on the `prepare` branch, ahead of business areas beside the CRM, such as products, settings and invoices. The code any area needs moved out of `crm/` to the top level, on both sides, so a new area never imports `crm/`. The app does the same as before.

- **Backend:** `who.py` moved up from `crm/`, and now also gives a table its four who-and-when columns, which were in `crm/tables.py`, and holds the `Authorship` reply model. The new `api.py` has what was generic in `crm/schemas.py`: the base request model and its check on text a database can't store, `FieldError`, the 422 messages, and the field types for names, emails, websites, ids, dollars, paging, today and now. The CRM's own messages stay in `crm/schemas.py`, and `main.py` hands them to the error handler, so each later area keeps its own. The made-up teammates moved from `crm/sample_data.py` to `users.py`, because any area's sample records are put down to them.
- **Frontend:** `crm/RecordLayout.tsx` is now `components/RecordLayout.tsx`. `crm/forms/server-errors.ts` is now `lib/saveErrors.ts`, with its test, and `useCloseIfUnreadable.ts` moved to `lib/`. The picker check `link()` joined `lib/validate.ts`. The new `lib/records.ts` has the `Person` and `Authorship` types and the hooks that save a record and delete one, which were in `crm/queries.ts`.
- **Layout tests:** `frontend/src/layout.test.ts` now checks every file outside `crm/` but `App.tsx`, not only `components/` and `lib/`, so a later area's folder is covered too, as the backend's test already did. The backend's test also checks that it found `main.py`, so it can't pass by looking in the wrong place. Both were shown to fail on a made-up area that imports `crm/`.

Left in `crm/`: the dates the sample data uses, the chart helpers and the delete dialogs' shared code, because no other area needs them yet. `docs/INDEPENDENT_REVIEW.md` still links to `crm/who.py`, as a record of the code it reviewed.

## Test runs in several worktrees at once

`npm run check` in two worktrees at the same time used to fail in one of them. Every run put its servers on the same ports, from 5200, 8800, 5300 and 8900, so the second run's servers couldn't start: "Port 5200 is already in use". Shown by running `npm run check` in two new worktrees in `.claude/worktrees/` at once, on the code as it was: one passed, and the other failed both its end-to-end and speed tests that way. A second clash turned up in the main checkout: ESLint doesn't follow `.gitignore`, so it linted the 284 files of the worktrees inside `.claude/worktrees/` and failed on 168 errors in them.

- **Ports:** each run takes a slot, by listening on the slot's port, and its servers use that slot's block of ports, from 20017 up. The operating system frees the port when the run ends, even after a crash. A slot where another program already has one of the run's ports is passed over: a VS Code helper was listening on 23977 on this Mac. There's nothing to set. `scripts/test-runs.mjs` is new, `scripts/test-plan.mjs` has the layout, and `playwright.config.ts` refuses to start without a slot, as it does without a database.
- **Workers:** a run reaching its end-to-end tests divides the machine's workers by the runs busy at that moment, its own included, so two at once on 10 cores take 3 each rather than 6.
- **Speed tests:** one run at a time holds the speed tests' turn, and starts them only once no other run is busy with its checks or end-to-end tests. A run waits to start its checks while another holds the turn. That includes the Stop hook's `npm run check:quick`, so an agent's turn can end a few minutes later while another worktree is running `npm run check`. Claude Code gives a Stop hook 600 seconds by default, and the longest wait seen was 4 minutes 41 seconds, all told.
- **ESLint** now leaves out `.claude/worktrees/`, as git does. It lints the same 143 files as before in the main checkout.

Proved twice with the new code, between this checkout and a worktree in `.claude/worktrees/`:

- **Started together:** both took 3 workers and passed every test, 2,889 each, in 5m 54s and 6m 18s. One run alone takes 4m 11s.
- **Started 100 seconds apart, with a `check:quick` in a third worktree started once the first run took the speed tests' turn:** all three passed. The first run's speed tests waited for the second run's end-to-end tests, and the second run's speed tests and the `check:quick` waited for the first run's speed tests. The second run's unit tests ran beside the first run's 6-worker end-to-end tests, so they took two to four times as long, and the summary listed 29 of them as over a second. That list is information only.

The speed figures were the same in every run, alone or shared: the dashboard's data in 24 to 26ms, the top bar's search in 178 to 181ms, and the worst task in each drag at a median of 70 to 79ms.

## Company settings: build

Built on the `company-settings` branch from `docs/changes/company-settings/plan.md`, following `settings.md` (B1 to B14). Company settings, in the menu under your initials, opens a page at `/settings` with the business's details for its quotes and invoices. Nothing uses them yet.

- **Backend:** a new area, `company/`, beside `crm/`: the `company_settings` table, `GET` and `PATCH /api/settings`, and the sample company. Migration `0004` adds the table with one row at the blank defaults and nobody recorded, so a database that already exists never gets the made-up company (B13). A new database and `npm run seed` get it through `cli.fill_sample`, and `npm run empty` leaves the settings alone. A save reads the row, checks the name and the prefixes against it and writes, in one transaction under the write lock.
- **Frontend:** `company/settings.ts` and `company/SettingsPage.tsx`, the `/settings` route, and the menu item. `Field` has an optional hint, and `RecordLayout.tsx` exports `WhoAndWhen` for the page's "Last changed by" line.
- **Tests:** `shared/settings-cases.json` holds the tax rate, prefix and clash cases, and both unit suites run them. New: `test_company_settings.py`, `settings.test.ts`, `SettingsPage.test.tsx` and `e2e/settings.spec.ts`. Changed: the migration, CLI, sample data, layout and every-route tests, the menu, app, shell and layout unit tests, `menu.spec.ts` and `quality.spec.ts`. Each new check was shown to fail on code broken for it, with the file put back from a copy after.
- **The clearing steps** below are now one transaction that also resets the company settings, with `DEFAULT`, so their values come from the table. They were run on a throwaway Postgres 16 built from the migrations' Postgres SQL: the records went, the people stayed, the settings went back to B13's defaults with nobody recorded, and a copy broken partway changed nothing. Supabase itself is still to be checked, below.

Where the build settled something or differs from the plan:

- **The company name** has its own check in `company/schemas.py`, not `api.Name`, because `api.Name`'s message is "Enter a name" and B4's is "Enter the company name".
- **B7** now says trailing zeros don't count as decimal places, so 8.8750 is accepted as 8.875, and that .5 and 5. are numbers. Both sides read the rate from its text with one pattern. The backend's check uses no `Decimal` arithmetic, which rounds past 28 digits: a rate of 99 followed by 32 nines after the point would have been saved as 100. That case is in the shared cases.
- **A rate that isn't text or a number,** such as `true` or a list, gets the range message. Ruff's TRY004 wanted a TypeError there, which Pydantic doesn't turn into a message, so it would have been a 500.
- **The page didn't fit at 1280 by 720** at first: it ran 9px past the window. The gap between fields in the panels is now 10px rather than the forms' 14px, and the space under the button 12px. With an error showing, the page grows by a line and can scroll. The rate and terms boxes are short, so % and days sit beside the number, which `settings.md`'s screen now says.
- **The double-press test** in `SettingsPage.test.tsx` presses twice with nothing between. With user-event's double click, the button had time to disable between the clicks, so the test passed even without the guard.
- **`quality.spec.ts`'s Tab walk** now names a box by its `<label>` when it has no `aria-label`, so its new test can name the settings boxes.
- **The ask for a company name** (B14) was first a box on the page color, rounded like the inputs, as the spec's screen said. ui-check's screenshots showed it looked like an empty box to type in, especially in dark mode, so on the owner's say it's now ink text after a Cerulean information icon, with nothing behind it. `settings.md`'s screen and `visual-design.md`'s Information color say so.

`npm run check` passes: 3,248 tests, of which 2,032 backend, 953 frontend, 255 end-to-end and 8 speed, with no unit test taking a second or more.

Checked by hand on temporary databases: the page in Chrome at 1280 by 720 and 1440 by 900, in light and dark mode, with a field error, "Settings saved." after Enter, and the keyboard alone from the menu to Save settings, with a focus ring on each box and no console errors. A second database built only to `0003`, with a record in it, then started with `npm run dev`, kept its record, got the blank defaults, and asked for the company name until one was saved.

Still to do:

- **The project owner, on the shared app** (plan, By hand): `npm start` against Supabase, which runs migration `0004` there, as the next deploy would. Check that the page asks for the company name and shows nobody as having changed the settings, save the real details and see them as a second teammate, and on a Supabase project that still has the sample data, run the new clearing steps. Then, with the owner's go-ahead, the agent checks row-level security on `company_settings` and runs the security advisors through the Supabase MCP server, reporting only.
- **Before merging:** the `products` branch also adds migration `0004`. Whichever merges second renumbers its migration to `0005` and runs the migration tests again, which now fail on two heads (plan, risk 2).

## Running Accountable

Accountable runs two ways:

- **The local copy**, from `npm run dev`, runs on your own computer with made-up data and four made-up teammates. Nothing you enter leaves the computer.
- **The shared app** is the team's Accountable, on Render, with its data in Supabase. Everyone signs in with their own email and password. `npm start` runs the same thing on your computer, against the same Supabase data. [The shared app](#the-shared-app) below says how to set it up.

### Install two things, once

1. **Node**, version 24 or later: get the LTS installer from <https://nodejs.org>.
2. **uv**: follow the steps at <https://docs.astral.sh/uv/getting-started/installation/>.

You'll also need Google Chrome, which is the one browser Accountable is tested with.

### Start the local copy

Open a terminal in this folder and run:

```
npm run dev
```

The first time, this downloads what Accountable needs, so it takes a few minutes and needs an internet connection. After that it starts in seconds and works with no connection at all. When it's ready it prints an address:

```
Accountable is running at http://localhost:5173
```

Open that address in Chrome. Keep the terminal window open while you use Accountable.

It opens on a sign-in screen listing four made-up teammates: Alex Rivera, Dana Whitfield, Theo Brandt and robin@accountable.example, who has no display name. Click one to sign in as them. There are no passwords, because everything here is made up and stays on this computer. Each record shows which teammate added it and who last changed it. The browser stays signed in through refreshes and restarts.

If it says a port is in use, Accountable is probably already running in another window.

The search box in the top bar finds organizations, contacts and deals by any part of their name. The round button at the top right, with your initials, opens a menu with your name, the theme, Company settings and Sign out. Company settings holds the business's details for its quotes and invoices, which come later: its name, address, email and phone, the sales tax, the payment terms, and the prefixes for quote and invoice numbers. The whole team shares one set. The theme can be Light, Dark, or System, which follows your computer's own setting as it changes. This browser remembers your choice.

### Stop it

Click on the terminal window and press Ctrl+C.

### Start again from the sample data, or start with your own

Accountable comes with made-up sample data so you can look around.

- `npm run seed` replaces everything with fresh sample data, and puts back the made-up company's settings.
- `npm run empty` removes every record, so you can type in your own. It leaves the company settings as they are.

Both tell you what will be lost and only go ahead if you type `yes`. Both are safe with the app running: refresh the browser to see the result. Both keep the four teammates, so there's still someone to sign in as. They only ever touch the local copy, never the team's data in Supabase.

### Back up your data

The local copy keeps everything in one file, `data/accountable.db`. Copy that file somewhere safe to back it up. There's no undo, and nothing is backed up for you, so if the file is lost or this folder is deleted, your records go with it.

Records added before sign-in existed show their dates with no name.

### The shared app

The shared app needs a free Supabase project, for the data and for signing in, and a free Render web service, to put it on the web. Set up Supabase first. The steps below use Supabase's dashboard at <https://supabase.com/dashboard>.

#### Set up Supabase, once

1. **Make a project.** Choose the region nearest your team, and keep the database password somewhere safe. Render will need to sit in a nearby region, so note it.
2. **Turn on signing keys.** In Project Settings, open JWT Keys. If the current key is ECC (P-256) or RSA, it's already done. If it says the project uses the legacy JWT secret, click Migrate JWT secret, then Rotate keys. Accountable only accepts tokens signed with these keys, never the legacy secret.
3. **Turn off sign-ups.** In Authentication, under Sign In / Providers, turn off Allow new users to sign up. People get in only when you add them.
4. **Copy three settings into `.env`** in this folder, one per line:

   ```
   DATABASE_URL=postgresql://...
   SUPABASE_URL=https://<project ref>.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   `DATABASE_URL` comes from the Connect button at the top of the project: choose **Session pooler** and put your database password in place of `[YOUR-PASSWORD]`. If the password has characters like `@`, `:` or `/`, they need percent-encoding, so a password of letters and numbers is easier. Use the session pooler, on port 5432, not the direct connection: on the free plan the direct one only works over IPv6, and Render can't reach it. `SUPABASE_URL` and the publishable key are in Project Settings, under Data API and API Keys. The publishable key is safe in a web page. The secret key isn't, and Accountable never needs it.

`.env` stays on your computer: git ignores it, and only `npm start` reads it. `npm run dev`, `npm test`, `npm run seed` and `npm run empty` leave those settings out, so they can't touch the team's data.

#### Add a teammate

1. In Authentication, under Users, click Add user, then Create new user. Enter their email and a password, and leave Auto Confirm User ticked. Give them the password yourself.
2. Supabase's form has no name field, so set their display name in the SQL Editor:

   ```sql
   update auth.users
   set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('display_name', 'Alex Rivera')
   where email = 'alex@example.com';
   ```

   It shows in Supabase's Display name column straight away, and in Accountable once their sign-in next renews, within the hour, or when they sign in again. Without one, Accountable shows their email.

To remove someone, delete them under Users. Their records keep their name.

#### Run the shared app on this computer

```
npm start
```

This reads the three settings from `.env`, stops if any is missing and names it, builds the frontend, and runs the shared app at `http://localhost:8000` against Supabase. It needs an internet connection. Anything you do there is done to the team's real data. Ctrl+C stops it.

The first start against an empty Supabase project builds the tables and fills them with the sample data, all or nothing. Every start checks that row-level security is on for every table, and stops if it isn't, because Supabase's public Data API could otherwise read them.

#### Clear the sample data

When the team is ready to type in its own records, run this in Supabase's SQL Editor. It removes every organization, contact, deal, activity and stage change. It also resets the company settings, so the made-up company is gone: no company name, address, email or phone, Sales tax at 0%, payment terms of 30 days, QT- and INV- as the prefixes, and nobody shown as having changed them. It leaves the people and the tables in place. It's one transaction, so if any part fails, nothing changes.

```sql
begin;
truncate table activities, stage_changes, deals, contacts, organizations;
update company_settings set
  company_name = default, address = default, email = default, phone = default,
  tax_label = default, tax_rate = default, payment_terms_days = default,
  quote_prefix = default, invoice_prefix = default, updated_by = default,
  updated_at = now() at time zone 'utc';
commit;
```

Because it resets the company settings, it's for the start, before the team enters its own company details. Afterwards the Company settings page asks for the company name. New records carry on from the next id, so an old address never opens a different record. There's no undo.

#### Put it on Render

`render.yaml` describes the whole service, so Render needs only a few clicks. It deploys the `main` branch, so do this once this change is merged.

1. **Check two lines in `render.yaml` first.** `region` must be the Render region nearest your Supabase project: `oregon`, `ohio`, `virginia`, `frankfurt` or `singapore`. Render can't move a service once it exists. `TZ` must be the team's time zone, such as `America/New_York`, because it decides what the app counts as today. They're set to Europe/London and `virginia`, for a Supabase project in us-east.
2. In Render's dashboard, click New, then Blueprint, and connect this GitHub repository.
3. Render reads `render.yaml` and asks for `DATABASE_URL`, `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Paste the same values as in `.env`. Render keeps them, and they never go in the file.
4. Apply it. The first build takes a few minutes. The app is then at `https://accountable.onrender.com`, or a similar address if that name is taken, shown at the top of the service's page.

After that, Render deploys `main` by itself each time CI passes on it, and never a commit whose CI failed. If a start fails, for example because row-level security is off on a table, Render keeps the last good version running.

On the free plan, the app sleeps after 15 minutes without visits, and the next visit takes about a minute to wake it. Supabase pauses a free project after a week without use, and restoring it in Supabase's dashboard brings it back with its data.

### Not yet proven

Accountable has only been used on a Mac. It's built to work the same on Windows and Linux. All its checks and tests have also passed on Ubuntu Linux, and CI runs all but the end-to-end and speed tests there on every push, but nobody has used it there yet, or tried Windows at all. Safari and Firefox may work, but only Chrome is checked.

## Running the tests

`npm run check` runs the code checks and then `npm test`. `npm test` runs the type checks and every test: backend, frontend and end-to-end. It takes about four minutes on a 10-core Mac, and ends with a short summary. It keeps going if one part fails, names what failed at the end, and exits with an error. A leftover `.only` in a test also counts as a failure, because it would quietly skip other tests. It uses its own temporary databases, so it never touches your data.

The end-to-end tests run side by side, using a number of workers chosen from your computer's cores and memory, so a smaller computer runs fewer at once and takes longer. To set the number yourself, for example while the computer is busy, run `ACCOUNTABLE_TEST_WORKERS=2 npm test`. The speed tests always run last and alone, so their timings are fair.

You can run the tests in several worktrees at once, with nothing to set. Each run uses ports no other run is using, the runs share the workers between them, and each run's speed tests wait until the others have finished their checks and end-to-end tests, printing a line while they wait. So two runs together take longer than one, but both get a fair result.

Each run leaves a report of the end-to-end tests, with a screenshot of each failure. `npx playwright show-report playwright-report/main` opens it, and `playwright-report/speed` has the speed tests'. CI on GitHub doesn't run the end-to-end tests, so run `npm run check` yourself before merging.
