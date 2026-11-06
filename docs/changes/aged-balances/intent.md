# Intent: aged balances

## Problem

The dashboard shows how much is overdue in total, but not who owes it or for how long. The same goes for what we owe our suppliers.

## Proposed outcome

The Aged balances page under Accounting has two views: what customers owe us, and what we owe suppliers. Each lists the organizations with money outstanding, splitting what each owes into not yet due, 1 to 30, 31 to 60, 61 to 90 and over 90 days past due. Each organization has a horizontal bar made of those parts, in colors that go from calm to alarming, and the list starts with whoever has the oldest money outstanding. A totals row sits at the bottom. Clicking an organization shows its open invoices or bills, and a date picker shows the balances as they stood on an earlier day.

## Constraints

- Money is aged by its due date.
- The totals agree with the books: what customers owe equals Receivable, and what we owe equals Payable, on the chosen date.
- The parts use the same colors as the overdue chart in the dashboard's Money section.
- The bars match the dashboard's charts: the same chart library, the brand's colors in light and dark mode, and the same tooltips.
- Every unit test, old and new, runs in under a second on this computer, because CI runs on a much slower machine.
- No new dependencies unless the plan makes the case for one.

## Not in this change

- Sending statements or reminders.
- Exporting or printing the report.

## Success criteria

1. npm run check passes.
2. Each organization's parts add up to what it owes, and the totals equal Receivable and Payable in the books on the chosen date.
3. Tests with fixed dates prove which part each invoice and bill falls in, including on the boundary days.
4. On a fresh copy with the sample data, both views have customers and suppliers in every part and the page looks like it belongs in the app.

## Decisions

- As of a past date, an invoice or bill counts with what it owed on that day (payments and paid dates after it are ignored, and a void invoice never counts on any day, because voiding reverses the issue entry with its own date, so that is how the books see it), and the picker allows today or earlier, defaulting to today.
- Days past due are counted as in the dashboard: due today or later is Not yet due, 1 day late is the start of 1 to 30, and 30, 60 and 90 days late stay in the lower part.
- The list is ordered by each organization's oldest days past due, highest first, then by amount owed, then by name; organizations owing nothing on the date are left out.
- Clicking an organization expands its row in place to list its open invoices or bills (number, due date, days late, amount owed), each linking to its own page.
- Amounts are whole cents throughout, and an organization that is both customer and supplier appears in each view on its own figures, never netted.
- The parts must differ from each other in a bar, but the dashboard's How late used one color for all four late groups; both now use Cerulean, Marigold, Coral, Raspberry and a new Deep Raspberry, going from calm to alarming, so they still match. Deep Raspberry in dark mode is 2.6:1 against the panel, so every part is also an amount in the table and a name in the tooltip.
- The page works its figures out from the invoices, payments and bills rather than from the journal, so the books stay an independent check, and its comparison tests are in a file of their own because `test_books_checks.py` may not be edited.
- A day later than today is refused, because future payments are the cash flow's business; the chosen day and the view are kept in the address, and today is not.
- Each bar is a Recharts chart, so a view shows 25 organizations at a time with a "Show 25 more" button, and the totals row always covers all of them.
- The Customers and Suppliers switch is built with the toggle group in the `radix-ui` package already installed, so there is no new dependency; the sample data gets two organizations in each part in each view, using the existing 33 invoices and 85 bills.
