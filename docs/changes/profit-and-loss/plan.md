# Plan: profit and loss

This plan turns the profit and loss intent, and the spec already updated on this branch, into build work: which files change, in what order, what could go wrong and how we'll know it works. Ids such as X7 and J12 are the spec's requirements. The intent wins over the spec, and the spec wins over this plan. If the build shows the spec is wrong, fix the spec in the same change and say so in `docs/STATUS.md`. [profit-and-loss.md](../../specs/profit-and-loss.md) holds X1 to X19 and the screen.

The plan ends with the build. ui-check, the review and `docs/IMPROVE.md` come after it.

There's no new dependency. The chart is Recharts, as every chart in the app is, and the rest is SQLAlchemy Core, FastAPI and Pydantic on the backend, and React, TanStack Query and lucide-react on the frontend, all already in use. The dialog is the one the cash flow's month dialog and the other dialogs use.

## Files that change

### What the parts agree on

**Two reads, both from the books** (X1, X16, X17, [API](../../specs/backend.md#api))

- `GET /api/books/profit-and-loss?period=&on=` gives the whole page in one reply: `today`, the 12 months, the period shown with `back_on` and `forward_on`, the previous period, and the statement's figures. Every sum is `api.CentsSum`, a string of digits. The margin is an integer of tenths of a percent or null. A change is `{kind, value}` with `kind` one of `percent`, `points`, `new` and `none`, and `value` a whole percent, tenths of a point, or null.
- `GET /api/books/profit-and-loss/entries?figure=&from=&to=&limit=&offset=` gives the entries behind one figure, in the shape of `/api/books/entries`, plus each entry's `amount` on the figure and the figure's `total` for the range. `figure` is `revenue`, `expenses`, `profit` or one expense account's key from the chart, such as `expense_software`. Revenue and each expense are read with `accounts.balance`'s sign rule, and Profit is revenue less expenses, so the signs are in `books/accounts.py` and `books/profit_and_loss.py` and nowhere else.
- The two routes and `/api/books/entries` share one condition, "has a line in one of these accounts", so what lists as behind a figure is decided in one place. `_matching` takes a list of accounts, and `/entries` passes one.
- The reply names each expense category by its bill category key (`software`), taken from the chart in `books/accounts.py` (`category_of(account_key)`), so `books/` never imports `bills/`.

**Pure rules, apart from the database** (X3 to X7)

- `books/profit_and_loss.py` takes plain values and reads nothing: the period containing a day, the one before and the one after, a period's label, the margin in tenths with a half rounding away from zero, and the change between two figures. All of it is integer arithmetic, so there's nothing to divide by zero and no float to round. This is where the unit tests that run in milliseconds go.
- The router reads the entries, groups them in the database by day and account, folds them with the pure rules, and builds the reply. The read count is fixed, however many entries there are: the 12 months in one grouped query, the period and the previous period in one each, and the earliest entry on Revenue or an expense account in one, four in all (X18, J14).

**Naming the records behind entries** (X13, [Layout rules](../../specs/architecture.md#layout-rules))

- `books/` imports no other area, so it can't name an invoice or a bill. A new top-level `labels.py` has a `Labels` type, a function from a connection and a list of ids to a dictionary of names, as `cash.py` has `Cash`. Invoices give the invoice numbers, and bills give "8841 from Northwind Software", each in one query for all the ids on the page. `Area` in `main.py` gains `labels`, a mapping from the entry kind to its function, and `main.py` puts every area's on `app.state.labels`, where the books' router reads them, as it reads the cash flow's.
- The kinds that get a name are `invoice`, `bill` and `bill_payment`, whose source is the bill. A payment's source has no name of its own and the opening balance has none, so their label is null, as for a deleted record. The entry's `label` is null for any of them, and the page names a missing one "Deleted bill" or "Deleted invoice".

**The categories' colors, shared** (X8, Layout rules)

- Frontend `books/` imports no other area, and the category list with its colors, the swatch, and the stacked segment that keeps a small slice 4px tall are in `bills/`. The page must use the same ones as Spending by category, so they move to `components/charts/`, which is what any area's chart can use, and `bills/` imports them from there. This is a move, not a rewrite: the code and its tests stay as they are. The six category keys become a type in `components/charts/categories.tsx`, and `bills/queries.ts` takes its `Category` from it.

**Frontend, between files** (X4 to X16)

- `books/profit/queries.ts` holds the reply's types with the sums as strings, and the two reads. The page's read is keyed by `period`, `on` and today, and keeps the previous data while the next arrives (`keepPreviousData`), as the cash flow's does. It reads again when the day changes through `useToday`, as every read does. The entries are read a page at a time, with `useInfiniteQuery` and the offset, for Show more.
- The page keeps two things in state: the period kind, starting on `month`, and the day `on`, starting on today. The switch changes the kind and keeps the day. An arrow sets the day to the `back_on` or `forward_on` the backend sent, so the page works out no date.
- `books/profit/figures.ts` turns the backend's numbers into words: a sum into dollars and cents, tenths into `23.4%`, a change into `+12%`, `-8%`, `+2.1 pts`, `New` or `–`. It does no sums. It's pure, so its tests are quick.
- The page draws what the backend sends. Sums stay strings until they're shown, and the chart's heights are the one place a number is made from them, through `Number`, as the cash flow's chart does for drawing only (Y20).

### Docs

| File | Change |
|---|---|
| `docs/spec.md`, `docs/specs/*.md` | Already updated on this branch. The build adds whatever it settles. Three things are known to need a touch while building: J12 says a label is "nothing if the record has been deleted" and should also say "or has no name" for payments and the opening balance; backend.md names `figure`'s expense keys as the chart's (`expense_software`); and architecture.md lists the files as they end up, including any test helper |
| `docs/STATUS.md` | Profit and loss added to what's done, at the end, with the routes, the move of the categories and stack segment to `components/charts/`, and the run instructions mentioning the page. No migration, no new table |

### Backend: new files

| File | What it holds |
|---|---|
| `backend/accountable/labels.py` | The `Labels` type and the function that reads many names for one kind from `request.app.state.labels` (X13) |
| `backend/accountable/books/profit_and_loss.py` | `Period`, `period_containing(kind, day)`, `before(period)`, `after(period)`, labels such as `March 2026`, `Q1 2026`, `2026`, `margin_tenths(profit, revenue)`, `change(before, now)` and `margin_change(before, now)` (X3 to X7) |
| `backend/accountable/invoices/labels.py` | An invoice's number, for many ids in one read |
| `backend/accountable/bills/labels.py` | A bill's number and supplier's name, for many ids in one read |
| `backend/tests/test_profit_and_loss.py` | The routes through the API, from small datasets with known answers and from the sample data (X1 to X7, X15 to X17) |
| `backend/tests/test_profit_and_loss_rules.py` | The pure rules in `profit_and_loss.py`, with plain values and no database |

### Backend: existing files

| File | Change |
|---|---|
| `backend/accountable/books/accounts.py` | `category_of(key)` and the list of expense accounts with their category keys, so the reply and the figures use one list. The chart doesn't change |
| `backend/accountable/books/schemas.py` | The replies: the 12 months, the period, the figures and their changes, the entries' `amount` and `total`, and `label` on `Entry`. `FIELD_MESSAGES` gains `period` and `figure`, with `Choose a month, quarter or year` and `Choose a figure from the statement`, and `on` after today gets its own message, "The date can't be in the future" |
| `backend/accountable/books/router.py` | The two routes. `_matching` takes a list of accounts. `_lines_of` and the entry page are shared, and the label of each entry is looked up in one read for each kind. `/entries` gives the label too (J12) |
| `backend/accountable/main.py` | `Area` gains `labels`, invoices and bills give theirs, and `create_app` puts them on `app.state.labels` |

### Frontend: new files

| File | What it holds |
|---|---|
| `frontend/src/components/charts/categories.tsx` | Moved from `bills/categories.tsx`: the six categories, their order, colors, `Swatch` and `CategoryLabel`, and the `Category` type |
| `frontend/src/components/charts/StackSegment.tsx` | Moved from `bills/charts/StackSegment.tsx`, with `stackScale` |
| `frontend/src/books/profit/queries.ts` | The reply's types and the two reads (X16) |
| `frontend/src/books/profit/figures.ts` | A sum, the margin and a change as text (X3, X7) |
| `frontend/src/books/profit/ProfitChart.tsx` | The columns, segments, profit line, axis, legend and tooltip, each part clickable, and the table behind it whose cells are buttons (X8 to X10) |
| `frontend/src/books/profit/Statement.tsx` | The table of figures, each amount a button, the changes, and the heading with the earlier period's name (X11, X12) |
| `frontend/src/books/profit/PeriodSwitch.tsx` | The Month, Quarter and Year switch, the arrows, the label and "so far" (X4 to X6) |
| `frontend/src/books/profit/EntriesDialog.tsx` | The dialog of entries behind a figure, with links, Reversal chips, Show more, and its own failed read (X13) |
| `frontend/src/books/profit/test-profit.ts` | The tests' replies for a today of Nov 5, 2026, and the chart's size, as `cashflow/test-cash-flow.ts` does |
| `frontend/src/books/profit/figures.test.ts`, `queries.test.tsx`, `ProfitChart.test.tsx`, `Statement.test.tsx`, `PeriodSwitch.test.tsx`, `EntriesDialog.test.tsx`, and `frontend/src/books/pages/ProfitAndLoss.test.tsx` | The tests below |
| `e2e/profit-and-loss.spec.ts` | The page end to end |

### Frontend: existing files

| File | Change |
|---|---|
| `frontend/src/books/pages/ProfitAndLoss.tsx` | No longer a placeholder: the title, the one-line explanation (X14), the chart panel and the statement panel, the page's state, and the read's failed, loading and empty states |
| `frontend/src/bills/categories.tsx`, `frontend/src/bills/charts/StackSegment.tsx` | Deleted, moved to `components/charts/`. Moved with `mv`, not git |
| `frontend/src/bills/charts/DueTimeline.tsx`, `SpendingChart.tsx`, `MoneySection.test.tsx`, `frontend/src/bills/pages/Bills.tsx`, `Bill.tsx`, `frontend/src/bills/BillForm.tsx`, `frontend/src/bills/queries.ts` | Import the category and the segment from `components/charts/`. Nothing else in them changes |
| `frontend/src/styles.css` | No new color: the page uses the existing tokens. If a class for the profit line's casing is needed, it uses the panel token |

### Tests: existing files

These state something this change alters, found by searching every test, not only the areas' own:

| File | Change |
|---|---|
| `backend/tests/test_layout.py` | `labels.py` is a top-level file that imports no area. `books/` still imports no area, and `invoices/labels.py` and `bills/labels.py` import only the top level. Each is a test |
| `backend/tests/test_every_route.py` | `test_the_routes_were_found` names the two new `GET /api/books/profit-and-loss...` routes. The security and bad-input checks pick them up from the app's own list, with `period`, `on`, `figure`, `from` and `to` among the bad values |
| `backend/tests/test_books_reads.py` | An entry has a `label`: an invoice's number, a bill's number and supplier, null for a payment, the opening balance and a deleted record, and a page of 100 entries names its records in one read for each kind |
| `backend/tests/test_limits.py` | The two routes join the 200ms reads, with their read caps: the figures 4, and the entries 4 (the page, the count, the lines and a name for each kind that's on the page, so at most one for invoices and one for bills). `limits_data.py` already has issued invoices and bills across the months, so it needs no new data |
| `backend/tests/test_sample_data.py` | On every seeding day, the 1st included, each of the last 12 months has revenue and expenses, so the chart is full (X19) |
| `frontend/src/books/AccountingPage.test.tsx` | Profit and loss is no longer one of the placeholders. The test lists three |
| `frontend/src/App.test.tsx` | `/accounting` and `/accounting/profit-and-loss` open the real page, with the API stood in for. The placeholders' "no read of the backend" test names only the other three. The unknown address under `/accounting` is unchanged |
| `frontend/src/layout.test.ts` | The comment about the books having no queries goes, because they now read. `books/` is still listed by name, since its read isn't in a `queries.ts` at its top. Its rule that `books/` imports no other area, and that `components/` imports no area, are checked as before, now covering the moved files |
| `frontend/src/bills/charts/MoneySection.test.tsx` and the other bills tests | Only their imports change, and they must pass as they were |
| `e2e/accounting.spec.ts` | Profit and loss finds its real page, not "This report is coming soon.". The other three still find their words. The nine sections and the console are unchanged |
| `e2e/menu.spec.ts` | Choosing Profit and loss opens the page. The menu's items are unchanged |
| `e2e/data.spec.ts` | After seeding the page shows 12 months, and after emptying its chart says "The chart will show here once you've issued an invoice or added a bill." and the statement is all zeros |
| `e2e/failures.spec.ts` | A failed read of the page shows "Couldn't load this." with Try again, and a later one failing over data shows the refresh message |
| `e2e/quality.spec.ts` | If it lists the pages it checks for console errors, Profit and loss is among them, with the dialog open |
| `e2e/stress.spec.ts` | The two reads join the 200ms list |

## Order of work

Six phases. Each ends with `npm run check:quick` passing, and Phase 6 ends with `npm run check`. Each new test is seen to fail once, by breaking your own copy of the code it covers and then putting your copy back, never through git. Any by-hand look at the app runs on a temporary database through `ACCOUNTABLE_DB`, and every server started is stopped by its own process ID. Every unit test stays under a second, and the slow list at the end of `npm test` is read at the end of each phase.

### Phase 1: the rules, with no database

1. `books/accounts.py`'s `category_of` and its test.
2. `books/profit_and_loss.py` and `test_profit_and_loss_rules.py` together, rule by rule: a period for every kind of day, the first and last days of a month, quarter and year, a leap February, the turn of a year, the period before and after, labels, the margin to the tenth with halves rounding away from zero, negative and zero revenue, and every kind of change in X7, including from a negative profit, from 0, to 0 and the margin's points.

Done when `npm run check:quick` passes.

### Phase 2: the figures from the books

1. `books/schemas.py` and the figures route in `books/router.py`: the 12 months in one grouped query, the period and the previous period in one each, the earliest entry in one, and the pure rules to build the reply. The page's `on` is refused after today.
2. `test_profit_and_loss.py`, with a small dataset built through the API (an invoice issued, one voided, a bill added, one changed in its amount and one in its date, one deleted, a payment, a bill paid) and the answers worked out by hand. The sums are also checked against the entries read straight from the tables, not through the code that reads them.
3. `test_every_route.py`'s names, and the bad values.

Done when `npm run check:quick` passes.

### Phase 3: the entries behind a figure

1. `labels.py`, `invoices/labels.py`, `bills/labels.py`, `main.py`'s `Area` and `app.state.labels`, with `test_layout.py`'s rules written first.
2. `_matching` over a list of accounts, `label` on `/entries`, and the entries route with `amount` and `total`.
3. Tests: for every figure, month and quarter, the entries' amounts sum to the figure, over all the pages, with reversals included; a changed bill shows its reversal and its new entry; the profit's list has entries on any of the seven accounts and no more; payments, a paid bill and the opening balance are in no figure's list; labels and a deleted record; paging; the 422s.
4. Seed a temporary database and read both routes by hand, month by month, to see the figures add up on the sample data, before any page is written.
5. `test_limits.py` and `test_sample_data.py`'s changes: the reads under 200ms in their few reads at the Q1 limits, and a full year on every seeding day.

Done when `npm run check:quick` passes.

### Phase 4: the shared pieces and the page's reads

1. Move the categories and the stacked segment to `components/charts/` with `mv`, change the imports in `bills/`, and run the bills' tests unchanged. This is first on the frontend, so the page builds on it and any slip shows in tests that already exist.
2. `books/profit/queries.ts`, `figures.ts` and `test-profit.ts`, with `figures.test.ts`: a sum, the margin, `New`, the dash, points, a loss's minus sign and sums past 2^53 cents.

Done when `npm run check:quick` passes.

### Phase 5: the page

1. `PeriodSwitch.tsx` with its tests: the three choices, the day kept on a switch, the arrows sending the backend's days, an off arrow when the day is null, "so far", and the keyboard.
2. `Statement.tsx` with its tests: the rows in order, all six categories, amounts as buttons, the margin opening Profit, the changes as text, the heading naming the earlier period.
3. `ProfitChart.tsx` with its tests: the columns and segments in the category colors, the profit line and a loss below the zero line, the axis, the tooltip, the legend, "so far", the table behind it, and a click on each kind of part.
4. `EntriesDialog.tsx` with its tests, and `ProfitAndLoss.tsx` putting it together with the loading, empty and failed states, and `AccountingPage.test.tsx`'s and `App.test.tsx`'s changes.
5. Look at the page by hand on a temporary database with the sample data, in light and dark mode, against the screen in the spec, including a loss month (add bills by hand) and a period with nothing in it.

Done when `npm run check:quick` passes.

### Phase 6: end to end, and finish

1. `e2e/profit-and-loss.spec.ts`, and the changes to `accounting.spec.ts`, `menu.spec.ts`, `data.spec.ts`, `failures.spec.ts`, `quality.spec.ts` and `stress.spec.ts`.
2. Anything the build settled, in the spec files, then `docs/STATUS.md`.
3. Run `npm run check` until it passes, and read its list of unit tests that took a second or more.

That's the end of this plan. ui-check, the review and `docs/IMPROVE.md` follow.

## Risks

Most damaging first.

1. **A figure that isn't the books' figure** (success criteria 2 and 3). The statement, the chart's columns and the dialog's list could each add up the entries in their own way and drift apart. All three use the same account lists, the same condition for what's behind a figure and the same sign rule, and the tests check the three against one another and against the tables read directly: a month's chart column equals the statement for that month, and the dialog's amounts sum to the figure over every page, reversals included.
2. **A period that is wrong at its edges** (success criterion 4). The turn of a year, the last day of a month, a leap February, a quarter's first and last days, and the current period not being over. The rules are pure and tested on those days, and the router's tests run them with `today` fixed. An entry dated on a period's last day counts in it, and the next day's doesn't.
3. **The current period and entries dated after today** (X6). A bill dated tomorrow counts in this month's statement and chart, as the Spending chart counts it, so the page and the dashboard agree. A test has one, and a quarter that's still going is compared with the whole one before.
4. **A change that divides by zero or reads as a percentage from nothing** (the intent's constraints). Changes are integer arithmetic in one pure function with a branch for each kind, and a test for every combination of zero, positive and negative on both sides, and for the margin with and without revenue. The page shows what the backend sends and works out nothing.
5. **Reversals reading wrong.** A bill whose date moved from one month to another posts a reversal in the old month and a new entry in the new one, so each month's figures follow what was true when it was dated. A voided invoice nets to zero in its month. The dialog lists both entries and marks the reversal, so the list adds up. Tests cover a void, a deleted bill, and a bill changed in each of its amount, category and date.
6. **The moved category code.** Moving `categories.tsx` and `StackSegment.tsx` touches six bills files. It is only a move and an import change, the bills' tests run unchanged, and `layout.test.ts` checks that `components/` imports no area. If a test needs more than its import changed, that's a sign the move changed something and it is looked at before going on.
7. **The layout rule slipping.** `books/` must still import no area on either side, and the names of invoices and bills reach it only through `main.py`. `test_layout.py` and `layout.test.ts` are changed first, so a slip shows.
8. **Names read one by one.** Naming 100 entries could take 100 reads, a round trip each on Supabase. The label functions take every id of a kind on the page in one query, and `test_books_reads.py` counts the reads with a full page.
9. **Unit tests over a second** (the intent's constraint). The route tests build small datasets through the API, a few records each, and share one seeded database where they need the sample data, as the other tests do. The pure rules need no database. The chart's tests give jsdom a plain size, as the cash flow's do. The slow list is read after each phase.
10. **Chart legibility and the tests that can't see it.** The ink profit line over ink columns, small segments, a loss below zero, and the axis with $0 and both ends are things jsdom can't judge. The axis helpers from `components/charts/` are reused so their tests apply, the casing is checked by computed style in the end-to-end test, and the look is checked by hand in Phase 5, then by ui-check.
11. **Clicking and the keyboard.** Recharts parts aren't reached by Tab, so the table behind the chart carries the buttons, as the cash flow's does, and a test reaches a figure by keyboard and opens the dialog. Focus returns to the figure after Close.
12. **Stale data when the period changes.** Changing the period shows the old statement dimmed until the new one arrives, and a late reply for an earlier choice must not replace a later one. The query key holds the period and day, and a test answers the first request after the second.
13. **Money past 2^53 cents.** Sums are strings, shown through BigInt as the other pages do, and a test sends sums past 2^53. The one place a number is made is the chart's drawing.
14. **Spec claims that no test tries.** The spec says the figures come from the books alone, the statement adds up, nothing is stored, the reads take a fixed few queries, the chart shows a full year on the sample data, and nothing divides by zero. Each has a test in Proof.

## Proof

`npm run check` runs everything below and fails if anything fails. The existing tests must still pass, with only the changes listed under [Tests: existing files](#tests-existing-files). Each unit test runs in under a second.

The intent's success criteria:

1. `npm run check` passes, at the end of Phase 6.
2. Each month's revenue and expenses match the books' entries exactly, and the statement adds up: `test_profit_and_loss.py` reads the entries from the tables and compares every month and period, and checks the categories add to total expenses and revenue less expenses to profit. `e2e/profit-and-loss.spec.ts` compares the page with `/api/books/months`.
3. Clicking a figure lists exactly the entries behind it: `test_profit_and_loss.py` for the list and its sum, `EntriesDialog.test.tsx` and `ProfitChart.test.tsx` for what a click opens, and `e2e/profit-and-loss.spec.ts` for the real page.
4. The switches and arrows show the right periods with the right changes: `test_profit_and_loss_rules.py`, `test_profit_and_loss.py`, `PeriodSwitch.test.tsx` and `e2e/profit-and-loss.spec.ts`.
5. On a fresh copy with the sample data the chart shows a full year and the page belongs in the app: `test_sample_data.py` and `e2e/profit-and-loss.spec.ts` for the year, then by hand in Phase 5 and at ui-check for the look.

### Unit tests: backend (pytest)

- `test_profit_and_loss_rules.py` (X3 to X7), plain values:
  - The period containing a day, for month, quarter and year, on the first and last day of each, across the turn of a year and in a leap February. The period before and after, their labels, and the period before January's first quarter.
  - The margin in tenths: halves rounding away from zero on both sides, a loss, 100%, and no revenue giving none.
  - Every change: a rise and a fall rounded half away from zero, from a negative profit to a smaller loss (a positive change), to a larger loss, from a loss to a profit, no change as `0%`, from 0 to something as `new`, from something to 0 as `-100%`, 0 to 0 as `none`, and the margin's points, `new` with no earlier margin, and `none` with no margin now.
- `test_profit_and_loss.py` (X1 to X7, X15 to X17, X19):
  - Each figure equal to the sum of the entry lines read straight from the tables, for the chart's 12 months and for a month, quarter and year, on a dataset with known answers and on the sample data.
  - Revenue is the subtotal and never the tax. Expenses are the total with tax, by the bill date, paid or not. A payment, a bill paid and the opening balance change no figure.
  - A void invoice, a deleted bill, and a bill changed in its amount, category and date, each netting to what is true now, in the right months.
  - The statement adds up: the categories to total expenses, and revenue less expenses to profit, including a loss.
  - The current period counted whole, including an entry dated after today, compared with the whole previous period. The arrows' days at each end: none forward at the current period, none back at the period with the earliest entry, and both none when there is no entry.
  - The 12 months are the last 12 including this one across the turn of a year, with months of nothing as zero.
  - `period` and `on` refused when bad, and `on` after today, with their messages beside the field. Nothing stored: the figures change when an entry is added, with no other write.
  - The sums past 2^53 cents as strings. The reads' count is fixed, with 1 and with 200 entries.
- `test_profit_and_loss.py` for the entries route (X13):
  - For each figure over a month and a quarter, the amounts of every page add up to the `total`, which equals the statement's figure; the order is newest first and then by id; the count is the total of matching entries; and paging with `limit` and `offset` gives each entry once.
  - Which entries are behind which figure: Revenue's, a category's, all six for Total expenses and seven for Profit, and no entry for a payment, a bill paid or the opening balance. A changed bill lists the reversal and the new entry, and the reversal's amount takes the figure down.
  - Labels from `invoices/labels.py` and `bills/labels.py`, and null for a deleted record.
  - An unknown figure, a bad date and a bad limit give a 422.
- `test_books_reads.py`: `label` on `/entries`, and a page of 100 entries naming its records in one read for each kind.
- `test_layout.py`: the labels' rules above. `test_every_route.py`: the two routes.
- `test_limits.py`: the figures and the entries behind one under 200ms and in their few reads at the Q1 limits. `test_sample_data.py`: a full year on every seeding day.

### Unit tests: frontend (Vitest)

- `figures.test.ts`: a sum with its cents and a minus sign, sums past 2^53 cents, tenths as a percentage, the dash with no margin, each change as `+12%`, `-8%`, `0%`, `New`, `–`, `+2.1 pts` and `-0.4 pts`, a plus or minus sign and a true minus.
- `PeriodSwitch.test.tsx`: Month, Quarter and Year, pressed state for screen readers, the day kept across a switch, the arrows sending the backend's days and off when it sends none, the label with "so far" for the current period only, and the keyboard.
- `Statement.test.tsx`: the rows in order with all six categories and $0.00 in muted ink, the heading "Change from February 2026", each amount a button, the margin opening Profit, the changes not buttons, a loss with its minus sign, the margin's dash, and nothing worked out by the page, shown by a reply whose profit isn't revenue less expenses and which is drawn as it came.
- `ProfitChart.test.tsx`: 12 months, columns in ink and segments in the category colors in order, the profit line through the months and below the zero line for a loss, "so far" under the current month with no lighter color, the legend, the tooltip's rows, the axis figures, a month with nothing drawing no column, a small segment kept tall enough, the table behind it, a click and the keyboard on a revenue column, a segment and a profit point each opening the dialog with the right figure, and the empty chart's message.
- `EntriesDialog.test.tsx`: the title and total, the rows with dates, links, events and amounts, the Reversal chip, a deleted record's row with no link, Show more reading the next page, a failed read with Try again, a failed later read keeping the rows and saying so, Close, Escape and focus returning to the figure.
- `queries.test.tsx` and the page's test (`ProfitAndLoss.test.tsx`): the read keyed by period and day, the old statement kept dimmed while the next arrives, a late reply for an earlier choice not replacing a later one, a failed read with Try again, a refresh that fails over data, the explanation line, and the figures read again when the day changes.
- `AccountingPage.test.tsx`, `App.test.tsx`, `layout.test.ts` and the bills' tests, as under Tests: existing files.

### End-to-end tests (Playwright Test)

- `e2e/profit-and-loss.spec.ts`, on a fresh copy, waiting for the exact reply or row each step needs:
  - The page opens from the menu with the chart's 12 months and each month's revenue and expenses equal to `/api/books/months`, and the statement for this month adding up.
  - Quarter and Year switch with the right labels, the arrows step back and forward with the right figures and changes, and each arrow is off at its end.
  - A click on a revenue column, a category's segment, the profit, a statement amount and the margin each opens the dialog, whose entries sum to the figure, and the keyboard reaches a figure and returns focus on Close.
  - An invoice's link and a bill's link open their pages.
  - Issuing an invoice raises this month's revenue by its subtotal and not its tax; adding a bill raises its category and total expenses by its total; recording a payment changes no figure.
  - By computed style: the figures are in JetBrains Mono, and the columns, segments and line take their tokens in light and dark mode. The console is clean.
- `accounting.spec.ts`, `menu.spec.ts`, `data.spec.ts`, `failures.spec.ts` and `quality.spec.ts`, as under Tests: existing files.
- `stress.spec.ts`: the figures and the entries behind one under 200ms at the Q1 limits, median of five.
