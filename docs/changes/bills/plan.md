# Plan: bills

This plan turns the bills intent, and the spec already updated on this branch, into build work: which files change, in what order, what could go wrong and how we'll know it works. Ids such as E9 and D4 are the spec's requirements. The intent wins over the spec, and the spec wins over this plan. If the build shows the spec is wrong, fix the spec in the same change and say so in `docs/STATUS.md`.

The plan ends with the build. ui-check, the review and `docs/IMPROVE.md` come after it, and so does the walk on Supabase.

There's no new dependency. Recharts already draws the CRM's stacked and bar charts. lucide-react 1.66 has `Receipt`, `CircleCheck` and `Undo2`, checked in `node_modules`. date-fns adds the 30 days, and Sonner messages already carry a button through `action`, as the product's Restore does. Every category color is already a token in `styles.css`: `sea-green`, `marigold`, `coral`, `cerulean`, `raspberry` and `bar-soft`.

The build settles six things the spec doesn't say yet, or says differently, and puts them in the spec when it does:

- **Spending is added up by month in Python.** `backend.md` says the database groups the 12 months' bills by month and category. Grouping by month needs date functions that differ between SQLite and Postgres, and those would have to live in `db.py`. So one query reads the window's bills, and Python folds them into months, as the CRM's revenue chart does with `month_series`. At 1,000 bills that's a few hundred rows. `backend.md` changes to say so.
- **The Money reply carries `today`,** as `GET /dashboard` does, so the section reads its figures again once the browser's day has passed it (E20). This goes in the API table in `backend.md`.
- **Each Money chart has a table behind it for screen readers,** as the CRM's month charts have `MonthsTable`: the bills due, and each month's spending by category. This goes in E22 and E23.
- **Focus after a row leaves the table.** Under Unpaid, Mark paid takes the row out of the table, and under Paid, Mark unpaid does. As with Archive (G10), focus moves to the table's search box, so it isn't left on nothing (Q3). This goes in E13.
- **Row buttons' labels follow the table's pattern,** the button's word and then the row's name: "Mark paid bill INV-0042 from Northwind Software". The spec's example in the Bills table screen, "Mark bill INV-0042 paid", changes to match. The row's name includes the supplier, because bill numbers repeat across suppliers.
- **The button that shows All reads "Show all bills".** It goes in the Words table in `visual-design.md`.

## Files that change

### What the parts agree on

**API, between the backend and the frontend**

- A bill's reply has `id`, `organization` as `{id, name}`, `bill_number`, `bill_date`, `due_date`, `amount_cents`, `tax_cents`, `total_cents`, `category`, `notes` and `paid_on`. Dates are `YYYY-MM-DD`, and `paid_on` is null while the bill is unpaid. The category is one of `software`, `contractors`, `travel`, `office`, `marketing` and `other`. The detail adds `created_at`, `created_by`, `updated_at` and `updated_by`, as every other detail does.
- `GET /api/bills` gives every bill, ordered by due date, then id. `GET /api/bills?organization_id=7` gives that organization's.
- `POST /api/bills` takes `organization_id`, `bill_number`, `bill_date`, `amount_cents` and `category`, and optionally `due_date`, `tax_cents`, `notes` and `paid_on`. It answers 201 with the detail. With no `due_date`, it's `bill_date` plus 30 days. With no `tax_cents`, it's 0.
- `GET /api/bills/{id}` gives the detail, or a 404.
- `PATCH /api/bills/{id}` takes any of the fields and gives the detail. `paid_on` set to a date marks the bill paid, and set to null marks it unpaid. A save that alters nothing writes nothing (U10).
- `DELETE /api/bills/{id}` answers 204. There's no `delete-impact` route.
- `GET /api/bills/dashboard` gives `{today, owed, overdue, due, months}`. `owed` and `overdue` are `{total_cents, count}`. `due` is `{total_cents, count, bills}`, each bill `{id, supplier, bill_number, due_date, category, total_cents}`, ordered by due date. `months` is 12 items, oldest first, each `{month, label, total_cents, categories}`, where `categories` has a total in cents for each of the six.
- Errors are 422s with a message beside the field: `organization_id` "Choose a supplier", also for an organization that doesn't exist; `bill_number` "Enter the bill number", "Keep the bill number to 50 characters or fewer" or "This supplier already has a bill with this number"; `bill_date` "Choose a bill date"; `due_date` "Choose a due date" or "The due date can't be before the bill date"; `amount_cents` and `tax_cents` "Enter an amount in dollars and cents, such as 49.50"; `category` "Choose a category"; `paid_on` "The paid date can't be in the future" or "The paid date can't be before the bill date". `total_cents` in a request is ignored, as any unknown field is.
- A bill holds its organization, so the CRM's existing `DELETE /api/organizations/{id}` gets its 409, "This organization has 12 bills, so it can't be deleted.", and `delete-impact`'s `held_by` lists `{"noun": "bill", "count": 12}`.

**Backend, between files**

- `bills/tables.py` has the `bills` table, `bill_number_key(number)`, which normalizes and casefolds as `products.tables.name_key` does, `CATEGORIES`, `HOLDS = (Hold(bills.c.organization_id, "bill"),)` and `RECORDS = (bills,)`.
- `main.py` adds `Area(routers=[bills.router], messages=bills_schemas.FIELD_MESSAGES, holds=bills_tables.HOLDS)`, with no search kinds (K1).
- `cli.py` adds `bills_tables.RECORDS` to `RECORDS`, and `fill_sample` calls `bills_sample_data.fill(conn, today)` after the CRM's, because the bills point at its organizations.
- The router declares `/dashboard` before `/{bill_id}`, so "dashboard" is never read as an id.

**Frontend, between files**

- `DataTable` lets a table give a `rowAction` and `onDelete` together, drawn as Edit, then the action, then Delete. Products keep giving `rowAction` alone and the CRM `onDelete` alone, so they draw as today.
- `DataTable` gains an optional `filterNote`, for a filter whose usual view leaves rows out (E15). It has every row before the filter, what to say with none under the filter ("No unpaid bills."), the filter's words for a search with no matches ("unpaid bills", giving "No unpaid bills match "acme"."), what to add when rows match under All ("4 bills match under All."), and the address change that shows All. Without it, a table behaves exactly as today. Bills give no `clearParams`, so clearing the search leaves the filter alone.
- `RecordHeader` lets a page give an `action` and `onDelete` together, drawn as Edit, the action, then Delete. The product page keeps giving `action` alone.
- `bills/categories.ts` holds the six in order, each with its value, label, swatch class (such as `bg-sea-green`) and chart fill (such as `var(--color-sea-green)`), and the `CategoryLabel` that draws the 10px swatch and the name.
- `bills/status.ts` has `billStatus(bill, today)`, giving `"unpaid"`, `"overdue"` or `"paid"`, and `BillStatusChip`, in the tones from `visual-design.md`. Every place that shows a status uses these, with `useToday`.
- The Bills table's filter lives in the address as `status`: none means Unpaid, then `all`, `overdue` or `paid`. The Money figures link to `/bills` and `/bills?status=overdue`.
- Query keys: `["bills"]`, `["bills", id]`, `["bills", "organization", organizationId]` and `["bills", "dashboard"]`.
- `App.tsx` adds the Bills section with `Receipt`, the routes `/bills` and `/bills/:id`, `{ name: "bills", Panel: BillsPanel }` in `ORGANIZATION_PANELS` and `{ name: "money", Section: MoneySection }` in `DASHBOARD_SECTIONS`.

### Docs

| File | Change |
|---|---|
| `docs/spec.md`, `docs/specs/*.md` | Already updated on this branch. The build adds the six points above, the files the build settles in the tree in `architecture.md`, and anything else it finds |
| `docs/STATUS.md` | Bills added to what's done, at the end. The run instructions describe the Bills section and the Money section. The SQL that clears the sample data in Supabase gains `bills`, in the same `truncate` as `organizations`, because Postgres refuses to empty a table another table's rows point at (C11). It notes what the quotes and invoices merges will touch: the migration's number, the sections, the Money section and the shared table and header |

### Backend: existing files

| File | Change |
|---|---|
| `backend/accountable/main.py` | The bills area, as agreed above |
| `backend/accountable/cli.py` | `RECORDS` gains the bills, so seed and empty count them (C4). `fill_sample` fills them after the CRM. The wipe already takes every table from the metadata, bills before organizations |
| `backend/accountable/migrations/env.py` | Imports `bills.tables` and asserts it shares the metadata |

### Backend: new files

| File | What it holds |
|---|---|
| `backend/accountable/bills/__init__.py` | Empty |
| `backend/accountable/bills/tables.py` | The `bills` table from `backend.md`, with `organization_id` not null and a foreign key with no delete rule, `*who.columns()`, `TABLE_OPTIONS`, `tax_cents` defaulting to 0, the check constraint `ck_bills_category`, a unique index `ix_bills_supplier_number` on `(organization_id, bill_number_key)`, and indexes on `due_date` and `bill_date`. Also `bill_number_key`, `CATEGORIES`, `HOLDS` and `RECORDS` |
| `backend/accountable/bills/schemas.py` | `FIELD_MESSAGES` and the messages above, `BillNumber` (`api.Name` up to 50 characters), `Category` as a `Literal` of the six, `BillCreate`, `BillUpdate` with `MISSING` for unsent fields, where `due_date`, `bill_date` and the rest can't be null and `paid_on` can, `Supplier`, `BillRow` and `BillDetail(BillRow, Authorship)`, and the Money reply's models |
| `backend/accountable/bills/router.py` | The six routes. Saving reads the bill, applies what was sent, then checks the result: the supplier exists, the number is free for that supplier, the due date isn't before the bill date, and a paid date isn't after the backend's today or before the bill date. All of that runs in one transaction under the write lock. The unique index's refusal gets the same message, caught outside `db.writing()` because Postgres aborts the transaction, as products do. The total is `amount_cents + tax_cents` in the query. The Money route reads the unpaid bills once and works out what we owe, what's overdue and what's due from them. A second query reads the 12 months' bills, which Python folds into months and categories with `months.last_months` |
| `backend/accountable/bills/sample_data.py` | The six suppliers and 85 bills below, dated from the seeding day, put down to the made-up teammates with `sample.put_down_to`. Marking a bill paid is a change, so a paid bill is last changed at its paid date |
| `backend/accountable/migrations/versions/0007_bills.py` | Creates `bills`, with its who columns, foreign keys and indexes named as in `0004`, `sqlite_autoincrement`, the check constraint and the unique index. On Postgres only, turns on row-level security. Adds no rows (M1). Downgrade drops the table |

### Frontend: existing files

| File | Change |
|---|---|
| `frontend/src/App.tsx` | The section, routes, panel and dashboard section, as agreed above |
| `frontend/src/components/DataTable.tsx` | `rowAction` with `onDelete`, and `filterNote`, as agreed above. With neither, it behaves exactly as today |
| `frontend/src/components/RecordLayout.tsx` | `RecordHeader`'s `action` with `onDelete` |

### Frontend: new files

| File | What it holds |
|---|---|
| `frontend/src/bills/queries.ts` | The `Bill`, `BillRow`, `BillDetail` and `MoneyFigures` types. `useBills`, `useOrganizationBills`, `useBill`, `useSaveBill`, and `useMoney`, which reads `/bills/dashboard` again once `useToday` passes the reply's `today`, as `useDashboard` does. `usePaid` marks a bill paid on a date, saying "Bill marked paid.", and marks it unpaid, saying "Bill marked unpaid." with Undo for 10 seconds, which puts back the date it had. Each happens once however quickly it's asked for, as `useSetActive` does |
| `frontend/src/bills/categories.ts` | As agreed above |
| `frontend/src/bills/status.ts` | As agreed above |
| `frontend/src/bills/BillForm.tsx` | Supplier, a `RecordPicker` with no `onAdd`, reading `useOrganizations`. Then Bill number, Category, Bill date and Due date, Amount and Tax, the total line, Paid on with its hint, and Notes, as in the Bill form screen. React Hook Form and Zod, with the backend's rules. The due date follows the bill date, plus 30 days through date-fns' `addDays` on `parseISO`, until the due date is typed in. The amount boxes are called `amount_cents` and `tax_cents`, as the API's fields are, so a 422 lands beside them. It takes a supplier to fill in, for Add bill on an organization's page, and closes and says so if the organizations can't be read (F11) |
| `frontend/src/bills/MarkPaidDialog.tsx` | A `FormDialog` titled "Mark bill INV-0042 paid", with Paid on holding today and the same checks, and Mark paid |
| `frontend/src/bills/DeleteBill.tsx` | `ConfirmDelete` with E17's words. It has no counts to wait for |
| `frontend/src/bills/BillsPanel.tsx` | An organization's Bills panel (E19), a `SidePanel` with Add bill |
| `frontend/src/bills/pages/Bills.tsx` | The table (E13 to E15): its columns, the status filter with counts, `rowAction` for Mark paid or Mark unpaid, `onDelete`, `filterNote`, and focus to the search box when a row leaves |
| `frontend/src/bills/pages/Bill.tsx` | The page (E18): the header with the status chip and Mark paid or Mark unpaid beside Edit and Delete, "From Northwind Software", the details panel and the notes panel. `MissingRecord` for a bad address |
| `frontend/src/bills/charts/MoneySection.tsx` | The heading "Money" and the two panels. Bills to pay has What we owe and Overdue, each a link, and Due in the next 30 days with its figure and timeline. Spending by category holds the chart. Each has its empty state (E21 to E23) |
| `frontend/src/bills/charts/DueTimeline.tsx` | A Recharts bar chart over the 31 days, one stacked layer for each bill on a day, each bar colored by its category through `Cell`, with a tooltip for the bill pointed at, the axis from "Today" by week, and the table behind it |
| `frontend/src/bills/charts/SpendingChart.tsx` | A Recharts bar chart with one `Bar` for each category, all on one `stackId`, in the categories' order, the current month's total and "so far" above its column, the money axis on the right, the legend under it, the tooltip, and the table behind it |

### Tests: existing files

| File | Change |
|---|---|
| `backend/tests/conftest.py` | `Make.bill()` |
| `backend/tests/test_delete.py` | `test_no_area_holds_a_deal_or_an_organization_yet` becomes a check that the areas give exactly one hold: the bills', on organizations, with the word `bill`. The stand-in tests stay as they are |
| `backend/tests/test_layout.py` | `test_the_areas_are_found` expects `bills` too. The other rules pick it up by themselves |
| `backend/tests/test_migrations.py` | The spec's indexes gain `bills (due_date)`, `bills (bill_date)` and the unique `bills (organization_id, bill_number_key)`. An upgrade from a database at `0006` keeps every row and adds an empty bills table. On Postgres, written out offline, `amount_cents` and `tax_cents` are `bigint`s. The checks on constraints, delete rules, ids and row-level security pick up the new table by themselves |
| `backend/tests/test_cli.py` | The counts line names bills, and seed gives 85 |
| `backend/tests/test_sample_data.py` | 30 organizations and 85 bills, the bills lines of M3, and bills among the kinds in the M7 and U14 checks |
| `backend/tests/limits_data.py`, `test_limits.py` | 1,000 bills at the limits. `/api/bills` and `/api/bills/dashboard` are quick. The query caps: `/api/bills`, `/api/bills/{bill}` and an organization's bills at one each, and `/api/bills/dashboard` at two |
| `backend/tests/test_every_route.py` | `test_the_routes_were_found` names a bills route and the Money route. Everything else picks them up by itself |
| `backend/tests/test_search.py` | A bill's number isn't found (K1) |
| `frontend/src/App.test.tsx`, `main.test.tsx` | Seven sections, Bills last. `/bills` and `/bills/:id` open their pages, and `/bills/abc` says the bill no longer exists. The organization's page shows the Bills panel and the dashboard the Money section. Every test that opens the dashboard or an organization's page through the app mocks the two new reads |
| `frontend/src/components/DataTable.test.tsx` | `rowAction` with `onDelete`, and `filterNote`, below |
| `e2e/helpers.ts` | `addBill(request, values)` |
| `e2e/start.spec.ts` | The top bar links to seven sections |
| `e2e/quality.spec.ts` | `/bills` in `SECTIONS`, a bill's page among the record pages, and each `tabThrough` count up by one for the new link. The keyboard walk reaches the Bills link, the filter's buttons and a row's Mark paid button |
| `e2e/data.spec.ts` | `/bills` in `SCREENS`. Seed brings back the sample bills and fills the Money section. Empty leaves "No bills yet. Add the first one." and the Money section's empty states, and the first bill can be added |
| `e2e/failures.spec.ts` | The Bills table and a bill's page in `SCREENS`. `/bills/abc` and a missing id among the addresses that lead nowhere. A failed Mark paid says so and leaves the bill unpaid. A double click on Mark paid in the dialog marks it once |
| `e2e/menu.spec.ts` | `/bills` in `SECTIONS` and the section names. The contrast sweep, in both modes, covers Bills under All, an overdue bill's page and the Money section |
| `e2e/stress.spec.ts` | Bills opens in under a second, and the Money section's data arrives in under 200ms, at the limits |

`e2e/bills.spec.ts`, `backend/tests/test_bills.py`, `backend/tests/test_bills_dashboard.py`, `frontend/src/components/RecordLayout.test.tsx`, because nothing tests `RecordHeader` on its own today, and in `frontend/src/bills/`: `status.test.ts`, `BillForm.test.tsx`, `BillsPanel.test.tsx`, `pages/Bills.test.tsx`, `pages/Bill.test.tsx` and `charts/MoneySection.test.tsx`, are new.

### Sample suppliers and bills

Six suppliers are added, each with a website on `.example`, an industry and a line of notes, and no contacts or deals. Four customers already in the sample data also send bills, so each is both.

| Supplier | New? | Category | Bills | Each | Tax |
|---|---|---|---|---|---|
| Kingsgate Properties, Real estate | New | Office | Rent, on the 1st of each of the last 12 months | $4,500.00 | None |
| Kingsgate Properties | | Office | Cleaning, once a quarter | $650.00 | $57.69 |
| Cloudline Hosting, Software | New | Software | Hosting, on the 1st of each month, rising with use | $380.00 to $460.00 | None |
| Northwind Software, Software | New | Software | Subscription, on the 3rd of each month | $1,240.00 | $110.05 |
| Northwind Software | | Software | Yearly license renewal, about 7 months ago | $9,600.00 | $852.00 |
| Fieldstone Development, Professional services | New | Contractors | A contractor's monthly invoice by hours, on the 28th | $6,800.00 to $9,200.00 | None |
| Wayfarer Travel, Travel | New | Travel | 14 trips to customers, spread over the year | $320.00 to $2,400.00 | Most with tax |
| Signalbox Marketing, Marketing | New | Marketing | Online ads in 9 of the 12 months | $1,500.00 to $3,000.00 | None |
| Signalbox Marketing | | Marketing | A trade show stand, about 4 months ago | $12,500.00 | $1,109.38 |
| Saltmarsh Studio | Customer | Marketing | Brochure design, twice | $2,850.00 | None |
| Ironwood Joinery | Customer | Office | Desks and shelving, about 9 months ago | $7,900.00 | $701.13 |
| Marlowe Insurance | Customer | Other | Yearly business insurance, about 10 months ago | $6,400.00 | None |
| Stonebridge Accounting | Customer | Other | Accounts, once a quarter | $1,800.00 | $159.75 |

That's 85 bills, with four large one-off ones over $5,000 and every category. The rent and hosting bills on the 1st put at least two in this month on every seeding day, the 1st included, and keep every month of the spending chart full. Each supplier numbers its bills its own way, such as `KP-2611` or `NS-10482`, counting up, so no supplier repeats a number.

Every bill gets its due date 30 days after its bill date. A bill due today or later is unpaid. A bill due before today was paid a few days before its due date, never before its bill date or after today, apart from three one-off bills left overdue: a Wayfarer trip dated 42 days before the seeding day, a Signalbox ads bill dated 36 days before and Saltmarsh's second brochure dated 75 days before. Dating these three, and two of the Wayfarer trips, from the seeding day keeps at least 6 bills due in the next 30 days and 3 overdue on every seeding day. Each bill is added a day after its bill date, or on the seeding day if that's sooner, by the teammates in turn. Every third bill is last changed by the next teammate since, and a paid bill was last changed when it was marked paid, never before it was added.

## Order of work

Six phases. Each ends with `npm run check:quick` passing, and Phase 6 ends with `npm run check`. Each new test is seen to fail once, by breaking your own copy of the code it covers and then putting your copy back, never through git. Any by-hand look at the app runs on a temporary database through `ACCOUNTABLE_DB`.

### Phase 1: bills on the backend

1. `bills/tables.py`, migration `0007` and `env.py`, with the `test_migrations.py` changes.
2. `bills/schemas.py` and `bills/router.py`, without the Money route. The area in `main.py`. `Make.bill()` and `test_bills.py`.
3. The hold: `test_delete.py`, and the organization delete cases in `test_bills.py`.
4. `test_layout.py`, `test_every_route.py` and the bill number check in `test_search.py`.

Done when `npm run check:quick` passes.

### Phase 2: the Money figures, sample data and the limits

1. The Money route and `test_bills_dashboard.py`.
2. `bills/sample_data.py` and `cli.py`, with `test_sample_data.py` and `test_cli.py`. Seed a temporary database and read the Money reply by hand, to see it full.
3. `limits_data.py` and `test_limits.py`.

Done when `npm run check:quick` passes.

### Phase 3: the shared table and header

1. `rowAction` with `onDelete`, and `filterNote`, in `DataTable`, with their tests.
2. `action` with `onDelete` in `RecordHeader`, with its test.

The CRM's and the products' pages and their tests stay as they are. Done when `npm run check:quick` passes.

### Phase 4: bills on the frontend

1. `categories.ts` and `status.ts`, with `status.test.ts`.
2. `queries.ts`, `BillForm.tsx`, `MarkPaidDialog.tsx` and `DeleteBill.tsx`, with `BillForm.test.tsx`.
3. Both pages, with their tests. The section and routes in `App.tsx`, with the App and main tests.
4. `BillsPanel.tsx` and its test, and the panel in `App.tsx`.

Done when `npm run check:quick` passes.

### Phase 5: the Money section

1. `DueTimeline.tsx`, `SpendingChart.tsx` and `MoneySection.tsx`, with `MoneySection.test.tsx`.
2. The section in `App.tsx`, and the mocks for it in the App and main tests.

Done when `npm run check:quick` passes.

### Phase 6: end to end, and finish

1. `addBill` in `e2e/helpers.ts`, then `e2e/bills.spec.ts`.
2. The changes to the other end-to-end specs listed above.
3. The six spec points at the top of this plan, and anything else the build found, in the spec files. Then `docs/STATUS.md`, including the run instructions and the SQL that clears the sample data in Supabase.
4. Run `npm run check` until it passes, and read its list of unit tests that took a second or more.

That's the end of this plan. ui-check, the review and `docs/IMPROVE.md` follow.

## Risks

Most damaging first.

1. **The owner's records, or the team's.** Migration `0007` runs on whatever database the app starts on, and nothing takes it back. `data/accountable.db` holds the owner's records. No agent starts the app on it, or seeds, empties or opens it. The tests use their own databases, and any by-hand look uses `ACCOUNTABLE_DB`. The team's database on Supabase gets `0007` at the first start after the merge. The row-level security check at start stops the shared app if the table missed it, which would be an outage, so the offline Postgres SQL test checks the statement is there before anything reaches Supabase. Once bills exist, the clearing SQL in `STATUS.md` fails unless `bills` is in its `truncate`, and it's one transaction, so it would change nothing and say why. Phases 1 and 6.
2. **The merges with quotes and invoices.** All three branches add the migration after `0006`, a top bar section, an entry in `main.py`'s `AREAS`, `cli.py` and `env.py`, and invoices adds to the Money section. `test_the_migrations_have_one_head` fails the second merge until its migration is renumbered. Bills keeps its changes to shared files to new optional props and one new entry in each list. The Money section is one component with two panels, so invoices' panels can join it. `STATUS.md` lists what each merge will touch. Tests that count sections or Tab stops will need the merged count, which `quality.spec.ts`'s check that the top bar stays inside itself at 1280px catches. Phase 6.
3. **A Money figure that doesn't match the bills** (success criterion 3). The edges are where it goes wrong: a bill due today is in the 30 days and isn't overdue, one due yesterday is overdue, the 30th day after today is in and the 31st isn't, paid bills count in spending but not in what we owe, tax counts everywhere, and a bill dated in a later month isn't on the chart. `test_bills_dashboard.py` puts a bill on each edge, with today fixed, including a month that crosses a year. `e2e/bills.spec.ts` adds bills through the API and reads the figures off the page. The backend's today comes from `TZ` and the browser's from the device. They agree for the team (Terms), and the reply's `today` keeps the page from showing a day-old answer. Phases 2 and 5.
4. **Two bills from one supplier with one number.** The ways it could happen: case rules that differ between the databases, two forms of an accented letter, two saves at once, and a bill moved to another supplier. `bill_number_key` is worked out in Python, normalized and casefolded. The check runs inside the write lock against the supplier the bill will have after the save, and the unique index backs it up. On Postgres, the index's refusal aborts the transaction, so the router catches it outside `db.writing()`. A test removes the check to reach the index, and expects the 422, not a 500. Phase 1.
5. **A bill shown as overdue a day late, or a day early.** Overdue is never saved. The browser works it out from `due_date` and `useToday`, which turns at midnight, and the Money section reads again when the day passes its reply's `today`. Unit tests move the clock past midnight and see the chip and the counts change with no new read. Dates are read with `parseISO`, never `new Date("2026-10-31")`, which `layout.test.ts` already refuses, and the 30 days are added with `addDays`, never through `toISOString()`, which would shift to UTC. Phases 4 and 5.
6. **Existing tests that open the dashboard or an organization's page.** Through `App.tsx` they now also read `/api/bills/dashboard` and `/api/bills?organization_id=`. A unit test with no mock for those fails, and so does an end-to-end test that sees a console error. Phases 4 and 5 add the mocks to the App and main tests, and `npm run check:quick` after each phase shows any that were missed.
7. **The Money route read as a bill.** `/bills/dashboard` must come before `/bills/{bill_id}`, or "dashboard" is refused as an id. `test_every_route.py` and `test_bills_dashboard.py` both reach it. Phase 2.
8. **A foreign key error as a 500.** On SQLite with foreign keys on, and on Postgres, a bill for an organization that doesn't exist is refused by the database. The router checks the supplier first and gives "Choose a supplier". A test sends a missing id on add and on edit. Phase 1.
9. **Sample data on awkward days.** Seeding on the 1st, on Jan 1 and on Feb 29 must still give 2 bills this month, 6 due in the next 30 days, 3 overdue, paid dates between the bill date and today, and nothing changed before it was added. Monthly bills fall on the 1st, 3rd and 28th, so every month has each day and none needs clamping. `test_sample_data.py` already seeds on those days and runs every check on each. Phase 2.
10. **The shared table and header change under the CRM and products.** `DataTable` and `RecordHeader` serve every table and record page. The new props are optional, and with none given, both behave exactly as today. Their existing tests and the CRM and products page tests pass unchanged. Phase 3.
11. **The charts.** Recharts stacks by series, and a day's bills aren't series, so the timeline stacks layers: the first bill due each day, then the second, each bar colored by its own category through `Cell`. The tooltip shows the bar pointed at, not the whole day. If that fights Recharts, the timeline is drawn as SVG with the same axes' text, `useSize` and `ChartTooltip`, and `frontend.md` says so. The Other category's grey changes with the mode, through `--color-bar-soft`, and `colors.test.ts` keeps every color in `styles.css`. Phase 5.
12. **Focus, and a message that goes away.** Mark paid under Unpaid and Mark unpaid under Paid take the row out of the table, so focus moves to the search box. The Undo on "Bill marked unpaid." stays 10 seconds, as Restore does, and Mark paid is always on the row and the page as well, so nothing is lost if the message goes. Phase 4.
13. **Unit tests over a second.** The table and chart tests use a handful of bills, and only a paging test makes more than 50. Seeding in `test_sample_data.py` now adds 85 bills, a few milliseconds more each time. Read the slow list at the end of each `npm test`. All phases.
14. **Spec claims that no test tries.** The spec now says two saves at once can't share a number, the database refuses to delete an organization with bills, a total sent in a request is ignored, a bill turns overdue at midnight with nobody saving it, and the Money data arrives in under 200ms. Each has a test below. All phases.

## Proof

`npm run check` runs everything below and fails if anything fails. The existing tests must still pass, with only the changes listed under [Tests: existing files](#tests-existing-files).

The intent's success criteria:

1. `npm run check` passes, at the end of Phase 6.
2. A bill can be added, edited, marked paid on a chosen date, marked unpaid again and deleted: the first test in `e2e/bills.spec.ts`, with `test_bills.py`, `BillForm.test.tsx`, `Bills.test.tsx` and `Bill.test.tsx` beneath it.
3. The dashboard's figures match the unpaid bills, and the spending chart matches the bills by month and category: `test_bills_dashboard.py` with known answers, `MoneySection.test.tsx`, and the Money test in `e2e/bills.spec.ts`.
4. A bill number used twice for the same supplier is refused, through the page or the API: `test_bills.py` through the API, `BillForm.test.tsx` and `e2e/bills.spec.ts` through the page.
5. An unpaid bill past its due date shows as overdue in the list and on the dashboard: `status.test.ts`, `Bills.test.tsx`, `MoneySection.test.tsx`, `test_bills_dashboard.py` and `e2e/bills.spec.ts`.
6. On a fresh copy with the sample data, the Bills section and the Money section are full of realistic figures: `test_sample_data.py`, `e2e/data.spec.ts`, then by hand at ui-check.

### Unit tests: backend (pytest)

| File | What it proves | Requirements |
|---|---|---|
| `test_bills.py` (new) | Add, edit, mark paid and unpaid, and delete through the API, each giving the detail with the supplier's name, the total, and who added and last changed it. Marking paid and unpaid count as changes, and a save with nothing altered writes nothing. A bill added with no due date gets 30 days after its bill date, and with no tax gets 0. A total sent in the body is ignored. A body naming someone changes nothing. A missing id is a 404 | E1, E4, E5, E9 to E12, E17, U10 |
| `test_bills.py` | Bill numbers: "inv-0042" is refused beside "INV-0042" from the same supplier, and so is "é" as two characters beside "é" as one, while another supplier can use it. Moving a bill to a supplier that has its number is refused. Spaces at the ends are dropped before the check. 50 characters are accepted and 51 refused. With the router's check taken out, the unique index still refuses, and the reply is the same 422, not a 500 | E3 |
| `test_bills.py` | Amounts: 0 and 100,000,000,000,000 cents accepted for the amount and the tax, and -1, one past the limit, `49.5`, `"4950"` and `true` refused with the amount message. Each category accepted, and anything else refused with "Choose a category". A missing supplier, on add and on edit, gets "Choose a supplier", not a 500 | E2, E4, E6 |
| `test_bills.py` | Dates, with today fixed: a due date before the bill date is refused. A paid date of today and of the bill date are accepted, and tomorrow and the day before the bill date refused. A bill date moved past the paid date in the same save is refused | E5, E9, E11, E16 |
| `test_bills.py` | Holds: an organization with bills gets the 409 with "This organization has 2 bills, so it can't be deleted.", and `delete-impact` lists them. Once its bills are deleted, it deletes. The database itself refuses the delete, with the route's check taken out | E2, D4 |
| `test_bills.py` | `?organization_id=` gives only that organization's bills. The list is ordered by due date | E19 |
| `test_bills_dashboard.py` (new) | With today fixed: what we owe counts every unpaid bill with tax, overdue ones and a bill dated next month included, and leaves out paid ones. Overdue counts a bill due yesterday and not one due today. The 30 days include today and the 30th day after, and leave out the 31st and every paid bill, in due date order. Spending puts each bill in its bill date's month and category, paid or not, with tax, across the turn of a year, with empty months as zero and a bill in a later month left out. With no bills, every figure is zero. The reply's `today` is the backend's | E20 to E23, E8 |
| `test_migrations.py` | The migrations build the bills table as `bills/tables.py` declares it, with its indexes, its unique index, its check constraint, a foreign key with no delete rule and ids that are never reused. An upgrade from `0006` keeps every row and adds an empty table. On Postgres, written out offline, the amounts are `bigint`s and row-level security is on | Data model, M1, Security |
| `test_sample_data.py` | On every seeding day: 30 organizations, with 6 suppliers that have bills and no deals, and at least one customer with bills. 85 bills in every category, in each of the last 12 months, at least 4 over $5,000, at least 2 this month, at least 6 unpaid and due in the next 30 days, at least 3 overdue, the rest paid between their bill date and today. Some with tax and some without. No supplier repeats a number. Every bill put down to a teammate, some last changed by another, none changed before it was added or after today. The same content each time | M2, M3, M5, M7, U14 |
| `test_cli.py` | Seed and empty name the bills in what will be lost. Seed gives 85 bills, and empty leaves none, with no organization left behind | C4 |
| `test_limits.py` | 1,000 bills at the limits. `/api/bills` answers within the list limit, and `/api/bills/dashboard` within the dashboard's. The query caps hold | Q1, E24 |
| `test_layout.py` | `bills/` imports only `crm/tables.py` of the first areas, and nothing names it but `main.py`, `cli.py` and the migrations | Layout rules |
| `test_delete.py` | The areas give exactly one hold, the bills' on organizations | D4 |
| `test_every_route.py` | Picks up the six bills routes, so each refuses anyone not signed in, refuses ids that can't be records and unstorable text in every field | Security, U7 |
| `test_search.py` | A bill's number finds nothing | K1 |

### Unit tests: frontend (Vitest)

| File | What it proves | Requirements |
|---|---|---|
| `components/DataTable.test.tsx` | A table with a `rowAction` and `onDelete` draws Edit, the action and Delete, each labeled with the row's name. With `filterNote`: none under the filter shows its message and a button that shows All. A search with no matches shows "No unpaid bills match "acme".", Clear search, and when rows match under All, how many and the button. Clearing the search leaves the filter as it was. Without either, the existing tests pass unchanged | E13, E15 |
| `components/RecordLayout.test.tsx` (new) | An action and Delete together, in that order after Edit. Delete alone and an action alone draw as they do today | E18 |
| `bills/status.test.ts` | Unpaid, overdue and paid from the due date, the paid date and today: due today is unpaid, due yesterday overdue, a paid bill never overdue | E8 |
| `bills/BillForm.test.tsx` | Add fills in today and 30 days on, and the due date follows a changed bill date until it's typed in, across a month's end and Feb 29. Edit keeps the saved due date. The total shows as the amounts are typed. Each required field's message, and the date and paid date checks, before sending. A number the supplier already has shows beside the number. The picker says "No organizations match." and offers no Add. Amounts go as whole cents, and Paid on blank goes as null. Save sends once. A failed save keeps what was typed. Add bill on an organization fills in the supplier | E2 to E7, E11, E16, F2, F10, F11 |
| `bills/pages/Bills.test.tsx` | Columns, totals with cents, category swatches and status chips. It opens on Unpaid, sorted by due date with overdue ones first, and the counts include overdue ones in Unpaid. Each filter, kept in the address. A bill turns overdue when the clock passes midnight, with no new read. Mark paid opens the dialog with today, sends the date once and says so. Mark unpaid says so, and Undo puts back the date. The row leaving the table moves focus to the search box. Delete asks first with E17's words. Each empty state, a failed read, and Try again | E8 to E10, E13 to E15, E17, N6 |
| `bills/pages/Bill.test.tsx` | The bill number, supplier link, status chip, total at the headline size, amount and tax, category, the three dates or "Not paid yet", the notes or "No notes.", and who added and last changed it. Mark paid and Mark unpaid stay on the page. Delete returns to Bills. `/bills/abc` and a missing id say "This bill no longer exists" | E18, R6, N4 |
| `bills/BillsPanel.test.tsx` | Unpaid bills first, earliest due first, then paid ones, newest first. The line saying what's unpaid and overdue. Add bill fills in the supplier. "No bills from this organization." | E19 |
| `bills/charts/MoneySection.test.tsx` | What we owe and Overdue with cents and counts, linking to Bills under Unpaid and Overdue. The timeline's total and count, bills on one day stacked, and its table. The spending chart's months, stacks in the categories' order, legend, "so far", and its table. Each empty state. The figures read again when the day passes the reply's `today` | E20 to E23, H8 |
| `App.test.tsx`, `main.test.tsx` | Seven sections in order, Bills last. `/bills` and `/bills/:id` open their pages. The organization's page has the Bills panel, and the dashboard the Money section below its own part | N1, N2, R7, H10 |
| `layout.test.ts` | Unchanged. It finds `bills/` by its `queries.ts`, and holds it to importing only `crm/queries.ts`, `crm/deals.ts` and `products/queries.ts` of the first areas | Layout rules |
| `colors.test.ts` | Unchanged. It keeps the category colors in `styles.css` | Color tokens |

### End-to-end tests (Playwright Test)

Every test fails on any console error it didn't name in advance, and on any request outside the computer, which covers Q2 and C2 on the new screens.

| Test | What it proves | Requirements |
|---|---|---|
| `bills.spec.ts`: a bill can be added, edited, marked paid and unpaid, and deleted | Add a bill from Bills for a supplier, with `1,240` and tax `110.05`, and see the total `$1,350.05` in the form, the table and on its page, with the due date 30 days on. Edit its due date. Mark it paid on an earlier date from its row, and see it under Paid with that date. Mark it unpaid, then Undo, and the date is back. Mark it unpaid again, then delete it from its page | Success criterion 2, E4, E5, E9, E10, E17 |
| `bills.spec.ts`: a number can't be used twice for one supplier | "inv-0042" beside "INV-0042" from the same supplier shows the message beside the number, and the same through the API gives the 422. Another supplier can use it | Success criterion 4, E3 |
| `bills.spec.ts`: overdue in the list and on the dashboard | A bill due yesterday shows Overdue in the table, under the Overdue filter and on its page. Its total is in Overdue and What we owe on the dashboard, and the Overdue figure opens Bills under Overdue | Success criterion 5, E8, E13, E14, E21 |
| `bills.spec.ts`: the Money section matches the bills | On an emptied database, bills added through the API, due yesterday, today, in 30 days and in 31, one paid and one with tax. What we owe, Overdue and Due in the next 30 days show exactly their sums, and the spending chart's table shows each month's totals by category | Success criterion 3, E20 to E23 |
| `bills.spec.ts`: an organization's bills | The Bills panel lists its bills with what's unpaid. Add bill there fills in the supplier. Deleting the organization says it has bills and offers only Close | E2, E19, D4 |
| `bills.spec.ts`: the table keeps its view | Search, sort, filter and page survive opening a bill and coming back. The empty states for no unpaid bills and for a search that matches only under All | E14, E15, T4 |
| `bills.spec.ts`: who added and changed | A bill added as one teammate and marked paid as another shows both lines on its page | E12, R6 |
| `data.spec.ts` | After seed, Bills shows unpaid bills, overdue ones among them, and the Money section has figures in every part. After empty, Bills invites the first bill, the Money section shows its empty states, and the first bill can be added | Success criterion 6, M3, C4, C5 |
| `start.spec.ts` | The top bar links to seven sections, Bills among them, and each one's link shows as current | N1 |
| `quality.spec.ts` | Tab reaches the Bills link, the filter's buttons and a row's Mark paid button, each with a focus ring. The top bar stays on one line at 1280 by 720 | Q3, N1, N3 |
| `failures.spec.ts` | A failed read on Bills and a bill's page says so and offers Try again. `/bills/abc` and a missing id say the bill no longer exists. A failed Mark paid leaves the bill unpaid and says so. A double click in the Mark paid dialog marks it once, with no error | N4, N6, E9, F10 |
| `menu.spec.ts` | The theme holds on Bills. The contrast sweep passes in both modes on Bills under All, an overdue bill's page and the Money section | L1, L5 |
| `stress.spec.ts` | Bills opens in under a second with 1,000 bills, and the Money section's data arrives in under 200ms | Q1, E24 |
