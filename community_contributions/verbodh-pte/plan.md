# Plan: the Accountable MVP

Build from docs/spec.md and the figures mockup in docs/mockups/figures.html. Requirement IDs live in the spec register. Each ID is delivered in one phase below. No application code is part of this step.

## Files that change

The Python package is `accountable`. CRM code is `accountable.crm`. Opening the database is `accountable.db`. A later business area is a sibling of `crm`. It has its own tables, rules, and routes. `main.py` mounts it.

There is no folder per record. There is no service layer. There is no migration package. The MVP creates a missing database. It does not upgrade an old file. Split `routes.py` only when a second business area arrives. Split by area.

| Path | Change |
|---|---|
| package.json | Root scripts `dev`, `test`, and `seed`. `frontend/` is the npm workspace |
| pyproject.toml, uv.lock | FastAPI, SQLAlchemy, pytest, and the uvicorn runner. Python 3.12. uv owns these files. The import root is `backend`, so tests import `accountable` |
| .gitignore | Ignore `data/*.db` so the owner's database stays out of git |
| backend/accountable/main.py | FastAPI app. Mounts the CRM routes. Listens on `127.0.0.1` port 8000 |
| backend/accountable/db.py | SQLite file `data/accountable.db`. Create it and seed it when the file is missing. Leave an existing file as it is. Tests pass another path. This is the only module that opens the file |
| backend/accountable/crm/tables.py | Organizations, contacts, deals, activities, and stage entries. SQLAlchemy Core only. One module for every CRM table |
| backend/accountable/crm/schemas.py | The JSON shapes for those records. One module |
| backend/accountable/crm/rules.py | Stage probabilities, expected revenue, late deals, delete effects, and follow-up groups |
| backend/accountable/crm/seed.py | The fixed sample set. `npm run seed` loads it again |
| backend/accountable/crm/routes.py | Every CRM route in one module. Organizations, contacts, deals, activities, stage entries, and the dashboard |
| backend/tests/ | Pytest. One file for seed, records, pipeline, activities, and the dashboard |
| frontend/ | Vite, React, and TypeScript. Host `127.0.0.1` port 5173. Proxy `/api` to port 8000 |
| frontend/src/fonts/ | Instrument Sans and JetBrains Mono as files. The app does not request Google at run time |
| frontend/src/styles.css | Brand colors, the top bar, white panels, and the figures layout |
| frontend/src/lib/api.ts | The only place the browser calls the API |
| frontend/src/lib/money.ts | Dollar text |
| frontend/src/shell/ | Top bar and the page frame. No deal, contact, or chart code |
| frontend/src/crm/pages/ | Dashboard, Organizations, Organization, Contacts, Contact, Deals, Deal, Pipeline |
| frontend/src/crm/ | Table, dialogs, board, and charts. CRM only |
| frontend/src/**/*.test.ts | Vitest for money, the Late mark, and the follow-up split. A test file sits beside the module it locks |
| e2e/app.spec.ts | Playwright with installed Google Chrome. The tests start the app |
| docs/STATUS.md | How to run the app, written when phase 1 can start. S81 |

The files are how a phase delivers its IDs. The ID list itself is on the phase. The same cut applies on the frontend. `shell` is the frame. `crm` is the sales screens. `lib` is HTTP and money.

## Order of work

Each phase ends with its tests green. A later phase does not start on a red phase.

### Phase 1. The app starts

Add the root scripts, the backend, the database, and the frontend shell.

- `npm run dev` starts the API on `127.0.0.1` port 8000 and the site on `127.0.0.1` port 5173. The same scripts work on Mac, Linux, and Windows.
- A missing database is created and filled. A second start does not wipe it.
- `npm run seed` replaces every row with the sample set. It does not ask first.
- The shell has the top bar and the eight routes. Pages can be empty. The look already follows the brand and the figures mockup.
- Fonts are files in the frontend. The app does not request Google.
- There is no password and no sign-in. The out-of-scope list in S85 is not built. README.md stays unchanged.
- The sample set matches S78. A test database is a different file from the owner's.

Delivers S01, S02, S03, S04, S05, S61, S62, S63, S64, S65, S68, S69, S70, S74, S75, S76, S77, S78, S79, S80, S81, S83, S85.

### Phase 2. Organizations and contacts

Add the tables, dialogs, and record pages for companies and people.

- Search, sort, add, edit, and delete. Delete asks first and names the linked records.
- Delete an organization and its contacts go with it. Deals do not exist yet, so the deal half of that rule lands in phase 3.
- A new contact starts as Lead. The contacts table filters by All, Lead, Qualified, and Customer.
- The organization page lists its contacts. The contact page shows its organization.
- Fields match S06 and S09. A website with a value is a link. A contact may have no organization.
- An empty table offers add. A search with no matches says so. A bad field shows the error beside the field and the dialog stays open.
- Money uses the US dollar form. Lead, Qualified, and Customer use the mark colors.
- Tables use TanStack Table.

Delivers S06, S07, S09, S10, S27, S28, S29, S38, S39, S66, S67, S73.

### Phase 3. Deals

Add the deals table, the deal dialog, and the deal page.

- A deal needs an organization. The main contact, when set, belongs to that organization.
- A new deal from the deals table starts at New. Probability follows the stage. A hand-set probability stays until the stage changes.
- A late open deal shows Late on the row and on the deal page. Won and Lost are not late.
- A move to Won or Lost with an empty close date sets the date to today.
- The organization page lists its deals. The contact page lists deals where that person is the main contact.
- Delete a deal and its activities go with it. Delete a contact and the deal stays, with no main contact. Delete an organization and its deals go with it. The activity rows of that cascade are proved in phase 5, when activities exist.
- Search on all three tables uses the fields in S24, as the owner types, and matches part of a word. Default sort is S26. A second click reverses the sort.
- From an organization page the owner can add a contact or a deal already tied to that organization.
- Moving a deal to another organization clears a main contact who is not there. Expected revenue uses S15.

Delivers S08, S11, S13, S14, S15, S16, S17, S21, S23, S24, S25, S26, S35.

### Phase 4. Pipeline

Add the board to match the figures mockup.

- Six columns, in stage order. Each column shows its count, value, expected revenue, cards, and Add deal.
- The header shows open pipeline value and expected revenue. Won and Lost stay out of that header.
- A drop saves the stage and the position. Positions in a changed column become `0, 1, 2...` from the top.
- A stage change sets the usual probability, clears the hand-set flag, and writes the stage entry. The figures update as soon as the drop is saved.
- If the save fails, the card returns to its old place.
- Add deal in a column starts at that stage, with that stage's probability, at the top of the column. A new deal from the deals table still starts at New.
- A card shows the name, the organization, the value, and the close date. Late shows on the card.
- If the save fails, the card returns and the app says it could not save the move.
- The deals table shows the new stage and the new probability.
- The board uses dnd-kit. The column head is a stage chip, as in the figures mockup.

Delivers S12, S40, S41, S42, S43, S44, S45, S46, S47, S72, S86.

### Phase 5. Activities and timelines

Add the log form on the contact page and the deal page.

- An activity has one parent, a contact or a deal. Types are Note, Call, and Email.
- The owner can edit and delete an activity. Mark done keeps it on the timeline.
- A deal timeline shows its activities and its stage entries, newest first. The owner can delete a stage entry and cannot edit its text.
- A contact timeline also shows activities and stage entries for deals where that person is the main contact.
- When it happened defaults to now. Done defaults to not done.
- Delete an activity and the parent stays. Delete a stage entry and the deal's stage stays. Delete of an organization, a contact, or a deal now removes the child activities and stage entries.
- The contact page and the deal page show the timeline with the linked records.

Delivers S18, S20, S30, S31, S32, S33, S34, S36, S37, S48, S49, S50.

### Phase 6. Dashboard

Make the landing page match docs/mockups/figures.html.

- Five figures in one row. The line chart is full width. The bar chart and the funnel sit side by side. Recent activity and follow-ups sit side by side under the charts.
- The line is revenue won for the last 6 months. A point shows the count of deals won. A month with no wins is $0.
- The bars are expected revenue for the four open stages. The funnel is the value sitting in each open stage now. Width follows the value. The funnel does not narrow by force.
- Recent activity is the 10 newest activities and stage entries.
- Overdue follow-ups are every one before today. Upcoming ones are today through the next 7 days. Mark done removes the task and leaves the timeline.
- Charts use Recharts. Fills are flat. Colors are the stage colors. TanStack Table and dnd-kit are already in use, so S82 is complete here.
- A Won deal with no close date is in none of the month totals.
- Overdue tasks sort oldest first. Upcoming tasks sort soonest first. Each task shows the description, the contact or deal, the date, and Mark done.
- The figures change when a deal is marked won and when a follow-up is added.
- `GET /api/dashboard` completes the endpoint list. `npm test` runs pytest, Vitest, and Playwright.

Delivers S19, S22, S51, S52, S53, S54, S55, S56, S57, S58, S59, S60, S71, S82, S84.

### Where each ID is delivered

| ID | Phase | ID | Phase | ID | Phase |
|---|---|---|---|---|---|
| S01 | 1 | S02 | 1 | S03 | 1 |
| S04 | 1 | S05 | 1 | S06 | 2 |
| S07 | 2 | S08 | 3 | S09 | 2 |
| S10 | 2 | S11 | 3 | S12 | 4 |
| S13 | 3 | S14 | 3 | S15 | 3 |
| S16 | 3 | S17 | 3 | S18 | 5 |
| S19 | 6 | S20 | 5 | S21 | 3 |
| S22 | 6 | S23 | 3 | S24 | 3 |
| S25 | 3 | S26 | 3 | S27 | 2 |
| S28 | 2 | S29 | 2 | S30 | 5 |
| S31 | 5 | S32 | 5 | S33 | 5 |
| S34 | 5 | S35 | 3 | S36 | 5 |
| S37 | 5 | S38 | 2 | S39 | 2 |
| S40 | 4 | S41 | 4 | S42 | 4 |
| S43 | 4 | S44 | 4 | S45 | 4 |
| S46 | 4 | S47 | 4 | S48 | 5 |
| S49 | 5 | S50 | 5 | S51 | 6 |
| S52 | 6 | S53 | 6 | S54 | 6 |
| S55 | 6 | S56 | 6 | S57 | 6 |
| S58 | 6 | S59 | 6 | S60 | 6 |
| S61 | 1 | S62 | 1 | S63 | 1 |
| S64 | 1 | S65 | 1 | S66 | 2 |
| S67 | 2 | S68 | 1 | S69 | 1 |
| S70 | 1 | S71 | 6 | S72 | 4 |
| S73 | 2 | S74 | 1 | S75 | 1 |
| S76 | 1 | S77 | 1 | S78 | 1 |
| S79 | 1 | S80 | 1 | S81 | 1 |
| S82 | 6 | S83 | 1 | S84 | 6 |
| S85 | 1 | S86 | 4 | | |

## Risks

- The nine concerns in docs/spec.md are assumptions. The owner chose the figures layout and has not changed the other eight. Build those assumptions. Stop if the owner rejects one.
- A classic funnel is wide at the top and narrow at the bottom. Proposal can hold more value than New. Draw width from the value, as the mockup does.
- Card order is easy to get wrong. Test a drop in the same column and a drop into another column, then reload.
- Delete of an organization removes contacts, deals, activities, and stage entries. The confirm dialog must state the counts before the owner agrees.
- `npm run seed` wipes practice records and does not ask. Say that in docs/STATUS.md.
- The handlers must not send raw SQL strings. Keep queries in SQLAlchemy Core.
- The database file is `data/accountable.db`. Tests use another file. A test must not open the owner's file.
- Both servers must bind to `127.0.0.1`. A bind on all interfaces would let another device open the app.
- Font files must be in the repo. A link to Google fails the offline rule.
- Playwright needs the installed Google Chrome. The e2e run starts its own app and its own database.

These risks guard S03, S30, S44, S55, S74, S76, S77, S80, and S85. They do not deliver a new ID.

## Proof

`npm test` runs pytest, Vitest, and Playwright. Any failure fails the command. The tests below are the set. Passing them is required. The owner still signs off in a browser, against the eight criteria in docs/intent.md.

### Backend, pytest

| Test | IDs | Proves |
|---|---|---|
| Fresh database matches the sample set | S78 | Counts, statuses, stages, late deals, a month with no win, future close dates, and the activity mix |
| Second start keeps added rows | S05, S75 | A restart does not wipe the file |
| Seed replaces rows | S76 | `npm run seed` brings the sample set back |
| Create and update reject a bad field | S73 | 422 names the field. A missing id is 404. A real delete is 204 |
| Delete an organization | S30 | Contacts, deals, their activities, and stage entries go with it |
| Delete a contact | S31 | The contact's activities go. Deals stay. The main contact on those deals is cleared |
| Delete a deal | S32 | Its activities and stage entries go. The organization and the contact stay |
| Delete an activity or a stage entry | S33, S34 | Only that row goes. The parent and the current stage stay |
| List search and sort | S23, S24, S25, S26, S27 | The three search field sets, a reversed sort, the default deal order, and status together with search |
| Stage change | S13, S14, S20, S72 | The usual probability replaces a hand-set value. The stage entry is written and cannot be edited |
| Hand-set probability | S14 | It stays while the stage stays |
| Won or Lost with no close date | S21, S22 | An empty date becomes today. A Won deal that still has no date is in no month total |
| Late | S16 | An open deal before today is late. Won and Lost are not late |
| Main contact | S11, S17 | The contact must belong to the organization. A new organization clears a contact who is not there |
| Drop | S42, S47 | Positions are `0, 1, 2...` from the top. A same-column drop does not write a stage entry |
| Activity parent | S18, S19 | One parent. Defaults apply. Mark done keeps the row |
| Dashboard math | S15, S51, S52 | Open pipeline, expected revenue, and the won-this-month figures match the rows |
| Follow-up window | S58 | Overdue, upcoming, later, and the two sort orders |
| Recent activity | S20, S57 | The 10 newest activities and stage entries, newest first |

### Frontend, Vitest

| Test | IDs | Proves |
|---|---|---|
| Money text | S67 | $1,250.00, with the dollar sign and two decimals |
| Late mark | S16, S41, S66 | An open deal before today shows Late. A won deal does not |
| Follow-up split | S58, S59 | Overdue, upcoming, and a later date. Overdue rows carry the Overdue mark |

### Browser, Playwright

Playwright uses installed Google Chrome. It starts the app. It uses its own database.

| Test | IDs | Proves |
|---|---|---|
| Open the dashboard | S51, S52, S53, S54, S55, S60, S84 | Sample figures and the three visuals are on screen. The console has no errors |
| Add, search, and sort | S05, S23, S25, S28, S35 | A new organization is still there after reload. Search and a heading sort change the table. Add from the organization page keeps the tie |
| Contact filter | S10, S27 | Lead, Qualified, and Customer each hide the other statuses |
| Delete asks | S29, S39 | The dialog names the linked records. Cancel leaves the row. A bad field stays in the open dialog |
| Drag to another column | S14, S42, S43, S46 | After reload the stage and the probability match the new column. The header totals have changed |
| Drag inside a column | S42, S47 | After reload the card keeps that place |
| Log a follow-up | S19, S48, S58, S59 | It shows on the dashboard. Mark done removes it there. The timeline still shows it |
| Stage entry | S20 | A move shows "Moved from … to …" on the deal timeline |

### Owner sign-off

The owner uses every section in a real browser, with no console errors, and judges the look against the brand and docs/mockups/figures.png. That pass is success criterion 8. It is not a test file.

The eye pass locks S07, S38, S44, S56, S61, S62, S63, S64, S65, S66, S68, and S86. S85 is locked because those parts are not built.

These IDs are delivered by the phase and have no separate test: S01, S02, S03, S04, S06, S08, S09, S12, S36, S37, S40, S45, S49, S50, S69, S70, S71, S74, S77, S79, S80, S81, S82, and S83. The phase is done only when those lines are true in the running app.
