# Spec: Accountable

This is Accountable as it stands today. Part 1 says what it does; Part 2 says how it's built and how it looks. It follows `docs/TECH_STACK.md` and the brand skill (`.claude/skills/brand/SKILL.md`).

Every change to the product updates this file, so it always describes the whole product. A change's own reasons and build steps live in `docs/changes/<branch name>/`.

Each requirement has an ID, such as `DEAL-2`, so plans, tests and code can point to it. Code comments also cite sections by number (such as "spec 2.6") and the concerns below (such as "concern 1"), so those numbers stay the same.

## The problem

A small business keeps track of its customers and sales in spreadsheets, inboxes and people's heads. Nobody can see at a glance which companies we deal with, who our contacts are, what's in the sales pipeline, what happened last with a customer or what needs doing next.

## The product

Accountable is a business management system: a sales CRM that will grow into a full Business OS, including ERP. Today it's a complete sales CRM for one person, running on their own computer. Think of it as a private Salesforce that does the everyday CRM essentials really well. It should feel sharp, modern and professional, and be a pleasure to use.

It has five sections: the Dashboard, Organizations, Contacts, Deals and the Pipeline board. It keeps four kinds of record: organizations, contacts, deals and activities.

**Who uses it:** one salesperson at a B2B services business, such as an agency or consultancy, using Accountable every day on their own computer in place of a spreadsheet. Their deals run from roughly $5k to $150k and take weeks to a few months to close. No other systems are involved.

## Concerns and decisions

These questions had to be settled to design the product. Each one is decided, and the rest of the spec follows the decisions.

1. **Six stages, five brand colors, and Sea Green comes first.** The brand puts Sea Green first for things side by side, but on a sales board green reads as "won".
   **Decided:** the stage colors are:
   - New: slate, a tint of Midnight
   - Qualified: Marigold
   - Proposal: Coral
   - Negotiation: Cerulean
   - Won: Sea Green
   - Lost: Raspberry

   The middle stages keep the brand's order, and Sea Green goes to the stage where it means success. Contact statuses use the same meanings: Lead slate, Qualified Marigold, Customer Sea Green.

2. **What the sales funnel measures.** "How much value reaches each stage" could mean the value sitting in each stage today, or the value of every deal that got at least that far. The first only repeats the pipeline board.
   **Decided:** the second, over deals created in the last 12 months.
   - Each deal counts at every stage up to the furthest one it reached, worked out from its stage changes.
   - A lost deal counts up to the stage it was lost from.
   - Each stage change stores its "from" and "to" stages as data for this (2.2).

3. **Some brand pairings are too faint for small text.** White on Cerulean is 4.0:1 and white on Raspberry is 3.6:1, below the 4.5:1 that WCAG AA asks of normal text. Sea Green, Marigold and Coral on white are 1.6:1 to 2.4:1.
   **Decided:** the brand colors are used as they are for fills, chart marks, dots, icons and large text. Small text, and buttons with white text, use a darker shade of the same color (2.6). The brand already asks for this with Sea Green and Marigold, and the spec does the same for Coral, Cerulean and Raspberry.

4. **A contact who moves to another organization while they're a deal's main contact.** A deal's main contact has to come from the deal's organization, so their deals at the old organization can't keep them.
   **Decided:** the save goes ahead, and those deals lose their main contact. The edit form names the deals before saving. The same applies when a contact's organization is removed (CON-5).

5. **A contact's timeline follows the deal's current main contact.** A contact's timeline shows activity on the deals where they're the main contact now. If a deal's main contact changes from Sarah to Tom, the deal's earlier calls with Sarah leave Sarah's timeline and appear on Tom's.
   **Decided:** keep it that way (ACT-3). It's simple, main contacts rarely change, and the deal's own timeline always has the full history. Recording the main contact on each activity when it's logged, so the history stays with the person, is left for a later change.

6. **A non-technical start needs two installs first.** Someone non-technical should be able to start Accountable with one command. That command needs Node.js 24 or later and uv on the computer, and Chrome or Edge to view the app.
   **Decided:** these are a one-time setup, with install steps for Mac, Windows and Linux in `docs/STATUS.md`. After that, `npm run dev` does everything else, including installing packages on its first run and opening the browser (2.8).

7. **Reopening a won or lost deal.** Moving a deal to Won or Lost sets its close date to today. If it's moved back to an open stage later, its expected close date is that past day.
   **Decided:** the deal keeps the date, and shows as late once that day has passed, so the user notices and sets a new one. Nothing is restored automatically (STG-5).

8. **Probability on won and lost deals.** A probability set by hand stays until the stage changes, but on a won or lost deal a hand-set figure means nothing.
   **Decided:** Won is always 100% and Lost always 0%, and the field can't be edited at those stages (STG-4).

9. **Database migrations.** The tech stack doesn't mention them, but Supabase is coming and later changes will alter the tables.
   **Decided:** Alembic from the start, with the tables defined in SQLAlchemy Core, so the database is always built by migrations.

10. **Fonts offline.** The brand's fonts come from Google Fonts, but the app must work without an internet connection.
    **Decided:** the three fonts are bundled with the app through the Fontsource npm packages, so nothing is fetched from the internet. The fonts stay the same.

11. **Times in UTC, days in local time.** Times are stored in UTC, but "today", "this month" and every day-based figure use the computer's local date. Comparing a UTC date with a local one puts an evening entry west of UTC on the next day.
    **Decided:** a stored time is turned into a local date before it's compared with a day, such as a deal's creation time for the funnel (2.4).

12. **Other web pages reaching the API.** The backend listens only on `127.0.0.1`, but a web page elsewhere can point its own domain name at `127.0.0.1` (DNS rebinding) and reach the API through the browser.
    **Decided:** the API answers only requests addressed to `127.0.0.1` or `localhost`, and refuses any other host with a 400 (RUN-6).

---

# Part 1: Requirements

## 1.1 Everywhere

- **GEN-1** A top bar on every page links to the five sections: Dashboard, Organizations, Contacts, Deals and Pipeline. The app opens on the Dashboard.
- **GEN-2** Every change is saved to the database as soon as it's made. There's no separate save step for the app as a whole, and a refresh or a restart shows every change.
- **GEN-3** Money is in whole US dollars, shown with the dollar sign and thousands separators: `$48,500`. Chart axes may shorten large amounts to `$1.2M` or `$48.5k`, and the chart's tooltips show the full amount. Cents never appear.
- **GEN-4** Dates are shown as `Nov 19, 2026`, and a date with a time as `Nov 19, 2026, 2:30 PM`. "Today" is the computer's local date, and the backend is the app's one clock (2.4). A stored time is turned into a local date before it's compared with a day (concern 11).
- **GEN-5** Each page has its own browser tab title, such as `Contacts · Accountable`, and its own address, so the back button and a refresh work.
- **GEN-6** If a save fails, a short message says so and the form stays open with what was typed. Problems with a field show under that field.
- **GEN-7** Normal use leaves no errors in the browser's console.
- **GEN-8** Light mode only. Designed for screens 1280px wide and wider, and usable down to 1024px, where the pipeline board scrolls sideways.

## 1.2 Tables

The Organizations, Contacts and Deals pages each show a table.

- **TBL-1** A search box filters the rows as you type, matching any part of the searched fields and ignoring capitals. Each table lists its searched fields below.
- **TBL-2** Clicking a column heading sorts by that column, and clicking again reverses the order. An arrow shows the current sort.
- **TBL-3** An "Add ..." button opens the record's form in a dialog. After saving, the new row is in the table and a short message confirms it.
- **TBL-4** Each row has an Edit button and a Delete button. Edit opens the same form, filled in. Delete opens the confirmation in 1.10.
- **TBL-5** Clicking anywhere else on a row opens the record's page.
- **TBL-6** The table shows how many rows match, such as "40 contacts" or "3 of 40 contacts". Past 50 rows it splits into pages of 50, with Previous and Next.
- **TBL-7** An empty table says why: "No deals yet" with an Add button when there are none, or "No contacts match "smith"" when the search finds nothing.

## 1.3 Organizations

| Field | Rules |
|---|---|
| Name | Required, up to 120 characters. No two organizations can have the same name, ignoring capitals: "An organization called Bluefin Logistics already exists." The form checks as you type, and the server checks again. |
| Website | Optional, up to 200 characters. Shown as a link that opens in a new tab, with `https://` added if it's missing. Only `http` and `https` addresses become links. |
| Industry | Optional, up to 60 characters. Typed freely, with suggestions from industries already in use. |
| Notes | Optional, up to 5,000 characters, over several lines. |

- **ORG-1** Table columns: Name, Industry, Website, Contacts (how many), Open deals (how many) and Open pipeline (their total value). Sorted by name, A to Z, at first. Searches name, industry and website.
- **ORG-2** An organization's page shows its name, industry, website and notes, with Edit and Delete. Two figures: its open pipeline and its revenue won to date.
- **ORG-3** The page lists the organization's contacts (name, status and job title) with an "Add contact" button that fills in the organization, and its deals (name, stage, value and close date) with an "Add deal" button that does the same. Each contact and deal opens its own page.

## 1.4 Contacts

| Field | Rules |
|---|---|
| Name | Required, up to 120 characters. |
| Email | Optional. Must look like an email address, such as `sarah@bluefin.example`: one `@`, a dot after it, and no spaces. |
| Phone | Optional, up to 40 characters, typed freely. |
| Job title | Optional, up to 120 characters. |
| Organization | Optional, chosen from a searchable list of organizations. |
| Status | Required: Lead, Qualified or Customer, chosen from a list. A new contact starts as Lead. |

- **CON-1** Table columns: Name, Status, Organization, Job title, Email and Phone. Sorted by name, A to Z, at first. Searches name, email, phone, job title and organization name.
- **CON-2** Above the table, a status filter: All, Leads, Qualified and Customers, each with its count. The filter and the search work together. Each count covers every contact at that status, whatever the search says.
- **CON-3** A contact's page shows their name, status, job title, organization (a link), email (opens the email app) and phone (a call link), with Edit and Delete. It lists the deals where they're the main contact, and shows their timeline (1.8).
- **CON-4** A contact's status changes only when the user changes it. Winning a deal doesn't change its contact.
- **CON-5** When a contact's organization is changed or removed, the contact stops being the main contact on deals at the old organization. Before saving, the form names those deals (concern 4).

## 1.5 Deals

| Field | Rules |
|---|---|
| Name | Required, up to 120 characters. |
| Organization | Required, chosen from a searchable list. |
| Main contact | Optional, chosen from the organization's contacts only. Changing the organization in the form clears it. The server refuses a contact from elsewhere: "Choose a contact from Bluefin Logistics." |
| Stage | Required: New, Qualified, Proposal, Negotiation, Won or Lost, chosen from a list. |
| Value | Required, whole dollars from $0 to $100,000,000. It can be typed with or without `$` and commas. |
| Probability | Whole percent from 0 to 100. Filled with the stage's usual figure, and editable at the open stages only. |
| Close date | Required. The expected close date while the deal is open, and the actual one once it's won or lost. A new deal starts 30 days from today. |

- **DEAL-1** Table columns: Name, Organization, Main contact, Stage, Value, Probability, Expected revenue and Close date. Sorted by close date, earliest first, at first. Searches name, organization name, main contact name and stage.
- **DEAL-2** A deal is **late** when it's at an open stage and its close date is before today. A late deal has a "Late" badge beside its close date in the table, on its pipeline card and on its page.
- **DEAL-3** A deal's expected revenue is its value times its probability, rounded to the nearest dollar.
- **DEAL-4** A deal's page shows its name, stage, organization (a link) and main contact (a link), with Edit and Delete. Four figures: value, probability, expected revenue and close date.
- **DEAL-5** A stage bar on the deal's page shows the six stages with the current one marked. Clicking another stage moves the deal there, by the rules in 1.6.
- **DEAL-6** The deal's page shows its timeline (1.8).

## 1.6 Stages and probability

- **STG-1** The stages, in order, and their usual probability of close:

  | Stage | New | Qualified | Proposal | Negotiation | Won | Lost |
  |---|---|---|---|---|---|---|
  | Usual probability | 10% | 25% | 50% | 75% | 100% | 0% |

  New to Negotiation are the **open** stages. Won and Lost are **closed**.
- **STG-2** When a deal's stage changes, whether by dragging its card, by the stage bar or in the edit form:
  1. Its probability becomes the new stage's usual figure. In the edit form, choosing a stage fills in that figure, which can be changed before saving at an open stage. What the form shows is what's saved.
  2. Moving to Won or Lost sets the close date to today. In the edit form, choosing Won or Lost fills in today, which can be changed before saving. After that the close date can be edited like any other field.
  3. An entry such as "Moved from Proposal to Negotiation" is added to the deal's timeline, at the time of the move. It also shows on the main contact's timeline and in the dashboard's recent activity, and it can't be edited or deleted.
  4. On the pipeline, a dragged card stays where it was dropped. A deal moved by the stage bar or the edit form goes to the top of its new column.
- **STG-3** A probability set by hand at an open stage stays until the stage changes. Editing other fields leaves it alone.
- **STG-4** Won is always 100% and Lost always 0% (concern 8).
- **STG-5** A deal moved from Won or Lost back to an open stage keeps its close date (concern 7).
- **STG-6** Adding a deal doesn't add a stage change to its timeline. A deal added at Won or Lost starts with today as its close date.

## 1.7 Pipeline

- **PIPE-1** The board has one column per stage, in order. Each column's heading shows the stage, how many cards it holds, their total value and their expected revenue.
- **PIPE-2** The open columns show all their deals. Won and Lost show only deals with a close date in the last 30 days (on or after today minus 30 days), and say so under their headings: "Closed in the last 30 days". Older ones are still in the Deals table.
- **PIPE-3** Above the board: the total value, the expected revenue and the number of the open deals, with how many of them are late, such as "19 open deals, 3 of them late".
- **PIPE-4** A card shows the deal's name, organization, value, close date and main contact, and a Late badge when it's late. Clicking a card opens the deal's page.
- **PIPE-5** Dragging a card to another column changes the deal's stage (STG-2). A card can be dropped anywhere in a column, including higher or lower in its own column, and it stays where it was dropped, after a refresh and after a restart. With the mouse, the card goes where the pointer is; over the gap between two columns, it stays where it was.
- **PIPE-6** The cards, the column figures and the board's figures change the moment a card is dropped, without waiting for the server. If the save fails, the card goes back where it was and a message says the deal couldn't be moved.
- **PIPE-7** Each column has an "Add deal" button. Its form starts at that column's stage, and the new card appears at the top of the column.
- **PIPE-8** Cards can be moved with the keyboard too: Space picks a card up, the arrow keys move it, Space drops it and Escape puts it back. Enter opens the card's deal. A screen reader hears each step in plain words.

## 1.8 Activities and timelines

| Field | Rules |
|---|---|
| Type | Note, Call or Email. Stage changes are a fourth type that only the app adds. |
| Relates to | The contact or deal it was logged from. It can't be changed afterwards. |
| Description | Required, up to 5,000 characters, over several lines. |
| When | Required date and time. In the Log activity box it starts as now, and keeps up with the clock while the page stays open, until it's changed by hand. After each log it starts as now again. |
| Follow-up date | Optional. |
| Done | Only for an activity with a follow-up date. Starts as not done. An activity with no follow-up date is never done. |

- **ACT-1** At the top of each contact's and deal's timeline, a "Log activity" box has the type, the description, when, an optional follow-up date and a Log button.
- **ACT-2** A timeline lists entries newest first, by when they happened, with the most recently added first when two match. Each entry shows its type, when it happened and its description, plus its follow-up date and a Done tickbox if it has one.
- **ACT-3** A contact's timeline shows the activities logged on the contact, and the activities and stage changes on deals where they're the main contact now (concern 5). Entries from a deal name the deal, with a link.
- **ACT-4** Notes, calls and emails can be edited (type, description, when, follow-up date and done) and deleted, after a confirmation. Stage changes have no Edit or Delete.
- **ACT-5** A follow-up stays open until it's ticked Done, from its timeline or from the dashboard. Unticking it opens it again.
- **ACT-6** A follow-up date can be in the past, and the follow-up then shows as overdue straight away.

## 1.9 Dashboard

- **DASH-1** The heading shows today's date, such as "Thursday, November 19".
- **DASH-2** Four headline figures:
  - **Open pipeline**: the total value of the open deals, and how many there are.
  - **Expected revenue**: the total expected revenue of the open deals.
  - **Won this month**: the revenue won this calendar month and the number of deals, with last month's revenue beside it.
  - **Follow-ups**: how many are overdue and how many are due in the next 7 days.
- **DASH-3** **Revenue won**, a line chart: the revenue won in each of the last 12 calendar months, ending with this month. A deal counts in the month of its close date, and a month with no wins shows $0.
- **DASH-4** **Deals won**, a bar chart: the number of deals won in each of the same 12 months.
- **DASH-5** **Sales funnel**: for New, Qualified, Proposal, Negotiation and Won, the value and number of the deals that reached each stage (concern 2), with the share carried from each step to the next, such as "62% carried on".
- **DASH-6** **Open pipeline by stage**, the visual of the pipeline: for each open stage, its total value and its expected revenue.
- **DASH-7** **Follow-ups**: the open follow-ups that are overdue or due today or in the next 7 days, earliest first. Each shows its type, its description on one line, the contact or deal it's for (a link), its date, and a Done tickbox. Overdue ones say how many days late they are. Ticking Done takes a follow-up off the list.
- **DASH-8** **Recent activity**: the latest 10 entries across every contact and deal, including stage changes, by when they happened, up to now. Each links to its contact or deal.
- **DASH-9** The dashboard's figures come from the database each time it's opened, so they include every change, such as a deal just moved to Won or a follow-up just logged. Hovering over a chart shows its exact figures.

## 1.10 Deleting

- **DEL-1** Every delete asks first, in a dialog that names the record and says what will happen to the records linked to it. Nothing is deleted until the user confirms. Cancel or Escape leaves everything as it was.
- **DEL-2** An organization without deals: its contacts stay, with no organization. "Delete Bluefin Logistics? Its 3 contacts will stay, with no organization."
- **DEL-3** An organization with deals can't be deleted. The dialog says so and lists its deals (name, stage and value, each a link), to be moved to another organization or deleted first. It has only a Close button, and the server refuses the delete too.
- **DEL-4** A contact: the activities logged on the contact are deleted, and the deals where they're the main contact stay, with no main contact. "Delete Sarah Chen? Sarah Chen's 6 activities will be deleted. These deals will stay, with no main contact: Website redesign, Q1 SEO retainer."
- **DEL-5** A deal: its activities are deleted, including its stage changes. "Delete Website redesign? Its 5 activities, including its 2 stage changes, will be deleted." The part about stage changes appears only when the deal has some.
- **DEL-6** An activity: "Delete this call from Nov 12, 2026?"
- **DEL-7** After a delete from a record's page, the app goes back to that section's table, and a short message confirms the delete.

A sentence about linked records is left out when there are none, and a count of one uses the singular, as in "Its 1 contact will stay, with no organization."

## 1.11 Sample data

- **DATA-1** When the app starts without a database, it creates one and fills it with the sample data.
- **DATA-2** The sample business is a made-up B2B agency selling projects and retainers: websites, branding, marketing retainers, analytics and training.
- **DATA-3** About 15 organizations across at least 8 industries.
- **DATA-4** About 40 contacts: about 18 leads (4 of them with no organization), 10 qualified and 12 customers.
- **DATA-5** About 35 deals worth $5,000 to $150,000, at every stage:
  - about 19 open, 3 or 4 of them late
  - 10 won, spread over the last 12 months, with at least one this month and 2 in the last 30 days
  - 6 lost, 2 of them in the last 30 days
- **DATA-6** About 80 notes, calls and emails, plus the stage changes that match each deal's path to its current stage. About 10 open follow-ups (3 overdue, 4 due in the next 7 days, the rest later), and some marked done.
- **DATA-7** Every date is set relative to the day the data is seeded.
- **DATA-8** The people and companies are made up. Email addresses and websites use the reserved `.example` domain, so none points at a real company.
- **DATA-9** The content is fixed, with no randomness, so it's the same each time and the tests can rely on it.

## 1.12 Running and keeping data

- **RUN-1** `npm run dev` starts the whole app, prints its address and opens it in the browser (2.8).
- **RUN-2** The data lives in a SQLite file in `data/`, which git ignores.
- **RUN-3** `npm run seed` resets the data to the sample data after the user types `yes`. Any other answer changes nothing, and doesn't create a database either. It works while the app is running, and a refresh then shows the sample data.
- **RUN-4** `npm test` runs every test on a database of its own, and works while `npm run dev` is running.
- **RUN-5** The app works with no internet connection, on Mac, Linux and Windows, in current Chrome and Edge. Only the first `npm run dev` needs the internet, to download the packages and Python.
- **RUN-6** Only this computer can use the app. The backend listens on `127.0.0.1`, and answers only requests addressed to `127.0.0.1` or `localhost` (concern 12).

## 1.13 Not built yet

- Sign-in, user accounts, several people sharing the same data, and a record of who did what. The rest of the sales team joins later.
- Making Accountable available beyond the computer it runs on. Later, Supabase will provide sign-in and the database, and the app will be deployed to Render (`docs/TECH_STACK.md`).
- Dark mode or a layout for phones.
- AI features; email, calendar or phone integrations.
- Currencies other than US dollars; reports beyond the dashboard; tags or custom fields; changing the pipeline stages; importing or exporting data.

---

# Part 2: Design

## 2.1 Architecture

```
Browser: React app ── /api, JSON ──> FastAPI ── SQLAlchemy Core ──> SQLite file (data/accountable.db)
         (Vite serves the app and passes /api on to the backend)
```

The browser talks only to the Vite server, which passes `/api` requests to the backend, so the backend needs no cross-origin setup. The backend listens on `127.0.0.1` only, so other computers on the network can't reach it, and it refuses any request addressed to a host other than `127.0.0.1` or `localhost` (RUN-6). Vite and its proxy use `127.0.0.1` too, never `localhost`, because Node looks up `localhost` as `::1` first.

```
package.json          npm scripts, with frontend/ as a workspace
scripts/dev.mjs       starts the backend and the frontend together
scripts/test.mjs      runs the three test suites in turn
scripts/e2e-backend.mjs  starts a fresh backend for the end-to-end tests
scripts/lib/proc.mjs  starting, stopping and waiting for processes on each system
pyproject.toml        Python project (Python 3.12), with uv.lock beside it
alembic.ini
backend/
  app/
    main.py           FastAPI app and routers; on start, runs migrations and seeds a new database
    config.py         settings from environment variables
    db.py             engine and table definitions
    clock.py          today() and now(), the app's one clock, and local dates
    rules.py          stages, probabilities, late, expected revenue, funnel
    schemas.py        Pydantic request and response models, with the field messages
    queries.py        reads several routers share: deals and timeline entries
    routers/          organizations, contacts, deals, activities, pipeline, dashboard, meta
    seed.py           loads the sample data, and the `npm run seed` command
    seed_data.py      the sample data itself
  migrations/         Alembic
  tests/
frontend/
  index.html, vite.config.ts, package.json
  src/
    main.tsx, App.tsx (routes and layout)
    api/              fetch client and TanStack Query hooks
    components/       tables, forms, dialogs, badges, timeline, charts, board
    pages/            Dashboard, Organizations, Organization, Contacts, Contact, Deals, Deal, Pipeline, Not found
    lib/              money and date formats, stage rules, board totals, dashboard helpers, wording
    styles/           brand tokens and Tailwind setup
e2e/
  playwright.config.ts, fixtures.ts
  tests/
data/                 the database (git-ignored)
docs/
  spec.md             this file
  TECH_STACK.md, REVIEW.md, STATUS.md
  mockups/            the three mockups, and the chosen one
  changes/<branch>/   each change's intent.md and plan.md, such as changes/mvp/
```

### Libraries

Popular, well-supported libraries do the heavy lifting. Their versions are in `package.json`, `frontend/package.json` and `pyproject.toml`.

| Job | Library |
|---|---|
| App | React, TypeScript, Vite |
| Pages and addresses | React Router (imported from `react-router`) |
| Loading data, caching, refreshing after changes | TanStack Query |
| Tables: sorting, search, pages | TanStack Table |
| Charts | Recharts |
| Drag and drop on the board, with keyboard support | dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`) |
| Styling | Tailwind CSS, with the brand tokens as CSS variables |
| Dialogs, menus, selects, toggle groups, tooltips, placeholders, searchable pickers | shadcn/ui components, built on Radix UI and cmdk |
| Forms and validation | React Hook Form and Zod |
| Short messages | Sonner |
| Icons | Lucide |
| Dates | date-fns |
| Fonts, bundled with the app | Fontsource |
| API | FastAPI, Uvicorn, Pydantic |
| Database | SQLAlchemy Core (no ORM and no raw SQL), Alembic |
| Tests | pytest with FastAPI's TestClient; Vitest with Testing Library; Playwright Test |

## 2.2 Data model

Every table has `id` (integer primary key), `created_at` and `updated_at`, both set from the app's clock.

**organizations**

| Column | Type | Notes |
|---|---|---|
| name | text, not null | unique, ignoring capitals |
| website | text | |
| industry | text | |
| notes | text | |

**contacts**

| Column | Type | Notes |
|---|---|---|
| name | text, not null | |
| email | text | |
| phone | text | |
| job_title | text | |
| organization_id | integer | links to organizations; set to empty when the organization is deleted |
| status | text, not null | `lead`, `qualified` or `customer` |

**deals**

| Column | Type | Notes |
|---|---|---|
| name | text, not null | |
| organization_id | integer, not null | links to organizations; the database refuses to delete an organization that has deals |
| main_contact_id | integer | links to contacts; set to empty when the contact is deleted |
| stage | text, not null | `new`, `qualified`, `proposal`, `negotiation`, `won` or `lost` |
| value | integer, not null | whole dollars, 0 or more |
| probability | integer, not null | 0 to 100 |
| close_date | date, not null | |
| position | integer, not null | the card's place in its column, 0 at the top |

**activities**

| Column | Type | Notes |
|---|---|---|
| type | text, not null | `note`, `call`, `email` or `stage_change` |
| contact_id | integer | links to contacts; deleted with the contact |
| deal_id | integer | links to deals; deleted with the deal |
| description | text, not null | for a stage change, "Moved from Proposal to Negotiation" |
| occurred_at | datetime, not null | when it happened |
| follow_up_date | date | |
| done | boolean, not null | false to start |
| from_stage, to_stage | text | set on stage changes only, used by the funnel |

- Each activity has exactly one of `contact_id` and `deal_id`, which the database checks. The database also checks that stage, status and type take only their listed values, that probability is 0 to 100 and that value is 0 or more.
- Indexes cover each link column, `deals (stage, position)`, `activities (occurred_at)` and `activities (follow_up_date, done)`, plus a unique index on `lower(name)` for organizations.
- SQLite turns foreign keys on for every connection, runs in WAL mode and waits up to 5 seconds for a lock. The API also checks every rule itself, so nothing depends on SQLite alone, which matters when the database moves to Supabase.
- A request that changes data takes the write lock first (`BEGIN IMMEDIATE`), so it waits its turn behind another writer, such as `npm run seed`, instead of failing halfway. Its change is committed before the answer is sent, so the browser's next request always sees it.
- Dates are stored as `YYYY-MM-DD`. Date-times are stored in UTC and sent with a `Z`, and the browser shows them in local time.

## 2.3 API

Everything is under `/api` and speaks JSON. Rule errors return `{"detail": "message"}`: 404 for a missing record (such as "Deal not found"), 409 for a refused delete or edit, and 422 for bad input. Bad input uses FastAPI's standard validation errors, with the field in `loc` (such as `["body", "name"]`), which the forms show under each field. A request addressed to any host other than `127.0.0.1` or `localhost` gets a 400.

| Request | What it does |
|---|---|
| `GET /api/meta` | Today's date, for late badges and the date defaults in forms |
| `GET /api/organizations` | All organizations, with contact count, open deal count and open pipeline value |
| `POST /api/organizations` | Adds one |
| `GET /api/organizations/{id}` | One organization, with its contacts, its deals and its two figures |
| `PATCH /api/organizations/{id}` | Changes one |
| `GET /api/organizations/{id}/delete-impact` | `{contacts: 3, deals: [...]}`, for the confirmation |
| `DELETE /api/organizations/{id}` | Deletes it, or 409 with `{detail, deals}` if it has any deals |
| `GET /api/contacts` | All contacts, with their organization's id and name |
| `POST /api/contacts` | Adds one |
| `GET /api/contacts/{id}` | One contact, with their organization and the deals where they're the main contact |
| `PATCH /api/contacts/{id}` | Changes one, and answers `{contact, unlinked_deals: [{id, name}]}`, the deals that lost their main contact (CON-5) |
| `GET /api/contacts/{id}/timeline` | The contact's timeline (ACT-3) |
| `GET /api/contacts/{id}/delete-impact` | `{activities: 6, deals: [...]}` |
| `DELETE /api/contacts/{id}` | Deletes the contact and their activities, and unlinks their deals |
| `GET /api/deals` | All deals, each with organization, main contact, expected revenue and whether it's late |
| `POST /api/deals` | Adds one, at the top of its stage's column |
| `GET /api/deals/{id}` | One deal |
| `PATCH /api/deals/{id}` | Changes one, following STG-2 if the stage changes |
| `POST /api/deals/{id}/move` | `{stage, before_id}`, for the board (below) |
| `GET /api/deals/{id}/timeline` | The deal's timeline |
| `GET /api/deals/{id}/delete-impact` | `{activities: 5, stage_changes: 2}` |
| `DELETE /api/deals/{id}` | Deletes the deal and its activities |
| `POST /api/activities` | Logs one: `{type, contact_id or deal_id, description, occurred_at, follow_up_date}` |
| `PATCH /api/activities/{id}` | Changes one, including `done`; 409 for a stage change |
| `DELETE /api/activities/{id}` | Deletes one; 409 for a stage change |
| `GET /api/pipeline` | The six columns with their cards in order, Won and Lost limited to the last 30 days |
| `GET /api/dashboard` | Everything the dashboard shows, worked out on the server |

A deal comes back as:

```json
{
  "id": 12,
  "name": "Website redesign",
  "organization": {"id": 3, "name": "Bluefin Logistics"},
  "main_contact": {"id": 8, "name": "Sarah Chen"},
  "stage": "proposal",
  "value": 48500,
  "probability": 50,
  "expected_value": 24250,
  "close_date": "2026-12-12",
  "is_late": false,
  "position": 2
}
```

A timeline entry, which the dashboard's follow-ups and recent activity also use, comes back as:

```json
{
  "id": 41,
  "type": "call",
  "description": "Walked through the scope.",
  "occurred_at": "2026-11-10T15:15:00Z",
  "follow_up_date": "2026-11-21",
  "done": false,
  "from_stage": null,
  "to_stage": null,
  "contact": {"id": 8, "name": "Sarah Chen"},
  "deal": null
}
```

Exactly one of `contact` and `deal` is set. The dashboard's follow-ups add `days_late`.

**Changing a record.** A `PATCH` changes only the fields it sends: leaving a field out keeps its value, and sending `null` clears it. An activity's contact or deal can't be changed.

**A stage change in a `PATCH`** saves exactly what the edit form shows, and gives the stage bar, which sends only the stage, the defaults:

- **Probability:** if the new stage is open and a probability was sent, that figure is saved; otherwise the deal gets the stage's usual figure. Won is always 100 and Lost always 0.
- **Close date:** if one was sent, it's saved. Otherwise a deal moving to Won or Lost gets today, and any other deal keeps its date.

**Moving a card.** `before_id` is the card it was dropped above, or `null` for the bottom of the column. In one transaction the server applies STG-2 if the stage changed, then numbers the cards in the old and new columns again from 0. It answers with the updated deal. It refuses with a 404 if the deal doesn't exist, and a 422 if `before_id` is the deal itself or isn't in the target column. Won and Lost cards older than 30 days are hidden on the board but keep their places, so `null` puts the card after them, and the board looks the same either way.

**Refreshing after changes.** After any change succeeds, the app refreshes every query through TanStack Query, which refetches what's on screen and marks the rest stale. After a delete, the deleted record's own queries are left alone, so the page that showed it doesn't ask for it again and get a 404. A card move updates the board in the browser first and then saves (PIPE-6).

## 2.4 Rules and figures

The rules live in `backend/app/rules.py`. The board's live totals also need them in the browser, in `frontend/src/lib/rules.ts`, and tests check that both give the same answers, from the shared cases in `frontend/src/lib/rules-cases.json`.

- **Today** comes from `clock.py`: the computer's local date, which tests can replace, along with the time zone. The frontend gets it from `/api/meta` and doesn't use the browser's own date for rules. A `YYYY-MM-DD` string is read as a local date, never with `new Date(string)`, which reads it as UTC.
- **Local dates:** a stored UTC time is turned into the computer's local date before it's compared with a day (concern 11). The sample data's times are set in local time the same way.
- **Late:** open stage, and close date before today.
- **Expected revenue:** `(value × probability + 50) ÷ 100`, rounded down, which rounds halves up the same way in Python and JavaScript. Totals add up each deal's rounded figure, so the dashboard matches the Deals table.
- **The board's Won and Lost columns:** close date on or after today minus 30 days.
- **Months:** the 12 calendar months ending with this one. A won deal counts in the month of its close date.
- **Funnel:** for each deal created on or after the first day of the oldest of the 12 months, by its local creation date, find the furthest stage it reached. That's the highest of its current stage (unless it's Lost) and every `from_stage` and `to_stage` in its stage changes, leaving out Lost. A deal counts at that stage and every stage before it. A lost deal with no stage changes counts at New only.
- **The funnel's share:** each step's value divided by the step before it, as a whole percent. After a step worth $0, no share is shown.
- **Follow-ups on the dashboard:** not done, and a follow-up date on or before today plus 7 days. Overdue means before today; due soon means today to today plus 7 days.
- **Recent activity:** the 10 latest activities with `occurred_at` up to now.
- **Timelines:** newest first by `occurred_at`; when two entries have the same time, the higher `id` comes first.

## 2.5 Screens

### Pages

| Address | Page |
|---|---|
| `/` | Dashboard |
| `/organizations`, `/organizations/:id` | Organizations table, organization page |
| `/contacts`, `/contacts/:id` | Contacts table, contact page |
| `/deals`, `/deals/:id` | Deals table, deal page |
| `/pipeline` | Pipeline board |

An unknown address shows "Page not found" and "There's no page at this address.", with a link to the dashboard. A deleted record's address says "This contact no longer exists." and "It may have been deleted.", with a link to the table. A record page that can't load for another reason says "Couldn't load this page." and why.

### Layout

The layout follows the chosen mockup, Midnight deck (`docs/mockups/2-midnight-deck.html`).

- **Top bar:** Midnight, 64px tall and the full width. The Accountable wordmark is on the left, then the five sections in Sea Mist. The current section is a Sea Green pill with Midnight text.
- **The Midnight band:** the top bar runs straight into a band of the same color, with no line between them. The band holds the page's title, a short line under it (such as "40 contacts" or "19 open deals"), the page's headline figures and its main button on the right. Text in the band is white or Sea Mist.
- **Below the band:** the page's content sits on the light page background with 32px padding, up to 1440px wide and centered.
- **Width:** the pipeline uses the full width, because six columns need it. That's also why the sections go in a top bar rather than a sidebar.

### Dashboard

```
 ===== Midnight band ===========================================================
 Dashboard
 Thursday, November 19
 Open pipeline        Expected revenue     Won this month       Follow-ups
 $1,011,000           $502,300             $54,000              3 overdue
 Open pipeline by stage
 [ New ][ Qualified      ][ Proposal         ][ Negotiation                ]
 ===== light page ==============================================================
 [ Revenue won, last 12 months: line       ] [ Deals won: bars             ]
 [ Sales funnel          ] [ Follow-ups            ] [ Recent activity     ]
```

- **In the band:**
  - The title, with the date under it in Instrument Serif, italic.
  - The four headline figures (DASH-2) in a row, in JetBrains Mono at 40px with no tiles around them. Expected revenue is in Sea Green, and the overdue count in light Raspberry.
  - **Open pipeline by stage** (DASH-6) as one strip across the band. Each open stage is a segment as wide as its total value, and the colored part of each segment is its expected revenue (2.6). Under each segment are its stage name, count, total value and expected revenue.
- **Below the band,** two rows of white panels:
  - Revenue won (7 columns of 12) and Deals won (5 columns). Each panel shows its 12-month total above the chart.
  - Sales funnel, Follow-ups and Recent activity, a third each.
- **Follow-ups and Recent activity** scroll once they're taller than seven follow-ups, so the bottom row keeps the mockup's height. A follow-up's date reads "3 days late", "Today", "Tomorrow", a weekday within the week, then the date. Recent activity's times read "Today, 9:01 AM", "Yesterday, 4:30 PM", then "Nov 18, 4:05 PM".
- The dashboard should be the best-looking page in the app. Big figures, generous space, and color used for meaning, so the eye goes to the numbers.

### Tables

- Each table is a white panel below the band. Above it are the search box (320px) and any filters. The Add button is the page's main button, in the band.
- Headings sort, with an arrow on the sorted column. Rows are 52px tall with a light line between them, and turn a light tint on hover.
- Money, percentages and dates are right-aligned in JetBrains Mono.
- Edit and Delete are icon buttons at the end of each row, always visible. Each has a tooltip and a name for screen readers.

### Record pages

```
 < Deals
 Website redesign   [Proposal] [Late]                   [Edit] [Delete]
 Bluefin Logistics · Sarah Chen
 ( New > Qualified > Proposal > Negotiation )  ( Won )  ( Lost )
 +-- Details ------------+   +-- Timeline --------------------------------+
 | Value        $48,500  |   | [Note | Call | Email]                      |
 | Probability      50%  |   | What happened?                             |
 | Expected     $24,250  |   | When [Nov 19, 2:30 PM]  Follow-up [    ]   |
 | Close date Dec 12     |   |                               [Log]        |
 +-----------------------+   |--------------------------------------------|
                             | o Moved from Qualified to Proposal  Nov 12 |
                             | o Call  Nov 10, 3:15 PM                    |
                             |   Walked through the scope...              |
                             |   Follow up Nov 21   [ ] Done              |
                             +--------------------------------------------+
```

- The band holds a link back to the table, the record's name with its badges beside it, its links (such as organization and main contact), and Edit and Delete on the right. A deal's stage bar sits in the band too, where the stage colors show up well against Midnight.
- Below that, two columns: details and linked records on the left (one third), the timeline on the right (two thirds). The organization page puts its contacts and deals lists in the wider column, since it has no timeline.
- The stage bar shows the open stages as joined steps, with Won and Lost as two separate buttons at the end. Past stages are filled in with a tint, and the current one in its full stage color.
- The Note, Call and Email picker is a toggle group: one Tab stop, with the arrow keys moving between the types. The chosen type is filled in Midnight.
- Timeline entries show a small round icon for each type: a note, a phone, an envelope, and an arrow for stage changes. A stage change is a single quieter line with no buttons.
- An empty timeline says "Nothing logged yet. Log a call, email or note above."

### Pipeline

```
 ===== Midnight band ================================================================
 Pipeline                              Open pipeline  Expected revenue
 19 open deals, 3 of them late           $1,011,000          $502,300   [+ Add deal]
 +-----------+ +-----------+ +-----------+ +-----------+ +-----------+ +-----------+
 | o New   5 | | o Qualif. | | o Propos. | | o Negot.  | | o Won   2 | | o Lost  2 |
 | $100,500  | | $243,000  | | $276,500  | | $391,000  | | $62,500   | | $40,000   |
 | Expected  | | Expected  | | Expected  | | Expected  | | Closed in | | Closed in |
 | [+ Add]   | | [+ Add]   | | [+ Add]   | | [+ Add]   | | [+ Add]   | | [+ Add]   |
 +-----------+ +-----------+ +-----------+ +-----------+ +-----------+ +-----------+
 ===== light page ===================================================================
 [ card    ]   [ card    ]   [ card    ]   [ card    ]   [ card    ]   [ card    ]
 [ card    ]   [ card    ]   ...
```

- **In the band:** the title and the board's figures (PIPE-3), with Expected revenue in Sea Green, and the Add deal button.
- **Column headings** also sit in the band, one block per column, as tinted Midnight panels. Each shows a stage-colored dot, the stage name and count, the total value and the expected revenue (PIPE-1). Won and Lost add "Closed in the last 30 days". Each block has its own Add deal button at the bottom, and all six line up.
- **Cards** sit on the light page below their headings, as wide as their headings. They're white, with rounded corners and a soft shadow.
- A card shows the deal's name (semibold) and organization, then its value and close date in JetBrains Mono, then its main contact and any Late badge. The main contact's initials sit in a small Midnight circle with Sea Mist text. The close date is always in full; on a narrow column it moves under the value rather than breaking in two.
- A card being dragged lifts with a stronger shadow. The column under it gets a light tint, and a gap opens where the card will land.
- A column with more cards than fit scrolls on its own, with a 4px scrollbar, and its heading stays in place. An empty column says "No deals here", or "None closed in the last 30 days" for Won and Lost.

### Forms and dialogs

- Forms open in dialogs 560px wide, with labels above the fields and required fields marked.
- The main button names the action, such as "Add contact" or "Save changes", next to Cancel. Escape closes the dialog.
- Organization and main contact are searchable pickers. Stage and Status are selects. Industry suggestions come from the browser's own list of suggestions (`<datalist>`).
- Dates use the browser's own date and date-and-time inputs, styled to the brand, so the app needs no date-picker library. "When" is converted to UTC before it's sent.
- In the deal form, choosing a stage fills in its probability, and choosing Won or Lost fills in today as the close date (STG-2). A contact form that will take a contact off deals lists them above the buttons (CON-5).

## 2.6 Visual design

The look follows Accountable's brand guidelines, which take priority over any general design guidance.

### Colors

The brand's colors as CSS variables. Light mode is the only mode for now, but the variables are named by role, so a dark set can be added later from the brand's dark surfaces.

| Variable | Value | Use |
|---|---|---|
| `--page` | `#F0F4F5` | Page background |
| `--panel` | `#FFFFFF` | Panels, cards and dialogs |
| `--ink` | `#073B4C` (Midnight) | Text |
| `--ink-muted` | `#46636D` | Secondary text and labels (6.4:1 on white) |
| `--ink-subtle` | `#56747E` | Placeholders and chart axes (5.0:1 on white) |
| `--line` | `#E4ECEE` | Lines between table rows, and chart grid lines |
| `--control-border` | `#7D949C` | Full border around inputs (3.2:1 on white, enough for a control) |
| `--focus` | `#118AB2` (Cerulean) | 2px focus outline, 2px out from the control. In the band it's Sea Mist, because Cerulean barely shows on Midnight. |
| `--band` | `#073B4C` (Midnight) | Top bar and the band under it |
| `--band-ink` | `#FFFFFF` and `#CDD8DB` (Sea Mist) | Titles and figures (12.1:1), and other text (8.3:1) in the band |
| `--band-muted` | `#A7BCC2` | Labels and secondary text in the band (6.1:1) |
| `--band-alert` | `#FF8DA5` | Overdue counts in the band, a lighter Raspberry (5.5:1) |
| `--band-panel` | Sea Mist at 8% over Midnight | Pipeline column headings in the band |
| `--band-rest` | Sea Mist at 16% over Midnight | The part of the pipeline strip beyond expected revenue |

Each brand color has three uses: the color itself for fills, dots, chart marks and icons; a darker text shade (at least 4.5:1 on white and on its tint); and a light tint for badge and hover backgrounds.

| Color | Color itself | Text shade | Tint |
|---|---|---|---|
| Sea Green | `#06D6A0` | `#037A5C` | `#DCF9F2` |
| Marigold | `#FFC145` | `#8A5A00` | `#FFF6E5` |
| Coral | `#F78C6B` | `#B4472A` | `#FEEFEA` |
| Cerulean | `#118AB2` | `#0D6E8E` | `#DEEFF4` |
| Raspberry | `#EF476F` | `#C42A50` | `#FDE5EB` |
| Slate | `#8AA3AB` | `#46636D` | `#DCE4E6` |

### Stages and statuses (concern 1)

| Stage | Color | | Contact status | Color |
|---|---|---|---|---|
| New | Slate | | Lead | Slate |
| Qualified | Marigold | | Qualified | Marigold |
| Proposal | Coral | | Customer | Sea Green |
| Negotiation | Cerulean | | | |
| Won | Sea Green | | | |
| Lost | Raspberry | | | |

Badges are pills: the tint behind, the text shade for the words, 12px medium. The **Late** badge stands out more than the rest: Raspberry's text shade filled in, with white text and a clock icon. That keeps it distinct from a Lost badge.

### Buttons and links

- **Main:** Sea Green with Midnight text (6.4:1), 40px tall like the inputs. It's slightly darker on hover (`#06C396`).
- **Second:** white, with a full `--control-border` border and Midnight text.
- **Delete:** Raspberry's text shade (`#C42A50`) with white text (5.5:1).
- **Icon buttons:** no border, with a tint behind them on hover.
- **Links:** Cerulean's text shade, underlined on hover.

### Type

| Role | Font | Size / line height | Weight |
|---|---|---|---|
| Page title | Instrument Sans | 28 / 36 | 600 |
| Panel title | Instrument Sans | 16 / 24 | 600 |
| Body and table text | Instrument Sans | 14 / 20 | 400 |
| Labels and badges | Instrument Sans | 12 / 16 | 500 |
| Dashboard date line | Instrument Serif, italic | 22 / 30 | 400 |
| Dashboard headline figures, in the band | JetBrains Mono | 40 / 50 | 500 |
| Pipeline figures, in the band | JetBrains Mono | 26 / 34 | 400 |
| Chart totals above a chart | JetBrains Mono | 22 / 30 | 500 |
| Money, percentages and dates in tables and cards | JetBrains Mono, tabular figures | 13 / 20 | 400 |

### Space, shape and depth

- Spacing on a 4px grid: 32px page padding, 24px inside panels and between dashboard panels, 16px between items in a panel.
- Corners: 16px on panels and dialogs, 12px on cards, 8px on buttons and inputs, fully round on badges.
- Panels and cards have no outline. A soft shadow separates them from the page: `0 1px 2px rgba(7, 59, 76, 0.06), 0 2px 8px rgba(7, 59, 76, 0.04)`. A dragged card gets `0 12px 24px rgba(7, 59, 76, 0.18)`.
- Movement is short (150ms) and only where it helps: dialogs, hovers and cards settling after a drop. The charts draw in 400ms. When the computer asks for reduced motion, all of it is turned off.

### Charts

Recharts draws the line chart and the bar chart. The funnel and the pipeline strip are labeled bars built with HTML and CSS, so they line up with the text around them.

- **Revenue won:** a 2.5px line in a deeper Sea Green (`#05A87E`, 3.0:1 on white, so it holds up against white), with a flat 14% Sea Green fill under it (no gradient) and a dot on the latest month. Each month's point sits mid-month, in line with the bars of the chart beside it. Hovering shows a dot and a tooltip for that month. The axis uses round steps, such as $0, $50k, $100k and $150k.
- **Deals won:** Marigold bars with rounded tops, each labeled with its count.
- **Sales funnel:** horizontal bars from the left, one per step, with the stage name on the left, the value and count on the right, and the share carried to the next step under each bar.
  - The funnel shows one measure, so it uses one color: Cerulean's text shade (`#0D6E8E`) for New to Negotiation. Won is in Sea Green, because it means success.
- **Open pipeline by stage:** the strip in the dashboard's band, with segments split by 6px gaps.
  - The colored part of each segment is its expected revenue, in the stage's color. The rest of its value is `--band-rest`.
  - A small key says so: "Colored part: expected revenue" and "Rest of the value".
- **Stage colors in charts:** the brand's stage colors fail a chart color check on their own. Marigold and Coral are close to each other, and Marigold, Sea Green and the slate are faint on white. So every stage-colored mark carries its stage name beside it, and color never identifies a stage by itself.
- Horizontal grid lines only, in `--line`. Axis text is 12px in `--ink-subtle`, with figures in JetBrains Mono and money shortened (`$50k`).
- Tooltips are white panels with a soft shadow, showing full figures such as `$48,500` and `3 deals`.
- A chart with one series uses one color, and color is only used where it means something.

### Avoid

- Borders on one edge of a panel or card, such as a colored stripe down a card's side. Stage color goes in a dot or a badge instead.
- A line under the top bar, or any single line across the top of the page.
- Gradient fills.
- Thin outlines on panels.
- Sea Green, Marigold or Coral as the color of small text.

## 2.7 Words

- Plain business English with short labels, in sentence case, and no exclamation marks.
- Buttons say what they do: "Add deal", "Log activity", "Save changes", "Delete contact".
- Messages are short:
  - "Contact added", "Changes saved", "Activity logged"
  - "Deal moved to Negotiation"
  - "Organization deleted", "Contact deleted", "Deal deleted", "Activity deleted"
  - "Couldn't save. Try again.", "Couldn't delete. Try again.", "Couldn't move the deal. Try again."
- Messages about a contact use the contact's name, not a pronoun: "Sarah Chen's 6 activities will be deleted."
- Money always shows its currency: `$48,500`, never `48,500`.
- Field messages say what to do, and read the same from the form and from the server:
  - "Enter a name.", "Enter a description.", "Enter a close date.", "Enter when it happened."
  - "Use 120 characters or fewer." (with the field's own limit)
  - "Enter an email address, such as sarah@bluefin.example"
  - "Enter a whole number of dollars from $0 to $100,000,000."
  - "Enter a whole percent from 0 to 100."
  - "Choose an organization.", "Choose a contact from Bluefin Logistics."
  - "An organization called Bluefin Logistics already exists."
- A blocked organization delete (DEL-3): "Bluefin Logistics can't be deleted while it has deals. Move these deals to another organization or delete them first:", followed by the list.
- A stage change that's edited or deleted through the API: "Stage changes can't be changed or deleted."
- The pipeline's line with a single late deal: "1 open deal, and it's late".
- Empty states:
  - Timeline: "Nothing logged yet. Log a call, email or note above."
  - Dashboard: "Nothing due in the next 7 days." and "Nothing logged yet."
  - Board columns: "No deals here", and "None closed in the last 30 days" for Won and Lost.

## 2.8 Commands and settings

- **`npm run dev`** runs `scripts/dev.mjs`, which uses only Node's built-in modules so it works before anything is installed:
  1. It runs `npm ci` if `node_modules/.package-lock.json` is missing. npm writes that file only once an install finishes, so an install that was cut short runs again from scratch.
  2. It checks that both ports are free, and says which one is in use if not.
  3. It starts the backend with `uv run uvicorn backend.app.main:app --reload --reload-dir backend --host 127.0.0.1 --port 8000`, watching only the Python code. uv installs Python 3.12 and the packages the first time. On start, the backend runs the migrations and seeds a new database.
  4. It starts Vite on port 5173, which passes `/api` on to the backend.
  5. Once both answer, it prints `Accountable is running at http://localhost:5173` and opens the browser.
  6. Ctrl+C stops both. If either server stops by itself, the other is stopped too.
- **`npm run seed`** runs `uv run python -m backend.app.seed`. It asks "This replaces all your data with the sample data. Type yes to continue:" before touching anything. Any other answer prints "Nothing changed." and leaves everything as it was, with no database created. After `yes`, it runs the migrations, empties every table and loads the sample data in one transaction, so a running app keeps working, then prints "Sample data loaded: 15 organizations, 40 contacts, 35 deals, 80 activities (plus 64 stage changes)." `--yes` skips the question, for the tests.
- **`npm test`** runs `scripts/test.mjs`, which runs the backend tests, the frontend tests and then the end-to-end tests. It runs all three even if one fails, says which failed, and exits with an error if any did. It also fails if a test is left marked `.only`. `npm run test:backend`, `npm run test:frontend` and `npm run test:e2e` run one suite each.
- **Settings:**
  - `ACCOUNTABLE_DB_PATH` (default `data/accountable.db`)
  - `ACCOUNTABLE_API_PORT` (default 8000)
  - `ACCOUNTABLE_WEB_PORT` (default 5173)

  No settings file is needed.
- **`docs/STATUS.md`** says how to install Node.js and uv on each system, and how to run, reset and test the app (concern 6).

## 2.9 Testing

The tests never touch `data/accountable.db`.

- **Backend (pytest):** each test gets a new temporary database and a fixed clock, whose time zone is UTC unless the test gives one. The test client calls the API at `127.0.0.1`. Tests cover:
  - adding, changing, finding and deleting each record, with the field rules
  - every delete rule in 1.10, including the refused organization delete
  - stage changes: probability, close date, the stage-change entry, read-only entries, Won and Lost fixed at 100% and 0%
  - card moves and positions
  - the 30-day Won and Lost columns
  - late deals
  - CON-5
  - each dashboard figure, including months with no wins and the funnel, in time zones east and west of UTC
  - the sample data's size, spread and dates relative to the seed day, and a "no" to `npm run seed` leaving nothing behind
  - the host check (RUN-6)
- **Frontend (Vitest),** run in the America/Los_Angeles time zone, with up to 15 seconds per test:
  - money and date formats
  - the rules in `lib/rules.ts`, checked against the same cases as the backend
  - the board's totals after a move
  - table search and sorting
  - the delete dialog's wording
  - the deal form filling in probability and close date when the stage changes
  - the Log activity box's "When" keeping up with the clock
- **End to end (Playwright Test, installed Chrome, `channel: "chrome"`, 1440 by 900):**
  - Setup: the run starts its own backend (port 8100, database `e2e/.data/test.db`, freshly seeded) and frontend (port 5273), so it works beside `npm run dev`. Tests that change data make their own records, so they don't depend on each other.
  - Errors: a shared fixture fails any test that logs a console error, gets an API error it didn't declare, or sends a request that leaves the computer.
  - The journeys:
    - landing on the dashboard with data
    - adding, searching, sorting, editing and deleting in each table, then refreshing
    - filtering contacts by status
    - each delete dialog's wording and result, including the blocked organization
    - dragging a card to another column, checking its stage, probability, close date and timeline entry in the Deals table and on its page, then refreshing
    - reordering within a column, then refreshing
    - holding a card over the gap between two columns
    - adding a deal from a column
    - logging an activity with a follow-up and seeing it on the deal, on its main contact and on the dashboard, then ticking it done
    - moving a deal to Won and seeing the dashboard change
    - resetting the data with `npm run seed`, last
- **By eye:** the tests can't judge how a screen looks or how dragging feels, so each screen is also used in a real browser and checked against this spec and the chosen mockup.

## 2.10 Accessibility and states

- Everything works from the keyboard, with a visible focus outline, and dialogs keep the focus inside them until they close.
- Text meets 4.5:1 contrast, and the outlines of controls meet 3:1 (2.6).
- Icon-only buttons have names for screen readers. Each chart has a short text summary for screen readers.
- On first load, panels show grey placeholder blocks the size of their content, so the page doesn't jump when the data arrives.

## Chosen mockup

**Mockup 2, Midnight deck** (`docs/mockups/2-midnight-deck.html`, with its screenshot `2-midnight-deck.png`) is the chosen one of the three in `docs/mockups/`. The app follows it. Where they differ, this spec wins: the chart totals keep a 30px line height (the mockup's comes out at 20px), and the main Add deal button is 40px tall like the inputs (the mockup's is 37px).

What it brings:

- **The figures come first.** The Midnight band puts each page's headline figures in large type the moment the page opens, which suits a salesperson checking how things stand.
- **The brand colors work hardest on Midnight.** Sea Green, Marigold and Coral are too faint on white for small marks, but they're clear on the band. So the pipeline strip and the column headings carry the stage colors there, and the light page below stays calm.
- **The pipeline at a glance.** The strip shows each open stage's value and how much of it is expected revenue in one picture, without a separate chart.
- **It looks like a product.** The top bar and band read as one block, which looks sharp and professional, with no lines or gradients.

The other two stay in `docs/mockups/` for reference. Mockup 1, Clear desk, was the closest to the first draft of this spec. Mockup 3, Work first, put follow-ups in a rail and the funnel at the center.
