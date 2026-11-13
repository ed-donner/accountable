# Spec: the Accountable MVP

## Concerns

The intent does not settle these points. The rest of this spec assumes the choice in each line. Say if you want a different one.

1. Usual close probability is New 10%, Qualified 30%, Proposal 50%, Negotiation 70%, Won 100%, and Lost 0%.
2. The line chart shows revenue won for the last 6 months. The bar chart shows expected revenue by open stage. The funnel shows the value sitting in each open stage now. The app does not store a history of every stage a seeded deal passed through, so the funnel is not a historical conversion chart.
3. The dashboard lists every overdue follow-up, and follow-ups due in the next 7 days. A later follow-up stays on the contact or deal only.
4. Delete an organization and the app also deletes its contacts, its deals, and the activities on those records. Delete a contact and the deals stay, with no main contact. Delete a deal and the app deletes its activities and its stage entries.
5. A contact timeline shows activities logged on that contact. It also shows activities and stage changes for deals where that contact is the main contact.
6. The app ships the brand fonts with itself. It does not load them from Google. The app must work with no internet connection.
7. `npm run seed` replaces every record with the sample data. It does not ask first.
8. A move to Won or Lost sets the close date to today when the date is empty.
9. The brand names five colors and the board has six stages. New, Qualified, Proposal, and Negotiation use Sea Green, Marigold, Coral, and Cerulean. Won uses a darker Sea Green. Lost uses Raspberry.

## What this version is

Accountable is a sales CRM for the owner of one small business. The owner sells to other companies. This version runs on that one computer.

The owner can see companies, people, deals, the pipeline, and what to do next. The app keeps every change. A restart shows the same records.

## Users and access

One person uses the app. That person is the owner. The owner is non-technical. A sales team, sign-in, and a password come later.

The app listens only on this computer. Another device cannot open it. There is no password. Anyone at the keyboard can see and change every record.

The records are sample data plus practice records the owner adds. Real customer data is not required.

## Records

### Organization

A company the owner does business with.

| Field | Required | Rule |
|---|---|---|
| Name | Yes | The label in tables and on the pipeline |
| Website | No | Shown as a link when it is present |
| Industry | No | Free text |
| Notes | No | Free text |

An organization has many contacts and many deals.

### Contact

A person the owner deals with. A lead is a contact with status Lead. There is no separate lead list.

| Field | Required | Rule |
|---|---|---|
| Name | Yes | |
| Email | No | |
| Phone | No | |
| Job title | No | |
| Organization | No | One organization, or none |
| Status | Yes | Lead, Qualified, or Customer. A new contact starts as Lead |

### Deal

A potential sale.

| Field | Required | Rule |
|---|---|---|
| Name | Yes | |
| Organization | Yes | The company the deal is with |
| Main contact | No | Must belong to that organization when set |
| Stage | Yes | New, Qualified, Proposal, Negotiation, Won, or Lost |
| Value | Yes | US dollars, zero or more |
| Probability | Yes | A whole number from 0 to 100 |
| Close date | No | The expected date while the deal is open. The actual date when the deal is Won or Lost |
| Position | Yes | The card's place in its column. The owner does not type this |

A new deal starts at New, unless the owner adds it from a pipeline column. Then it starts at that column's stage.

| Stage | Usual probability |
|---|---|
| New | 10% |
| Qualified | 30% |
| Proposal | 50% |
| Negotiation | 70% |
| Won | 100% |
| Lost | 0% |

When a deal changes stage, it takes the new stage's usual probability. A probability the owner typed stays until the next stage change. A stage change replaces that typed probability.

Expected revenue for one deal is its value times its probability, divided by 100.

A deal is open when its stage is not Won and not Lost. A deal is late when it is open and its close date is before today. Won and Lost deals are not late.

The owner can move a deal to another organization. If the main contact is not at that organization, the app clears the main contact.

### Activity

Something that happened, or a follow-up, on one contact or one deal. It relates to one of those records, not both, and not an organization.

| Field | Required | Rule |
|---|---|---|
| Type | Yes | Note, Call, or Email |
| Description | Yes | |
| When it happened | Yes | Defaults to now |
| Follow-up date | No | |
| Done | Yes | Defaults to not done |

The owner marks a follow-up done. The activity stays in the timeline. It leaves the dashboard task list.

### Stage entry

When a deal moves to another stage, the app adds an entry on its own. The text is "Moved from Proposal to Negotiation", with the real stage names. The owner did not type it. It appears in that deal's timeline and in recent activity on the dashboard. The owner can delete it. The owner cannot edit its text.

## What the owner can do

### Tables

Organizations, contacts, and deals each have a table. Each table has:

- A search box. Search runs as the owner types. It is not case sensitive. It matches part of a word.
- Column headings the owner can sort. A second click reverses the sort.
- A way to add a record.
- Edit and delete on each row.

Search matches these fields:

| Table | Fields |
|---|---|
| Organizations | Name, industry, website |
| Contacts | Name, email, phone, job title, organization name |
| Deals | Name, organization name, main contact name |

The default sort is name A to Z for organizations and contacts. For deals it is close date, soonest first. Deals with no close date sort last.

The contacts table has a status filter: All, Lead, Qualified, or Customer. The filter works together with search and sort.

### Delete

Delete asks first. The dialog says what will happen to linked records. The owner confirms or cancels.

| The owner deletes | What the app deletes with it | What stays |
|---|---|---|
| An organization | Its contacts, its deals, and activities on those contacts and deals, and those deals' stage entries | Nothing linked to it |
| A contact | Activities logged on that contact | Deals stay. A deal that had this main contact now has none |
| A deal | Its activities and its stage entries | The organization and the contact |
| An activity | That activity only | The contact or deal |
| A stage entry | That entry only | The deal's current stage |

### Record pages

| Page | What it shows |
|---|---|
| Organization | Its fields, its contacts, and its deals |
| Contact | Its fields, its organization, the deals where it is the main contact, and its timeline |
| Deal | Its fields, its organization, its main contact, a late mark when it is late, and its timeline |

From an organization page the owner can add a contact or a deal already tied to that organization.

### Pipeline board

The board has one column per stage, in this order: New, Qualified, Proposal, Negotiation, Won, Lost.

Each deal is a card. A card shows the deal name, the organization, the value, and the close date. A late deal shows a Late mark on the card and in the deals table.

The owner drags a card to another column to change its stage. The owner drags a card within a column to change its place. A card can be dropped on any place in a column, including higher or lower in its own column. It stays there after a refresh and after a restart.

The board header shows the total value and the expected revenue of open deals. Each column shows its own total value and its own expected revenue. Won and Lost are not in the board header totals. The figures change as soon as a card is dropped. If the save fails, the card returns to its old place and the app says it could not save the move.

The owner can add a deal into a column. The new deal takes that stage and that stage's usual probability. The new card appears at the top of the column.

A stage change writes a stage entry. The deals table shows the new stage and the new probability.

### Activities

From a contact or a deal, the owner logs a note, a call, or an email, and can set a follow-up date. The owner can edit or delete an activity.

Timelines show the newest entry first. A timeline mixes activities and stage entries.

## Dashboard

The dashboard is the landing page. Its figures match the records. They change when a deal is marked won and when the owner adds a follow-up.

### Figures

| Figure | Meaning |
|---|---|
| Open pipeline | Sum of the value of open deals |
| Expected revenue | Sum of expected revenue of open deals |
| Revenue won this month | Sum of the value of Won deals whose close date is in this month |
| Deals won this month | Count of those same deals |
| Overdue follow-ups | Count of follow-ups whose date is before today and that are not done |

A Won deal with no close date is in none of the month totals.

### Charts

| Visual | What it shows |
|---|---|
| Line chart | Revenue won in each of the last 6 months, including this month. A month with no wins is $0. The point's detail shows how many deals were won |
| Bar chart | Expected revenue of open deals in New, Qualified, Proposal, and Negotiation |
| Funnel | Value of open deals sitting in each of those four stages now |

The three visuals do not repeat one series. Won and Lost are not in the bar chart or the funnel.

Colors follow the stage colors. Chart fills are flat. There is no gradient.

### Lists

Recent activity is the 10 newest activities and stage entries. Each row names the contact or the deal.

Follow-ups are tasks until the owner marks them done.

| Group | Rule | Order |
|---|---|---|
| Overdue | Follow-up date is before today, and it is not done | Oldest date first |
| Upcoming | Follow-up date is today or within the next 7 days, and it is not done | Soonest date first |

Each task shows the description, the contact or deal, the date, and Mark done. Overdue tasks show an Overdue mark.

## Chosen layout

The owner chose the figures mockup. The file is docs/mockups/figures.html. The screenshot is docs/mockups/figures.png. The board mockup and the rail mockup are not the design.

The dashboard has a top bar, then five figures in one row. The line chart is full width under them. The bar chart and the funnel sit side by side. Recent activity and follow-ups sit side by side under the charts.

The pipeline has the same top bar. A panel shows the open pipeline and the expected revenue. Each column has a stage chip, the deal count, the value, the expected revenue, the cards, and Add deal.

## Look

The brand guidelines win over any general design guidance. This version is light mode only. It is for a laptop or desktop screen. There is no phone layout. A narrow window scrolls. It does not rearrange into a phone page.

| Use | Value |
|---|---|
| Page background | `#F0F4F5` |
| Panels and cards | White, rounded, no outline |
| Headings and body | Instrument Sans |
| Money, dates, and counts | JetBrains Mono |
| Accent | Instrument Serif is for a tagline or a quote. This version has neither, so it does not use that font |
| Ink | Midnight `#073B4C` |
| Primary action | Sea Green `#06D6A0` with Midnight text |
| Destructive confirm | Raspberry `#EF476F` with white text |

Sea Green and Marigold are too bright for small text. Small text is Midnight. Those colors are for fills, marks, and chart series.

Do not put a border on one edge of a panel. Do not put a single line across the top of the page. Do not fill panels with gradients.

The top bar is a white rounded panel. It shows the name Accountable and the five sections. The current section is a Sea Green pill with Midnight text.

| Mark | Color | Text |
|---|---|---|
| Lead | Cerulean `#118AB2` | White |
| Qualified | Marigold `#FFC145` | Midnight |
| Customer | Sea Green `#06D6A0` | Midnight |
| Late | Raspberry `#EF476F` | White |
| Overdue | Raspberry `#EF476F` | White |

Money always shows as US dollars, for example $1,250.00.

Labels are short. The tone is plain business English. There are no exclamation marks.

## Screens

| Screen | Route | Main content |
|---|---|---|
| Dashboard | `/` | The figures, the three visuals, recent activity, and follow-ups |
| Organizations | `/organizations` | The organizations table |
| Organization | `/organizations/:id` | The company, its contacts, and its deals |
| Contacts | `/contacts` | The contacts table and the status filter |
| Contact | `/contacts/:id` | The person, linked records, the timeline, and the log form |
| Deals | `/deals` | The deals table, with Late on late rows |
| Deal | `/deals/:id` | The deal, linked records, the timeline, and the log form |
| Pipeline | `/pipeline` | The six columns |

Add and edit open as dialogs. Delete opens a confirm dialog. The log form sits on the contact page and the deal page.

An empty table says there are no records yet and shows the add action. A search with no matches says there are no matches.

A field error is shown by that field. The dialog stays open.

## API

The frontend reads and writes only through this JSON API. The browser calls `/api` on the same origin.

| Action | Method and path |
|---|---|
| Dashboard payload | `GET /api/dashboard` |
| List organizations | `GET /api/organizations?q=&sort=&dir=` |
| Create organization | `POST /api/organizations` |
| Read one | `GET /api/organizations/:id` |
| Update | `PATCH /api/organizations/:id` |
| Delete | `DELETE /api/organizations/:id` |
| List contacts | `GET /api/contacts?q=&sort=&dir=&status=` |
| Create, read, update, delete contact | Same pattern under `/api/contacts` |
| List deals | `GET /api/deals?q=&sort=&dir=` |
| Create, read, update, delete deal | Same pattern under `/api/deals` |
| Move a card | `PATCH /api/deals/:id` with stage and position |
| Create activity | `POST /api/activities` |
| Update activity | `PATCH /api/activities/:id` |
| Delete activity | `DELETE /api/activities/:id` |
| Delete a stage entry | `DELETE /api/stage-entries/:id` |

`status` on the contact list is `lead`, `qualified`, `customer`, or empty for all.

A move that changes stage also sets the usual probability, clears the hand-set flag, reindexes both columns, and writes the stage entry. A move inside one column only reindexes that column.

A missing record returns 404. A bad field returns 422 and names the field. Delete of a record that exists returns 204.

## Data

The database is one SQLite file, `data/accountable.db`. SQLAlchemy Core talks to it. The backend does not send raw SQL strings from the handlers.

On startup, a missing database is created and filled with the sample data. A database that already exists is left as it is.

`npm run seed` deletes that file's records and loads the sample data again. Tests use a different database file. Tests do not change the owner's data.

Card order is the `position` value inside the stage. After a drop, the app writes positions `0, 1, 2...` from the top of each column that changed. The top card is position 0.

### Sample data

The first start looks alive on every screen.

| Records | What the set contains |
|---|---|
| 8 organizations | A different industry on each |
| 18 contacts | 6 Lead, 6 Qualified, and 6 Customer |
| 20 deals | At least 2 deals in every stage. At least 2 late deals. Won deals spread across the last 6 months, including a month with no win. Lost deals. Deals with a close date in a later month |
| 12 activities | Notes, calls, and emails. At least 2 overdue follow-ups. At least 2 follow-ups due within 7 days. Some activities with no follow-up |

Names are fictional. The set is the same on every fresh database, so the screens and the tests can rely on it.

## How it runs

`npm run dev` starts the backend and the frontend. The command is the one documented way to start. It works on Mac, Linux, and Windows.

The backend listens on `127.0.0.1` port 8000. The frontend listens on `127.0.0.1` port 5173. The frontend proxies `/api` to the backend. Neither process listens on the network.

The app needs no internet connection to use. Fonts are files in the frontend, not a request to Google.

`docs/STATUS.md` will say how to run the app once the app exists. `README.md` stays as the course guide.

## Libraries

Use a mature library for each of these. Do not hand-roll them.

| Job | Library |
|---|---|
| Tables | TanStack Table |
| Line chart, bar chart, and funnel | Recharts |
| Drag and drop on the board | dnd-kit |

The stack is the one in `docs/TECH_STACK.md`. The frontend is React, Vite, and TypeScript in `frontend/`. The backend is FastAPI on Python 3.12, run with uv. `pyproject.toml` and `uv.lock` sit at the repo root.

## Tests to lock

`npm test` runs Vitest, pytest, and Playwright. Playwright uses the installed Google Chrome. Playwright starts the app itself. Any failed test fails `npm test`.

| Layer | What it must prove |
|---|---|
| Backend | Stage change sets the usual probability. A hand-set probability survives until the stage changes. Expected revenue, late deals, dashboard totals, delete effects, and card position after a drop |
| Frontend | Money format, the Late mark, and the split between overdue and upcoming follow-ups |
| Browser | The dashboard opens with sample data. The owner can add, search, and sort. The contact filter works. A drag to another column stays after refresh. A new follow-up shows on the dashboard. Delete asks first |

Passing tests is required. It is not the whole bar. The owner uses every section in a real browser, with no console errors, and judges the look against the brand.

## Not in this version

Sign-in, user accounts, several users, and a password. A record of who did what. Use from another device. Dark mode. A phone layout. AI features. Email, calendar, or phone integrations. A currency other than US dollars. Reports beyond the dashboard. Tags or custom fields. Editing the stage list. Import or export.

## Requirement IDs

Each ID is one requirement from this spec. The plan cites these IDs. An ID is done only when that phase has delivered the whole line.

| ID | Requirement |
|---|---|
| S01 | One owner, who sells to other companies, uses the app on this computer |
| S02 | There is no password. Anyone at the keyboard can see and change every record |
| S03 | The app binds to 127.0.0.1 only. Another device cannot open it |
| S04 | The records are the sample set plus practice records. Real customer data is not required |
| S05 | A change is still there after a refresh and after a restart |
| S06 | An organization has a required name, and optional website, industry, and notes |
| S07 | A website is shown as a link when it is present |
| S08 | An organization has many contacts and many deals |
| S09 | A contact has name, email, phone, job title, an optional organization, and a status. A new contact is Lead |
| S10 | A lead is a contact with status Lead. There is no separate lead list |
| S11 | A deal has name, organization, optional main contact, stage, USD value of zero or more, probability 0 to 100, optional close date, and a position the owner does not type. The main contact must belong to the organization |
| S12 | A new deal starts at New, unless the owner adds it from a pipeline column |
| S13 | Usual probability is New 10%, Qualified 30%, Proposal 50%, Negotiation 70%, Won 100%, Lost 0% |
| S14 | A stage change sets the usual probability and clears a hand-set value. A hand-set probability stays until the stage changes |
| S15 | Expected revenue is value times probability, divided by 100 |
| S16 | Open means not Won and not Lost. Late means open with a close date before today. Won and Lost are not late |
| S17 | Moving a deal to another organization clears a main contact who is not at that organization |
| S18 | An activity has one parent, a contact or a deal. It has type, description, when it happened (default now), an optional follow-up date, and done (default not done) |
| S19 | Mark done keeps the activity on the timeline and removes it from the dashboard tasks |
| S20 | A stage change writes "Moved from {old} to {new}". It shows on the deal timeline and in recent activity. The owner can delete it and cannot edit its text |
| S21 | A move to Won or Lost with an empty close date sets the date to today |
| S22 | A Won deal with no close date is in none of the month totals |
| S23 | Search runs as the owner types. It is not case sensitive. It matches part of a word |
| S24 | Organization search uses name, industry, and website. Contact search uses name, email, phone, job title, and organization name. Deal search uses name, organization name, and main contact name |
| S25 | A heading click sorts. A second click reverses the sort |
| S26 | Organizations and contacts default to name A to Z. Deals default to close date, soonest first. Deals with no close date sort last |
| S27 | The contact status filter is All, Lead, Qualified, or Customer. It works together with search and sort |
| S28 | Each table can add, edit, and delete. Add and edit open as dialogs. Delete opens a confirm dialog |
| S29 | Delete asks first, names the linked records, and the owner can cancel |
| S30 | Delete an organization and its contacts, deals, activities, and stage entries go with it |
| S31 | Delete a contact and the activities on that contact go. Deals stay, with no main contact |
| S32 | Delete a deal and its activities and stage entries go. The organization and the contact stay |
| S33 | Delete an activity and only that activity goes |
| S34 | Delete a stage entry and only that entry goes. The deal's current stage stays |
| S35 | The organization page shows its fields, contacts, and deals. The owner can add a contact or a deal there, already tied to that organization |
| S36 | The contact page shows its fields, organization, deals where it is the main contact, and its timeline |
| S37 | The deal page shows its fields, organization, main contact, a late mark when it is late, and its timeline |
| S38 | An empty table says there are no records yet and offers add. A search with no matches says there are no matches |
| S39 | A field error shows beside that field. The dialog stays open |
| S40 | The board has six columns, in order: New, Qualified, Proposal, Negotiation, Won, Lost |
| S41 | A card shows the deal name, organization, value, and close date. Late shows on the card and on the deals table |
| S42 | A drag to another column changes the stage. A drag within a column, higher or lower, changes the place. The place remains after refresh and restart |
| S43 | The header shows open value and expected revenue. Each column shows its own. Won and Lost are outside the header. The figures change as soon as the drop is saved |
| S44 | If the save fails, the card returns and the app says it could not save the move |
| S45 | Add deal in a column uses that stage and its usual probability. The new card is at the top |
| S46 | After a stage change, the deals table shows the new stage and the new probability |
| S47 | A drop writes positions 0, 1, 2 from the top of each changed column. A move inside one column only reindexes that column |
| S48 | From a contact or a deal, the owner logs a note, a call, or an email, and can set a follow-up date. The owner can edit or delete it |
| S49 | A timeline is newest first and mixes activities and stage entries |
| S50 | A contact timeline also shows activities and stage entries for deals where that person is the main contact |
| S51 | The dashboard is the landing page. Its figures match the records. They change when a deal is marked won and when a follow-up is added |
| S52 | The five figures are open pipeline, expected revenue, revenue won this month, deals won this month, and the overdue follow-up count |
| S53 | The line chart is revenue won for the last 6 months, including this month. A month with no wins is $0. The point shows how many deals were won |
| S54 | The bar chart is expected revenue for New, Qualified, Proposal, and Negotiation |
| S55 | The funnel is the value sitting in each of those four stages now. It is not a history. Width follows the value |
| S56 | The three visuals do not repeat one series. Won and Lost are not in the bar or the funnel. Fills are flat. Colors are the stage colors |
| S57 | Recent activity is the 10 newest activities and stage entries. Each row names the contact or the deal |
| S58 | Overdue follow-ups are every undone one before today, oldest first. Upcoming ones are today through 7 days, soonest first. A later one stays on the record only |
| S59 | Each task shows the description, the contact or deal, the date, and Mark done. Overdue tasks show an Overdue mark |
| S60 | The dashboard layout is the figures mockup. The other two mockups are not the design |
| S61 | Light mode only, for a laptop or desktop. A narrow window scrolls. It does not become a phone page |
| S62 | Page background `#F0F4F5`, white rounded panels with no outline, Instrument Sans, JetBrains Mono for money, dates, and counts. No Instrument Serif |
| S63 | Ink is Midnight. A primary action is Sea Green with Midnight text. A destructive confirm is Raspberry with white text |
| S64 | Sea Green and Marigold are not used for small text. No border on one edge. No line across the top. No gradient fills |
| S65 | The top bar is a white rounded panel with Accountable and the five sections. The current section is a Sea Green pill with Midnight text |
| S66 | Lead is Cerulean with white text. Qualified is Marigold with Midnight text. Customer is Sea Green with Midnight text. Late and Overdue are Raspberry with white text |
| S67 | Money always shows as US dollars, for example $1,250.00 |
| S68 | Labels are short. The tone is plain business English. There are no exclamation marks |
| S69 | The routes are `/`, `/organizations`, `/organizations/:id`, `/contacts`, `/contacts/:id`, `/deals`, `/deals/:id`, and `/pipeline` |
| S70 | The browser calls `/api` on the same origin and does not call another store |
| S71 | The API is the endpoint list in this spec, including `q`, `sort`, `dir`, and contact `status` of lead, qualified, customer, or empty |
| S72 | A move that changes stage sets the usual probability, clears the hand-set flag, reindexes both columns, and writes the stage entry |
| S73 | A missing record is 404. A bad field is 422 and names the field. A successful delete is 204 |
| S74 | The database is `data/accountable.db`. SQLAlchemy Core talks to it. Handlers send no raw SQL strings |
| S75 | A missing database is created and seeded. An existing database is left as it is |
| S76 | `npm run seed` replaces the rows with the sample set. It does not ask |
| S77 | Tests use their own database file. They do not change the owner's data |
| S78 | The sample set is 8 organizations in different industries, 18 contacts with 6 of each status, 20 deals with at least 2 in every stage, at least 2 late, won deals across the last 6 months including a month with no win, lost deals, future close dates, and 12 activities that include notes, calls, emails, at least 2 overdue follow-ups, at least 2 due within 7 days, and some with no follow-up. Names are fictional. The set is the same every fresh start |
| S79 | `npm run dev` starts both processes on Mac, Linux, and Windows. The API is `127.0.0.1` port 8000. The site is `127.0.0.1` port 5173 and proxies `/api`. Neither listens on the network |
| S80 | The app needs no internet to use. Font files ship in the frontend. It does not request Google |
| S81 | `docs/STATUS.md` says how to run the app. `README.md` stays unchanged |
| S82 | Tables use TanStack Table. Charts use Recharts. The board uses dnd-kit. Those jobs are not hand-rolled |
| S83 | The stack is `docs/TECH_STACK.md`. React, Vite, and TypeScript in `frontend/`. FastAPI on Python 3.12 with uv. `pyproject.toml` and `uv.lock` sit at the repo root |
| S84 | `npm test` runs Vitest, pytest, and Playwright with the installed Google Chrome. Playwright starts the app. Any failure fails the command |
| S85 | Sign-in, accounts, a password, several users, an audit trail, other devices, dark mode, a phone layout, AI, mail, calendar, phone integration, other currencies, extra reports, tags, custom fields, stage editing, import, and export are not built |
| S86 | The pipeline layout is the figures mockup: a totals panel, a stage chip on each column, and Add deal |
