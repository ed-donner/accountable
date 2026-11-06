# Spec: Cash flow

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Cash flow

The cash flow answers the question a small business asks every week: how much cash will we have, and when? It's a chart in a full-width row at the top of the dashboard's Money section, worked out from what other areas already hold: the payments received against invoices, the bills marked paid, the invoices still owed, the bills still unpaid and the open deals. It keeps no records of its own. The one thing it needs that nothing else holds, the opening balance, is a company setting ([B23](settings.md#cash)).

### The months

- **Y1.** The chart covers 15 months: the last 12 including this one, as the dashboard's other month charts do (H4, V29), then the 3 after this one as the forecast. On Nov 5, 2026, that's Dec 2025 to Nov 2026, then Dec 2026, Jan 2027 and Feb 2027. Each month shows its money in and its money out, and, once there's an opening balance, the cash balance at its end.
- **Y2.** Money in is the payments received against invoices (V15), by the date they were paid. Money out is the bills marked paid (E9), at their totals, tax included, by the date they were paid. A past month's money in and money out are exactly those, to the cent. They don't depend on the opening balance, so a month before its date still shows them.
- **Y3.** This month shows what's come in and gone out so far, marked "so far", with what's still expected from tomorrow to the month's end carried on past the end of each bar, in the forecast's style. On a month's last day nothing more is expected in it, since the forecast starts tomorrow.
- **Y4.** Each forecast month shows the money expected in and out in it, in the forecast's style.

### The forecast

- **Y5.** Money expected in is what's owed on each open invoice: an issued invoice, not void, with money owed. Each is expected on its due date plus its customer's average days paid late (Y6), or, for a customer with no fully paid invoice yet, plus the average over every fully paid invoice. If that's before tomorrow, as it is for most overdue invoices, it's expected tomorrow. With no fully paid invoice anywhere, the average is 0, so each invoice is expected on its due date, or tomorrow. Drafts aren't in the forecast, since they have no due date yet, and nor is a won deal that hasn't been invoiced.
- **Y6.** The customer is the organization the invoice was issued to (V11). A fully paid invoice's days paid late are the days from its due date to the date of its last payment, the one that cleared it. Paying on time or early counts as 0, never as negative. A customer's average is over its fully paid invoices, each counting once, rounded to the nearest whole day, with a half rounding up. The average over every fully paid invoice is worked out the same way. A part-paid invoice doesn't count toward an average until it's fully paid, and a void one never does.
- **Y7.** Money expected out is each unpaid bill's total, tax included, expected on its due date, or tomorrow if that's today or before, as it is for an overdue bill.
- **Y8.** The forecast runs from tomorrow to the last day of the third forecast month. An invoice or a bill expected after that is left out of the chart, though it's still owed.

### The cash balance

- **Y9.** The cash balance starts from the opening balance in Company settings, which is the cash at the start of its date (B23). Payments and paid bills from that date on count toward it, and those before it don't. A month's balance is the cash at its end: the opening balance, plus the money in, less the money out, from the opening balance's date to the month's last day. For this month and the forecast months, what's expected counts too, so their balances are what's expected at their ends.
- **Y10.** The line starts in the month of the opening balance's date, and the months before it show their bars with no balance. With a date before the chart's first month, the line covers all 15 months. Without an opening balance, the chart shows money in and out with no line, and says how to add one (Y18).
- **Y11.** The line is solid up to last month's end-of-month point, and dashed from there, through this month's expected end, to the end of the third forecast month. With the opening balance's date in this month, the line starts at this month's point, dashed.
- **Y12.** The balance can go below zero, and the line, the figures and the tooltip show it with a minus sign, as in `-$4,250.00`.

### Likely deals

- **Y13.** A switch, Likely deals, adds the open deals as a band on top of the forecast. Each open deal is expected to bring in its expected revenue ([Terms](../spec.md#terms)): its value times its probability, to the nearest whole dollar. It's expected on its close date plus the payment terms in Company settings, or tomorrow if that's before tomorrow, as it is for most late deals. A deal expected after the third forecast month is left out.
- **Y14.** The band runs from the forecast line up to where the likely deals would take the balance, from last month's end-of-month point on. The forecast line's balances, the figures above the chart and the bars' sums stay as the invoices and bills say, with the switch on or off, so turning it on adds the band, the With likely deals figure (Y16), and the deals in the tooltip and a month's list (Y17), and changes no figure. The money axis fits what's shown, so it grows to make room for the band while the switch is on, and the line and the bars are drawn to that scale, showing the same money. A deal's value is before tax (Q16), so the band leaves out the tax its invoice would add.
- **Y15.** The switch is off each time the dashboard opens, and isn't remembered. Without an opening balance there's no line for the band to sit on, so the switch isn't shown.

### Reading it

- **Y16.** Above the chart, Cash today is the opening balance plus the money in, less the money out, from its date to today, and End of February, named for the third forecast month, is the balance expected at that month's end. With the switch on, With likely deals shows beside them: the same balance with the likely deals added. Without an opening balance, none of these show (Y18).
- **Y17.** Pointing at a month shows a tooltip with its figures: what came in and went out, with how many payments and bills, and its balance at the end. This month's tooltip gives what's come in and gone out so far and what's still expected, and a forecast month's what's expected in and out, with how many invoices and bills, and, with the switch on, the likely deals and how many there are. Clicking this month or a forecast month, or pressing its month label, which is a button, opens a dialog listing what's expected in that month: the invoices, each with what's owed on it, the bills, each with its total, and, with the switch on, the deals, each with its expected revenue. Each shows its expected date and links to its own page, and each group's total is the same as that part of the month's bar. A past month opens nothing, since its money has already moved.
- **Y18.** Without an opening balance, "No opening balance yet. Add one in Company settings to see the cash balance." takes the figures' place, with Company settings as a link to the page. With no opening balance, nothing in or out in any of the 12 months and nothing expected, the chart's place says "Cash flow will show here once money comes in or goes out." A month in the dialog with nothing expected in it says so, such as "Nothing expected in December 2026." Nothing divides by zero.

### Where the figures come from

- **Y19.** The backend works out every figure each time the dashboard asks, from its own today, and stores none of them. The page draws what the backend sends and adds nothing up itself. The cash flow is read again when the day changes, as the rest of the dashboard is, and after any save, as every read is ([Frontend](frontend.md#frontend)).
- **Y20.** Every figure carries its cents and is exact to the cent however large it gets, past the 2^53 cents a browser's numbers hold exactly, as the Money section's other figures are (E20).
- **Y21.** The cash flow's row reads its figures from its own route, so a row that can't load says so, as in N6, and leaves the rest of the Money section showing. It doesn't depend on anything else in the section.
- **Y22.** At the limits in Q1, the cash flow's figures and a month's list each arrive in under 200ms.

## Screens

### Cash flow row

A full-width row at the top of the dashboard's Money section, under the heading Money, about 360px tall: one panel, with the rest of the section 12px below it. With the heading, it fits a 1440 by 900 window once the page is scrolled to it.

```
Money
+----------------------------------------------------------------------------------------------------------------+
| Cash flow                            (o) Money in  (o) Money out  -- Cash  - - Forecast    [o  ] Likely deals    |
|                                                                                                                |
| Cash today          End of February                                                                            |
| $132,186.00         $246,950.00                                                  Forecast                      |
|                     Expected                                       .- - - - -.- - - - -.- - - - -.      $250k   |
|                                                       .-----.-----'                                            |
|      .-----.-----.-----.-----.-----.-----.-----.-----'                                                 $100k   |
|  ^     ^     ^     ^     ^     ^     ^     ^     ^     ^     ^     ^     :     :     :      money in    $0     |
|  v     v     v     v     v     v     v     v     v     v     v     v     :     :     :      money out  -$40k   |
|  Dec   Jan   Feb   Mar   Apr   May   Jun   Jul   Aug   Sep   Oct   Nov   Dec   Jan   Feb                       |
|  2025  2026                                                  so far      2027                                  |
+----------------------------------------------------------------------------------------------------------------+
  the rest of the Money section follows below
```

The heading "Cash flow" sits at the top left, as a section heading. At the top right, in one line, the legend comes first, each series' swatch beside its name: Money in, Money out, Cash, and Forecast, drawn as a short dashed line, with Likely deals added while the switch is on. Then the switch, labeled Likely deals, with its label after it. Under the heading, Cash today and End of February sit side by side as figures at the headline size, with "Expected" under End of February in muted ink. While the switch is on, With likely deals takes a third place beside them, kept free so nothing moves when it appears. Without an opening balance, Y18's message, with its link to Company settings, sits there instead, in ink, and the switch and the Cash and Forecast entries in the legend are left out.

The chart fills the rest of the panel, drawn as [Charts](visual-design.md#charts) says, with the money axis on the right, as on the Money section's other month charts, and the month labels under it. Each month's label is its month's first three letters. The first month's label and each January's have the year under them, so the two Decembers can't be confused. "so far" sits under this month's label, and "Forecast" in muted ink above the three forecast months. The labels of this month and the forecast months are buttons, with the focus ring, and the whole of their column can be clicked. A month's tooltip leads with its balance at its end, and names the month instead where it has none.

### Month dialog

A dialog titled "Expected in December 2026", or "Still expected in November 2026" for this month. It lists up to three groups, each under its section heading with its total at the right in JetBrains Mono: Coming in, with the invoices, Going out, with the bills, and, while the switch is on, Likely deals, with the deals. Each item is one row: its number, or for a deal its name, as a link to its page, then the organization, in muted ink. On the right, its amount sits in JetBrains Mono, with its expected date under it in muted ink. An invoice also shows its due date, with an Overdue chip once it's overdue, and, where it isn't 0, how many days late its customer pays on average, such as "Pays 6 days late on average": the average its expected date took, which for a customer with no fully paid invoice yet is every customer's (Y5). A bill shows its due date and its Overdue chip the same way. A deal shows its close date and a Late chip if it's late. Each group is in expected date order. The list scrolls inside the dialog when it's long. Close and Escape close it, and focus goes back to the month's label.
