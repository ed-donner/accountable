# Spec: the Accountable MVP

`docs/intent.md` says what we're building and why. This spec turns it into requirements (Part 1) and a design (Part 2). If the two disagree, the intent wins and this file gets corrected. The chosen design is `docs/mockups/4-chosen-design.html`, described under [Chosen design](#chosen-design). It sets the layout and look, and this file matches it.

## Concerns

These are the concerns raised when this spec was written, with what the project owner decided on each.

### Decided

1. **Six stages, five brand colors: the stages keep the brand's order.** New is Sea Green, Qualified is Marigold, Proposal is Coral and Negotiation is Cerulean. Lost takes the fifth color, Raspberry, and Won is Midnight. The colors can't carry meaning alone: the chart validator puts Marigold and Coral just under its line for telling colors apart (14.5 against 15), and Sea Green, Marigold and Coral are all below 3:1 on white. So every stage color in this spec has the stage's name beside it.
2. **Small chips use slightly darker Raspberry and Cerulean.** White text on the brand colors is 3.62:1 and 3.96:1, below the usual 4.5:1 minimum for small text. Small chips use `#D23E62` and `#107FA4` instead, which reach 4.5:1 and look almost the same. This is an agreed exception to the brand, for small chips only. See [the color tokens](#color-tokens). The pipeline band, the funnel, the pipeline's column headers and the delete buttons keep the exact brand colors, so small white text on their Cerulean and Raspberry fills stays at 3.96:1 and 3.62:1.
3. **No undo on the pipeline.** It isn't needed for the MVP. Dropping a card on Won replaces the expected close date and any hand-set probability, and makes the main contact a customer. Dragging it back restores none of these, but a message after the drop says exactly what changed.
4. **No backups or export in the MVP.** Everything lives in `data/accountable.db`, so a reset, `git clean -x`, deleting the folder or losing the laptop loses it all. The two wipe commands show what will be lost and require typing `yes`, and `docs/STATUS.md` explains that copying the file is the backup.
5. **Windows and Linux stay untested for now.** The intent requires the same command on Mac, Linux and Windows. The build avoids anything platform-specific, but it will only run on a Mac, so the other two are unproven until someone tries them.
6. **Chrome only for now.** It's the one supported and tested browser. Safari and Firefox may work, but nobody will have checked.
7. **The project owner is the tester for criterion 8.** The end-to-end tests prove each of the five answers is within two clicks of the dashboard, and the project owner does the no-instructions check by hand.

### Worth knowing

8. **The fonts come from npm packages, not Google Fonts.** The brand skill says Google Fonts. The packages hold the same fonts, so they look the same and work offline.
9. **The stable drag-and-drop package has gone quiet.** `@dnd-kit/core` was last released in December 2024, though it's still by far the most used, at about 40 million downloads a week. Its successor, `@dnd-kit/react`, is active but still at 0.5.3. This spec uses the stable package, whose React range covers React 19.
10. **The Won and Lost columns only get longer.** One could reach hundreds of cards. Every deal stays on the board as the intent asks, each column scrolls by itself, and a test drags cards at the 500-deal limit.

### Calls made where the intent was silent

Say if you want any of these changed.

- Automatic stage-change entries can't be edited or deleted. They go only when their deal is deleted.
- A reopened deal keeps its close date, so it shows as late from the next day until someone sets a new date.
- A won or lost deal's close date can't be in the future, because its revenue would then be missing from the dashboard.
- A deal added straight into Won counts as a win, so its main contact becomes a customer. It gets no stage-change entry because nothing moved.
- The Won and Lost columns show their deal count and total value, but no expected revenue, because it would just repeat the value or show zero.
- Moving a deal to another stage from anywhere but the board puts it at the top of the new column. New deals go there too.
- Deal values are whole dollars, which keeps every total exact.
- The organization and contact pickers can add a missing record without leaving the form. Required links would otherwise mean cancelling a half-filled form to go and add it.
- The deal form narrows main contacts to the chosen organization, but nothing forces a match, because people change companies.
- A timeline follows the deal: changing a deal's main contact moves its entries to the new contact's timeline.
- Moving a deal to Qualified doesn't change the contact's Qualified status. They share a word and nothing else. Only Won changes a contact's status.
- The dashboard covers the last 12 months with no date filter, and the funnel covers every deal there has ever been.
- This month's figures sit beside last month's instead of showing a percentage change. Early in a month, any percentage would look like a collapse.
- The Stage column sorts in pipeline order, and the Status column sorts Lead, Qualified, Customer.
- Overdue follow-ups list oldest first.
- An activity's contact or deal can't be changed once it's logged, so the activity form needs no contact-or-deal picker.
- Sample Won and Lost columns start newest first.
- `npm test` runs the end-to-end tests on several workers, in place of the plan's one, chosen from the machine's cores and memory. This one is the project owner's own call, so the suite can be run often.
- At 500 deals, a task of up to about 250ms while dragging counts as smooth, in place of the plan's 100ms, so that cards can slide apart during a drag. This one is the project owner's own call.
- The dashboard's won figures link to Deals showing Won deals only. Deals has no stage filter of its own, so this one only shows after following those links, with a button to show every stage.
- Moving between open stages in the deal form leaves the close date alone, including one that's just been typed. A trip through Won or Lost and back restores it.
- Leaving the When box untouched keeps an activity's exact time. The box only holds minutes.

---

# Part 1: Requirements

The "Not in the MVP" list in `docs/intent.md` applies throughout.

## Terms

| Term | Meaning |
|---|---|
| Today | The date on the computer running the app |
| Open deal | Stage is New, Qualified, Proposal or Negotiation |
| Closed deal | Stage is Won or Lost |
| Late deal | An open deal whose close date is before today. A deal due today isn't late. |
| Expected revenue | Value times probability, rounded to the nearest dollar for each deal, then added up. Halves round up, on both the backend and the frontend, using whole-number arithmetic. Open deals only. |
| Month won | The calendar month of a Won deal's close date |
| Overdue follow-up | Not done, with a follow-up date before today |
| Upcoming follow-up | Not done, with a follow-up date of today or later |
| Blank link | A deal's organization or main contact, or a contact's organization, cleared by a delete. Shown as "None". |

## App shell

- **N1.** A top bar on every screen links to the five sections: Dashboard, Organizations, Contacts, Deals and Pipeline. The app opens on the Dashboard.
- **N2.** Every section and record has its own address, so refresh, back and forward all work.
- **N3.** The app is designed for light mode at 1280px wide and up. There's no phone layout.
- **N4.** Opening a record that no longer exists shows "This deal no longer exists" (or the matching word) with a link back to its section. So does an address that couldn't be a record, such as `/deals/abc`. An unknown address shows "This page no longer exists" with a link to the Dashboard, and keeps the top bar.
- **N5.** If the backend can't be reached, the app says so and says to check that Accountable is still running. It never shows a blank screen.
- **N6.** If a screen's data can't be read for any other reason, the screen says so and offers Try again. What's already showing stays, and a failed read never shows figures or an empty list as if they were real.

## Tables

- **T1.** Organizations, Contacts and Deals each have a search box, sortable column headings, an Add button, and Edit and Delete on every row. Clicking a row opens the record.
- **T2.** Search updates as you type, ignores case, and matches any text column.
- **T3.** Clicking a heading sorts ascending, then descending. Blank values sort last either way.
- **T4.** Search, sort and page stay in the address, so coming back from a record returns to the same view.
- **T5.** Tables show 50 rows a page. Search and sort cover every row, not just the current page.
- **T6.** Contacts has a status filter (All, Lead, Qualified, Customer) showing a count for each. It works together with search.
- **T7.** An empty table invites the first record. A search with no matches says so and offers to clear the search.

| Table | Columns | Default sort |
|---|---|---|
| Organizations | Name, Industry, Website, Contacts, Open deals, Open value, Last activity | Name |
| Contacts | Name, Organization, Job title, Email, Phone, Status, Last activity | Name |
| Deals | Name, Organization, Main contact, Stage, Value, Probability, Expected revenue, Close date | Close date, earliest first |

- **T8.** A late deal shows a Late chip beside its close date in the Deals table.
- **T9.** Last activity is the date of the newest entry on that record's timeline.

## Adding and editing

- **F1.** Add and Edit open the same form in a dialog. The Add buttons on an organization's page, a contact's page and a pipeline column fill in what they already know.
- **F2.** Errors appear beside the field, in plain words such as "Enter a name".

| Record | Required | Other fields | Defaults |
|---|---|---|---|
| Organization | Name | Website, Industry, Notes | |
| Contact | Name, Organization | Email, Phone, Job title, Status | Status: Lead |
| Deal | Name, Organization, Main contact, Stage, Value, Close date | Probability | Stage: New, or the column's stage. Probability: the stage's usual one. Close date: today, if added at Won or Lost. |
| Activity | Type, Description, When, and the contact or deal it relates to | Follow-up date, Done | Type: Note. When: now. |

- **F3.** Organization and contact pickers can be searched. If nothing matches, they offer to add the record in a second dialog, then select it.
- **F4.** In the deal form, choosing an organization narrows the main contact list to that organization's contacts. Choosing a contact first fills in their organization.
- **F5.** A blank link shows as "None" and can stay blank when the record is saved. A link that's set can be changed but not cleared.
- **F6.** Email must look like an email address if given. Website must be an `http` or `https` address, and `https://` is added if it's left off. Value must be a whole number of dollars, zero or more. Probability must be a whole number from 0 to 100.
- **F7.** The close date of a won or lost deal can't be in the future. An open deal's close date can be any date.
- **F8.** Changing the stage in the deal form shows the new probability, and the new close date for Won or Lost, straight away. Both can be overtyped before saving, and what's shown is what's saved.
- **F9.** Two records can share a name.
- **F10.** A save or delete happens once, however quickly its button is pressed. If it fails, the dialog stays open with what was typed, and says so.
- **F11.** A form that can't read the lists it needs closes and says so, rather than opening with an empty picker.

## Deleting

- **D1.** Delete always asks first, in a dialog that names the record, gives the real counts and says it can't be undone. An activity is named by its description. If the counts can't be read, the dialog says so and won't delete.

| Deleting | What the dialog says happens |
|---|---|
| Organization | Its contacts and deals stay and are left with no organization |
| Contact | Their deals stay and are left with no main contact. Activities logged on the contact are deleted. |
| Deal | Its activities and stage-change entries are deleted. If it was won, its revenue leaves the dashboard. |
| Activity | It's removed from every timeline and from the dashboard |

- **D2.** Won deals stay on the dashboard after their organization or contact is deleted.
- **D3.** Activities logged on a deal stay when that deal's main contact is deleted, because they belong to the deal.

## Stage changes

- **S1.** These rules apply however a stage changes: on the board, in the deal form, or anywhere else.

| Move | Probability | Close date | Main contact | Timeline |
|---|---|---|---|---|
| To an open stage | The new stage's usual one | Unchanged | Unchanged | New entry |
| To Won | 100% | Today | Status becomes Customer | New entry |
| To Lost | 0% | Today | Unchanged | New entry |
| From Won or Lost to an open stage | The new stage's usual one | Unchanged | Unchanged, stays a Customer if they were one | New entry |

- **S2.** The entry reads "Moved from Proposal to Negotiation". It appears on the deal's timeline, on its main contact's timeline, on its organization's timeline and in the dashboard's recent activity.
- **S3.** Moving a card within its own column changes nothing but its place, and adds no entry.
- **S4.** A probability set by hand stays until the stage changes.
- **S5.** A won deal with a blank main contact is still won. There's just no contact to update.
- **S6.** A contact's status can be edited by hand at any time. Nothing else changes it back.

## Activities and timelines

- **A1.** Every contact page and deal page has a Log activity button. An activity relates to one contact or one deal, never both.
- **A2.** Activities can be edited and deleted from any timeline they appear on.
- **A3.** A follow-up can be ticked done on a timeline or on the dashboard, and unticked on a timeline. Once done, it leaves the dashboard but stays on its timeline, marked done.
- **A4.** Timelines show the newest first. Each entry shows its type, when it happened, its description, any follow-up, and a link to the contact or deal it belongs to.
- **A5.** Timelines show 50 entries at first, with a Show more button that reaches the end, however long the timeline is. If it fails, what's showing stays.

| Timeline on | Shows |
|---|---|
| Deal | Its activities and stage changes |
| Contact | Their activities, plus the activities and stage changes of deals where they're the main contact |
| Organization | Everything from its contacts and its deals, each entry once |

## Record pages

- **R1.** An organization's page shows its details and notes, its contacts, its deals and the combined timeline. It has Add contact and Add deal buttons.
- **R2.** A contact's page shows their details, status and organization, the deals where they're the main contact, and their timeline. It has an Add deal button.
- **R3.** A deal's page shows its details, stage, value, probability, expected revenue, close date, organization and main contact, a Late chip if late, and its timeline.
- **R4.** Each page has Edit and Delete. After a delete, the app returns to the section's table.
- **R5.** The contacts and deals listed on these pages are short linked lists, not tables, so T1 doesn't apply to them.

## Pipeline

- **P1.** One column per stage, in order: New, Qualified, Proposal, Negotiation, Won, Lost. Each column is headed by a solid block in its stage color.
- **P2.** Dragging a card to another column changes its stage, following S1. Dragging within a column changes its place. A card can be dropped anywhere and stays there after a refresh and a restart.
- **P3.** The board shows the total value and expected revenue of open deals. Each open column shows its deal count, total value and expected revenue. Won and Lost show their count and total value, because expected revenue means nothing for a closed deal.
- **P4.** All figures change the moment a card lands, before the server replies. If the save fails, the card returns to where it was and a message says so. Every move gets its own message, even if another move has started or the board has been left.
- **P5.** A card shows the deal's name, organization, main contact, value, probability and close date. Clicking it opens the deal.
- **P6.** A late card stands out through a Late chip and a pale Raspberry tint across the whole card.
- **P7.** Each column has an Add deal button that opens the form at that stage.
- **P8.** After a drop on Won or Lost, a message says what else changed, such as "Marked as Won. Close date set to today. Sam Carter is now a customer."
- **P9.** Cards can also be moved with the keyboard.

## Dashboard

- **H1.** A one-line summary gives the overdue follow-ups and late deals, such as "6 follow-ups overdue and 5 deals running late."
- **H2.** Four headline figures appear, each linking to where the detail lives:

| Figure | Beside it |
|---|---|
| Revenue won this month | Last month's revenue won |
| Deals won this month | Last month's deals won |
| Open pipeline (total value of open deals) | Number of open deals |
| Expected revenue | As a percentage of the open pipeline |

- **H3.** A **pipeline band** shows the four open stages as blocks sized by value, each with its name, value and deal count. It links to the Pipeline.
- **H4.** A **line chart** shows revenue won per month, and a **bar chart** shows deals won per month. Both cover the last 12 months including the current one, with months of no wins shown as zero. The current month is marked as "so far".
- **H5.** A top-down **sales funnel** shows how much value has reached each stage, narrowing from New at the top to Won at the bottom, with the percentage carried forward from the stage before. A deal counts for every stage up to the furthest one it has been in, even if it skipped some, and moving back doesn't remove it. A lost deal counts up to the furthest stage it reached before it was lost, and every deal counts for New. Won is the last step, so Lost isn't on the funnel.
- **H6.** **Follow-ups** lists every follow-up not yet done, overdue first, then upcoming by date. Each shows what it's about, its date, a link to its contact or deal, and a tick box to mark it done. Overdue ones carry an Overdue chip. The panel's heading shows how many are overdue and upcoming, and the panel scrolls if the list is long.
- **H7.** **Recent activity** lists the 10 newest activities and stage changes, leaving out anything dated in the future. Each links to its contact or deal.
- **H8.** Every chart and list has a designed empty state, and nothing divides by zero.
- **H9.** Each of the five questions from the intent's Problem section can be answered within two clicks of the dashboard.

## Sample data

- **M1.** A new database is filled with sample data. "New" means the database was only just created, not that its tables are empty, so an emptied database stays empty after a restart.
- **M2.** Sample dates are worked out from the day of seeding, so a fresh copy always looks current. Running `npm run seed` later refreshes it.
- **M3.** The content is fictional, realistic and the same each time, in these rough amounts:

| Record | About | Must include |
|---|---|---|
| Organizations | 24 | At least 6 industries |
| Contacts | 75 | Every status, with the main contact of every won deal a Customer |
| Deals | 80 | 36 open across all four open stages, at least 5 of them late, and some closing in each of the next 3 months |
| | | 32 won and 12 lost across the past 12 months, with a win in every month and an upward trend |
| | | At least 2 wins dated this month, even on the 1st |
| Activities | 300 | All three types, at least 6 overdue follow-ups and at least 10 upcoming |

- **M4.** Every sample deal has a full stage history, so timelines and the funnel look right from the start.
- **M5.** Emails and websites use the reserved `.example` domain, so nothing points at a real company.

## Running and keeping data

- **C1.** `npm run dev` is the one documented command. With Node and uv installed, it fetches what's missing, starts the app and prints its address.
- **C2.** After the first run, the app starts and works with no internet connection. It loads nothing from outside the computer, including fonts.
- **C3.** Every change survives a browser refresh and a restart.
- **C4.** `npm run seed` resets to the sample data. `npm run empty` removes every record. Both show how many of each record will be lost and go ahead only if `yes` is typed.
- **C5.** After `npm run empty`, every screen still works and invites the first record.
- **C6.** Both commands are safe to run while the app is running. A refresh shows the result.

## Quality

- **Q1.** At 1,000 contacts, 500 deals and 5,000 activities: the dashboard's data arrives in under 200ms, a table opens in under a second, a search keystroke updates within 100ms, and dragging a card stays smooth.
- **Q2.** No errors in the browser's console, on any screen, at any time.
- **Q3.** All controls can be reached by keyboard, with a visible focus ring. Animations respect the system's reduced motion setting.
- **Q4.** Chrome is the supported browser.

---

# Part 2: Design

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
pyproject.toml, uv.lock           backend/accountable/ as an installable package
playwright.config.ts
shared/                           expected-revenue-cases.json and website-cases.json, read by both unit test suites
scripts/
  setup.mjs                       shared setup, used by the scripts below that start things, Node built-ins only
  dev.mjs                         npm run dev
  test.mjs                        npm test
  data.mjs                        npm run seed and npm run empty
  test-plan.mjs                   how npm test shares out the machine, and where each worker's servers are
  test-servers.mjs                starts one backend and one Vite server for each Playwright worker
  test-report.mjs                 turns what each test runner wrote into the summary that ends npm test
  setup.test.mjs, test-plan.test.mjs, test-report.test.mjs
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
frontend/src/
  main.tsx, App.tsx, styles.css
  lib/                            fetch client, money and date formatting
  components/                     Shell, DataTable, RecordPicker, ConfirmDelete, LoadFailed, Chip and others
  crm/
    queries.ts, deals.ts, Timeline.tsx
    forms/                        organization, contact, deal and activity forms
    board/                        Board, Column, DealCard
    charts/                       RevenueChart, DealsWonChart, SalesFunnel, PipelineBand
    pages/                        one file per screen
e2e/
data/                             created on first run, the *.db file is git-ignored
```

`crm/` holds everything specific to the sales CRM, on both sides, so a later business area gets a folder beside it. `crm/` can import `db.py`, but `db.py` never imports `crm/`. Only `main.py`, `cli.py` and the migrations name `crm/`. The dashboard's figures and funnel live in its router.

## Libraries

Versions were checked on 2026-10-31. All of them accept React 19.3, and Tailwind's Vite plugin and Vitest both accept Vite 8. Several are recent major versions, so check their current docs when building rather than relying on memory, especially TanStack Table 9, React Router 8, Vite 8, Vitest 5 and Zod 4.

| Job | Library |
|---|---|
| UI, build | React 19, Vite 8 |
| Pages | React Router 8 |
| Server data | TanStack Query 5 |
| Tables | TanStack Table 9 |
| Charts | Recharts 3 |
| Drag and drop | `@dnd-kit/core` 6 |
| Dialogs | Radix UI |
| Searchable pickers | `cmdk` with Radix Popover, because Radix has no combobox |
| Styling | Tailwind CSS 4, with the brand as theme tokens |
| Forms | React Hook Form 7, Zod 4, `@hookform/resolvers` to connect them |
| Dates | date-fns |
| Messages | Sonner 2 |
| Icons | The chosen design's own icons in `components/Icon.tsx`, and lucide-react for any it doesn't show |
| Fonts | `@fontsource-variable/instrument-sans`, `@fontsource/instrument-serif`, `@fontsource-variable/jetbrains-mono` (OFL-1.1, the font files ship in the packages) |
| Running both servers | concurrently |
| Backend | FastAPI, Uvicorn, SQLAlchemy Core, Alembic, Pydantic |
| Frontend tools | `typescript`, `@vitejs/plugin-react`, `@tailwindcss/vite` |
| Test tools | Vitest, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `jsdom`, `pytest`, `httpx`, `@playwright/test` |

Alembic is here because people will have real data in the database from day one, and later features will change the tables. Without migrations, the only way to pick up a new column would be a reset that wipes that data. Migrations run by themselves when the backend starts.

## Data model

Every table also has `id` and `created_at`, and all but `stage_changes` have `updated_at`.

**organizations**

| Column | Type | Notes |
|---|---|---|
| name | text | required |
| website, industry, notes | text | optional |

**contacts**

| Column | Type | Notes |
|---|---|---|
| name | text | required |
| email, phone, job_title | text | optional |
| organization_id | foreign key | set to blank when the organization is deleted |
| status | text | `lead`, `qualified` or `customer` |

**deals**

| Column | Type | Notes |
|---|---|---|
| name | text | required |
| organization_id | foreign key | set to blank when the organization is deleted |
| main_contact_id | foreign key | set to blank when the contact is deleted |
| stage | text | one of the six stages |
| value | integer | whole US dollars, 0 or more |
| probability | integer | 0 to 100 |
| close_date | date | expected if open, actual if closed |
| position | integer | place in its column, lowest at the top |

**activities**

| Column | Type | Notes |
|---|---|---|
| type | text | `note`, `call` or `email` |
| contact_id | foreign key | deleted with the contact |
| deal_id | foreign key | deleted with the deal |
| description | text | required |
| occurred_at | datetime | stored in UTC |
| follow_up_date | date | optional |
| follow_up_done | boolean | false by default |

A check constraint makes sure exactly one of `contact_id` and `deal_id` is set.

**stage_changes**

| Column | Type | Notes |
|---|---|---|
| deal_id | foreign key | deleted with the deal |
| from_stage, to_stage | text | |
| changed_at | datetime | stored in UTC |

Stage changes get their own table because they aren't activities: they have no type or description, can't be edited, and give the funnel its history.

Notes for the build:

- **Links:** required links are enforced by the API, not the database, because deletes have to be able to blank them. The database columns allow blank.
- **New database:** a first start builds the database under a temporary name and renames it once the migrations and sample data are done, so an interrupted first start can't leave an empty database behind.
- **Ids:** never used twice, so an old address can't open a different record. SQLite would otherwise give the newest record's id to the next one after a delete. Every table gets `TABLE_OPTIONS` from `db.py`.
- **Foreign keys:** SQLite turns these off by default. Turn them on for each connection with `connection.setconfig(sqlite3.SQLITE_DBCONFIG_ENABLE_FKEY, True)` in a SQLAlchemy connect event. This keeps to the "no raw SQL" rule, and it has been checked on Python 3.12.
- **Migrations:** these run with foreign keys off, all in one transaction. SQLite makes most table changes by rebuilding the table, and dropping the old table with foreign keys on would run its delete rules, blanking links and deleting activities.
- **Indexes:** on every foreign key, `deals (stage, position)`, `activities (occurred_at)`, `activities (follow_up_date)` and `stage_changes (changed_at)`.
- **Dates:** close dates and follow-up dates are plain dates. In the frontend, always read them with date-fns `parseISO`. `new Date("2026-10-31")` reads as UTC and shows the day before in US time zones.
- **Probabilities:** the six usual probabilities live in one place in the backend. The frontend reads them from `GET /api/meta`.

## Backend rules

`rules.py` holds one function that applies a stage change, used by both the deal update and the move. It runs in one transaction, so a failure leaves nothing half done:

1. Add the `stage_changes` row.
2. Set the probability to the new stage's usual one, unless this request gave one.
3. On Won or Lost, set the close date to today, unless this request gave one.
4. On Won, set the main contact's status to customer, if there is a main contact.
5. Put the deal at the top of the new column, unless this request gave a place.

The function takes today's date as an argument, so tests can fix it.

Adding a deal at Won uses step 4 and writes no `stage_changes` row. Moving a card renumbers the target column in the same transaction. With a few hundred rows at most, this is simple and quick enough, and no fractional position scheme is needed.

Reset and empty delete rows inside a transaction and leave the file and tables in place. This is why they're safe while the app is running, and why an emptied database isn't treated as new.

## API

All routes are under `/api` and use JSON. Validation errors return 422 with a message per field, and a missing record returns 404. An id that couldn't be a record, such as one too large for SQLite, is a validation error, and so is text with no valid encoding.

| Method and path | Purpose |
|---|---|
| `GET /meta` | Stages in order with usual probabilities, statuses, activity types |
| `GET /organizations` | All rows, with contact count, open deal count, open value, last activity |
| `POST /organizations` | Add |
| `GET /organizations/{id}` | One record with its contacts and deals |
| `PATCH /organizations/{id}` | Edit the fields sent |
| `DELETE /organizations/{id}` | Delete |
| `GET /organizations/{id}/delete-impact` | The counts for the delete dialog |
| `GET /organizations/{id}/timeline?limit&offset` | Timeline |
| `/contacts`, `/contacts/{id}` and so on | The same set of routes |
| `/deals`, `/deals/{id}` and so on | The same set of routes |
| `POST /deals/{id}/move` | Body: `stage`, `before_deal_id` (null for the end of the column). Returns the deal and what else changed. |
| `POST /activities` | Add, with `contact_id` or `deal_id` |
| `PATCH /activities/{id}` | Edit, including marking a follow-up done |
| `DELETE /activities/{id}` | Delete |
| `GET /dashboard` | Everything on the dashboard, in one reply |

The list routes return every row, and the table does its searching, sorting and paging in the browser. At these limits that's small and quick, and it makes typing in the search box feel instant.

A timeline merges activities and stage changes in the backend, removes duplicates and sorts them newest first. Each entry says what it is, so the frontend can show the right controls: stage-change entries have no Edit or Delete.

## Frontend

- **Data:** TanStack Query holds all server data, and it refetches when the window regains focus. After any write, invalidate everything. With one user and this little data, that's simple and hard to get wrong.
- **Today:** the page can stay open for days, so anything on screen that depends on the date uses `useToday`, which checks the clock every minute and whenever the window is used again. The dashboard reads its figures again when the day changes.
- **Instant updates:** only the pipeline move and the follow-up tick update the screen before the server replies, and both roll back on failure.
- **Board figures:** worked out in the browser from the deals list, so they change as a card lands. They use the same formula as the backend, with a unit test on each side using the same cases.
- **Dragging:** a 6px move starts a drag, so a click still opens the deal. Keyboard dragging comes from dnd-kit's keyboard sensor. Cards are memoized to stay smooth at 500 deals. Columns aren't virtualized, because that conflicts with dropping a card anywhere. Each column is a droppable, and the board has one draggable that's pointed at a card as it's picked up. While a card is dragged, the others slide apart around a pale slot showing where it will land, and the gap closes behind it. `@dnd-kit/sortable` was dropped: its per-card hooks re-render every card each time a drag crosses a card, which took 241ms at 500 deals. The longest task on this board is about 70ms to 180ms, slowest on the first drags after loading.

## Screens

### Shell

A white rounded bar across the top holds the Accountable wordmark, set in Instrument Sans, then the five sections with icons and labels, and today's date at the far right. The current section is a Sea Green pill with Midnight text. The bar floats on the page background with space around it, so there's no line across the top of the page. There's no logo yet: `assets/accountable.jpg` is the course illustration.

### Dashboard

Everything fits on one screen at 1440 by 900 with no page scrolling, so what needs doing next is always in view. The page only scrolls on windows under 760px tall. Follow-ups and Recent activity each scroll by themselves.

The revenue chart is the one bold thing on this screen: a large figure over a solid Sea Green area that runs to the panel's edges. Everything around it stays quiet.

```
+-----------------------------------------------------------------------------+
| Accountable  [Dashboard]  Organizations  Contacts  Deals  Pipeline  Oct 31, 2026 |
+-----------------------------------------------------------------------------+
Dashboard   6 follow-ups overdue and 5 deals running late.

+---------------------------------------------------+ +-----------------------+
| Revenue won in October                      $100k | | Follow-ups            |
| $84,500                                           | |   6 overdue, 10 upcoming
| September $72,000                                 | | [ ] Send revised quote|
|        solid Sea Green area under the line        | |     Overdue    Oct 12 |
+---------------------------------------------------+ |                       |
| Open pipeline  Expected revenue  [New|Qual|Pro|Neg] | +-----------------------+
+---------------------------------------------------+ | Recent activity       |
| Deals won in October 6  | Sales funnel            | | Moved from Proposal   |
| bars for 12 months      | top-down, with values   | |   to Negotiation      |
+-------------------------+-------------------------+ +-----------------------+
```

The right column is 396px wide and the left takes the rest, with 12px gaps. Under the revenue chart, the strip holds Open pipeline, Expected revenue and the pipeline band. The bottom row gives Deals won about 40% of the width and the funnel about 60%.

In this narrow column, a follow-up shows its action and a link to its contact or deal, with the organization left out. An activity shows the link and the time on its second line.

### Tables

A page title with the Add button beside it, then the search box, then the table on a white panel. Rows are separated by space and a hover tint, not lines. Row height is 44px. Edit and Delete are icon buttons at the end of each row, always visible, with labels for screen readers.

### Record pages

Two columns of white panels on the page background. The left, narrower one holds the details, plus the linked contacts and deals. The right one holds the timeline, as the main thing on the page, with Log activity at its top. Each timeline entry has a round colored icon showing its type.

### Pipeline

```
Pipeline                      Open pipeline $1,240,000   Expected revenue $369,500

+-----------+ +-----------+ +-----------+ +-----------+ +-----------+ +-----------+
| New    11 | | Qualified | | Proposal  | | Negotiat. | | Won    32 | | Lost   12 |
| $310,000  | | $420,000  | | $290,000  | | $220,000  | | $494,500  | | $186,000  |
| Expected  | | Expected  | | Expected  | | Expected  | |           | |           |
| + Add deal| | + Add deal| | + Add deal| | + Add deal| | + Add deal| | + Add deal|
+-----------+ +-----------+ +-----------+ +-----------+ +-----------+ +-----------+
+-----------+ +-----------+
| $36,000   | | $36,000 Late   (late card: pale Raspberry tint)
| Deal name | | Deal name |
| Org       | | Org       |
| Contact   | | Contact   |
| 5%   Date | | 20%  Date |
+-----------+ +-----------+
```

Each column is headed by a solid block in its stage color, using the text color from the stage table. The block holds the stage name and deal count, the total value, the expected revenue for open stages, and Add deal. It stays put while the cards below it scroll, and the page header stays put too.

Cards are white on the page background and lead with their value, so the money is the first thing read down a column. A dragged card lifts with a soft shadow, the only shadow besides dialogs. Card text is cut off with an ellipsis if it doesn't fit, with the full text in the browser's own tooltip, because a component on each of 500 cards would slow dragging.

## Visual design

The brand skill is the source for all of this.

### Color tokens

| Token | Value | Use |
|---|---|---|
| Page | `#F0F4F5` | Page background, row hover |
| Panel | `#FFFFFF` | Panels and cards |
| Ink | `#073B4C` Midnight | All body text and headings |
| Muted ink | `#4A6B76` | Secondary text (5.74:1 on white, 5.19:1 on Page) |
| Primary | `#06D6A0` Sea Green, Midnight text | Main buttons, current section |
| Sea Green text | `#047A5B` | If Sea Green is ever needed as text (5.33:1 on white, 4.81:1 on Page) |
| Marigold text | `#866522` | If Marigold is ever needed as text (5.39:1 on white, 4.86:1 on Page) |
| Information | `#118AB2` Cerulean, white text | Focus rings, stage-change entries, charts |
| Alert | `#EF476F` Raspberry, white text | Delete buttons, charts |
| Small chip, Information | `#107FA4`, white text | Negotiation chips (4.57:1) |
| Small chip, Alert | `#D23E62`, white text | Late, Overdue and Lost chips (4.56:1) |
| Late tint | `#FDECF1` | Late cards (Midnight text on it is 10.61:1) |

### Stage, chip and chart colors

| Stage | Fill | Text on it |
|---|---|---|
| New | Sea Green `#06D6A0` | Midnight |
| Qualified | Marigold `#FFC145` | Midnight |
| Proposal | Coral `#F78C6B` | Midnight |
| Negotiation | Cerulean `#118AB2` | White |
| Won | Midnight `#073B4C` | Sea Mist `#CDD8DB` |
| Lost | Raspberry `#EF476F` | White |

A stage keeps its color everywhere. Negotiation and Lost chips use the small chip shades above, and larger fills, such as the pipeline band, the funnel and the pipeline's column headers, use the colors in this table. Other sets of three follow the brand's trio:

| Set | Sea Green | Marigold | Coral |
|---|---|---|---|
| Contact status | Customer | Qualified | Lead |
| Activity type | Call | Email | Note |

Stage-change entries use Cerulean, which marks them as information.

### Type

The fonts are bundled through Fontsource, as the intent requires.

| Use | Font | Size and line height | Weight |
|---|---|---|---|
| Page title | Instrument Sans | 28/36 | 600 |
| Section heading | Instrument Sans | 16/24 | 600 |
| Body, table text | Instrument Sans | 14/20 | 400 |
| Label, chip | Instrument Sans | 13/18 | 600 |
| Dashboard summary line | Instrument Serif | 22/30 | 400 |
| Revenue won figure | JetBrains Mono | 52/60 | 500 |
| Other headline figures, column totals | JetBrains Mono | 24/30 | 500 |
| Board totals | JetBrains Mono | 20/26 | 500 |
| Card value | JetBrains Mono | 19/26 | 500 |
| Money, counts, dates in tables | JetBrains Mono | 13/20 | 400 |
| Probability and date on cards | JetBrains Mono | 12/18 | 400 |
| Chart axis | JetBrains Mono | 12/16 | 400 |

Numbers are always in JetBrains Mono, so columns of figures line up. Instrument Serif appears in one place only: the dashboard's summary line.

### Shapes

- Panels have a 16px radius, cards 10px, inputs and buttons 8px, and chips are fully round.
- Panels are white on the page background, with no outline and no shadow.
- There are no gradient fills, and no borders on one edge of a panel. There's no line across the top of the page.
- Late cards are marked by the chip and tint, never a colored edge.
- Pipeline columns are headed by a solid block in the stage color, never a colored bar or edge.
- Labels are in sentence case, not capitals. No text runs joined with middle dots, and no arrows added to link text.

### Charts

- **Line chart:** a 2px Midnight line over a solid Sea Green area that runs to the panel's left, right and bottom edges. Won is Midnight, and the fill brings in the brand's primary color without losing the line. The money axis sits inside the panel on the right, and the month labels sit on the fill. The revenue figure sits at the top left on a white backing, so grid lines don't run through it.
- **Line's current month:** the last segment is dashed, so an unfinished month doesn't look like a fall in sales.
- **Bar chart:** thin Midnight bars with 4px rounded tops. The current month is a lighter tint of the same color, labeled "so far".
- **Sales funnel:** stacked segments narrowing from top to bottom, in stage colors, with 2px gaps and softly rounded corners. The top edge of each segment is as wide as the value that reached it, and the last segment tapers a little further so the shape ends in a neat spout. Each stage name sits inside its segment in the stage's text color. Its full value sits to the right in ink, joined by a dotted leader line. The percentage carried forward sits in a pale pill level with the join between two stages, because it describes the step between them. Build it with Recharts' `FunnelChart` and a custom `shape`.
- **Pipeline band:** compact blocks, 76px tall, sized by value with 2px gaps. A small stage keeps a minimum width so its label still fits.
- **All charts:** one axis per chart, so revenue and deal count are never on the same one. Pale horizontal grid lines only. Direct labels on the current month only, which is usually the highest in the sample data. Text is in ink, never the series color. Each chart has a hover tooltip.
- **Money on axes:** shortened with the currency, such as `$40k` and `$1.2M`.

### Motion

The revenue line and its fill draw in once on load. Cards slide apart while one is dragged, and settle into place when dropped. Dialogs fade in quickly. Nothing else moves, and all of it stops under reduced motion.

### Words

Plain business English, short labels, no exclamation marks.

| Where | Text |
|---|---|
| Buttons | Add deal, Save deal, Delete deal, Log activity |
| Messages | Deal saved. Deal deleted. |
| Errors | Enter a name. Choose an organization. |
| Empty table | No deals yet. Add the first one. |
| Empty funnel | Deals will show here once you've added some. |
| Empty follow-ups | No follow-ups due. |
| Connection lost | Can't reach Accountable. Check that it's still running. |
| Failed read | Couldn't load this. |
| Failed read, with something already showing | Couldn't refresh this, so it may be out of date. |
| Delete dialog | Delete Harbor & Pine? Its 4 contacts and 3 deals will stay, with no organization. This can't be undone. |

Money always carries its currency, as in `$48,000`. Dates read `Oct 31, 2026`, and times read `Oct 31, 3:20 PM`.

## Chosen design

The project owner compared three mockups and chose:

- **Mockup 2, Work desk:** the page shell and the dashboard.
- **Mockup 3, Deal wall:** the style of the pipeline board.
- **A new top-down sales funnel** in place of Mockup 2's funnel bars, in the style common in sales CRMs.

`docs/mockups/4-chosen-design.html` brings these together, with `4-chosen-design-dashboard.png` and `4-chosen-design-pipeline.png` beside it. Build to it, and compare the finished app with it in the Test stage. Mockups 1 to 3 stay in the folder as a record of the options, and aren't a reference for the build.

The figures in the mockups come from `docs/mockups/shared.js` and are examples. The app's sample data follows M1 to M5.

## Commands and first run

| Command | What it does |
|---|---|
| `npm run dev` | Sets up if needed, starts the app, prints its address |
| `npm test` | Sets up if needed, runs the type check and all tests, fails if any fail |
| `npm run seed` | Resets to the sample data, after asking |
| `npm run empty` | Empties the database, after asking |

`npm run dev` can't depend on any npm package, because on the first run none are installed. So `scripts/dev.mjs` uses only what comes with Node:

1. Check that Node is version 24 or later and that uv is installed. If not, say which is missing and how to get it, then stop.
2. Run `npm install` if `node_modules` is missing, or if `package-lock.json` is more than 2 seconds newer than `node_modules/.package-lock.json`. Compare that file and not the folder, because the folder's date doesn't reliably change and a needless install would break offline starts. npm writes the two files less than a millisecond apart, hence the margin. If an install fails with `node_modules` already there, warn and carry on.
3. Run `uv sync --frozen` on every start, with no date check. With nothing to do it takes about a millisecond and reaches no network. uv fetches Python 3.12 if needed.
4. Start the backend and frontend with concurrently, using `uv run --no-sync`, so nothing reaches for the network after the first run.
5. When both answer, print `Accountable is running at http://localhost:5173` and to keep the window open while using it.
6. Ctrl+C stops both servers on every platform.

If a port is taken, stop and say "Port 5173 is in use. Is Accountable already running?". Scripts run through Node, with no shell-specific syntax, so they behave the same on all three platforms.

`npm run seed` and `npm run empty` run the same setup first, so they work before the first `npm run dev`. They accept `--yes` for tests. Without it, they ask, and if there's no one at the keyboard to answer, they stop without wiping anything.

`data/accountable.db` is the default database path, and the `ACCOUNTABLE_DB` setting overrides it for tests.

`docs/STATUS.md` is where the run instructions live, because `README.md` is the course's own guide. Written for someone non-technical, it covers installing Node and uv, running `npm run dev`, keeping the window open, stopping with Ctrl+C, the seed and empty commands, and copying `data/accountable.db` as a backup.

## Security

There's no sign-in, so the app relies on being reachable only from this computer:

- The backend and Vite listen on the local machine only.
- No cross-origin access is allowed, and the backend's trusted host check accepts only `localhost` and `127.0.0.1`. This stops other websites in the same browser from reading or changing customer data.
- The same goes for Vite, because it's the address the browser uses and it sits in front of the backend. Its CORS support is off, since by default it trusts pages on other local ports, and it serves only `frontend/` and the packages, since by default it serves the whole repo, database included.
- The API accepts only JSON request bodies.
- Website links must be `http` or `https`, so a saved value can't run a script when clicked.
- The database file stays out of git, which `.gitignore` already handles.

## Testing

`npm test` runs a TypeScript type check, because Vite doesn't check types, then all three layers, and uses a database of its own.

**Backend (pytest)**, on a fresh temporary database each test:

- Every row of the stage rules, with today's date fixed, including hand-set probabilities and blank main contacts
- Delete outcomes and the counts in `delete-impact`
- Required fields, and the rules on blank links
- Dashboard figures against a small dataset with known answers, including month boundaries, an edited close date and a reopened deal
- The funnel, including skipped stages, a deal moved backwards, a lost deal and a deal added at Won
- All three timelines, with no duplicates
- Sample data meets every line of M3, including when seeded on the 1st of a month
- An emptied database stays empty after a restart
- Migrations build the same tables as `tables.py`

**Frontend (Vitest):** money and date formatting, including dates near midnight, expected revenue and board totals using the same cases as the backend, the deal form's stage behavior, and the table's search and sort.

**End to end (Playwright Test)**, with the installed Chrome:

- Each Playwright worker has its own servers, on ports from 5200 and 8800, and its own temporary database, with `reuseExistingServer` off. If they reused a server, they could attach to a running copy of the app and change real data.
- Every test fails on any console error, and on any request to an address outside the computer. The second check proves the offline requirement.
- Drags use `page.mouse` with several small moves, because dnd-kit needs to see the pointer travel.
- A stress run fills a test database to the limits in Q1 and checks the timings. It runs last and alone, because timings need a quiet machine.
- Tests reach the app at 127.0.0.1, so a slow lookup of the name `localhost` can't stall them, and Chrome runs with `--disable-gpu`, because browsers compiling shaders side by side can hang on macOS.

| Criterion | Requirements | End-to-end file |
|---|---|---|
| 1. Start and land on the dashboard | C1, C2, N1 to N5, M1 to M5 | `e2e/start.spec.ts` |
| 2. Tables, delete, reset, empty | T1 to T9, F1 to F9, D1 to D3, C3 to C6 | `e2e/records.spec.ts`, `e2e/data.spec.ts` |
| 3. Filter and record pages | T6, R1 to R5 | `e2e/records.spec.ts` |
| 4. Pipeline | P1 to P9, S1 to S6 | `e2e/pipeline.spec.ts` |
| 5. Activities and timelines | A1 to A5, S2, H6 | `e2e/activities.spec.ts` |
| 6. Dashboard figures | H1 to H8, S1 | `e2e/dashboard.spec.ts` |
| 7. Look and brand | Visual design | Checked by eye against the chosen mockup |
| 8. Five answers, two clicks | H9 | `e2e/problem.spec.ts`, then see concern 7 |
| 9. Real use | Everything | By hand, below |
| Layout, console, keyboard, Chrome | N3, Q2, Q3, Q4 | `e2e/quality.spec.ts` |
| Speed at the limits | Q1 | `e2e/stress.spec.ts` |
| Keeping data on this computer | Security | `e2e/security.spec.ts`, `backend/tests/test_every_route.py`, `backend/tests/test_security.py` |
| When things go wrong | N4, N6, F10, F11, D1, P4 | `e2e/failures.spec.ts`, `frontend/src/crm/forms/forms.test.tsx`, `frontend/src/crm/queries.test.tsx` |
| Layout rules | Layout rules | `backend/tests/test_layout.py`, `frontend/src/layout.test.ts` |

**By hand (criterion 9):** the agent uses every section and action in a real browser at 1440 by 900 and 1280 by 720, the way a salesperson would. That includes an emptied database, a restart, and starting the app with the network off. It looks at each screen, compares it with the chosen mockup and fixes what it finds. Then you use it yourself and have the final say. Passing tests is necessary, but it isn't enough.
