# Plan: sign-in, search and a user menu

This plan turns the multi-user intent and the spec, already updated on this branch, into build work: which files change, in what order, what could go wrong and how we'll know it works. IDs such as U6 and K4 are the spec's requirements. The intent wins over the spec and the spec wins over this plan. If the build shows the spec is wrong, fix the spec in the same change and say so in `docs/STATUS.md`.

The build expects to add two things the spec doesn't have yet. `backend/accountable/settings.py` is a new file, because `db.py`, `auth.py` and `main.py` all need to know which copy is running. And `deals.value` becomes a 64-bit integer, because Postgres's `integer` stops at about $2.1 billion and the API accepts up to $1 trillion (`MAX_VALUE` in `schemas.py`). Part I adds both to the spec.

## Files that change

The files are split into nine parts. No file is in two parts, so each part can go to a different agent. A part can have work in more than one phase, and [Order of work](#order-of-work) says which. Where one part needs another's work, it builds against the agreements below and picks up the real thing when it lands.

### New dependencies

The intent allows a new dependency only if the plan makes the case for it. There are three, and nothing else is added:

- **`@supabase/supabase-js`** (frontend, shared app only). Signing in, keeping the session in the browser and renewing the token before it expires would otherwise be hand-written against Supabase Auth's API, and getting the renewal wrong signs people out at random.
- **`psycopg[binary]`** (backend). SQLAlchemy needs a driver to reach Postgres at all. The binary build needs no compiler on Render or this computer.
- **`pyjwt[crypto]`** (backend), which brings in `cryptography`. It checks token signatures against Supabase's public keys and fetches the key set. Signature checking isn't something to hand-roll.

`npm start` reads `.env` with Node's own `process.loadEnvFile`, so nothing like `python-dotenv` is needed.

### What the parts agree on

**Backend, between parts**

- `users.py` has the `users` table (`id` text primary key, `name` text, `email` text, `created_at`, `updated_at`), `remember(conn, id, name, email)`, `initials(name, email)`, and a `Person` reply of `{id, name}` with the name already falling back to the email (U8).
- `auth.py` has `CurrentUser`, an `Annotated` dependency that gives the signed-in person's id, with their `users` row already up to date. Every route that writes takes it.
- `rules.py` functions take `user_id` as a keyword, next to `today` and `now`.
- `sample_data.py` has `TEAMMATES` and `add_missing_teammates(conn)`. `main.py` calls the second when the local copy starts, so a local database from before this change still has someone to sign in as.
- The local copy keeps its signing key in a file beside its database, so each test database has its own.

**API, between the backend and the frontend**

- `GET /me` gives `{id, name, email, initials}`.
- `GET /local/teammates` gives `[{id, name, email, initials}]`. `POST /local/sign-in` takes `{user_id}` and gives `{token}`.
- No token, or a bad one: 401 with `{"detail": "Sign in to use Accountable."}`. Keys that can't be fetched: 503 with `{"detail": "Can't check your sign-in right now."}`.
- Organization, contact and deal replies carry `created_by` and `updated_by`, each `{id, name}` or `null`. Timeline entries carry `created_by` the same way.
- `GET /search?q=` gives `{organizations, contacts, deals}`, each `{count, results}`. Results are up to 5 of `{id, name, industry}`, `{id, name, organization_name}` and `{id, name, stage, organization_name}`.

**Frontend, between parts**

- `lib/session.ts` exports `useSession()` (signed in or out, with any message to show), `currentToken()`, `endSession(message)`, `signOut()`, `isSharedApp`, `signInAs(userId)` for the local copy and `signInWithPassword(email, password)` for the shared app, which returns one of U2's messages on failure.
- `components/SignIn.tsx` exports `SignedIn`, which shows the sign-in screen until there's a session and then its children, and empties the query cache whenever a session ends.
- `Shell` takes a `search` element from `App.tsx` and shows `UserMenu` itself.
- Saved in `localStorage`: `accountable-mode` for the theme (`light`, `dark` or `system`) and `accountable-session` for the local copy's token. Supabase's client keeps its own key.
- The shared app's build gets `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Vite builds in only settings that start with `VITE_`, so `DATABASE_URL` can't end up in the page.

### Part A: database, settings and people (backend)

| File | Change |
|---|---|
| `pyproject.toml`, `uv.lock` | Add `psycopg[binary]` and `pyjwt[crypto]`. Both Python packages go in here, so only this part touches the lock file |
| `backend/accountable/settings.py` | New. Reads `DATABASE_URL`, `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` and says which copy runs: local with none, shared with all three, and with some but not all it stops and names the missing ones (C8) |
| `backend/accountable/db.py` | SQLite or Postgres from the settings. Postgres goes through `postgresql+psycopg`, with pre-ping so a connection dropped while Render slept isn't reused. A Postgres database with none of the app's tables is new, and gets its migrations and sample data in one transaction (W9). The row-level security check runs after the migrations, split into a Core query on `pg_class` and a pure function that names each table with it off. `local_today` follows `TZ`. In Phase 2, SQLite's `lower` is replaced, in the connect event, with one that knows every language (K2) |
| `backend/accountable/users.py` | New. The `users` table, `remember`, names and initials (U8, U9) and `GET /me` |
| `backend/accountable/crm/tables.py` | `created_by` and `updated_by` on organizations, contacts, deals and activities, and `created_by` on stage changes, as foreign keys to `users` with an index each. `deals.value` becomes `BigInteger` |
| `backend/accountable/migrations/env.py` | Offline mode, so a test can write out the Postgres SQL with no database. Imports `users`, so its table is in the metadata |
| `backend/accountable/migrations/versions/0002_ids_are_never_reused.py` | Skips its table rebuilds on Postgres, where ids are never reused anyway. SQLite runs it exactly as before |
| `backend/accountable/migrations/versions/0003_users_and_who.py` | New. The `users` table, the new columns and indexes, `deals.value` to `bigint` on Postgres, and, on Postgres only, row-level security on every table, `alembic_version` included |
| `backend/tests/test_settings.py` | New |
| `backend/tests/test_users.py` | New |
| `backend/tests/test_db.py`, `test_migrations.py`, `test_layout.py` | See [Proof](#proof). The layout test allows raw SQL only for turning on row-level security, only in the migrations |

### Part B: sign-in on the backend

| File | Change |
|---|---|
| `backend/accountable/auth.py` | New. The token check for both copies and `CurrentUser`. The local copy signs HS256 tokens for its teammates with its own key, accepts only those and only at `localhost` and `127.0.0.1`, and has the two `/local` routes. The shared app accepts only ES256 and RS256 tokens signed with the Supabase project's keys, issued by that project, for `authenticated`, and not anonymous. It fetches the keys once and again only for a key id it hasn't seen. Each good token updates the person's `users` row through `users.remember`, and only writes when the name or email has changed |
| `backend/accountable/main.py` | Builds the app through `make_app`, for the copy the settings name, so tests can build the shared app's routes on their own SQLite database with a stand-in for Supabase's keys. Every router gets the token check. The `/local` routes are only in the local copy. Trusted hosts add `RENDER_EXTERNAL_HOSTNAME` when Render sets it. The shared app serves `frontend/dist`, with the page for any other address outside `/api` and a JSON 404 inside it (W7). At start: migrations, the row-level security check, and in the local copy `add_missing_teammates`. In Phase 2, the search router |
| `.gitignore` | `data/`, which now holds the signing key as well as the database |
| `backend/tests/conftest.py` | `api` is signed in as a made-up teammate, so the existing tests keep working. A way to sign in as someone else, for Part C's tests |
| `backend/tests/test_auth.py` | New |
| `backend/tests/test_built_app.py` | New |
| `backend/tests/test_every_route.py`, `test_security.py` | Run signed in, and run each check in both copies |

### Part C: who added and changed (backend CRM)

| File | Change |
|---|---|
| `backend/accountable/crm/schemas.py` | `created_by` and `updated_by` on the organization, contact and deal replies, `created_by` on timeline entries. Request bodies stay as they are, so a body naming a person has it ignored like any unknown field |
| `backend/accountable/crm/rules.py` | Each stage change records the person on the `stage_changes` row, the deal, and the main contact it makes a customer (U10, U11). Renumbering leaves other cards' `updated_by` alone |
| `backend/accountable/crm/routers/organizations.py`, `contacts.py`, `deals.py`, `activities.py` | Every add sets `created_by` and `updated_by`, and every save that changes a record sets `updated_by`, from `CurrentUser`. Single-record replies join the two names |
| `backend/accountable/crm/routers/dashboard.py` | Only if the recent activity needs a change to carry `created_by` |
| `backend/accountable/crm/timeline.py` | Entries carry who added them. Each blank column in the union gets its type, such as `cast(null(), Date)`, because Postgres won't guess it the way SQLite does |
| `backend/accountable/crm/sample_data.py` | The four made-up teammates (U13), `add_missing_teammates`, and every sample record and stage change put down to one of them, some changed by another (M7, U14) |
| `backend/accountable/cli.py` | Seed and empty leave the `users` table alone (C4). They refuse to run if `DATABASE_URL` is set, as a second guard behind C9 |
| `backend/tests/test_who.py` | New |
| `backend/tests/test_rules.py`, `test_move.py`, `test_timeline.py`, `test_sample_data.py`, `test_cli.py`, `test_records_api.py`, `test_delete.py`, `test_dashboard.py` | Updated where a signature or a reply changes. New cases are listed under Proof |

### Part D: search (backend and frontend)

| File | Change |
|---|---|
| `backend/accountable/crm/routers/search.py` | New. `GET /search`, using `func.lower` on both sides and `contains(..., autoescape=True)`, so `%` and `_` match only themselves. It fetches each kind's matching ids and names and sorts them in Python, starts-with first, so the order is the same on SQLite and Postgres, whose collations differ |
| `frontend/src/crm/Search.tsx` | New. The box and its results, with `cmdk` and Radix Popover, the 150ms pause, and its query keyed by the text (K3 to K7). "See all" opens the table with the search in its address, which the tables already read (T4) |
| `backend/tests/test_search.py`, `frontend/src/crm/Search.test.tsx` | New |
| `e2e/search.spec.ts` | New |
| `e2e/stress.spec.ts` | Search results within 300ms at the limits (Q1) |

### Part E: the session and the sign-in screen (frontend)

| File | Change |
|---|---|
| `frontend/src/lib/session.ts` | New. Holds the session for both copies, as agreed above. In the shared app it uses Supabase's client. In the local copy it keeps the token from `/local/sign-in` in `localStorage`. It maps Supabase's errors to U2's three messages, and Supabase signing someone out to U6's |
| `frontend/src/lib/api.ts` | Adds `Authorization` to every request, reading the token at the time of the request, so another tab's sign-out shows on the next request (U5). A 401 ends the session with U6's message. The connection message says to check the internet in the shared app (N5) |
| `frontend/src/components/SignIn.tsx` | New. `SignedIn`, and both sign-in screens as the spec's [Sign-in screen](../../specs/sign-in.md#sign-in-screen) describes them |
| `frontend/package.json`, `package-lock.json` | `@supabase/supabase-js` |
| `frontend/vite.config.ts` | `@supabase/supabase-js` in `optimizeDeps.include` |
| `frontend/src/test-utils.tsx` | A helper that starts a test signed in |
| `frontend/src/test-setup.ts` | Clears all of `localStorage` after each test, rather than the mode key alone, so it no longer imports `lib/mode.ts`, which Part G deletes |
| `frontend/src/lib/session.test.ts`, `components/SignIn.test.tsx` | New |
| `frontend/src/lib/api.test.ts` | The header, the 401 and the shared app's connection message |
| `e2e/fixtures.ts` | Each test starts signed in as a made-up teammate through `/local/sign-in`, and its `request` carries the token, so the helpers and every spec's API calls keep working. The page gets the token through storage, never a shared header, so a missing header in `api.ts` can't hide |
| `e2e/helpers.ts` | Signing in, for the specs that do it themselves |
| `e2e/sign-in.spec.ts` | New |
| `e2e/security.spec.ts` | Requests without a token are refused. The existing checks still pass |
| `e2e/dashboard.spec.ts`, `pipeline.spec.ts`, `failures.spec.ts`, `problem.spec.ts` | Should need no change once the fixture signs in. If one does, it's this part's |

### Part F: who added, on screen (frontend CRM)

| File | Change |
|---|---|
| `frontend/src/crm/queries.ts` | `created_by` and `updated_by` on the record types, and `created_by` on timeline entries |
| `frontend/src/crm/RecordLayout.tsx` | The "Added by" and "Last changed by" lines (R6), left out or shortened as R6 says |
| `frontend/src/crm/pages/Organization.tsx`, `Contact.tsx`, `Deal.tsx` | Show those lines |
| `frontend/src/crm/Timeline.tsx` | Each entry shows who added it, beside when (A7, S2) |
| `frontend/src/crm/Timeline.test.tsx`, `pages/Organization.test.tsx`, `Contact.test.tsx`, `Deal.test.tsx` | See Proof |
| `e2e/records.spec.ts`, `e2e/activities.spec.ts` | Who added and changed, through the app |

### Part G: shell, menu and theme (frontend)

| File | Change |
|---|---|
| `frontend/src/App.tsx` | Wraps the router in `SignedIn` (Phase 1), and hands `Search` to the shell (Phase 2) |
| `frontend/src/components/Shell.tsx` | The search slot after the sections (Phase 2). The menu button in place of the mode button (Phase 3) |
| `frontend/src/components/UserMenu.tsx` | New. The initials button and the menu, with Radix's dropdown menu, as the spec's [Shell](../../specs/shell.md#shell) screen describes |
| `frontend/src/lib/theme.ts` | New, in place of `lib/mode.ts`. Light, Dark or System under the same key, so a saved light or dark carries over. Works out the mode, and while System is chosen follows the device as it changes |
| `frontend/index.html` | The early script handles System, asking `prefers-color-scheme` (L2) |
| `frontend/src/styles.css` | Only if the menu or the sign-in screen needs a token that doesn't exist |
| `frontend/src/components/ModeButton.tsx`, `ModeButton.test.tsx`, `lib/mode.ts`, `lib/mode.test.ts` | Deleted |
| `frontend/src/components/UserMenu.test.tsx`, `lib/theme.test.ts` | New |
| `frontend/src/App.test.tsx`, `main.test.tsx`, `components/Shell.test.tsx` | Signed out and signed in, the search slot and the menu |
| `e2e/menu.spec.ts` | New, replacing `e2e/mode.spec.ts`. Its tests carry over, switching with the menu |
| `e2e/mode.spec.ts` | Deleted |
| `e2e/quality.spec.ts` | Tab counts and focus rings for the search box and the menu button |

### Part H: running and deploying

| File | Change |
|---|---|
| `scripts/setup.mjs` | An environment for the local commands without the three settings or their `VITE_` forms (C9), used by every command but `npm start` |
| `scripts/dev.mjs`, `scripts/test-servers.mjs` | The readiness check takes the backend's 401 JSON reply from `/api/meta` as "up", since that route now needs a token |
| `scripts/data.mjs`, `scripts/checks.mjs` | Use the environment without the settings |
| `scripts/start.mjs` | New. `npm start`, as C10 and [Commands and first run](../../specs/running.md#commands-and-first-run) describe it. The build environment is worked out by a small exported function, so it can be tested |
| `package.json` | The `start` script |
| `render.yaml` | New. One free web service as W1 to W8 describe, with `healthCheckPath: /`, because `/api/meta` answers 401 and Render would mark the service unhealthy |
| `scripts/setup.test.mjs` | The local environment drops the settings |
| `scripts/start.test.mjs` | New |
| `e2e/start.spec.ts`, `e2e/data.spec.ts` | A started copy shows the sign-in screen first. Signing in survives a restart (U15). Seed and empty keep the teammates (C4) |

### Part I: docs (the lead agent)

| File | Change |
|---|---|
| `docs/STATUS.md` | Progress at the end of each phase. The run instructions for both copies, and the shared app's setup: a Supabase project on asymmetric signing keys, sign-ups off, adding a teammate and setting their display name, the session pooler's address, clearing the sample data (C11), and Render |
| `docs/specs/*.md`, `docs/spec.md` | `settings.py` and the new tests in the file tree and test list, `deals.value` as a 64-bit integer, and anything else the build shows is wrong. Other parts report spec problems here rather than editing the spec |
| `.claude/agents/ui-check.md` | Sign in by choosing a made-up teammate, and switch the theme with the menu |
| `docs/changes/multi-user/plan.md` | This plan, if the build changes it |

## Order of work

Three phases, then a finish. Each phase ends with `npm run check:quick` passing and, from Phase 1 on, `npm run check`. Within a phase the parts run side by side, and the lead merges their work and runs the checks.

### Phase 1: sign-in and the database

1. Part A lands the settings, the `users` table, the new columns and migration `0003` first, because Parts B and C build on them. They can start at the same time against the agreements and switch over when it lands.
2. Part B: `auth.py`, then `main.py`, then `conftest.py`, so the existing backend tests run signed in. Then the new tests.
3. Part C: rules, routers, timeline, sample data and `cli.py`, with `test_who.py`.
4. Part E: `session.ts`, `api.ts`, `SignIn.tsx`, then the e2e fixture, so the existing end-to-end tests run signed in. Then `sign-in.spec.ts`, apart from the sign-out tests, which wait for the menu.
5. Part F: the record pages and timelines, once Part C's replies are in.
6. Part G: `SignedIn` around the router in `App.tsx`, and the App and main tests.
7. Part H: the local environment, the readiness checks, `npm start`, `render.yaml` and the start and data specs.
8. Part I: the shared app's setup in `docs/STATUS.md`, which the project owner needs for the step below.
9. **By hand, with the project owner.** The project owner fills in `.env` and runs `npm start` against an empty Supabase project, or tells the agent it may. Then, in order: the tables are built with the sample data, the row-level security check passes, sign in as the owner's user, a wrong password, every screen, and every kind of save from U10. The record pages show names. The agent uses the Supabase MCP server to confirm row-level security is on for every table and to run the security advisors, reporting only.

Done when `npm run check` passes and the walk above finds nothing.

### Phase 2: search

1. Part A: SQLite's `lower` that knows every language, with its test.
2. Part D: the route and its tests, then `Search.tsx` and its tests, then `search.spec.ts` and the stress test.
3. Part B: the search router in `main.py`.
4. Part G: the search slot in the shell, `Search` passed in from `App.tsx`, and one more Tab stop in `quality.spec.ts`.
5. **By hand:** with `npm start`, search for "émile", "EMILE", "%" and "_" against Supabase, and check the results and their order match the local copy's.

Done when `npm run check` passes and both copies give the same results.

### Phase 3: the user menu

1. Part G: `lib/theme.ts` and the script in `index.html`, then `UserMenu.tsx`, then the menu in `Shell.tsx` in place of the mode button. Delete the mode button and `lib/mode.ts`. Move `mode.spec.ts` to `menu.spec.ts`, switching with the menu, and add the System and menu tests.
2. Part E: the sign-out tests in `sign-in.spec.ts` (U5).
3. Part I: `.claude/agents/ui-check.md`.

Done when `npm run check` passes.

### Phase 4: finish

1. Part I brings `docs/STATUS.md` and the spec up to date with what was built.
2. Run `npm run check` with the three settings in `.env`, and again with `.env` moved aside by the project owner. Both pass, and neither reaches Supabase.
3. Run ui-check on the app from `npm run dev`, and the reviewer on the branch. Fix what they find.
4. Go through the intent's success criteria by hand, as set out under [By hand](#by-hand).

The first deploy to Render happens once `main` has this change, since Render deploys `main` (W5). The project owner does it, and the checks under [By hand](#by-hand) run again on the `onrender.com` address.

## Risks

Most damaging first.

1. **A test or a local command reaches the team's data.** `npm start` and a filled-in `.env` put Supabase one mistake away from `npm test`, `npm run seed` and `npm run empty`. Three guards: `setup.mjs` drops the settings for every local command and `setup.test.mjs` proves it, `cli.py` refuses to run with `DATABASE_URL` set, and every end-to-end test fails on a request that leaves the computer. Phase 4 runs `npm run check` with the settings in `.env` to prove it. Phases 1 and 4.
2. **`npm start` changes the real database.** Its migrations run on whatever `DATABASE_URL` names, and there's no undo. The agent never runs it without the project owner saying so, and the first run is against an empty project. The agent also can't read or edit `.env`, so the owner fills it in. Phase 1.
3. **Code that has only ever run on SQLite fails on Postgres.** The tests never touch Postgres, so this shows only by hand. Known so far: `deals.value` is a 32-bit integer on Postgres while the API accepts up to $1 trillion, so a big deal would fail with a 500, and the timeline's union has untyped blank columns that Postgres may refuse. Likely elsewhere: grouped queries that select a column they don't group by, booleans compared with 0 and 1, and lists ordered by name, which sort differently under Postgres's collation. Migration `0003` widens `value`, Part C types the blanks, and the offline SQL test checks what it can. The Phase 1 walk on Supabase does every kind of save and opens every screen before the later phases build on it. Phase 1.
4. **The owner's own local database.** Migration `0003` rebuilds five tables full of real records, and that database has no teammates, so nobody could sign in. The migration test upgrades a `0002` database with data and checks every row survives with no one recorded (U12). The local copy adds any missing teammates at start. Before the first `npm run dev` on this branch, the owner copies `data/accountable.db`. No agent opens, seeds or empties that file: by-hand runs use a temporary database through `ACCOUNTABLE_DB`. Phase 1.
5. **The token check lets in something it shouldn't.** The usual mistakes: accepting HS256 in the shared app, which lets the public key be used as a secret, accepting Supabase's anonymous users or another project's tokens, accepting a local token in the shared app, or failing open when the keys can't be fetched. `test_auth.py` has a token for each. PyJWT's key client also forgets its keys after 5 minutes by default, which would make each request wait on Supabase again and fail with a 503 whenever Supabase is slow. Check the installed version's behavior and set it so keys are kept until an unknown key id turns up. Phase 1.
6. **A secret ends up in the page.** Only `VITE_` settings are built in, and `start.mjs` passes only the URL and the publishable key that way. `start.test.mjs` checks the build's environment. After the first `npm start`, search `frontend/dist` for the database's host to be sure. Phase 1.
7. **Waiting for the backend never ends.** `dev.mjs`, `test-servers.mjs` and Render's health check all wait for `/api/meta` to answer 200, and it now answers 401. The scripts accept the 401's JSON reply, and Render checks `/`. If this is missed, `npm run dev` and every end-to-end run hang for 60 seconds and then fail. Phase 1.
8. **The existing tests all stop at a 401.** Most backend tests and every end-to-end test call the API. Signing in through `conftest.py`'s `api` and the end-to-end `request` fixture keeps nearly all of them as they are. The backend tests that build their own `TestClient` need a token added by hand. Phase 1.
9. **The secrets check flags a git-ignored file.** `gitleaks dir` reads the working folder, ignored files included, so it may flag the local signing key in `data/` or the publishable key in `frontend/dist` after `npm start`. If it does, ask the project owner before changing `.gitleaks.toml`, because that loosens a check. Phase 1.
10. **Parts drift apart.** Nine parts building side by side can each read an agreement differently. The agreements above are the only shared surface. Each part tests its own side against them, and the lead runs `npm run check:quick` after merging each part, not just at the end of a phase. All phases.
11. **Display names come from the wrong place.** Supabase's Add user form has no name field (U3). Which `user_metadata` key the dashboard shows needs checking against Supabase's docs before `auth.py` reads it, and `docs/STATUS.md` gives the SQL that sets it. A changed name shows only after that person's token renews (U9), so the by-hand check waits for a renewal or signs in again. Phase 1.
12. **Search gives different results on the two databases.** Postgres's `lower` depends on the database's character settings, and SQLite's replacement uses Python's. They agree on ordinary names, and the Phase 2 check on Supabase confirms it with accented letters. Sorting in Python keeps the order the same. Phase 2.
13. **Render's build image differs from what `render.yaml` assumes.** It needs Node 24 or later and uv as well as Python 3.12. Check Render's current docs when writing `render.yaml`. If it needs a `NODE_VERSION` setting, W3 changes to say so. Phase 1.
14. **System flashes the wrong mode.** The early script in `index.html` has to handle System, and an old saved `light` or `dark` has to carry over. `theme.test.ts` runs the script in jsdom with the device's setting stood in, and `menu.spec.ts` holds back `main.tsx` on a dark device to check the page is already dark. Phase 3.
15. **Unit tests get slow.** Generating signing keys, fetching a key set, waiting out the search pause and running every route in both copies can each push a test past a second. Make keys once per session, stand in for the key set in memory, use fake timers for the pause, and read the slow-test list at the end of each `npm test`. All phases.
16. **Teammates on one Supabase pooler.** The session pooler limits connections, and Render's sleep leaves dead ones in the pool. Pre-ping drops dead connections, and a small pool keeps the app within the limit. Phase 1.

## Proof

`npm run check` runs everything below except the by-hand checks, and fails if anything fails. The existing tests must still pass, with only the changes listed in Files that change.

The intent's success criteria:

1. `npm run check` passes and never touches Supabase: the whole suite, run in Phase 4 with and without the settings in `.env`, plus `setup.test.mjs` and the end-to-end check on outside requests.
2. Signed out, every page shows the sign-in screen and every API route refuses: `test_every_route.py` in both copies, and `sign-in.spec.ts`.
3. Every record and activity shows who added it: `test_who.py`, the page and timeline tests, `records.spec.ts` and `activities.spec.ts`.
4. Search finds each kind by part of a name, in any case: `test_search.py`, `Search.test.tsx` and `search.spec.ts`.
5. The theme is remembered and System follows the device: `theme.test.ts`, `UserMenu.test.tsx` and `menu.spec.ts`.
6. The built app runs here the way Render runs it: `test_built_app.py`, `start.test.mjs`, and `npm start` by hand.

### Unit tests: backend (pytest)

| File | What it proves | Requirements |
|---|---|---|
| `test_settings.py` | None of the three settings gives the local copy, all three the shared app. Any one or two stop the backend, naming the missing ones. A `postgresql://` address gets the psycopg driver | C8 |
| `test_db.py` | The row-level security check, given tables with it on and off, refuses and names each one that's off, and passes when all are on. Today follows `TZ`. In Phase 2, SQLite's `lower` handles "ÉMILE" and leaves blanks blank | Security, Today, K2 |
| `test_migrations.py` | The migrations still build the same tables as `tables.py`, `users` included. Upgrading a `0002` database with data keeps every row and leaves who added it blank. Written out for Postgres in offline mode, the migrations skip `0002`'s rebuilds, make `deals.value` a `bigint`, and turn on row-level security for every table, `alembic_version` included | U12, Security, Data model |
| `test_users.py` | Names and initials: two words, one word, three words, no display name, and a name in another alphabet. `remember` adds a person, updates a changed name or email, and never removes anyone. `GET /me` gives the signed-in person | U8, U9, N7 |
| `test_auth.py` | Local copy: `/local/teammates` lists the four, `/local/sign-in` gives a token that works, an unknown id is refused, and a local token is refused at any other host. Shared app, with a stand-in for Supabase's keys: a good token works and adds the person, a key id it hasn't seen fetches the keys once more, the keys are fetched once for many requests, keys that can't be fetched give the 503 and its message, and the `/local` routes aren't there. Refused in both: no token, an expired one, one signed with another key, one for something other than `authenticated`, an anonymous user's, and in the shared app an HS256 token signed with the public key | U7, U16, Security |
| `test_every_route.py` | Every route the app has, taken from the app, in both copies: refused with 401 and the message without a token and with each bad token above. The existing input, origin and host checks, run signed in | U7, Security |
| `test_security.py` | The trusted hosts, with Render's address accepted only when `RENDER_EXTERNAL_HOSTNAME` names it | Security |
| `test_built_app.py` | With a stand-in `frontend/dist`: a built file is served, an unknown address gets the page, an unknown `/api` address gets a JSON 404, and `..` and encoded forms of it can't reach outside the folder. The local copy serves no frontend at all | W1, W7, Security |
| `test_who.py` | Who added and who last changed, through each change in U10: an edit, a stage change, a move, ticking and unticking a follow-up, and a won deal's contact. Renumbered cards and blanked links keep their `updated_by`. A body naming someone changes nothing. Replies carry both names, with the email for someone with no display name, and `null` for a record from before sign-in | U10, U11, U12, R6 |
| `test_rules.py`, `test_move.py` | Each stage change records who made it, on the stage change, the deal and the contact it makes a customer | U10, U11 |
| `test_timeline.py` | Every entry in all three timelines carries who added it, and `null` when no one is recorded | A7, S2 |
| `test_sample_data.py` | The four teammates, Robin with no display name, every sample record and stage change put down to one of them, and some last changed by another | M7, U13, U14 |
| `test_cli.py` | Seed and empty leave the four teammates in place. Both refuse with `DATABASE_URL` set | C4, C11 |
| `test_search.py` | Part of a name, any case, accented letters, `%` and `_` matching only themselves, spaces at the ends, starts-with first and then alphabetical, the limit of 5, the counts, a blank or over-long `q` refused | K1, K2, K4, K5 |

### Unit tests: frontend (Vitest)

| File | What it proves | Requirements |
|---|---|---|
| `lib/session.test.ts` | Which copy from whether the Supabase settings were built in. Local: signing in keeps the token, a reload finds it, signing out drops it. Shared, with Supabase's client stood in: wrong details, no connection and too many tries each give their U2 message, and Supabase ending the session gives U6's | U2, U4, U6, U13 |
| `lib/api.test.ts` | Every request carries the token. A 401 ends the session with U6's message. The connection message names the internet in the shared app and Accountable in the local copy | U6, U7, N5 |
| `components/SignIn.test.tsx` | Shared app: labeled fields, each field error, the button working once however fast it's pressed, the email kept after a wrong password, and Enter signing in. Local copy: the four teammates with initials, names and emails, and clicking one signs in. `SignedIn` shows the screen until there's a session and keeps the address. Ending a session empties the query cache | U1, U2, U5, U13 |
| `lib/theme.test.ts` | Light, Dark and System saved and read back. An old saved `light` or `dark` carries over. No saved choice, an unknown one and storage that throws give Light. System follows the device's setting and switches when it changes. The script in `index.html`, run in jsdom, gives the same mode as `theme.ts` for each case, with the device stood in | L1, L2, L4 |
| `components/UserMenu.test.tsx` | The button shows the initials and is labeled "Menu for Alex Rivera". The menu shows the name and email, the three themes with a check by the current one, and Sign out. Choosing a theme applies it and closes the menu. Arrow keys, Enter and Escape work, and Escape puts focus back on the button | N7, L1, U5, Q3 |
| `components/Shell.test.tsx`, `App.test.tsx`, `main.test.tsx` | Signed out, any address shows the sign-in screen with no top bar. Signed in, it opens that page. The bar holds the search box, the date and the menu button, in that order, and no mode button | U1, N1, N7 |
| `crm/Search.test.tsx` | Nothing is asked before a 150ms pause, an older reply arriving late never replaces a newer one, the three groups in order with empty ones left out, the matching part in semibold, "See all 12 contacts" and its address, the arrow keys, Enter, a click, Escape once and twice, and both messages in K7 | K3 to K7 |
| `crm/Timeline.test.tsx`, `crm/pages/Organization.test.tsx`, `Contact.test.tsx`, `Deal.test.tsx` | "Added by Alex Rivera on Oct 12, 2026" and "Last changed by Dana Whitfield on Oct 30, 2026". The second line left out when nobody has changed the record. "Added Oct 12, 2026" with no one recorded. Timeline entries with and without a name | R6, A7, S2 |
| `scripts/setup.test.mjs` | The local commands' environment has none of the three settings or their `VITE_` forms, even when the shell has them | C9 |
| `scripts/start.test.mjs` | `npm start` names each missing setting and stops. The build gets only the URL and the publishable key, as `VITE_` settings, and never `DATABASE_URL` | C10, Security |

### End-to-end tests (Playwright Test)

All run on the local copy. They use the existing fixtures, so each one also fails on any console error it didn't expect and on any request that leaves the computer.

| File | Test | Requirements |
|---|---|---|
| `sign-in.spec.ts` | Signed out, the Dashboard, a deal's address and an unknown address each show the sign-in screen with no top bar. Choosing a teammate opens the page at that address | U1, U13 |
| | The screen lists the four teammates. Robin shows "R" and the email in place of a name | U8, U13 |
| | Signed in, a reload and a new tab stay signed in | U4 |
| | A token the backend refuses shows the sign-in screen with "Your session has ended. Sign in again." | U6 |
| | Sign out returns to the sign-in screen at the Dashboard's address. Signing in as someone else shows none of the first person's pages from the cache, and the menu shows the new name | U5 |
| | After signing out in one tab, the other tab shows the sign-in screen on its next request | U5 |
| | The sign-in screen in dark mode, from the saved theme, with no menu | L2, L3 |
| `security.spec.ts` | Every `/api` request without a token gets the 401 and its message. The token never travels in a cookie. The existing checks still pass | U7, Security |
| `start.spec.ts` | A started copy shows the sign-in screen, then lands on the dashboard once signed in. After a restart, the same browser is still signed in | C1, U15 |
| `data.spec.ts` | After `npm run seed` and `npm run empty`, the sign-in screen still lists the four teammates | C4 |
| `records.spec.ts` | A new organization shows "Added by" with the signed-in name and no "Last changed by". Edited as another teammate, it shows "Last changed by" with theirs | R6, U10 |
| `activities.spec.ts` | A logged activity shows who added it. A deal moved on the board shows who moved it on the deal's timeline | A7, S2 |
| `search.spec.ts` | An organization, a contact and a deal found by part of a name in another case, each opened by click and by keyboard. "See all" opens the table with the same search. No matches says so. A failed search says "Couldn't search. Try again." and keeps the text. Escape twice clears the box | K1 to K7 |
| `stress.spec.ts` | At the Q1 limits, results show within 300ms of the last keystroke, the median of five | Q1 |
| `menu.spec.ts` | The menu shows the initials, name and email, and its controls work by keyboard | N7, Q3 |
| | Light, Dark and System each apply at once, and survive a reload, a new tab and signing out | L1, L2, L4 |
| | System follows the device, emulated with Playwright, and switches while the page is open | L1 |
| | With System saved on a dark device, the page is dark before `main.tsx` runs | L2 |
| | The menu is on every section, a record's page, the N4 pages and with the N5 message showing | L1 |
| | The tests carried over from `mode.spec.ts`: dialogs, picker lists, chart tooltips, messages, the Won stage and late cards in dark mode, keeping what's on screen while switching, and the contrast sweep in both modes, now covering the sign-in screen, the menu and the search results | L3, L4, L5 |
| `quality.spec.ts` | The Tab counts with the search box and menu button, and their focus rings | Q3 |

### By hand

- **The shared app on this computer.** The project owner runs `npm start` against an empty Supabase project, in Phase 1 and again at the end. That proves the migrations run from empty on Postgres, the sample data goes in, and the row-level security check passes. Then they sign in as their Supabase user and go through the success criteria: a wrong password, signing out, who added each record after saves by two people, search including accented names, and the theme. The agent uses the Supabase MCP server to confirm row-level security is on for every table and to run the security advisors, reporting only.
- **Nothing secret in the page.** After `npm start` builds it, search `frontend/dist` for the database's host and password.
- **The local copy with real data.** On a copy of the owner's database, in a temporary folder through `ACCOUNTABLE_DB`, never `data/accountable.db` itself: start this branch, sign in as a teammate, and check every record is there with its dates and no name.
- **ui-check** on the app from `npm run dev`, including the sign-in screen, the menu open, and both modes switched through it.
- **On Render**, after the project owner's first deploy from `main`: the same checks on the `onrender.com` address, a refresh on a deal's address, and the first visit after the app has slept.
