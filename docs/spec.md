# Spec: the Accountable MVP

This spec turns `docs/intent.md` into requirements and a design. The intent says what and why; this says exactly how it behaves and looks. Where the two disagree, the intent wins, and this spec should be fixed.

## Concerns

Each concern says what the problem is and what this spec decides. Change any decision you disagree with before building starts.

1. **Fonts and "no internet connection".** The brand's fonts come from Google Fonts, but the app must work offline. Decision: ship the fonts with the app through the Fontsource npm packages (`@fontsource-variable/instrument-sans`, `@fontsource/instrument-serif`, `@fontsource-variable/jetbrains-mono`). The typefaces are the same, and they load with no network.
2. **Six stages, five brand colors.** The brand gives five colors in order for things side by side, but there are six stages, and Won and Lost should read as good and bad. Decision: New uses a neutral (Midnight at low strength), Qualified Cerulean, Proposal Marigold, Negotiation Coral, Won Sea Green and Lost Raspberry. Strictly, this departs from the brand's order. Chart series that aren't stages follow the brand's order exactly.
3. **Bright colors as text.** Sea Green and Marigold are too light for text on white. Decision: the spec defines darker text versions (see Design tokens). They must be checked for at least 4.5:1 contrast before use.
4. **"Current calendar year" in January.** The monthly charts cover January to this month, so in early January they show one month. Decision: keep the intent's rule. Note that the sample data's won deals are spread over the past 12 months, so a reset in January still fills the "last year" figures (see Dashboard).
5. **Sample data dates go stale.** Fixed dates would leave the dashboard empty and every deal late after a few months. Decision: the seed builds every date relative to the day it runs. That covers close dates, activity dates and follow-ups. `npm run seed` always gives a live-looking app.
6. **"One command" for someone non-technical.** `npm run dev` needs `npm install` to have run once first. Decision: `npm run dev` runs `uv sync` itself before it starts, so the only setup is `npm install` once, then `npm run dev`. `docs/STATUS.md` says this in two lines.
7. **A contact moving to another organization.** A deal's main contact must belong to the deal's organization, so changing a contact's organization can break that rule. Decision: the save asks first, saying "Ana Ruiz will be removed as main contact from 2 deals at Northwind". If confirmed, those deals lose their main contact. Changing a deal's organization clears its main contact if they don't belong to the new one, and the form says so before saving.
8. **Probability set by hand and stage changed together.** In the deal form, someone could change the stage and type a probability in the same save. Decision: a probability typed in that same save wins. A stage change made anywhere else (the board, or a form save where probability wasn't touched) takes the stage's usual probability.
9. **A closed deal reopened.** Dragging a Won or Lost deal back to an open stage leaves its close date in the past, so it shows as late at once. Decision: the date is kept and the deal shows as late. Only the user knows the new expected date, and the late flag prompts them to set it.
10. **Stage changes are not activities.** Stage changes appear in timelines, but the intent lists only note, call and email as activity types. Decision: stage changes are kept in a table of their own. They can't be edited or deleted by hand, and they're deleted with their deal. Timelines and recent activity merge both lists by time.
11. **What "reaches each stage" means for the funnel.** Decision: a deal reaches every stage up to the furthest open stage it has been in, according to its stage changes. A Won deal reaches all four open stages and Won. A Lost deal counts up to the last stage it was in before Lost. The sample data includes stage history so the funnel looks real.
12. **"$" and "money is always shown with its currency".** Everything is US dollars. Decision: show `$48,000`, and `$48k` where space is tight, such as chart axes and pipeline cards. A label on the dashboard says "All amounts in US dollars". If you want `USD` written out, it's a one-line formatting change.
13. **Deal values are whole dollars.** Decision: values are whole dollars, with no cents, stored as integers. That matches how sales pipelines are usually tracked, and it avoids rounding errors.
14. **Local time.** "Late", "overdue" and "today" all depend on the date. Decision: the frontend uses the computer's local date. The backend stores dates without times (`YYYY-MM-DD`) for close dates and follow-ups, and stores activity times as ISO timestamps.

## Requirements

Numbered so the plan and tests can refer to them. "Open" deals are those not at Won or Lost. A deal is **late** when it is open and its close date is before today.

### R1. Records

**R1.1 Organization**: `name` (required, unique ignoring case), `website`, `industry` (free text, with existing values suggested), `notes`.

**R1.2 Contact**: `first_name` and `last_name` (required), `email` (valid format if given), `phone`, `job_title`, `organization_id` (optional), `status` (`lead`, `qualified` or `customer`; default `lead`).

**R1.3 Deal**: `name` (required), `organization_id` (required), `contact_id` (optional; must belong to the deal's organization), `stage` (`new`, `qualified`, `proposal`, `negotiation`, `won`, `lost`), `value` (whole US dollars, 0 or more), `probability` (whole number 0 to 100), `close_date` (required), `position` (its place in its pipeline column).

**R1.4 Stage probabilities**: New 10, Qualified 25, Proposal 50, Negotiation 75, Won 100, Lost 0. A new deal starts at its stage's probability. When the stage changes, probability is reset to the new stage's value, unless concern 8 applies.

**R1.5 Closing**: when a deal moves to Won or Lost, `close_date` is set to today. It can still be edited.

**R1.6 Activity**: `type` (`note`, `call`, `email`), exactly one of `contact_id` or `deal_id`, `description` (required), `occurred_at` (defaults to now), `follow_up_date` (optional), `done` (default false; meaningful only with a follow-up).

**R1.7 Stage change**: `deal_id`, `from_stage`, `to_stage`, `changed_at`. It is recorded automatically whenever a deal's stage changes, from the board or from a form. A new deal records no stage change; its timeline starts with "Created at Proposal".

**R1.8 Expected revenue** of a deal is `value * probability / 100`, rounded to the dollar.

### R2. Tables (Organizations, Contacts, Deals)

- **R2.1** Every table has a search box that filters rows as you type, case-insensitively, across its text columns. Organizations search name, industry and website. Contacts search name, email, job title and organization name. Deals search name, organization and contact.
- **R2.2** Clicking a column heading sorts by it. A second click reverses the order, and an arrow shows the direction. The default sorts are: organizations by name, contacts by last name, deals by close date.
- **R2.3** An "Add" button opens a form in a side panel. Each row has edit and delete actions. Clicking a row opens the record's page.
- **R2.4** Organizations columns: Name, Industry, Website, Contacts (count), Open deals (count), Open value.
- **R2.5** Contacts columns: Name, Organization, Job title, Email, Phone, Status. Above the table, a status filter with All, Lead, Qualified and Customer, each with its count.
- **R2.6** Deals columns: Name, Organization, Contact, Stage, Value, Probability, Expected revenue, Close date. Late deals show a Raspberry "Late" badge next to the close date, and the date itself in Raspberry.
- **R2.7** An empty search result says "No organizations match "acme"", with a button that clears the search.

### R3. Deleting

- **R3.1** Every delete opens a confirmation that names the record and says exactly what happens to linked records, with counts. For example: "Delete Northwind? Its 3 deals and their 11 activities will be deleted. Its 5 contacts will stay, with no organization."
- **R3.2** Deleting an organization deletes its deals, their activities and their stage changes. Its contacts' `organization_id` is cleared.
- **R3.3** Deleting a contact deletes its activities. Deals where it was main contact have `contact_id` cleared.
- **R3.4** Deleting a deal deletes its activities and stage changes.
- **R3.5** Deleting an activity asks first too, in a smaller confirmation.
- **R3.6** After deleting from a record's own page, the app returns to that section's table.

### R4. Record pages

- **R4.1 Organization page**: its details (editable), a list of its contacts and a list of its deals, each linking to its page, with "Add contact" and "Add deal" buttons that preset the organization.
- **R4.2 Contact page**: details and status, a link to the organization, the deals where they're main contact, and the timeline.
- **R4.3 Deal page**: details (stage, value, probability, expected revenue, close date, organization, contact), the late badge if late, and the timeline.
- **R4.4 Timeline**: newest first. It shows activities and stage changes together. A contact's timeline also includes activities on the deals where they're currently main contact, each marked with that deal's name. Each activity shows its type icon, description, when it happened, and its follow-up date with a done checkbox. Stage changes read "Moved from Proposal to Negotiation".
- **R4.5 Log activity**: a form at the top of the timeline (type, description, when, optional follow-up date). Activities can be edited and deleted from the timeline.

### R5. Pipeline

- **R5.1** Six columns in stage order. Each column header shows the stage name, the number of deals, the total value and the expected revenue.
- **R5.2** Above the board: total value and expected revenue of all open deals.
- **R5.3** Cards show the deal name, organization, value, close date and the contact's initials. Late cards show the Late badge. A card links to the deal's page.
- **R5.4** Dragging a card to another column changes its stage (R1.4, R1.5, R1.7). Dragging within a column changes its order. The drop position is kept exactly, and it survives a refresh and a restart.
- **R5.5** Totals update immediately on drop (an optimistic update). If the save fails, the card returns to where it was and a message says the change wasn't saved.
- **R5.6** Each column has an "Add deal" button at its foot that opens the deal form with that stage preset. The new deal goes to the bottom of the column.
- **R5.7** Cards in a column are ordered by `position`. Positions are numbers, and a dropped card takes a value between its neighbours, so only the moved card is saved.
- **R5.8** Won and Lost columns show their deals too. They are excluded from the open totals in R5.2, and their own column totals are shown in muted text.

### R6. Dashboard

- **R6.1 Headline figures** in a row of tiles: Open pipeline (total value of open deals), Expected revenue (sum over open deals), Won this year (revenue from deals won this calendar year, with the count), and Win rate this year (won divided by won plus lost, by count, for deals closed this year).
- **R6.2 Revenue won by month**: a line chart from January to the current month, with this year's revenue as the main line and last year's same months as a faint comparison line.
- **R6.3 Deals won by month**: a bar chart over the same months, the count of deals won each month.
- **R6.4 Pipeline funnel**: one horizontal bar per open stage plus Won, its length the value that reached that stage (concern 11), labelled with the value and the deal count, in stage colors.
- **R6.5 Open pipeline by stage**: a stacked bar showing how the open value splits across the four open stages, with expected revenue beside each stage.
- **R6.6 Follow-ups**: undone follow-ups, overdue first (in Raspberry, with days overdue), then due in the next 14 days, each with the related contact or deal, its description and a done checkbox. Ticking it marks the activity done and removes it from the list.
- **R6.7 Recent activity**: the 10 latest activities and stage changes across everything, each linking to its record.
- **R6.8** All figures come from the database each time the dashboard loads, so a deal marked won, or a new follow-up, shows the next time the dashboard is opened.

### R7. Sample data and persistence

- **R7.1** The backend creates the database and seeds it when the file doesn't exist.
- **R7.2** `npm run seed` deletes and recreates the database with the sample data.
- **R7.3** Sample data has about 15 organizations across at least 6 industries, 40 contacts across all three statuses (some with no organization), 30 deals at every stage, and 80 activities. Deals include won and lost deals spread over the past 12 months, open deals closing in the next 1 to 4 months, and 3 or 4 late deals. Activities include about 5 overdue follow-ups, about 6 due in the next two weeks and some marked done. Deals have stage history that leads to their current stage.
- **R7.4** All sample dates are relative to the day the seed runs (concern 5). Names, companies and descriptions are realistic and fixed, so the same reset gives the same records.
- **R7.5** Every change is written to SQLite before the API responds.

### R8. Running

- **R8.1** `npm install` once, then `npm run dev` starts both servers and prints the address to open. It works on Mac, Linux and Windows.
- **R8.2** The backend listens on `127.0.0.1:8000`, the frontend on `localhost:5173`, and the frontend proxies `/api` to the backend.
- **R8.3** Nothing loads from the internet at runtime.

## Design

### Layout

A fixed left sidebar, 232px wide, on the page background, with the Accountable wordmark at the top (Instrument Sans, bold, Midnight) and the five sections below: Dashboard, Pipeline, Deals, Contacts, Organizations, each with an icon. The current section shows on a white pill with Midnight text and a small Sea Green dot. "All amounts in US dollars" sits in small muted text at the foot of the sidebar.

The main area has a page header: the title (28px, semibold), a one-line count or subtitle in muted text, and the primary action on the right ("Add deal"). Below it sits the content, in white panels with 16px rounded corners and no outline, separated by 24px gaps on the `#F0F4F5` background. Panels lift with a very soft shadow (`0 1px 2px rgba(7,59,76,0.06)`), never a border. It's designed for screens 1280px wide and up, and works down to 1024px.

There are no single edge borders on panels and no line across the top of the page. Table rows are separated by spacing and a faint row tint on hover, not by rules.

### Design tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F0F4F5` | Page background |
| `--panel` | `#FFFFFF` | Panels, cards, forms |
| `--ink` | `#073B4C` | Body text, headings |
| `--ink-muted` | `#073B4C` at 62% | Secondary text |
| `--sea-green` | `#06D6A0` | Primary fills (buttons, Won), with Midnight text |
| `--sea-green-text` | `#037A5B` | Sea Green as text on white |
| `--marigold` | `#FFC145` | Fills, with Midnight text |
| `--marigold-text` | `#8A5A00` | Marigold as text on white |
| `--coral` | `#F78C6B` | Fills, with Midnight text |
| `--cerulean` | `#118AB2` | Information, links, with white text |
| `--raspberry` | `#EF476F` | Late, overdue, delete, with white text |
| `--neutral-stage` | `#073B4C` at 18% | The New stage |

Each stage color also has a tint at about 14% strength for column backgrounds and badges. The tokens sit on `:root`, so a dark theme can override them later.

Type: Instrument Sans for everything. Body text is 14px, table text 14px, labels 12px semibold. JetBrains Mono, with tabular figures, is for every number (money, counts, percentages, dates in tables). Instrument Serif is used once, for the dashboard greeting line ("Here's where sales stand today", in italic, 18px), and nowhere else.

### Components

- **Buttons**: primary is a Sea Green fill with Midnight text. Secondary is white with Midnight text on a light tint. Destructive is a Raspberry fill with white text, used only in delete confirmations. Corners are 10px, height 36px.
- **Badges**: rounded pills in a stage or status tint, with the darker text color. Contact statuses: Lead uses Cerulean, Qualified Marigold, Customer Sea Green.
- **Forms**: a side panel slides in from the right (480px), with the title, fields, and Save and Cancel at the bottom. Relations (organization, contact) use searchable selects. Errors show under the field in Raspberry. Saving closes the panel and shows a short toast ("Deal saved").
- **Confirmations**: a centred modal with the plain-English consequence from R3.1, plus Cancel and a Raspberry "Delete" button.
- **Tables**: a white panel with a search field and filters in its top row, sticky headings in 12px semibold muted capitals, 48px rows, and actions (edit, delete icons) that appear on row hover and on keyboard focus.
- **Timeline**: a vertical list with a type icon in a tinted circle (note, call, email, stage change), the description, and the time on the right in mono. Stage changes use the destination stage's color.
- **Pipeline board**: columns 280px wide in their stage tint at very low strength, scrolling sideways if the window is narrow. The header shows the stage dot, name, count, and value over expected revenue in mono. Cards are white, with 12px corners and a soft shadow that deepens while dragging. A drop indicator line shows where the card will land.

### Dashboard composition

1. The greeting line in Instrument Serif, with today's date.
2. Four headline tiles in a row. Each has a label, the figure large in JetBrains Mono, and a small note underneath, such as "12 deals" or "vs 31% last year".
3. A row with Revenue won by month (line chart, 2/3 width, Sea Green line with a soft area fill underneath, and last year as a dashed muted line) and Deals won by month (bar chart, 1/3 width, Cerulean bars).
4. A row with the Pipeline funnel (1/2 width; centred bars that narrow by stage, in stage colors, with value and count labels) and Open pipeline by stage (1/2 width; one stacked horizontal bar with a legend table under it showing each stage's value and expected revenue).
5. A row with Follow-ups (1/2 width) and Recent activity (1/2 width).

Charts use the stage and brand colors only, light gridlines on the y axis only, mono axis labels, and a tooltip on hover with exact amounts. The area fill under the line is the only gradient on the page.

### Empty and error states

- An empty table or column says what's missing and offers the add action, for example "No deals at Negotiation".
- If the backend can't be reached, a banner says "Can't reach the Accountable server. Is `npm run dev` still running?", with a Retry button.
- Form saves that fail keep the form open with the server's message.

## Technical design

### Data model (SQLite, SQLAlchemy Core)

- `organizations(id, name, website, industry, notes, created_at, updated_at)`
- `contacts(id, first_name, last_name, email, phone, job_title, organization_id -> organizations ON DELETE SET NULL, status, created_at, updated_at)`
- `deals(id, name, organization_id -> organizations ON DELETE CASCADE, contact_id -> contacts ON DELETE SET NULL, stage, value, probability, close_date, position REAL, created_at, updated_at)`
- `activities(id, type, contact_id -> contacts ON DELETE CASCADE, deal_id -> deals ON DELETE CASCADE, description, occurred_at, follow_up_date, done, created_at, updated_at)`, with a check that exactly one of `contact_id` and `deal_id` is set
- `stage_changes(id, deal_id -> deals ON DELETE CASCADE, from_stage, to_stage, changed_at)`

Foreign keys are turned on for every SQLite connection (`PRAGMA foreign_keys=ON`). Stage and status values are checked by constraints. Business rules (the probability reset, close date on closing, recording stage changes, the main contact's organization) live in one backend service module, so the board and the forms behave the same.

### API (JSON, under `/api`)

| Method and path | Purpose |
|---|---|
| `GET/POST /organizations`, `GET/PATCH/DELETE /organizations/{id}` | CRUD; GET includes counts and open value |
| `GET /organizations/{id}/delete-impact` | Counts for the confirmation |
| `GET/POST /contacts`, `GET/PATCH/DELETE /contacts/{id}` | CRUD; `?status=` filter |
| `GET /contacts/{id}/delete-impact`, `GET /contacts/{id}/timeline` | Confirmation counts; merged timeline |
| `GET/POST /deals`, `GET/PATCH/DELETE /deals/{id}` | CRUD; GET includes `expected_revenue` and `is_late` |
| `GET /deals/{id}/delete-impact`, `GET /deals/{id}/timeline` | Confirmation counts; merged timeline |
| `POST /deals/{id}/move` | `{stage, before_id, after_id}`: changes stage and position in one transaction |
| `POST /activities`, `PATCH/DELETE /activities/{id}` | Log, edit (including `done`), delete |
| `GET /dashboard` | Every dashboard figure in one response, for a given `?today=` |

The frontend sends its local date as `today` wherever late or overdue matters (concern 14). Tables are small enough (hundreds of rows) that search and sort run in the browser on the full list.

### Frontend

React Router for the five sections and the record pages (`/`, `/pipeline`, `/deals`, `/deals/:id`, `/contacts`, `/contacts/:id`, `/organizations`, `/organizations/:id`). TanStack Query fetches the data and refreshes it after saves. TanStack Table runs the tables, Recharts the charts and dnd-kit the pipeline board. Money, number and date formatting live in one module.

### Testing

As in `docs/TECH_STACK.md`. Backend tests cover every rule in R1 and R3 and the dashboard figures against known data. Frontend tests cover formatting, late and overdue logic, and position calculation. End-to-end tests walk each success criterion in the intent, using a separate database file.
