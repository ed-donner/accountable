# Intent: cash flow

## Problem

The dashboard shows what customers owe us and what we owe suppliers, but not the question a small business asks every week: how much cash will we have, and when?

## Proposed outcome

A cash flow chart, as a full-width row at the top of the dashboard's Money section. For each of the last 12 months it shows the money that came in from customers' payments and the money that went out on paid bills, and a line for the cash balance at the end of each month. From today, the line continues as a dashed forecast for the next 3 months, built from the open invoices and the unpaid bills. A switch adds the likely deals as a lighter band on top of the forecast. Hovering a month shows its figures, and clicking a forecast month lists the invoices, bills and deals behind it.

The chart covers 15 months. The first 12 are the last 12 months including this one, as on the dashboard's other charts, and the last 3 are the forecast: on Nov 5, 2026, that's Dec 2025 to Nov 2026, then Dec 2026, Jan 2027 and Feb 2027.

- This month's bars show what's come in and gone out so far, marked "so far", with what's still expected this month on top of them in the forecast style.
- The line is solid up to the end of last month, and dashed from last month's end-of-month point, through this month's expected end, to the end of the third forecast month.
- The forecast months show their expected money in and out as lighter bars, so hovering or clicking one has bars to match its figures.

## Constraints

- The balance starts from an opening cash balance and the date it applies to, entered once in Settings. Without one, the chart shows money in and out with no balance line.
- The opening balance is the cash at the start of its date, so the payments and paid bills on that date and after count toward the balance, and those before it don't. The date can't be in the future. If it falls inside the 12 months, the line starts in that month, and the months before it show their bars with no line.
- Money in is the payments received, by payment date. Money out is the paid bills, by the date they were paid.
- In the forecast, each open invoice's unpaid balance is expected on its due date plus that customer's average days late on the invoices they've paid before, or the average for all customers if they have no history, and never before tomorrow. Each unpaid bill is expected on its due date, and never before tomorrow.
- The customer is the organization the invoice was issued to. A paid invoice's days late are the days from its due date to the date of the payment that cleared it, and paying on time or early counts as 0, never as negative. Only fully paid invoices count toward the average, which is rounded to a whole day.
- Likely deals are the open deals' value times their probability, expected on the close date plus the payment terms in Settings, and never before tomorrow, so a late deal lands tomorrow. A deal expected after the third forecast month is left out. They're off by default, every time the dashboard opens, since the switch isn't remembered, and drawn apart from the forecast, so the forecast stays what the invoices and bills say.
- The chart's row doesn't depend on what else is in the Money section, which is being reworked on another branch.
- The backend works out every figure when the dashboard loads. Nothing is stored, and the chart only draws what the backend sends.
- The chart matches the dashboard's other charts: the same chart library, the brand's colors in light and dark mode, and the same tooltips.
- The sample company has an opening balance, so the chart shows a full year of history and three months of forecast from the first visit.
- Every unit test, old and new, runs in under a second on this computer, because CI runs on a much slower machine.
- No new dependencies unless the plan makes the case for one.

## Not in this change

- Bank feeds or reconciling with a bank statement.
- Scenarios, such as what happens if a big customer pays late.
- Predicting recurring bills that haven't arrived yet.

## Success criteria

1. npm run check passes.
2. Each past month's money in and money out match the payments and paid bills exactly.
3. Tests with fixed dates prove where each open invoice and unpaid bill lands in the forecast, including overdue ones and customers with and without a payment history.
4. The balance line starts from the opening balance in Settings, and turning likely deals on or off doesn't change the forecast line.
5. On a fresh copy with the sample data, the chart shows a year of history and three months of forecast, and looks like it belongs on the dashboard.
