# Plan: the books

This plan turns the books intent, and the spec already updated on this branch, into build work: which files change, in what order, what could go wrong and how we'll know it works. Ids such as J5 and B25 are the spec's requirements. The intent wins over the spec, and the spec wins over this plan. If the build shows the spec is wrong, fix the spec in the same change and say so in `docs/STATUS.md`.

The plan ends with the build. ui-check, the review and `docs/IMPROVE.md` come after it, and so does the walk on Supabase.

There's no new dependency. Everything is SQLAlchemy Core, FastAPI and Pydantic on the backend, and React, React Router, Radix's dropdown menu and lucide-react on the frontend, all already in use.

## Files that change

### What the parts agree on

**Tables** (J3, J4, [backend.md](../../specs/backend.md#data-model))

- `journal_entries`: `id`, `entry_date`, `kind`, `source_id`, `event`, `link`, `reverses_id` (self foreign key, unique), `created_by` (foreign key to users, blank for the migration's), `created_at`. No `updated_at`.
- `journal_lines`: `id`, `entry_id` (foreign key, no delete rule), `account`, `debit_cents`, `credit_cents`, `created_at`, with check constraints keeping `account` to the twelve keys and exactly one of the two amounts above 0. Both tables take `TABLE_OPTIONS` from `db.py`, so ids are never reused.
- Indexes: `journal_entries (entry_date)`, `(kind, source_id)`, unique `(reverses_id)`, and `journal_lines (entry_id)`, `(account)`. Migration `0012` turns on row-level security for both on Postgres, as `0009` does, so the startup check passes.

**Posting, between the backend's files** (J3 to J8, J11)

- `books/accounts.py` holds the chart: the twelve keys, their names and types, which side is usual, and `expense_for(category)`. Nothing else names an account's key.
- `books/post.py` holds the core and the helpers. The core, `post(conn, *, on, kind, source_id, event, link, lines, user, now)`, drops lines of 0, writes nothing if none are left, refuses an entry whose debits and credits differ by raising before it writes, and gives the new entry's id. `reverse(conn, *, kind, source_id, event, user, now)` finds the one entry of that kind and source that nothing has reversed yet, writes the same lines with the sides swapped, on the same date, with `reverses_id` set, and does nothing if there's none open. The helpers are one for each thing an area does to money: `invoice_issued`, `payment_recorded`, `bill_added`, `bill_paid` and `opening_balance`. Each takes plain values, the record's id, its date, its amounts in cents and, for a bill, its category key, and builds the lines and the link (`/invoices/7`, `/bills/12`, a payment's being its invoice's, and `/settings`). `books/` never imports another area, and no area hands it a table or a row.
- Who knows what changed stays with the area. The invoices' routes post as they act. `bills/books.py` takes a bill before and after a save and does what J6 says: reverse and repost the bill's entry when the amount, tax, category or bill date changed, handle the paid entry as marked paid, marked unpaid, or its date or total changed, and post nothing otherwise. `company/router.py` compares the opening balance's two columns before and after, and posts `opening_balance_set`, `opening_balance_changed` or `opening_balance_cleared`.
- The person is the one the routes already take from the token, passed down as `user`. The settings' `updated_by` is that person. The migration's and nothing else's entries have none.

**Reads** (J12, [API](../../specs/backend.md#api))

- `GET /api/books/balances?on=`, `GET /api/books/months?from=&to=` and `GET /api/books/entries?account=&from=&to=&limit=&offset=`, as the spec's API table has them. Balances and totals are `api.CentsSum`, so they travel as strings of digits. An entry's lines carry numbers.
- Every account's balance is its debits less its credits, or the other way for a liability, equity or revenue, so the sign rule is in one place, `books/accounts.py`.
- Months are given as `2026-12`, as the cash flow's `month` parameter is, with the same check. The 60-month limit and `from` after `to` are 422s with a message beside the field, and `books/schemas.py` holds `FIELD_MESSAGES` for `on`, `from`, `to`, `account` and `limit`.

**Frontend, between files** (J15, J16)

- `books/links.ts` gives `ACCOUNTING_LINKS`, four `{label, to}` pairs. `App.tsx` passes them to `Shell` as `menuLinks`, a list of groups, `[{label: "Accounting", links: [...]}]`, and `Shell` hands them to `UserMenu`, so `components/` names no area.
- `books/AccountingPage.tsx` takes `title` and `report` and draws the page, so the wording of "This report is coming soon." is in one place. The four pages in `books/pages/` are each one call to it, with the sentence from J16.
- No query, no read of the backend. The pages need no `queries.ts`.

### Docs

| File | Change |
|---|---|
| `docs/spec.md`, `docs/specs/*.md` | Already updated on this branch. The build adds whatever it settles |
| `docs/STATUS.md` | The books added to what's done, at the end. Under Clear the sample data, `journal_lines, journal_entries` join the one `truncate`, and its words say the books are cleared with the records. The run instructions mention the Accounting pages in the menu and that the books are filled in by the first start after this change |

### Backend: new files

| File | What it holds |
|---|---|
| `backend/accountable/books/__init__.py` | Empty |
| `backend/accountable/books/tables.py` | The two tables and their constraints and indexes, and `RECORDS = (journal_entries,)`, so seed and empty count entries |
| `backend/accountable/books/accounts.py` | The chart, the usual side of each and the balance sign rule (J1, J2) |
| `backend/accountable/books/post.py` | `post`, `reverse` and the five helpers above (J3 to J8) |
| `backend/accountable/books/schemas.py` | The three replies' models, the entry and line shapes, and `FIELD_MESSAGES` |
| `backend/accountable/books/router.py` | The three `GET` routes. Balances are one grouped query, months one grouped query over the range plus one for the balance before it, folded into months in Python, and entries three queries: the page, the count and the lines of the page's entries. No route writes, so `POST`, `PATCH` and `DELETE` get FastAPI's 405 (J12, J14) |
| `backend/accountable/bills/books.py` | What a bill's save posts, from the bill before and after (E25, J6) |
| `backend/accountable/migrations/versions/0012_books.py` | Creates the two tables with row-level security on Postgres, then posts the entries for the records that already exist (J9): in a fixed number of queries it reads the issued and void invoices, the payments, the bills and the opening balance with lightweight table definitions of its own, so the migration doesn't change when the app's tables do, and writes entries with their lines in bulk. A void invoice gets its issue entry and a reversal dated the same, drafts get none, a paid bill gets a paid entry, and every entry has no one recorded. Downgrade drops the tables |
| `backend/tests/test_books_checks.py` | The four checks (J11). Written once, and no later change may edit it |
| `backend/tests/test_books.py` | The postings and reversals through the API (J3 to J8) |
| `backend/tests/test_books_reads.py` | The three reads (J12) |

### Backend: existing files

| File | Change |
|---|---|
| `backend/accountable/main.py` | The books' `Area(routers=[books_router.router], messages=books_schemas.FIELD_MESSAGES)`. It posts nothing itself, and gives no holds, cash or search kinds |
| `backend/accountable/invoices/routers/invoices.py` | `_issue` calls `books_post.invoice_issued` after its update, inside the same transaction, with the issue date, subtotal, tax and total it has just worked out. `void_invoice` calls `reverse` for the invoice. A draft's save, issue refusals and `delete_draft` post nothing |
| `backend/accountable/invoices/routers/payments.py` | `record_payment` posts `payment_recorded` after its insert, with the new payment's id read back from the insert, and `delete_payment` reverses the payment's entry before the delete |
| `backend/accountable/bills/router.py` | `add_bill` posts `bill_added`, and `bill_paid` too when added with a paid date. `edit_bill` calls `bills/books.py` with the bill before and after, only when something changed. `delete_bill` reverses the bill's entry and its paid entry. The returning id is already there for the add |
| `backend/accountable/company/router.py` | `save_settings` posts the opening balance's entries, from the saved and the new values, inside its transaction (B25) |
| `backend/accountable/invoices/sample_data.py` | `_write` posts the issue entry for an issued or void invoice, the reversal for a void one, and each payment's entry, put down to the teammates who issued and recorded them (J9, M7). It reads the payment's id back with `returning` |
| `backend/accountable/bills/sample_data.py` | `fill` inserts the bills with `returning(bills.c.id, sort_by_parameter_order=True)` so each bill's id is known, then posts `bill_added` and, for a paid bill, `bill_paid`, put down to the teammate who added it |
| `backend/accountable/company/sample_data.py` | `fill` posts the sample opening balance's entry, put down to Dana Whitfield |
| `backend/accountable/cli.py` | `RECORDS` gains `books_tables.RECORDS`, so seed and empty count journal entries. `empty`, after the wipe, posts the opening balance's entry again from the settings it left (J10). The wipe already reaches the new tables, taken from the metadata, and `fill_sample`'s order is unchanged, because each area posts its own entries |
| `backend/accountable/migrations/env.py` | Imports `books/tables.py` and asserts it shares the metadata |
| `backend/tests/limits_data.py` | Posts entries for the invoices, payments, bills and opening balance it writes, so the books' reads are timed on real figures, through the same `books/post.py` |

### Frontend: new files

| File | What it holds |
|---|---|
| `frontend/src/books/links.ts` | The four labels and addresses (J15) |
| `frontend/src/books/AccountingPage.tsx` | The page: title, panel, Info icon in Cerulean, "This report is coming soon." and the page's sentence, with tokens only (J16, [Accounting pages](../../specs/books.md#accounting-pages)) |
| `frontend/src/books/pages/ProfitAndLoss.tsx`, `BalanceSheet.tsx`, `Journal.tsx`, `AgedBalances.tsx` | One call each to `AccountingPage` |
| `frontend/src/books/AccountingPage.test.tsx` | Below, under Proof |
| `e2e/accounting.spec.ts` | Below, under Proof |

### Frontend: existing files

| File | Change |
|---|---|
| `frontend/src/App.tsx` | The four routes under `/accounting`, `/accounting` redirecting to Profit and loss with `replace`, and `menuLinks` handed to `Shell`. The catch-all route already gives "This page no longer exists" for any other address under it |
| `frontend/src/components/Shell.tsx` | A `menuLinks` prop, handed to `UserMenu`. The nine sections are unchanged |
| `frontend/src/components/UserMenu.tsx` | Takes the groups and draws each as a muted label over its links, between the themes and Company settings, each link an item that navigates and closes the menu. The label and the links have the roles and spacing the spec's [menu screen](../../specs/books.md#accounting-links-in-the-menu) gives |

### Tests: existing files

These state something this change alters, found by searching every test, not only the areas' own:

| File | Change |
|---|---|
| `backend/tests/test_layout.py` | `AREAS` gains `books`, `FIRST_AREAS` gains it, and `OTHERS_MAY_IMPORT` is `company` and `books`. `company/` may import `books/post` and nothing else, where it imported no area, and `books/` imports no area at all. A later area may import `books/`'s `post`, added to `BUILT_ON`. Each rule is a new test as well as the changed constant, so a slip shows |
| `backend/tests/test_every_route.py` | `test_the_routes_were_found` names the three `GET /api/books/...` routes. The security and bad-input checks pick them up from the app's own list, `from` and `to` among the query values |
| `backend/tests/test_cli.py` | The question names journal entries, seed leaves books that balance with the sample opening balance, empty leaves no entry but the opening balance's, and the books still balance after each. `EMPTY` includes the journal's two tables |
| `backend/tests/test_sample_data.py` | Entries are posted for every issued and void invoice, payment, bill and paid bill and the opening balance, none for drafts, put down to the made-up teammates, on every seeding day, the 1st included. The Cash account today equals the cash flow's Cash today (J13) |
| `backend/tests/test_migrations.py` | `0012` run on a database at `0011` with records of every kind, `books/tables.py` compared with the migrations' tables, and Postgres's SQL written out offline with row-level security on both tables, the cents as `BIGINT` and the checks. One head |
| `backend/tests/test_limits.py` | The three books routes join the 200ms reads, with their read caps (balances 1, months 2, entries 3) |
| `frontend/src/components/UserMenu.test.tsx` | The items are now Profit and loss, Balance sheet, Journal, Aged balances, Company settings and Sign out, at lines 86 and 101. The menu is rendered with the groups it's given, and choosing an Accounting link opens its page and closes the menu. The test where the backend can't say who's signed in still shows them |
| `frontend/src/components/Shell.test.tsx` | `Shell` takes `menuLinks`. The bar still has its nine sections and no more |
| `frontend/src/App.test.tsx` | The four routes and the redirect, the menu's links through `App.tsx`, and the unknown address under `/accounting` |
| `frontend/src/layout.test.ts` | `books/` imports no other area, though it has no `queries.ts` to find it by, so the test lists it |
| `e2e/menu.spec.ts` | The menu's items at line 106 gain the four links before Company settings |
| `e2e/data.spec.ts` | After seeding and after emptying, the books balance, and after emptying the opening balance is still in Cash |

## Order of work

Six phases. Each ends with `npm run check:quick` passing, and Phase 6 ends with `npm run check`. Each new test is seen to fail once, by breaking your own copy of the code it covers and then putting your copy back, never through git. `test_books_checks.py` is written in Phase 2, run against everything after, and never edited again. Any by-hand look at the app runs on a temporary database through `ACCOUNTABLE_DB`, never `data/accountable.db`.

### Phase 1: the tables and the posting code

1. `books/tables.py`, `accounts.py`, `post.py`, `schemas.py` with the messages, and the empty `__init__.py`.
2. Migration `0012` with the tables and row-level security, and `migrations/env.py`.
3. `test_books.py`'s first cases, calling `post` and `reverse` through a connection: a balanced entry, a zero line left out, an empty one not posted, an unbalanced one refused, a reversal exactly cancelling and dated the same, a second reversal finding nothing.
4. `test_layout.py`'s changes, so the rules are in place before anything imports `books/`.

Done when `npm run check:quick` passes.

### Phase 2: each event posts, and the four checks

1. `test_books_checks.py`: the four checks as functions that read the tables with SQLAlchemy Core and no `books/` code, and a fixture that runs them after each step of a scenario.
2. Invoices: `_issue`, `void_invoice`, `record_payment` and `delete_payment`, with their cases in `test_books.py`.
3. Bills: `bills/books.py`, then `add_bill`, `edit_bill` and `delete_bill`, with a case for every row of J6 and for a save that changes nothing money-related.
4. The opening balance in `company/router.py`, with its cases: set, changed in its amount and its date, below zero, cleared, unchanged, and $0.00.
5. The scenario for the checks: every kind of change in J5 and J6, one after another, running the four checks after each.

Done when `npm run check:quick` passes.

### Phase 3: the records that already exist, and the commands

1. The backfill in `0012`, with its migration tests on a database at `0011` holding issued, void and draft invoices, part and fully paid ones, paid and unpaid bills and an opening balance, below zero as well.
2. The sample data's postings, in invoices, bills and the company, and `cli.py`'s counts and `empty`'s repost, with `test_sample_data.py` and `test_cli.py`.
3. The four checks on the sample data, the 1st of a month included, and J13: Cash today in the books against the cash flow's.
4. Seed a temporary database and read `GET /api/cash-flow` and the books, to see both Cash figures agree, before writing the reads.

Done when `npm run check:quick` passes.

### Phase 4: the reads

1. `books/router.py`, `main.py`'s area, and `test_books_reads.py`.
2. `test_every_route.py`'s names.
3. `limits_data.py`, then `test_limits.py`, to see the three reads under 200ms in their few reads at the Q1 limits.

Done when `npm run check:quick` passes.

### Phase 5: the Accounting pages

1. `books/links.ts`, `AccountingPage.tsx` and the four pages, with `AccountingPage.test.tsx`.
2. `Shell.tsx`, `UserMenu.tsx` and `App.tsx`, with their tests and `layout.test.ts`.

Done when `npm run check:quick` passes.

### Phase 6: end to end, and finish

1. `e2e/accounting.spec.ts`, and the changes to `menu.spec.ts` and `data.spec.ts`.
2. `e2e/stress.spec.ts` gains the three reads in its 200ms list.
3. Anything the build settled, in the spec files. Then `docs/STATUS.md`, with the run instructions and the clearing SQL.
4. Run `npm run check` until it passes, and read its list of unit tests that took a second or more.

That's the end of this plan. ui-check, the review and `docs/IMPROVE.md` follow.

## Risks

Most damaging first.

1. **The owner's records, or the team's.** Migration `0012` runs on whatever database the app starts on, and nothing takes it back, and it writes entries for every record there. A wrong figure in it is a wrong figure in the books for good, since entries are never changed. It reads each record's own dates and amounts, takes a void invoice's reversal date from the issue date, and runs in one transaction, so a failure leaves the database as it was. `test_migrations.py` runs it on a database with every kind of record, and the four checks run on its result. Nothing here touches `data/accountable.db`: every run and check uses a temporary database.
2. **A record without its entry, or an entry without its record** (success criteria 2 and 3). Every route that changes money posts inside the transaction it already has, under the write lock, and the posting raises if it can't, so the whole save fails. The tests prove it the way it would really happen: a posting forced to fail leaves no record, and the four checks run after every step of a scenario that covers each row of J5 and J6, so a forgotten route shows as a break in a check.
3. **A reversal that doesn't cancel exactly.** `reverse` swaps the lines of the stored entry and copies its date, and never works amounts out again, so it can't drift from the original, a changed tax rate or product included. Each reversal test reads back both entries and compares line by line.
4. **A bill's change posting too much or too little.** J6 has a row for each combination: amount, tax, category or bill date, with and without a paid date, a paid date added, moved or cleared, and the Undo. `bills/books.py` is one function with those cases, kept short, and `test_books.py` has a case for each row, and one for a save that changes only notes, due date, number or supplier, which must post nothing.
5. **The sample data's two Cash figures differing** (success criterion 4). The books count every entry, and the cash flow only those from the opening balance's date. They agree on the sample data only if no sample payment or paid bill is before that date. `test_sample_data.py` checks it on every seeding day, the 1st included, and fails with the first entry before the date if it breaks.
6. **Unit tests over a second.** The checks scenario, the migration test and the sample data tests add many records, so each keeps to the few it needs, and the sample-data tests share one seeded database as the others do. Read the slow list at the end of each `npm test`. All phases.
7. **The layout rule slipping.** `books/` must import no area, and `company/` and the later areas may import only `books/post`. Both are tests, written first, in Phase 1. The frontend's `books/` has no `queries.ts`, which the frontend test finds areas by, so its test lists it by name.
8. **Postgres.** `0012` has to run from empty and on a database with records, with the sequence of the new tables' ids right after bulk inserts, so the backfill lets the database give the ids, through `returning` in order, and never writes its own. Row-level security has to be on for both tables, which the startup check refuses to start without, and the migration test reads the offline Postgres SQL for it. Nothing here runs on Postgres in the tests, so the owner's walk on Supabase proves it.
9. **The menu's tests.** The list of the menu's items is stated in `UserMenu.test.tsx` and `menu.spec.ts`, and the top bar's nine sections must stay nine in the files that count them. A keyboard test covers the new group, so the focus ring and Escape still work.
10. **Reads at the limits, and round trips to Supabase.** The balances, months and entries each take a fixed few reads, however many entries there are, grouped in the database by day and account. `test_limits.py` checks the reads and the time at the Q1 limits with entries from `limits_data.py`, whose posting must itself stay quick, so it posts in one transaction and is read for its time when the limits' data is built. Phases 4 and 6.
11. **Money past 2^53 cents.** Balances and totals are `CentsSum`, strings of digits, and a test sends sums past 2^53. No frontend reads them yet, so no BigInt work is needed until the reports.
12. **The opening balance's repost after empty.** `empty` leaves the settings and wipes the journal, so without the repost, Cash would lose its opening balance and the books would disagree with the cash flow. The repost is in `cli.py`, with a test that empties twice and checks Cash stays the same.
13. **Spec claims that no test tries.** The spec says entries are never changed or deleted, nothing is stored apart from entries, the four checks hold after every change, a failed posting leaves nothing, the pages read nothing, and the reads arrive in under 200ms. Each has a test below. All phases.

## Proof

`npm run check` runs everything below and fails if anything fails. The existing tests must still pass, with only the changes listed under [Tests: existing files](#tests-existing-files).

The intent's success criteria:

1. `npm run check` passes, at the end of Phase 6.
2. Every invoice issued, payment, void, bill, bill paid and opening balance has exactly the entries in the intent, and a reversal cancels its entry exactly: `test_books.py`, with the exact lines, dates and events of each, and `test_migrations.py` for the records that already exist.
3. Receivable matches the invoices, Payable the bills, and the books balance, on the sample data and after every kind of change: `test_books_checks.py`, run on the sample data and after each step of the scenario.
4. On a fresh copy, the ledger's Cash today equals the cash flow's: `test_sample_data.py` and `e2e/accounting.spec.ts`.
5. The Accounting section is in the menu with its four pages, each saying what's coming: `UserMenu.test.tsx`, `AccountingPage.test.tsx`, `e2e/accounting.spec.ts`, then by hand at ui-check.

### Unit tests: backend (pytest)

| File | What it proves | Requirements |
|---|---|---|
| `test_books_checks.py` (new, never edited later) | The four checks, read from the rows and not through the posting code: every entry balances, the books as a whole balance, Receivable equals what issued invoices say is still owed, Payable equals the unpaid bills' total. Each runs on the sample data, and after every step of one scenario: an invoice issued with and without tax, part paid, paid, a payment deleted, voided, a bill added unpaid and paid, changed in each of its amount, tax, category, bill date and paid date, marked paid and unpaid, deleted unpaid and paid, the opening balance set, changed in amount and in date, below zero, cleared, and saves that change nothing money-related | J11 |
| `test_books.py` (new) | The core: a balanced entry, lines of 0 left out, an empty entry not posted, an unbalanced one refused with nothing written, a reversal's swapped lines and same date, a reversal found once and never twice, a reversal of a reversal absent | J3, J6 |
| `test_books.py` | Each event's exact lines, date, kind, source, event and link: an issued invoice's three lines and an untaxed one's two, a payment's and its link to its invoice, a bill in each of the six categories with tax in the expense, a paid entry on the paid date, the opening balance and an overdrawn one with the sides swapped, a $0.00 opening balance posting nothing | J4, J5 |
| `test_books.py` | Reversals through the routes: void, payment deleted, bill unpaid, bill deleted unpaid and paid, a bill changed in each field in J6 and its paid entry reposted when the total or the paid date changed, the Undo posting a new paid entry on its old date, opening balance changed and cleared, each dated as the entry it reverses | J6 |
| `test_books.py` | Nothing posted for a saved or deleted draft, a quote, a bill's notes, due date, number or supplier, or a settings save that leaves the opening balance as it was | J5, J6 |
| `test_books.py` | The same transaction: a posting forced to fail leaves no record and no entry, for an issue, a payment, a void, a bill's add, edit and delete, and the settings, and a refused save leaves no entry. Twenty payments and bills at once keep the four checks | J7 |
| `test_books.py` | Who made each change, from the token whatever the request says, the settings' saver for the opening balance, and no one for the migration's. No function in the backend, apart from seed, empty and the clearing steps, updates or deletes a journal row, and `POST`, `PATCH` and `DELETE` to `/api/books/...` get a 405 | J6, J8 |
| `test_books_reads.py` (new) | With today fixed and a small dataset with known answers: every account's balance on a day, an entry dated that day counted and the next day's not, a reversal cancelling in its own month, the sign of each account's type, a balance below zero, months with nothing, a range across the turn of a year, the default 12 months, 60 months and 61, `from` after `to`, a bad month, date, limit and account refused with messages | J2, J12 |
| `test_books_reads.py` | The entries behind a figure add up to it: a balance on a day, a month's debits and credits, an account's filter keeping every line of each entry, newest first then by id, `limit` and `offset` and the total, each entry's link and its reversal pointing both ways, a deleted record's entries still there, and sums past 2^53 cents sent as exact digits | J4, J12 |
| `test_sample_data.py` | Entries for each issued and void invoice, payment, bill, paid bill and the opening balance, none for drafts, put down to the made-up teammates, on every seeding day. The four checks hold. The Cash account today equals the cash flow's Cash today to the cent, and no sample payment or paid bill is before the opening balance's date | J9, J13, M3, M7 |
| `test_cli.py` | The question counts journal entries. Seed leaves balanced books with the sample opening balance. Empty leaves only the opening balance's entry, its Cash the settings', run twice with the same result, and the clearing never leaves an orphan line | J10, C4 |
| `test_migrations.py` | `0012` on a database at `0011` with every kind of record gives the right entries with no one recorded, a void invoice's reversal dated like its issue, none for drafts, and the four checks hold, a database with none of them gets none, and it takes the same number of queries for 5 records as for 50. The tables match `books/tables.py`, the checks and unique index hold, Postgres's offline SQL has row-level security on both tables and `BIGINT` cents, and there's one head | J9, Data model |
| `test_layout.py` | `books/` imports no area, `company/` imports only `books/post`, a later area may import only `books/post`, and nothing but `main.py`, `cli.py` and the migrations names `books/` as a folder | Layout rules |
| `test_every_route.py` | Picks up the three routes, so each refuses anyone not signed in, a wrong host and a NUL in a value | Security, U7 |
| `test_limits.py` | The three reads within 200ms at the Q1 limits, in 1, 2 and 3 reads of the database | Q1, J14 |

### Unit tests: frontend (Vitest)

| File | What it proves | Requirements |
|---|---|---|
| `books/AccountingPage.test.tsx` (new) | Each of the four pages through its address: its title, "This report is coming soon." and its own sentence from J16, an Info icon, no button, figure or table, and no request to the backend. No section is marked current, and the top bar still has its nine | J15, J16 |
| `components/UserMenu.test.tsx` | The items in order: the four Accounting links, Company settings and Sign out, with "Accounting" as a label in muted ink between the themes and Company settings, the arrow keys moving through them, Escape closing with focus back on the button, choosing a link opening its page and closing the menu, and the same when the backend can't say who's signed in | N7, J15 |
| `components/Shell.test.tsx` | `Shell` gives `UserMenu` the groups it's handed, and the nine sections are unchanged | N1 |
| `App.test.tsx` | The four routes, `/accounting` opening Profit and loss, an address under `/accounting` that isn't a page giving "This page no longer exists" with the top bar, and the menu's links coming from `App.tsx` | J15, N4 |
| `layout.test.ts` | `books/` imports no other area, and only `App.tsx` names it | Layout rules |
| `colors.test.ts` | Unchanged. It keeps the pages to tokens | Color tokens |

### End-to-end tests (Playwright Test)

| File | What it proves | Requirements |
|---|---|---|
| `e2e/accounting.spec.ts` (new) | The menu has Accounting with its four links in order, and each opens its page with its title and words, in light and dark mode, reached by keyboard with the focus ring, `/accounting` landing on Profit and loss, an unknown address under it giving N4's message, the top bar's nine sections and no console error. Through the app it issues an invoice, records and deletes a payment, adds and pays a bill, changes it and deletes it, and after each reads `/api/books/balances` and finds Receivable and Payable as the records say and the books balanced, and on a fresh copy finds the Cash account's balance today equal to the cash flow's Cash today | J5 to J7, J13, J15, J16 |
| `e2e/menu.spec.ts` | The menu's items gain the four links before Company settings | N7 |
| `e2e/data.spec.ts` | After seed the books balance, and after empty they hold only the opening balance's entry | J10, C4 |
| `e2e/stress.spec.ts` | The three books reads in under 200ms at the Q1 limits, the median of five | Q1, J14 |
