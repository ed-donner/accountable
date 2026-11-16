# Spec: the Accountable MVP

This spec turns [intent.md](intent.md) into numbered requirements and a design to build from. Where the two disagree, intent.md wins and this spec should be fixed. The stack is in [TECH_STACK.md](TECH_STACK.md), and the look comes from the brand skill (`.claude/skills/brand/SKILL.md`).

Requirement IDs (R1, R2, …) are stable: refer to them in tests, commits and `docs/STATUS.md`.

---

## Part 1: Requirements

### 1.1 Running the app

- **R1** `npm run dev` starts the backend and frontend together on Mac, Linux and Windows. The app opens at `http://localhost:5173` and lands on the Dashboard.
- **R2** It works with no internet connection, which means fonts and every other asset are bundled, with nothing loaded from a CDN.
- **R3** On first start, when the database file doesn't exist, the backend creates it and fills it with the sample data.
- **R4** `npm run seed` deletes all data and reloads the sample data. It works whether or not the app is running.
- **R5** Every change is saved to the database right away and is still there after a browser refresh and after a restart.
- **R6** `npm test` runs every unit and end-to-end test against a separate test database and fails if any test fails. It never touches the user's data.
- **R7** `docs/STATUS.md` explains how to install and run the app in steps a non-technical person can follow.

### 1.2 Records

- **R8 Organization**: name (required), website, industry, notes.
- **R9 Contact**: name (required), email, phone, job title, organization (optional), status (`lead`, `qualified` or `customer`, required, default `lead`).
- **R10 Deal**: name (required), organization (required), main contact (optional), stage (required), value in US dollars (required, 0 or more), probability of close (whole number 0–100), close date (required), plus its position within its pipeline column.
- **R11 Activity**: type (`note`, `call` or `email`), contact and/or deal (at least one), description (required), when it happened (date and time, default now), follow-up date (optional), done (default false).
- **R12 Stage change entry**: created by the system whenever a deal's stage changes, recording the deal, the old stage, the new stage and when it happened. It shows in timelines and recent activity as "Moved from Proposal to Negotiation". It can't be edited or deleted by hand.
- **R13** The stages and their usual probability of close are fixed:

  | Stage | Probability | Open? |
  |---|---|---|
  | New | 10% | yes |
  | Qualified | 25% | yes |
  | Proposal | 50% | yes |
  | Negotiation | 75% | yes |
  | Won | 100% | no |
  | Lost | 0% | no |

### 1.3 Deal rules

- **R14** A new deal takes its stage's probability unless one is entered.
- **R15** When a deal's stage changes, by drag, keyboard or the edit form, it takes the new stage's probability, replacing any value set by hand. A probability edited by hand without a stage change is kept.
- **R16** When a deal moves into Won or Lost, its close date becomes today. It can be edited afterwards. Moving a deal out of Won or Lost leaves the close date unchanged.
- **R17** A deal is **late** when it is open (not Won or Lost) and its close date is before today. Late deals stand out in the Deals table and on their pipeline card (see D21).
- **R18** Expected revenue for a deal is value × probability ÷ 100, rounded half up to whole cents. Totals add up the rounded figures for each deal, on the server and in the browser alike.

### 1.4 Tables (Organizations, Contacts, Deals)

- **R19** Each table has a search box that filters rows as you type, matching any visible text column, case-insensitive.
- **R20** Clicking a column heading sorts by that column, and clicking again reverses the order. The current sort shows in the heading.
- **R21** Each table has an add button (New organization, New contact, New deal) that opens a form.
- **R22** Each row has Edit and Delete actions. Clicking the row's name opens the record's page.
- **R23** The Contacts table has a status filter: All, Lead, Qualified, Customer.
- **R24** Tables scroll and show every matching row, with no pagination needed at up to about 1,000 rows.
- **R25** An empty table, or a search with no results, shows a short plain message and the add button.

### 1.5 Deleting

- **R26** Every delete asks for confirmation first, and the dialog says exactly what will happen to linked records, with counts.
- **R27 Deleting an organization**: its contacts stay, with no organization. If it still has deals, it **can't be deleted**. The dialog says "Acme has 3 deals. Move them to another organization or delete them first." and offers no Delete button.
- **R28 Deleting a contact**: deals where they were main contact stay, with no main contact. Activities linked only to this contact are deleted. Activities also linked to a deal stay on that deal.
- **R29 Deleting a deal**: its stage change entries are deleted. Activities linked only to this deal are deleted. Activities also linked to a contact stay on that contact.
- **R30 Deleting an activity** deletes just that activity, after confirmation.

### 1.6 Record pages

- **R31 Organization page**: its details, an Edit action, its contacts and its deals (each linking to its own page), and the total value of its open deals.
- **R32 Contact page**: their details, status, organization (linked), their deals as main contact, and their timeline.
- **R33 Deal page**: its details, stage, value, probability, expected revenue, close date (marked if late), organization and main contact (linked), and its timeline.
- **R34** A timeline lists the record's activities and, for a deal, its stage change entries, newest first. Each entry shows its type, description, date and time, and any follow-up date with its done state.

### 1.7 Activities and follow-ups

- **R35** From a contact or deal page, Log activity opens a form with type, description, when it happened, an optional follow-up date, and an optional link to the other kind of record. From a contact, you can pick one of their deals; from a deal, you can pick any contact, with its main contact suggested first.
- **R36** An activity linked to both a contact and a deal shows in both timelines.
- **R37** Activities can be edited, deleted and marked done from any timeline they appear in.
- **R38** An activity with a follow-up date that isn't done shows on the dashboard as **overdue** (date before today), **due today**, or **upcoming** (any later date). Marking it done removes it from the dashboard.

### 1.8 Pipeline (its own section)

- **R39** Pipeline is its own item in the left menu, after Overview, and opens at `/pipeline`, so a refresh stays on it. The menu item shows the open deal count. The Pipeline page shows one column per stage in R13's order, each holding its deals as cards in their saved order.
- **R40** Dragging a card to another column changes the deal's stage (applying R15 and R16 and creating a stage change entry). Dragging within a column changes its position. A card can be dropped at any point in a column and stays exactly there, including after a refresh.
- **R41** Everything in R40 can also be done by keyboard. Focus a card, press Space to pick it up, use the arrow keys to move it, press Space to drop it or Escape to cancel. Each card also has a "Move to…" menu.
- **R42** Each column has an add button that creates a deal at that stage, at the top of the column.
- **R43** The board header shows the total value and expected revenue of all open deals. Each column header shows its deal count, total value and expected revenue. All figures update the moment a card moves, before the server replies.
- **R44** If saving a move fails, the card goes back to where it was and a short error message appears.

### 1.9 Dashboard

- **R45** Headline figures: open pipeline value (with the number of open deals), expected revenue of open deals, revenue won this month, and win rate over the last 12 months (won ÷ (won + lost), by close date).
- **R46** A **line chart** of revenue won per month for the last 12 months up to and including the current month.
- **R47** A **bar chart** of the number of deals won per month over the same 12 months.
- **R48** A **funnel** showing, for each stage from New to Won, the total value of deals that have reached that stage or gone past it. A deal "reached" a stage if it is in it now or its stage history passed through it. Lost deals count up to the furthest stage they reached before Lost. Each deal counts at every stage up to the furthest one it reached, so a deal created straight at Proposal also counts at New and Qualified, and the funnel never widens.
- **R49** **Recent activity**: the 10 most recent activities and stage change entries across all records, each linking to its contact or deal.
- **R50** **Follow-ups**: every open follow-up, grouped as Overdue, Due today and Upcoming, soonest first, each with a checkbox to mark it done and a link to its contact or deal.
- **R51** Every dashboard figure is calculated from the current data and changes as soon as the data does (for example after a deal is marked won or a follow-up is added).

### 1.10 Sample data

- **R52** About 15 organizations across at least 5 industries, 40 contacts across all three statuses, 30 deals across all six stages, and 80 activities.
- **R53** Dates are generated relative to the day the seed runs, so the app always looks current. That means Won and Lost deals spread over the past 12 months with every month having at least one Won deal, open deals closing over the next few months, 3–4 late deals, and follow-ups with some overdue, one or two due today and some upcoming.
- **R54** Every deal past New has stage change entries that match its path, so timelines and the funnel look real.
- **R55** Names, companies, emails and phone numbers are clearly made up (for example `example.com` emails and `555` phone numbers).

### 1.11 Quality

- **R56 Speed**: with about 1,000 records in each table, pages open, searches filter and actions take effect without a noticeable wait (under about 200 ms for searching and sorting).
- **R57 Keyboard**: every action can be done with the keyboard alone. Focus is always visible, dialogs trap focus and return it when they close, and Escape closes them.
- **R58 Labels and contrast**: every form field has a visible label, errors are announced next to the field, and all text meets WCAG AA contrast (4.5:1 for body text, 3:1 for large text).
- **R59** No errors or warnings in the browser console during normal use.
- **R60** Light mode only, laid out for screens 1280 px wide and up. It shouldn't break between 1024 and 1280 px.
- **R61** Before calling the MVP done, someone uses every section and every action above in a real browser, the way a salesperson would, and checks each screen by eye.

### 1.12 Out of scope

Sign-in, accounts or multiple users; dark mode; phone layouts; AI features; email, calendar or phone integrations; currencies other than US dollars; reports beyond the dashboard; tags or custom fields; editing pipeline stages; import or export.

---

## Part 2: Design

### 2.1 Architecture

```
Browser ──► Vite dev server (5173) ──/api proxy──► FastAPI (8000) ──► SQLite file
            React + TypeScript                     SQLAlchemy Core
```

- **D1** The frontend calls the backend's JSON API under `/api`, which Vite proxies to port 8000 in development.
- **D2** The database file is `backend/data/accountable.db`, and git ignores it. The `ACCOUNTABLE_DB` environment variable overrides the path, and the tests set it to a temporary file.
- **D3** The backend does the business rules (R14–R16, the stage change entries, delete rules, dashboard figures). The frontend only repeats them for instant feedback on the pipeline (R43), then uses the server's answer. It takes stage probabilities from `GET /stages` rather than keeping its own copy.

### 2.2 Repository layout

```
package.json            npm scripts, workspaces: ["frontend"]
pyproject.toml, uv.lock
backend/
  app/
    main.py             FastAPI app: includes each module's router; startup creates + seeds the DB if new
    settings.py         environment settings (ACCOUNTABLE_DB, ACCOUNTABLE_TODAY) and today()
    db.py               engine, metadata, every table definition and the values its columns allow
    stages.py           the stages and their probabilities (R13), and the deal rules as plain functions (R14–R18)
    api.py              shared by every route: request field types, the 422 field messages, delete preview shape
    organizations.py    routes, request/response models, queries and the delete rule for organizations
    contacts.py         the same for contacts
    deals.py            the same for deals, plus move/renumber and stage change entries
    activities.py       the same for activities and timelines
    dashboard.py        the dashboard figures and their route
    seed.py             sample data generator; `python -m backend.app.seed --reset`
  tests/                pytest, one file per module
frontend/
  src/
    main.tsx, App.tsx   entry, routes, query client
    api.ts              the one fetch wrapper: base URL, JSON, turning errors into field messages
    format.ts           money and date formatting
    styles/             tokens.css, global.css
    components/         UI shared by two or more features: AppShell, DataTable, Drawer, ConfirmDialog,
                        Toast, StageBadge, Field, PageHeader, RecordLayout, RowMenu, useReturnFocus
    features/
      overview/         the Overview page and its panels and charts
      pipeline/         the board, its cards and the optimistic move
      deals/            table, record page, form, queries and types
      contacts/         the same for contacts
      organizations/    the same for organizations
      activities/       Timeline, ActivityForm and follow-up queries, used by the record pages and Overview
e2e/                    Playwright tests
```

**How the code is grouped.** Both halves are grouped by feature, not by technical layer. Everything about deals is in `deals.py` on the backend and `features/deals/` on the frontend. On the backend, a route can query the database directly. A rule moves into a plain function only when it is shared or worth testing on its own, as the deal rules in `stages.py` are. On the frontend, each feature keeps its own pages, forms, CSS Modules, TanStack Query hooks and types. A component moves to `components/` only when a second feature uses it. There are no base classes, repositories or generic CRUD helpers.

**How it grows.** A new section in the same area (for example Products) is one more backend module and one more feature folder. When a second business area arrives, such as invoicing for the ERP, the backend modules go into one package per area (`app/crm/`, `app/invoicing/`), and each area gets its own table definitions. All tables are in `db.py` for now so that a migration tool (Alembic) can be added in one place. That happens with the first schema change after real data exists, or the move to Supabase.

### 2.3 Libraries

| Need | Library | Why |
|---|---|---|
| Routing | React Router | Standard |
| Server data and caching | TanStack Query | Caching, refetch after changes, optimistic pipeline moves |
| Tables | TanStack Table | Sorting and filtering without hand-rolling them |
| Long tables | TanStack Virtual | Above 200 rows, only the rows in view are drawn, so search and sort stay under 200 ms (R56) |
| Charts | Recharts | Line, bar and funnel charts, and easy to theme |
| Drag and drop | dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`) | Sortable columns and a keyboard sensor built in (R41) |
| Dialogs, menus, toasts | Radix UI primitives | Accessible focus handling (R57). Selects are the native HTML `<select>`, which is accessible as it is |
| Forms | React Hook Form + Zod | Validation with field-level errors |
| Dates | date-fns | Formatting and date maths |
| Icons | lucide-react | Clean line icons |
| Fonts | `@fontsource/instrument-sans`, `@fontsource/instrument-serif`, `@fontsource/jetbrains-mono` | Brand fonts, bundled for offline use (R2) |
| Backend | FastAPI, SQLAlchemy Core, Pydantic, Uvicorn | From TECH_STACK.md |
| Running both | `concurrently` | One `npm run dev` on every OS |

Styling is plain CSS with design tokens as CSS custom properties (2.8) and CSS Modules per component.

### 2.4 Data model

All IDs are integer primary keys. Timestamps are stored as ISO 8601 UTC, dates as `YYYY-MM-DD`.

**organizations**: `id`, `name` (not null), `website`, `industry`, `notes`, `created_at`, `updated_at`

**contacts**: `id`, `name` (not null), `email`, `phone`, `job_title`, `organization_id` → organizations (nullable, `ON DELETE SET NULL`), `status` (`lead|qualified|customer`), `created_at`, `updated_at`

**deals**: `id`, `name` (not null), `organization_id` → organizations (not null, `ON DELETE RESTRICT`), `main_contact_id` → contacts (nullable, `ON DELETE SET NULL`), `stage`, `value_cents` (integer, ≥ 0), `probability` (0–100), `close_date`, `position` (integer, order within the stage), `created_at`, `updated_at`

**activities**: `id`, `kind` (`note|call|email|stage_change`), `contact_id` (nullable), `deal_id` (nullable), `description`, `occurred_at`, `follow_up_date` (nullable), `done` (bool), `from_stage`, `to_stage` (stage changes only), `created_at`, `updated_at`. Check: at least one of `contact_id` and `deal_id` is set.

- **D4** Money is stored as whole cents to avoid rounding errors and sent to the frontend as cents.
- **D5** Stage change entries are rows in `activities` with `kind = stage_change`, so timelines and recent activity come from one query. The API refuses to create, edit or delete them directly.
- **D6** Delete rules (R27–R29) are done by the delete function in the record's own module (`organizations.py`, `contacts.py`, `deals.py`) inside one transaction, not left to `ON DELETE` alone, because "delete the activity only if it has no other link" needs logic. SQLite foreign keys are turned on (`PRAGMA foreign_keys = ON`).
- **D7** Indexes on every foreign key, `deals(stage, position)` and `activities(follow_up_date, done)`.
- **D8** Positions are integers. A move renumbers the source and target columns (0, 1, 2…) in the same transaction, which is simple and fast at this size.

### 2.5 API

All under `/api`, JSON in and out. Validation errors return 422 with a message per field. A blocked delete returns 409 with a message.

| Method and path | Purpose |
|---|---|
| `GET /stages` | Stages with default probability and open flag |
| `GET /organizations` | All, with `contact_count`, `deal_count`, `open_deal_value_cents` |
| `POST /organizations` | Create |
| `GET /organizations/{id}` | Detail with contacts and deals |
| `PATCH /organizations/{id}` | Update |
| `GET /organizations/{id}/delete-preview` | What deleting will do (counts, `blocked` flag and reason) |
| `DELETE /organizations/{id}` | Delete (409 if it has deals) |
| `GET /contacts?status=` | All, with organization name |
| `POST`, `GET`, `PATCH`, `DELETE /contacts/{id}`, `GET /contacts/{id}/delete-preview` | As above. Detail includes deals and timeline |
| `GET /deals` | All, with organization and contact names, `expected_cents`, `is_late` |
| `POST /deals` | Create (applies R14, puts it at the top of its column) |
| `GET`, `PATCH`, `DELETE /deals/{id}`, `GET /deals/{id}/delete-preview` | As above. PATCH applies R15/R16 and logs a stage change if the stage changed. Detail includes timeline |
| `POST /deals/{id}/move` | Body `{ "stage": "Proposal", "index": 2 }`. Changes stage and/or position (R40) |
| `GET /activities?contact_id=&deal_id=` | Timeline entries, newest first |
| `POST /activities`, `PATCH /activities/{id}`, `DELETE /activities/{id}` | Notes, calls and emails only |
| `GET /dashboard` | Everything in R45–R50 in one response |

- **D9** "Today" is the server's local date, used for late deals, follow-up groups and R16.
- **D10** Search and sort happen in the browser, since each list is at most about 1,000 rows (R24, R56).

### 2.6 Frontend behaviour

- **D11** Lists and details are cached with TanStack Query. After any change, the affected lists, details and `dashboard` are refetched, so every screen agrees (R51).
- **D12** Pipeline moves are optimistic. The board updates its card order and totals at once (R43), sends `move`, and on failure rolls back and shows a toast (R44).
- **D13** Add and edit forms open in a side drawer from the right, so the table stays visible. Delete confirmations and Log activity open in a centred dialog.
- **D14** After saving, the drawer closes and a short toast confirms it ("Deal saved"). Errors stay in the form next to the field.
- **D15** URLs: `/` Overview (the dashboard), `/pipeline`, `/organizations`, `/organizations/:id`, `/contacts`, `/contacts/:id`, `/deals`, `/deals/:id`. Refresh and the back button work on every page.

### 2.7 Screens

**Chosen direction: B** (`docs/mockups/b-summary.html`, both Overview and Pipeline), drawn with the left sidebar described in D16. Between 1024 and 1279 px, the mockup also shows the narrower layout. The stage bar drops below the figures, the charts go full width, and Follow-ups sits beside Recent activity (R60).

**D16 App shell.** A fixed Midnight sidebar on the left with the Accountable wordmark, the five sections with icons (Overview, Pipeline, Deals, Contacts, Organizations; Pipeline shows the open deal count), and the current section highlighted with a Sea Green marker and Sea Mist text. The main area uses the page background with a page title and the page's main action at top right.

**D17 Overview (the dashboard).** The landing page, titled Overview, with today's date on the right. It holds:
- Row 1: one Midnight summary panel (R45). It shows open pipeline value with the open deal count, expected revenue in Sea Green, revenue won this month, and win rate over 12 months. Beside these, a bar of open value by stage, split in stage colours, with each open stage's deal count and value. This is the only dark panel; every other panel is white.
- Row 2: the revenue won line chart (R46, about two-thirds width), headed by the 12-month total and the number of deals won. Beside it, the sales funnel (R48), drawn as stacked trapezoids in stage colours, each labelled with stage, value and deal count.
- Row 3, three columns: the deals won bar chart (R47); Follow-ups (R50), grouped Overdue, Due today and Upcoming, with "4 days overdue" in Raspberry; and Recent activity (R49), where stage changes show as two stage badges with an arrow.
- Charts have light gridlines, no chart borders, Midnight axis labels, and a tooltip with the exact value and month.

**D18 Tables (Organizations, Contacts, Deals).** A white panel holding a toolbar (search box on the left; status filter on Contacts; add button on the right), then the table. Rows are 48 px tall with a light hover tint. Edit and Delete live in a row menu (⋯) that's reachable by keyboard. Columns:
- Organizations: Name, Industry, Website, Contacts, Open deals ($).
- Contacts: Name, Status, Job title, Organization, Email, Phone.
- Deals: Name, Organization, Stage, Value, Probability, Expected, Close date.

**D19 Record pages.** A header panel with the name, key facts and Edit / Delete. Below it, two columns: linked records on the left (contacts, deals, organization), and the timeline with a Log activity button on the right.

**D20 Timeline.** A vertical list, newest first. Each entry has an icon for its kind (note, call, email, stage change), the description, a relative and exact time, and a follow-up chip ("Follow up 18 Nov", Raspberry if overdue) with a done checkbox. Stage changes show the two stage badges with an arrow and have no edit or delete actions.

**D21 Pipeline page.** Below the page title, a white summary strip holds the search box, the open totals (R43), the number of late deals, and the bar of open value by stage. Below it are six columns that scroll sideways if the screen is narrow, and each column's cards scroll on their own.
- **Column headers** are white panels with the stage badge, the add button (R42), the deal count, the total value and the expected revenue. Won and Lost say "closed" instead of expected revenue.
- **Cards** are white and rounded. Each shows the deal name, organization · main contact, a probability bar in the stage colour with its percentage, the value and the close date. Each card has a ⋯ menu with "Move to…" (R41).
- **Won and Lost cards** are muted, with no probability bar, and show the date they closed.
- **A late card** gets a Raspberry "Late" tag and a Raspberry close date, the same marking as in the Deals table.
- **While dragging,** the card lifts with a shadow and the drop point shows as a gap.

**D22 Delete dialog.** States the consequence in plain words, for example "Delete Jane Doe? Their 2 deals will stay, with no main contact. 5 activities will be deleted." A blocked delete (R27) explains why and only offers Close.

### 2.8 Visual design (from the brand skill)

**Brand rules applied:**

1. Instrument Sans for headings and body; Instrument Serif only for an accent (the empty-state line on the dashboard, a tagline); JetBrains Mono for money, numbers, percentages and dates in tables, tiles and pipeline cards.
2. Page background `#F0F4F5`, white panels and cards, rounded corners (12 px panels, 10 px cards), **no outlines** on panels. Depth comes from a very soft shadow.
3. No border down one edge of a panel, and no thin rule across the top of the page.
4. Gradients only where they help, at most a soft fill under the revenue line. Never on panels, buttons or the sidebar.
5. Midnight `#073B4C` for text on light backgrounds; Sea Mist `#CDD8DB` for text on the Midnight sidebar.
6. Sea Green and Marigold are never used for small text on white. Text versions are darkened (2.8 tokens) and checked to 4.5:1.
7. Side-by-side series follow the brand order: Sea Green, Marigold, Coral, then Cerulean, then Raspberry.
8. Plain business English: short labels ("New deal", "Log activity", "Mark done"), no jargon, no exclamation marks.
9. Money always shows its currency: `$12,500` in cells and cards, `$1.2M` only in chart axes, and table headings say "Value (USD)".
10. Light mode only for the MVP. The tokens are set up so dark mode can be added later.

**Tokens** (`frontend/src/styles/tokens.css`):

| Token | Value | Use |
|---|---|---|
| `--sea-green` | `#06D6A0` | Primary buttons (Midnight text), New stage, revenue line |
| `--sea-green-text` | `#047857`-ish, tuned to ≥ 4.5:1 on white | Sea Green used as text or icons |
| `--marigold` | `#FFC145` | Qualified stage, deals won bars |
| `--marigold-text` | `#8A5A00`-ish, tuned to ≥ 4.5:1 | Marigold used as text |
| `--coral` | `#F78C6B` | Proposal stage |
| `--coral-text` | darkened to ≥ 4.5:1 | Coral used as text |
| `--cerulean` | `#118AB2` | Negotiation stage, links, info (white text) |
| `--cerulean-solid` | `#0D6C8C` | Fill behind small white text in Cerulean: Negotiation badge (white on `--cerulean` is only 4.0:1) |
| `--raspberry` | `#EF476F` | Late deals, overdue follow-ups, destructive actions (bars, dots, icons) |
| `--raspberry-solid` | `#C8264F` | Fill behind small white text in Raspberry: Late tag, overdue count, Delete button (white on `--raspberry` is only 3.6:1) |
| `--midnight` | `#073B4C` | Body text, sidebar background, Won stage |
| `--sea-mist` | `#CDD8DB` | Sidebar text, Lost stage, chart gridlines |
| `--page` | `#F0F4F5` | Page background |
| `--panel` | `#FFFFFF` | Panels and cards |

**Stage colours.** The four open stages take the brand order: New Sea Green, Qualified Marigold, Proposal Coral, Negotiation Cerulean. Won is Midnight (solid, final) and Lost is Sea Mist (muted). Raspberry is kept for alerts (late, overdue, delete), so it never means a stage. Stage badges are pills with the stage colour as fill and the brand's text colour for it.

**Type scale.** Page title 28/600, section title 18/600, body 14/400, small 12/500. Headline tile figures 32 px JetBrains Mono.

**Focus.** A 2 px Cerulean outline with a 2 px offset on every focusable element (R57).

### 2.9 Sample data generator

- **D23** `seed.py` uses a fixed random seed, so the data is the same each time apart from dates, which shift to stay relative to today (R53).
- **D24** For each deal it picks a final stage, builds a believable path to it (for example New → Qualified → Proposal → Lost) and writes a stage change entry for each step with increasing dates (R54).
- **D25** Industries: Software, Manufacturing, Healthcare, Retail, Logistics, Financial Services, Construction. Deal values range from about $2,000 to $150,000.

### 2.10 Testing

| Layer | Tool | Covers |
|---|---|---|
| Backend unit | pytest | Stage rules R14–R16, delete rules R27–R29, move and renumber D8, dashboard figures R45–R50, seed shape R52–R54, API validation |
| Frontend unit | Vitest + Testing Library | Money and date formatting, late flag, optimistic pipeline totals, forms and validation, delete dialog text |
| End to end | Playwright with installed Chrome | One test per success criterion in intent.md: dashboard loads with data; create, search, sort, edit and delete for each table; persistence after reload; status filter; drag and keyboard move on the pipeline with totals and persistence; logging an activity and a follow-up and marking it done; blocked organization delete; no console errors |

The Playwright config starts the app itself with `ACCOUNTABLE_DB` pointing at a fresh seeded test database (R6).

### 2.11 Traceability to intent.md success criteria

| Intent criterion | Requirements |
|---|---|
| 1 Start and land on dashboard with sample data | R1–R3, R7, R52–R55 |
| 2 Add, search, sort, edit, delete, persist, reset | R4, R5, R19–R30 |
| 3 Status filter and linked records | R23, R31–R33 |
| 4 Pipeline drag, probability, totals, late | R13–R17, R39–R44 |
| 5 Timelines and follow-ups | R12, R34–R38 |
| 6 Dashboard figures match | R45–R51 |
| 7 Sharp, on brand, charts | R46–R48, 2.7, 2.8 |
| 8 Speed | R56 |
| 9 Keyboard | R41, R57, R58 |
| 10 Real-browser check | R59, R61 |
