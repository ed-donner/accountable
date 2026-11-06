# Intent: balance sheet

## Problem

Nobody can see what the business owns and what it owes on a given day, or see for themselves that the books balance.

## Proposed outcome

The Balance sheet page under Accounting shows two columns side by side. On the left, what the business owns: Cash and Receivable. On the right, what it owes and what belongs to the owner: Payable, Tax payable, Owner's equity and the profit to date. Each column's total sits at the bottom, with a clear mark when the two are equal. Above the columns, two stacked bars of the same height, one for each side, are made of the accounts in their own colors. A slider runs across the last 12 months, stopping at each month's end and at today. Moving it redraws the bars and the figures for that date, so you can watch the business change month by month and stay balanced. Clicking any figure opens the entries behind it, up to that date.

## Constraints

- Every figure comes from the books, as they stood at the end of the chosen date.
- The profit to date is all revenue less all expenses up to that date, since the books are never closed.
- If the two sides ever differ, the page says so plainly, with the difference, rather than hiding it.
- The slider works with the keyboard as well as the mouse.
- The bars match the dashboard's charts: the same chart library, the brand's colors in light and dark mode, and the same tooltips.
- Every unit test, old and new, runs in under a second on this computer, because CI runs on a much slower machine.
- No new dependencies unless the plan makes the case for one.

## Not in this change

- Comparing two dates side by side.
- Financial ratios.
- Exporting or printing the statement.

## Success criteria

1. npm run check passes.
2. For every date on the slider, each account's figure matches its balance in the books on that date, and the two sides are equal.
3. Clicking a figure lists exactly the entries behind it up to that date.
4. On a fresh copy with the sample data, the bars and columns are full for every month and the page looks like it belongs in the app.

## Decisions

- The slider has 12 stops, one for each of the last 12 calendar months as the cash flow counts them: each month's last day, except the current month, whose stop is today. It starts on today.
- A negative figure (an overdrawn Cash, or a loss as the profit to date) shows with a minus sign, as the books do (J2), and its bar segment has no height, so the bars never go below zero.
- Clicking an account's figure lists the entries touching that account from the start of the books to the chosen date; the profit to date lists those touching Revenue or any expense account. The totals are sums, not accounts, so they aren't clickable.
- The page reads its figures and entries from the existing `/api/books` routes, with no new backend route unless the plan shows one is needed to keep each slider move under Q1's 200ms.
- If a month of the sample data leaves a bar empty, the plan fixes the sample data, not the page, so the bars are full for every month on a fresh copy.
