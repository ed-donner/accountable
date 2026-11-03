# Spec: Architecture and libraries

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Architecture

```
Browser                       http://localhost:5173
  React app  ---- /api ---->  Vite dev server (proxies /api)
                                    |
                              FastAPI on 127.0.0.1:8765
                                    |
                              SQLAlchemy Core + Alembic
                                    |
                              data/accountable.db (SQLite)
```

The browser only ever talks to one address, so the backend needs no cross-origin setup.

```
package.json, package-lock.json   root scripts, npm workspace for frontend/
pyproject.toml, uv.lock           backend/accountable/ as an installable package, and the ruff, ty and coverage settings
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
  setup.mjs                       shared setup, used by the scripts below that start things, Node built-ins only
  dev.mjs                         npm run dev
  test.mjs                        npm test
  check.mjs                       npm run check and npm run check:quick
  checks.mjs                      runs the layers behind both, side by side where it can, and prints one summary
  data.mjs                        npm run seed and npm run empty
  test-plan.mjs                   how npm test shares out the machine, and where each worker's servers are
  test-servers.mjs                starts one backend and one Vite server for each Playwright worker
  test-report.mjs                 turns what each test runner wrote into the summary that ends npm test
  agent-check-on-stop.mjs         the coding agent's hook that runs npm run check:quick when it finishes a turn
  agent-guard-env.mjs             the coding agent's hook that stops any edit to .env
  agent-guard-read-only.mjs       the reviewer's hook that lets its shell run only commands that read
  agent-guard-playwright-folder.mjs   ui-check's hook that keeps the files it saves in .playwright-mcp/
  agent-hooks.mjs                 what those four hooks decide
  setup.test.mjs, test-plan.test.mjs, test-report.test.mjs, agent-hooks.test.mjs
backend/accountable/
  main.py                         app, trusted hosts, JSON-only check, startup, routers
  db.py                           engine, metadata, foreign keys, write lock, migrations on start
  cli.py                          seed and empty commands
  migrations/                     Alembic, with batch mode on
  crm/
    tables.py                     SQLAlchemy Core tables
    schemas.py                    Pydantic request and reply models
    rules.py                      stage-change rules, usual probabilities, expected revenue
    timeline.py                   merged timelines and last-activity queries
    sample_data.py                sample records, dated from a given day
    routers/                      meta, organizations, contacts, deals, activities, dashboard
backend/tests/
frontend/index.html               the page, with a short script that applies the saved mode before anything draws
frontend/src/
  main.tsx, App.tsx, styles.css   styles.css holds every color, as light and dark tokens
  lib/                            fetch client, money and date formatting, useToday, validation, the saved mode
  components/                     Shell, ModeButton, DataTable, RecordPicker, ConfirmDelete, LoadFailed, Chip and others
  crm/
    queries.ts, deals.ts, Timeline.tsx and others
    forms/                        organization, contact, deal and activity forms
    board/                        Board, Column, DealCard
    charts/                       RevenueChart, DealsWonChart, SalesFunnel, PipelineBand
    pages/                        one file per screen
e2e/
data/                             created on first run, the *.db file is git-ignored
```

### Layout rules

Accountable will grow from a sales CRM into a Business OS, including ERP, so the layout leaves room for the next business area and adds nothing else. `backend/tests/test_layout.py` and `frontend/src/layout.test.ts` enforce the rules a test can check.

- **`crm/` holds everything specific to the sales CRM, on both sides.** A later business area gets a folder beside it with its own tables, routers and pages.
- **The top level holds only what every area needs.** `crm/` can import `db.py`, but `db.py` never imports `crm/`, so `main.py` passes it the function that fills a new database. Only `main.py`, `cli.py` and the migrations name `crm/`.
- **One database setup.** All tables share one `metadata` and one migration history, and SQLite-specific code stays in `db.py`, so the later move to Supabase's database starts in one file. There's no raw SQL, check constraints included.
- **A router file holds its routes and their queries.** The dashboard's figures and funnel live in its router. A module outside `routers/` exists only because several files use it.
- **`components/` and `lib/` hold only what any area could use.** Anything that knows about deals or contacts goes in `crm/`.
- **Only `lib/api.ts` talks to the backend,** so every reply gets the same error handling.
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
| Dialogs | Radix UI |
| Searchable pickers | `cmdk` with Radix Popover, because Radix has no combobox |
| Styling | Tailwind CSS 4, with the brand as theme tokens |
| Forms | React Hook Form 7, Zod 4, `@hookform/resolvers` to connect them |
| Dates | date-fns |
| Messages | Sonner 2 |
| Icons | The design reference's own icons in `components/Icon.tsx`, and lucide-react for any it doesn't show |
| Fonts | `@fontsource-variable/instrument-sans`, `@fontsource/instrument-serif`, `@fontsource-variable/jetbrains-mono` (OFL-1.1, the font files ship in the packages) |
| Running both servers | concurrently |
| Backend | FastAPI, Uvicorn, SQLAlchemy Core, Alembic, Pydantic |
| Frontend tools | `typescript`, `@vitejs/plugin-react`, `@tailwindcss/vite` |
| Test tools | Vitest, `@vitest/coverage-v8`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `jsdom`, `pytest`, `pytest-cov`, `httpx`, `@playwright/test` |
| Code checks | Prettier, ESLint 9 with `typescript-eslint`, `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y`, ruff, ty, gitleaks, lefthook for the git hook, GitHub Actions for CI |

- **Fonts:** the brand skill says Google Fonts. The npm packages hold the same fonts, so they look the same and work offline (C2).
- **Drag and drop:** `@dnd-kit/core` was last released in December 2024, though it's still by far the most used, at about 40 million downloads a week. Its successor, `@dnd-kit/react`, is active but was still at 0.5.3 when checked. Accountable uses the stable package, whose React range covers React 19.
- **Two TypeScripts:** the type check uses TypeScript 7, from `frontend/`. `typescript-eslint` can't read TypeScript 7 yet, because it has no JavaScript API, so the root has TypeScript 6.0 for ESLint alone. When `typescript-eslint` supports 7, the root one goes.
- **ESLint 9:** `eslint-plugin-jsx-a11y` doesn't support ESLint 10 yet.
- **Migrations:** Alembic is here because people have real data in the database, and later features will change the tables. Without migrations, the only way to pick up a new column would be a reset that wipes that data. Migrations run by themselves when the backend starts.
