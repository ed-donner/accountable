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
.mcp.json                         the Playwright MCP server, which ui-check uses, with a browser that keeps nothing
                                  from one start to the next
shared/                           expected-revenue-cases.json, website-cases.json, settings-cases.json,
                                  totals-cases.json, accent-cases.json and document-layout-cases.json, read by both
                                  unit test suites, and document-designs.json and document-fonts.json, which both
                                  sides draw quotes and invoices from: the designs' sizes, places, fonts and colors,
                                  each kind's own words, and the fonts' character widths
scripts/
  setup.mjs                       shared setup, used by the scripts below that start things, Node built-ins only. It also
                                  gives the local commands an environment without the Supabase settings (C9)
  dev.mjs                         npm run dev
  start.mjs                       npm start: reads .env, builds the frontend, runs the shared app on this computer
  test.mjs                        npm test
  check.mjs                       npm run check and npm run check:quick
  e2e.mjs                         npm run e2e: chosen end-to-end tests only
  checks.mjs                      runs the layers behind all three, side by side where it can, and prints one summary
  data.mjs                        npm run seed and npm run empty
  test-plan.mjs                   how npm test shares out the machine, and which ports each run's slot, its workers and the turns use
  test-runs.mjs                   lets the test runs on one computer share it: slots, the two turns to go and their queue, who's busy, and the speed tests' turn
  test-servers.mjs                starts one backend and one Vite server for each Playwright worker
  test-report.mjs                 turns what each test runner wrote into the summary that ends npm test
  agent-check-on-stop.mjs         the coding agent's hook that runs npm run check:quick when it finishes a turn
  agent-guard-env.mjs             the coding agent's hook that stops any edit to .env
  agent-guard-uv.mjs              the coding agent's hook that stops python and pip run without uv
  agent-guard-read-only.mjs       the reviewer's hook that lets its shell run only commands that read
  agent-guard-playwright-folder.mjs   ui-check's hook that keeps the files it saves in .playwright-mcp/
  agent-hooks.mjs                 what those five hooks decide
  setup.test.mjs, start.test.mjs, test-plan.test.mjs, test-runs.test.mjs, test-report.test.mjs, agent-hooks.test.mjs,
  vite-watch.test.mjs
backend/accountable/
  main.py                         app, trusted hosts, the sign-in check, JSON-only check, startup, the list of areas
                                  with each one's routes, messages, search kinds and holds, and the built frontend in
                                  the shared app
  settings.py                     which copy runs, from DATABASE_URL, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (C8)
  db.py                           engine for SQLite or Postgres, metadata, foreign keys, write lock, migrations on start
  auth.py                         the token check, the signed-in person and GET /me, and the local copy's sign-in routes
  users.py                        the users table, names and initials, and the made-up teammates (U13)
  who.py                          who added and last changed, for every area: the columns a record's table keeps, the
                                  values a save writes, and the names and times in replies (U10)
  api.py                          what every area's API shares: the base request model and its checks on what's sent,
                                  the field types and request parameters, the errors shown beside a field, and a
                                  route that reads JSON numbers with every digit sent
  search.py                       the top bar's search, GET /search: the check on the text, one query over the kinds
                                  each area gives it, the order, the limit of 5 and the counts (K1 to K8)
  sample.py                       what every area's sample data shares: the time a sample record was put down at,
                                  which made-up teammate added it and which last changed it (U14), and the lines a
                                  won deal was sold with, which its accepted quote and its invoice both have (M3)
  holds.py                        what holds a deal or an organization from being deleted: the Hold each area gives,
                                  the counts for the delete dialog and the refusal (D4)
  months.py                       the last 12 months, which every area's charts by month show
  cli.py                          seed and empty commands, for the local copy only, across every area: each area's
                                  sample data in order, its records counted, and every table but the people's and
                                  the settings' wiped, in the order their foreign keys allow
  migrations/                     Alembic, with batch mode on. 0006 adds number_counters, 0007 bills, 0008 quotes
                                  and quote_lines, 0009 the invoices tables, company_logo, and the design and accent
                                  color settings, and 0010 each invoice's issue_order
  crm/
    tables.py                     SQLAlchemy Core tables, and RECORDS, the ones seed and empty count
    schemas.py                    the CRM's Pydantic request and reply models, and the messages for its fields
    rules.py                      stage-change rules, usual probabilities, expected revenue
    timeline.py                   merged timelines and last-activity queries
    search.py                     what the top bar's search looks for in the CRM: organizations, contacts and deals
    sample_data.py                sample records, dated from a given day
    routers/                      meta, organizations, contacts, deals, activities, dashboard
  products/                       the price list (G1 to G12), which never imports crm/
    tables.py                     the products table, and RECORDS
    schemas.py                    its request and reply models, and the messages for its fields
    router.py                     the products routes and their queries
    search.py                     what the top bar's search looks for among products: active ones only
    sample_data.py                the sample products, dated from a given day
  company/                        the company settings (B1), the one area every other can import
    tables.py                     the company_settings, company_logo and number_counters tables
    schemas.py                    the settings' request and reply models, their checks, and the messages for their fields
    router.py                     GET and PATCH /settings, and their queries
    documents.py                  for quotes and invoices: the settings as saved, the company's details as a document
                                  shows them, the logo, and the next number with its count (B15)
    tax.py                        for quotes and invoices: a line's amount, the subtotal, the tax and the total, and
                                  the quantity's type and limits (B16, B17)
    lines.py                      for quotes and invoices: a line as their replies carry it, a document's figures from
                                  its lines, and saving the lines, removing, changing and adding them, and whether a
                                  save changes any
    layout.py                     where everything goes on each page of a quote or an invoice, as layout.ts does it,
                                  from document-designs.json
    pdf.py                        draws a laid-out quote or invoice with ReportLab, in the look the settings have, as
                                  the download both PDF routes give
    fonts.py                      writes shared/document-fonts.json from the font files, with uv run -m accountable.company.fonts
    characters.py                 which characters the fonts can show, from document-fonts.json, the words invoices use
                                  for those they can't, and a quote's text without them for its PDF
    fonts/                        Instrument Sans, Instrument Serif and JetBrains Mono as TTF files, and their OFL
    logo.py                       the logo's check, with Pillow: a real PNG or JPEG within B21's limits
    sample_data.py                the sample company (B12), with its design, accent color and logo
    sample-logo.png               the sample company's made-up logo
  quotes/                         quotes (Q5 to Q37), which imports only crm/tables.py, crm/rules.py, products/tables.py
                                  and company/
    tables.py                     the quotes and quote_lines tables, RECORDS, and the hold a quote has on its deal
    schemas.py                    its request and reply models, and the messages for its fields
    router.py                     the quotes routes and their queries: adding, saving, sending, accepting, declining
                                  and copying, and the PDF's route
    document.py                   a quote as its page and its PDF show it, and as the layout takes it for the PDF
    sample_data.py                the sample quotes, built from the sample products and deals, dated from a given day
  invoices/                       invoices and payments (V1 to V31), which imports crm/tables.py, products/tables.py
                                  and company/
    tables.py                     the invoices, invoice_lines and payments tables, RECORDS, and HOLDS for main.py
    schemas.py                    request and reply models, and the messages for their fields
    figures.py                    what an invoice shows as, its days late and what's owed (V3), with today passed in
    routers/                      invoices (with drafts, issuing and voiding), payments, pdf and money
    sample_data.py                the sample invoices and payments, dated from a given day
  bills/                          the bills from suppliers (E1 to E24), a later area
    tables.py                     the bills table, its Hold on the supplier organization, and RECORDS
    schemas.py                    its request and reply models, the six categories, its checks, and the messages for
                                  its fields
    router.py                     the bills routes, the figures for bills' side of the Money section, and their queries
    sample_data.py                the sample suppliers and their bills, dated from a given day
backend/tests/
  characterization/               what each quote's and invoice's PDF says, page by page, as the characterization
                                  tests in test_quote_invoice_pdfs.py read it back
frontend/index.html               the page, with a short script that applies the saved theme before anything draws
frontend/src/
  main.tsx, App.tsx, styles.css   styles.css holds every color, as light and dark tokens. App.tsx puts
                                  the areas together, the dashboard's one Money section included
  test-utils.tsx, test-setup.ts   the unit tests' helpers, and test-supabase.ts, which stands in for Supabase's client
  lib/                            fetch client, session, query defaults, money in dollars and in cents, reading a typed
                                  price, date formatting, useToday, validation, files.ts for a file's bytes as base64
                                  and a picture's size,
                                  the saved theme, and for every area's records and forms: records.ts, with who added and
                                  changed a record and the hooks that save and delete one, saveErrors.ts, which shows a
                                  save's errors beside its fields, useCloseIfUnreadable.ts, and notify.ts, which
                                  shows messages and keeps each to its session
  components/                     Shell, SignIn, UserMenu, DataTable, RecordPicker, LoadFailed, Chip and others,
                                  Confirm: the dialog that asks before anything that can't be undone, which
                                  ConfirmDelete builds on, RecordLayout: a record page's header, panels, the panels
                                  other areas add and who added and changed it, and Search: the top bar's search box,
                                  which knows nothing about any area's records. DataTable and RecordLayout's header
                                  take a row's or a page's own button and Delete together, and DataTable says what
                                  a filter leaves out
    MoneySection.tsx              the dashboard's Money section, two sides in shared rows, and the parts both sides
                                  are built from: MoneyColumn, OwingPanel, MoneyFigure and MonthsPanel
    charts/                       what any area's chart can use: ChartTooltip, useSize, and the axes' text and the top
                                  of a money axis, and monthColumns.tsx, the layout the Money section's two month
                                  charts share
  crm/
    queries.ts, deals.ts, Timeline.tsx, searchGroups.tsx and others
    forms/                        organization, contact, deal and activity forms
    board/                        Board, Column, DealCard
    charts/                       RevenueChart, DealsWonChart, SalesFunnel, PipelineBand, and their geometry
    pages/                        one file per screen
  products/                       the price list, which never imports crm/
    queries.ts, ProductForm.tsx, searchGroups.tsx
    pages/                        Products and Product
  company/
    SettingsPage.tsx              the Company settings page and its form
    settings.ts                   the settings' type, reading and saving them, and the form's checks
    tax.ts                        the sums on quotes and invoices, as tax.py does them, and reading a quantity
    layout.ts                     where everything goes on each page of a quote or an invoice, as layout.py does it,
                                  and their look from the settings
    DocumentDrawing.tsx           draws laid-out pages as SVG, for a quote's and an invoice's preview and the sample
    characters.ts                 which characters invoices can show, as characters.py says
    DocumentsPanel.tsx            the Documents panel: design, accent color, logo, and the preview App.tsx gives it
    documentPreview.ts            the look the panel's sample is drawn in, and the type of the drawing App.tsx hands the page
    accent.ts                     the accent color's check (B20)
  quotes/                         quotes, which imports only crm/queries.ts, crm/deals.ts, products/queries.ts and
                                  company/
    queries.ts                    the quotes' types, reads and saves
    status.ts                     the statuses, a sent quote's expiry from today, their chips, and the figures above
                                  the Quotes table
    QuotePreview.tsx              a quote's preview: the quote as the layout takes it, drawn as an invoice's is
    QuoteForm.tsx                 a draft's form and its lines, the preview as it's typed, and taking a save's reply
    StatusChip.tsx                a quote's status as a chip
    panels.tsx                    the Quotes panels on a deal's and an organization's page
    dialogs.tsx                   the deal picker for New quote, and the dialogs for Mark as sent, Accept and Decline
    pages/                        Quotes and Quote
  invoices/                       invoices and payments, which imports crm/queries.ts, crm/deals.ts, products/queries.ts
                                  and company/
    queries.ts, DraftForm.tsx, PaymentForm.tsx, panels.tsx, status.ts, InvoiceChip.tsx
    SampleInvoice.tsx             the made-up invoice the Company settings page shows, through App.tsx
    MoneySection.tsx              InvoicesMoney, invoices' side of the dashboard's Money section, left of bills'
    charts/                       HowLate and PaymentsChart
    pages/                        Invoices and Invoice
  bills/                          the bills from suppliers, a later area
    queries.ts                    its types, reads and saves, the Money figures, and marking a bill paid and unpaid
    categories.tsx                the six categories in order, with their labels, colors and round swatch
    status.tsx                    unpaid, overdue and paid from today, their chip, and the paid date's checks
    BillForm.tsx, MarkPaidDialog.tsx, DeleteBill.tsx, and BillsPanel.tsx, an organization's bills
    charts/                       MoneySection, with BillsMoney, bills' side of the Money section, DueTimeline and
                                  SpendingChart, and StackSegment, which draws a segment of a stacked column for
                                  both and keeps a small one tall enough to see
    pages/                        Bills and Bill
frontend/dist/                    the built frontend, from npm start and Render, git-ignored
e2e/
data/                             the local copy's database and what it needs to sign its own tokens, created on first
                                  run and git-ignored
```

### Layout rules

Accountable will grow from a sales CRM into a Business OS, including ERP, so the layout leaves room for the next business area and adds nothing else. `backend/tests/test_layout.py` and `frontend/src/layout.test.ts` enforce the rules a test can check.

- **Each business area has a folder of its own, on both sides.** `crm/` holds everything specific to the sales CRM, and `products/` the price list. A later area gets a folder beside them with its own tables, routes and pages: quotes, invoices and bills have theirs, in `quotes/`, `invoices/` and `bills/` on both sides. What areas share comes from the top level.
- **Imports between areas go one way.** `crm/`, `products/` and `company/` are the first areas, and import no other area but `company/`, so `crm/` never imports `products/`, and neither ever imports a later area. A later area builds on them, and may import only these of theirs: on the backend, `crm/tables.py` and `products/tables.py`, for foreign keys and reads, and `crm/rules.py`, so a deal changes stage the one way however it's asked for, such as when a quote is accepted; on the frontend, `crm/queries.ts` and `products/queries.ts`, for their types and reads, and `crm/deals.ts`, such as which stages are open. Any area may import `company/`. Later areas never import each other.
- **A later area shows its records on the CRM's pages through `App.tsx`,** never by changing the CRM's queries or replies. A deal's quotes come from the quotes area's own route, such as `/api/quotes?deal_id=7`, in a panel the quotes area gives `App.tsx`, which hands it to the deal's page (R7). The dashboard takes sections the same way (H10). So an organization's bills come from `/api/bills?organization_id=7`, in the Bills panel, a deal's invoices from `/api/invoices?deal_id=7`, in the Invoices panel, and the Money section's two rows from `/api/invoices/money` and `/api/bills/dashboard`, never from `/api/dashboard`. Every area's routes start with words of their own after `/api`, which `backend/tests/test_layout.py` checks, so `main.py` can give a field error the right area's messages.
- **A later area's record can hold a deal or an organization** (D4). The area says which of its columns hold one, as a `Hold`, and `main.py` hands every area's holds to the CRM's delete routes through the app, so the CRM never names the area. Quotes give one, on `quotes.deal_id`, with the word `quote`, invoices two, on `invoices.deal_id` and `invoices.organization_id`, with the word `invoice`, and bills one, on `bills.organization_id`, with the word `bill`.
- **`company/` holds the company settings, on both sides.** It's an area beside `crm/` and `products/`, called `company/` because the backend's `settings.py` already decides which copy runs. It imports only the top level, and never another area. It isn't at the top level because not every area needs it: the CRM and products don't. It's the one area every other can import: later areas that need the company's details, such as quotes and invoices, can import it. `company/documents.py` gives them the settings as saved and each document's next number, and takes from `main.py` where each kind keeps the numbers it has taken, so a changed prefix is checked against them (B6). `company/tax.py` and `company/tax.ts` give them the sums on their lines, `company/lines.py` the saving of those lines, and `company/layout.py`, `company/pdf.py`, `company/layout.ts` and `company/DocumentDrawing.tsx` their pages, on the PDF and in the preview. The sample company is in `company/sample_data.py`, and the function that fills a new database fills it too.
- **The top level holds only what every area needs.** Signing in and people are needed by every area, so `auth.py` and `users.py` sit there, and `users.py` holds the made-up teammates that any area's sample records are put down to. `sample.py` gives every area's sample data the same times of day and the same rule for which teammate added and last changed each record. It also gives quotes' and invoices' sample data their lines, from the price list each reads, because the two never read each other: a won deal's lines follow from its value alone, so its accepted quote and its invoice have the same ones. `who.py` gives every area's record tables the same four columns, `created_at`, `updated_at`, `created_by` and `updated_by`, and what saves and replies do with them. `api.py` has the base request model and its checks, the field types such as names, emails, websites, ids, dollars and cents, and the errors shown beside a field. Each area keeps the messages for its own fields, and `main.py` hands the error handler the messages of the area whose route a request reached, from the words the route starts with. Two areas can each have a field of one name with different rules: the CRM's activities need a description, and a product's is optional. The top bar's search spans every area, so `search.py` sits at the top level too: it runs the one query and puts the results in order, and each area's own `search.py` says what to look for in its tables. `holds.py` lets any area's records hold a deal or an organization (D4), and `months.py` gives every area's charts by month the same 12 months. An area can import any of these, but they never import an area, so `main.py` passes `db.py` the function that fills a new database, passes `search.py` each area's kinds and puts each area's holds on the app. `main.py` keeps one list of areas, each with its routers, its fields' messages, its search kinds, its holds and where its documents keep their numbers, so a later area joins with one entry. Only `main.py`, `cli.py` and the migrations name an area's folder.
- **One database setup.** All tables share one `metadata` and one migration history, and anything specific to SQLite or Postgres stays in `db.py` and the migrations. There's no raw SQL, check constraints included, apart from turning on row-level security in the migrations, which SQLAlchemy can't say.
- **A router file holds its routes and their queries.** The dashboard's figures and funnel live in its router. `products/`, `company/`, `quotes/` and `bills/` each have one router, so it's `router.py` in their folder, with no folder around it. `invoices/` has four, so they're in `invoices/routers/`, as the CRM's are in `crm/routers/`. In `crm/`, a module outside `routers/` exists only because several files use it, as `quotes/document.py` does, which the router and the PDF both use, and each area's `search.py` exists because the top-level `search.py` needs it.
- **How quotes and invoices look is in `company/`.** The choice of design, the accent color and the logo are company settings, which `company/` keeps and checks, and both areas draw the designs, so the drawing is in `company/` too, with each kind's words in `shared/document-designs.json`. Each area builds its document's plain values, the quote's in `quotes/document.py` and `quotes/QuotePreview.tsx`, and the invoice's in `invoices/routers/pdf.py` and `invoices/pages/Invoice.tsx`, and hands them to the shared layout. Each also keeps its own rules for what a new line starts from, its checks and its messages, and hands the lines to `company/lines.py` to save. The Company settings page shows the sample invoice through a component `App.tsx` hands it, so `company/` never imports `invoices/`.
- **`components/` and `lib/` hold only what any area could use.** Anything that knows about deals or contacts goes in `crm/`, and anything that knows about products in `products/`. The search box is in `components/` and knows nothing about records: each area's `searchGroups.tsx` says what its results look like, and `App.tsx` hands them to the box and the box to the shell. `App.tsx` also gives the shell its sections, and the CRM's pages the panels and sections later areas add. What any area's chart needs, such as its tooltip and the axes' text, is in `components/charts/`, and the CRM's charts and their geometry stay in `crm/charts/`. A record page's layout, who added and last changed a record, the hooks that save and delete records, the checks on a form's fields and a save's errors shown beside them are in `components/` and `lib/`, so `products/` and any later area's pages and forms use the same ones. Among the top-level files, `components/` and `lib/`, only `App.tsx` names an area's folder, `company/` included, which it names for the Company settings route. The menu opens the page by its address, so `components/` doesn't name `company/`.
- **Only `lib/api.ts` talks to the backend,** so every reply gets the same error handling, **and only `lib/session.ts` talks to Supabase.** **Messages go through `lib/notify.ts`,** so each stays with its session (U5). ESLint refuses `toast` from Sonner anywhere else but the tests.
- **No extra layers.** No service or repository classes, base classes, generic routers that build routes for each record, or a folder per record type. Split a file when it's become hard to work in, not before.
- **Tests stay flat for now.** Nothing imports them, so moving them later costs nothing.

## Libraries

Versions were checked on 2026-10-31, and pypdf's on 2026-11-05. All of them accept React 19.3, and Tailwind's Vite plugin and Vitest both accept Vite 8. Several are recent major versions, so check their current docs when working on them rather than relying on memory, especially TanStack Table 9, React Router 8, Vite 8, Vitest 5 and Zod 4.

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
| PDFs | ReportLab 5, for quotes and invoices, with Pillow for the logo |
| Checking tokens | PyJWT, with `cryptography` for Supabase's signing keys |
| Frontend tools | `typescript`, `@vitejs/plugin-react`, `@tailwindcss/vite` |
| Test tools | Vitest, `@vitest/coverage-v8`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `jsdom`, `pytest`, `pytest-cov`, `httpx`, `pypdf` 6, `@playwright/test` |
| Code checks | Prettier, ESLint 9 with `typescript-eslint`, `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y`, ruff, ty, gitleaks, lefthook for the git hook, GitHub Actions for CI |

- **Fonts:** the brand skill says Google Fonts. The npm packages hold the same fonts, so they look the same and work offline (C2).
- **Drag and drop:** `@dnd-kit/core` was last released in December 2024, though it's still by far the most used, at about 40 million downloads a week. Its successor, `@dnd-kit/react`, is active but was still at 0.5.3 when checked. Accountable uses the stable package, whose React range covers React 19.
- **Two TypeScripts:** the type check uses TypeScript 7, from `frontend/`. `typescript-eslint` can't read TypeScript 7 yet, because it has no JavaScript API, so the root has TypeScript 6.0 for ESLint alone. When `typescript-eslint` supports 7, the root one goes.
- **ESLint 9:** `eslint-plugin-jsx-a11y` doesn't support ESLint 10 yet.
- **Migrations:** Alembic is here because people have real data in the database, and later features will change the tables. Without migrations, the only way to pick up a new column would be a reset that wipes that data. Migrations run by themselves when the backend starts, on both databases.
- **Sign-in and Postgres:** these three came with sign-in. `@supabase/supabase-js` is Supabase's own client, and handles signing in, keeping the session and renewing the token, which would otherwise be hand-written against Supabase Auth's API. psycopg is what SQLAlchemy needs to reach Postgres at all. PyJWT checks token signatures against Supabase's public keys, which isn't something to hand-roll.
- **PDFs:** ReportLab is the most used Python library for making PDFs, under a BSD licence, and makes both quotes' and invoices' PDFs. It and Pillow install from uv as wheels, with nothing for the system to provide, so they run on Render's native Python runtime. WeasyPrint, which turns HTML into PDF, would need Pango from the system, so it can't. Pillow also checks the logo (B21), so it isn't a second new library. The fonts the PDFs carry are the app's own three, as TTF files under the OFL in `company/fonts/`, since the npm packages hold only web fonts.
- **pypdf:** for the tests only. They read a PDF's text back to check its figures, and a cut-down font stores glyph numbers, so it takes a reader that follows the font's map back to letters. Pure Python, with no dependencies, under a BSD licence.
- **Fonts in the shared app:** the same Fontsource files are built into `frontend/dist`, so the shared app loads nothing from outside its own address but Supabase.
