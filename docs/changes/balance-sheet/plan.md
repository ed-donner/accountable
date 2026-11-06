# Plan: balance sheet

This plan turns the balance sheet intent, and the spec already updated on this branch (`docs/specs/balance-sheet.md`, X1 to X18), into build work: which files change, in what order, what could go wrong and how we'll know it works. Ids such as X5 and J12 are the spec's requirements. The intent wins over the spec, and the spec wins over this plan. If the build shows the spec is wrong, fix the spec in the same change and say so in `docs/STATUS.md`.

The plan ends with the build. ui-check and the review come after it, and so does `docs/IMPROVE.md`.

There's no new dependency. The slider is a native range input, the bars are Recharts, the dialog is Radix's, the icons are lucide-react, and the data comes through TanStack Query, all already in use.

## Files that change

### What the parts agree on

**The one backend change** (X15, J12)

- `GET /api/books/entries` takes `account` more than once. `books/schemas.py`'s `AccountQuery` is one checked key, so the route's parameter becomes a list of them, `list[AccountQuery]`, still checked key by key with the same message beside the field. With none given, nothing is filtered, as now. With one, the reply is as it is today.
- `_matching` in `books/router.py` keeps its single `exists` over `journal_lines` and changes its condition from `account == key` to `account.in_(keys)`. One `exists` means an entry with lines in two of the accounts appears once, and the count and the page agree, so paging stays right. No join, no `distinct`.
- Nothing else on the backend changes: no new route, table or migration. `GET /books/balances?on=` already gives every account's balance, and `from` is already optional on the entries route, so "from the start of the books" is no `from` at all.

**The figures, in one place** (X2 to X6, X12)

`frontend/src/books/balance.ts` has no React in it and works in BigInt, so every sum is tested on its own and nothing passes through a number:

- `stops(today)`: the 12 stops, oldest first, each `{ day, label, year }`, from the device's today as `useToday()` gives it: the last day of each of the 11 months before this one, then today. The label is the month's three letters, "Today" for the last. `year` is set on the first stop and each January's, which are the ones with the year under them.
- `figures(balances)`: from the reply's `{ key, balance_cents }` strings, the six rows as `{ id, name, color, cents }` in the columns' order, left Cash, Receivable, right Payable, Tax payable, Owner's equity, Profit to date. Profit to date is Revenue less the six expense accounts, and the account keys come from one list in this file, with the names from J1, so the page names an account in one place.
- `totals(figures)`: the two totals and the difference, `left - right`, and `balanced` when it's zero.
- `effect(entry, accounts)`: an entry's effect on a figure from its lines, by J2's sides, for one account or, for Profit to date, the revenue and expense accounts together, as a BigInt. This is what the dialog's rows show, so the rows add up to the figure (X12).
- `EVENT_WORDS`: X13's twelve phrases, keyed by the event.

**Reads** (X10, X14)

`frontend/src/books/queries.ts` has the reply types, `balancesOn(day)`, `useBalances(day)` and `useEntries(accounts, day)`:

- `useBalances` is `useQuery` keyed `["books", "balances", day]`, with `placeholderData: keepPreviousData` so a day still on its way keeps the day before's figures on screen. The page prefetches the other eleven days with `queryClient.prefetchQuery` once the first has landed. Every query sits under `["books", ...]`, so the invalidation after a save, which every read has (Frontend), reaches them all.
- `useEntries` is `useInfiniteQuery` over `limit=100` and `offset`, keyed by the accounts and the day, with `to=<day>` and no `from`, and `account` repeated for each account. Its `total` is the reply's, and "Show more" is `fetchNextPage`.

**Colors** (X7, [Visual design](../../specs/visual-design.md#stage-chip-and-chart-colors))

Each account has one Tailwind color class and one CSS variable: Cash `sea-green`, Receivable `marigold`, Payable `coral`, Tax payable `cerulean`, Owner's equity `ink`, Profit to date `bar-soft`. All six tokens are in `styles.css` already, so there's no new color value, and `colors.test.ts` holds. The bars take the variable through `fill`, and the swatches the class, from the one table in `balance.ts`.

### Docs

| File | Change |
|---|---|
| `docs/spec.md`, `docs/specs/*.md` | Already updated on this branch. The build adds whatever it settles |
| `docs/STATUS.md` | The balance sheet added to what's done, at the end: the page, the `account` change, `StackSegment`'s move, the tests, and anything in the spec the build changed |

### Backend: existing files

| File | Change |
|---|---|
| `backend/accountable/books/schemas.py` | `AccountQuery` stays the checked key. `ENTRIES_ACCOUNTS`, a `list[AccountQuery]` for the route, is added beside it. `FIELD_MESSAGES` is unchanged |
| `backend/accountable/books/router.py` | `entries` takes `account` as a list, and `_matching` filters with `in_` inside its one `exists` (X15) |
| `backend/tests/test_books_reads.py` | Tests for the repeated `account` (below) |
| `backend/tests/test_sample_data.py` | A test for X18 (below). If it finds a stop with an empty account, the sample data is fixed in the file that writes it |

The sample data's own files change only if the X18 test fails, which this plan can't know before the test runs. If it does, the fix goes in the file that writes the thing that's missing, `invoices/sample_data.py` or `bills/sample_data.py`, and `docs/specs/running.md`'s M3 stays as it already says.

### Frontend: new files

| File | What it holds |
|---|---|
| `frontend/src/books/balance.ts` | `stops`, `figures`, `totals`, `effect`, `EVENT_WORDS` and the account table, as above |
| `frontend/src/books/balance.test.ts` | Their tests, with no React |
| `frontend/src/books/queries.ts` | The reply types, `useBalances`, `useEntries` and the background reads |
| `frontend/src/books/DateSlider.tsx` | The native range input with `min=0`, `max=11`, `step=1`, `aria-label="Date"` and `aria-valuetext` the day written out, the thumb and track styled with CSS in `styles.css`, and the stops' ticks and names under it. The chosen name is ink and semibold, the year sits under the first and each January |
| `frontend/src/books/BalanceBars.tsx` | The two stacked bars as Recharts' `BarChart` with `StackSegment`, one shared `stackScale`, the money axis on the right, `ChartTooltip` for the tooltip, and the table behind the chart for screen readers, built as `MonthsTable` is. An account at zero or below gets no segment |
| `frontend/src/books/BalanceColumns.tsx` | The two columns of rows, each a swatch, a name and a button with the figure, each column's total, and the mark: the Sea Green chip with the Check icon when equal, the Alert chip with TriangleAlert and the difference sentence when not |
| `frontend/src/books/EntriesDialog.tsx` | The dialog of X11 to X14, built on the Radix dialog as the cash flow's `MonthDialog` is, with its rows, the figure at its top, "Showing 100 of 230", Show more, `LoadFailed` with Try again, and focus back to the figure that opened it through `onCloseFocus` |
| `frontend/src/books/DateSlider.test.tsx`, `BalanceBars.test.tsx`, `BalanceColumns.test.tsx`, `EntriesDialog.test.tsx` | One test file for each piece |
| `frontend/src/books/pages/BalanceSheet.test.tsx` | The page as a whole, with the replies stood in |
| `frontend/src/books/test-balance.ts` | The replies the balance sheet's tests share, for a today of Nov 5, 2026, and the chart's size, as `cashflow/test-cash-flow.ts` does |

### Frontend: existing files

| File | Change |
|---|---|
| `frontend/src/books/pages/BalanceSheet.tsx` | Replaces the placeholder with the page: the title, the panel, the chosen day, the slider, the bars and the columns. It holds the chosen stop's index in state, starts on the last, and keeps its place from the right when the day changes (X2) |
| `frontend/src/components/charts/StackSegment.tsx` | Moved here from `bills/charts/`, unchanged, with `STACK_GAP`, `LEAST_HEIGHT`, `stackScale` and `StackScale` |
| `frontend/src/bills/charts/DueTimeline.tsx`, `SpendingChart.tsx`, `MoneySection.test.tsx` | Import `StackSegment` from `components/charts/` |
| `frontend/src/styles.css` | The slider's track, fill and thumb, with the focus ring, in the tokens. The thumb is `--color-ink` with a 2px ring in `--color-panel`, and the fill is `--color-sea-green` |
| `frontend/src/App.tsx` | No change to the routes: `/accounting/balance-sheet` already renders `BalanceSheet`. The import and the route stay |
| `frontend/src/layout.test.ts` | A test that `books/` still imports no other area, and that `components/charts/StackSegment.tsx` imports no area |

### Tests: existing files that state something this change alters

Searched for "Balance sheet", "What the business owns" and the placeholders' words in `frontend/src`, `e2e` and `backend/tests`:

| File | Change |
|---|---|
| `frontend/src/books/AccountingPage.test.tsx` | `PAGES` drops Balance sheet, since it isn't a placeholder, so the placeholder tests run on Profit and loss, Journal and Aged balances |
| `frontend/src/App.test.tsx` | The list of placeholder pages at line 560 drops Balance sheet. The menu test at line 598, which opens the page from the menu and checks its heading, stands in the balances reply, so the page doesn't show a failed read |
| `frontend/src/components/UserMenu.test.tsx` | No change: the four links are the same |
| `e2e/accounting.spec.ts` | `PAGES` keeps the four links and their paths, but Balance sheet's `words` go and its page is checked by the new file instead. The test that checks each page's words checks only the three placeholders'. The placeholder tests that read nothing from the backend leave Balance sheet out |
| `e2e/menu.spec.ts` | No change: the menu's links are the same |
| `e2e/stress.spec.ts` | A test that Profit to date's entries, with `account` given seven times, arrive in under 200ms (Q1, X15) |

### E2E: new file

| File | What it holds |
|---|---|
| `e2e/balance-sheet.spec.ts` | The page on a fresh copy, at every stop, with the keyboard, the dialog, a payment, an invoice, a bill dated after today and the computed styles, as Proof says |

## Order of work

Each phase ends with its tests passing, using `npm run check:quick` to check as we go. The end-to-end tests are written but not run here; the lead runs them on their own computer.

### Phase 1: the entries route takes several accounts

1. Write the new tests in `test_books_reads.py`, then run them and watch them fail: today a repeated `account` keeps only the last value, or the first, so the entry that touches the other account is missing.
2. Change the schema and `_matching`.
3. Run `test_books_reads.py` and the rest of the backend's tests, and see them pass.

### Phase 2: the sample data, before the page leans on it

1. Write the X18 test in `test_sample_data.py`. It seeds a database with today fixed, reads `GET /books/balances` for each of the 12 stops, and asserts every one of the six accounts, Profit to date included, is above zero.
2. Run it with today fixed on a few days that have tripped the sample data before: the 1st of a month, the last day of a month, and Jan 1.
3. If it fails, fix the sample data in the file that writes what's missing, run the sample data's tests, the books' checks and the cash flow's tests, and note the fix in STATUS.md. If it passes, say so there.

### Phase 3: move `StackSegment`

1. Move the file with `mv`, change the three imports, and run the bills' frontend tests and the layout tests. Nothing else changes, so every one of them still passes.

### Phase 4: the sums and the reads

1. Write `balance.test.ts` first, then `balance.ts`, until it passes. This is where the spec's arithmetic is proven, so it's built before any React.
2. Write `queries.ts` and its tests as part of the page's tests in phase 5.

### Phase 5: the pieces, then the page

In this order, each with its test file written first:

1. `DateSlider`, with the arrows, Home, End and the stops' names.
2. `BalanceColumns`, with the figures as buttons, the totals and both marks.
3. `BalanceBars`, with the stack scale, the colors, an account at zero or below and the table behind it.
4. `EntriesDialog`, with its rows, the paging, its failed read and its focus.
5. `BalanceSheet`, which puts them together with the reads, and its tests: moving the slider, the days read in the background, the previous day's figures held while one is on its way, and the failed read.
6. Update the existing tests in the table above.

### Phase 6: end to end

1. Write `e2e/balance-sheet.spec.ts` and update `accounting.spec.ts` and `stress.spec.ts`.
2. Start the app on a temporary database as AGENTS.md says, with `ACCOUNTABLE_DB=<scratchpad>/accountable.db npm run dev`, to look at the page once in light and dark mode at 1440 by 900, and to read the 12 stops against `/api/books/balances` by hand. Stop the server by its process ID, and check its ports are free.

### Phase 7: finish

1. Update `docs/STATUS.md`, and any spec file the build changed.
2. Run `npm run format`, then `npm run check:quick`, and fix what fails in the code, not the rules.

The build ends here. ui-check and the review come after it.

## Risks

- **The sample data may not fill every stop (X18).** Profit to date is the likeliest to fail: an early month with big bills and a small invoice would leave it at or below zero, and Tax payable needs an invoice with tax issued in the first month. Phase 2 tests it before anything is built on it, with today fixed on awkward days, and fixes the sample data, not the page, as the intent decides.
- **A tiny segment, or a loss.** An account at zero or below has no segment, so a bar can be shorter than the other when Cash is overdrawn or Profit to date is negative, and the two sides look unequal though the figures say otherwise. The mark and the figures carry the truth, and the tests cover a loss and an overdrawn Cash.
- **The bars on one scale.** `stackScale` makes room for tiny segments, so the axis top can come out a step above the larger side. Both bars use the one scale, so they stay the same height, and the test checks it with balanced figures and with a difference.
- **A sum past what a number holds.** The figures arrive as strings of digits (J12). `balance.ts` uses BigInt for every sum, difference and effect, and the bars alone convert to numbers, for heights, which is close enough at any size. The tests use figures past 2^53 cents.
- **A slider move that flashes.** If the day's figures aren't read yet, the chart must not go empty. `keepPreviousData` holds the last day's, and the eleven background reads mean it's rare. The test holds a read open and checks the old figures stay.
- **Stale figures after a save.** Every read under `["books"]` is invalidated by the app's own rule after any save. A test records a payment through the API and finds the new figure after a reload.
- **The days shifting under the page.** The stops come from the device's today, and past midnight the last stop becomes a new day. The page keeps its place from the right, and `useToday` already triggers a re-render when the day changes. A test moves the clock a day and finds the stops and the keyed reads follow.
- **An entry dated after today.** A bill can be dated next week. Today's stop must leave it out (X3), and the route's `on` already does. The end-to-end test adds one and checks it.
- **Profit to date's dialog.** Its entries are those touching revenue or any expense account, and an entry touches only one of the two kinds, so the effects add up to the figure without counting any line twice. The test checks the sum against the figure for the sample data, and against an entry that touches two of the accounts, which only the route's test has.
- **The native slider's look.** A range input is styled with vendor pseudo-elements in `styles.css`, and their focus ring and the thumb's ring in the panel color must show in both modes. ui-check looks at it afterwards. The plan keeps its parts to what the tokens already give.
- **Unit tests under a second on a slow machine.** Recharts in jsdom is the slow part. The sums are tested without React, each piece's test renders only that piece, and only a few tests render the chart, at the cash flow's own stand-in size. A test that gets near half a second here is cut back, not left.
- **The dialog's paging.** `useInfiniteQuery` offsets move if an entry is posted between two reads, so a row can repeat or be skipped. The dialog drops a repeated entry by its id, and the page says how many it's showing of the total from the first read, which is exact in the usual case. The books have no route that changes an entry, and a new entry would be dated by its own day, so this is only a risk near today.
- **Opening a figure of a day other than the chosen one.** The dialog is keyed by the day it was opened on, and holds it, so moving the slider behind an open dialog can't change its list. The dialog is modal, so the slider can't be moved anyway, and a test checks the title and the figure agree.

## Proof

The tests are written before the code they test, in the phases above. Each of these passes before the change is called finished, apart from the end-to-end tests, which the lead runs.

### Unit tests: backend (pytest)

- `backend/tests/test_books_reads.py`, in the books' small dataset with today fixed (X15, J12):
  - two accounts given together keep an entry that touches either, once, however many of its lines match;
  - an entry with lines in both accounts is in the page once and in the total once;
  - the revenue and the six expense accounts together give the entries whose effects, by J2's sides, add up to Profit to date on a day, to the cent;
  - `limit` and `offset` page through them with the same total on each page;
  - an account that isn't one of the twelve, anywhere in the list, gets a 422 with the message beside the field;
  - one account and no account give the replies they gave before.
- `backend/tests/test_sample_data.py`, X18: on a seeded database, at each of the 12 stops, Cash, Receivable, Payable, Tax payable, Owner's equity and Profit to date are each above zero, and the left side equals the right, with today fixed on an ordinary day, on the 1st, on a month's last day and on Jan 1.
- The existing `test_books_checks.py` is not edited, and the existing books, cash flow, sample data and layout tests keep passing.

### Unit tests: frontend (Vitest)

- `frontend/src/books/balance.test.ts` (X2 to X6, X12), each test quick:
  - `stops`: 12 stops on an ordinary day, ending in today; on the 1st, where today is the first of the month; on a month's last day, where today is that month's stop; across January; and on Feb 29 in a leap year, where February's stop is the 29th and a non-leap year's the 28th. The labels, "Today", and the year on the first and each January;
  - `figures`: the six rows in the columns' order from a reply of strings of digits; Profit to date as Revenue less each of the six expense accounts; a loss as a negative; Cash below zero kept;
  - `totals`: the two totals; equal sides; the left higher and the right higher, each with its difference; a difference of one cent; sums past 2^53 cents exact;
  - `effect`: a debit adding to an asset and a credit taking away, the other way for a liability and for equity, and for Profit to date a credit to Revenue adding and a debit to an expense taking away, an entry with lines in two of the accounts adding both, and a reversal giving the opposite of its entry, so the two sum to zero;
  - `EVENT_WORDS` has a phrase for each of the twelve events, and the same words as X13.
- `frontend/src/books/DateSlider.test.tsx` (X9): the input's name is "Date", it has 12 steps, its value text is the day written out, each of the arrows, Home and End moves it to the stop the spec says and calls `onChange` with it, the stops' names, the chosen one in ink and semibold, the year under the first and each January, and the focus ring shows on the thumb.
- `frontend/src/books/BalanceColumns.test.tsx` (X4 to X6, X11): the two columns' headings and rows in order; each account's figure is a button and each total isn't; a figure below zero has its minus sign and counts in the total; the equal mark with its words; and, when the sides differ, the Alert chip, "Out of balance" and the sentence naming the higher side and the difference, in both directions; clicking a figure calls for its dialog, with Profit to date's separate.
- `frontend/src/books/BalanceBars.test.tsx` (X7, X8): two bars on one scale, equal in height when the figures balance and not when they don't; each segment in its account's color from the tokens; none for an account at zero or below; a segment too small to see kept 4px tall; the tooltip's account, figure and day; the table behind the chart gives every figure.
- `frontend/src/books/EntriesDialog.test.tsx` (X11 to X14): the title and the figure at its top for an account and for Profit to date; rows newest first with the date, the words, the link to the source's page, who made it unless nobody is recorded, and its effect with a minus sign when it takes the figure down; the rows' effects adding up to the figure; "Showing 100 of 230" and Show more reading the next 100 and dropping a repeated entry; no entries; a failed read with Try again, and a list read before showing while it's read again; Close and Escape close it and focus goes back to the figure.
- `frontend/src/books/pages/BalanceSheet.test.tsx` (X1 to X3, X10, X16, X17), with the replies stood in and today fixed: the page opens on today with the title, the day written out and the figures; moving the slider redraws the bars and the figures from the day's reply and reads each day once; the other eleven days are read after the first; a day still on its way keeps the day before's figures; a day with no entries shows $0.00, empty bars, the equal mark and "Nothing in the books by this date."; a failed read shows "Couldn't load this." with Try again and leaves the slider working; a failed refresh with figures already showing says they may be out of date; the clock moving a day moves the stops and keeps the slider's place from the right; and the page reads only `/books/balances` and `/books/entries`.
- `frontend/src/books/AccountingPage.test.tsx` and `frontend/src/App.test.tsx`, as changed in the table above, keep passing for the three placeholders and the menu.
- `frontend/src/layout.test.ts`: `books/` imports no other area, and the moved `StackSegment` imports no area.
- `frontend/src/bills/charts/MoneySection.test.tsx` and the cash flow's tests keep passing, which shows the move changed nothing.
- Every one of these, old and new, runs in under a second on this computer.

### End-to-end tests (Playwright)

The lead runs these on their own computer, with `npm run e2e -- e2e/balance-sheet.spec.ts`.

- `e2e/balance-sheet.spec.ts`, on a fresh copy with the sample data (X1 to X18). Each step waits for the exact thing it needs, such as the figure that should have changed, never for the network to go quiet:
  - the page opens from the menu on today, with its title, the 12 stops and the day above the figures;
  - moving the slider with the arrow keys from today back to the first stop, then Home and End, and at each of the 12 stops: every account's figure is above zero and equal to its balance from `/api/books/balances?on=` that day, each column's total is the sum of its figures, the two totals are equal and the mark says so, and the two bars are the same height and fill the chart;
  - the slider has the name "Date" and the day written out as its value, and shows the focus ring;
  - clicking Cash opens the dialog titled "Cash up to <day>", its entries are dated up to that day and their effects add up to the figure shown, Show more reads the next 100, and Escape closes it with focus back on Cash;
  - clicking Profit to date lists the entries that touch Revenue or an expense account, and their effects add up to the figure;
  - an entry's link opens the invoice, bill or Company settings page it came from;
  - issuing an invoice and recording a payment through the API, then reloading, show Receivable and Cash as the books say, with the sides still equal;
  - a bill dated after today is left out of today's stop, and the page balances;
  - the computed styles: the figures are in JetBrains Mono, the swatches and bar segments take their tokens, and the mark is Sea Green with Midnight text, in light and dark mode, and the ink segment turns Sea Mist in dark mode;
  - the console has no errors, and the top bar's nine sections are as they were (Q2, Q3).
- `e2e/accounting.spec.ts`, as changed above: the four links and their paths still work, the three placeholders say their words, and Balance sheet is left to its own file.
- `e2e/stress.spec.ts`: Profit to date's entries, with seven accounts given, and the balances for a day, arrive in under 200ms at the limits in Q1 (Q1, J14, X15).
- `e2e/menu.spec.ts` and the other existing specs keep passing.
- No new code check, rule or ignore is added. `npm run check:quick` passes here, and `npm run check` passes on the lead's computer, which runs the end-to-end and speed tests.
