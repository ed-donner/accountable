# Plan: aged balances

This plan turns the aged balances intent, and the spec already updated on this branch, into build work: which files change, in what order, what could go wrong and how we'll know it works. Ids such as X4 and J11 are the spec's requirements. The intent wins over the spec, and the spec wins over this plan. If the build shows the spec is wrong, fix the spec in the same change and say so in `docs/STATUS.md`.

The plan ends with the build. ui-check, the review and `docs/IMPROVE.md` come after it.

There's no new dependency. The backend is SQLAlchemy Core, FastAPI and Pydantic. The frontend is React, React Router, TanStack Query and Recharts, plus the toggle group from the `radix-ui` package that's already installed. There is no migration, because the area keeps no tables.

## Files that change

### What the parts agree on

**One definition of the five parts** (X1, X12)

- Backend: `aging/ages.py` holds the five keys in order (`not_due`, `1_30`, `31_60`, `61_90`, `over_90`, the same keys `invoices/figures.py` uses) and `part_of(days_past_due)`, which is a plain function of an integer. The day count is not clamped at 0 here: 0 or less is Not yet due, 1 to 30, 31 to 60, 61 to 90, 91 or more. It imports nothing, so a test fixes any day. A test checks it agrees with `invoices.figures.late_group` on every day from -5 to 400, so the dashboard and this page can't drift apart.
- Frontend: `components/charts/lateness.ts` holds the five keys, their labels ("Not yet due", "1 to 30 days", "31 to 60 days", "61 to 90 days", "Over 90 days") and their colors as CSS variables. `invoices/charts/HowLate.tsx` and `aging/` both import it, so the order, the words and the colors exist once. It is in `components/` because an area may not import another.
- Colors: `styles.css` gets `--color-deep-raspberry` (`#a31d45` light, `#c23560` dark, X12 and the visual design's token table). Cerulean, Marigold, Coral and Raspberry already exist. Nothing outside `styles.css` names a color value (`colors.test.ts`).

**What is owed on a day** (X2, X3, X4)

- Customers: `aging/router.py` reads the issued invoices (`status = issued`, so drafts and void ones are out on every day) with `issue_date <= on`, their organization and name, due date and total, and the sum of their payments with `paid_on <= on`, grouped in the database. An invoice is owed `total - paid`, and left out at 0. Void invoices are left out whatever the day, because the books reverse them with the issue date's own date (X2).
- Suppliers: the bills with `bill_date <= on` and no `paid_on`, or a `paid_on` after `on`, with their supplier and name, due date and `amount_cents + tax_cents`.
- Neither reads the journal. The books stay a separate check, and the tests compare the two (X4).
- Python turns each item into its days past due and part with `ages.py`, adds the parts in whole cents into each organization's row, orders the rows (X10: oldest days past due, then amount owed, then name ignoring case, then id), and adds the totals. An organization with only money not yet due counts as 0 days past due. Each row carries its items, oldest due date first, then number.

**The API** (X6, X7, [backend.md](../../specs/backend.md#api))

- `GET /api/aged-balances/customers?on=` and `/suppliers?on=`. Each returns the backend's `today`, the day shown, the parts, a row per organization (id, name, each part's amount as a string of digits and its count, total, oldest days past due, items) and the totals. Sums travel as `api.CentsSum`, so a sum past 2^53 cents stays exact.
- `on` is a date no later than today. A later day, or something that isn't a date, is a 422 with a message beside the field, in `aging/schemas.py`'s `FIELD_MESSAGES`. Without `on`, it's today.
- The routes only read, so `POST`, `PATCH` and `DELETE` get a 405. Three reads of the database whatever the number of records (X20).

**The frontend, between files** (X7 to X17)

- `aging/queries.ts`: the reply types and one read, keyed by the view and the day, with `keepPreviousData`, so changing the day doesn't blank the table. It follows `useToday`, so it reads again when the day changes (X9).
- `aging/AgedBalances.tsx` keeps `view` and `on` in the address with `useAddress`, drops a bad or future `on`, and doesn't write today (X8). It owns the title, the date picker, the Customers and Suppliers toggle group, the "Balances as of" line, "Back to today" and the failed-read and loading states.
- `aging/AgedTable.tsx` draws the legend, the rows, the open rows' items, "Show 25 more" and the totals row. The open rows and the count shown are component state, not the address, and they reset when the view or the day changes.
- `aging/AgedBar.tsx` is one organization's bar: a Recharts `BarChart` laid out horizontally and stacked, with no axes, built from `ChartTooltip` and `useSize`, over a shared scale (the largest total in the view), 2px gaps and 4px rounded ends, a part under 3px drawn 3px wide. Bar widths are drawn from `Number(cents)` as `HowLate` does. The sums beside them are exact.
- Nothing in `aging/` imports another area. The links to organizations, invoices and bills are plain addresses.

### Docs

| File | Change |
|---|---|
| `docs/spec.md`, `docs/specs/*.md` | Already updated on this branch. The build adds whatever it settles |
| `docs/STATUS.md` | Aged balances added to what's done, at the end. The run notes say the Accounting menu's Aged balances now has its report, and that the dashboard's How late has five colors |

### Backend: new files

| File | What it holds |
|---|---|
| `backend/accountable/aging/__init__.py` | Empty |
| `backend/accountable/aging/ages.py` | The five parts, `part_of`, the order of organizations, and adding items into rows and totals, all plain functions of values (X1, X10) |
| `backend/accountable/aging/schemas.py` | The reply models and `FIELD_MESSAGES` for `on` (X7) |
| `backend/accountable/aging/router.py` | The two routes and their queries (X2, X3) |
| `backend/tests/test_aged_balances.py` | The parts, the rows and the routes (see Proof) |
| `backend/tests/test_aged_balances_books.py` | The totals against the books' balances, on a series of days (X4, X18). Its own file, because `test_books_checks.py` may not be edited (J11) |

### Backend: existing files

| File | Change |
|---|---|
| `backend/accountable/main.py` | Imports `aging` and adds `Area(routers=[aging_router.router], messages=aging_schemas.FIELD_MESSAGES)` to `AREAS`, at the end with a comment saying it keeps no records, holds nothing and gives no search kinds or cash |
| `backend/accountable/invoices/sample_data.py` | `OVERDUE` goes from one invoice in each of 1 to 30, 31 to 60, 61 to 90 and over 90 days to two in each, for two different organizations in each group, some part paid. The not-yet-due group already has more than two. Some customers get a not-yet-due invoice and a late one, and one has invoices in three late groups (X19). The count of 33 invoices stays: the extra overdue ones are won deals that were paid before and are now left unpaid or part paid, and the rule that each month has a payment stays true |
| `backend/accountable/bills/sample_data.py` | Unpaid bills for two different suppliers in each of the five parts, and one supplier with bills in several parts (X19), by leaving more existing bills unpaid and dating them from the seeding day, as `left_overdue` bills are today. The count of 85 stays. Nothing is paid before the cash flow's first day, and 6 stay due in the next 30 days (E22) |
| `backend/tests/test_layout.py` | `AREAS` gains `aging`. `aging` is a later area that may import only `crm/tables`, `invoices/tables` and `bills/tables` (its own folder, and no `books`, `company`, rules or routes). The rule today is one `BUILT_ON` table for every later area, so it becomes a table for each area: the existing three keep what they may import, and only `aging` may import invoices' and bills' tables. A case proves `quotes` importing `invoices.tables` is still refused. A case proves `aging` imports nothing of `books` |
| `backend/tests/test_sample_data.py` | `test_one_overdue_in_each_group_of_how_late` becomes two organizations in each group. A new case for X19, in both views |
| `backend/tests/test_every_route.py` | Picks up the two routes by name |
| `backend/tests/limits_data.py`, `backend/tests/test_limits.py` | Nothing in the data. The two views are added to the timed and the query-counted routes |

### Frontend: new files

| File | What it holds |
|---|---|
| `frontend/src/components/charts/lateness.ts` | The five parts' keys, labels and colors (X12) |
| `frontend/src/aging/queries.ts`, `AgedBalances.tsx`, `AgedTable.tsx`, `AgedBar.tsx` | As above |
| `frontend/src/aging/test-aged.ts` | The tests' replies for a today of Nov 5, 2026, and the chart's size, as `cashflow/test-cash-flow.ts` does |
| `frontend/src/aging/AgedBalances.test.tsx`, `AgedTable.test.tsx`, `AgedBar.test.tsx` | See Proof |
| `e2e/aged-balances.spec.ts` | See Proof |

### Frontend: existing files

| File | Change |
|---|---|
| `frontend/src/styles.css` | `--color-deep-raspberry` in `@theme` and in the dark block |
| `frontend/src/invoices/charts/HowLate.tsx` | Takes the names and colors from `lateness.ts`, so the five bars have five colors |
| `frontend/src/App.tsx` | Imports `AgedBalances` from `aging/` and uses it for `/accounting/aged-balances`. `books/pages/AgedBalances.tsx` is removed with `rm`, not through git |
| `frontend/src/books/links.ts` | No change. The link stays |
| `frontend/src/layout.test.ts` | `AREAS` gains `aging`, and a case that `aging/` imports no other area |
| `frontend/src/books/AccountingPage.test.tsx` | Aged balances leaves the placeholder cases, which are now three pages |
| `frontend/src/App.test.tsx` | The route table at line 562: `/accounting/aged-balances` no longer says "What customers owe" as a placeholder. It is checked for the page's title and its Customers control, and the reply for `/api/aged-balances/customers` is added to the test replies |
| `frontend/src/invoices/MoneySection.test.tsx` | The color checks at lines 68 and 69 become one for each group, in the five colors |

### Tests that state what the changes touch

Searched before the work and again at the end, and the build lists each in `docs/STATUS.md` if it changes:

- Everything that counts overdue sample invoices or bills: `test_sample_data.py` (the bills test counting 3 overdue and 6 due soon, the invoices counts of overdue and part paid), `test_bills_dashboard.py`, `test_invoices.py`, `test_cash_flow.py`, `test_cli.py`, `test_migrations.py`. These read the sample data, so the re-dating can move a figure.
- The end-to-end tests that read sample figures from the dashboard: `e2e/dashboard.spec.ts` (How late at line 381), `e2e/invoices.spec.ts` (line 298), `e2e/bills.spec.ts`, `e2e/cash-flow.spec.ts`, `e2e/data.spec.ts`, `e2e/stress.spec.ts`.
- Where the number of Accounting pages shows: `e2e/accounting.spec.ts` (it expects each page to say "This report is coming soon."), `e2e/menu.spec.ts`, `components/UserMenu.test.tsx`. The menu is unchanged, so only the first changes.
- Where the colors of How late are checked: `MoneySection.test.tsx` above, and the e2e at `dashboard.spec.ts:381`.

## Order of work

Six phases. Each ends with `npm run check:quick` passing. Each new test is seen to fail once, by breaking your own copy of the code it covers and then putting your copy back, never through git. Every unit test runs in under a second on this computer: no sleeping, no real timers, today passed in.

### Phase 1: the parts and the backend reads

1. `aging/ages.py`, `schemas.py`, the empty `__init__.py`, and `test_aged_balances.py`'s first cases against `ages.py` alone: the boundary days of X1, the agreement with `figures.late_group`, the order of X10.
2. `aging/router.py` and its registration in `main.py`, then the cases through the routes: each invoice and bill on the boundary days with the day fixed (the router takes today from a function the tests replace, as the dashboard's tests do), payments and paid dates before, on and after the day, items issued or dated after the day, drafts and void invoices, an organization in both views, the empty views, the 422s.
3. `test_layout.py`'s per-area table, so the rules are in place for what imports what.
4. `test_every_route.py`'s names.

Done when `npm run check:quick` passes.

### Phase 2: agreement with the books, and the sample data

1. `test_aged_balances_books.py`: a small set with known answers, then the sample data, comparing each view's total with `GET /api/books/balances` on a series of days. Run it before the sample changes, to see the agreement hold on the data as it stands.
2. The sample data's changes in invoices and bills, with `test_sample_data.py`'s new and changed cases. Seed a temporary database and read both routes, to see two organizations in each part in each view and bars of more than one color, before any screen exists.
3. Search the tests listed above and fix each figure the re-dating moves.
4. `limits_data` through `test_limits.py`: the views under 200ms and in a few reads at the Q1 limits.

Done when `npm run check:quick` passes.

### Phase 3: the colors, shared with the dashboard

1. `styles.css`'s token, `components/charts/lateness.ts`, `HowLate.tsx`, and `MoneySection.test.tsx`'s changed checks.
2. Run the app on a temporary database (`ACCOUNTABLE_DB=<scratchpad>/accountable.db npm run dev`) and look at the dashboard's How late in both modes. Stop the server by its process ID after.

Done when `npm run check:quick` passes.

### Phase 4: the page

1. `aging/queries.ts`, `test-aged.ts`, then `AgedBar.tsx` with its test: the five parts in order, the shared scale, a tiny part drawn 3px wide, the tooltip's words, the table behind it.
2. `AgedTable.tsx` with its test: the row's contents, opening and closing by mouse and keyboard, several open at once, the items' links, "Show 25 more", the totals row covering every organization, the empty state.
3. `AgedBalances.tsx` with its test: the address (`view`, `on`, dropped when bad or in the future, today not written), the picker's maximum, "Back to today", the toggle group's arrow keys, the failed read and Try again, loading, and reading again when the day changes.
4. `App.tsx`'s route, the removal of the old placeholder, and the existing tests' changes.

Done when `npm run check:quick` passes.

### Phase 5: end to end

1. `e2e/aged-balances.spec.ts`, then `e2e/accounting.spec.ts`'s change. Each wait is for the exact thing the next step needs, such as the row or the reply to the read it just caused, never the page being quiet.
2. Run them with `npm run e2e -- e2e/aged-balances.spec.ts`, then the other e2e files the changes touch, one at a time.

Done when those pass.

### Phase 6: finish

1. Update `docs/STATUS.md`, and any spec file the build settled something in. Check the tree in `docs/specs/architecture.md` against the files that exist.
2. Stop every server and background command started, by process ID, and check the ports are free.
3. Run `npm run check:quick` and fix failures in the code. The full `npm run check`, with the end-to-end and speed tests, is run by the lead on their own computer.

## Risks

- **The books and the page can't be allowed to agree by sharing code.** A page that reads the journal would pass its own comparison. It reads the records, and the comparison reads the journal. If they differ, the cause is found before either is changed.
- **Voided invoices and the past.** An invoice voided today was owed last month in real life, but the books show it never existed (J6), and X4 says the totals equal the books. The page follows the books. If this surprises the owner, it is a change to J6 and not to this page. Called out in the intent's Decisions.
- **A payment dated before its invoice's issue date** can't be saved (V-rules), so an item is never owed a negative amount. The code still handles it: an item with a negative amount is shown, never dropped, so the totals can't drift from the books.
- **The sample data is the largest risk to the existing tests.** More overdue and unpaid records move the dashboard's figures, the cash flow's forecast and several e2e expectations. Re-date existing records rather than add any, search for every test that reads them, and run the affected e2e files one at a time. Journal entries and the counts of 33 invoices and 85 bills stay as they are.
- **Layout rules.** `aging` reads two later areas' tables. The rule is widened for it alone, and a case keeps `quotes` and the others out of invoices' and bills' tables.
- **Many charts on a page.** One Recharts chart per row is heavy, so the page cuts the list to 25 and the stress run times a view at the Q1 limits. The jsdom tests give the chart a fixed size and are kept small so they stay under a second. If a render test goes over, it renders fewer rows rather than loosening the limit.
- **Dark mode.** Deep Raspberry is 2.57:1 against the dark panel, below 3:1. The parts are always also in the table and the tooltip by name and amount. ui-check looks at it in dark mode.
- **A day after midnight.** The default day follows today, but a chosen day doesn't. A test moves the fake clock across midnight with a chosen and an unchosen day.
- **The toggle group** is the first of its kind. It must be reachable by keyboard with a visible focus ring (Q3), and the arrow keys must move between the two views. The e2e test uses the keyboard.
- **Speed.** Every unit test runs in under a second here, and CI is slower. No test seeds a full sample database where a small set of rows will do, apart from the two that need the sample data. Those use the shared seeded fixture the other sample tests use.

## Proof

`npm run check:quick` runs the unit tests and the code checks, and must pass. The end-to-end tests are run with `npm run e2e` as listed. The existing tests must still pass, with only the changes listed under Files that change.

The intent's success criteria:

1. `npm run check:quick` passes at the end of Phase 6, and the lead's `npm run check` passes.
2. Each organization's parts add up to what it owes, and the totals equal Receivable and Payable on the chosen day: `test_aged_balances.py` for the sums, `test_aged_balances_books.py` for the books.
3. Tests with fixed dates prove which part each invoice and bill falls in, including the boundary days: `test_aged_balances.py`.
4. On a fresh copy with the sample data, both views have customers and suppliers in every part and the page looks like it belongs: `test_sample_data.py`, `e2e/aged-balances.spec.ts`, then ui-check.

### Unit tests: backend (pytest)

| File | What it proves | Requirements |
|---|---|---|
| `test_aged_balances.py` (new) | `part_of` on days past due -1, 0, 1, 30, 31, 60, 61, 90 and 91, and agreeing with `figures.late_group` on every day from -5 to 400 | X1 |
| `test_aged_balances.py` | Through the routes, with the day fixed: an invoice and a bill due 0, 1, 30, 31, 60, 61, 90 and 91 days before the day are each in the right part, and due on the day and the day after are Not yet due | X1, X18 |
| `test_aged_balances.py` | A payment dated before, on and after the day counted or not, a part payment leaving the rest owed, a fully paid invoice not listed, a bill paid before, on and after the day, an invoice issued or a bill dated after the day not counted, a draft and a void invoice never counted, whatever the day | X2, X3 |
| `test_aged_balances.py` | Every row's five parts add up to its total, the totals row's parts add up to its total, and the totals equal the rows' sum, in whole cents, with sums past 2^53 exact as strings | X4, X6 |
| `test_aged_balances.py` | An organization that is both customer and supplier is in each view with that view's figures only | X5 |
| `test_aged_balances.py` | The order: oldest days past due first, ties on amount, then name ignoring case, then id, an organization with only money not yet due after every late one and ordered by amount, and an organization owing nothing left out | X10 |
| `test_aged_balances.py` | The items: the open invoices or bills of each row, oldest due date first then number, with their id, number, due date, days past due, part and amount owed, a part-paid invoice showing what's left | X15 |
| `test_aged_balances.py` | `on` later than today refused with the message, not a date refused, none meaning today, a day before any record giving the empty view, `POST`, `PATCH` and `DELETE` giving 405 | X7, X17 |
| `test_aged_balances_books.py` (new) | On a small set with known answers and on the sample data, Customers' total equals the Receivable balance and Suppliers' the Payable balance from `GET /api/books/balances`, to the cent, on today and on a series of earlier days: the day before the first invoice, an invoice's issue day, a payment's day, a bill's paid day, the day after it, a day when an invoice is voided today (so the books and the page both leave it out) and one before the sample data begins | X4, X18 |
| `test_sample_data.py` | In each view, two organizations have money in each of the five parts, and several have money in more than one part, on several seeding days, the 1st of a month included. The counts of 33 invoices and 85 bills stay, the four checks of the books still hold, and Cash today still equals the cash flow's | X19, J11, J13 |
| `test_layout.py` | `aging` is found as an area, imports only `crm`, `invoices` and `bills` tables, imports nothing of `books` or `company`, and `quotes` is still refused invoices' tables | Layout rules |
| `test_every_route.py` | The two routes refuse anyone not signed in, a wrong host and a NUL in a value | Security, U7 |
| `test_limits.py` | At the Q1 limits each view arrives in under 200ms, in a handful of reads whatever the number of records | X20, Q1 |

### Unit tests: frontend (Vitest)

| File | What it proves | Requirements |
|---|---|---|
| `aging/AgedBar.test.tsx` (new) | Five parts in order with the right colors, a shared scale so the largest fills the column and a smaller one is shorter, a part under 3px drawn 3px, no segment for a part with nothing, the table behind the bar for screen readers, and the tooltip giving the organization, the part with its swatch, its amount and its count | X11, X13 |
| `aging/AgedTable.test.tsx` (new) | The columns, amounts with cents in JetBrains Mono, $0.00 in muted ink for empty parts, the legend, rows opening and closing with a click, Enter and Space, with `aria-expanded`, several open at once, items linking to invoices or bills, the name linking to the organization, "Show 25 more" showing the next 25 and the totals row covering every organization, and the empty states in both views | X11 to X17 |
| `aging/AgedBalances.test.tsx` (new) | `view` and `on` read from and written to the address, a bad or future `on` dropped, today not written, the picker's maximum, "Balances as of" and "Back to today", the toggle group by mouse and arrow keys, a failed read with Try again, loading, and reading again when the clock passes midnight, for today only | X7 to X9, X17 |
| `invoices/MoneySection.test.tsx` | How late's five bars are in the five colors, in order | X12, V29 |
| `books/AccountingPage.test.tsx` | The three placeholders say "This report is coming soon." with their sentences | J16 |
| `App.test.tsx` | `/accounting/aged-balances` opens the new page, and the other three the placeholders | J15 |
| `layout.test.ts` | `aging/` is an area and imports no other | Layout rules |
| `colors.test.ts` (unchanged) | Still passes, so Deep Raspberry and every part color come from tokens and have dark values | Visual design |

### End-to-end tests (Playwright Test)

| File | What it proves | Requirements |
|---|---|---|
| `e2e/aged-balances.spec.ts` (new) | On a fresh copy, Aged balances opens from the menu on Customers, with organizations in every part, bars of several colors, the totals row, and the totals equal to the dashboard's Owed to us. A row opens to its invoices, which link to them, and Suppliers does the same with bills and What we owe. Picking an earlier day changes the figures and keeps the day in the address, a reload shows the same report, and Back to today returns. All by keyboard too, with the focus ring, in light and dark mode | X7 to X15, X19 |
| `e2e/accounting.spec.ts` | Aged balances is no longer a placeholder, the other three are, and all four are still in the menu | J15, J16 |
| `e2e/dashboard.spec.ts`, `e2e/invoices.spec.ts` | How late still shows five groups, and with the sample data's new dating its figures still agree with Owed to us | V29 |
| `e2e/stress.spec.ts` | Either view, at the Q1 limits, shows its first 25 rows within the time the tables are allowed to open in | X20, Q1 |
