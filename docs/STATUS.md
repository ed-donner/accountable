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

The third run was on `company-settings`, after its review, which found nothing Important. It used the review, the person's messages, the Stop hook's results and the agents' shell commands from the branch's three sessions, and searched the sessions of earlier changes for the same commands. The Stop hook never failed, and the checks caught only type errors in the new code, fixed during the build. Three mistakes had happened more than once:

- **Stopping the app by name:** agents stopped `npm run dev` with `pkill -f scripts/dev.mjs` on `mvp`, `dark-mode`, `multi-user` and four times on this branch. That stops every copy of the app on the computer, the person's own and other worktrees' included. Nothing else was running each time here, but `products` started its own app 11 minutes after the last one. `AGENTS.md` now says to stop a server by its process ID. A hook could stop `pkill`, but not `kill $(pgrep ...)` and the other ways to do the same, so it's a rule.
- **Runners of their own for the end-to-end tests:** Playwright refuses to start without the database and slot `npm test` sets up, so on `mvp`, `multi-user` and this branch, agents wrote scripts of their own to run a few spec files, copying that setup. `npm run e2e -- <files>` now does it, taking Playwright's own arguments, and `AGENTS.md` says to use it. Tried on `e2e/settings.spec.ts` alone, with `-g`, and with a name that matches nothing, which fails.
- **A slow-test list from a shared run:** twice on this branch, `npm run check` listed unit tests as taking a second or more while another worktree's run was going, 1 and then 25, and the agent ran them again alone to show each was quick. The summary now says under that list when another run was busy while the unit tests ran. `scripts/test-report.test.mjs` tests it, and fails with the note taken out.

Two mistakes seen once are now in `docs/IMPROVE.md`: a message that looked like a box to type in, and a review finding the request couldn't reach. "Leave the commits to me" was said in three sessions again, and no agent committed. `docs/IMPROVE.md` now says that a change's sessions can be in more than one folder, that another copy of the repo can hold a branch with the same name, and to search earlier changes' sessions for a mistake before calling it new.

`npm run check` passes, with 3,249 tests. It ran while another worktree's tests were going, and its summary listed 23 unit tests as slow, with the new line under them.

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

- **reviewer** reviews a branch, a commit or a range against `docs/REVIEW.md` and reports Important findings and nits. It runs on Sonnet. A hook in its file lets its shell run only commands that read, such as `git diff`, `git log`, `git show`, `git grep`, `grep` and `sed -n 40,100p`, and stops anything that could write, such as `git checkout`, a redirect into a file or `$( )`.
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

## Products: design

On the `products` branch, `docs/spec.md` and the area files now describe Accountable with the price list in it, as it will be once the branch merges. The intent and its decisions are in `docs/changes/products/intent.md`. One area file is new: `docs/specs/products.md`, with G1 to G12. No code has changed yet. The project owner agreed the points below, and the choices in the spec that the intent left open: archiving without asking first, with Restore on its message, the count on Show archived, the message when only archived products match a search, the message for a name an archived product has, prices from $0.00 to $1 trillion, a 405 for deleting a product, and `name_key` for the unique check.

- **Search spans two areas:** the top bar's search moves out of `crm/` to the top level on both sides, as `backend/accountable/search.py` and `frontend/src/components/Search.tsx`. Each area says what to look for and how its results look, so `crm/` and `products/` never import each other.
- **The top bar:** measured on the local copy at 1280px, the bar had 75px to spare and a Products link takes 108px. With one added, the date wrapped onto two lines. The search box goes from 240px to 180px, which leaves about 17px to spare even with the widest date, such as Nov 30, 2026.
- **Archived chip:** a new color token, Sea Mist in light mode and `#3B5862` in dark mode, because ink on the Line token's dark value is only 4.37:1.
- **Q1** now includes 500 products, so the stress run covers the Products table.
- **For the build:** the run instructions below described search without products, and the SQL under Clear the sample data needed `products` added once the table existed. The build did both.

The build plan is in `docs/changes/products/plan.md`, in four phases. First, search moves to the top level with no visible change. Then come products on the backend, products on the frontend, and the end-to-end tests. It ends with the build. The plan adds three things the spec doesn't say yet, which the build puts in the spec: a top-level `sample.py` for what both areas' sample data share, `name_key` normalized as well as casefolded, and field messages chosen by area.

## Products: build

Built on the `products` branch, following `docs/changes/products/plan.md` through its four phases, each ending with `npm run check:quick` passing. Products is the sixth section: a price list with unit prices in whole cents, unique names, Archive and Restore, a page for each product, and the top bar's search finding active products. Migration `0004` adds the `products` table with no rows, so an existing local copy and the team's Supabase database start with an empty Products section. Every new test was seen to fail by breaking a copy of the code it covers, then putting the copy back.

- **Search moved first, unchanged:** `backend/accountable/search.py` runs the one query over the kinds each area's `search.py` gives it, and `frontend/src/components/Search.tsx` takes its groups from `App.tsx`. `test_search.py` and the moved `Search.test.tsx` passed with nothing they expect changed, and a new cap holds `/api/search` to one query. The plan had each area's select name its own `kind`. The top level adds it instead, from the kind's name, so the two can't disagree.
- **In the spec now:** `sample.py`, in the file tree and the layout rules. `name_key` in NFC form as well as casefolded, in `backend.md`. Field messages picked by the area whose route a request reached, in the layout rules: a product's bad description gets "Check this field", not the CRM's "Enter a description".
- **Also in the spec now:** the archived message stays 10 seconds, in G9, and focus moves to the table's search box when Archive takes a row out, in G10. The plan had the Products page move focus. The shared table does it instead: a row that leaves the table while it has focus hands focus to the search box, once the row has gone, and only if focus fell to the page. The page would otherwise need a handle on the table's search box. `quality.spec.ts` now names N1 in `testing.md`, for its check that the top bar stays on one line.
- **Found by the end-to-end tests:** the Show archived box unticked itself for a moment after a click, because the real app's router updates the address a moment later, and the box was drawn from the address. The unit tests' router updates it at once, so they passed. The box now keeps its own tick and follows the address when something else changes it, as the table's search box already keeps its own text.
- **Test helpers:** `holdSaves` moved from `crm/forms/forms.test.tsx` to `test-utils.tsx`, for the products tests to share. `test-setup.ts` now dismisses Sonner's messages after each test, because Sonner hands a new `Toaster` every message still showing, so one test's "Product archived." turned up in the next. It also fills in jsdom's missing `setPointerCapture`, which Sonner calls when its message is pressed.

`npm run check` passes: 3,245 tests in 4m 05s, with no unit test at a second or more. At the limits, Products opens in 123ms with 500 products, the top bar's search shows its results in 195ms, and the dashboard's data arrives in 26ms. The first full run failed one end-to-end test, `data.spec.ts`'s check after `npm run empty`: the Pipeline's "No deals yet" took more than its 5 seconds to show, though the screenshot shows it there. That step isn't changed on this branch, the test took 11 seconds in the full run against 3 on its own, it passed twice on its own, and the next full run passed. So it looks like the copy that test starts being slow under the run's load, and it may come back on a busy machine.

After the build, `npm run check` failed once more on `data.spec.ts`, in another place: the copy that its `npm run empty` test starts didn't come up within the 60 seconds `startCopy` allows, while another worktree's run had the load average at about 50 on 10 cores. The limit wasn't raised, and the next run passed. ui-check then found nothing broken or off-brand on the products pages, in light and dark, and on the CRM pages next to them. It had two nits: on a product's page, a long email in "Last changed by" pushes the year onto a second line, as on every record page; and three 401s showed on the first load, before sign-in, and none after.

Still to do: the walk on Supabase.

## Products: review

The reviewer found one Important gap: no test checked that the "Product archived." message stays up for 10 seconds (G9), so dropping its `duration` would have put it back to Sonner's 4 seconds with every test still passing. `Products.test.tsx` now checks the message asks for 10 seconds. It was seen to fail with `duration` taken out of a copy of `products/queries.ts`, then the copy was put back. The review's nits are left as they are: a failed Archive is tested end to end from the product's page only, the price message has unit tests only, two Escape presses in `products.spec.ts` have no wait between them, and the table's count of hidden matches ignores filters, which no table uses alongside hidden rows yet.

`npm run check` passes: 3,246 tests in 7m 27s, longer than usual because another worktree's run was going at the same time. The first run failed one end-to-end test, `quality.spec.ts`'s walk through every screen: it ran out of its 30 seconds while opening an organization's page, after visiting the six sections. The next run, with nothing changed, passed it in 8.8 seconds. The cause isn't known. Like the `data.spec.ts` failure in the build, it may come back on a busy machine.

## Products: harness improved

`docs/IMPROVE.md` was followed after the review fixes. The review's four nits are still open, for later. This run used the review, the owner's messages, the Stop hook's results, the calls that hooks stopped and the agents' shell commands, from the branch's three sessions and their subagents, and searched the sessions of earlier changes for the same mistakes. The owner corrected nothing. They said "Leave the commits to me" three times, and no agent committed. The Stop hook never failed.

It also looked at `company-settings`, which isn't merged and has its own harness changes in `c87c78b`. That branch already adds `npm run e2e` for running chosen end-to-end tests, which this branch's build needed (it wrote a runner of its own in `/tmp`). It also adds the rule to stop a server by its process ID, and the note about slow unit tests while another run is busy, so this run doesn't repeat them. Five mistakes had happened more than once:

- **The reviewer's `sed -n` stopped:** the reviewer's shell hook stopped `sed -n 40,100p` and the like 8 times, on `multi-user`, on `company-settings` in two copies of the repo, and 3 times here. In its first pass here, the reviewer left the end-to-end tests, the table rewrite and the search move unread after two were stopped. The hook now lets `sed -n` through when it prints one range of lines, and still stops `-i`, `w`, `e` and every other sed command. Its message no longer offers the Grep and Glob tools, which this Claude Code doesn't have, and points to Read with an offset instead. Of the 13 reviewer commands the hook stopped in the logs, 10 would now run, and the other 3 are `for` loops. `agent-hooks.test.mjs` fails with sed stopped again, and with every sed let through.
- **A bare `python3`:** agents ran `python3` themselves 24 times: 10 on `mvp`, 6 on `multi-user`, 4 on `dark-mode`, once on `prepare`, twice on `company-settings` and once in this branch's build, though the owner asks for `uv run`. A new hook, `scripts/agent-guard-uv.mjs`, stops `python`, `python3`, `pip` and the like where a command starts, and skips quoted text and heredoc bodies. Of the 3,963 shell commands in the logs, it would have stopped 24, each a real run of `python3`, and none that used `uv run`. Its tests fail with the heredoc or quote handling taken out, with it never stopping, and with it stopping every mention of python. It stopped a bare `python3` in this session.
- **A finding the request can't reach:** on `company-settings`, the reviewer said a 5,000-digit tax rate would get an odd message, though the JSON parser refuses it first. Here it said a NUL in a product's name might reach Postgres, though `api.Request` refuses it in every text field. `docs/REVIEW.md`'s Bugs pass now says to follow an input from the request through the framework's parsing and the shared checks before saying what the code does with it.
- **Staging with git:** on `prepare`, an agent moved a file with `git mv` and then ran `git reset` to unstage it. Here, the build deleted one with `git rm` and did the same. A `git reset` on a file also unstages whatever the owner had staged in it. `AGENTS.md` now says to use `mv` and `rm` and leave git's index as it was. A hook could stop `git mv` and `git rm`, but `git add`, `git apply --index` and others stage too, so it's a rule.
- **An end-to-end failure explained without the slow step:** the build's first `data.spec.ts` failure was put down to load, and the review fixes' `quality.spec.ts` failure was left unexplained. Both times the rerun replaced the report, which keeps every step's time. The passing run's report shows that test's steps at about half a second each, so the failed run's report would have shown which step took the 30 seconds. `AGENTS.md` now says to find that step before running the tests again, and where the report keeps it.

One mistake seen once is now in `docs/IMPROVE.md`: a review cut short. `docs/IMPROVE.md` now says that a stopped tool call is in the call's result with `is_error` set, and to check the harness changes on branches not yet merged. The ui-check run, the build's second check failure and two lines that were out of date are now in this file, above.

**For the merge:** both branches change `AGENTS.md`, `docs/IMPROVE.md`, this file, `docs/specs/testing.md` and `docs/specs/architecture.md`, so the second to merge will need the other's lines kept as well. Once both are in, take `company-settings`'s Seen once entry "a finding the request can't reach" out of `docs/IMPROVE.md`, because `docs/REVIEW.md` now has it as a rule.

`npm run check` passes: 3,279 tests in 4m 54s, the 33 new ones being the hooks'.

## Products: independent review fixes

`docs/changes/products/independent-review.md` found two Important problems and one nit. Both Important ones are fixed. Each was reproduced before the fix, and each new test was seen to fail with the fix taken out of a copy of the file, then the copy was put back.

- **A message, and its Restore button, outlived its session (U5).** Sonner keeps its messages for the whole page, and hands those still showing to the next `Toaster` that starts. So after Alex archived a product, signed out and Dana signed in, Dana saw "Product archived.", and its Restore changed the product through Alex's dropped cache, leaving Dana's table out of date. A save whose reply came after sign-out showed its message to the next person too, and that held for every message, not only products'. Two new tests in `Products.test.tsx` failed on the old code, one for each case.
  - `SignedIn` now takes away every message still showing when a session ends, before the next session's `Toaster` starts.
  - Every message now goes through `useNotify` in the new `lib/notify.ts`, which shows it only if the session the component began in is still going. All twelve places that showed a message use it, the CRM's included, and `showSaveError` takes the form's notifier with its other parts.
  - ESLint now refuses `toast` from Sonner in `frontend/src` outside `lib/notify.ts` and the tests, so a new message can't bring this back.
  - Two CRM tests, for a pipeline move still on its way at sign-out, had waited for that move's message to show in the next person's session, which was this bug. They now wait for the move to finish in Alex's own cache, and check the next person sees no message.
- **A long product name was a 500 on Postgres.** The unique index on `name_key` holds the whole key, and Postgres refuses an index entry over 2,704 bytes. That refusal isn't a duplicate, so the API let it through as a 500. SQLite has no such limit, so no test could show it. On a throwaway Postgres 16 in a scratch folder, the review's 8,192-character name was refused, random keys were stored up to 2,690 bytes and refused from 2,700, and the longest key a 200-character name can make, 2,400 bytes, was stored. The cluster was stopped and removed afterwards.
  - A product's name now has 200 characters at most (G2), with spaces at the ends not counted. Past that, the API and the form say "Keep the name to 200 characters or fewer" beside the name, on add and rename. zod already counts characters as Python does, where JavaScript's `length` counts an emoji as two.
  - No character's key is more than 12 bytes, so 200 are at most 2,400. `test_products.py` checks that against `INDEXED_KEY_BYTES`, by finding the character whose key is longest, in 0.2 seconds, so raising the limit past what Postgres can index fails a test.
  - Migration `0004` is unchanged.
- **Left open, for later:** the nit, that "two saves of one name at once" in `docs/specs/testing.md` is tested by taking the check out and saving twice in a row on SQLite, not by two connections at once or on Postgres.

`npm run check` passes: 3,285 tests in 4m 03s, with no unit test at a second or more.

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

- **The project owner, on the shared app** (plan, By hand): `npm start` against Supabase, which runs migration `0005` there, as the next deploy would, after the products' `0004` if that hasn't run yet. Check that the page asks for the company name and shows nobody as having changed the settings, save the real details and see them as a second teammate, and on a Supabase project that still has the sample data, run the new clearing steps. Then, with the owner's go-ahead, the agent checks row-level security on `company_settings` and runs the security advisors through the Supabase MCP server, reporting only.
- **Before merging:** done in the merge with `main`, below: this branch's migration is now `0005`.

## Company settings: review

The reviewer subagent reviewed the branch against `main`, leaving out style. It found nothing Important, and `npm run check` passed afterwards, with 3,248 tests. Three nits are open, for the review fixes:

1. **No test for the save lock:** nothing fails if the read before a save moves outside `db.writing()`, which B5 and the plan's risk 7 rely on.
2. **The clearing steps aren't tied to the table:** a column added to `company_settings` later could be left out of the clearing SQL below with no test failing.
3. **The seed prompt** doesn't say how much of the settings it replaces.

A fourth, that a 5,000-digit tax rate gets an odd message, was dropped: Python's JSON parser refuses it first, and FastAPI answers with a 400 before the check runs.

## Company settings: independent review

`docs/changes/company-settings/independent-review.md` found two Important problems, both now fixed. Each new test failed on the code before its fix.

1. **A pending save threw away what was typed meanwhile.** Only Save settings was disabled during a save, and when the save came back, the form was reset to what had been sent, so a box changed in the meantime went back without a word. A test that holds the save, types a new phone number and then lets the save finish showed the old number. The page now keeps anything changed since Save settings was pressed, still to be saved, so a teammate's save can't replace it either (B10), and the other boxes show what was saved. B8 says so. The new test in `SettingsPage.test.tsx` also fails if the kept change isn't left unsaved.
2. **A rate sent as a JSON number was rounded before it was checked.** FastAPI reads a body with Python's JSON reader, which makes 8.8750000000000001 the float 8.875, so it was saved as 8.875, 100.000000000000001 as 100, and 1e-999999999 as 0. The plan's risk 4 assumed a float keeps what was sent. The settings' routes now use `api.ExactNumbersRoute`, which reads a number with a point or an exponent as a `Decimal` with every digit, and the rate's check reads that from its digits and exponent, without writing it out in full or rounding it. New tests in `test_company_settings.py` send the JSON as text, because a Python float would lose the digits before the request went. They fail again with the route class taken out. Other routes read their bodies as before.

The review's third point, that no test overlaps two saves to prove the read and check happen under the write lock, is the same as the first nit of the review above, and is still open.

## Company settings: merged with main

`main`, with Products in it, was merged into `company-settings`. What the merge settled:

- **Migrations:** both branches added `0004` on top of `0003`. Products merged first, so this branch's migration is now `0005_company_settings.py`, with `down_revision = "0004"`, and its upgrade test starts from a database at `0004`, as the team's will be. No database that lasts had run the old `0004`: neither this worktree nor the main checkout has a `data/accountable.db`, and Supabase hadn't been upgraded yet (Still to do, above).
- **Field messages:** `main.py` picks the messages of the area whose route a request reached, as Products made it, and a request to `/api/settings` gets the company's. Their names no longer have to differ from every other area's, so the test for that is gone, and so is the comment in `company/schemas.py` that said so.
- **Layout rules:** `test_layout.py` finds each area by its `tables.py`, as Products made it, so it finds `company/` too. `company/` is the one area others may import, so it's left out of the check that no area imports another. `architecture.md`'s layout rules say so.
- **Messages:** the Settings page shows "Settings saved." and its errors through `useNotify`, as every message now must (U5), and its test uses the shared `holdSaves` in `test-utils.tsx` in place of its own copy. The App test's and `settings.spec.ts`'s counts of top bar links on `/settings` are 6 now, with Products. The first full run after the merge failed `settings.spec.ts` on that count, which still said 5.
- **Sample data and clearing:** `cli.fill_sample` fills the CRM, the products and the sample company. The clearing steps truncate `products` too, inside the transaction that resets the settings.
- **Harness:** `docs/IMPROVE.md` keeps both branches' changes. As Products' note for the merge asked, the Seen once entry "a finding the request can't reach" is out, because `docs/REVIEW.md` now has it as a rule.

`npm run check` passes: 3,659 tests in 4m 17s, of which 2,276 backend, 1,102 frontend, 272 end-to-end and 9 speed.

## Prepare: shared code for quotes, invoices and bills

Done on the `prepare` branch, before three developers build quotes, invoices and bills side by side. It makes once what two or more of them would each have made or changed in shared code. The PDFs and the dashboard's Money section stay with the features, to be brought together after the merges. The app does what it did, apart from the top bar below 1536px wide, which the owner asked to change.

- **Imports between areas go one way:** a later area may import the CRM's and the products' tables and the CRM's stage rules on the backend, and their `queries.ts` and the CRM's `deals.ts` on the frontend, and any area may import `company/`. The CRM and products never import a later area, and later areas never import each other. `test_layout.py` now reads imports with `ast`, so it can tell `crm.tables` from `crm.routers`.
- **One list of areas in `main.py`:** each area's routers, field messages, search kinds and holds, so a later area joins with one entry. A field error gets the messages of the area its route starts with, and `test_layout.py` checks no two areas' routes start with the same word.
- **Held records (D4):** an area says which of its columns hold a deal or an organization, as a `Hold` in `holds.py`. The CRM's delete routes read every area's holds from the app, refuse a held record with a 409, and list what holds it in `delete-impact`'s new `held_by`, always empty for now. Its dialog then says what holds it and offers only Close.
- **Panels and sections (R7, H10):** `App.tsx` hands the deal and organization pages the panels later areas add, and the dashboard the sections, each list empty for now. None of the Money section is built.
- **The top bar (N1):** `App.tsx` gives the shell its sections. Below 1536px wide the links drop their icons and have 8px either side rather than 12px, so nine fit at every width from 1280px. At 1440, the design reference's width, they now show their labels alone.
- **Quote and invoice numbers (B15):** `number_counters`, from migration `0006`, and `take_number` in `company/documents.py`, with `current_settings` for the details and tax. `npm run seed`, `npm run empty` and the clearing steps start each count again at 1.
- **Sums (B16, B17):** `company/tax.py` and `company/tax.ts`, with `shared/totals-cases.json`. Quantities are whole numbers from 1 to a million, and a subtotal is at most $1 trillion.
- **Seed and empty:** the wipe takes every table but the people's and the settings' from the metadata, each before the tables it points at, so a later area's tables are wiped without anyone listing them. Each area's `tables.py` gives the records the message counts, as `RECORDS`.
- **Downloads:** `download()` in `lib/api.ts`, for the PDFs, with the token in its header.
- **Charts:** `ChartTooltip`, `useSize`, the axes' text and `niceTop` moved to `components/charts/`, and the 12 months to `months.py`.
- **Status chips:** `visual-design.md` agrees each document status's chip, all from tones `Chip.tsx` already has.

Where the build settled something:

- **The icons start at 1536px, not 1440.** Measured in Chrome with three links added in the page for Quotes, Invoices and Bills, and the widest date, Nov 30, 2026. At 1280 with a 15px scrollbar, nine leave 29px to spare at 8px padding, and none at 10px. At 1440, nine with icons and 12px would need 1,466px of bar where the bar has 1,385, 81px over, so on the owner's say the icons start at 1536px. There, nine need 1,485px: with no scrollbar they leave 12px to spare, and with a 15px scrollbar the menu button sits 15px from the bar's end rather than 18px, with nothing running over. Between 1280 and 1535 they have more room the wider the window, up to 284px. `quality.spec.ts`'s check that the top bar stays inside itself at 1280 will catch an overflow as soon as the sections merge.
- **The tax sums go through BigInt in the browser.** Two cases in the shared file, found by search, are half cents on a subtotal past $900 million where plain JavaScript numbers give a cent less.
- **Routes outside any area,** such as `/api/search`, now get no area's field messages, where they used to get the CRM's. None of their fields is one the CRM's messages name, so every message is the same.
- **`cli.fill_sample`** still calls each area's fill in turn, with a comment on the order, because the company's fill takes the moment and the others the day.
- **The frontend layout test** at first checked only who imports the CRM and the products, so the CRM importing a later area went unnoticed. A check of what the first areas import was added after a made-up later area showed it.
- **Migrations:** each feature's migration will be the next after `0006`, so the second and third merges renumber theirs, which `test_the_migrations_have_one_head` makes sure of.
- **On Postgres:** a throwaway Postgres 16, built from the migrations' Postgres SQL, made `number_counters` with row-level security on and the unique index on `kind`, and the clearing steps below, run on it with a record, a product, both counts and a person in it, left only the person, no counts and the blank settings.

Each new check was shown to fail on code broken for it, from a copy of the file put back after: the hold check left out of the deal delete, the counters kept by seed and empty, Python's `round()` and tax line by line on both sides, two areas sharing a route's start, one count for both kinds, a held dialog still offering Delete, the panels and sections not drawn, a download that keeps its file, the icons at every width, and made-up later areas on both sides importing what they mustn't.

`npm run check` passes: 3,800 tests in 4m 28s, of which 2,355 backend, 1,163 frontend, 273 end-to-end and 9 speed.

## Prepare: test runs take turns

Done on the `prepare` branch, so that three or four agents, each in its own worktree, can each run `npm run check` or `npm run check:quick` when they finish a piece of work. Until now every run started its checks straight away, waiting only for another run's speed tests, and shared the workers out between the runs that were busy. Three at once got 2 workers each, next to three sets of unit tests, and the owner saw tests time out on a 10-core Mac.

- **Two turns:** a run waits for a turn before its checks and holds it through its end-to-end tests, by listening on the turn's port, 24113 or 24114. They come after every worker's ports, so no port from before moved. `TURNS` in `scripts/test-plan.mjs` is 2.
- **A queue:** each waiting run says on its slot's port when it started waiting, and tries for a turn only when fewer runs are ahead of it than turns are free. So runs go first come, first served, whatever their slots, and the port settles two tries at the same moment.
- **Speed tests first:** a run that has finished its end-to-end tests says so on its slot's port, then gives back its turn. Waiting runs don't take it until every run at that stage has had its speed tests. Without that, a run waiting for the speed tests' turn could lose the turn it gave back to a waiting run, and wait out that run's whole check.
- **Saying so:** a waiting run prints why, such as "Waiting for a turn. 2 test runs at a time can go on this computer, and 1 other test run is ahead of this one.", once the reason has lasted two looks, a quarter of a second apart. The trial below printed "2 other test runs are ahead" and then, a moment later, "this one is next", because the other two had joined the queue a few milliseconds earlier and were taking the free turns. Once its turn comes it prints how long it waited.
- **The Stop hook** now has 30 minutes rather than Claude Code's default of 10, in `.claude/settings.json`, because its `npm run check:quick` can wait behind two runs of `npm run check`.
- **`AGENTS.md`** says to let a waiting run wait, and to start `npm run check` in the background or with the longest timeout a shell tool allows, because the wait can outlast the tool's limit.

Proved by starting `npm run check` in three new worktrees in `.claude/worktrees/` at the same moment, with a script sampling every quarter of a second what each run said on its slot's port and who held the turns. It never saw more than two runs busy or more than two turns held. All three passed every test, 3,806 each:

- **The first two** took the turns at once, had 3 workers each and passed in 6m 36s and 7m 01s. Their end-to-end tests ended two seconds apart, and their speed tests went one after the other.
- **The third** printed "Waiting for a turn. 2 test runs at a time can go on this computer, and this one is next.", then "Waiting for the speed tests of another test run on this computer." once the first two reached theirs, and didn't take either turn they gave back. It got a turn after 7m 01s, had all 6 workers to itself, and passed in 10m 59s, of which its end-to-end tests took 2m 24s, where the first two's took 4m 42s and 4m 44s.
- **The speed figures** were the same whether a run had shared the machine or not: the dashboard's data in 23 to 25ms, the top bar's search in 195 to 196ms, and the worst task in each drag at a median of 70 to 75ms, with none over 184ms.

A trial the same way, before the change to when a waiting run speaks, also passed in all three, in 6m 24s, 6m 50s and 10m 39s. That was where the early "2 other test runs are ahead" line turned up.

Each new check in `scripts/test-runs.test.mjs` was shown to fail on a copy of `test-runs.mjs` broken for it, put back after: no queue order, free turns counted without the busy runs, no turn ports, the speed tests first only while their port is held, none of the speed tests first, and every reason printed at once. Several of them rely on timing, so the file was run 13 times on the working code and passed every time, and the two breaks most open to chance were tried again: the speed tests' place failed six times in six, and every reason printed at once three times in three.

## Bills: build

Built on the `bills` branch, following `docs/changes/bills/plan.md` through its six phases, each ending with `npm run check:quick` passing and the last with `npm run check`. Bills is the seventh section: the bills the business receives from suppliers, each with the supplier's own bill number, a bill date and a due date, an amount, the tax, a category and notes, marked paid on a date or unpaid, with overdue worked out from today. An organization's page lists its bills, and an organization with bills can't be deleted. The dashboard has a Money section below its own part: what we owe, what's overdue, a timeline of the bills due in the next 30 days, and spending by category for 12 months. Migration `0007` adds the `bills` table with no rows, so an existing local copy and the team's Supabase database start with an empty Bills section. The sample data adds six suppliers and 85 bills. Every new test was seen to fail by breaking a copy of the code it covers, then putting the copy back, never through git.

The six points the plan said the build would settle are in the spec now:

- **Spending is folded into months in Python,** from one query for the 12 months' bills, as the CRM's revenue chart does, because grouping by month in the database needs date functions that differ between SQLite and Postgres. In `backend.md`.
- **The Money reply carries `today`,** so the section reads its figures again once the browser's day has passed it. In the API table in `backend.md`.
- **Each Money chart has a table behind it for screen readers:** the bills due, and each month's spending by category. In E22 and E23.
- **Focus after a row leaves the table** goes to the table's search box (E13). Mark unpaid under Paid works as Archive does. Mark paid goes through a dialog, which found something wider: these dialogs open without a Radix `Dialog.Trigger`, so on closing, Radix puts focus nowhere. `FormDialog` now takes `onCloseFocus`, and the Mark paid dialog uses it to go back to the button that opened it, or to the search box, through a `ref` on `DataTable`, when that row has gone. The other forms still leave focus on nothing when they close, as they did before. In `frontend.md`.
- **Row buttons' labels** read "Mark paid bill INV-0042 from Northwind Software", in the table's pattern. In the Bills table screen.
- **"Show all bills"** is in the Words table.

Also settled by the build, and in the spec:

- **`bills/categories.tsx` and `bills/status.tsx`** rather than `.ts`, because they hold the swatch and the chip. In the file tree and `frontend.md`. `status.tsx` also has the paid date's checks, which the form and the Mark paid dialog share.
- **A blank date in the Mark paid dialog** gets "Choose a paid date", which the spec didn't have. In the Words table, with "Keep the bill number to 50 characters or fewer", which the spec had in E3 only.
- **The filter's counts** read "Unpaid (9)", with a space, as the Words table has them, where Contacts' filter reads "Lead12".
- **Buttons keep their place** in a row and in the record header, so when Mark paid becomes Mark unpaid, focus stays on the same button.
- **A bill dated in the calendar's last 30 days** is due on its last day, rather than a crash. A supplier that doesn't exist gets "Choose a supplier" before the database's foreign key can make it a 500, and every problem with a save comes back at once. In `backend.md`.
- **The timeline** stacks a day's bills in layers, each bar colored by its own bill, and both charts draw their segments with `StackSegment`, for the 2px gaps and rounded tops. Recharts didn't fight it, so there's no hand-drawn SVG.

Changes the plan didn't list:

- **`e2e/dashboard.spec.ts`** checked that the dashboard page didn't scroll at all, which can't hold with a section below it. It now checks that the dashboard's own panels fit 1440 by 900 and that the Money section fits a window of its own below them, as H10 and the Money section's screen say.
- **`frontend/src/layout.test.ts`** named the areas it finds, so it names `bills` now, and checks the later-area rule is looking at `bills/`. `test_layout.py` does the same on the backend.
- **The Tab test in `menu.spec.ts`** walks seven section links, not six, and `settings.spec.ts` counts seven links in the top bar. The first full `npm run check` found the second.
- **`failures.spec.ts`** also covers the dashboard's Money section failing to load and keeping old figures, and a bill that isn't there.

On Postgres: a throwaway Postgres 16, built from the migrations' Postgres SQL, made `bills` with row-level security on, the unique index on `(organization_id, bill_number_key)`, the category check and `bigint` amounts. With a person, an organization, a bill, a product and a count in it, it refused a second "inv-1" from the supplier, a category of "rent" and the organization's delete. The old clearing steps failed with "cannot truncate a table referenced in a foreign key constraint" and changed nothing. The new ones, with `bills` in the same `truncate`, left only the person and the settings' row.

**What the quotes and invoices merges will touch:**

- **The migration's number:** each branch adds the one after `0006`, so the second and third merges renumber theirs, which `test_the_migrations_have_one_head` makes sure of.
- **The lists each area joins with one entry:** `AREAS` in `main.py`, `RECORDS` and `fill_sample` in `cli.py`, the imports in `migrations/env.py`, and in `App.tsx` the sections, routes, `ORGANIZATION_PANELS`, `DEAL_PANELS` and `DASHBOARD_SECTIONS`.
- **The Money section** is one component with two panels, Bills to pay and Spending by category, in `bills/charts/MoneySection.tsx`, so invoices' panels can join it there when the areas are brought together.
- **Shared code bills changed, all with new optional props:** `DataTable` takes a row's own button and Delete together, a `filterNote`, and a `ref` that focuses its search box. `RecordHeader` takes an `action` and `onDelete` together. `FormDialog` takes `onCloseFocus`.
- **Tests that count sections or Tab stops:** `App.test.tsx`, `start.spec.ts`, `settings.spec.ts`, `menu.spec.ts`'s Tab test, and `quality.spec.ts`'s Tab counts and its check that the top bar stays on one line at 1280px, which will need the merged count.
- **The clearing steps** gain each area's tables in the same `truncate`.

`npm run check` passes: 4,296 tests in 5m 36s, of which 2,714 backend, 1,281 frontend, 290 end-to-end and 11 speed. At the limits, Bills opens in 133ms and the Money section's data arrives in 8ms. Two unit tests read 1.1s while another test run on the computer was busy: the paging test in `DataTable.test.tsx`, which bills didn't change, and one case of the amount checks in `test_bills.py`. Alone they took 340ms and under 40ms.

## Bills: UI check

ui-check looked at the Bills table under each filter, a bill's page overdue, unpaid and paid, the Add, Edit, Mark paid and Delete dialogs, a supplier's and a customer's page with the Bills panel, the dashboard's Money section with both tooltips, and the top bar at 1280px, at 1440 by 900 on a scratch database. It covered light mode throughout and dark mode for most of them, and found nothing broken or off-brand.

Of its three nits, one is fixed. The due dates in an organization's Bills panel started a few pixels apart from row to row, because "Dec 1, 2026" is shorter than "Oct 31, 2026". The date now takes the width of the longest one, as the total and the chip already had fixed widths, and stays on one line. That's in the Bills panel's screen in `bills.md`. The panel's test in `e2e/bills.spec.ts` now gives two bills due dates of different lengths and checks they start at the same place. It failed by 7px before the fix. The other two are left as they are, at the owner's word: a dark-mode dashboard screenshot caught the revenue line's draw-in partway through, and the Mark paid dialog's label "Paid on" is the spec's.

## Bills: review

The reviewer subagent reviewed the branch against `main`, leaving out style. It found nothing Important, so there was nothing to fix, and `npm run check` passed afterwards: 4,296 tests in 7m 49s, with another test run busy. Two nits are open, for later:

1. **The Add form's due date at the calendar's end:** `dueDateFor` in `BillForm.tsx` adds 30 days with no limit, where the API's `due_date_for` stops at 9999-12-31. A bill dated in the last 30 days of 9999 would get a filled-in due date that the API refuses. The API's own default is right.
2. **`BillUpdate` defaults `notes` and `paid_on` to `None`**, where its other fields default to `MISSING`. That's safe because `edit_bill` reads only the fields that were sent, and the CRM's update models do the same. A caller that dumped the whole model would clear both.

The review left part of the change unread: the charts, the `DataTable`, `RecordLayout` and `FormDialog` changes, the end-to-end specs and most test bodies. A second pass over those, under the reviewer's new instructions below, hasn't been run.

## Bills: harness improved

`docs/IMPROVE.md` was followed after the review, which had nothing to fix. This run used the review, the owner's messages, the Stop hook's results, the failed and stopped tool calls and the agents' shell commands from the branch's three sessions and two subagents. It searched the sessions of every earlier change, in all four copies of the repo, and of `quotes` and `invoices`, for the same mistakes. The owner corrected nothing. They said "Leave the commits to me" three times, and no agent committed. The Stop hook ran 12 times and never failed. The build ran a bare `python3` once, which the uv hook stopped, and a `sleep 240`, which Claude Code stopped. It ran the app and a throwaway Postgres on scratch data, stopped both by process ID and checked their ports, used git only to read, and broke code only from its own copies.

Three mistakes had happened more than once:

- **A review that leaves part of the change unread:** on `products`, the reviewer left the end-to-end tests, the table rewrite and the search move unread, which was in Seen once. Here, with no command stopped, it made 8 calls and left the charts, the `DataTable`, `RecordLayout` and `FormDialog` changes, the end-to-end specs and most test bodies unread. A `company-settings` review in another copy of the repo skimmed the tests by name. Each said what it skipped. `reviewer.md` now says to read the diff of every file in `--stat`, in parts if it's long, to use Read when the hook stops a command, and to go back through the list before the report. The report now has a Not read line, and `testing.md` says so.
- **A test count the plan didn't list:** a new section changes the number of top bar links that five test files state. The `company-settings` merge, this branch's plan and the plan for `quotes`, built alongside, all missed the one in `e2e/settings.spec.ts`, and each time only the full `npm run check` found it. `AGENTS.md` now says to search all the tests for what a change alters, and list each one in the plan. Whether five tests should each state the count is for the owner to judge against STANDARDS.md's "Avoid brittle tests", once the three branches have merged.
- **Shell commands written for bash:** the shell is zsh. In the sessions of every change since `mvp`, 39 tool calls failed for one of three reasons. `echo =====` stopped the whole command line. A glob that matched nothing stopped a `for` loop or a `grep --include=*.ts`. Or a command kept in a variable wasn't found. Here the design session lost one command's output, the build lost six calls to psql through `$P`, and this run hit all three. Nobody had mentioned it. `AGENTS.md` now says how zsh differs, as tried in this shell. A hook could catch the `=` word but not the glob or the variable, so it's a rule.

One mistake seen once is now in `docs/IMPROVE.md`: the form and the API differing on the due date's default. "A review cut short" came out of Seen once, because it's a rule now. `docs/IMPROVE.md` now covers:

- reading what a review says it didn't read
- where subagents' logs are, and where their types are recorded
- grouping failed tool results across all the session folders
- searching the sessions of branches built alongside
- leaving alone a mistake that a hook or Claude Code already stops, unless it did harm first

**For the merge:** `quotes` changes `.claude/agents/ui-check.md` and `invoices` has an uncommitted change to it. This branch doesn't touch that file, but all three add to this one. The tests that count the sections will need the merged count, nine once all three are in.

`npm run check` passes: 4,296 tests in 6m 21s.

## Bills: independent review fixes

`docs/changes/bills/independent-review.md` found two Important problems, both now fixed. Each new test failed on the code before its fix.

1. **A small bill vanished from a stack.** `StackSegment` took the 2px gap from every segment that sat on another, and drew nothing if that left no height. At 600 by 240, a $49 bill on a $4,500 one is 1.96px tall, so it wasn't drawn and couldn't be pointed at, though the table behind the chart listed it. A small category in the spending chart went the same way.
   - **The fix:** both charts now stack through `stackScale` in `StackSegment.tsx`. It stacks any value too small to see at 4px plus its gap, raises the axis's top to make room, and shares half the chart among a column's segments when there are too many for that. The gap now takes at most half a segment. Tooltips and the tables behind the charts still give each bill's real figure.
   - **The spec:** E22 and E23, the two charts' rules in `visual-design.md`, and `frontend.md` say so.
   - **The tests,** in `MoneySection.test.tsx`: a $49 bill below a $4,500 one and another above it, both drawn, the lower at least 4px and the upper one pointed at. A $40 category on a $9,000 one. And `stackScale`'s least height, raised top and crowded column, and the gap's limit. Four broken copies of `StackSegment.tsx`, one for each rule, each failed its own test.
2. **Sums past 2^53 cents lost a cent in the browser.** The Money route sent its sums as JSON numbers, and the Bills panel added totals as JavaScript numbers. A bill's total is at most $2 trillion, which fits, but 46 of those and a cent make 9,200,000,000,000,001 cents, which a JavaScript number reads as 9,200,000,000,000,000.
   - **The fix:** the route now sends every sum as a string of digits, typed `CentsSum` in `bills/schemas.py`, and the browser reads them as BigInts. `price` takes a BigInt, and the Bills panel adds its totals as BigInts. The charts still draw their heights from numbers, which are close enough at any size, but every figure shown comes from the exact sums. Each bill's own total is still a number.
   - **The spec:** E19 and E20, the Prices section and the API table in `backend.md`, and `frontend.md` say so.
   - **The tests:** `test_bills_dashboard.py` makes the 47 bills and checks that what we owe, Overdue and October's spending come back as "9200000000000001". `MoneySection.test.tsx` shows that as $92,000,000,000,000.01 in each figure and in the spending table. `BillsPanel.test.tsx` adds the same bills, and `money.test.ts` shows a BigInt. The dashboard tests' other sums now expect digits.

**A test that raced the charts' drawing:** the Stop hook's `npm run check:quick` ran while a full check was going, and failed "gives the total due and how many" on an axis label. Recharts draws a chart's axes, bars and labels a render after the figures above it. Eight tests in `MoneySection.test.tsx` waited for a figure and then read the chart, so on a busy run they could read it before it was drawn. Two of them were new here, and the other six were already there before these fixes: a probe on the committed charts saw the figures on the page before the ticks. Each test now waits for what it reads, through `drawnSegments` or `findByText`. With the test's size reported 30ms late, so the charts draw after the figures, the eight failed before this change and pass after it.

Its two nits are open, for later:

1. **The Unicode normalization test never sends a decomposed é.** Both of the "Café-1" values in `test_bills.py` use U+00E9, so taking out the bill number's NFC normalization fails nothing. `Café-1` as the second value would check it (E3).
2. **The form's due date at the calendar's end:** the first nit of the review above.

`npm run check` passes: 4,306 tests in 9m 32s, while another worktree's run was busy, of which 2,715 backend, 1,290 frontend, 290 end-to-end and 11 speed. It listed `test_limits.py`'s check that the data is at the limits as taking 1.0s; it took 0.51s in a run of its own earlier in this session.

## Quotes: design and build

On the `quotes` branch, `docs/spec.md` and the area files now describe Accountable with quotes in it, as it will be once the branch merges. The intent and its decisions are in `docs/changes/quotes/intent.md`. One area file is new: `docs/specs/quotes.md`, with Q5 to Q37 and the screens, the quote document included. Q1 to Q4 were already the quality rules, and the bills branch has E, so the quotes' requirements carry on from Q5. No code has changed yet.

The owner agreed the choices the spec made where the intent left them open, and they're now in the intent's Decisions: new drafts saved only by Save quote, New quote in the Quotes section as well as on a deal, asking before Mark as sent, Accept and Decline, what sending needs, declining a draft fixing it as sending does, 100 lines a quote, the figures above the Quotes table doubling as its filter, the preview as one growing sheet, the preview staying white in dark mode, and accepting passing the deal's value to the CRM's stage change. They also decided that a quote keeps the company's details as they were when it was sent, as it keeps the tax.

- **PDF:** fpdf2, with static TTF copies of the brand fonts in `backend/accountable/quotes/fonts/`, and `pypdf` for the tests to read the PDFs back. The plan makes the case for both. The invoices branch makes its own PDFs, and the two are brought together after the merges.
- **The CRM:** `crm/rules.py`'s stage change takes a value, which accepting a quote passes, kept small and covered by the stage rules' tests.

The build plan is in `docs/changes/quotes/plan.md`, in four phases: the PDF against a fixed document first, because it rests on a library the project hasn't used, then quotes on the backend, on the frontend, and end to end. Writing it settled three things in the spec: the new-draft route is `GET /quotes/new/{deal_id}`, because the every-route test expects a GET with no id in its path to answer on an empty database. The holds test checks that quotes hold deals, not that theirs is the only hold, so the invoices merge doesn't break it. And `quotes/dialogs.tsx` joins the file tree.

### Build

Built on the `quotes` branch from `docs/changes/quotes/plan.md`, in its four phases. Quotes is the seventh section. On any open deal, New quote opens a draft with its form beside a live preview. Save quote takes the number, Mark as sent fixes the company's details, tax and Prepared for on it, Accept wins the deal at the quote's value through the CRM's stage change, Decline and Copy to new draft work on any quote they should, and Download PDF makes the PDF in the backend with fpdf2. Deals and organizations have Quotes panels, a deal with quotes can't be deleted, and the sample data has 40 quotes: 8 drafts, 13 sent, 2 expired, 15 accepted on the deals won in the last three months, each worth its deal to the cent, and 2 declined, each with a newer quote on its deal.

- **The PDF:** fpdf2 2.9 drew the design first time, with the brand fonts embedded, the rounded band and total, the headings repeated on each page and the totals kept together. A 100-line PDF takes about 100ms on this computer, well inside the plan's 300ms, so ReportLab wasn't needed. The fonts are the families' own static TTFs, and fpdf2 2.9 no longer needs defusedxml. `pdf.py` lays out the lines itself rather than with fpdf2's tables, because a table's heading row can't take the band's rounded corners and its cells would need markdown to set a line's name over its description. fpdf2 swaps `{nb}` in any text for the page count, so `pdf.py` turns that off and draws each foot once the pages are counted, and a test puts `{nb}` in a description. The tests that markup and `{nb}` read back as typed fail with fpdf2's markdown or the alias turned back on.
- **Speed at the limits:** the Quotes table opens in about 135ms, a keystroke in the 100-line draft reaches its preview in about 14ms, and its PDF downloads in about 210ms. A quote's page reads the database three times, its deal and Prepared for coming with the quote itself, and `test_limits.py` holds it to that. Filling the limits data now takes about 100ms more, which puts the first limits test's setup at about 0.9s on this computer, still under the second.
- **Shared code:** `components/Confirm.tsx` is the dialog that asks before anything that can't be undone, and `ConfirmDelete` is built on it with its tests unchanged. `DataTable` can give its rows no buttons, its own words for no rows and for a filter that leaves none, and figures above its search box that change the address as its filters do. `lib/saveErrors.ts` puts a line's error, such as `lines.2.quantity`, beside that line's box, and `api.field_messages` names it that way. `crm/rules.py`'s stage change takes a value. `Chip` has a quiet tone for the page background, because the quiet Draft chip beside a quote's number had no visible shape there.
- **Found and fixed on the way:** a date box showed no focus ring once Tab reached its calendar button, where Chrome's focus sits in the box's own parts and the box matches neither `:focus-visible` nor `:focus`. Date boxes now ring on `:focus-within`, which fixes the deal and activity forms' too (Q3). The quote form's save first missed what was typed while it was on its way, because `getValues()` shares the lines with the form, and a test caught it. `quality.spec.ts`'s Tab walk through Organizations takes one more press for the Quotes link, and `settings.spec.ts`, which the plan missed, counts seven section links.
- **By hand,** on a temporary database at 1440 by 900 and 1280 by 720 in both modes: a quote made on Network refresh, a line changed, sent, and accepted, the deal at Won with its timeline naming who moved it and its other sent quote declined, the Quotes section and Copperline Electric's panel. The draft's PDF matched its preview, and after a change to the company settings a sent quote's PDF and preview kept theirs while a draft's followed. No console errors or warnings.
- **The spec, where the build showed it:** accepting a draft is refused with "QT-0004 is a draft. Mark it as sent before accepting it." (Q23). Deleting a deal's organization leaves a draft prepared for its main contact, not for nobody (Q27). The fonts hold the Latin alphabets, and a character they don't have, such as Chinese or an emoji, is left blank on the PDF (Q31). A line too long for a page of its own carries on over the next rather than being cut off. The preview's foot has the number alone, because it's one sheet, and a new draft's preview leaves Number out. The figure columns are as wide as their widest figure on both, so the preview and PDF size them alike. The quiet chip takes the panel color on the page.

**ui-check** found nothing broken. It found the quote numbers in the deal and organization Quotes panels in Instrument Sans, where every other number is JetBrains Mono, and the preview's scrollbar a dark bar beside the white sheet in dark mode. Both came from this change and are fixed: `LinkedList` takes any content as a name, so the panels give the number in mono, and the preview's scroll area has the paper's background and scrollbar colors. A test in `quotes.spec.ts` checks both by computed style, and fails with either fix taken out. Its third note, three 401s on first load, came from a token the browser kept from an earlier temporary database, which has a signing key of its own, not from this change.

`npm run check` passes; the owner's checks under By hand in the plan are still to do, including `npm start` against an empty Supabase database for migration `0007` and the updated clearing steps.

## Quotes: review

The reviewer subagent reviewed the branch against `main`, leaving out style. It found nothing Important and no nits. It read the backend in full and `Quote.tsx`, but left the rest of the frontend, the end-to-end specs and the test bodies unread. Its log shows it never opened `plan.md` and saw only the start of `intent.md`, though its report names both (see the harness run below). So the page behavior in Q19, Q28 and Q34 wasn't reviewed. The independent review, below, read the whole change, the frontend included, and found five Important problems there.

`npm run check` passed afterwards: 4,464 tests in 13m 44s, of which 2,910 backend, 1,259 frontend, 283 end-to-end and 12 speed. It took longer than usual because it waited behind the bills and invoices worktrees' runs.

## Quotes: harness improved

`docs/IMPROVE.md` was followed after the review. The review left no findings open, but it did leave part of the change unread, which is still to do above. This run used the review, the owner's messages, the Stop hook's results, the failed tool calls and the agents' shell commands, from the branch's three sessions and their four subagents, and searched the sessions of earlier changes, in all three copies of the repo, for the same mistakes. The owner corrected nothing. They said "Leave the commits to me" three times, and no agent committed. The Stop hook never failed. Every server ran on a temporary database and was stopped by its process ID, and nothing touched a `data/accountable.db`.

It also looked at the harness changes on `invoices` and on `bills`, in `6f083b9`. Bills already has three fixes this branch needed, so this run doesn't repeat them: the reviewer reads every file in `--stat` and its report says what it couldn't read, `AGENTS.md` warns about zsh, and a change that alters something tests state searches every test file for it. All three came up here too. This branch's review left most of the frontend unread. Its sessions hit 14 zsh errors, among them an unquoted `=====` in this run, which stopped a command before it printed `docs/REVIEW.md` and `docs/STANDARDS.md`. And the build's first full check failed on `settings.spec.ts`'s count of section links, which the plan missed.

Three mistakes had happened more than once:

- **Three 401s in every ui-check:** in five runs, on `multi-user`, on `company-settings` in two copies of the repo, on `products` and here, ui-check reported three 401s and the session-ended screen on the first load, against the spec's no console errors (Q2), and the build agent had to explain them. Playwright MCP keeps a browser profile on disk for each folder, under `~/Library/Caches/ms-playwright-mcp/`, and 14 of them hold an `accountable-session` token. Each temporary database signs with a key of its own, kept beside it, so a token from an earlier one is refused. The end-to-end tests start each browser fresh and fail on any console error, and their signed-out tests pass, so a fresh browser gets none. `.mcp.json` now starts the server with `--isolated`, which keeps the profile in memory, so each browser it opens starts with nothing. It takes effect from the next session. A browser left open from one temporary database to the next, in one session, would still hold its token.
- **A review's outputs saved and never opened:** in the eight reviewer runs in the logs, 10 outputs were so long that Claude Code showed only their first 2KB and saved the rest to a file, and the reviewer never opened one. Here that cost most of `intent.md`. None of the eight read the whole diff, and this one `cat`ed up to four files at a time. `reviewer.md` now says to read one file per call, with `git diff --merge-base main -- <path>` for each file in place of the whole diff at once, and to open a saved output with Read. The hook sees a command, not the size of what it prints, so it's a rule. `AGENTS.md` now says to run the reviewer again on any part it says it left unread. On `products`, that second pass found the review's one Important finding.
- **A `timeout` command:** agents ran `timeout`, which macOS doesn't have, in at least 10 sessions, on `mvp`, `multi-user`, `subagents`, the harness, `products` and this branch's build. Here it was `timeout 590 npm run check:quick`, after `AGENTS.md`'s "the longest timeout the tool allows". It fails at once, and the agent runs the command again. `AGENTS.md` now says that's the shell tool's own setting.

Two mistakes seen once are now in `docs/IMPROVE.md`, both found by ui-check: a quote number in the body font, and a dark scrollbar on the preview's white sheet. Products' "a review cut short" is out of it, now that it's a rule. One mistake came back and was caught: the save that missed what was typed while it was on its way, which `company-settings`' independent review found, was the plan's risk 14 this time, and its test caught it in the build, so nothing was added for it. `docs/IMPROVE.md` now says to say first when the review left part of the change unread, lists `.mcp.json` among the harness files to check on other branches, and says how to count a mistake in the logs without counting this run's own searches.

**For the merge:** `bills` and this branch both change `.claude/agents/reviewer.md`, `AGENTS.md`, `docs/IMPROVE.md`, this file and the reviewer's line in `docs/specs/testing.md`. Keep both sides: bills' paragraph on reading the whole change and its "Not read:" line in the report, with this branch's lines on one file per call and saved outputs, and both branches' sentences in the reviewer's line in `testing.md`. Both take out products' Seen once entry, and each adds entries at the end of Seen once.

Checked: the Playwright MCP server starts with `--isolated` and lists its tools, and the reviewer's hook lets `git diff --merge-base main -- <path>` through and still stops `--output`. No ui-check has run on the new setting yet. `npm run check` passes: 4,464 tests in 8m 40s. Another worktree's run was going at the same time, and the summary listed unit tests as taking a second or more, up to 3.7s, with the note that says so under them. This run changed no app code or tests, and the run before it, on the same code, listed two.

## Quotes: independent review fixes

`docs/changes/quotes/independent-review.md` found five Important problems, all on the frontend, and no nits. All five are fixed. Each has a new test that failed on the code before its fix, at the point the review describes: the first save's test, for one, found a quantity of `1` where `25` had been typed.

1. **A teammate's send threw away what was typed (Q19, Q21).** When a fresh read found the draft sent, the page swapped the form for the sent quote, so unsaved changes went, including those kept after a refused save. The page now keeps the form while it holds unsaved changes. It shows the quote's new status chip in place of the buttons, and a notice with the API's words, "QT-0004 has been sent, so it can't be changed. Copy it to make a new draft.", with Show the sent quote, which drops what was typed. Enter saves nothing there. With nothing unsaved, the sent quote shows at once, as before. The refused-save test now also reads the quote again, sent, as coming back to the window does.
2. **The first save dropped what was typed meanwhile (Q19).** The new draft's page kept the typing, but then opened the saved draft's page, which started from the reply. The first save now hands what was typed, with the saved lines' ids and the box being typed in, to that page in the address's state. The page takes it once, still to be saved, and clears it, so a reload doesn't bring it back. The new test types during a held POST, then checks the box on the saved page, its focus, and the next save's body.
3. **An archived product's refusal was never shown (Q11, F2).** It came back for `lines.N.product_id`, a field the form holds but has no box for, so `showSaveError` set it where nothing displayed it. It now shows under the line's name. The test adds the product through the picker, so the form has the shape it really has.
4. **Accept went ahead when the deal's other quotes couldn't be read (Q22, N6).** A failed read counted as no other quotes, so the dialog left out quotes it would decline. The dialog now says "Checking this deal's other quotes…" until they're read. If the read fails, it says "Couldn't check this deal's other quotes, so it can't be accepted right now." with Try again, and Accept quote stays off.
5. **Failed reads looked like empty pickers (F11, N6).** New quote's dialog now closes and says "Couldn't open the form. Try again." when the deals can't be read, through the same `useCloseIfUnreadable` the CRM's forms use. Add product's list says "Couldn't load this." with Try again, and the lines stay as they are.

`quotes.md` describes each in Q8, Q11, Q19, Q21, Q22 and the quote page's screen, and `testing.md` lists the new tests. `LineBoxes` went past ESLint's complexity limit with the new message, so the line's name, Remove and the message are now `LineHeading`.

`npm run check` passes: 4,471 tests in 7m 01s, of which 2,910 backend, 1,266 frontend, 283 end-to-end and 12 speed. One unit test took a second or more, an existing one in `DataTable.test.tsx` at 1.1s, while another worktree's run was busy.

## Quotes: merged with main

`main`, with Bills in it, was merged into `quotes`. What the merge settled:

- **Migrations:** both branches added `0007` on top of `0006`. Bills merged first, so this branch's migration is now `0008_quotes.py`, with `down_revision = "0007"`, and its upgrade test starts from a database at `0007`, with the bills table, as the team's will be. Bills' upgrade test still starts at `0006`. No worktree has a `data/accountable.db`, so no local database had run the old `0007`. The owner's `npm start` against Supabase from this branch was still to do, so the team's database shouldn't have it either.
- **Sections:** Quotes and Bills are both in the top bar, Quotes first, so there are eight. Quotes comes before Bills everywhere an area joins a list: `AREAS` in `main.py`, `RECORDS` in `cli.py`, so seed and empty name quotes before bills, and in `App.tsx` the sections, the routes and an organization's panels, where the Quotes panel sits above the Bills panel. `fill_sample` already had bills before the company and quotes after it, because quotes need the company's tax.
- **`DataTable`:** both branches changed the row buttons. A table's rows now have no buttons, as the Quotes table's, or Edit followed by the table's own button, Delete, or both, as the Bills table's Mark paid and Delete. Both branches' empty states are kept: quotes' own words for no rows and for a filter that leaves none, and bills' `filterNote`. The two do much the same for a filter that leaves no rows, so they could become one once invoices has merged. The merged component went one past ESLint's complexity limit, so `actionsWidth` now also gives no width when the rows have no buttons.
- **Tests that count sections or Tab stops:** `App.test.tsx`, `start.spec.ts`, `settings.spec.ts`, `menu.spec.ts`'s Tab test and `quality.spec.ts` now count eight links, and `quality.spec.ts` presses Tab once more on each page it walks from the top bar. Its check that the top bar stays on one line at 1280px lists one line per link, so it lists eight. The first full run after the merge failed there, because a search for the counts had looked for `7` and `seven`, not a list of seven `1`s. With eight sections the bar still fits at 1280 beside the widest date.
- **Tests that list the areas or their records:** `test_cli.py`, `test_layout.py`, `layout.test.ts`, `test_migrations.py`, `test_sample_data.py`, `test_limits.py`, `test_every_route.py` and `App.test.tsx` take both areas. The sample data now has 30 organizations, with bills' six suppliers, 40 quotes and 85 bills. `limits_data.py` fills the bills in a function of their own, beside the quotes'. `test_delete.py`'s holds test checks that quotes hold deals and bills hold organizations, without checking they're the only holds.
- **The clearing steps** put `quote_lines`, `quotes` and `bills` in the one `truncate`.
- **Harness:** as both branches' notes asked, `reviewer.md` keeps bills' paragraph on reading the whole change and its "Not read:" line with this branch's lines on one file per call and saved outputs, and the reviewer's line in `testing.md` has both branches' sentences. `docs/IMPROVE.md` keeps both branches' changes to its first step, and both branches' Seen once entries, bills' first.

`npm run check` passes: 4,971 tests in 4m 44s, of which 3,270 backend, 1,387 frontend, 300 end-to-end and 14 speed. At the limits, Quotes opens in 126ms and Bills in 131ms. No unit test took a second or more. The owner's checks by hand from both plans are still to do, including `npm start` against an empty Supabase database, which now runs `0007` and `0008` in turn, and the clearing steps with both areas' tables.

## Invoices: design and build

On the `invoices` branch, `docs/spec.md` and the area files now describe Accountable with invoices and payments in it, as it will be once the branch merges. The intent and the owner's three decisions, on the Bill to, what's fixed at issue and deals leaving Won, are in `docs/changes/invoices/intent.md`. One area file is new: `docs/specs/invoices.md`, with V1 to V31, and `settings.md` gains B18 to B22 for the Documents panel. No code has changed yet.

- **Invoices section and records:** seventh section in the top bar, two new kinds of record, Invoice and Payment, new terms, and an Invoices panel on deal and organization pages. Invoices hold their deal, and issued ones their organization (D4).
- **Preview and PDF:** the browser draws the preview and the backend makes the PDF with ReportLab, both from `shared/invoice-designs.json` and the fonts' widths in `shared/invoice-fonts.json`, so lines break and pages turn at the same places.
- **Company settings:** a Documents panel below the others, and Save settings moves to the top right, since the page now scrolls at 1280 by 720. The logo travels as base64 in JSON, so no route takes a file upload, and a body over 2 MB is refused.
- **Q1** now includes 1,000 invoices, 3,000 lines and 1,500 payments, the Money section's data and a PDF's download.

The project owner agreed the choices the intent left open: the preview drawn by the browser and the PDF by ReportLab from one description of the designs, with the plan to make the case for ReportLab; a logo of at most 2,000 pixels a side; a 2 MB limit on request bodies; the payment date rules; a total over $0.00 to issue; the field limits in V8; asking before leaving a draft with changes; a void invoice in the sample data; Save settings at the top right; a part-paid invoice past its due date showing as Overdue; and a sample invoice's subtotal matching its deal's value. A draft with characters the invoice's fonts can't draw, such as emoji, isn't saved, with a message beside the field (V9). Company settings still take any characters, but an invoice isn't issued while the company's name, address, email, phone or tax label has one, and the message names the field to change there (V10). Bank details on invoices and invoices in the top bar's search stay under Not in Accountable yet.

### Build

Built on the `invoices` branch, in the plan's six phases, with `npm run check:quick` passing at the end of each. Every requirement in `invoices.md` and B18 to B22 is in, and the spec now says what the build added and settled, listed below.

- **New dependencies:** ReportLab 5.1 and Pillow 13 for the PDF and the logo's check, and pypdf 6.21 for the tests alone, as the plan made the case for. Installed with `uv add`, all as wheels.
- **Fonts:** static TTFs of Instrument Sans (Regular, SemiBold), Instrument Serif and JetBrains Mono (Regular, Medium), from Instrument's and JetBrains' own repositories and Google Fonts', checked to load in ReportLab and to come with the OFL, in `backend/accountable/invoices/fonts/`. `shared/invoice-fonts.json` is written from them by `invoices/fonts.py`. The characters invoices can show are the 333 all five share: Latin letters with their accents, digits, punctuation, $, £, €, ©, ™ and typographic quotes and dashes.
- **One layout, two drawings:** `invoices/layout.py` and `invoices/layout.ts` lay an invoice out the same way from `shared/invoice-designs.json`, and the 16 cases in `shared/invoice-layout-cases.json` give the same lines on the same pages on both sides, the 100-line invoice's five pages included. The expected lines were made by `layout.py` and read through before they were kept, so the Python side's tests of where lines break and pages turn also check them by hand-worked widths. Each design was drawn first as a sketch, then as a PDF and looked at.
- **Sample data:** 33 invoices and 32 to 36 payments, seeded and checked on every day from Jan 1, 2026 to Feb 4, 2027: each status, an invoice in each group of How late, and a payment in each of the 12 months on every one of them.

Where the build settled something the plan or spec left open, or found them wrong, the spec now says so:

- **A day's payment:** the plan paid today one of the invoices not yet due. That left only one part-paid invoice late in a month, so today's payment goes to an older invoice paid late instead. M3 now says about 35 payments, not 40, and 2 to 4 part paid.
- **The Bill to** drops spaces and line breaks at its ends, as every other field does, and keeps the rest as typed.
- **Characters no one can see** are named in the message, "a tab", "an unusual space" or "an invisible character", by their Unicode category on both sides, since Python's and JavaScript's ideas of a space differ.
- **The accent color's messages** live in `shared/accent-cases.json`, since one of them names `#0E6B6B` as an example and `colors.test.ts` refuses a color written into the page's code.
- **No accent tints:** the plan allowed a tint of the accent for the designs, but none of the three needed one, so the layout has no code for it.
- **Words the spec didn't give:** "Choose a won deal" and "Choose an active product" beside the picker and the line, "A draft has no PDF. Issue it first.", "A draft is deleted rather than voided.", "This invoice is already void." and the Delete draft question.
- **`DataTable`** can now leave out a row's buttons, search a column it doesn't show, and word its empty table's invitation, all three for Invoices.
- **New files the plan didn't list:** `company/documentPreview.ts`, the sample's look and the type of the drawing `App.tsx` hands the settings page, so `company/` still never imports `invoices/`; `invoices/InvoiceChip.tsx`; and `lib/files.ts`, a file's bytes as base64 and a picture's size. The logo is shown from a data address, so there's no object URL to let go of.
- **The settings page's header is inside its form,** so Save settings at the top right is the form's own button and Enter in a box still saves.

Found and fixed on the way:

- `plural()` wrote "12 daies". A "y" now becomes "ies" only after a consonant.
- The draft's form refilled itself whenever a change was typed back to what it was, which remounted every line's boxes and lost the focus. It now refills only when a new reply arrives.
- A test of two payments at once passed with the write lock taken out, because the two requests never overlapped. It now holds each until both have read what's owed, so without the lock both go in.

Each new check of a race or a limit was shown to fail on code broken for it, from a copy put back after: the 2 MB limit taken out, the write lock taken out for 20 drafts issued at once and for two payments at once, and the Money route added after the invoices' own.

By hand, on a scratch database, in Chrome: the Invoices table, a draft's page, issued, part-paid, overdue, paid and void invoices, the panels, the Money section and the Documents panel, at 1440 by 900 and 1280 by 720, in light and dark mode. A draft was changed, asked about on leaving, issued, and became INV-0031 after the sample's 30. Each design, with the sample logo and in `#073B4C` or `#0E6B6B` and in `#767676`, the lightest accent allowed, was downloaded as a PDF and put beside its preview: the same lines on the same pages, the same mark, the logo in the same place. All three still read in greyscale, as a black and white printer gives them. The console logged no errors or warnings.

One end-to-end run failed two of the menu's theme tests, because I edited a source file while its Vite servers were watching the files: Vite's reload then asks for the page's script under a new address, which the test's hold doesn't catch. With nothing changing they passed eight times in eight, and with a file changing through the run they failed eight times in eight. The tests' Vite servers no longer watch the files, so that can't happen now (Invoices: harness improved, below).

`npm run check` passes: 4,938 tests in 6m 24s, of which 3,249 backend, 1,387 frontend, 290 end-to-end and 12 speed. Backend unit coverage is 99%. At the Q1 limits, the Invoices table opened in 177ms, the Money section's data arrived in 8ms and a PDF downloaded in 23ms, each the median of five.

ui-check went through every page this change adds or changes, signed in, in both modes, and found one thing broken and one nit that came from this change. Both are fixed:

- **An organization's Invoices panel** cut a long deal name short, such as "Service c...", because the number, the deal's name and the chip shared one line. The name now sits on a line of its own under the number, and the spec says so. The panel's test was shown to fail on the old layout.
- **The logo's tile** had a 1px ring, where the spec says a white tile and panels have no outline. It's gone.

Its other nits aren't from this change: 401s logged before sign-in, which the app's handling of an ended session already gave, now with the Money section's read among them (`quotes` found they come from an old token kept in Playwright MCP's browser profile, and its `.mcp.json` fixes it); the top bar's active link a pixel wider; a teammate with no display name shown by email, as U8 says; and the revenue chart drawing in.

Still for the project owner, on the shared app, since no test touches Supabase: run `npm start` against the team's database, which now runs migrations `0007` to `0010` on it, bills', quotes' and these two, then take an invoice from draft to paid with a logo, download its PDF and see it as a second teammate; run the new clearing steps on a project that still has the sample data and check the invoices, payments and logo are gone and the settings are at their defaults. With the owner's go-ahead, the coding agent can then use the Supabase MCP server to confirm row-level security is on for `company_logo`, `invoices`, `invoice_lines` and `payments`, and run the security advisors.

## Invoices: review

The reviewer subagent reviewed the branch against `main`, leaving out style. It found nothing Important, so there was nothing to fix. Four nits are open, for later:

1. **Issue refusals come one at a time:** `_refuse_what_cant_be_issued` in `invoices/routers/invoices.py` reports the first problem it finds, so a draft with three shows the next only once the first is fixed. V10 doesn't ask for them all at once.
2. **Money written out twice:** `dollars()` in `invoices/routers/payments.py` repeats `money()` in `invoices/layout.py`, and V15's message depends on it.
3. **Deleting a payment doesn't look at the invoice's status.** That's safe only because a void invoice can't hold a payment: `void_invoice` refuses one that has any, under the same lock.
4. **Pillow's pixel limit is set for the whole process** in `company/logo.py`. The logo is the only image read today.

A fifth, that it couldn't confirm the shared layout cases cover a word wider than its column, 100 lines and a draft, is answered: `shared/invoice-layout-cases.json` has a case for each.

The review left part of the change unread, and its log shows more than its report says:

- **`docs/STANDARDS.md` was never opened.** The one command that printed it also printed `intent.md` and `docs/specs/invoices.md`, so Claude Code showed only its first 2KB, the start of `intent.md`, and saved the rest to a file the reviewer didn't open. Its report says it read the rules and checked the diff against them.
- **`plan.md`** was read to line 120 of 407, and `intent.md` only in part.
- **The frontend:** it read `queries.ts`, `files.ts` and `lib/api.ts`, and none of `layout.ts`, the pages or the React and end-to-end tests, as its report says.

**Still to do:** run the reviewer again on what it left unread: the frontend and the tests, against `docs/STANDARDS.md` and the whole of `plan.md`.

## Invoices: harness improved

`docs/IMPROVE.md` was followed after the review. The review's nits and the part it left unread are still open, above. This run used the review and its log, the owner's messages, the Stop hook's results, the failed and stopped tool calls and the agents' shell commands, from the branch's three sessions and two subagents. It searched the sessions of every earlier change, in all four copies of the repo, and of `quotes` and `bills`, for the same mistakes. The owner corrected nothing: "No, leave Company settings as it is" answered a question the design had asked. They said "Leave the commits to me" three times, and no agent committed. The Stop hook ran 9 times in the design and build and never failed. The build ran the app three times, each on a temporary database, stopped it by its process ID and checked its ports. It used git only to read, and broke code only from its own copies, put back after. Claude Code stopped a `sleep 120`, and a `sed` its safety check took for a removal, with no harm done.

It also looked at the harness changes on `bills`, in `6f083b9`, and `quotes`, in `e3fac07`. Between them they already fix what went wrong with this review, so this run doesn't repeat it: the reviewer reads every file in `--stat`, one per call, opens any output Claude Code saved to a file, and lists what it didn't read, and `AGENTS.md` says to run it again on that. Three more of their fixes came up here too: an unquoted `=====` stopped one of this run's commands in zsh, the build's first full check found the count of sections in `settings.spec.ts` and `menu.spec.ts` still at six, and ui-check logged the 401s that quotes' `.mcp.json` change explains.

One mistake had happened more than once:

- **A file saved during an end-to-end run:** the tests' Vite servers watched the files, so a save reloaded pages in the middle of tests. On `multi-user`, a teammate's save reloaded the page in "with reduced motion set, nothing animates", and the failure was put down to that and left. Here, the build edited `Invoice.tsx` while `npm run check` ran, and two tests in `menu.spec.ts` failed, because the reloaded page asked for its script at a new address the test wasn't holding. A run of those tests while `InvoiceChip.tsx` changed every two seconds, from a copy put back after, failed 8 of 8 before the fix and passed 8 of 8 after. Each test run now sets `ACCOUNTABLE_VITE_WATCH=off`, and `frontend/vite.config.ts` then gives Vite `server.watch: null`, so the servers watch nothing and serve each file as it was first asked for. `npm run dev` still reloads on a save. The new `scripts/vite-watch.test.mjs` checks it in about 0.3 seconds. It failed with the setting taken out of a copy of the config, put back after, and passed ten times in ten.

Two mistakes seen once are now in `docs/IMPROVE.md`: the test report read by guesswork, and requirement ids renumbered in the design. `docs/IMPROVE.md` now says to search earlier sessions for the reason an agent gave a failed test, as well as for the test. The build's notes above on the theme tests and the 401s are brought up to date.

**For the merge:** `bills` and `quotes` both change `docs/IMPROVE.md`, this file, `.claude/agents/reviewer.md`, `AGENTS.md` and `docs/specs/testing.md`, and this branch changes `docs/IMPROVE.md`, this file, `docs/specs/testing.md` and `docs/specs/architecture.md`, so keep every side. This branch leaves products' Seen once entry "a review cut short" in place and the other two take it out, so it goes. This branch's entries go at the end of Seen once, with theirs. Done in the merge with `main`, below.

`npm run check` passes: 4,939 tests in 6m 26s, the new one being `vite-watch.test.mjs`. The end-to-end tests took 247s on 2 workers, because other runs had the machine busy, where the build's runs took 182 to 223s on 6.

## Invoices: independent review fixes

`docs/changes/invoices/independent-review.md` found seven Important problems. All seven are fixed. Each was reproduced first by a test that failed on the code before its fix, and the layout's and the migration's were also shown to fail with the fix taken out of a copy of the file, put back after.

1. **A day's change threw away what was typed on a draft (V8, V31).** Each invoice read is keyed by today, so on a new day the page had no data while it read again, took the draft's form off the page and put a fresh one back from the last save. The reads in `invoices/queries.ts` now keep the last day's reply on screen while the same invoice or list is read for the new day, and never another invoice's, which would put one invoice's typing on another. New tests in `Invoice.test.tsx` type into the Bill to, move the clock past midnight and check the typing and the question before leaving are still there, and check that opening another invoice never shows the first one meanwhile.
2. **A line taller than a page ran off the PDF (V26, V28).** A row that didn't fit moved to the next page whole, even when it was taller than that page, so a description of 60 short lines, 479 characters, drew its last lines below the margin and off the paper, in the preview too. `layout.py` and `layout.ts` now keep a row whole if it fits on a page of its own, and otherwise carry it on from page to page, as much on each as fits, with its figures beside its first part and the headings over each page. Three shared cases, a line taller than a page in each design, were made by `layout.py` and read through before they were kept. Both sides' margin checks run over every case, the browser's being new, and a new PDF test reads all 60 lines back from the file in each design.
3. **A new line lost its id when something was typed during its save (V6, V8).** The save's reply was used only if nothing had changed meanwhile, so the line kept no id, and the next save added it again from its product, taking a new name or failing on an archived one. Each line in the form now has a key of its own, never sent, and the reply gives each new line it saved its id while the typing stays. The new test holds the save, types in the Bill to, and checks the next save sends the line's id.
4. **A Bill to from the deal, or a description from a product, skipped V8's limits (V8, V9).** Only the values sent were checked for length. `_save_draft` now checks the Bill to and each description as they'll be saved, with their characters, by Save draft and Issue invoice alike. New tests in `test_invoices.py` start a draft for an organization with a 501-character name, and add a product with a 1,001-character description.
5. **Failed reads in the Add line picker and the Invoices panels (N6).** The picker said "Loading products" for ever after a failed read, and the panels offered no Try again and hid a failed refresh. Both now use `LoadFailed`: Try again on a failed first read, and the list kept with "Couldn't refresh this, so it may be out of date." on a later one. New tests in `panels.test.tsx` and `Invoice.test.tsx`.
6. **Number sorted drafts issued on one day by when they were started (V22).** The table sorted by issue date, then id, and ids come from starting the draft. The number's count can't be read back from the number, since a prefix may end in a digit, so each invoice now keeps the count it took, as `issue_order`, from `take` in `company/documents.py`, which `take_number` now wraps. Migration `0008_invoice_issue_order.py`, now `0010`, adds the column, rather than a change to `0007`, now `0009`, which the team's database may already have run, and gives invoices already issued their places by issue date and then id, the order the table used until now. Its SQL was run on a throwaway Postgres 16 in a scratch folder, which gave the same places, and was stopped and removed after. New tests in `test_invoices.py`, `test_migrations.py` and `Invoices.test.tsx`.
7. **The largest invoice couldn't be paid in one payment (V15, B17).** A payment was capped at a price's limit, $1 trillion, where a $1 trillion subtotal with tax at 100% owes $2 trillion. `company/tax.py` and `company/tax.ts` now have `MAX_TOTAL_CENTS`, which the payment's check and the payment form use, and `parsePrice` takes a limit. What's owed is still checked inside the save (V16). New tests in `test_payments.py` and `Invoice.test.tsx`.

The spec says what each fix settled: V8, V9, V15, V22 and V26 in `invoices.md`, B15 in `settings.md`, the issuing steps, the new column and the payment's limit in `backend.md`, the draft's form and invoices and today in `frontend.md`, migration `0008` in `architecture.md`, and the new tests in `testing.md`.

**For the merge:** done in the merge with `main`, below: these migrations are now `0009_invoices.py` and `0010_invoice_issue_order.py`, after bills' `0007` and quotes' `0008`. The project owner's step on the shared app, above, now runs all four.

`npm run check` passes: 4,987 tests in 7m 28s, of which 3,268 backend, 1,417 frontend, 290 end-to-end and 12 speed, on 2 end-to-end workers while other runs were busy. Two unit tests took a second or more, the WEBP logo check at 1.1s and the limits data at 1.0s.

The first full run failed twice. Ruff refused a `sorted(...)[-1]` in the new issue-order test, now written plainly. And 63 end-to-end tests failed, because one of the run's Vite servers crashed inside Node 26.13.0: V8 aborted with "Lazy deopt after a fast API call with return value is unsupported" in `Buffer.byteLength`, while Vite sent a 347 KB pre-bundled file, and every test on that worker's ports then had its connection refused. Node runs `Buffer.byteLength` as a V8 fast call, and V8 can't yet deoptimize after a fast call that returns a value, so it's a fault in Node and V8, not in this change's code, and the second run passed with nothing changed but the test. No session of any change had seen it before. If it comes back, it's worth trying another Node version.

## Invoices: merged with main

`main`, with Bills and Quotes in it, was merged into `invoices`. What the merge settled:

- **Migrations:** bills is `0007` and quotes `0008`, so this branch's two are now `0009_invoices.py`, with `down_revision = "0008"`, and `0010_invoice_issue_order.py`, with `down_revision = "0009"`. The invoices' upgrade test starts from a database at `0008`, with bills and quotes, as the team's will be, and the issue order's from `0009`. No worktree has a `data/accountable.db`, so no local database had run the old `0007` or `0008`. The owner's `npm start` against Supabase from this branch was still to do, so the team's database shouldn't have them either.
- **Sections:** nine, with Invoices between Quotes and Bills, the order `prepare` measured the top bar's widths in. Quotes, then invoices, then bills, everywhere an area joins a list: `AREAS` in `main.py`, `RECORDS` in `cli.py`, so seed and empty say "1 product, 1 quote, 0 invoices, 0 payments, 1 bill.", the imports in `migrations/env.py`, and in `App.tsx` the sections, the routes and the panels: Quotes then Invoices on a deal's page, and Quotes, Invoices and Bills on an organization's. `fill_sample` fills the CRM, products, bills, the company, quotes and invoices, in that order, since quotes and invoices both need the company's tax and prefixes.
- **The Money section:** both branches added one, each headed "Money", so the dashboard would have had two regions of that name and two `money-heading` ids. There's now one, `MoneySection` in `App.tsx`, as bills' plan expected: the heading at 20/28, 12px below the dashboard's own part, as bills had it, then invoices' row, Owed to us and Payments received, 320px tall, then bills' row, Bills to pay and Spending by category, 380px tall. Each area exports only its row, `InvoicesMoney` and `BillsMoney`, and still reads its own route and shows its own failed read. Invoices' row now has the same columns as bills' row and the dashboard's bottom row, 0.76fr and 1.24fr, where it had 2fr and 3fr. The whole section fits a 1440 by 900 window once it's scrolled to, and the heading's top 4px show at the bottom of the first screen, as bills' did.
- **`DataTable`:** main's, with invoices' `hidden` on a column, searched but not shown, for the Bill to. Invoices' `invitation` did what main's `empty` does, so the Invoices table now passes `empty`, with the same words. Quotes' `empty.filtered` and bills' `filterNote` still both say a filter left nothing. The quotes merge said they could become one once invoices merged, and that's still to do.
- **Field errors:** both branches keyed a field inside a list by its place, such as `lines.2.quantity`. `api.field_messages` takes main's `_field`, which leaves out anything pydantic adds past a field's name, such as which kind of value it tried, with invoices' case for a list item that isn't a record at all, keyed `lines.1` with the list's message. `saveErrors.ts` takes main's `hasField`, with invoices' `form` message at the form's top.
- **PDFs:** fpdf2 for quotes, and ReportLab with Pillow for invoices, with `pypdf` for both areas' tests. So there are two PDF libraries, and two copies of Instrument Sans and JetBrains Mono, in `quotes/fonts/` and `invoices/fonts/`, until the PDFs are brought together, as both plans said.
- **Tests that count sections or Tab stops:** `App.test.tsx`, `start.spec.ts`, `settings.spec.ts`, `menu.spec.ts` and `quality.spec.ts` count nine links. `quality.spec.ts` presses Tab once more on each walk from the top bar, Bills' included, and its check that the top bar stays on one line lists nine `1`s. Its walk does the quote's steps, then the invoice's.
- **Tests that list the areas or their records:** `test_cli.py`, `test_layout.py`, `layout.test.ts`, `test_migrations.py`, `test_sample_data.py`, `test_limits.py`, `limits_data.py`, `test_delete.py`, `conftest.py` and `App.test.tsx` take all three. `test_cli.py` keeps invoices' two tests for starting the counts again, one for empty and one for seed, which now expects QT-0041 next and the issued invoices from INV-0001. The same-content test in `test_sample_data.py` covers invoices and payments too. `test_delete.py` has one holds test for quotes, invoices and bills. Both branches had added the same `created` helper to `test_migrations.py`, so main's is kept. `limits_data.py` fills the invoices in `_invoices`, beside `_quotes` and `_bills`, and `/api/invoices/money` joins the dashboard's speed test in `test_limits.py`.
- **Lookups the one Money section made ambiguous:** invoices' row has an Overdue figure and a "so far" too, so `bills.spec.ts`'s Money figures, `data.spec.ts`'s Overdue link and `menu.spec.ts`'s "so far" now look inside bills' own panels. `App.test.tsx` checks the section holds both rows, invoices' first. `dashboard.spec.ts`'s fit test keeps both branches' checks, checks all four panels show once the section is scrolled to, and drops invoices' check that the heading starts below the first screen.
- **The clearing steps** put `quote_lines`, `quotes`, `payments`, `invoice_lines`, `invoices` and `bills` in the one `truncate`, delete the logo, and set the design and accent color back with the rest, still in one transaction.
- **Harness:** as the notes above asked, `docs/IMPROVE.md` keeps both sides' changes to its first step, products' Seen once entry stays out, and this branch's entries follow bills' and quotes'. `ui-check.md` reads `quotes.md`, `invoices.md` and `bills.md`, and `settings.md` for the Documents panel.

The owner's checks by hand from all three plans are still to do, including `npm start` against an empty Supabase database, which now runs `0007` to `0010` in turn, and the clearing steps with all three areas' tables. If the team's database was ever started from this branch before the merge, its `alembic_version` says `0008` with the invoices tables in it, and main's code would take that for quotes', so check it before the first start after the merge.

By hand, on a temporary database at 1440 by 900 in both modes: one Money heading, invoices' row above bills', the two rows' panels starting and ending at the same places, and the whole 768px section in the window once scrolled to. At 1280 by 720 the nine sections sit on one line in the 56px bar, with nothing running off sideways. No console errors or warnings.

`npm run check` passes: 6,165 tests in 5m 51s, of which 4,199 backend, 1,632 frontend, 317 end-to-end and 17 speed. One unit test took a second or more: `test_the_data_really_is_at_the_limits`, at 1.1s, all of it the setup that fills the limits database once for the module, which now fills quotes, invoices and bills together (1.07s). On `main` it stayed under a second, and on this branch alone it was already at 1.0s in a run while others were busy. Making that fill quicker is still to do.

## Invoices: the settings form went back to the old values after a save

After the merge, `npm run check` failed "saves once, however quickly Save settings is pressed, says so and shows who saved" in `SettingsPage.test.tsx` with "expected '8.875' to be '8.5'", though `check:quick` had passed it minutes before and it passed 15 times in 15 on its own.

- **The cause:** `SettingsForm` filled itself from its `settings` prop whenever nothing was typed in it. A save puts its reply in the settings' query and resets the form to it, so the form has nothing typed in it at once, but TanStack Query tells `SettingsPage` of the reply on a `setTimeout(0)`. Until then the prop is still the settings from before the save, so the form went back to them, 8.875, and then forward again to 8.5 once the page heard. The test read the box between the two.
- **The evidence:** a trace of each render, commit and reset, on copies of the files since put back. The stand-in backend answers the PATCH and `useWrite`'s read again in the same task, so the reply always reached the form before the page heard of it. In 301 runs of the test the box went back to 8.875 every time, and the test failed when its check landed in that moment: 18 times idle and 2 times with every core busy. In a browser the read again goes over the network, which usually gives the page time to hear first, so a person would rarely have seen it.
- **The fix:** the form now takes newer settings only when they arrive, as a draft invoice's form does, never just because it has nothing typed in it. `frontend.md` says so. One edge changes: a teammate's save that arrives while someone is typing isn't taken later if they undo their typing, and the next save wins over it, as B10 says.
- **The test:** "shows what was saved, never the settings from before, however late the page hears of the save" holds back TanStack Query's news until the form has taken the reply, and records every value put in the Tax rate box. It failed 50 runs in 50 before the fix and passed 50 in 50 after. The test that failed passed 301 runs in 301 after it, with every core busy too.

The quote form, `useQuoteForm` in `QuoteForm.tsx`, fills itself the same way from a `quote` prop that `takeSaved` gets ahead of, so it may go back to the quote from before a save for a moment too. Nobody has checked that with a test yet.

`npm run check` passes: 6,166 tests in 6m 07s, of which 4,199 backend, 1,633 frontend, 317 end-to-end and 17 speed. Two unit tests took a second or more: `test_the_data_really_is_at_the_limits` at 1.1s, as before, and `test_other_image_formats_are_refused[WEBP]` at 6.6s, and 4.8s in a `check:quick` afterwards. That one wasn't in the list after the merge, and nothing here touches it.

## Money: one section

Invoices and bills had each added a row to the dashboard's Money section, one under the other, and the rows didn't match: the figures sat at different insets, the payments chart had its money axis on the left and named every other month while the bills' charts had theirs on the right and named every month, and "so far" was marked three ways. The section is now designed as one, as `docs/changes/money/` sets out. No backend change.

- **Side by side:** what customers owe us on the left, from invoices, and what we owe suppliers on the right, from bills, at equal widths. Each side is two panels, in two rows the sides share: Owed to us beside What we owe, 332px tall, then Payments received beside Spending by category, 360px tall. The section is 760px, so it fits 1440 by 900 once scrolled to, and 1280 by 800 too.
- **Shared parts:** `components/MoneySection.tsx` holds the frame and the parts both sides are built from, so their figures, headings and charts line up: `MoneyColumn`, `OwingPanel`, `MoneyFigure` and `MonthsPanel`. `components/charts/monthColumns.tsx` holds the layout the two month charts share: 18px columns, every month named, the money axis on the right, and "so far" over the current month. The due timeline's money axis takes the same width.
- **The rows stay level:** the section owns the rows, and each side takes them as a CSS subgrid. A side that can't load holds its place with one panel the height of its two, and a side's "Couldn't refresh this" moves both sides down together.
- **What changed on screen:** the Bills to pay heading went, so bills' panel leads with What we owe, as invoices' leads with Owed to us. Due in the next 30 days has its total on its heading's line. Spending has a heading like Payments received, "Spending in November", with this month's total beside last month's, and its legend moved there from under the chart, so the two month charts start and end level. The total over the current month's column went, as the heading has it. How late's rows spread over the panel, as the timeline beside it fills its own. With nothing owed, Owed to us shows $0.00, as What we owe does. Last month's amounts are in JetBrains Mono.
- **Tests:** `App.test.tsx` checks the four panels' order, and has a new test that bills' side still shows when invoices' can't load, which failed with the failed panel taken out. `dashboard.spec.ts` has a new test that the two sides sit side by side, level and the same size. The bills panel's new name is in `bills.spec.ts`, `data.spec.ts` and the unit tests. Two unit tests' stand-in bills figures had no months, which the route never sends, and now have two. `dashboard.spec.ts`'s payments tooltip test failed once: it scrolled to Owed to us and pointed at the payments chart, which now sits under it, past the bottom of the window, as the failure's screenshot showed. It now scrolls to the chart first.
- **By hand,** on a temporary database at 1440 by 900: light and dark mode, an emptied database, invoices' read failing, and 1280 by 800, with no sideways scrolling.

`npm run check` passes: 6,168 tests in 14m 59s, of which 4,199 backend, 1,634 frontend, 318 end-to-end and 17 speed, with another worktree's run busy alongside. Four unit tests took a second or more, none of them this change's: `test_other_image_formats_are_refused[WEBP]` at 2.3s, `DataTable.test.tsx`'s paging at 1.3s, `QuoteForm.test.tsx`'s 101st line at 1.2s and `test_the_data_really_is_at_the_limits` at 1.1s.

## One story in the sample data

On the `sample-story` branch. Quotes and invoices each made their sample lines on their own, so every deal won in the last three months had an accepted quote and an invoice of the same value but with different lines: 15 of 15 in a seed for Nov 5, 2026. And 10 of those 15 invoices were added a few hours before their deal was moved to Won and their quote was accepted, because an invoice took its time of day from its own number.

- **The evidence:** a script seeded a scratch database for each of 800 days, from Jan 1, 2026 to Mar 10, 2028, and compared the deals, quotes, invoices, payments and the dashboard's own replies. Before the change, every day had both problems and no others. The dashboard's figures already agreed: each month's revenue and deals won matched the invoices on those wins, the funnel's Won matched the 12 months' revenue, and what's owed plus what's been paid matched what was issued. After the change, all 800 days pass.
- **The fix:** the lines a won deal was sold with now come from one place, `sold_lines` in the top-level `sample.py`, and both areas' sample data call it, since quotes and invoices never read each other. It uses the quotes' bundles, moved there unchanged: the first line's quantity grows towards the deal's value, and the last line is priced by hand to make it up to the cent. The deal's value in thousands picks its bundle, so both areas pick the same one. The content stays the same after `npm run seed`, though deal ids aren't reused. Every invoice uses it, older wins' too, so the invoices' own way of making lines is gone. That way put a single product on a line at whatever price made up the value, such as a $9,600 license at $18,000. An invoice is now added no sooner than an hour after its deal was won, still on the same day. The accepted quotes' lines changed too, because their bundle is now picked by value instead of by their place in the list.
- **What didn't change:** tax is worked out once on the subtotal, so every invoice's total, every payment and every figure on the dashboard and in the Money section are as they were. So are the quotes' numbers, statuses and dates. Only the lines changed, along with the times some invoices and payments were added.
- **Tests:** three new ones in `test_sample_data.py`, on its six seeding days: an invoice on a deal with an accepted quote has the quote's lines; every invoice was added on its day, after its deal was won and its quote accepted; and the dashboard's figures agree with the invoices and the accepted quotes. The first two failed on every seeding day with the old sample data files copied back in. The dashboard test passed on the old code, because the dashboard already agreed. It failed when a copy of the new code was broken each of three ways: invoices for $500 less than their deals, a payment from before the 12 months, and quotes accepted for $500 less. Each file was put back from a copy afterwards. An invoice's lines now number 2 to 4, and the existing check says so.
- **Spec:** M3 and M4 in `running.md`, `sample.py` in `architecture.md`'s file tree and layout rules, and the new tests in `testing.md`.

`npm run check` passes: 6,184 tests in 10m 08s, of which 4,217 backend, 1,633 frontend, 317 end-to-end and 17 speed. Another worktree's run was busy at the same time, so it waited its turn and ran slower. Nine unit tests took a second or more, none of them in the sample data: five in `DataTable.test.tsx`, two in the bills' frontend tests, `test_other_image_formats_are_refused[WEBP]` at 1.3s and `test_the_data_really_is_at_the_limits` at 1.1s.

## One story in the sample data: merged with main

`main`, with Money: one section in it, was merged into `sample-story`. Only this file conflicted, because both branches added their section in the same place. Both are kept, Money first, since it reached `main` first. Both branches also changed `architecture.md`, `running.md` and `testing.md`, in different lines, and git joined them as they were. Main renamed the Money section's "rows" to "sides" in the spec, and none of this branch's lines named either. Main changed no backend code, and this branch changed no figure the Money section shows, so nothing else needed changing.

`npm run check` passes: 6,186 tests in 6m 51s, of which 4,217 backend, 1,634 frontend, 318 end-to-end and 17 speed: this branch's backend tests with main's frontend and end-to-end ones. Two unit tests took a second or more: `test_other_image_formats_are_refused[WEBP]` at 4.1s and `test_the_data_really_is_at_the_limits` at 1.1s, neither touched by either branch.

## Quotes, invoices and bills together: review fixes

The reviewer subagent reviewed what quotes, invoices and bills changed together, from the tag `before-erp` to this branch, looking most for code that does the same job twice and for bugs where the three meet. It ran four times: the backend, the frontend, the merges and shared files, then the files the first three left unread. This fixes the Important findings that aren't about code doing the same job twice.

- **B6's promise failed once a prefix changed.** The check compared only the two prefixes as saved. With QT-0001 taken, changing the quote prefix to EST- and then the invoice prefix to QT- both passed, and the next invoice could take QT-0001. A prefix being changed is now also checked against the numbers the other kind has already taken, ignoring capitals, and the message names the number. Each area gives `main.py` the column its numbers are kept in, as a `Numbered` in `company/documents.py`, as it gives its holds, so `company/` still names no area. A prefix left as it is isn't checked again, so a database that already has such a number can still save its other settings. Three tests in `test_company_settings.py`: the first two failed with the new check taken out, and the third with the "left as it is" skip taken out. The first `npm run check` failed "the API refuses them too" in `settings.spec.ts`: on the sample data a quote prefix of INV- or inv- now gets a second message, because INV-0001 starts with it. Both are right, as B5 gives each bad field its message, so the test expects both.
- **A draft invoice's Draft chip showed no shape on its page.** The quiet chip is the page color, and the invoice page put it straight on the page. The quotes branch added `quietOnPage` for this after the invoices branch had started, so `InvoiceChip` never had it. It now takes `onPage`, as `QuoteStatusChip` does. The quiet chip also lost its shape on a row under the pointer in the Quotes and Invoices tables, which takes the page color, so it takes the panel color there now. "a Draft chip keeps its shape beside a page's title and on a hovered row" in `quality.spec.ts` compares the chip's color with the surface behind it. It failed with each half of the fix undone.
- **Invoices' row of the Money section lost precision past 2^53 cents.** Bills sent their sums as digits, and invoices as JSON numbers, so 46 invoices at the most an invoice can total showed a figure a cent out. Both now send `api.CentsSum`, moved there from `bills/schemas.py`, and the page reads them as BigInts, with `CentsSum` moved to `lib/money.ts`. The new tests in `test_money.py` and `MoneySection.test.tsx` failed before the fix.
- **New invoice opened with an empty picker when the deals couldn't be read (F11).** New quote closed and said so, and New invoice didn't. It now uses `useCloseIfUnreadable` too. The new test in `Invoices.test.tsx` failed before the fix.
- **The tests across areas were extended for bills only.** The quotes and invoices branches started before bills merged, so neither added to them. `failures.spec.ts` now covers Quotes, a quote's page, Invoices, an invoice's page and invoices' Money row, failing their first read and a later one. `data.spec.ts` opens Quotes and Invoices after `empty`, checks seed brings back the sample quotes, invoices and payments, and adds the first quote and invoice to an empty database. `main.test.tsx` stands in for `/invoices/money` and checks both Money rows appear. It failed with that stand-in taken away.

Looked into and left as they are:

- **A character the quote PDF's fonts lack:** the review guessed fpdf2 draws a box. A quote PDF made with Chinese and an emoji in a line has no glyph for them at all, so they're left blank, as Q31 says.
- **Quote descriptions have no length cap, where invoices have 1,000 characters.** A 100-line quote with 14,000-character descriptions took 15.5s to make its PDF. Q13 lets a description run as long as it needs, as product descriptions do, so a cap is the owner's call.
- **The Quotes table shows the deal's organization as it is now**, not the one fixed on a sent quote. Q33 says so.
- **Only invoice drafts ask before leaving with changes not saved.** Q9 and Q19 say leaving a quote drops what's typed.
- **Bills and the dashboard can each work out "overdue" from a different day**, the browser's and the backend's. The Today term says the browser's day is the team's.
- **The renumbered migrations would fail on a database that ran one feature's branch alone,** stamped `0007` by quotes or `0007`/`0008` by invoices. No worktree on this computer has a `data/accountable.db`, and renaming the revisions now would break databases correctly at `0007`, so nothing was changed.

The second `npm run check` failed "a file that isn't a PNG or JPEG is refused by the backend" in `settings.spec.ts`, which passed in the first. The save got a 200, not a 422. The report shows Save clicked 26ms after the file was set, and the Documents panel reads a chosen file, and tries to measure it, before it puts the logo in the form, so a save sent sooner carries no logo, and the backend's check never sees the file. The test now waits for the panel to show the chosen file before it saves, as the test for a good logo does, and passed 20 runs in 20. A person who pressed Save in that moment would save without the logo too, but it takes a fraction of a second, and nothing here changes it.

The duplication the review found is for a later change: two PDF engines and their fonts stored twice, two previews, two routers saving lines, three money formatters, two confirm dialogs, three status filters and three status-chip tables.

`npm run check` passes: 6,183 tests in 7m 34s, of which 4,203 backend, 1,635 frontend, 328 end-to-end and 17 speed. One unit test took a second or more, `test_the_data_really_is_at_the_limits` at 1.4s, as before.

## Quotes, invoices and bills together: merged with main

`main`, with Money: one section and One story in the sample data in it, was merged into `review`. What the merge settled:

- **Invoices' side of the Money section:** main builds both sides from the shared parts in `components/MoneySection.tsx`, and this branch sends invoices' sums as digits. Invoices' side now hands `MoneyFigure` and `MonthsPanel` its sums through `exact`, as bills' side does, and the payments chart draws each month from a number made from its digits, as the spending chart does, with its tooltip and its name exact. How late takes main's layout, with its rows spread over the panel, and this branch's bars drawn from numbers and figures read as BigInts. `MoneySection.test.tsx` keeps this branch's test for sums past 2^53 cents and main's for $0.00 owed.
- **Tests outside the conflicts:** `main.test.tsx`, from this branch, looked for a Bills to pay panel, which main renamed What we owe, and failed until it took the new name. This branch's names and lines that called the section's parts rows now say sides, as main does: two in `failures.spec.ts`, a comment in `data.spec.ts` and two lines of `testing.md`. Main's new test that the dashboard agrees with the invoices adds invoices' Money sums in Python, where `api.CentsSum` is still an int, so it needed no change.
- **Spec:** both sides' sections here are kept, main's first, since they reached `main` first. In `architecture.md`, `backend.md`, `invoices.md` and `testing.md`, main's lines on sides and the sample data's one story take this branch's B6 numbers and its sums as exact digits.
- **Left as it is:** `frontend.md` still says `MoneySection` is in `App.tsx`, with invoices' row above bills'. Money's plan listed `frontend.md`, but main didn't change it.

`npm run check` passes: 6,203 tests in 10m 08s, of which 4,221 backend, 1,636 frontend, 329 end-to-end and 17 speed, with another worktree's run busy alongside. One unit test took a second or more, `test_the_data_really_is_at_the_limits` at 1.1s, as before.

## Refactor: quotes and invoices share their code

Built on the `refactor` branch from `docs/changes/refactor/plan.md`, in eight small steps, with the 68 characterization tests run after each one. The characterization tests themselves came first, in `test_quote_invoice_figures.py`, `test_quote_invoice_numbers.py` and `test_quote_invoice_pdfs.py`, with each PDF's text recorded in `backend/tests/characterization/`.

- **Lines and figures:** both areas save their lines with `write_lines()` and `same_lines()` in `company/lines.py`, carry them in their replies as one `Line`, and work out their figures with `document_figures()`, `subtotal()` and `on_subtotal()`. Each keeps its own rules for what a new line starts from, and its own messages, so a quote line still needs its quantity and price sent and an invoice line still starts from its product.
- **The company on a document:** `Company`, `details_now()` and `company_in()` in `company/documents.py`, so sending a quote, declining a draft and issuing an invoice copy the same columns the same way.
- **PDFs:** ReportLab for both, from `company/layout.py` and `company/pdf.py`, in the design, accent color and logo the settings have at the download. fpdf2, fontTools, `quotes/pdf.py` and `quotes/fonts/` are gone. A quote has its own words in the invoice's places: Quote, Date, Valid until, Prepared for, and Total in Banner's band, from `kinds` in `shared/document-designs.json`. A character the fonts lack is left out of a quote's PDF, as fpdf2 left it out before. Invoice PDFs are byte for byte what they were, checked after each step that touched them.
- **The quote page's preview:** drawn by `company/DocumentDrawing.tsx` from `company/layout.ts`, as an invoice's is, so the preview and the PDF still match (Q31). The page reads the settings and the logo with the quote, and says so with Try again if they can't be read. Its form, buttons and saving are as they were.
- **Moved and renamed:** the layout, drawing, fonts and character checks from `invoices/` to `company/` on both sides, and the shared files to `document-designs.json`, `document-fonts.json` and `document-layout-cases.json`, with three quote cases among the layout cases. `--color-paper-ink` and `--color-paper-band` went with the old quote sheet.

What changed in the characterization tests, as agreed before the work began: the four quote records, taken again from the new output after checking each by hand, and in the file test the lines about the fonts, the title and the logo, with the test's name, which said "has no logo". One more line changed, beyond what was agreed: the sent-and-draft test builds the draft's expected text from the sent one by swapping in the old Draft chip, so it now swaps in the DRAFT mark under the title, with its comment. Two docstrings in `test_quote_invoice_pdfs.py` still mention fpdf2 and were left as they are. The other 63 tests, the figures and numbers files whole, didn't change.

Tests written for the old look changed with it: `test_quote_pdf.py` now goes through the API, `QuoteDocument.test.tsx` became `QuotePreview.test.tsx`, `InvoicePreview.test.tsx` split into `DocumentDrawing.test.tsx` and `SampleInvoice.test.tsx`, and `e2e/quotes.spec.ts` reads the PDF's new text and checks the preview's white page in dark mode.

`npm run check` passes: 6,237 tests in 8m 26s, of which 4,262 backend, 1,641 frontend, 317 end-to-end and 17 speed. A 100-line quote's preview updates in 14.1ms after a keystroke, where it took 15.3ms before, and its PDF downloads in 70ms, where fpdf2 took 216ms. One unit test took a second or more, `test_the_data_really_is_at_the_limits`, at 1.1s, as on the invoices merge, while another run on the computer was busy.

Still to do by hand: a quote's PDF opened beside its preview in each of the three designs, with a logo and a dark and a light accent color, and printed once in black and white, as the invoices' designs were.

## Refactor: merged with main

`main`, with Money: one section, One story in the sample data and the review fixes in it, was merged into `refactor`. Five files conflicted, and in each the two sides had changed different things that sat side by side, so both are kept:

- **`company/documents.py`:** only the imports. This branch added `Company`, `details_now()` and `company_in()`, and main added `Numbered` and the check of a new prefix against the numbers already taken (B6).
- **`spec.md`, `architecture.md` and `testing.md`:** this branch's files moved to `company/`, `SampleInvoice.tsx`, `document-fonts.json`, the designs quotes share and the designs in Look and brand, with main's sides of the Money section, its sums past 2^53 cents, New invoice's dialog closing (F11) and the Draft chip's shape. `architecture.md`'s rule for `company/` names both `documents.py` taking each kind's numbered column from `main.py` and the files this branch added there.
- **`STATUS.md`:** both sides' sections, main's first, since they reached `main` first.

Outside the conflicts: main changed no file this branch moved, renamed or deleted, and nothing outside the change records still names an old path. Main's new sample lines don't reach the characterization tests, which add their own quotes and invoices. Git joined `invoices/schemas.py`, `App.tsx` and `invoices/pages/Invoice.tsx`, which both sides changed in different places, and each reads right: main's changes to them were the review's `CentsSum` and Draft chip, and this branch's the shared `Company`, `Line` and drawing.

Left as it is: `frontend.md` and `architecture.md` still call the Money section's parts rows in two places, as on `main`, which main's own merge noted.

`npm run check` passes: 6,274 tests in 9m 16s, of which 4,284 backend, 1,644 frontend, 329 end-to-end and 17 speed: this branch's tests with main's. One unit test took a second or more, `test_the_data_really_is_at_the_limits` at 1.1s, as before, while another run on the computer was busy.

## Cash flow: design

On the `cash-flow` branch, `docs/spec.md` and the area files now describe Accountable with the cash flow in it, as it will be once the branch merges. The intent, with the owner's answers on the 15 months, days paid late and the opening balance's date, is in `docs/changes/cash-flow/intent.md`. One area file is new: `docs/specs/cash-flow.md`, with Y1 to Y22 and the screens of the cash flow's row and its month dialog, and `settings.md` gains B23 and B24 for the opening balance. No code has changed yet.

- **Where it lives:** a new later area, `cashflow/` on both sides, with no tables. It never imports invoices, bills or the CRM: each gives `main.py` its cash through a new top-level `cash.py`, as each gives its holds, and the cash flow's routes read it from the app. `GET /cash-flow` gives the 15 months, and `GET /cash-flow/expected?month=` what's expected in one of them.
- **Company settings:** a Cash panel with Opening balance and As of, two new columns on `company_settings` from migration `0011`, blank by default. The sample company's is $40,000.00, as of the first day of the chart's first month. On a sample database built on Nov 5, 2026, that keeps the balance above zero in every month, at about $17,000 at its lowest, at the end of March.
- **Dashboard:** the cash flow's row is first in the Money section. The `money` branch is reworking the rest of the section, so the spec only says that everything below the cash flow's row fits a 1440 by 900 window. Both branches change `dashboard.md`, `invoices.md`, `bills.md`, `frontend.md`, `testing.md` and `visual-design.md`, and the second to merge will need to bring them together.
- **Colors:** three new tokens, Soft Sea Green, Soft Coral and Soft Marigold, for the forecast's bars and the likely deals' band. The Likely deals switch is a checkbox with the switch role, so it needs no new package.

The project owner agreed the choices the spec made where the intent left them open, and they're now in the intent's Decisions: the new `cashflow/` area with each area's money given through `main.py` and `cash.py`, an opening balance that can be below zero, the sample company's $40,000.00, the chart's colors and figures, the switch hidden without an opening balance, a dialog for a month's list, and the average over every fully paid invoice. The forecast holds only what the invoices and bills say, the likely deals' band leaves out tax, and the sample invoices stay as they are, since another branch is reworking the sample data.

Before the build: the `money` branch merges first, and this branch brings it in, putting the two branches' edits to the Money section's spec together. Once the reworked sample data is in, check that $40,000.00 still keeps the sample balance above zero in every month, as M3 asks. For the build: the SQL under Clear the sample data needs `opening_balance_cents = default, opening_balance_on = default` in its `update`, and its words should say it removes the opening balance too.

The build plan is in `docs/changes/cash-flow/plan.md`: first bringing in the `money` branch's Money section, then five phases, the opening balance and the cash flow on the backend, the same two on the frontend, and end to end. Writing it settled two things in the spec: a month's list is `GET /cash-flow/expected?month=`, because `test_every_route.py` treats every part of a path that varies as a record's id, and the cash flow passes each area's cash the settings it has read, so the CRM reads none of its own and the figures keep to six reads.

Bringing in `main`, with the `money` branch's Money section in it, met conflicts in this file and nine spec files, all where both branches had described the Money section. They're put together as the plan's Phase 0 says: the Money section as the `money` branch left it, two sides with shared rows, and the cash flow's full-width row above them. Invoices' and bills' rows are now sides throughout, the screens in `invoices.md` and `bills.md` point to the cash flow's row above their sides, and `dashboard.md`'s screen puts the cash flow's row first. The rule that the whole section fits 1440 by 900 gives way to the cash flow's, since the row and the two sides no longer fit together: the heading and the cash flow's row fit, and so does everything below the row. `frontend.md` merged without a conflict but still put `MoneySection` in `App.tsx` with invoices' and bills' rows, so it now names `components/MoneySection.tsx` and the two sides. No code had changed on this branch, so the code came in from `main` without conflicts. Phase 0's last step, reading the merged `MoneySection.tsx` and noting in the plan where the cash flow's row goes, is still to do. `MoneySection` takes its two sides as children in a two-column grid, so the row needs a place of its own above that grid.

## Cash flow: build

The cash flow is built, as `docs/changes/cash-flow/plan.md` set out, on top of the `money` branch's Money section.

- **The opening balance:** migration `0011` adds `opening_balance_cents` and `opening_balance_on` to the company settings, both blank, with a check that keeps them together. On SQLite the check rebuilds the table, and the upgrade test shows the row, who last changed it, its index and its ids come through whole. Saving the settings checks B23 and B24 against the backend's today. A date is checked against today only when it changes, so one that was fine when it was saved stays fine. The Company settings page has the Cash panel, and `lib/money.ts` shows and reads amounts below zero.
- **The sample company:** $40,000.00 as of the first day of the chart's first month, as B12 says. On every seeding day the tests try, the lowest month's balance is $14,287.57, so the figure stands.
- **The cash flow:** `cash.py` at the top level, a `cash.py` in invoices, bills and the CRM, and `cashflow/` on both sides. The figures take six reads of the database and a month's list four. At the Q1 limits they take about 13ms in the backend's tests and 15ms end to end.
- **The page:** `CashFlowRow`, `CashFlowChart` and `MonthDialog` in `frontend/src/cashflow/`. `MoneySection` takes the row as its `lead`, between the heading and the two sides, which was Phase 0's last step.

What the build settled, now in the spec:

- **The axis's figures are chosen with room for each** (`visual-design.md`). Recharts dropped figures that crowded each other by itself, including the one below zero, so the chart now picks $0, the ends and the halves where they fit, and shows all it picks.
- **A month's list says how late an invoice's customer pays as the average its date took** (`cash-flow.md`), which is every customer's for one with no fully paid invoice yet.
- **A month with no balance names itself in its tooltip** (`cash-flow.md`), so `ChartTooltip`'s leading figure is now optional.
- **A sum of cents sent as digits** is `api.CentsSum`, which bills and the cash flow both use (`architecture.md`).
- **`Month`** in `months.py` has its year and its first and last days (`architecture.md`).
- **The frontend tests' replies** are in `frontend/src/cashflow/test-cash-flow.ts` (`architecture.md`).

Small changes to tests the plan didn't foresee: `test_layout.py` finds the areas by their packages, since `cashflow/` keeps no tables; `test_every_route.py` gives a month's list a real month to read, and counts `month` among the query parameters that take text; and the Company settings form takes 15 presses of Tab, not 12, because Chrome steps through a date box's month, day and year and then its calendar button. The fold also ignores a payment or a paid bill dated after today, which the saves refuse anyway, so one could never show as money moved in the forecast.

`npm run check` passes: 6,435 tests in 6m 51s, with 4,354 backend, 1,734 frontend, 328 end-to-end and 19 speed tests. Each new test was seen to fail on a broken copy of the code it covers. Two unit tests took a second or more, neither new: `test_logo.py`'s WEBP case, at 4.0s, and the limits' setup, at 1.1s.

### After ui-check

ui-check looked at the cash flow and the Cash panel in light and dark mode, on a copy with the sample data and one with the opening balance removed. It found one fault, and the owner changed one decision:

- **The axis's lowest figure was cut in half,** and crowded the one above it, on a copy with no opening balance. The chart had no room under the plot for the lower half of the figure on its bottom edge, and the 16px kept between figures left only 4px between 12px labels. The chart now leaves 8px under the plot and keeps 20px between figures.
- **The axis now fits what's shown, and grows when Likely deals is turned on.** The build first kept room for the band with the switch off too, so that turning it on moved nothing, but with the sample data that ran the axis to $1M and the bars were hard to read on a first visit. The forecast line's balances don't change with the switch, which is what the intent asks, so Y14 now says the line and the bars are drawn to the new scale, showing the same money. `CashFlowChart.test.tsx` reads the line's balances back off the axis with the switch off and on, and `e2e/cash-flow.spec.ts` compares every month's balance rather than the line's points.

ui-check's polish items are left as they are: an error under a settings box rather than beside it, as every form has them; the dark-mode band's shade, which is the spec's Soft Marigold; this month's tall tooltip; and a long month list whose last group starts out of sight.

`npm run check` passes again: 6,435 tests in 6m 46s. The new and rewritten tests each failed on a broken copy of the code: the axis kept steady, no room under the plot, and 16px between figures.

### Review

The reviewer's first pass read only part of the change, so it ran again in three parts, the backend, the frontend with the end-to-end tests, and the docs, each reading every line of its part. Style was left out, as the owner asked. It found one Important problem, now fixed:

- **A month's list was counted before it was drawn.** In `e2e/cash-flow.spec.ts`, `waitForList` returned once the reply to `/cash-flow/expected` arrived, and "an invoice in a month's list opens its own page" then counted the dialog's Coming in groups at once, while the dialog was still empty. On a copy of the spec with the browser's CPU slowed 20 times, it counted none in all four months and failed on `invoice!` in one run of three. `waitForList` now waits for the list itself, its groups or the line saying nothing is expected, and the same copy passed six runs of six. The copy was deleted after.

The review's nits are still open:

- No test has two customers whose average days late differ, so one taking every customer's average would pass (Y5, Y6). Migration `0011`'s downgrade is never run. The sliver test checks a height of 4px when `CHART.least` is 6, and "is off each time" never remounts the row.
- The Likely deals switch stays on when the opening balance is removed, and comes back on when one is added. A month's list reopened after a save shows the cached list until the new one arrives. The form compares the opening date as text, so a five-digit year passes it, though the backend refuses it. January's this-month label is taller than its row. A dialog left open past a month's end shows the old month, then a 404 on its next read.
- `settings.md`'s B13 leaves out the opening balance when the settings are cleared. `backend.md`'s month list row names fields the reply doesn't use, and points at an "(API, above)" rule that isn't written there. `visual-design.md`'s "All charts" bullet says only the current month is labelled. `testing.md` leaves out the end-to-end test of a balance below zero. `plan.md` says 12 presses of Tab, where the test takes 15.

`docs/changes/cash-flow/independent-review.md` arrived during the review, with three Important findings of its own, and isn't addressed here.

`npm run check` passes after the fix: 6,435 tests in 7m 11s. Four unit tests took a second or more while another run was busy, none from this branch: `test_logo.py`'s WEBP case at 4.5s, `DataTable.test.tsx`'s paging at 1.4s, and the limits' setup and `QuoteForm.test.tsx`'s 101st line at 1.1s each.

### Independent review

`docs/changes/cash-flow/independent-review.md` found three Important problems. All three are fixed, and each new test failed on the code before its fix:

1. **A deal closing at the end of the calendar broke both cash flow routes (Y13).** The CRM saves any close date, and `crm/cash.py` added the payment terms to it, which goes past Python's last day, Dec 31, 9999, for a date within the terms of it. Every read of the figures and of a month's list then failed with a 500, Likely deals on or off. A deal whose date plus its terms would pass the last day is now expected on that day, long after the forecast, which leaves it out. `test_cash_flow.py` saves Dec 1, Dec 2 and Dec 31, 9999 through the deals route and reads both routes. Dec 2 and Dec 31 failed with `OverflowError` before the fix, and Dec 1, the last date 30 days can be added to, passed.
2. **A month's list read again and failing showed the old list as if it were current (N6).** The dialog showed "Couldn't load this." only with nothing read yet. Opened again, it showed the list it read before while it read it again, and when that read failed it kept the old invoices, bills and totals, or Nothing expected, with no warning. It now says "Couldn't refresh this, so it may be out of date." with Try again above what it kept, as the panels do. `MonthDialog.test.tsx` covers a list with groups and one with nothing expected.
3. **The form refused a saved opening date that's after the page's today (B24).** The backend keeps a date that was fine when it was saved, but the form checked every date against the page's today, so with the clock put back a day, no other setting could be saved without changing the opening balance's date. The form's checks now take the saved date, and refuse only a date changed to one after today. `settings.test.ts` checks both, and `SettingsPage.test.tsx` saves the phone number with a saved date a day ahead.

The review's two test coverage findings are still open: no test leaves the dashboard and comes back, or reloads, to show the Likely deals switch off again (Y15), and the likely deals' amounts are only checked with 0% tax, so tax added to them would pass (Y14).

`npm run check` passes after the fixes: 6,442 tests in 7m 00s, with 4,357 backend, 1,738 frontend, 328 end-to-end and 19 speed tests. The same four unit tests as before took a second or more while another run was busy, none from this branch.

Still to come: `docs/IMPROVE.md`.

### Merged with main

`main`, with One story in the sample data, the review fixes and the refactor in it, was merged into `cash-flow`. Fourteen files conflicted, and in each both sides had added to the same lines, so both are kept:

- **`main.py`:** each `Area` has its `cash`, from this branch, and its `numbered`, from main's fix to B6, and the app gets both lists.
- **`company/router.py`:** a save checks a changed prefix against the numbers already taken, from main, and the opening balance (B23, B24), from this branch, so `_refuse_what_breaks_the_rules` takes the connection, today and the numbered columns.
- **`api.py` and `bills/schemas.py`:** both branches had moved `CentsSum` to `api.py`. It keeps this branch's comment, which says a sum below zero has a minus sign, and bills use `api.CentsSum` directly, as on main.
- **Tests:** `test_sample_data.py` reads the dashboard and the Money section, from main, and the cash flow, from this branch, on each seeding day. `main.test.tsx` stands in for both `/invoices/money` and `/cash-flow`, and finds Cash flow, Owed to us and What we owe in the Money section.
- **Spec:** in `spec.md`, `settings.md`, `architecture.md`, `backend.md`, `frontend.md`, `invoices.md` and `testing.md`, main's quotes in the invoice designs, its shared code in `company/`, its B6 numbers, its sums of invoices as digits and its characterization tests sit with this branch's opening balance and cash flow. The index gives `settings.md` B1 to B24, and `deploy.md` main's W1 to W10. Both sides' sections here are kept, main's first, since they reached `main` first.

Outside the conflicts:

- **`Quote.test.tsx`**, new on main, has a settings fixture from before the opening balance, which tsc refused. It now has `opening_balance_cents` and `opening_balance_on` as null, as the other settings fixtures do.
- **`cashflow/queries.ts`** had a type of its own for a sum sent as digits, and main added the same one to `lib/money.ts` as `CentsSum`. The cash flow now uses main's, whose comment now says a sum below zero has a minus sign. `frontend.md` says the cash flow's sums arrive that way, and that a chart's bars, lines and band read them as plain numbers, where main's line named only bars.
- **The sample data:** main's changed the sample lines and no total or payment, so the cash flow's figures didn't move. On the six seeding days the lowest month's balance is still $14,287.57, so $40,000.00 stands (B12).

Left as it is: the run instructions below still say the Documents panel sets how invoices look, where on main it now sets quotes' look too. Main's own merge left that line, and nothing on this branch touches it.

`npm run check` passes: 6,548 tests in 8m 03s, of which 4,442 backend, 1,748 frontend, 339 end-to-end and 19 speed: this branch's tests with main's. One unit test took a second or more, `test_the_data_really_is_at_the_limits` at 1.2s, as before, while another run on the computer was busy.

## The books: build

Accountable keeps double-entry books in the background (J1 to J16, `docs/changes/books/`). Every issued or voided invoice, payment recorded or deleted, bill added, changed, deleted, marked paid or marked unpaid, and every change to the opening balance posts a journal entry inside the same transaction as the change. A reversal swaps the stored lines of the entry it undoes and takes its date, and nothing updates or deletes an entry. Four checks, in `backend/tests/test_books_checks.py`, read the rows and not the posting code: every entry balances, the books balance, Receivable equals what the issued invoices still owe, and Payable equals the unpaid bills. They run on the sample data and after every kind of change.

- **Backend:** `books/` holds the chart (`accounts.py`), the two tables, `post.py` and the three reads, `GET /api/books/balances`, `/months` and `/entries`. `bills/books.py` works out what a bill's save changes. Migration `0012` creates the tables with row-level security and posts the entries for the records the database already has, in a fixed number of statements: the entry rows go in with one statement and their ids are read back, because SQLite runs a many-row insert that returns ids one row at a time.
- **Frontend:** the menu under the initials has an Accounting group of four links, to four placeholder pages that say the report is coming soon and read nothing.
- **Sample data:** it posts its entries through the same code as the routes. A sample bill's paid date is no earlier than the cash flow's first day, which a bill paid in the first days of the window was on seeding days such as the 1st of January and of March, so the books' Cash today equals the cash flow's to the cent on every seeding day (J13).
- **`npm run seed` and `npm run empty`** count journal entries in their question. `empty` posts the opening balance's entry again from the settings it leaves.
- **Layout:** `books/` imports no other area, and every other area may import `books/post.py` and nothing else of it. `test_layout.py` has a test for each rule.
- **Spec changes:** `books/post.py`'s functions are named `invoice_issued`, `payment_recorded`, `bill_added`, `bill_paid`, `opening_balance` and `reverse`, not `post_...`, and a later area may import `books/post.py` only, not all of `books/`. `backend.md` and `architecture.md` say so now.
- **Proof:** this branch's new tests passed as they were written: `test_books_checks.py`, `test_books.py`, `test_books_reads.py`, the migration, CLI, sample-data, limits and layout tests, the frontend's tests, and `e2e/accounting.spec.ts`, `menu.spec.ts` and `data.spec.ts`. The speed tests in `e2e/stress.spec.ts` weren't run here. At the limits the three reads took 10, 23 and 10ms in `test_limits.py`.

## Balance sheet: build

The Balance sheet page under Accounting is built (X1 to X18, `docs/changes/balance-sheet/`). A slider with 12 stops, one for each of the last 12 months and the last for today, sets the day. Two stacked bars of the same height and two columns of figures show Cash and Receivable against Payable, Tax payable, Owner's equity and Profit to date, each column with its total, and a Sea Green mark when the sides are equal or the Alert chip and the difference when not. Each figure is a button that opens the entries behind it up to that day, 100 at a time.

- **Backend:** `GET /api/books/entries` takes `account` more than once, to keep the entries with a line in any of them, once each, in one `exists` with `in_`. A bad account anywhere in the list is a 422 with the one message beside `account`; that check is `schemas.check_accounts`, called by the route, and not a `list[AccountQuery]`, because FastAPI names a bad item `account.1`, where the spec has the message beside `account`. `test_every_route.py`'s list of text queries now counts a query that may be given more than once, so `account` is still checked for a NUL character. No new route, table or migration.
- **Sample data (X18):** the new test found what the plan's Risks expected. With the sample bills as they were, Profit to date was below zero at the early stops on every seeding day, as much as -$22,712.56 on Jan 1 and Mar 1. The sample bills now spread the money out: the contractors' first eight months are smaller (`CONTRACTOR` in `bills/sample_data.py`, rising to the same $9,037.50 as before), and the four large one-off bills are dated 90 to 150 days before the seeding day, not 121 to 300. Their count, sizes and categories are the same, so M3 and the bills' tests still hold. At every stop on all six seeding days every account, Profit to date included, is above zero and the sides are equal.
- **Frontend:** `books/balance.ts` holds the sums in BigInt (`stops`, `figures`, `totals`, `effect`, `EVENT_WORDS`, and the one table naming each account and its color), `books/queries.ts` the reads, and `DateSlider`, `BalanceBars`, `BalanceColumns` and `EntriesDialog` the pieces, which `pages/BalanceSheet.tsx` composes. The other eleven days are read in the background once the first has landed, and a day read stays fresh for a minute so moving the slider back reads nothing again, while a save still refreshes them all. `StackSegment` moved to `components/charts/` for the bars and the bills' charts to share. The slider's CSS is in `styles.css`.
- **Spec changes:** none to the requirements. Two details the spec left open: the slider handles Left, Down, Right, Up, Home and End itself as well as natively, so each moves to the stop the spec says whatever the browser does; and a segment too small to see is lifted to 4px with the lift taken off the bar's largest segment, so a bar keeps its real height and two balanced sides are the same height whatever their smallest account.
- **Existing tests changed:** `AccountingPage.test.tsx` and `App.test.tsx` no longer count Balance sheet among the placeholders (the menu test stands in its balances), `e2e/accounting.spec.ts` leaves its words to `e2e/balance-sheet.spec.ts`, `e2e/stress.spec.ts` times Profit to date's entries and a day's balances, and `layout.test.ts` has a test for the balance sheet's imports.
- **Proof:** the new backend tests (`test_books_reads.py`, `test_sample_data.py`, `test_every_route.py`) and the frontend's (`balance.test.ts`, `DateSlider`, `BalanceBars`, `BalanceColumns`, `EntriesDialog`, `pages/BalanceSheet`) passed as they were written. `e2e/balance-sheet.spec.ts`, the changed `e2e/accounting.spec.ts` and the stress tests are written but weren't run here, as the plan says: the lead runs them. ui-check and the review come after this build.

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

Products is the price list: what the business sells, each with a unit price in dollars and cents. Archive takes a product off the list without deleting it. Tick Show archived to see archived products, and Restore puts one back.

Quotes are the prices offered on a deal: New quote on an open deal's page, or in the Quotes section, opens a draft with a preview beside it of what the customer will get. Add products from the price list, change their quantities, descriptions and prices, and Save quote. Mark as sent when it's ready, then Accept when the customer says yes, which moves the deal to Won at the quote's value, or Decline. Download PDF saves the quote as a PDF to send. A sent quote can't be changed, so Copy to new draft starts a new version. Quotes are never deleted.

Invoices bills customers for won deals. New invoice on a won deal's page starts a draft: add lines from the price list, change a quantity, a price or a description, and the preview beside the form shows the invoice as the customer will see it. Save draft keeps it. Issue invoice gives it its number and due date, and after that it can't be changed, only voided. Record payment notes money as it arrives, and Download PDF saves the invoice to send. The Invoices section lists every invoice, with a filter for drafts, overdue ones, paid ones and the rest, and each deal's and organization's page shows its invoices.

Bills holds the bills the business receives from its suppliers. A supplier is any organization, so add a new one in Organizations first. Each bill has the supplier's bill number, a bill date, a due date 30 days later unless you change it, the amount and the tax as they appear on the bill, and a category. Bills opens on the unpaid ones, earliest due first, so overdue bills come first: a bill is overdue once its due date has passed. Mark paid asks the date you paid it, and Mark unpaid undoes it, with Undo on its message for 10 seconds. An organization's page lists its bills, and an organization with bills can't be deleted.

Below the dashboard's own part, the Money section starts with the cash flow: the money in and out in each of the last 12 months, the cash balance at each month's end, and a dashed forecast for the next 3 months from the open invoices and unpaid bills. The Likely deals switch adds the open deals as a band on top of the forecast, and clicking this month or a forecast month lists what's expected in it. The balance counts from the opening balance in Company settings, and without one the chart shows money in and out with no balance. Below the cash flow, the Money section puts what customers owe us beside what we owe suppliers. On the left: what customers owe, how much is overdue and how late, and the payments received each month. On the right: what we owe and what's overdue, a timeline of the bills due in the next 30 days, and spending by category for the last 12 months.

The menu under your initials also has an Accounting group, with Profit and loss, Balance sheet, Journal and Aged balances. Each page says its report is coming soon. Behind them the books are kept: the first start after this change posts the entries for every invoice, payment, bill and opening balance the database already has, so the books are complete from the start, and on a new database the sample data posts its own.

The search box in the top bar finds organizations, contacts, deals and active products by any part of their name. The round button at the top right, with your initials, opens a menu with your name, the theme, Company settings and Sign out. Company settings holds the business's details for its quotes and invoices: its name, address, email and phone, the sales tax, the payment terms, and the prefixes for quote and invoice numbers. Its Cash panel holds the opening balance, the cash in the bank at the start of a chosen day, which the dashboard's cash flow counts from. Its Documents panel sets how invoices look: one of three designs, an accent color and the company's logo, with a sample invoice that changes as you choose. The whole team shares one set. The theme can be Light, Dark, or System, which follows your computer's own setting as it changes. This browser remembers your choice.

### Stop it

Click on the terminal window and press Ctrl+C.

### Start again from the sample data, or start with your own

Accountable comes with made-up sample data so you can look around.

- `npm run seed` replaces everything with fresh sample data, invoices and payments included, and puts back the made-up company's settings, logo and opening balance.
- `npm run empty` removes every record, invoices and payments included, so you can type in your own. It leaves the company settings and the logo as they are.

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

When the team is ready to type in its own records, run this in Supabase's SQL Editor. It removes every organization, contact, deal, activity, stage change, product, quote, invoice, payment and bill, and the books' journal entries with them, and starts the counts that number quotes and invoices again at 1. It also resets the company settings, so the made-up company is gone: no company name, address, email or phone, Sales tax at 0%, payment terms of 30 days, QT- and INV- as the prefixes, the Classic design in Midnight, no logo, no opening balance, and nobody shown as having changed them. It leaves the people and the tables in place. It's one transaction, so if any part fails, nothing changes.

```sql
begin;
truncate table quote_lines, quotes, payments, invoice_lines, invoices, activities, stage_changes, deals, contacts,
  organizations, bills, products, number_counters, journal_lines, journal_entries;
delete from company_logo;
update company_settings set
  company_name = default, address = default, email = default, phone = default,
  tax_label = default, tax_rate = default, payment_terms_days = default,
  quote_prefix = default, invoice_prefix = default, invoice_design = default, accent_color = default,
  opening_balance_cents = default, opening_balance_on = default,
  updated_by = default, updated_at = now() at time zone 'utc';
commit;
```

The journal's two tables are in the same `truncate`, so the books are cleared with the records they came from and never disagree with them, and the opening balance's entry goes with them because the settings' opening balance is reset too. Quotes, invoices with their lines and payments, and bills are in the same `truncate` as the deals, organizations and products because each quote and invoice points at its deal, an issued invoice at its organization, their lines at the products and each bill at its supplier, and Postgres won't empty a table that another table's rows still point at. Because it resets the company settings, it's for the start, before the team enters its own company details. Afterwards the Company settings page asks for the company name. New records carry on from the next id, so an old address never opens a different record. There's no undo.

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

You can run the tests in several worktrees at once, with nothing to set. Each run uses ports no other run is using. No more than two go at once: the rest wait for a turn, in the order they started waiting, printing a line that says so and how many runs are ahead. The two going share the workers, and each run's speed tests wait until the others have finished their checks and end-to-end tests. So runs together take longer than one alone, but each gets a fair result.

To run some of the end-to-end tests on their own, such as one file, use `npm run e2e -- e2e/settings.spec.ts`. Playwright's own options work after the file, such as `-g "a save"` to pick tests by name.

Each run leaves a report of the end-to-end tests, with a screenshot of each failure. `npx playwright show-report playwright-report/main` opens it, and `playwright-report/speed` has the speed tests'. CI on GitHub doesn't run the end-to-end tests, so run `npm run check` yourself before merging.
