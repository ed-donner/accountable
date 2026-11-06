# Intent: profit and loss

## Problem

The dashboard shows sales and cash, but nobody can see whether the business is making a profit, or where its money goes.

## Proposed outcome

The Profit and loss page under Accounting opens with a chart of the last 12 months: revenue as one bar each month, expenses beside it stacked by category in each category's color, and a bold line for the profit. Below the chart, the statement for a chosen period: revenue, each expense category, total expenses, profit, and the profit margin as a percentage. A switch picks a month, a quarter or a year, with arrows to step back through earlier periods, and each figure shows its change from the period before. Clicking any figure, in the chart or the statement, opens the entries behind it, each linking to its invoice or bill.

## Constraints

- Every figure comes from the books, never worked out again from the invoices and bills.
- Revenue counts when an invoice is issued, and expenses on the bill date, so the page explains in one line that profit isn't the same as cash.
- The expense categories use the same colors as the spending chart in the dashboard's Money section.
- The chart matches the dashboard's other charts: the same chart library, the brand's colors in light and dark mode, and the same tooltips.
- A change from a period with nothing in it shows as new, never as a percentage, and nothing divides by zero.
- Every unit test, old and new, runs in under a second on this computer, because CI runs on a much slower machine.
- No new dependencies unless the plan makes the case for one.

## Not in this change

- Budgets, or comparing against a budget.
- A cash basis view.
- Exporting or printing the statement.

## Success criteria

1. npm run check passes.
2. Each month's revenue and expenses match the books' entries for that month exactly, and the statement adds up.
3. Clicking a figure lists exactly the entries behind it.
4. The month, quarter and year switches and the arrows show the right periods, with the right changes from the period before.
5. On a fresh copy with the sample data, the chart shows a full year and the page looks like it belongs in the app.

## Decisions

- Periods are calendar months, quarters and years, and the page opens on the current one, so far (not yet finished), compared with the whole period before it; the arrows can't step past the current period.
- The chart's 12 months end with the current month, and clicking a revenue bar, a category's segment or the profit line's point opens that month's entries for it.
- Figures are net of reversing entries (a voided invoice or a changed bill nets to what is now true), and the entry list shows every entry behind a figure, reversals included, so the list adds up to the figure.
- When revenue is 0 the margin shows as "–" rather than a percentage, and its change is shown in percentage points, or as new when the period before has no margin.
- A change on a figure that is 0 in both periods shows as "–" rather than 0%, and a figure whose earlier period was 0 but now isn't shows as "new".
- The spec gets its own area file, `profit-and-loss.md` (X1 to X19), and the page reads two routes under `/api/books`, one for the figures and one for the entries behind a figure, so the books stay the only source; the other three Accounting pages stay placeholders.
- Revenue columns are ink, not Sea Green, because Sea Green is Software's color on the same chart. The profit line is ink with a panel-colored casing so it shows over the columns.
- The books can't import invoices or bills, so the entries dialog gets each record's name (invoice number, bill number and supplier) from a function each area gives `main.py`, as they give their holds and cash. A record that has been deleted shows as "Deleted bill" with no link.
- The arrows stop at the period holding the earliest entry on Revenue or an expense account, the chosen period isn't kept in the address, and the Profit margin opens Profit's entries, since the margin has none of its own.
- Changes are worked out by the backend in whole numbers, shown in plain ink with their sign and never as good or bad, since a rise in expenses isn't a fault in itself.
