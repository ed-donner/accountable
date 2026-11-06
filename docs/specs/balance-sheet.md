# Spec: Balance sheet

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Balance sheet

The Balance sheet page under Accounting shows what the business owns and what it owes on a day, and lets anyone see for themselves that the two sides are equal. It keeps no records of its own: every figure is an account's balance in the books ([books.md](books.md#the-books)) on the chosen day, and every figure can be traced to the entries behind it. A slider across the last 12 months moves the day, so the business can be watched month by month, balanced at each stop.

### The day

- **X1.** The page is `/accounting/balance-sheet` ([J15](books.md#the-accounting-pages)), with the top bar and no section marked current, like every Accounting page. It replaces the placeholder Balance sheet had.
- **X2.** A slider chooses the day. It has 12 stops, one for each of the last 12 months including this one, as the cash flow's months are ([Y1](cash-flow.md#the-months)): the month's last day, except this month, whose stop is today. On Nov 6, 2026, that's Dec 31, 2025, Jan 31 and on, to Oct 31, then Nov 6, 2026. Today is the device's ([Terms](../spec.md#terms)). The slider starts on today. When the day changes while the page is open, the stops are worked out again and the slider keeps its place, counted from today.
- **X3.** Everything on the page is the books as they stood at the end of the chosen day: every entry dated up to and including it, reversals included, and none dated later (J12). So today's stop leaves out an entry dated after today, such as a bill dated next week.

### The figures

- **X4.** The left column is what the business owns: Cash and Receivable, in that order, each its account's balance on the day (J2). The right column is what it owes and what belongs to the owner: Payable, Tax payable, Owner's equity and Profit to date, in that order. Profit to date is all revenue less all expenses up to the day, since nothing in the books is ever closed: Revenue's balance less the balances of the six expense accounts (J1), over every entry up to the day, however old.
- **X5.** Each column ends in its total: the left is Cash plus Receivable, the right is Payable plus Tax payable plus Owner's equity plus Profit to date. The page adds the figures up itself, exactly, in whole cents, as BigInt, and rounds nothing. A figure below zero, such as Cash when the business is overdrawn or Profit to date when it has made a loss, shows with a minus sign before the currency, as in `-$4,250.00` (J2), and counts in the total at that value.
- **X6.** When the two totals are equal, a mark between them says so: "The two sides are equal." When they differ, the page says so plainly instead: "Out of balance", with the difference and which side is more, such as "What the business owns is $120.00 more than what it owes and what belongs to the owner." The books' own checks (J11) mean this shouldn't happen. The page doesn't assume that, and never hides, rounds away or corrects a difference, however small.

### The bars

- **X7.** Above the columns, two stacked bars, one for each side, built of the same accounts as the columns, each in its own color ([Balance sheet colors](visual-design.md#stage-chip-and-chart-colors)), stacked in the columns' order from the bottom up. They share one scale, from $0 to the larger side's total, so when the books balance the two bars are the same height and fill the chart. An account with a balance of zero or less has no segment, but keeps its place in its column, with its minus sign. The bars are drawn with Recharts, as the dashboard's charts are, with the same tooltip, axis text and grid ([Charts](visual-design.md#charts)).
- **X8.** Pointing at a segment shows a tooltip with the account's name, its figure and the day. Each bar has its side's name under it, and the account names beside the figures in the columns tell the colors apart, so a color never carries the meaning alone. A table behind the chart gives screen readers every figure, as `MonthsTable` does for the CRM's month charts. The bars aren't clickable, since the columns' figures are.

### The slider

- **X9.** The slider is a native range input with 12 steps, so it works by keyboard as well as the mouse: Left and Down arrows move to the previous stop, Right and Up to the next, Home to the first and End to the last, and it shows the focus ring (Q3). Its name for screen readers is "Date", and its value is the chosen day written out, such as "Oct 31, 2026". Under it, each stop is named by its month's first three letters, the last by "Today", with the chosen stop's name in ink and semibold, and the year under the first month's and each January's. The chosen day is also written out above the figures, as "Oct 31, 2026".
- **X10.** Moving the slider redraws the bars and the figures for that day. Each day's figures are one read of `GET /books/balances?on=` (J12). Once the first is shown, the other eleven are read in the background, so moving the slider redraws at once, and a day whose read hasn't arrived keeps the figures of the day before on screen, never an empty or half-drawn chart. A day read earlier is read again after any save, as every read is ([Frontend](frontend.md#frontend)), and when it fails with figures already showing, the page says it may be out of date, as N6 says.

### The entries behind a figure

- **X11.** Every account's figure in the columns is a button, with the focus ring, that opens a dialog of the entries behind it: "Cash up to Oct 31, 2026", and the same for Receivable, Payable, Tax payable and Owner's equity. Profit to date opens "Profit to date up to Oct 31, 2026", with the entries that touch Revenue or any expense account. The totals aren't buttons, since a total isn't an account. The dialog lists exactly the entries dated up to and including the day that have a line in the account, or for Profit to date in any of those seven accounts, newest first, reversals included, from the route in J12. It adds nothing of its own to the list.
- **X12.** Each entry is one row: its date, what happened in plain words, as a link to the page that opens its source (J4), who made it unless nobody is recorded (J8), and on the right its effect on the figure, in whole cents with a minus sign when it takes the figure down. The effect is what the entry's lines in those accounts add to the balance by J2's sides: for Cash a debit adds and a credit takes away, for Payable the other way, and for Profit to date a credit to Revenue adds and a debit to an expense takes away. So the effects of every entry in the list add up to the figure, and the dialog shows the figure at its top, equal to that sum, to the cent. A reversing entry says what it reverses by its words, such as "Invoice voided".
- **X13.** The events' words: `invoice_issued` is "Invoice issued", `payment_recorded` "Payment recorded", `bill_added` "Bill added", `bill_paid` "Bill paid", `opening_balance_set` "Opening balance set", `invoice_voided` "Invoice voided", `payment_deleted` "Payment deleted", `bill_changed` "Bill changed", `bill_unpaid` "Bill marked unpaid", `bill_deleted` "Bill deleted", `opening_balance_changed` "Opening balance changed" and `opening_balance_cleared` "Opening balance cleared".
- **X14.** The dialog reads 100 entries at a time, with "Show more" under them while there are more, and says how many it's showing, such as "Showing 100 of 230". Its read fails as N6 says, with Try again, and a list read before shows while it's read again. Close and Escape close it, and focus goes back to the figure that opened it. An account with no entries by that day says "No entries up to Oct 31, 2026."

### Reading it

- **X15.** `GET /books/entries` takes `account` more than once, to keep the entries with a line in any of them, so Profit to date is one read, not seven (J12). The page adds no route. Every read keeps to Q1's 200ms (J14), at the limits in Q1.
- **X16.** On a day before any entry, every figure is `$0.00`, the bars are empty, the mark says the two sides are equal, and the chart's place says "Nothing in the books by this date." Nothing divides by zero.
- **X17.** A read that fails shows N6's "Couldn't load this." with Try again in the place of the bars and the columns, under the slider, and the slider keeps working. The page is never blank, and the console stays clear (Q2).
- **X18.** On a fresh copy with the sample data, at every one of the 12 stops, every account's figure is above zero, Profit to date's included, so the bars and the columns are full at each stop, and the two sides are equal ([M3](running.md#sample-data)). So are they after every kind of change in J5 and J6, by J11.

## Screens

### Balance sheet page

The page title, "Balance sheet", sits at the top left, in Instrument Sans at the size the Company settings title has, semibold, in ink, under the top bar's floating bar, with space around it as every Accounting page has. Under it, one panel in the panel color on the page background, rounded with no outline, about 960px wide and left-aligned, holds everything, so it fits a 1440 by 900 window without scrolling.

```
Balance sheet
+----------------------------------------------------------------------------------+
| Oct 31, 2026                                                                      |
| ( )-------------------( o )--------------------------------------------------( ) |
|  Dec  Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  [Oct]  Today                   |
|  2025 2026                                                                        |
|                                                                                   |
|        What the business owns            What it owes and what's the owner's      |
|  $90k   +---------+                           +---------+                 $90k    |
|         | Receiv. |                           | Profit  |                         |
|         |---------|                           | Equity  |                         |
|         |  Cash   |                           | Tax pay |                         |
|  $0     +---------+                           | Payable |                 $0      |
|                                               +---------+                         |
|                                                                                   |
|  What the business owns              What it owes and what's the owner's          |
|  (o) Cash              $62,300.00    (o) Payable                    $9,100.00     |
|  (o) Receivable        $27,100.00    (o) Tax payable                $1,800.00     |
|                                      (o) Owner's equity            $40,000.00     |
|                                      (o) Profit to date            $38,500.00     |
|  Total                 $89,400.00    Total                         $89,400.00     |
|                                                                                   |
|                  [ v  The two sides are equal. ]                                  |
+----------------------------------------------------------------------------------+
```

- **Date and slider:** the chosen day is a section heading at the top left. Under it, the slider runs the panel's width: a 4px round track in the Line color, in Sea Green up to the thumb, and a 20px round thumb in ink with a 2px ring in the panel color, so it shows on the track and on the panel in both modes. A 2px focus ring in the focus color goes round the thumb when it has focus. The month names under the stops are in muted ink at the chart axis size, the chosen one in ink and semibold. Each stop has a small round tick in the Line color under the track.
- **Bars:** two bars, 120px wide, 220px tall, each centered over its own column below, with a 4px rounded top on the topmost segment and 2px gaps in the panel color between segments, as Spending by category has them. The money axis sits inside the panel on the right, with faint grid lines, as [Charts](visual-design.md#charts) says, at $0 and the scale's top and halfway. Each bar's side is named under it in ink. A segment too small to see at the chart's scale is drawn 4px tall above its gap, as in Spending by category, and pointing at it still gives its real figure.
- **Columns:** two columns of equal width side by side under the chart, each headed by its side's name as a section heading. Each account is one row: a round swatch in the account's color, its name in ink, and at the right its figure in JetBrains Mono at the board totals' size, as a button that shows an underline on hover and the focus ring on focus, with no fill. A figure below zero has its minus sign. Each column ends in a Total row, set apart by space and not by a line, with the total in JetBrains Mono at the headline figures' size, in ink, not a button.
- **The mark:** centered under the two totals, one chip. When the sides are equal it's a Sea Green chip with Midnight text, the lucide-react Check icon before "The two sides are equal." When they differ it's the Alert chip with the lucide-react TriangleAlert icon before "Out of balance", and the sentence from X6 under it in ink, with the difference in JetBrains Mono. The chip's words, and not its color, carry the meaning.
- **Dark mode:** the panel is the panel color and the segments keep their colors ([Balance sheet colors](visual-design.md#stage-chip-and-chart-colors)), the ink segment turning Sea Mist. Text on a segment is never needed, since the names sit in the columns and the tooltip.
- **While the first read is on its way**, the columns show their names and no figures, and the chart's place is empty at its height. The figures replace them without moving anything.
- **No gradient, no border on one edge of the panel, no line across the page's top.**

### Entries dialog

A dialog titled "Cash up to Oct 31, 2026", on the raised surface, 560px wide, as the month dialog on the cash flow ([Month dialog](cash-flow.md#month-dialog)) is. Under the title, the figure in JetBrains Mono at the headline size, with "Balance on Oct 31, 2026" in muted ink beside it. Then the entries, each one row: the date in JetBrains Mono in muted ink, the event's words as a link in ink to its source's page, and under it, in muted ink, who made it, such as "Alex Rivera", left out when nobody is recorded. On the right, its effect on the figure in JetBrains Mono, with a minus sign when it takes it down. The list scrolls inside the dialog when it's long. Under it, "Showing 100 of 230" in muted ink and the Show more button, a secondary button, while there are more. Close and Escape close it.
