# Plan: the journal

This plan turns the journal intent, and the spec already updated on this branch, into build work: which files change, in what order, what could go wrong and how we'll know it works. Ids such as J17 and V33 are the spec's requirements. The intent wins over the spec, and the spec wins over this plan. If the build shows the spec is wrong, fix the spec in the same change and say so in `docs/STATUS.md`.

The plan ends with the build. ui-check, the review and `docs/IMPROVE.md` come after it.

There's no new dependency. The backend is SQLAlchemy Core, FastAPI and Pydantic. The frontend is React, React Router, TanStack Query's `useInfiniteQuery`, Recharts and lucide-react, all already in use. Loading on scroll uses the browser's `IntersectionObserver`, which needs no package.

## Files that change

### What the parts agree on

**Two new columns** (J4, [backend.md](../../specs/backend.md#data-model))

- `journal_entries.description` (text, required) and `journal_entries.document` (text, blank for the opening balance). Migration `0013` adds both, fills them in for the entries already there, then makes `description` required. No other column changes, and no index is added on them: the search is a contains-match on a page-sized filter of at most a few thousand rows, and an index can't serve it.
- The wording lives in one place, `books/describe.py`: `describe(event, document, supplier=None)` gives the sentence in J4's table. `post` calls it, so no caller writes a sentence. Callers pass what only they know: `document` (an invoice's number, a payment's invoice's number, a bill's number) and, for `bill_added`, the supplier's name. `reverse` copies `document` from the entry it reverses and describes the reversal from its own event, so no reversing caller changes. A reposted bill entry (`bill_changed`) takes the bill's number as it is after the save.
- Migration `0013` writes the same wording in SQL of its own, with one `UPDATE` for each kind of entry, from lightweight table definitions of its own, as `0012` does, so it doesn't change when the app does. An entry whose record has gone gets its event's wording and no document (J9). A test fills a seeded database's columns with the migration's own function after blanking them and checks the result equals what posting wrote, so the two wordings can't drift.

**Reads** ([API](../../specs/backend.md#api), J12, J18)

- `GET /api/books/entries` gains `q`, `kind` and `source_id`. `q` reuses the top bar's matching, so ignoring case in any language and the `%` and `_` rule (K2) are the same code: `search.py`'s private `_holding` becomes the public `holding`. `kind` and `source_id` come together or are a 422, and `kind=bill` also takes `bill_payment`. With them, entries come oldest first, otherwise newest first by date, then id, as now. Each entry also gives `description` and `document`.
- `GET /api/books/accounts/{key}/ledger?limit=&offset=` is new. One query ranks the account's lines by date, entry id and line id, and sums them in a window, `sum(...) over (order by ...)`, signed by J2's rule for the account's type, in the database. The page is cut from that, newest first, and the account's balance is the newest line's running balance (or 0). So a later page has the same balances as the first, and the cost is one pass over the account's lines whatever the page. A second query counts the lines. `journal_lines (account, entry_id)` is a new index so the pass doesn't scan every line. The sums are `CentsSum` strings, as the other books reads' are.
- `books/accounts.py` stays the one place the sign rule is written. The ledger asks it for the sign, and the window sums `debit - credit` or `credit - debit` from it.

**Frontend, between files** (J17 to J21)

- `books/queries.ts` holds the types and the reads: `useEntries(filters)` and `useLedger(key)` on `useInfiniteQuery` at 100 a page, `useRecordEntries(kind, id)` for a panel, and `useAccountMonths(key)` for the chart, from the existing `/books/months`, and its sums are read as BigInt where they are added or compared. Keys include the day, as other reads do.
- The Journal's filters are the address's query string, read and written with `useAddress`, so refresh and back keep them (N2). The search box keeps its typed text and writes `q` after a 150ms pause, and a reply to an older search never replaces a newer one.
- `books/EntryList.tsx` draws entries and is the only place an entry's layout is written: the Journal, the panels use it. `books/AccountLink.tsx` is an account's name as a link to `/accounting/accounts/:key`.
- `books/AccountingPanel.tsx` takes a `kind` and an id and is the one thing outside `books/` the invoice and bill pages import. That changes the layout rule on both sides. On the backend `books/` is already importable. On the frontend `layout.test.ts` now lets every area import `books/AccountingPanel` and nothing else of `books/`, and `books/` still imports no area.
- `books/useLoadMore.ts` returns the sentinel's ref and a `loadMore` for the button, and loads the next page when the sentinel comes within a screen of the view. Under jsdom, which has no `IntersectionObserver`, the button is the way, and tests stub the observer for the scroll path.
- `books/charts/BalanceChart.tsx` is a Recharts `ComposedChart` with an `Area` and a `Line`, built from `ChartTooltip`, `useSize` and `axes`, in the tokens, dashed for this month with the ringed dot, as the revenue chart does (Charts in [visual-design.md](../../specs/visual-design.md#charts)). It takes numbers for heights, and the tooltip's and the table's figures are exact.

### Docs

| File | Change |
|---|---|
| `docs/spec.md`, `docs/specs/*.md` | Already updated on this branch. The build adds whatever it settles |
| `docs/STATUS.md` | The journal added to what's done, at the end. The run instructions mention the Journal under Accounting, the ledgers, the panels, and that the first start after this change fills in the entries' descriptions |

### Backend: new files

| File | What it holds |
|---|---|
| `backend/accountable/books/describe.py` | The sentence for each event (J4) |
| `backend/accountable/migrations/versions/0013_journal_wording.py` | Adds `description` and `document`, fills them in with SQL of its own, makes `description` required, adds the `journal_lines (account, entry_id)` index. Downgrade drops them |
| `backend/tests/test_books_journal.py` | The journal's reads: the entries' filters and search, the panel's selection by record, and the ledger |

### Backend: existing files

| File | Change |
|---|---|
| `backend/accountable/books/tables.py` | The two columns and the index |
| `backend/accountable/books/post.py` | `post` takes `document` and an optional `supplier` and writes `description` through `describe`. The helpers take them: `invoice_issued(..., number)`, `payment_recorded(..., number)`, `bill_added(..., bill_number, supplier)` and `bill_paid(..., bill_number)`. `reverse` copies the document and writes the reversal's description |
| `backend/accountable/books/schemas.py` | `Entry` gains `description` and `document`. New `Ledger` and `LedgerLine` replies, the `kind` and `q` parameters and their messages. `FIELD_MESSAGES` gains `kind`, `source_id` and `q` |
| `backend/accountable/books/router.py` | `entries` takes `q`, `kind` and `source_id` and the order that goes with them. The ledger route and its query |
| `backend/accountable/search.py` | `_holding` becomes `holding`, with its callers |
| `backend/accountable/invoices/routers/invoices.py` | `_issue` passes the invoice's number, which it has just taken |
| `backend/accountable/invoices/routers/payments.py` | `record_payment` passes the invoice's number |
| `backend/accountable/invoices/sample_data.py` | Passes the number to the issue and payment postings |
| `backend/accountable/bills/books.py` | `added` and `changed` pass the bill number, and `added` the supplier's name |
| `backend/accountable/bills/router.py` | `add_bill` looks up the supplier's name for the entry, with the one query it already makes for the organization where it can |
| `backend/accountable/bills/sample_data.py` | Passes the bill number and the supplier's name |
| `backend/accountable/company/router.py`, `backend/accountable/company/sample_data.py`, `backend/accountable/cli.py` | No change to what they pass: the opening balance has no document. Their calls are checked, not edited |
| `backend/tests/limits_data.py` | Passes the numbers the new signatures need |

### Frontend: new files

| File | What it holds |
|---|---|
| `frontend/src/books/queries.ts` | The types and reads above |
| `frontend/src/books/EntryList.tsx` | The entries, as the [Entries screen](../../specs/books.md#entries) describes: heading, Debit and Credit columns, totals, the Reversal and Reversed chips |
| `frontend/src/books/AccountLink.tsx` | An account's name as a link to its ledger |
| `frontend/src/books/AccountingPanel.tsx` | The panel for one record (J19), with its empty and failed states and Try again |
| `frontend/src/books/useLoadMore.ts` | Loading on scroll, and the Load more button's handler |
| `frontend/src/books/charts/BalanceChart.tsx` | One account's balance by month |
| `frontend/src/books/pages/Journal.tsx` | Replaces the placeholder: the toolbar and the entries in pages |
| `frontend/src/books/pages/Ledger.tsx` | The account's header, chart and lines, and the message for an unknown key |
| `frontend/src/books/EntryList.test.tsx`, `AccountingPanel.test.tsx`, `charts/BalanceChart.test.tsx`, `pages/Journal.test.tsx`, `pages/Ledger.test.tsx`, `useLoadMore.test.tsx` | Below, under Proof |
| `e2e/journal.spec.ts` | Below, under Proof |

### Frontend: existing files

| File | Change |
|---|---|
| `frontend/src/App.tsx` | The Journal route draws the real page, and `/accounting/accounts/:key` draws the ledger. The catch-all keeps the rest |
| `frontend/src/books/links.ts` | The menu's four links are unchanged. It also gives the ledger's address from a key |
| `frontend/src/invoices/pages/Invoice.tsx` | The Accounting panel at the foot of the left column of an issued or void invoice, and an Accounting button on each payment row that opens that payment's panel under it |
| `frontend/src/bills/pages/Bill.tsx` | The Accounting panel below the notes |
| `frontend/src/books/AccountingPage.test.tsx` | The Journal is no longer one of its pages |

### Tests: existing files

These state something this change alters, found by searching every test, not only the areas' own:

| File | Change |
|---|---|
| `backend/tests/test_books.py` | Every call of `post` and the helpers passes the new values. Each event's exact entry gains its description and document, and each reversal its copied document and own wording |
| `backend/tests/test_books_checks.py` | None. It reads the tables and may not be edited |
| `backend/tests/test_books_reads.py` | The entries' replies gain the two fields |
| `backend/tests/test_migrations.py` | `0013`: the tables match `books/tables.py` at head, the one head is `0013`, the wording equals what posting writes, and the Postgres SQL offline has the columns and the index |
| `backend/tests/test_sample_data.py` | Every sample entry has a description, and every one but the opening balance's has a document that is the number of its invoice or bill |
| `backend/tests/test_cli.py` | Empty's reposted opening balance has its description and no document |
| `backend/tests/test_every_route.py` | `test_the_routes_were_found` names the ledger route, and the new parameters join the bad-input checks |
| `backend/tests/test_limits.py` | The ledger, and the entries with a search and a filter, join the 200ms reads with their read caps |
| `backend/tests/test_layout.py` | No change expected, since `books/` was already importable through `post`. A test shows `books/describe.py` imports nothing but the standard library |
| `backend/tests/test_search.py` | Still passes with `holding` renamed |
| `frontend/src/layout.test.ts` | Areas may import `books/AccountingPanel` and no other part of `books/`, which still imports no area. Each rule is a test of its own |
| `frontend/src/App.test.tsx` | The Journal and ledger routes, an unknown key giving "This account no longer exists", and the other unknown addresses unchanged |
| `frontend/src/invoices/pages/Invoice.test.tsx`, `frontend/src/bills/pages/Bill.test.tsx` | The panel appears, with its read stubbed, and a draft invoice has none |
| `frontend/src/components/UserMenu.test.tsx` | Unchanged and run, since the four links stay |
| `e2e/accounting.spec.ts` | Its Journal case no longer expects "This report is coming soon." |
| `e2e/stress.spec.ts` | The ledger and a filtered, searched page join the 200ms reads |
| `e2e/invoices.spec.ts`, `e2e/bills.spec.ts` | An Accounting panel on an issued invoice, a payment and a bill, after the existing flows, so the panels are exercised through the app |

## Order of work

Six phases. Each ends with `npm run check:quick` passing. Each new test is seen to fail once, by breaking your own copy of the code it covers and then putting your copy back, never through git. `test_books_checks.py` is never edited. Any by-hand look at the app runs on a temporary database through `ACCOUNTABLE_DB`, never `data/accountable.db`. The end-to-end tests are written here and run by the owner with the whole of `npm run check`, since they are slow on this computer; any single one run while building uses `npm run e2e -- <file> -g <name>`.

### Phase 1: the wording

1. `books/describe.py` and its cases in `test_books.py`: a sentence for each event in J4, with and without a document.
2. `books/tables.py`, `post.py` and the helpers' new values. Update every caller: invoices, payments, bills, the three sample data files, `limits_data.py`. `reverse` copies the document.
3. Migration `0013`, with its fill as a function the test can call.
4. The changed existing backend tests, then `test_migrations.py` for `0013`: run on a database at `0012` with every kind of entry, and the fill equal to what posting writes on a seeded database with the columns blanked.

Done when `npm run check:quick` passes, with `test_books_checks.py` unedited and passing.

### Phase 2: the reads

1. `search.py`'s `holding`.
2. `entries`' `q`, `kind` and `source_id`, with `test_books_journal.py`'s cases for each and for them together.
3. The ledger route, with its cases checked against a running balance worked out by hand for an account of each type, and against `/books/balances`.
4. `test_every_route.py`, `limits_data.py` and `test_limits.py`. Read the ledger's and the search's time at the Q1 limits before moving on, since the frontend relies on them.

Done when `npm run check:quick` passes.

### Phase 3: entries, accounts and panels in the frontend

1. `books/queries.ts`, `useLoadMore.ts` and `AccountLink.tsx`.
2. `EntryList.tsx` and its tests: columns, totals, the marks, the empty side left blank, and the heading row.
3. `AccountingPanel.tsx` and its tests, then the invoice and bill pages, then the payment row's button. `layout.test.ts` is changed first, so the rule is in place before anything imports the panel.

Done when `npm run check:quick` passes.

### Phase 4: the Journal and the ledger

1. `pages/Journal.tsx`: the toolbar, the address as the filters' one source, the pages, Load more, and its empty and failed states.
2. `charts/BalanceChart.tsx` and its test.
3. `pages/Ledger.tsx`, the routes in `App.tsx`, and `links.ts`.
4. Run the app on a temporary database with the sample data, and read one account's ledger's last balance beside its balance in `/api/books/balances` for each of the twelve accounts, before writing the end-to-end tests.

Done when `npm run check:quick` passes.

### Phase 5: end to end

1. `e2e/journal.spec.ts`, and the changes to `accounting.spec.ts`, `invoices.spec.ts`, `bills.spec.ts` and `stress.spec.ts`.

Done when `npm run check:quick` passes, and each new end-to-end file lists its tests with `npm run e2e -- --list`.

### Phase 6: finish

1. Anything the build settled goes into the spec files in the same change. Then `docs/STATUS.md`.
2. `npm run check:quick` until it passes, and read its list of unit tests that took a second or more. The owner runs `npm run check`, with the end-to-end and speed tests, on their computer.

That's the end of this plan. ui-check, the review and `docs/IMPROVE.md` follow.

## Risks

Most damaging first.

1. **The owner's records, or the team's.** Migration `0013` runs on whatever database the app starts on, and nothing takes it back. It writes wording and numbers into entries that are otherwise never changed, so a wrong join gives the wrong document on an entry for good. It joins on each entry's kind and source id, runs in one transaction, so a failure leaves the database as it was, and takes the new columns required only once every row is filled. A test runs it on a database with every kind of entry, and one with entries whose records have been deleted.
2. **A ledger that doesn't end at the books' balance** (success criterion 3). The running balance comes from a window over one ordering, and the account's balance is its newest line's. Tests compare it against `/books/balances` for every account on the sample data and on a hand-made set with reversals, a liability, equity and revenue account and an overdrawn Cash, and against a sum worked out line by line. Entries dated after today are in the ledger and not in the default balance on today, so the test uses the latest entry's date for that comparison, which is what the spec says.
3. **Wrong entries in a panel** (criterion 2). The panel selects by kind and source id, a bill's by both of its kinds, and a payment's by its own id. A test reads each record's panel through the app after every kind of change in J5 and J6, and compares it with the rows. The opening balance has source id 1 and kind `opening_balance`, so it can never match an invoice, and the test shows it.
4. **A search that finds the wrong thing or too much** (criterion 4). The search shares the top bar's matching. The tests cover case, accents, `%`, `_` and `/` in the text, a document number inside a longer description, the filters on their own and combined, both ends of the dates, and an empty result.
5. **The Journal staying quick** (Q1, J14). Pages are 100 entries, the ledger is one pass, and the page asks for lines of its entries in one query as now. The speed tests run on the stress data and the unit test on the limits data, and the build reads the times at the end of Phase 2 rather than waiting for Phase 5. A list of many pages is not virtualized, so a hundred pages would be a large page; the sample data has about 230 entries, and the tests load several pages and check the page stays responsive.
6. **Unit tests over a second.** The new backend tests share one seeded database, as the sample data tests do, and the frontend tests stub the reads and the observer. The chart test renders one chart. Read the slow list at the end of each `npm run check:quick`. All phases.
7. **Scroll loading that doesn't load.** jsdom has no `IntersectionObserver`, and a real one fires differently when the list is shorter than the screen. `useLoadMore` loads again after each page while the sentinel is still in view, stops when all are loaded, and the Load more button does the same, so the keyboard and the tests don't depend on the observer. A test stubs the observer to call it, and the end-to-end test scrolls the real one.
8. **The layout rule for the frontend.** Invoices and bills importing `books/` is a change to a rule the tests state. It is limited to `AccountingPanel`, in `layout.test.ts`, written before the import, with a case that fails if any other file of `books/` is imported, or if `books/` imports an area.
9. **Stale panels and lists.** After any write all queries are invalidated, so a panel re-reads when a payment is recorded or a bill changed. The test saves a payment on an invoice and checks the new entry appears without a reload. The payment's panel is read only when opened.
10. **Filters in the address.** A bad value typed into the address, such as a date that isn't a date or an account that doesn't exist, must show the normal empty or message and not a crash or a 500. The backend refuses with a 422 and the page shows its failed-read message, and a test covers a bad `account`, `from` and `to`.
11. **The chart in dark mode and with a negative balance.** Cash can be below zero, and Sea Green under the ink line must still read. The chart uses the existing tokens and is checked in both modes at ui-check, with the zero line shown for a negative balance.
12. **Postgres.** `0013` has to run from empty and with records. The correlated updates are plain SQL that both databases accept, the window function is standard, and nothing relies on SQLite-only behavior. The offline SQL is read in `test_migrations.py`. Nothing here runs on Postgres in the tests, so the owner's walk on Supabase proves it.
13. **Spec claims that no test tries.** The spec says nothing here changes an entry, the totals equal, a reversal comes above the entry it reverses, and the pages show no console error. Each has a test below. All phases.

## Proof

`npm run check` runs everything below and fails if anything fails. The existing tests must still pass, with only the changes listed under [Tests: existing files](#tests-existing-files).

The intent's success criteria:

1. `npm run check` passes at the end of the build, and `npm run check:quick` after each phase.
2. The Accounting panel on an invoice, a payment and a bill shows exactly the entries it made, reversals included: `test_books_journal.py` for the selection, `AccountingPanel.test.tsx`, `Invoice.test.tsx` and `Bill.test.tsx` for the pages, and `e2e/journal.spec.ts`.
3. Each ledger's running balance ends at the account's balance in the books: `test_books_journal.py` for all twelve accounts, `Ledger.test.tsx` for the header equal to the newest line, and `e2e/journal.spec.ts`.
4. The filters and search find the right entries: `test_books_journal.py`, `Journal.test.tsx` and `e2e/journal.spec.ts`.
5. On a fresh copy the Journal, the ledgers and the panels are full and look like they belong: `e2e/journal.spec.ts` on the sample data, then by hand at ui-check.

### Unit tests: backend (pytest)

| File | What it proves | Requirements |
|---|---|---|
| `test_books.py` | The sentence for each event, with and without a document, and the supplier in a bill's first entry; each helper's entry carries its description and document; a reversal copies the document and has its own event's wording; a reposted bill entry has the new number | J4 |
| `test_books_journal.py` (new) | `q`: a part of a description or a document, in any case, with `%`, `_` and `/` meaning only themselves, accents folded as the top bar does, a text over 100 characters refused. `account` keeps every line of each entry. `from` and `to` include both days, alone or together. All of them at once, and the total they give for paging. `kind` and `source_id`: an invoice's issue and its reversal, a payment's, a bill's and its paid entries, with reposts after a change, a deleted bill's, the opening balance not matching an invoice with the same id, oldest first. A `kind` without a `source_id`, the other way round, an unknown kind, a bad date, account or limit: a 422 each | J12, J17, J19 |
| `test_books_journal.py` | The ledger: lines newest first by date, entry and line; running balances equal to sums worked out by hand for an asset, a liability, equity, revenue and an expense account, and an overdrawn Cash; the same balances on page 2 as page 1; the newest equal to `/books/balances` for every account on the sample data; the count; an account with no lines gives 0 and no lines; reversal flags both ways; sums past 2^53 as exact digits; an unknown key a 404, a bad limit a 422; and one query for the lines whatever the page | J2, J12, J18 |
| `test_books_journal.py` | Nothing changes entries: `POST`, `PATCH` and `DELETE` to the ledger and entries get a 405 | J6 |
| `test_migrations.py` | `0013` on a database at `0012` fills each kind and reversal in J4's wording, a payment's document being its invoice's number, and gives an entry whose record has gone the event's wording and no document; it takes the same number of queries for 5 entries as for 50; the fill equals what posting writes; the columns and index are in the tables and in the offline Postgres SQL; one head | J4, J9 |
| `test_sample_data.py` | Every sample entry has a description, and every entry but the opening balance's has the number of its invoice or bill | J22 |
| `test_cli.py` | An emptied copy's opening balance entry has its description and no document | J10 |
| `test_every_route.py` | Picks up the ledger route, so it refuses anyone not signed in, a wrong host and a NUL in a value, and the new parameters take the bad-input checks | Security, U7 |
| `test_limits.py` | A page of entries with a search and an account filter, and a page of a ledger, within 200ms at the Q1 limits, in their fixed reads | Q1, J14 |
| `test_layout.py` | `books/describe.py` imports nothing outside the standard library, and `books/` still imports no area | Layout rules |

### Unit tests: frontend (Vitest)

| File | What it proves | Requirements |
|---|---|---|
| `books/EntryList.test.tsx` (new) | A line's amount in its own column and the other left empty, the totals under the columns equal, money with currency, the Reversal and Reversed marks, account and document links, the opening balance's link to settings, the who-and-when line shown in the Journal and not in a panel, and the column headings for a screen reader | J17, J19 |
| `books/AccountingPanel.test.tsx` (new) | Oldest first, "No entries." when empty, a failed read in the panel with Try again that leaves the rest of the page, a reread after a write, and a payment's panel read only when opened | J19, J21 |
| `books/pages/Journal.test.tsx` (new) | Newest first, the count, the filters and search written to the address and read from it, a search on a pause of 150ms and an old reply not replacing a newer one, Clear filters only while one is set, "No entries match." and "No entries yet.", a failed read with Try again keeping the list, the next page on the observer and from Load more, no page read twice, and a changed filter starting again from the top | J17, J20, J21 |
| `books/pages/Ledger.test.tsx` (new) | The name and type, the header balance equal to the newest line's, the Debit, Credit and Balance columns, a negative balance with a minus sign, the chart's table, the empty account, the next page, and an unknown key giving "This account no longer exists" with the link back | J18, J21 |
| `books/charts/BalanceChart.test.tsx` (new) | Twelve months, this month marked "so far", a month with no entries carrying the one before, a table for screen readers, and a negative balance with the zero line | J18 |
| `books/useLoadMore.test.tsx` (new) | The next page on the sentinel, none while one is loading, none once all are loaded, and the button doing the same | J20 |
| `layout.test.ts` | Any area may import `books/AccountingPanel` and nothing else of `books/`, `books/` imports no area, and only `App.tsx` and the invoice and bill pages name `books/` | Layout rules |
| `App.test.tsx` | The Journal and ledger routes, the unknown key, and the other unknown addresses under `/accounting` unchanged | J15, N4 |
| `invoices/pages/Invoice.test.tsx` | An issued and a void invoice have the panel, a draft doesn't, and each payment's button opens its entries | V33 |
| `bills/pages/Bill.test.tsx` | The panel is below the notes, and "No entries." for a bill with none | E26 |
| `books/AccountingPage.test.tsx`, `components/UserMenu.test.tsx`, `colors.test.ts` | Still pass: the three placeholders, the four menu links and the tokens-only rule, which the new files must meet | J16, N7 |

### End-to-end tests (Playwright Test)

| File | What it proves | Requirements |
|---|---|---|
| `e2e/journal.spec.ts` (new) | On the sample data: the Journal is full, newest first, each entry's totals equal, and its document link opens its invoice or bill; the account filter, the dates and the search narrow it, are kept in the address and survive a refresh, and Clear filters empties them; scrolling to the end loads the next page, and Load more does too from the keyboard; clicking an account opens its ledger with the chart and lines, and the newest balance equals the one in `/api/books/balances`; an unknown account shows its message; light and dark mode; the focus ring; no console error | J17 to J22, Q2, Q3 |
| `e2e/invoices.spec.ts` | After issuing an invoice and recording a payment, the invoice's Accounting panel shows the issue entry and the payment's button its entry; after deleting the payment and voiding, the reversal shows | V33, J19 |
| `e2e/bills.spec.ts` | After adding a bill, marking it paid and changing its amount, the bill's panel shows each entry and each reversal, and an account link opens its ledger | E26, J19 |
| `e2e/accounting.spec.ts` | The Journal is a real page, and the other three still say the report is coming | J15, J16 |
| `e2e/stress.spec.ts` | A filtered and searched page of the Journal and a page of the largest ledger in under 200ms at the Q1 limits, the median of five | Q1, J14 |
