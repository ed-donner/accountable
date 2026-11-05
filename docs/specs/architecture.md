# Spec: Architecture and libraries

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Architecture

The local copy, from `npm run dev`:

```
Browser                       http://localhost:5173
  React app  ---- /api ---->  Vite dev server (proxies /api)
                                    |
                              FastAPI on 127.0.0.1:8765
                              signs and checks the made-up teammates' tokens
                                    |
                              SQLAlchemy Core + Alembic
                                    |
                              data/accountable.db (SQLite)
```

The shared app, on Render or from `npm start`:

```
Browser  ---- sign-in ---->  Supabase Auth
  React app
     |
     +---- pages and /api, with the token ---->  FastAPI on Render, https://<service name>.onrender.com
                                                 (npm start: 127.0.0.1:8000)
                                                 serves frontend/dist and /api
                                                 checks each token with Supabase's public keys
                                                       |
                                                 SQLAlchemy Core + Alembic
                                                       |
                                                 Postgres on Supabase, through the session pooler
```

In both, the browser talks to one address for pages and data, so the backend needs no cross-origin setup. In the shared app it also talks to Supabase Auth, to sign in and renew its token.

```
package.json, package-lock.json   root scripts, npm workspace for frontend/
pyproject.toml, uv.lock           backend/accountable/ as an installable package, and the ruff, ty and coverage settings
render.yaml                       the shared app's Render web service, with no secret values
docs/INDEPENDENT_REVIEW.md        independent review of multi-user against week1day5-end, including code quality findings
playwright.config.ts
eslint.config.js, .prettierrc.json, .prettierignore, .gitleaks.toml   settings for npm run check
lefthook.yml                      the git pre-commit hook
.github/workflows/ci.yml          CI: gitleaks, then npm run check:quick, on every push
.claude/settings.json             the coding agent's permissions and hooks
.claude/agents/                   reviewer.md and ui-check.md, the coding agent's two subagents
.claude/skills/brand/SKILL.md     the brand skill: fonts, colors and tone
.mcp.json                         the Playwright MCP server, which ui-check uses
shared/                           expected-revenue-cases.json and website-cases.json, read by both unit test suites
scripts/
  setup.mjs                       shared setup, used by the scripts below that start things, Node built-ins only. It also
                                  gives the local commands an environment without the Supabase settings (C9)
  dev.mjs                         npm run dev
  start.mjs                       npm start: reads .env, builds the frontend, runs the shared app on this computer
  test.mjs                        npm test
  check.mjs                       npm run check and npm run check:quick
  checks.mjs                      runs the layers behind both, side by side where it can, and prints one summary
  data.mjs                        npm run seed and npm run empty
  test-plan.mjs                   how npm test shares out the machine, and which ports each run's slot and workers use
  test-runs.mjs                   lets the test runs on one computer share it: slots, who's busy, and the speed tests' turn
  test-servers.mjs                starts one backend and one Vite server for each Playwright worker
  test-report.mjs                 turns what each test runner wrote into the summary that ends npm test
  agent-check-on-stop.mjs         the coding agent's hook that runs npm run check:quick when it finishes a turn
  agent-guard-env.mjs             the coding agent's hook that stops any edit to .env
  agent-guard-uv.mjs              the coding agent's hook that stops python and pip run without uv
  agent-guard-read-only.mjs       the reviewer's hook that lets its shell run only commands that read
  agent-guard-playwright-folder.mjs   ui-check's hook that keeps the files it saves in .playwright-mcp/
  agent-hooks.mjs                 what those five hooks decide
  setup.test.mjs, start.test.mjs, test-plan.test.mjs, test-runs.test.mjs, test-report.test.mjs, agent-hooks.test.mjs
backend/accountable/
  main.py                         app, trusted hosts, the sign-in check, JSON-only check, startup, routers, and the built frontend in the shared app
  settings.py                     which copy runs, from DATABASE_URL, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (C8)
  db.py                           engine for SQLite or Postgres, metadata, foreign keys, write lock, migrations on start
  auth.py                         the token check, the signed-in person and GET /me, and the local copy's sign-in routes
  users.py                        the users table, names and initials, and the made-up teammates (U13)
  who.py                          who added and last changed, for every area: the columns a record's table keeps, the
                                  values a save writes, and the names and times in replies (U10)
  api.py                          what every area's API shares: the base request model and its checks on what's sent,
                                  the field types and request parameters, and the errors shown beside a field
  search.py                       the top bar's search, GET /search: the check on the text, one query over the kinds
                                  each area gives it, the order, the limit of 5 and the counts (K1 to K8)
  sample.py                       what every area's sample data shares: the time a sample record was put down at, and
                                  which made-up teammate added it and which last changed it (U14)
  cli.py                          seed and empty commands, for the local copy only, across every area
  migrations/                     Alembic, with batch mode on
  crm/
    tables.py                     SQLAlchemy Core tables
    schemas.py                    the CRM's Pydantic request and reply models, and the messages for its fields
    rules.py                      stage-change rules, usual probabilities, expected revenue
    timeline.py                   merged timelines and last-activity queries
    search.py                     what the top bar's search looks for in the CRM: organizations, contacts and deals
    sample_data.py                sample records, dated from a given day
    routers/                      meta, organizations, contacts, deals, activities, dashboard
  products/                       the price list (G1 to G12), which never imports crm/
    tables.py                     the products table
    schemas.py                    its request and reply models, and the messages for its fields
    router.py                     the products routes and their queries
    search.py                     what the top bar's search looks for among products: active ones only
    sample_data.py                the sample products, dated from a given day
backend/tests/
frontend/index.html               the page, with a short script that applies the saved theme before anything draws
frontend/src/
  main.tsx, App.tsx, styles.css   styles.css holds every color, as light and dark tokens
  test-utils.tsx, test-setup.ts   the unit tests' helpers, and test-supabase.ts, which stands in for Supabase's client
  lib/                            fetch client, session, query defaults, money in dollars and in cents, reading a typed
                                  price, date formatting, useToday, validation,
                                  the saved theme, and for every area's records and forms: records.ts, with who added and
                                  changed a record and the hooks that save and delete one, saveErrors.ts, which shows a
                                  save's errors beside its fields, useCloseIfUnreadable.ts, and notify.ts, which
                                  shows messages and keeps each to its session
  components/                     Shell, SignIn, UserMenu, DataTable, RecordPicker, ConfirmDelete, LoadFailed, Chip and
                                  others, RecordLayout: a record page's header, panels and who added and changed it,
                                  and Search: the top bar's search box, which knows nothing about any area's records
  crm/
    queries.ts, deals.ts, Timeline.tsx, searchGroups.tsx and others
    forms/                        organization, contact, deal and activity forms
    board/                        Board, Column, DealCard
    charts/                       RevenueChart, DealsWonChart, SalesFunnel, PipelineBand
    pages/                        one file per screen
  products/                       the price list, which never imports crm/
    queries.ts, ProductForm.tsx, searchGroups.tsx
    pages/                        Products and Product
frontend/dist/                    the built frontend, from npm start and Render, git-ignored
e2e/
data/                             the local copy's database and what it needs to sign its own tokens, created on first
                                  run and git-ignored
```

### Layout rules

Accountable will grow from a sales CRM into a Business OS, including ERP, so the layout leaves room for the next business area and adds nothing else. `backend/tests/test_layout.py` and `frontend/src/layout.test.ts` enforce the rules a test can check.

- **Each business area has a folder of its own, on both sides.** `crm/` holds everything specific to the sales CRM, and `products/` the price list. A later area, such as invoices, gets a folder beside them with its own tables, routes and pages. Areas never import each other, so `crm/` never imports `products/` and `products/` never imports `crm/`. What they share comes from the top level. Invoices will need to read products, so the change that adds them decides how one area reads another's records.
- **The top level holds only what every area needs.** Signing in and people are needed by every area, so `auth.py` and `users.py` sit there, and `users.py` holds the made-up teammates that any area's sample records are put down to. `sample.py` gives every area's sample data the same times of day and the same rule for which teammate added and last changed each record. `who.py` gives every area's record tables the same four columns, `created_at`, `updated_at`, `created_by` and `updated_by`, and what saves and replies do with them. `api.py` has the base request model and its checks, the field types such as names, emails, websites, ids, dollars and cents, and the errors shown beside a field. Each area keeps the messages for its own fields, and `main.py` hands the error handler the messages of the area whose route a request reached. Two areas can each have a field of one name with different rules: the CRM's activities need a description, and a product's is optional. The top bar's search spans every area, so `search.py` sits at the top level too: it runs the one query and puts the results in order, and each area's own `search.py` says what to look for in its tables. An area can import any of these, but they never import an area, so `main.py` passes `db.py` the function that fills a new database and passes `search.py` each area's kinds. Only `main.py`, `cli.py` and the migrations name an area's folder.
- **One database setup.** All tables share one `metadata` and one migration history, and anything specific to SQLite or Postgres stays in `db.py` and the migrations. There's no raw SQL, check constraints included, apart from turning on row-level security in the migrations, which SQLAlchemy can't say.
- **A router file holds its routes and their queries.** The dashboard's figures and funnel live in its router. `products/` has one router, so it's `products/router.py`, with no folder around it. In `crm/`, a module outside `routers/` exists only because several files use it, and each area's `search.py` exists because the top-level `search.py` needs it.
- **`components/` and `lib/` hold only what any area could use.** Anything that knows about deals or contacts goes in `crm/`, and anything that knows about products in `products/`. The search box is in `components/` and knows nothing about records: each area's `searchGroups.tsx` says what its results look like, and `App.tsx` hands them to the box and the box to the shell. A record page's layout, who added and last changed a record, the hooks that save and delete records, the checks on a form's fields and a save's errors shown beside them are in `components/` and `lib/`, so `products/` and any later area's pages and forms use the same ones. Only `App.tsx` names an area's folder.
- **Only `lib/api.ts` talks to the backend,** so every reply gets the same error handling, **and only `lib/session.ts` talks to Supabase.** **Messages go through `lib/notify.ts`,** so each stays with its session (U5). ESLint refuses `toast` from Sonner anywhere else but the tests.
- **No extra layers.** No service or repository classes, base classes, generic routers that build routes for each record, or a folder per record type. Split a file when it's become hard to work in, not before.
- **Tests stay flat for now.** Nothing imports them, so moving them later costs nothing.

## Libraries

Versions were checked on 2026-10-31. All of them accept React 19.3, and Tailwind's Vite plugin and Vitest both accept Vite 8. Several are recent major versions, so check their current docs when working on them rather than relying on memory, especially TanStack Table 9, React Router 8, Vite 8, Vitest 5 and Zod 4.

| Job | Library |
|---|---|
| UI, build | React 19, Vite 8 |
| Pages | React Router 8 |
| Server data | TanStack Query 5 |
| Tables | TanStack Table 9, kept behind `DataTable` |
| Charts | Recharts 3 |
| Drag and drop | `@dnd-kit/core` 6 |
| Dialogs and the menu | Radix UI |
| Searchable pickers | `cmdk` with Radix Popover, because Radix has no combobox |
| Styling | Tailwind CSS 4, with the brand as theme tokens |
| Forms | React Hook Form 7, Zod 4, `@hookform/resolvers` to connect them |
| Dates | date-fns |
| Messages | Sonner 2 |
| Icons | The design reference's own icons in `components/Icon.tsx`, and lucide-react for any it doesn't show |
| Fonts | `@fontsource-variable/instrument-sans`, `@fontsource/instrument-serif`, `@fontsource-variable/jetbrains-mono` (OFL-1.1, the font files ship in the packages) |
| Running both servers | concurrently |
| Signing in, in the browser | `@supabase/supabase-js` 2, in the shared app only |
| Backend | FastAPI, Uvicorn, SQLAlchemy Core, Alembic, Pydantic |
| Postgres | psycopg 3, SQLAlchemy's driver for it |
| Checking tokens | PyJWT, with `cryptography` for Supabase's signing keys |
| Frontend tools | `typescript`, `@vitejs/plugin-react`, `@tailwindcss/vite` |
| Test tools | Vitest, `@vitest/coverage-v8`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `jsdom`, `pytest`, `pytest-cov`, `httpx`, `@playwright/test` |
| Code checks | Prettier, ESLint 9 with `typescript-eslint`, `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y`, ruff, ty, gitleaks, lefthook for the git hook, GitHub Actions for CI |

- **Fonts:** the brand skill says Google Fonts. The npm packages hold the same fonts, so they look the same and work offline (C2).
- **Drag and drop:** `@dnd-kit/core` was last released in December 2024, though it's still by far the most used, at about 40 million downloads a week. Its successor, `@dnd-kit/react`, is active but was still at 0.5.3 when checked. Accountable uses the stable package, whose React range covers React 19.
- **Two TypeScripts:** the type check uses TypeScript 7, from `frontend/`. `typescript-eslint` can't read TypeScript 7 yet, because it has no JavaScript API, so the root has TypeScript 6.0 for ESLint alone. When `typescript-eslint` supports 7, the root one goes.
- **ESLint 9:** `eslint-plugin-jsx-a11y` doesn't support ESLint 10 yet.
- **Migrations:** Alembic is here because people have real data in the database, and later features will change the tables. Without migrations, the only way to pick up a new column would be a reset that wipes that data. Migrations run by themselves when the backend starts, on both databases.
- **Sign-in and Postgres:** these three came with sign-in. `@supabase/supabase-js` is Supabase's own client, and handles signing in, keeping the session and renewing the token, which would otherwise be hand-written against Supabase Auth's API. psycopg is what SQLAlchemy needs to reach Postgres at all. PyJWT checks token signatures against Supabase's public keys, which isn't something to hand-roll.
- **Fonts in the shared app:** the same Fontsource files are built into `frontend/dist`, so the shared app loads nothing from outside its own address but Supabase.
