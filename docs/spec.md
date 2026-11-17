# Spec: the Accountable MVP

This spec turns `docs/intent.md` into requirements and a design. The intent says what we're building and why; this says exactly what the MVP does and how it's built. Where the two disagree, the intent wins until this spec is updated.

## Concerns

The product owner confirmed every proposed answer below on 16 Nov 2026, so they're decisions now and the rest of this spec follows them. The numbering is kept because requirements refer to it.

1. **A deal's organization is required, but deleting an organization leaves deals with none.** Proposed: the organization is required when a deal is created, and when it's edited unless it's already empty. A deal with no organization shows "No organization" and a quiet prompt to pick one.
2. **Six pipeline stages, five brand colors.** The brand gives five colors in order for things side by side. Proposed: the four open stages use a sequential Cerulean scale (light to dark, since the stages are ordered), Won uses Sea Green and Lost uses Raspberry. Chart series use the brand order. See [Stage colors](#stage-colors).
3. **Two brand pairings fail contrast for small text.** White on Cerulean is 3.96:1 and white on Raspberry is 3.62:1, under the 4.5:1 needed for normal text. Proposed: the brand colors are used for fills, charts and large or bold text, and darker text shades are used for small text. See [Colors](#colors).
4. **Offline use and Google Fonts.** The brand fonts come from Google Fonts, but the app must work with no internet connection. Proposed: install the fonts as npm packages (Fontsource) so they're served locally.
5. **A non-technical user and a terminal command.** `npm run dev` needs Node.js and uv installed, and a terminal to run it. Proposed: `docs/STATUS.md` gets a plain, step-by-step setup guide for Mac and Windows with links to the installers, and the command opens the browser by itself. A double-click launcher is out of scope for the MVP.
6. **"How much value reaches each stage" can be read two ways.** Proposed: the funnel shows, for each stage from New to Won, the total value of deals that are at that stage now or have moved past it. Lost deals count for the stages they reached before being lost, using the stage-change history. Deals created in the sample data get a history consistent with their stage.
7. **Won deals by month depends on an editable date.** Proposed: a deal counts as won in the month of its close date. A Won or Lost deal's close date can't be in the future, so the charts can't show wins that haven't happened.
8. **A deal activity's place on a contact's timeline is derived, not stored.** If a deal's main contact changes, its activities and stage changes move to the new contact's timeline. Proposed: accept this, since it keeps the data simple and matches "where they're the main contact".
9. **Two delete rules were inferred, not asked.** Deleting a contact removes the activities logged on them, and deleting a deal removes its activities and stage changes. The product owner confirmed both.
10. **"Upcoming" follow-ups have no window in the intent.** Proposed: overdue means a follow-up date before today, and upcoming means today or the next 7 days. Later follow-ups appear on the timelines but not on the dashboard.
11. **The sample data dates.** For the dashboard to look alive whenever it's seeded, the sample data is generated relative to today's date, with a fixed random seed so its shape is the same each time.

## Requirements

Each requirement has an ID so tests and status notes can refer to it. "Must" is required for the MVP to be done.

### General

- **G1** The app runs with `npm run dev` on Mac, Linux and Windows, opens at `http://localhost:5173` and lands on the dashboard.
- **G2** It works with no internet connection once installed. Nothing is loaded from a CDN or a font service at run time.
- **G3** Every change is saved to the SQLite database at once. It's still there after a refresh and after a restart.
- **G4** When the database file doesn't exist, the backend creates it by running the migrations and fills it with the sample data.
- **G5** `npm run seed` deletes all data and loads the sample data again.
- **G6** The app is a single-user app with no sign-in.
- **G7** Lists, search, sort and screen changes respond in under 200 ms at 2,000 contacts, 1,000 deals and 10,000 activities on a typical laptop.
- **G8** Error messages are short, plain and say what to do next, for example "Couldn't save the deal. Check your connection to Accountable and try again." No stack traces or codes are shown to the user.
- **G9** Money is in US dollars, shown as `$48,200` in tables and cards and `$1.2M` only where space is short, such as chart axes. Amounts are whole dollars.
- **G10** Dates are shown as `16 Nov 2026`. The app uses the computer's local date for "today".
- **G11** No errors appear in the browser console during normal use.
- **G12** Each time it starts, the backend applies any new database migrations, keeping all existing data.

### Tables (organizations, contacts and deals)

- **T1** Each table has a search box that filters as you type, across the columns listed for that table.
- **T2** Clicking a column heading sorts by it; clicking again reverses the order. The current sort shows an arrow.
- **T3** Tables show 25 rows a page, with page controls and a count such as "Showing 26 to 50 of 412". Searching goes back to the first page.
- **T4** Each table has an "Add" button that opens a form in a side panel.
- **T5** Each row has Edit and Delete actions. Clicking the row itself opens the record's page.
- **T6** Delete asks for confirmation in a dialog that names the record and says what happens to linked records, using the counts, for example "Acme Ltd has 4 contacts and 2 deals. They'll be kept, with no organization."
- **T7** An empty table, or a search with no results, shows a short message and, for an empty table, the Add button.

### Organizations

- **O1** Fields: name (required), website, industry, notes.
- **O2** Table columns: name, industry, website, number of contacts, number of open deals, open pipeline value. Search covers name, industry and website.
- **O3** The organization page shows its details, its contacts and its deals, each with a link to the record and a way to add a new contact or deal already linked to it.
- **O4** Deleting an organization keeps its contacts and deals, which are left with no organization. Their activities stay.

### Contacts

- **C1** Fields: name (required), email, phone, job title, organization, status (lead, qualified or customer; new contacts default to lead).
- **C2** Table columns: name, organization, job title, email, phone, status, last activity date. Search covers name, email, phone, job title and organization name.
- **C3** The table has a status filter with All, Lead, Qualified and Customer, and counts on each.
- **C4** The contact page shows their details, their organization, the deals where they're the main contact, and their timeline.
- **C5** The timeline holds the contact's own activities plus the activities and stage changes of deals where they're the main contact, newest first. Entries from a deal name the deal.
- **C6** Deleting a contact keeps their deals, which are left with no main contact. Activities logged on the contact are deleted.

### Deals

- **D1** Fields: name (required), organization (required, see Concern 1), main contact, stage (required, default New), value (required, whole dollars, 0 or more), probability of close (0 to 100), close date.
- **D2** The main contact list offers the contacts of the chosen organization first, then everyone else.
- **D3** Each stage has a usual probability: New 10%, Qualified 25%, Proposal 50%, Negotiation 75%, Won 100%, Lost 0%. A new deal takes its stage's probability. When the stage changes, the probability is reset to the new stage's. A probability set by hand stays until the next stage change.
- **D4** When a deal moves to Won or Lost, its close date becomes today. It can be edited afterwards, but not to a date after today (Concern 7).
- **D5** When a deal moves to Won, its main contact's status becomes customer if it isn't already. A status is never lowered automatically, including when a deal moves out of Won.
- **D6** Every stage change, whether from the form or the board, records an entry with the old stage, the new stage and the time. It appears in the deal's timeline as "Moved from Proposal to Negotiation" and in the dashboard's recent activity.
- **D7** A deal is late when it's open (not Won or Lost) and its close date is before today. Late deals show a Raspberry "Late" badge in the table and on their card.
- **D8** Table columns: name, organization, main contact, stage, value, probability, expected revenue (value times probability), close date. Search covers name, organization and main contact. The table has a stage filter.
- **D9** The deal page shows its details, its organization and main contact, and its timeline of activities and stage changes, newest first.
- **D10** Deleting a deal deletes its activities and stage changes.

### Pipeline

- **P1** The board has six columns in order: New, Qualified, Proposal, Negotiation, Won, Lost.
- **P2** Each card shows the deal name, organization, main contact, value, close date and the Late badge when it applies. Open deals show their probability as a ring (see [Screens](#screens)). Clicking a card opens the deal.
- **P3** Dragging a card to another column changes the deal's stage, following D3 to D6. Dragging into Won or Lost closes the deal.
- **P4** A card can be dropped anywhere in a column, including higher or lower in its own column, and stays exactly there after a refresh.
- **P5** Each column header shows its stage, number of deals, total value and expected revenue. The board header shows the total value and expected revenue of open deals only.
- **P6** All totals update the moment a card is dropped, before the server replies. If the save fails, the card goes back and a friendly message says so.
- **P7** Each column has an "Add deal" button that opens the deal form with that stage chosen. The new deal goes at the top of the column.
- **P8** Dragging works with a mouse and with the keyboard.

### Activities and follow-ups

- **A1** Fields: type (note, call or email; required), description (required), date it happened (required, default today), follow-up date (optional), done (only when there's a follow-up date).
- **A2** An activity belongs to exactly one contact or one deal.
- **A3** The contact and deal pages have a "Log activity" form at the top of the timeline. Type, description and an optional follow-up date can be filled in and saved with the keyboard alone, so logging a call with a follow-up takes under 30 seconds.
- **A4** Activities can be edited and deleted from the timeline. Deleting asks first.
- **A5** An activity logged on a deal also appears on the timeline of the deal's main contact (C5).
- **A6** A follow-up that isn't done shows on the dashboard: overdue if its date is before today, upcoming if it's today or within 7 days (Concern 10). Each has a "Mark done" button, and done follow-ups leave the list.

### Dashboard

- **H1** Headline figures in a row: open pipeline value, expected revenue of open deals, revenue won this month, and follow-ups due today or overdue. Each links to the matching screen: the pipeline, the pipeline, the deals table filtered to Won, and the follow-ups list.
- **H2** A line chart of revenue won per month for the last 12 months, ending with the current month.
- **H3** A bar chart of deals won per month over the same 12 months, with deals lost alongside in a second series.
- **H4** A pipeline visual: a horizontal bar for each open stage showing its value and expected revenue, in stage colors, each bar linking to the board.
- **H5** A sales funnel from New to Won as described in Concern 6, drawn as centered bars that narrow, with the value, the number of deals and the share carried on from the previous stage at each step.
- **H6** Recent activity: the 10 latest activities and stage changes across everything, each linking to its record.
- **H7** Follow-ups: overdue first, oldest first, then upcoming, soonest first, each linking to its contact or deal (A6).
- **H8** Every figure matches the data. Marking a deal won or logging a follow-up shows on the dashboard the next time it's opened, with no refresh needed.

### Validation

- **V1** Required fields: organization name; contact name; deal name, organization, stage and value; activity type, description and date.
- **V2** An email address or website is checked for the right format when it's filled in. A website without `https://` is accepted and saved with it added.
- **V3** Errors show under the field in plain words, such as "Enter an email address like name@company.com". The form keeps what was typed.
- **V4** The backend checks the same rules and returns friendly messages per field, so the frontend never relies on its own checks alone.

### Sample data

- **S1** About 12 organizations across at least 5 industries, 40 contacts at every status, 30 deals at every stage and 120 activities, spread over the past 12 months and relative to today.
- **S2** It includes deals won and lost in most of the past 12 months, deals expected to close in the coming months, at least 3 late deals, at least 3 overdue follow-ups and at least 3 follow-ups due in the next 7 days.
- **S3** Each deal has a stage-change history that leads to its current stage, so the funnel and timelines look real.
- **S4** Names and companies are realistic but invented.

## Design

### Architecture

```
Browser (React app, port 5173)
   │  JSON over HTTP, /api proxied by Vite
   ▼
FastAPI (port 8000)
   │  SQLAlchemy Core
   ▼
SQLite file: data/accountable.db
```

- The frontend fetches lists in full and does search, sort and paging in the browser. At the sizes in G7 that's a few hundred kilobytes and keeps every keystroke instant. The API keeps limit and offset parameters so this can move to the server when the data grows.
- The dashboard figures are computed by the backend in one request, so the browser doesn't have to load every activity.
- The backend is the only place business rules live: stage probabilities, close dates on Won and Lost, customer status, stage-change entries and delete rules. The frontend shows the result.

### Repository layout

The frontend and backend are both grouped by section, and each frontend section folder matches one backend module. A new section, such as invoices when ERP arrives, gets its own backend module and frontend folder without touching the others.

```
package.json              npm scripts and workspaces
pyproject.toml, uv.lock   backend dependencies
alembic.ini               migration settings
scripts/dev.mjs           starts both servers, explains a missing tool, opens the browser
backend/
  app/
    main.py               FastAPI app, routers, error handlers, startup
    config.py             settings from environment variables
    deps.py               per-request dependencies: database connection, today's date
    db.py                 engine, metadata, tables
    schemas.py            Pydantic request and response models
    rules.py              stage probabilities and deal rules
    routers/              one module per section, holding its endpoints and their queries:
                          organizations, contacts, deals (with board positions), activities,
                          timeline, dashboard, health
    seed.py               sample data generator
  migrations/             Alembic migrations, starting with the first schema
  tests/                  pytest
frontend/
  src/
    shared/               used by every section: layout, DataTable, SidePanel, ConfirmDialog,
                          toasts, small display pieces, format and stage helpers, API client,
                          generated API types, theme and fonts
    organizations/        tables, record page, form, Query hooks and tests for one section
    contacts/
    deals/
    activities/           timeline and Log activity form, used by contacts and deals
    pipeline/
    dashboard/
e2e/                      Playwright Test
data/                     SQLite file (git-ignored)
```

Frontend unit tests sit next to the code they test. The rules for adding to this layout:

- A new section gets a backend module in `routers/` and a frontend folder. Its endpoints, queries, pages, form and hooks live there.
- Code moves to `shared/` only when a second section needs it.
- Business rules stay in `rules.py` and the backend modules, never in the frontend.
- Every schema change is an Alembic migration, so existing data is upgraded safely.
- The frontend's API types are generated from the backend with `npm run types`, never written by hand.

### Libraries

| Need | Library |
| --- | --- |
| Routing | React Router |
| Server data and caching | TanStack Query |
| Tables | TanStack Table |
| Forms and validation | React Hook Form with Zod |
| Charts | Recharts |
| Drag and drop | dnd-kit (core and sortable) |
| Fonts, served locally | Fontsource: Instrument Sans, Instrument Serif, JetBrains Mono |
| Icons | Lucide |
| Running both servers | concurrently |
| Backend | FastAPI, SQLAlchemy Core, Pydantic, Uvicorn |
| Database migrations | Alembic |
| API types for the frontend | openapi-typescript, generated from the backend's OpenAPI schema |
| Sample data | Faker, with a fixed seed |

### Data model

All tables have an integer `id` primary key and `created_at` and `updated_at` timestamps. Foreign keys are on, with the delete behavior shown.

**organizations**

| Column | Type | Notes |
| --- | --- | --- |
| name | text | required |
| website | text | optional, normalized to start with `https://` |
| industry | text | optional, free text with suggestions from existing values |
| notes | text | optional |

**contacts**

| Column | Type | Notes |
| --- | --- | --- |
| name | text | required |
| email, phone, job_title | text | optional |
| organization_id | int | optional, `ON DELETE SET NULL` |
| status | text | `lead`, `qualified` or `customer` |

**deals**

| Column | Type | Notes |
| --- | --- | --- |
| name | text | required |
| organization_id | int | `ON DELETE SET NULL`, required by the API on create |
| contact_id | int | main contact, optional, `ON DELETE SET NULL` |
| stage | text | `new`, `qualified`, `proposal`, `negotiation`, `won`, `lost` |
| value | int | whole US dollars, 0 or more |
| probability | int | 0 to 100 |
| close_date | date | optional |
| position | float | order within the stage's column, lower is higher up |

**activities**

| Column | Type | Notes |
| --- | --- | --- |
| type | text | `note`, `call` or `email` |
| description | text | required |
| occurred_on | date | required |
| contact_id | int | `ON DELETE CASCADE` |
| deal_id | int | `ON DELETE CASCADE` |
| follow_up_on | date | optional |
| done | bool | false by default |

A check constraint makes exactly one of `contact_id` and `deal_id` set.

**stage_changes**

| Column | Type | Notes |
| --- | --- | --- |
| deal_id | int | `ON DELETE CASCADE` |
| from_stage | text | null for the deal's first stage |
| to_stage | text | |
| changed_at | timestamp | |

Indexes: every foreign key, `deals(stage, position)`, `activities(follow_up_on, done)`, and `activities(occurred_on)`.

**Card order.** Dropping a card between two others sets its `position` to the midpoint of theirs; at the top or bottom it's one less than the first or one more than the last. When two neighbors get closer than 0.000001 apart, the backend renumbers that column as 1, 2, 3 and so on in the same transaction.

### API

All under `/api`. Responses are JSON. Errors use one shape: `{"message": "...", "fields": {"email": "Enter an email address like name@company.com"}}`, with status 400 for validation, 404 for a missing record and 500 for anything unexpected, which is logged on the server and shown to the user as a general friendly message.

| Method and path | Purpose |
| --- | --- |
| `GET /organizations` | list with contact count, open deal count and open value |
| `POST /organizations`, `GET/PATCH/DELETE /organizations/{id}` | create, read with contacts and deals, update, delete |
| `GET /organizations/{id}/delete-impact` | counts used by the confirm dialog |
| `GET /contacts?status=` | list with organization name and last activity date |
| `POST /contacts`, `GET/PATCH/DELETE /contacts/{id}` | as above; read includes organization and deals |
| `GET /contacts/{id}/delete-impact` | |
| `GET /contacts/{id}/timeline` | activities and stage changes per C5, newest first |
| `GET /deals?stage=` | list with organization, contact and expected revenue |
| `POST /deals`, `GET/PATCH/DELETE /deals/{id}` | as above; PATCH applies D3 to D6 |
| `GET /deals/{id}/delete-impact` | |
| `GET /deals/{id}/timeline` | |
| `POST /deals/{id}/move` | body `{stage, before_id, after_id}`; changes stage and position in one transaction |
| `POST /activities`, `PATCH/DELETE /activities/{id}` | create, edit, delete, mark done |
| `GET /dashboard` | headline figures, 12 months of won and lost, pipeline by stage, funnel, recent activity, follow-ups |
| `GET /health` | used by the dev script and e2e tests |

The `today` date comes from the browser in an `X-Local-Date` header, so "late", "overdue" and "this month" match the user's calendar. The backend falls back to its own date when the header is missing.

### Screens

The chosen look is in `docs/mockups/final-dashboard.html` and `docs/mockups/final-pipeline.html`, with a screenshot of each beside it. It's mockup A with the funnel from mockup C and the probability ring from mockup B. Where this section and the mockups differ, this section wins.

**Layout.** A fixed left sidebar on Midnight with the Accountable wordmark and five links: Dashboard, Pipeline, Deals, Contacts, Organizations. The active link has a Sea Green pill behind it. Content sits on the light page background in white panels with 12 px rounded corners, no outlines and a soft shadow. The minimum supported width is 1280 px.

**Page header.** Each page has its title in Instrument Sans 28 px semibold, a short count or summary under it, and the main action (such as "Add contact") on the right as a Sea Green button with Midnight text.

**Tables.** A white panel with the search box and filters above the rows. Rows are 48 px high, with a light hover tint and the Edit and Delete icons shown on hover and on keyboard focus. Numbers and money are right-aligned in JetBrains Mono.

**Forms.** A side panel slides in from the right, 480 px wide, with fields stacked in one column, labels above fields and required fields marked. Save is the primary button; Cancel and Escape close it. Enter in the last field saves.

**Record pages.** Two columns: details and linked records on the left (one third), timeline on the right (two thirds). The details panel has an Edit button.

**Timeline.** A vertical list with a small icon per type (note, call, email, stage change), the description, the date, and for deal entries on a contact the deal name as a link. Follow-ups show a date chip: Raspberry when overdue, Cerulean when upcoming, grey with a check when done.

**Pipeline.** Six columns side by side filling the width, each 1/6 wide with a minimum of 196 px and the board scrolling sideways below that. Each column header has a stage-colored dot, the stage name, the count, and the total and expected revenue in JetBrains Mono. Cards are white, compact and lift with a stronger shadow while dragged. A card shows the deal name, then the organization and main contact, then the value with the probability ring on the right, then the close date and any Late badge. The probability ring is a small circle (30 px) with the percentage in its center and an arc filled to that percentage in the stage's color. Cards in Won and Lost show no ring and say "Closed" before the date. While a card is dragged, a Sea Green line shows where it will land. Won and Lost columns have a faint tint of their stage color so they read as closed.

**Dashboard.** A 12-column grid:

1. Row 1: four headline figure tiles. The value in JetBrains Mono 32 px, the label above in 14 px, a small note under it such as "12 open deals".
2. Row 2: the revenue won line chart (8 columns) and the funnel (4 columns). The funnel has one row per stage from New to Won. Each row has the stage name with its deal count under it on the left, a centered bar in the stage's color in the middle, and the value with the share carried on from the previous stage ("85% of previous") on the right. Each bar's width is in proportion to its value and centered, so the bars narrow like a funnel. The rows spread out to fill the panel's height.
3. Row 3: the pipeline by stage bars (6 columns) and the won and lost bar chart (6 columns).
4. Row 4: follow-ups (6 columns) and recent activity (6 columns).

Charts have light gridlines, no chart borders, tooltips with exact amounts and axis labels in short money form. The line chart uses Sea Green with a soft fill under the line (the one gradient on the page). The bar chart uses Sea Green for won and Coral for lost.

### Brand

**Fonts.** Instrument Sans for headings and body, Instrument Serif for the occasional accent such as the empty dashboard's welcome line, JetBrains Mono for money, numbers, dates in tables and IDs. Body text is 14 px, table text 14 px, labels 13 px.

#### Colors

Defined once as CSS variables in `frontend/src/theme/tokens.css`.

| Token | Value | Use |
| --- | --- | --- |
| `--page` | `#F0F4F5` | page background |
| `--panel` | `#FFFFFF` | panels and cards |
| `--ink` | `#073B4C` | text, sidebar background |
| `--ink-muted` | `#5B7A84` | secondary text on white only (4.6:1) |
| `--sea-green` | `#06D6A0` | primary buttons and fills, Midnight text |
| `--marigold` | `#FFC145` | secondary fills, Midnight text |
| `--coral` | `#F78C6B` | tertiary fills, Midnight text |
| `--cerulean` | `#118AB2` | information fills, large or bold white text |
| `--raspberry` | `#EF476F` | alerts and Lost, large or bold white text |
| `--sea-green-text` | `#047A5C` | Sea Green small text on light (5.3:1) |
| `--marigold-text` | `#8A5D00` | Marigold small text on light (5.8:1) |
| `--coral-text` | `#B5452A` | Coral small text on light (5.5:1) |
| `--cerulean-text` | `#0E7596` | Cerulean small text, links (5.3:1) |
| `--raspberry-text` | `#C42350` | Raspberry small text, field errors (5.7:1) |
| `--sea-mist` | `#CDD8DB` | text on the Midnight sidebar |

Badges with small white text use the darker text shades as their fill. Dark mode tokens are left for later.

#### Stage colors

| Stage | Color |
| --- | --- |
| New | Cerulean at 35% |
| Qualified | Cerulean at 60% |
| Proposal | Cerulean at 80% |
| Negotiation | Cerulean |
| Won | Sea Green |
| Lost | Raspberry |

**Things to avoid.** No border on one edge of a panel, no single-line rule across the top of the page, and no gradients except the one under the revenue line.

**Copy.** Plain business English, short labels, sentence case and no exclamation marks. Buttons say what they do: "Add deal", "Log activity", "Mark done", "Delete contact". Empty states say what's missing and how to add it, such as "No deals at this stage yet."

### Testing

- **Backend (pytest)**: every rule in D3 to D7, the delete rules in O4, C6 and D10, the timeline contents in C5, card positions and renumbering, validation messages, and each dashboard figure against a small hand-made data set.
- **Frontend (Vitest)**: money and date formatting, the table's search, sort and paging, form validation messages, and the optimistic update and rollback on the board.
- **End to end (Playwright with installed Chrome)**: one test per success criterion in the intent, against a fresh seeded test database on its own port. It covers adding, searching, sorting, editing and deleting in each table; the status filter; dragging a card between columns and within a column and checking it after a reload; logging an activity with a follow-up and seeing it on the dashboard; marking a deal won and seeing the dashboard change; and no console errors on any page.
- The tests set the backend's database path with an environment variable, so they never touch `data/accountable.db`.
- Before the MVP is called done, a person goes through every section and action in a real browser as in success criterion 8 of the intent, and the result is noted in `docs/STATUS.md`.

### Out of scope

As in the intent: sign-in and several users, dark mode and phone layouts, AI features, email, calendar and phone integrations, other currencies, reports beyond the dashboard, tags and custom fields, changing the stages, and import or export.
