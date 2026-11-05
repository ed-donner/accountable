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

Products is the price list: what the business sells, each with a unit price in dollars and cents. Archive takes a product off the list without deleting it. Tick Show archived to see archived products, and Restore puts one back. The search box in the top bar finds organizations, contacts, deals and active products by any part of their name. The round button at the top right, with your initials, opens a menu with your name, the theme, Company settings and Sign out. Company settings holds the business's details for its quotes and invoices, which come later: its name, address, email and phone, the sales tax, the payment terms, and the prefixes for quote and invoice numbers. The whole team shares one set. The theme can be Light, Dark, or System, which follows your computer's own setting as it changes. This browser remembers your choice.

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

When the team is ready to type in its own records, run this in Supabase's SQL Editor. It removes every organization, contact, deal, activity, stage change and product, and starts the counts that number quotes and invoices again at 1. It also resets the company settings, so the made-up company is gone: no company name, address, email or phone, Sales tax at 0%, payment terms of 30 days, QT- and INV- as the prefixes, and nobody shown as having changed them. It leaves the people and the tables in place. It's one transaction, so if any part fails, nothing changes.

```sql
begin;
truncate table activities, stage_changes, deals, contacts, organizations, products, number_counters;
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

You can run the tests in several worktrees at once, with nothing to set. Each run uses ports no other run is using. No more than two go at once: the rest wait for a turn, in the order they started waiting, printing a line that says so and how many runs are ahead. The two going share the workers, and each run's speed tests wait until the others have finished their checks and end-to-end tests. So runs together take longer than one alone, but each gets a fair result.

To run some of the end-to-end tests on their own, such as one file, use `npm run e2e -- e2e/settings.spec.ts`. Playwright's own options work after the file, such as `-g "a save"` to pick tests by name.

Each run leaves a report of the end-to-end tests, with a screenshot of each failure. `npx playwright show-report playwright-report/main` opens it, and `playwright-report/speed` has the speed tests'. CI on GitHub doesn't run the end-to-end tests, so run `npm run check` yourself before merging.
