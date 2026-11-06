# Plan: cash flow

This plan turns the cash flow intent, and the spec already updated on this branch, into build work: which files change, in what order, what could go wrong and how we'll know it works. Ids such as Y5 and B23 are the spec's requirements. The intent wins over the spec, and the spec wins over this plan. If the build shows the spec is wrong, fix the spec in the same change and say so in `docs/STATUS.md`.

The plan ends with the build. ui-check, the review and `docs/IMPROVE.md` come after it, and so does the walk on Supabase.

There's no new dependency. Recharts 3 already draws the dashboard's charts, and its `ComposedChart` takes bars, lines and an area together, stacks bars above and below zero with `stackOffset="sign"`, and draws an `Area` between two values when its `dataKey` gives a pair. Radix UI's dialog is already in use. The switch is a checkbox with the switch role, styled in `styles.css`. date-fns adds the days and months.

While writing this plan, two points were settled in the spec, in `backend.md`, `architecture.md` and `frontend.md`:

- **A month's list takes the month as a query parameter,** `GET /api/cash-flow/expected?month=2026-12`, not `/cash-flow/{month}`. `test_every_route.py` treats every part of a path that varies as a record's id, and expects the largest id to be a 404, which a month can't be.
- **The cash flow passes each area's cash the settings it has already read,** so the CRM takes the payment terms from them and reads no settings of its own. That keeps the figures to six reads of the database.

## Files that change

### Before the build: the Money section

The `money` branch merges into `main` first, and `main` is then brought into this branch, as the project owner agreed. The merge is the owner's to commit. It brings a reworked Money section: `frontend/src/components/MoneySection.tsx`, which lays out invoices' and bills' sides as two columns, and `frontend/src/components/charts/monthColumns.tsx`, the parts the Money section's month charts share, such as the money axis on the right and "so far". The cash flow row goes above the two columns, through whatever the merged `MoneySection` takes, such as a row passed to it before its columns. Its chart uses `monthColumns.tsx`'s axis and month parts where they fit. The spec edits both branches made to `dashboard.md`, `invoices.md`, `bills.md`, `frontend.md`, `testing.md` and `visual-design.md` are put together at the merge, keeping both: the Money section as the `money` branch describes it, with the cash flow's row at its top.

If the `sample-story` branch's sample data merges first too, it comes in the same way, and Phase 2 checks the sample opening balance against it.

### What the parts agree on

**API, between the backend and the frontend**

- `GET /api/settings` gains `opening_balance_cents`, a whole number or null, and `opening_balance_on`, a `YYYY-MM-DD` date or null. Both are null with no opening balance.
- `PATCH /api/settings` takes both. Both null removes the opening balance. The messages, beside their fields: `opening_balance_cents` "Enter an amount in dollars and cents, such as 25,000.00", "Keep the opening balance within $1 trillion either way" or "Enter the opening balance"; `opening_balance_on` "Choose the date of the opening balance" or "The date can't be in the future". Each is checked against the settings as they'd be after the save (B5), and the date against the backend's today.
- `GET /api/cash-flow` gives `{today, opening, cash_today, forecast_end, forecast_end_with_deals, months}`. `opening` is `{balance_cents, on}` or null, and the three figures are null without it. `months` is 15 items, oldest first, each `{month, label, year, kind, in_cents, in_count, out_cents, out_count, expected_in_cents, expected_in_count, expected_out_cents, expected_out_count, likely_cents, likely_count, balance_cents, balance_with_deals_cents}`. `month` is such as `"2026-12"`, `label` such as `"Dec"`, and `kind` is `past`, `current` or `forecast`. A past month's expected and likely figures are `"0"`. `balance_cents` and `balance_with_deals_cents` are null before the opening balance's month, or without one, and for a past month the two are the same. Every sum and balance is a string of digits, with a minus sign in front of one below zero.
- `GET /api/cash-flow/expected?month=2026-12` gives `{month, coming_in, going_out, likely_deals}`. Each group is `{total_cents, items}`, and each item is `{id, name, organization, due_on, expected_on, cents, days_paid_late}`: for an invoice, its number, its organization, its due date and its customer's average days paid late; for a bill, its bill number, its supplier and its due date, with `days_paid_late` null; and for a deal, its name, its organization or null, and its close date, with `days_paid_late` null. Each group is in expected date order, then id. A month other than this one and the three after it is a 404, and a value that isn't a month is a 422.

**Backend, between files**

- `cash.py`, at the top level, holds `Day(on, cents, count)`, a day's money in or out, `Item`, one thing expected, with the fields above and the day it would be paid before the forecast's start is applied, and `Cash(flow, moved, expected)`. `flow` is `"in"`, `"out"` or `"likely"`. `moved(conn, since)` gives the `Day`s from `since` on, and is `None` for the likely deals, which haven't moved any money. `expected(conn, settings)` gives the `Item`s, with `settings` the row `company/documents.py`'s `current_settings()` reads. `expected_on(day, today)` gives the later of the day and tomorrow, the one place the forecast's start is applied (Y5, Y7, Y13). `app_cash(request)` and `AppCash` give the routes the areas' cash from the app, as `holds.py` gives the holds.
- `invoices/cash.py` gives `CASH = Cash("in", ...)`. `moved` groups the payments by `paid_on`. `expected` reads every issued invoice that isn't void with its organization's id and name, number, due date, total, what's been paid and its last payment's date, in one grouped query, works out each organization's average days paid late and every one's, and gives each invoice with money owed as an `Item`, at its due date plus its organization's average, or every one's.
- `bills/cash.py` gives `CASH = Cash("out", ...)`. `moved` groups the paid bills' totals by `paid_on`. `expected` reads the unpaid bills with their supplier's name.
- `crm/cash.py` gives `CASH = Cash("likely", None, ...)`. `expected` reads the open deals with their organization's name, and gives each one's `rules.expected_revenue` in cents, at its close date plus `settings.payment_terms_days`.
- `main.py`'s `Area` gains `cash: Cash | None = None`. The CRM, invoices and bills give theirs, and `make_app` puts them on the app as `app.state.cash`. The cash flow area is `Area(routers=[cashflow_router.router], messages=cashflow_schemas.FIELD_MESSAGES)`.
- `months.py` gains `next_months(today, count=3)`, the months after this one, across the turn of a year, and each `Month` gains its `year`, for the chart's labels.
- `cashflow/router.py` reads the settings, then each area's moved money from the earlier of the opening balance's date and the first month's first day, then each area's expected items, and folds them into the 15 months. The balances with the likely deals are worked out apart from the forecast's. The route takes `today: api.Today`, so tests fix it as they do elsewhere.
- `company/sample_data.fill(conn, today, now)` takes the team's today as well, for the opening balance's date, and `cli.fill_sample` passes it.

**Frontend, between files**

- `lib/money.ts`: `price` shows a value below zero as `-$4,250.00`, BigInt included, and `shortMoney` as `-$40k`. `parseSignedPrice(text, most)` reads a price with an optional minus sign in front, giving its whole cents, or null.
- `company/settings.ts`: `CompanySettings` and `SettingsRequest` gain the two fields, and `SettingsValues` gains `opening_balance_cents` and `opening_balance_on` as typed text, named as the backend names them, so its messages land beside them. `settingsProblems(values, today)` takes today for the date's check.
- `cashflow/queries.ts`: `useCashFlow()`, keyed `["cash-flow", today]`, and `useExpected(month)`, keyed `["cash-flow", "expected", month, today]`, each through `lib/api.ts`, with the sums read as BigInt.
- `CashFlowRow` takes nothing. `App.tsx` puts it at the top of the Money section.
- Links in the month dialog: `/invoices/{id}`, `/bills/{id}` and `/deals/{id}`, as addresses, so `cashflow/` imports no area.
- Tokens in `styles.css`: `--color-sea-green-soft`, `--color-coral-soft` and `--color-marigold-soft`, with the light and dark values in `visual-design.md`.

### Docs

| File | Change |
|---|---|
| `docs/spec.md`, `docs/specs/*.md` | Already updated on this branch, with the two points above. The build adds whatever else it settles, and the Money section's spec is put together with the `money` branch's at the merge |
| `docs/STATUS.md` | Cash flow added to what's done, at the end. The run instructions mention the opening balance in Company settings. The SQL under Clear the sample data gains `opening_balance_cents = default, opening_balance_on = default`, and its words say it removes the opening balance |

### Backend: new files

| File | What it holds |
|---|---|
| `backend/accountable/cash.py` | `Day`, `Item`, `Cash`, `expected_on`, `app_cash` and `AppCash`, as agreed above. It imports no area |
| `backend/accountable/invoices/cash.py` | The invoices' `CASH`: payments by day, and the open invoices with their customers' averages, in whole days with halves rounding up, from whole numbers (Y5, Y6) |
| `backend/accountable/bills/cash.py` | The bills' `CASH`: paid bills by day, at their totals, and the unpaid bills (Y2, Y7) |
| `backend/accountable/crm/cash.py` | The CRM's `CASH`: the open deals as likely deals (Y13) |
| `backend/accountable/cashflow/__init__.py` | Empty |
| `backend/accountable/cashflow/schemas.py` | The two replies' models, with sums as strings of digits, as `bills/schemas.py`'s `CentsSum` sends them, and `FIELD_MESSAGES` for `month` |
| `backend/accountable/cashflow/router.py` | `GET /cash-flow` and `GET /cash-flow/expected`. The fold: each month's money in and out from the days, the expected items placed by `expected_on` and dropped after the third forecast month (Y8), the running balance from the opening balance's date (Y9 to Y11), and the balances with the likely deals beside it (Y14) |
| `backend/accountable/migrations/versions/0011_opening_balance.py` | Adds `opening_balance_cents`, a `BigInteger`, and `opening_balance_on`, a `Date`, both blank with no server default, and the check constraint `ck_company_settings_opening_balance_together`, in batch mode on SQLite. Adds no table, so row-level security is as it was. Downgrade takes them out |

### Backend: existing files

| File | Change |
|---|---|
| `backend/accountable/main.py` | `Area.cash`, the three areas' cash, `app.state.cash`, and the cash flow area |
| `backend/accountable/months.py` | `next_months`, and each month's year |
| `backend/accountable/company/tables.py` | The two columns and the check constraint |
| `backend/accountable/company/schemas.py` | `OpeningBalance`, a whole number of cents from -`MAX_CENTS` to `MAX_CENTS` with its own message past the limit, the date, both in `SettingsUpdate` and `CompanySettings`, the messages, and `FIELD_MESSAGES` for both |
| `backend/accountable/company/router.py` | `save_settings` takes `today: api.Today`. `_refuse_what_breaks_the_rules` adds the opening balance's checks on the settings as they'd be after the save: an amount with no date, a date with no amount, and a date after today (B23, B24) |
| `backend/accountable/company/sample_data.py` | The sample company's opening balance: $40,000.00 as of the first day of the chart's first month, from `months.last_months(today)`, and `fill` takes today |
| `backend/accountable/cli.py` | Passes today to the sample company's `fill`. Seed and empty already leave the settings to the company area (C4) |

### Frontend: new files

| File | What it holds |
|---|---|
| `frontend/src/cashflow/queries.ts` | The two replies' types, `useCashFlow` and `useExpected`, as agreed above |
| `frontend/src/cashflow/CashFlowRow.tsx` | The row: its panel and heading, "Cash flow", at heading level 3 so the Money heading stays the page's last level 2, the figures (Y16), the legend, the switch (Y15), the chart, Y18's messages, the table behind the chart for screen readers, and N6's failed read with Try again (Y21) |
| `frontend/src/cashflow/CashFlowChart.tsx` | The chart from the reply, as `visual-design.md`'s Charts says: the bars stacked above and below zero, with this month's expected part after a 2px gap, the soft colors in the forecast, the balance as a solid and a dashed `Line` meeting at last month's point, the likely deals' band as a range `Area`, one money axis on the right, and the tooltip through `ChartTooltip`. The month labels are HTML buttons under each column, placed from the chart's width, for this month and the forecast, and plain text for the past (Y17, Q3) |
| `frontend/src/cashflow/MonthDialog.tsx` | The month dialog on Radix's dialog, as the screen in `cash-flow.md` says, reading `useExpected`. Focus goes back to the month's label when it closes |
| `frontend/src/cashflow/CashFlowRow.test.tsx`, `CashFlowChart.test.tsx`, `MonthDialog.test.tsx` | Below, under Proof |

### Frontend: existing files

| File | Change |
|---|---|
| `frontend/src/App.tsx` | `CashFlowRow` at the top of the Money section, as the merged `MoneySection` takes it |
| `frontend/src/styles.css` | The three soft tokens, light and dark, and the switch's track and knob |
| `frontend/src/lib/money.ts` | Signed `price` and `shortMoney`, and `parseSignedPrice` |
| `frontend/src/company/settings.ts` | The two fields, the checks, and `settingsProblems` taking today |
| `frontend/src/company/SettingsPage.tsx` | The Cash panel under the Company panel, in the left column, with the amount box showing `$` and its figures in JetBrains Mono, the date box, and the hint. The form sends whole cents, or null for both when both are blank |

### Tests: existing files

These state something this change alters, found by searching every test, not only the areas' own:

| File | Change |
|---|---|
| `backend/tests/test_company_settings.py` | The whole replies compared at lines 104 and 123 gain the two fields, null. New cases for B23 and B24 |
| `backend/tests/test_migrations.py` | An upgrade from `0010` keeps the settings and gives no opening balance, and the database refuses one column without the other. On Postgres, written out offline, `opening_balance_cents` is a `BIGINT`. The comparison with `company/tables.py` takes in the new columns by itself |
| `backend/tests/test_sample_data.py` | `company_samples.fill` takes today, at lines 47 and 352. On every seeding day, the opening balance is as of the chart's first day and the balance is above zero in all 15 months |
| `backend/tests/test_cli.py` | Seed puts back the opening balance after it's changed, and empty leaves it |
| `backend/tests/test_months.py` | `next_months` across the turn of a year, and each month's year |
| `backend/tests/test_layout.py` | `AREAS` at line 40 gains `cashflow`. `cashflow/` imports only `company/` and the top level |
| `backend/tests/test_every_route.py` | `test_the_routes_were_found` names the two routes. The rest picks them up from the app's own list |
| `backend/tests/limits_data.py` | An opening balance before the limits' oldest payment, so the cash flow folds every day |
| `backend/tests/test_limits.py` | `/api/cash-flow` and a month's list join the 200ms reads, and the read caps: 6 and 4 |
| `frontend/src/App.test.tsx` | A `GET /cash-flow` mock among the defaults. The Money section's regions start with "Cash flow". The settings fixture gains the two fields |
| `frontend/src/main.test.tsx` | A `GET /cash-flow` mock, so the start reads one more route |
| `frontend/src/company/SettingsPage.test.tsx`, `frontend/src/company/settings.test.ts`, `frontend/src/company/DocumentsPanel.test.tsx`, `frontend/src/invoices/pages/Invoice.test.tsx` | Their settings fixtures gain the two fields, which the type now needs. The first two gain the Cash panel's cases |
| `frontend/src/lib/money.test.ts` | Amounts below zero, as numbers and BigInt, and `parseSignedPrice` |
| `frontend/src/layout.test.ts` | `AREAS` at line 71 gains `cashflow`, and `cashflow/` imports no area |
| `e2e/quality.spec.ts` | The Company settings form's Tab order gains Opening balance and As of after Phone, and the presses go from 10 to 12 |
| `e2e/dashboard.spec.ts` | The test that the Money section fits below the dashboard's own part, as the merge leaves it, checks that the heading and the cash flow's row fit 1440 by 900, and that everything below the row does |
| `e2e/failures.spec.ts` | A screen for the cash flow: `/api/cash-flow` failing says so, leaves the rest of the Money section showing, and Try again works |
| `e2e/problem.spec.ts` | How much cash the business will have, and when, is on the dashboard itself, once scrolled to (H9) |
| `e2e/stress.spec.ts` | `/api/cash-flow` and a month's list join the 200ms reads |
| `e2e/helpers.ts` | `setOpeningBalance(request, cents, on)`, through `PATCH /api/settings` |

## Order of work

Five phases after the merge. Each ends with `npm run check:quick` passing, and Phase 5 ends with `npm run check`. Each new test is seen to fail once, by breaking your own copy of the code it covers and then putting your copy back, never through git. Any by-hand look at the app runs on a temporary database through `ACCOUNTABLE_DB`.

### Phase 0: bring in the Money section

1. With the owner, bring `main`, with the `money` branch in it, into this branch, and the `sample-story` branch's sample data if it has merged.
2. Put the two branches' spec edits together, as above.
3. Read the merged `MoneySection.tsx` and `monthColumns.tsx`, and note in this plan where the cash flow row goes.

   The merged `MoneySection` takes its two sides as children in a two-column grid. It now also takes a `lead`, a full-width row between its heading and that grid, and `App.tsx` passes it `CashFlowRow`. `monthColumns.tsx`'s `MUTED_AXIS_TEXT` and `centsAxis` fit the cash flow's axis. Its column width is 18px, as the cash flow's is, and its "so far" over a column doesn't fit, since the cash flow puts "so far" under the month's label.

Done when `npm run check:quick` passes on the merged branch, before any code of this change.

### Phase 1: the opening balance on the backend

1. `company/tables.py`, migration `0011`, and the `test_migrations.py` changes.
2. `company/schemas.py` and `company/router.py`, with the new cases and the changed replies in `test_company_settings.py`.
3. The sample company's opening balance and `fill`'s today, with `test_sample_data.py`'s signature change and `test_cli.py`.

Done when `npm run check:quick` passes.

### Phase 2: the cash flow on the backend

1. `months.py`, with `test_months.py`.
2. `cash.py` and the three areas' `cash.py`, then `main.py`'s `Area.cash`.
3. `cashflow/schemas.py` and `cashflow/router.py`, and the cash flow area in `main.py`, with `test_cash_flow.py`.
4. `test_layout.py` and `test_every_route.py`.
5. `limits_data.py` and `test_limits.py`. Then the sample opening balance in `test_sample_data.py`: seed a temporary database and read `GET /api/cash-flow`, to see the year and the forecast full and the balance above zero. If the reworked sample data has come in, choose the opening balance again so it stays above zero, and change B12 to match.

Done when `npm run check:quick` passes.

### Phase 3: the opening balance on the frontend

1. `lib/money.ts`, with `money.test.ts`.
2. `company/settings.ts` and the Cash panel in `SettingsPage.tsx`, with their tests, and the four settings fixtures.

Done when `npm run check:quick` passes.

### Phase 4: the cash flow on the frontend

1. The tokens and the switch in `styles.css`.
2. `cashflow/queries.ts`, then `CashFlowChart.tsx`, with its test.
3. `CashFlowRow.tsx` and `MonthDialog.tsx`, with their tests.
4. The row in the Money section through `App.tsx`, with the App and main tests, and `layout.test.ts`.

Done when `npm run check:quick` passes.

### Phase 5: end to end, and finish

1. `setOpeningBalance` in `e2e/helpers.ts`, then `e2e/cash-flow.spec.ts`.
2. The changes to the other end-to-end specs listed above.
3. Anything the build settled, in the spec files. Then `docs/STATUS.md`, with the run instructions and the clearing SQL.
4. Run `npm run check` until it passes, and read its list of unit tests that took a second or more.

That's the end of this plan. ui-check, the review and `docs/IMPROVE.md` follow.

## Risks

Most damaging first.

1. **The owner's records, or the team's.** Migration `0011` runs on whatever database the app starts on, and nothing takes it back. On SQLite, batch mode rebuilds `company_settings`, with foreign keys off as every migration runs, so the row and its `updated_by` must come through whole. `data/accountable.db` holds the owner's records. No agent starts the app on it, or seeds, empties or opens it. The tests use their own databases, and any by-hand look uses `ACCOUNTABLE_DB`. The team's database on Supabase gets `0011` at the first start after the merge. It adds no table, so the row-level security check isn't touched, and the existing row has both columns blank, which the check constraint allows. The upgrade test runs on a database at `0010` with real-looking settings and records. Once the columns exist, the clearing SQL in `STATUS.md` leaves a made-up opening balance behind unless it resets them too. Phases 1 and 5.
2. **The merges.** The `money` branch reworks the Money section's components and its spec, and this branch puts a row above them. Bringing it in first, in Phase 0, means the row is built on the section as it will be, rather than fixed up after. The `sample-story` branch changes the sample data the cash flow draws from, so $40,000.00 may no longer keep the balance above zero. `test_sample_data.py` checks it on every seeding day, and Phase 2 chooses the figure again if needed. Each new migration after `0010` on another branch makes `test_the_migrations_have_one_head` fail until one is renumbered. Phases 0 and 2.
3. **A forecast figure in the wrong month or for the wrong amount** (success criteria 2 and 3). The edges are where it goes wrong: an invoice due today lands tomorrow, one due on a month's last day lands in the next month when today is that day, an early payment counts as 0 and not as negative, a half day's average rounds up, a part-paid invoice counts in the forecast for what's owed but not toward an average, a customer with no history takes every customer's average, and nothing anywhere gives 0. The rule that nothing lands before tomorrow is in one place, `cash.expected_on`. The averages are whole numbers throughout, with no float. `test_cash_flow.py` puts a record on each edge, with today fixed, across the turn of a year. The backend's today comes from `TZ` and the browser's from the device, which agree for the team (Terms), and the page reads again when the day passes. Phase 2.
4. **The switch changing the forecast** (success criterion 4). The balances with the likely deals are worked out beside the forecast's, from the same months, never on top of them, and the reply carries both. `test_cash_flow.py` compares every month's forecast balance with and without open deals in the database. `CashFlowChart.test.tsx` checks the line's points are the same with the switch on and off, and `e2e/cash-flow.spec.ts` reads them off the page both ways. Phases 2, 4 and 5.
5. **The layout rule slipping.** The cash flow reads three areas' money, and it would be easy to import one of them. `cashflow/` gets their cash only from the app, `cash.py` imports no area, and no area imports `cashflow/`. Both layout tests hold `cashflow/` to importing only `company/` and the top level, and the frontend's links are addresses. Phases 2 and 4.
6. **Money below zero, or past 2^53 cents.** `price` and `shortMoney` show positive amounts only today, so a balance below zero would read `$-4,250.00`, and a BigInt below zero the same. Both are fixed in `lib/money.ts`, with tests for both kinds of number. Every sum and balance travels as digits and is shown from a BigInt, while the chart's heights use numbers, close enough at any size. Phases 2 to 4.
7. **The settings form.** The Cash panel adds two boxes to the left column, so the Tab order in `quality.spec.ts` changes, and the four settings fixtures need the new fields before tsc passes. The form's field names are the backend's, so its messages land beside them through `saveErrors.ts`. The settings' routes read numbers through `ExactNumbersRoute`, so 49.5 cents arrives as a `Decimal` and is refused as not a whole number. A blank amount and a blank date send null for both, and one without the other is refused on the page before it's sent. Phases 1 and 3.
8. **The chart in Recharts.** Bars above and below zero in one column need `stackOffset="sign"`, the expected part's 2px gap and rounded ends need a bar shape of the row's own, since `bills/` can't be imported, and the band needs a range `Area`. The month buttons are HTML, placed under each column from the chart's width and margins, because focus rings on SVG can't be relied on. If Recharts fights any of this, the chart is drawn as SVG with the same tokens, axes' text, `useSize` and `ChartTooltip`, and `frontend.md` says so. Phase 4.
9. **Reads at the limits, and round trips to Supabase.** The figures take six reads whatever the number of records, with the money that moved grouped by day in the database, and a month's list four. `test_limits.py` checks the time and the reads at the Q1 limits, with an opening balance before the oldest payment, so every day is folded. Phase 2.
10. **A console error from the new route.** Every unit and end-to-end test that opens the dashboard now also reads `/api/cash-flow`. The App and main tests get a mock for it, and end-to-end tests fail on any console error they didn't name, which `npm run check:quick` after each phase and the full run at the end would show. Phase 4.
11. **Dates.** Months cross the turn of a year, the chart has two Decembers, and the forecast's last day depends on the month. Dates are read with `parseISO`, never `new Date("2026-12-01")`, which `layout.test.ts` already refuses, and the months come from the backend, with their years. Phases 2 and 4.
12. **Unit tests over a second.** `test_cash_flow.py` adds invoices, payments, bills and deals through the API, so each test keeps to the few records its case needs. The chart's tests use the 15 months with small figures. Read the slow list at the end of each `npm test`. All phases.
13. **Spec claims that no test tries.** The spec says nothing is stored, every figure is exact past 2^53 cents, the forecast never changes with the switch, the switch is off on every visit, and both routes arrive in under 200ms. Each has a test below. All phases.

## Proof

`npm run check` runs everything below and fails if anything fails. The existing tests must still pass, with only the changes listed under [Tests: existing files](#tests-existing-files).

The intent's success criteria:

1. `npm run check` passes, at the end of Phase 5.
2. Each past month's money in and money out match the payments and paid bills exactly: `test_cash_flow.py` with known answers at the month boundaries, and `e2e/cash-flow.spec.ts` recording a payment and finding it in this month and in Cash today.
3. Tests with fixed dates prove where each open invoice and unpaid bill lands, overdue ones and customers with and without a payment history included: `test_cash_flow.py`.
4. The balance line starts from the opening balance in Settings, and turning likely deals on or off doesn't change the forecast line: `test_cash_flow.py`, `CashFlowChart.test.tsx`, `CashFlowRow.test.tsx` and `e2e/cash-flow.spec.ts`.
5. On a fresh copy with the sample data, the chart shows a year of history and three months of forecast and looks like it belongs on the dashboard: `test_sample_data.py` and `e2e/cash-flow.spec.ts`, then by hand at ui-check.

### Unit tests: backend (pytest)

| File | What it proves | Requirements |
|---|---|---|
| `test_cash_flow.py` (new) | With today fixed: 15 months, the last 12 and the 3 after, across the turn of a year, each marked past, current or forecast. Each past month's money in and out the same as its payments and paid bills, to the cent, tax included, with a payment and a paid bill on a month's first and last days, and drafts, void invoices and unpaid bills left out. This month's so far and still expected apart, and on its last day nothing still expected | Y1 to Y4, Y2 |
| `test_cash_flow.py` | Where each open invoice lands: due next week, due today and landing tomorrow, due yesterday and three months ago landing tomorrow, and a customer's average added. Averages: one late payer, an early payer counted as 0, 2.5 days rounding to 3, a part-paid invoice left out of the average but in the forecast for what's owed, a customer with no fully paid invoice taking every one's average, and none anywhere giving 0. A void invoice in neither | Y5, Y6 |
| `test_cash_flow.py` | Each unpaid bill on its due date, one due today or overdue landing tomorrow, and paid bills left out. An invoice and a bill expected after the third forecast month left out | Y7, Y8 |
| `test_cash_flow.py` | The balance: the opening balance's date's own payment and bill counted and the day before's not, no balance before its month, a date before the first month giving all 15, one this month, none at all giving null balances and figures, and a balance going below zero. Cash today and the forecast's end | Y9 to Y12, Y16 |
| `test_cash_flow.py` | Likely deals: value times probability with a half rounding up, at the close date plus the payment terms, a late deal tomorrow, a deal past the forecast left out, won and lost deals left out, and every month's forecast balance the same with open deals in the database as without | Y13, Y14 |
| `test_cash_flow.py` | A month's list: this month and each forecast month, each group's items in expected date order adding up to the month's figures, a customer's average on each invoice, a past month and one past the forecast a 404, and `2026-13` and `abc` a 422. Sums past 2^53 cents, from bills at the largest total, sent as exact digits. Nothing written by either route | Y17, Y19, Y20 |
| `test_cash_flow.py` | The areas give the cash they should, without checking they're the only ones: invoices `in`, bills `out` and the CRM `likely` | Layout rules |
| `test_company_settings.py` | An amount and a date together saved and read back, below zero too. Each alone refused with its message, both cleared together, -$1 trillion and $1 trillion kept, a cent past either refused with its own message, `49.5`, `"4950"` and `true` refused, a date of today kept and tomorrow refused with today fixed, and a save of other settings passing with a saved opening balance | B23, B24, B5 |
| `test_migrations.py` | As listed above | Data model, M1 |
| `test_sample_data.py` | On every seeding day, the sample company's opening balance is $40,000.00 as of the chart's first day, and the balance is above zero in all 15 months | M3, B12 |
| `test_cli.py` | Seed puts back the opening balance after it's changed, and empty leaves it | C4 |
| `test_months.py` | The 3 months after this one, from December into the next year, with each month's year | Y1 |
| `test_limits.py` | `/api/cash-flow` and a month's list within 200ms at the Q1 limits, in 6 reads and 4 | Q1, Y22 |
| `test_layout.py` | `cashflow/` is an area, imports only `company/` and the top level, and nothing imports it but `main.py`. `cash.py` imports no area | Layout rules |
| `test_every_route.py` | Picks up both routes, so each refuses anyone not signed in, a wrong host and a NUL in the month | Security, U7 |

### Unit tests: frontend (Vitest)

| File | What it proves | Requirements |
|---|---|---|
| `cashflow/CashFlowChart.test.tsx` (new) | The 15 columns, money in above zero and out below, this month's actual part and its expected part apart, the forecast's columns in the soft tokens, the line solid to last month and dashed after, no line before the opening balance's month, the band only with the switch on, and the line's points the same either way. The two Decembers labeled apart. The tooltip for a past month, this month and a forecast month, with the likely deals only with the switch on. The month buttons for this month and the forecast only. A balance below zero on the axis as `-$40k` | Y1 to Y4, Y10 to Y12, Y14, Y17 |
| `cashflow/CashFlowRow.test.tsx` (new) | Cash today, End of February and With likely deals with their cents, and a balance below zero. The switch off at first, its place kept, and gone without an opening balance, as are the Cash and Forecast entries in the legend. Y18's message with its link to `/settings`, and the empty chart. A failed read with Try again, a later failed read keeping the chart. The table behind the chart. Read again when the day changes. Sums past 2^53 cents shown to the cent | Y15, Y16, Y18 to Y21, N6 |
| `cashflow/MonthDialog.test.tsx` (new) | Opened by clicking a column and by the keyboard on its label. The title for this month and a forecast month. Coming in, Going out and, with the switch on, Likely deals, each with its total. Each item's link, amount, expected date, due date, Overdue or Late chip, and "Pays 6 days late on average" only when it isn't 0. "Nothing expected in December 2026." A failed read with Try again. Escape and Close, with focus back on the label | Y17, Y18, Q3 |
| `company/SettingsPage.test.tsx` | The Cash panel: each message in B24 before sending, an amount with a minus sign sent as cents below zero, both blank sent as null, a date after today refused, the backend's message landing beside its box, and the saved values shown after a save | B23, B24 |
| `company/settings.test.ts` | `settingsProblems` with the opening balance's cases, today passed in | B24 |
| `lib/money.test.ts` | `price` and `shortMoney` below zero, as a number and a BigInt, and `parseSignedPrice`: `-1,250.00`, `-0.29`, `1250`, and refusing `--1`, `1-` and a third figure after the point | B24, Y12 |
| `App.test.tsx` | The Money section starts with the cash flow's row, and its heading is still the page's last level 2 | H10, R7 |
| `layout.test.ts` | `cashflow/` is an area and imports no other area | Layout rules |
| `colors.test.ts` | Unchanged. It keeps the new tokens in `styles.css` | Color tokens |

### End-to-end tests (Playwright Test)

| File | What it proves | Requirements |
|---|---|---|
| `e2e/cash-flow.spec.ts` (new) | On a fresh copy: the cash flow at the top of the Money section with 15 months, 12 of history, each with money in, the line from the first month and dashed from last month's point, and 3 of forecast. Likely deals on and off, with the forecast line's points and End of February the same both ways. A forecast month's dialog, by click and by keyboard, and an invoice's link opening its page. A payment recorded through the API raising this month's money in and Cash today by its amount. Clearing the opening balance in Company settings, and the line and figures giving way to Y18's message, then entering one again. The figures in JetBrains Mono, and the bars, line and band in their tokens, in light and dark mode, by computed style | Y1 to Y18, B23, criteria 2, 4 and 5 |
| `e2e/failures.spec.ts` | `/api/cash-flow` failing shows "Couldn't load this." in the row, the rest of the Money section still showing, and Try again bringing the chart back | Y21, N6 |
| `e2e/dashboard.spec.ts` | The heading and the cash flow's row fit 1440 by 900 once scrolled to, and everything below the row does | H10 |
| `e2e/problem.spec.ts` | Cash today and End of February are on the dashboard, once the Money section is scrolled to | H9 |
| `e2e/quality.spec.ts` | The Company settings form's Tab order with the Cash panel's boxes, each with its focus ring | Q3 |
| `e2e/stress.spec.ts` | The cash flow and a month's list in under 200ms at the Q1 limits, the median of five | Q1, Y22 |
