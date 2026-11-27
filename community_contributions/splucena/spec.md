# Spec: the Accountable MVP

This spec turns `docs/intent.md` into requirements and a design for the MVP. Where the intent leaves a choice open, the spec makes one and says so. The concerns below are the choices worth your attention before the build.

## Decisions

Concerns 1 to 7 from the first draft are settled, and the rest of the spec follows them.

1. **Sales funnel.** Each deal records the furthest open stage it reached and, if lost, the stage it was lost from. The funnel shows, for New, Qualified, Proposal, Negotiation and Won, the total value of the deals created in the last 12 months that reached at least that stage. A separate **Lost** category beside the funnel shows the value lost, split by the stage it was lost from ("Lost at Proposal", "Lost at Negotiation" and so on), so you can see where deals drop out.
2. **Close date when a deal is won or lost.** Moving a deal to Won or Lost sets its close date to today, and the user can edit it afterwards. Moving it back to an open stage leaves the date alone. Revenue won is counted in the month of the close date.
3. **Which deals are late.** A deal is late when it is in an open stage (New to Negotiation) and its close date is before today. Won and Lost deals are never late.
4. **Six stages, six colors.** The brand gains a sixth color, Slate `#9FB0B5` with Midnight text, for closed and inactive things. New is Sea Green, Qualified Marigold, Proposal Coral, Negotiation Cerulean, Won Midnight and Lost Slate. Raspberry is kept for things that need attention: late deals, overdue follow-ups and deleting. The brand skill is updated to match.
5. **White text on Cerulean and Raspberry.** White on Cerulean is about 4.0:1 and white on Raspberry about 3.6:1, which only passes for large text (24px, or 19px bold). Buttons, chips and badges are smaller than that, so anything with white text on it uses a deep shade as its fill: Cerulean Deep `#0B6A8A` (6.1:1) and Raspberry Deep `#C42350` (5.7:1). The bright Cerulean and Raspberry are used where there's no small text on them: chart series, stage dots, icons, card highlights and large figures. The deep shades double as the text color for Cerulean and Raspberry text on white. The brand skill is updated to match.
6. **Fonts offline.** Instrument Sans, Instrument Serif and JetBrains Mono are bundled with the frontend through the `@fontsource` packages and imported in the app's entry file, so nothing is fetched from Google Fonts at run time and the app looks the same with no internet connection.
7. **Entries the app writes by itself.** Stage changes ("Moved from Proposal to Negotiation") and status changes ("Status changed from Lead to Customer") are stored as activities of a fifth kind, `system`, that the user can't edit or delete and that never carry a follow-up. They are deleted with the deal or contact they belong to.

## Concerns

These are still open. Each has a proposed answer, and the spec follows it until you say otherwise.

8. **The Pipeline board with many closed deals.** With 2,000 deals, the Won and Lost columns could hold over a thousand cards, which would slow the board down. *Proposal:* every column counts all its deals in its totals, but Won and Lost show the 50 most recently closed cards with a "Show all" link at the bottom. Open columns always show every card. With the sample data every card is shown.
9. **Probability when a deal is edited in a form.** *Proposal:* changing the stage in the deal form fills in the new stage's probability straight away, and the user can then type a different one. Whatever the form holds when it's saved is what's kept. Dragging a card within its own column never changes its probability.
10. **Which fields are required.** The intent names a few checks. *Proposal:* an organization needs a name; a contact needs a name and a status; a deal needs a name, an organization, a stage, a value (0 or more, default 0) and a close date; an activity needs a type, a description, a date and time, and at least one of a contact and a deal. Names may repeat, since two people can share a name.
11. **Which contact an activity on a deal can name.** *Proposal:* any contact, with the deal's main contact chosen first and the other contacts at the deal's organization listed next, then everyone else through search.
12. **What "today" means.** The app runs on one computer, so *proposal:* the backend uses that computer's local date for due, overdue, late and the current month. The frontend never works these out itself, so the two never disagree.
13. **Later intents.** Sign-in, several users and Supabase come later. *Proposal:* keep all database access in one module of the backend, use only column types that work in both SQLite and Postgres, and keep no per-user data, so that change doesn't need a rewrite. No user or owner columns are added yet.

## Requirements

Requirements are numbered so the plan and tests can refer to them.

### General

- **R1.** One command, `npm run dev`, starts the backend and the frontend on Mac, Linux and Windows. The browser opens on the dashboard at `http://localhost:5173`.
- **R2.** The app works with no internet connection. Fonts, icons and libraries are bundled.
- **R3.** Every change is saved in a SQLite database file straight away, and is still there after a refresh and a restart.
- **R4.** When the database file doesn't exist, the backend creates it and fills it with the sample data. `npm run seed` deletes everything and loads the sample data again.
- **R5.** With the sample data, every screen loads and every action responds in well under a second (target: under 300 ms for any API call on a laptop).
- **R6.** Light mode only, laid out for a laptop or desktop screen of 1280px wide or more. It still works at 1024px wide.
- **R7.** The browser's console shows no errors or warnings during normal use.

### Tables

These apply to the Organizations, Contacts and Deals tables.

- **R8.** A search box filters the rows as you type (after a short pause). Organizations search by name, website and industry; contacts by name, email, phone, job title and organization name; deals by name, organization name and main contact's name.
- **R9.** Clicking a column heading sorts by that column; clicking again reverses the order. The heading shows the current direction.
- **R10.** Tables show 25 rows a page, with next and previous buttons, the page number and the total number of records. Searching, sorting and paging are done by the backend so they stay fast with thousands of rows.
- **R11.** Each table has an "Add" button that opens a form in a dialog. Each row has Edit and Delete. Clicking the row elsewhere opens the record's page.
- **R12.** Delete asks first in a dialog that says what happens to the linked records, with their counts. For example: "Delete Northwind Traders? Its 4 contacts and 3 deals will be kept, with no organization."

### Records

- **R13. Organization:** name (required), website, industry, notes. Its page shows its details, its contacts and its deals.
- **R14. Contact:** name (required), email, phone, job title, organization (optional), status (lead, qualified or customer; required, default lead). Its page shows its details, a link to its organization, its deals as main contact, and its timeline.
- **R15. Contacts filter:** the Contacts table has a status filter (All, Lead, Qualified, Customer) that works with search, sorting and paging.
- **R16. Deal:** name (required), organization (required), main contact (optional), stage (required), value in US dollars (required, 0 or more), probability of close (0 to 100%), close date (required). Its page shows its details, links to its organization and main contact, and its timeline.
- **R17. Stage probabilities:** New 10%, Qualified 25%, Proposal 50%, Negotiation 75%, Won 100%, Lost 0%. A deal takes its new stage's probability when its stage changes. A probability set by hand stays until the stage changes again (Concern 9).
- **R18. Late deals:** a late deal (Decision 3) shows a Raspberry Deep "Late" badge in the Deals table, on its page and on its pipeline card.

### Deleting

- **R19.** Deleting an organization keeps its contacts and deals and clears their organization.
- **R20.** Deleting a contact keeps the deals it was the main contact on and clears their main contact.
- **R21.** Deleting a contact or deal deletes the activities linked only to it. An activity linked to both keeps its link to the one that remains.
- **R22.** A deal with no organization (after its organization was deleted) shows "No organization" and asks for one the next time it's edited in the form.

### Forms

- **R23.** Forms check input before saving and show a message beside each field that's wrong: a missing required field, a badly formed email, a negative value, a probability outside 0 to 100, a website that isn't a web address. Nothing is saved until every field is right. The backend checks the same rules and returns the same messages, so a bad request can never save bad data.
- **R24.** Forms work from the keyboard: Tab moves between fields, Enter submits, Escape closes the dialog without saving. The first field has focus when a dialog opens, and focus returns to the button that opened it when it closes.
- **R25.** Organization, contact and deal fields that pick another record use a searchable select, so they stay usable with thousands of records.

### Activities and follow-ups

- **R26.** From a contact or deal page, "Log activity" opens a form: type (note, call or email), description, date and time (default now), optional follow-up date, and on a deal, an optional contact (Concern 11).
- **R27.** Timelines show every activity linked to the record, newest first, by date and time. An activity linked to both a contact and a deal appears in both timelines.
- **R28.** Note, call and email activities can be edited and deleted from the timeline. System entries can't (Decision 7).
- **R29.** A follow-up is open until marked done. Compared with today: due today on its date, overdue from the day after, coming up if due in the next 7 days. Open follow-ups show on the dashboard and can be marked done there and in the timeline.
- **R30.** When a deal's stage changes, by dragging or in the form, a system entry "Moved from {old} to {new}" is added to its timeline.
- **R31.** When a deal moves to Won and its main contact isn't a customer, the contact becomes a customer and a system entry "Status changed from {old} to Customer, after {deal} was won" is added to the contact's timeline. Nothing changes back if the deal later leaves Won.

### Pipeline

- **R32.** The board has six columns in order: New, Qualified, Proposal, Negotiation, Won, Lost. Cards show the deal's name, organization, value, probability, close date and a Late badge when late.
- **R33.** Dragging a card to another column changes the deal's stage (with R17, R30, R31). Dragging within a column changes its place. A card can be dropped at any position and stays there after a refresh.
- **R34.** Each column has an "Add deal" button that opens the deal form with that stage chosen. The new deal goes at the top of the column.
- **R35.** The board's header shows the total value and expected revenue of the open deals. Each column, Won and Lost included, shows its count, total value and expected revenue. The figures update as soon as a card is dropped, before the server replies. If the save fails, the card goes back and a message says so.
- **R36.** Clicking a card opens the deal's page.
- **R37.** Won and Lost show their 50 most recently closed cards and a "Show all" link (Concern 8).

### Dashboard

- **R38.** Summary figures: open pipeline value, expected revenue (sum of value times probability over open deals), revenue won this month, and deals won this month. Each shows the change against last month where it makes sense.
- **R39.** A line chart of revenue won per month over the last 12 months, up to and including the current month, with months that had no wins shown as zero.
- **R40.** A bar chart of deals won per month over the same 12 months.
- **R41.** A pipeline visual: one bar per open stage showing its total value and expected revenue, in the stage colors.
- **R42.** A sales funnel of value reaching each stage, with a Lost category beside it split by the stage each deal was lost from (Decision 1).
- **R43.** Recent activity: the 10 latest activities of any kind, including system entries, each linking to its contact or deal.
- **R44.** Follow-ups: open follow-ups that are overdue, due today or coming up in the next 7 days, overdue first, each with a "Done" button and a link to its record.
- **R45.** Every figure matches the data. Winning a deal or adding a follow-up shows on the dashboard the next time it's opened.

### Sample data

- **R46.** About 25 organizations across at least 6 industries, 80 contacts at every status (some with no organization), 60 deals at every stage, and 200 activities.
- **R47.** Won and lost deals spread over the past 12 months so both charts have a shape; open deals expected to close over the next few months; at least 4 open deals running late.
- **R48.** Follow-ups spread so that some are overdue, some are due today, some are coming up and some are done. Dates are relative to the day the seed runs, so the data always looks current.
- **R49.** Names, companies and notes read like a real small business's book: plausible company names, industries and job titles, and no lorem ipsum.

## Design

### Architecture

```
Browser ── React app (Vite, port 5173) ──/api proxy──> FastAPI (port 8000) ──> SQLAlchemy Core ──> SQLite file
```

- **Frontend** (`frontend/`): React, TypeScript and Vite. Vite's dev server proxies `/api` to the backend, so there's no CORS setup. Routing with React Router. Server data through TanStack Query, which caches it and handles the optimistic updates on the board.
- **Backend** (`backend/`): FastAPI with Pydantic models for every request and response. One module (`backend/db.py` or similar) owns the SQLAlchemy Core tables and the queries; route handlers call it and never build queries themselves. Business rules (probabilities, stage-change entries, the customer rule, the funnel fields, deleting links) live in a service module so they apply the same way whether a change comes from the board or a form.
- **Database:** one SQLite file, `data/accountable.db`, git-ignored. Tests use their own file, set by an environment variable (for example `ACCOUNTABLE_DB`).
- **Commands:** root `package.json` scripts. `npm run dev` runs uvicorn and Vite together with `concurrently`. `npm run seed` runs a Python seed script through `uv run`. `npm test` runs Vitest, then pytest, then Playwright.

### Libraries

Popular, well-supported libraries rather than custom code:

| Need | Library |
|---|---|
| Tables (sorting state, columns) | TanStack Table |
| Server data, caching, optimistic updates | TanStack Query |
| Charts | Recharts |
| Drag and drop on the board | dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`) |
| Dialogs, selects, menus (accessible, keyboard ready) | Radix UI primitives |
| Forms and checks | React Hook Form with Zod |
| Icons | Lucide |
| Fonts | `@fontsource/instrument-sans`, `@fontsource/instrument-serif`, `@fontsource/jetbrains-mono` |
| Dates | date-fns |

### Data model

All tables have an integer `id` and `created_at` and `updated_at` timestamps. Money is stored as whole cents in an integer, so totals never pick up rounding errors.

**organizations**: `name` (text, required), `website`, `industry`, `notes` (text, optional).

**contacts**: `name` (required), `email`, `phone`, `job_title`, `organization_id` (nullable, set to null when the organization is deleted), `status` (`lead`, `qualified`, `customer`).

**deals**: `name` (required), `organization_id` (required by the forms; nullable in the table so deleting an organization can clear it), `contact_id` (nullable main contact), `stage` (`new`, `qualified`, `proposal`, `negotiation`, `won`, `lost`), `value_cents` (integer, 0 or more), `probability` (integer 0 to 100), `close_date` (date), `position` (integer, the card's place in its column), `furthest_stage` (the furthest stage reached, for the funnel; Lost never counts as a stage reached), `lost_from_stage` (nullable; the stage the deal was in when it last moved to Lost, cleared when it leaves Lost), `closed_at` (timestamp of the last move to Won or Lost, for R37).

**activities**: `type` (`note`, `call`, `email`, `system`), `description` (required), `occurred_at` (date and time), `contact_id` and `deal_id` (nullable, at least one set), `follow_up_date` (date, nullable), `follow_up_done` (boolean, default false).

Indexes on every foreign key, on `deals(stage, position)`, on `activities(occurred_at)`, on `activities(follow_up_date)`, and on the name columns used for sorting.

**Board positions.** `position` is a gap-spaced integer (1000, 2000, ...). A dropped card takes a position halfway between its new neighbours. When there's no gap left, the column is renumbered in the same transaction. The backend's move endpoint takes the target stage and the IDs of the cards either side of the drop, so the client never sends raw positions.

**Deleting.** Done by the service layer in one transaction, not by database cascades, so the rules in R19 to R21 are explicit and tested: clear links, delete activities linked only to the deleted record, clear the deleted side on activities linked to both, then delete the record.

### API

JSON over `/api`. List endpoints take `q`, `sort`, `order` (`asc` or `desc`), `page` and `page_size` (default 25), and return `{ items, total, page, page_size }`. Validation errors return 422 with a message per field, which the forms show beside the fields.

| Method and path | Purpose |
|---|---|
| `GET/POST /api/organizations` | List (search, sort, page) or create |
| `GET/PUT/DELETE /api/organizations/{id}` | Read with its contacts and deals, update, delete |
| `GET /api/organizations/{id}/delete-impact` | Counts for the delete dialog |
| `GET/POST /api/contacts` | List with `status` filter, or create |
| `GET/PUT/DELETE /api/contacts/{id}` | Read with organization, deals and timeline; update; delete |
| `GET /api/contacts/{id}/delete-impact` | Counts for the delete dialog |
| `GET/POST /api/deals` | List with `stage` and `late` filters, or create |
| `GET/PUT/DELETE /api/deals/{id}` | Read with organization, contact and timeline; update; delete |
| `GET /api/deals/{id}/delete-impact` | Counts for the delete dialog |
| `POST /api/deals/{id}/move` | `{ stage, before_id, after_id }`: change stage and place |
| `GET /api/pipeline` | Every column's cards (Won and Lost limited unless `all=true`) and totals |
| `POST /api/activities`, `PUT/DELETE /api/activities/{id}` | Log, edit, delete (system entries refused with 403) |
| `POST /api/activities/{id}/done` | Mark a follow-up done or not done |
| `GET /api/dashboard` | All dashboard figures in one response |
| `GET /api/lookup/{organizations,contacts}?q=` | Short lists for the searchable selects |

Every response that includes a deal includes `is_late`, worked out by the backend (Concern 12). Every response with a follow-up includes its state: `overdue`, `today`, `upcoming` or `later`.

### Chosen mockup

The look follows mockup B, "Command", for both screens: `docs/mockups/b-dashboard.html` and `docs/mockups/b-pipeline.html`, with their screenshots beside them. Mockups A and C stay in `docs/mockups/` for reference.

Why B:

- The Midnight top panel puts the four figures that matter most and the revenue trend in one place, so the dashboard reads at a glance and looks the most striking of the three.
- The pipeline's solid stage-colored column headers make the six stages easy to tell apart, and the figures in them are easy to read.
- Follow-ups split into Overdue, Due today and Coming up make it plain what to do first.
- The slim icon rail leaves more width for the six-column board.

Where the build differs from the mockup:

- The search boxes in the mockup's header are left out. The intent asks for search in each table, not a search across the whole app or the board, so the header keeps only the page's main action.
- The funnel's Negotiation band uses Cerulean Deep, because it carries a white label (Decision 5). The mockup used the bright Cerulean there.
- The mockup's figures are sample values; the app shows the real data.

### Screens and layout

**Shell.** A fixed icon rail, 96px wide, on Midnight. The Accountable mark sits at the top in a Sea Green rounded square, then links to Dashboard, Pipeline, Deals, Contacts and Organizations, each a Lucide icon with a short label under it in Sea Mist. The current page's link has a faint Sea Green background, a Sea Green icon and a white label. The main area has the page background, a page title in Instrument Sans at 28px semibold on the left, the page's main action (such as "Add deal" in Sea Green) on the right, and content in white panels with 18px rounded corners.

**Dashboard.** Four rows:

1. **Top panel**, Midnight, full width, 22px corners. On the left, a greeting in Instrument Serif italic in white ("Good afternoon. Here's how sales are going in November.", the page's only use of the accent font), then the four figures (R38) in a two-by-two grid, in JetBrains Mono at 28px: open pipeline (with the count of open and late deals, late in Coral), expected revenue in Sea Green, revenue won this month and deals won this month, each with last month for comparison. On the right, the revenue line chart (R39) in Sea Green with a soft fill under the line, on faint Sea Mist grid lines, with a Revenue and Deals switch.
2. **Open pipeline by stage** (R41), full width. One bar split into the four open stages, each segment's width its share of the open value and labelled with that value. Under it, a card per stage with its count, total value, expected revenue and probability. The total and expected revenue sit at the top right.
3. **Sales funnel** (R42) next to **Deals won** (R40). The funnel is drawn as a funnel of five bands, New to Won in the stage colors, with each band's value and its share of New beside it. The Lost panel sits to its right: the total lost, then a row for each stage it was lost from, with a Slate bar for its share. Deals won is a bar chart in Sea Mist with the current month in Sea Green and each bar's count above it, and the 12-month total at the top right.
4. **Follow-ups** (R44) next to **Recent activity** (R43). Follow-ups are in three lanes, Overdue, Due today and Coming up, each headed with its count. Each follow-up is a small card, tinted pale Raspberry when overdue and pale Marigold when due today, with the task, the contact and record, the due date and a "Done" button. Recent activity is a timeline with a vertical line; notes, calls and emails have a white circle with their icon, and system entries a Midnight circle with a Sea Green arrow. Each entry links to its record.

**Organizations, Contacts, Deals tables.** A panel holding a toolbar (search box, the Contacts status filter as a segmented control, the Add button in Sea Green) above the table. Rows are 44px high, numbers and dates right-aligned in JetBrains Mono, status and stage as colored chips. Pagination sits below the table. Empty results say "No contacts match 'smith'" with a button to clear the search.

**Record pages.** A header panel with the name, key details and Edit and Delete buttons. Below it, two columns: on the left the linked records (an organization's contacts and deals; a contact's organization and deals; a deal's organization and contact); on the right the timeline, with "Log activity" at its top. Each timeline entry has an icon for its type, the description, the date and time, any linked record, and a follow-up chip. System entries are shown smaller and in a muted color so notes, calls and emails stand out.

**Pipeline.** Under the title, a Midnight summary bar shows the open pipeline's total value and deal count, the expected revenue in Sea Green, and a thin bar split by each open stage's share of the value with its percentage. Below it, six columns side by side, at least 196px wide each, scrolling sideways if the window is too narrow. Each column has a solid header in its stage color: New, Qualified and Proposal in their colors with Midnight text, Negotiation in Cerulean Deep with white text, Won in Midnight with Sea Mist text and Lost in Slate with Midnight text. The header shows the stage name, the count, total value and expected revenue, and, on open stages, a "+" button to add a deal at that stage. Cards are white with 14px corners and show the deal's name, organization, the main contact's initials in a Midnight circle, the value in JetBrains Mono, a thin probability bar in the stage color with the percentage, and the close date. Late cards have a Raspberry outline all round and a Raspberry Deep "Late" chip, and the date turns Raspberry Deep. Won and Lost cards are paler and show "Won" or "Lost" with the date, and Lost cards a chip naming the stage they were lost from. A card lifts with a shadow while dragged. Won and Lost end with "Show all".

**Dialogs.** Centered, rounded, white, with a dimmed backdrop. Forms are one column, labels above fields, error messages in Raspberry Deep below each field. The save button is Sea Green with Midnight text; delete confirmation uses a Raspberry Deep button with white text.

### Brand

The brand skill takes priority over general design guidance.

**Fonts.** Bundled through `@fontsource` (Decision 6). Instrument Sans for headings and body (16px body, 14px in tables). Instrument Serif for the dashboard greeting only. JetBrains Mono for money, numbers, dates and IDs.

**Colors.**

| Role | Color | Text on it |
|---|---|---|
| Primary (main actions, current nav item, New stage) | Sea Green `#06D6A0` | Midnight |
| Secondary (Qualified stage, lead status) | Marigold `#FFC145` | Midnight |
| Tertiary (Proposal stage) | Coral `#F78C6B` | Midnight |
| Information (Negotiation stage, qualified status) in charts, dots and icons | Cerulean `#118AB2` | No small text |
| Information chips, badges and buttons; links | Cerulean Deep `#0B6A8A` | White |
| Alert (late, overdue) in charts, dots, icons and highlights | Raspberry `#EF476F` | No small text |
| Alert chips, badges and buttons (Late, Overdue, Delete) | Raspberry Deep `#C42350` | White |
| Won stage, customer status, sidebar | Midnight `#073B4C` | Sea Mist `#CDD8DB` |
| Lost stage, closed and inactive things | Slate `#9FB0B5` | Midnight |
| Ink on light backgrounds | Midnight `#073B4C` | |
| Page background | `#F0F4F5` | |
| Panels and cards | White | |

For small text in a brand color on white, use the darkened shades: Sea Green `#037A5C`, Marigold `#8A5A00`, Coral `#B4532F`, Cerulean Deep `#0B6A8A`, Raspberry Deep `#C42350`. Each meets 4.5:1 on white. Slate is too light for text on white, so text in a Slate context is Midnight. Charts use Sea Green, Marigold and Coral first, then Cerulean, Raspberry and Slate, as the brand sets out. The stage colors are fixed so a stage looks the same on every screen.

**Surfaces.** Panels have rounded corners (18px, 14px for cards), no outline and at most a very soft shadow. No border on one edge of a panel, no line across the top of the page, and no gradient fills except, at most, a faint fill under the revenue line.

**Tone.** Plain business English, short labels ("Add deal", "Log activity", "Mark done"), no jargon and no exclamation marks. Money always shows the currency: `$12,500`, and large figures on the dashboard may shorten to `$1.2M`. Messages say what happened and what to do: "Enter an email address like name@company.com."

### Testing

- **Backend (pytest):** the business rules through the service layer and the API: stage probabilities, hand-set probabilities kept, stage-change entries, the customer rule, the funnel and its Lost category, each delete rule, board positions (including renumbering), follow-up states around today, late deals, the funnel and every dashboard figure against a small known data set, and validation messages. Each test uses a fresh temporary database.
- **Frontend (Vitest):** form checks, money and date formatting, follow-up and late labels, and the board's optimistic totals.
- **End to end (Playwright with installed Google Chrome):** the tests start the backend and frontend on their own ports with their own seeded database. They cover each success criterion in the intent: adding, searching, sorting, editing and deleting in each table; the contacts filter; record pages; dragging a card between and within columns and checking it after a refresh; adding a deal in a column; logging an activity with a follow-up and seeing it on the dashboard; winning a deal and seeing the contact become a customer; keyboard use and Escape; and no console errors on any screen.
- **By hand:** before the MVP is called done, someone uses every section and action in a real browser and checks each screen by eye (success criterion 9).
