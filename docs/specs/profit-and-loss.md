# Spec: Profit and loss

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Profit and loss

The Profit and loss page, the first of the Accounting pages ([J15](books.md#the-accounting-pages)), answers the question the dashboard can't: is the business making a profit, and where does its money go? It opens with a chart of the last 12 months, and under it the statement for one period, a month, a quarter or a year, with each figure's change from the period before. Every figure can be clicked to see the entries behind it. It keeps no records of its own and reads only the books ([books.md](books.md#the-books)).

### The figures

- **X1.** Every figure comes from the books' entries, never worked out again from the invoices and bills. The backend adds up the lines of the Revenue account and the six expense accounts ([J1](books.md#accounts)) over the entries dated in a period, reversals included (J6), and the page draws what it sends and adds nothing up itself, as the cash flow's does (Y19). Nothing is stored.
- **X2.** The statement has these figures, in this order:

| Figure | What it is |
|---|---|
| Revenue | The Revenue account's credits less its debits: what issued invoices charged before tax, less what voiding took back. Revenue counts on the day an invoice is issued |
| Each expense category | Software, Contractors, Travel, Office, Marketing and Other, in that order ([E6](bills.md#bills)): its expense account's debits less its credits, bills' totals with their tax (J5). Expenses count on the bill date, paid or not |
| Total expenses | The six categories added up |
| Profit | Revenue less total expenses. Below zero it's a loss, shown with a minus sign, as the cash flow's balances are (Y12) |
| Profit margin | Profit as a percentage of revenue (X3) |

  A void invoice, a deleted bill and a changed bill count as they now stand, because their reversing entries are in the same month as the entries they cancel (J6). Tax charged on invoices is Tax payable, so it's never revenue. A month's revenue is therefore the subtotals of the invoices issued in it, and the month's expenses are the totals of the bills dated in it, the figure Spending by category shows ([E22](bills.md#the-money-section)). Cash, Receivable, Payable, Tax payable and Owner's equity are not in the statement, so payments, paying a bill and the opening balance never change a figure. Because revenue and expenses are counted when they're issued or dated, not when the money moves, profit isn't the same as cash, and the page says so (X14).
- **X3.** The margin is profit divided by revenue, shown as a percentage with one decimal place, such as `23.4%` or `-8.0%`, worked out by the backend in whole numbers, a half rounding away from zero. With no revenue in the period it has no value and shows as "–", never as a number, and nothing divides by zero.

### Periods and changes

- **X4.** A period is a calendar month, quarter or year. The page opens on the current month, with the switch on Month. The switch picks Month, Quarter or Year, and keeps the day the page is on, which is a day in the period shown, so switching from March 2026 to Quarter shows Q1 2026 and switching back shows March 2026 again. After an arrow, the day is the one the backend gave it (X5), and the page opens on today. A quarter is January to March, April to June, July to September or October to December. A period labels itself as `March 2026`, `Q1 2026` or `2026`.
- **X5.** The arrows step to the period before and the one after, of the kind chosen. The current period is the latest: the forward arrow is off there, and the period shown is never after today. The back arrow is off at the period holding the books' earliest entry on Revenue or an expense account, so the page can't be taken back through years of nothing. With no such entry yet, both arrows are off. The backend gives the day each arrow goes to, or none, and the page sends it back, so the page works out no date. The switch and the arrows are buttons that can be reached by keyboard (Q3).
- **X6.** The current period is not over, and is marked "so far" beside its label. Its figures are the entries dated within the whole period, including any dated after today, such as a bill dated tomorrow, so a month's statement and the chart's column for that month always agree.
- **X7.** Each figure shows its change from the period before: the same kind, immediately earlier, in full, even when the shown period is still going. It's worked out by the backend from the two periods' figures, in whole numbers, and is one of:
  - **A percentage**, the difference as a percentage of the earlier figure without its sign, to the whole percent, a half rounding away from zero, such as `+12%` or `-8%`. A loss that shrinks is a positive change, since the number went up. It shows with a plus or minus sign, and `0%` when nothing changed.
  - **New**, when the earlier period's figure is 0 and this one isn't. A change from nothing is never a percentage.
  - **A dash**, "–", when both are 0.
  - For the margin, the change is in percentage points, one decimal place, such as `+2.1 pts` or `-0.4 pts`. It shows "New" when the earlier period has no margin and this one has, and "–" when this one has none.

  The change is never colored as good or bad, since a rise in expenses isn't a fault in itself: it's text in ink with its sign.

### The chart

- **X8.** The chart covers the last 12 months including this one, oldest first, as every other chart by month does (H4, V29, E22), whatever period the statement shows. Each month has two columns side by side: Revenue, and the month's expenses stacked by category, from Software at the bottom to Other at the top, in the category colors ([Stage, chip and chart colors](visual-design.md#stage-chip-and-chart-colors)), the same ones as Spending by category. A bold line runs through the months for the profit, with a point at the middle of each month. A month with nothing in it shows no columns. Profit below zero puts the line below the zero line, and the money axis runs below zero to fit it. The current month is marked "so far", and isn't a lighter color, because color means the series here.
- **X9.** Clicking, or pressing with the keyboard, any part opens the entries behind it (X13): a revenue column opens that month's Revenue, an expense segment that month's entries for its category, and a profit point that month's Profit. The columns and points are drawn by the chart, so the same figures are also in a table behind the chart, for screen readers and the keyboard, whose cells are buttons, as the cash flow's table is.
- **X10.** The chart's tooltip, on the raised surface like the dashboard's, names the month and gives Revenue, each category with its swatch where it isn't 0, Total expenses and Profit, with its minus sign where it's a loss. The legend names the series: Revenue, Profit and the six categories, each with its swatch.

### The statement

- **X11.** The statement is a table of the figures in X2, each with its amount and its change from the period before (X7), under a header with the switch, the arrows and the period's label. The column heading names the earlier period, such as "Change from February 2026". All six categories show, with $0.00 in muted ink where there's nothing, so the statement keeps one shape. Every amount carries its cents (Money, in [Words](visual-design.md#words)).
- **X12.** Every amount is a button that opens the entries behind it (X13): Revenue, each category, Total expenses and Profit. The Profit margin opens Profit's entries, because the entries behind it are the ones behind revenue and expenses. The changes aren't clickable.
- **X13.** A dialog lists the entries behind a figure for the period or month it was clicked in, newest first. Its title names the figure and the period, such as "Revenue, March 2026", and under it are the figure's amount and how many entries there are. The amount is the figure itself, and the sum of the entries' amounts is exactly that, to the cent. Each entry is one row: its date, a link to the invoice or bill it came from, such as "Invoice INV-0042" or "Bill 8841 from Northwind Software", what happened to it (Issued, Voided, Added, Changed or Deleted), and its amount on the figure, with a minus sign where it takes the figure down. A reversing entry (J6) is marked with a quiet "Reversal" chip, so a changed bill reads as the entry that cancels the old and the one that posts the new. If its invoice or bill has since been deleted, the row says "Deleted bill" in muted ink with no link. An entry is behind a figure if it has a line in one of the figure's accounts: Revenue's account, the category's, any of the six for Total expenses, and all seven for Profit. The list holds 100 entries and a Show more button adds the next 100 (`limit` and `offset`, J12). Close and Escape close it, and focus goes back to the figure clicked.
- **X14.** Above the statement, in one line under the page title, the page says: "Revenue counts on the day an invoice is issued and expenses on the bill date, so profit isn't the same as cash."

### States and sources

- **X15.** A period with nothing in it shows the statement with $0.00, "–" in the margin and in each change. With nothing in the chart's 12 months either, the chart's place says "The chart will show here once you've issued an invoice or added a bill." Nothing divides by zero (H8).
- **X16.** The page makes one read, `GET /books/profit-and-loss`, for the chart and the statement, so a read that fails shows "Couldn't load this." with Try again (N6) in place of both, and a later one that fails over data already showing keeps it and says "Couldn't refresh this, so it may be out of date." Changing the period keeps the old statement showing, dimmed, until the new one arrives. The page reads again when the day changes and after any save, as every read does ([Frontend](frontend.md#frontend)). The entries dialog reads its own page, and a failed read there shows the same message with Try again inside the dialog.
- **X17.** The routes are in [backend.md](backend.md#api). Sums are strings of digits, as the books' others are (J12), and the changes are numbers. A period is asked for as `period=month|quarter|year` and a day in it as `on`, today without it. An `on` after today, or a value that isn't one of those, gets a 422.
- **X18.** At the limits in Q1, the page's figures and a page of entries each arrive in under 200ms, and each screen keeps to a few reads of the database: the totals by account and month for the 12 months and the two periods are grouped in the database and folded in Python (J14), and a page of entries names its records in one read for each kind of source, not one for each entry. Each unit test of the page and its figures runs in under a second ([Speed](testing.md#testing)).
- **X19.** On a fresh copy with the sample data, every one of the 12 months has revenue and expenses, so the chart shows a full year, and the statement for the current month, the last quarter and the year each add up. The sample data needs no change for this (M3, M4).

## Screens

### Profit and loss

The page title, "Profit and loss", is at the top left, as on the other Accounting pages ([Accounting pages](books.md#accounting-pages)). Under it, in muted ink, X14's line. The page is then two full-width panels in the panel color, 12px apart, with no outline, each rounded as the other panels are, in light and dark mode.

```
Profit and loss
Revenue counts on the day an invoice is issued and expenses on the bill date, so profit isn't the same as cash.
+------------------------------------------------------------------------------------------------------+
| Last 12 months                  o Revenue  -- Profit   o Software o Contractors o Travel o Office ... |
|                                                                                                $60k  |
|     ||#                 ||#                                          bars: ink revenue, stacked       |
|     ||#   --o--.        ||#  .--o--.                                 category colors beside it, and   |
|  ...                                                                  a bold line through the profit  |
|  Dec   Jan   Feb   Mar  ...                                               so far  Nov       -$10k    |
+------------------------------------------------------------------------------------------------------+
+------------------------------------------------------------------------------------------------------+
| [Month|Quarter|Year]   <  March 2026  >                                  Change from February 2026   |
| Revenue                                          $48,250.00                                    +12%   |
| Software                                          $2,400.00                                     -8%   |
| Contractors, Travel, Office, Marketing, Other                                                           |
| Total expenses                                   $18,240.00                                     +4%   |
| Profit                                           $30,010.00                                    +19%   |
| Profit margin                                         62.2%                                +2.1 pts   |
+------------------------------------------------------------------------------------------------------+
```

**Chart panel.** About 360px tall, the cash flow's height, with "Last 12 months" as a section heading at the top left and the legend to its right in one line, each swatch beside its name, as Spending by category's does. The chart fills the rest of the panel, drawn as [Charts](visual-design.md#charts) says, with the money axis on the right and every month named under its columns, as the dashboard's other month charts do. The first month and each January carry the year under their label. Revenue columns are ink, 12px wide, with 4px rounded tops, and the month's expense column is the same width beside it, 2px apart, in the category colors with 2px panel-colored gaps between segments. The profit line is 3px in ink with a 2px casing in the panel color, so it shows over the ink columns, and a dot at each month ringed in the panel color. Nothing is labeled directly except "so far". The zero line is 1px in the line color.

**Statement panel.** Its header is one row: the switch at the left, the arrows and the period's label beside it, and at the right the heading "Change from February 2026" in muted ink. The switch is three buttons in one track, 36px tall, 8px radius, in the page color, with the chosen one in Sea Green with Midnight text, never by color alone: it's also marked as pressed for screen readers and semibold. The arrows are 36px square buttons with the lucide-react ChevronLeft and ChevronRight, labeled "Earlier period" and "Later period", in muted ink when off. The label is Instrument Sans 16/24, semibold, with "so far" in muted ink after it for the current period. Under the header the rows are as tall as a table's, with no lines between them, groups separated by space. The rows' names are in ink, with each category's round swatch before its name. Amounts are JetBrains Mono 13/20, right-aligned in one column, the change in the next in the same face. Revenue, Total expenses and Profit are semibold. The Profit row has a little space above it to set it apart. The figure buttons are amounts underlined on hover and focus, with the focus ring.

**Entries dialog.** A dialog on the raised surface, about 640px wide, titled as in X13. Under the title, the figure's amount at the headline size in JetBrains Mono and the entry count in muted ink. Each row has the date in JetBrains Mono 13/20 in muted ink, the link in ink with an underline in the line color, the event in muted ink and the Reversal chip, and the amount in JetBrains Mono at the right. The list scrolls inside the dialog. Show more is a secondary button at the bottom of the list, and Close is the dialog's button.
