# Spec: Aged balances

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Aged balances

The Aged balances page under Accounting says who owes the business money and whom the business owes, and for how long. It has two views: **Customers**, what customers owe on issued invoices, and **Suppliers**, what the business owes on bills. Each lists the organizations with money outstanding, splits what each owes by how late it is, and ends in a totals row. It's the one Accounting page with a report in it so far. The other three still say theirs is coming ([J16](books.md#the-accounting-pages)).

The page only reads. It sends no statements or reminders, and it can't be exported or printed.

### What is owed, and how late

- **X1.** Money is aged by its due date, never by the invoice or bill date. On a chosen day, the **days past due** of an invoice or bill is that day less its due date, and it falls in one part:

| Part | Days past due |
|---|---|
| Not yet due | 0 or less, so due on the chosen day or later |
| 1 to 30 days | 1 to 30 |
| 31 to 60 days | 31 to 60 |
| 61 to 90 days | 61 to 90 |
| Over 90 days | 91 or more |

  A bill or invoice due on the chosen day is Not yet due, one due the day before is 1 day past due, and the 30th, 60th and 90th days past due stay in the part below. These are the groups of the dashboard's How late ([V29](invoices.md#money-on-the-dashboard)), which counts days late the same way.
- **X2.** What a customer owes is worked out for a chosen day, as the books would show it. An issued invoice counts from its issue date. Its amount owed is its total less the payments dated up to and including the chosen day, so a payment dated after it isn't counted yet. A draft never counts. A void invoice never counts on any day, because voiding reverses its issue entry with the same date ([J6](books.md#entries)), so on every day the books show it as if it had never been issued. An invoice with nothing owed on the day isn't listed. It belongs to the organization it was issued to.
- **X3.** What the business owes is worked out the same way. A bill counts from its bill date, for its total, tax included. It's owed on the chosen day unless it was paid on or before that day, so a bill paid after the day still counts. It belongs to its supplier. A bill's current figures and dates are used, since a change to a bill reverses its old entries with their original dates and posts new ones ([J6](books.md#entries)), so the books never show its old figures.
- **X4.** The totals agree with the books. On any day, Customers' total equals the Receivable account's balance on that day, and Suppliers' total equals the Payable account's, to the cent ([J12](books.md#reading-the-books)). An organization's five parts add up to its total, and the totals row's five parts add up to its total. The page works its figures out from the invoices, payments and bills, never from the journal, so the books stay an independent check of it, and a test compares the two on a series of days (X18).
- **X5.** An organization can be a customer and a supplier. It then appears in each view with that view's own figures, and the two are never netted against each other.
- **X6.** Money is in whole cents and shown with its cents and the dollar sign. Each figure is exact however large it gets, past the 2^53 cents a browser's numbers hold exactly, so the backend sends sums as strings of digits, as the cash flow's and the books' are (Y20, J12).

### The day

- **X7.** A date picker above the report chooses the day the balances are shown for. It starts on today and offers today and earlier, never a later day, because a later day would only repeat today's money and say nothing about future payments. The backend refuses a day after today with a message. Picking an earlier day shows the report as it stood at the end of that day, as X2 and X3 say, and a "Back to today" button beside the picker returns to today. With the picker on an earlier day, the report says so in words, such as "Balances as of Oct 31, 2026", above the table.
- **X8.** The chosen day is kept in the address as `on`, as `YYYY-MM-DD`, beside the chosen view as `view` (`customers`, the default, or `suppliers`), so a reload or a shared link shows the same report (N2, T4). Today isn't kept in it, so a link made today doesn't open at yesterday's day. An `on` that isn't a date, or is later than today, is dropped and the report shows today.
- **X9.** The page follows today. Left open past midnight, a report on today moves to the new day when the window is used again, and reads its figures again, as the dashboard's Money section does (V31). A day the person chose stays as it is.

### Reading the report

- **X10.** Each view's rows are the organizations with something owed on the day, ordered by their oldest money first: the most days past due among their invoices or bills, largest first, then by the amount owed, largest first, then by name (A to Z, ignoring case), then by id. An organization with only money not yet due counts as 0 days past due, so these follow every organization with late money, ordered among themselves by the amount owed.
- **X11.** Each row has the organization's name, its bar, its five parts as amounts, and its total owed. The name opens the organization's page. The bar is a horizontal bar made of the five parts in order, from Not yet due at the left to Over 90 days at the right, each part as wide as its amount. Every bar in a view is sized against the view's largest organization, so bars can be compared down the list, and a part too small to see is drawn 3px wide, so it can still be seen and pointed at. A part with nothing in it has no segment, and its amount column says $0.00 in muted ink. The five parts in the table are text too, so the color never carries the meaning alone.
- **X12.** The part colors are the dashboard's How late chart's, so the same lateness is the same color on both pages, and they go from calm to alarming: Not yet due is Cerulean, 1 to 30 days Marigold, 31 to 60 days Coral, 61 to 90 days Raspberry and Over 90 days Deep Raspberry ([Visual design](visual-design.md#stage-chip-and-chart-colors)). The dashboard's How late chart shows its five groups in these colors too, where it showed the four late groups in one color. A legend above the table names the five parts beside their swatches.
- **X13.** The bars match the dashboard's charts: they're drawn with Recharts, in the brand's colors in light and dark mode, with the same 2px gaps in the panel color between parts and the same tooltip on the raised surface ([Charts](visual-design.md#charts)). Pointing at a part, or focusing the row it's in, shows the organization's name, the part's name with its swatch, the amount owed in that part, and how many invoices or bills that is, for that part alone.
- **X14.** The totals row is the last row. It says "Total", gives the five parts' sums and the sum of the totals, and has no bar. It stays below the last organization, and so it comes after the "Show more" button's rows when the list is cut short (X16). Its figures cover every organization, never only the ones on screen.
- **X15.** Clicking an organization's row shows its open invoices or bills below it, in place, and clicking it again hides them. Several can be open at once. Each item shows its number, its due date, its days past due ("Not yet due", or "12 days"), its part, and what's owed on it. An invoice's number opens the invoice, and a bill's opens the bill, with the supplier's own number. An item with a payment part way shows the amount still owed on the chosen day, and nothing else of its history. Items are ordered oldest due date first, then by number. The row is a button for the keyboard, with the focus ring, Enter and Space opening it, and `aria-expanded` saying whether it's open (Q3). Opening one doesn't change the address.
- **X16.** A view shows its first 25 organizations, and a "Show 25 more" button under them, above the totals row, shows the next 25 until all are shown. Each bar is a chart of its own, so this keeps the page quick when there are many.
- **X17.** The designed empty states: with nothing owed on the day, the view shows "Nothing owed." in place of the table, as the dashboard's How late does (V30), saying "Customers owe nothing on this day." or "The business owes nothing on this day." The legend stays. While a view's figures load, its rows are placeholders. If the read fails, the page says so with a way to try again, as other pages do (N6), and the picker stays usable. Nothing divides by zero.

### Testing it

- **X18.** Tests fix the day and prove which part each invoice and bill falls in, on each boundary: due 0, 1, 30, 31, 60, 61, 90 and 91 days before the chosen day, and due on the chosen day and the day after. They prove the five parts add up to the total in every row and in the totals row; a payment dated before, on and after the chosen day; a bill paid before, on and after it; an invoice issued and a bill dated after it, which don't count; void and draft invoices, which never count; an organization that is both customer and supplier; the order of X10 with ties; and, on the sample data and on a small set with known answers, that the totals equal the Receivable and Payable balances of the books on a series of days, which their own file checks (`backend/tests/test_aged_balances_books.py`, because `test_books_checks.py` may not be edited, J11). They run with no waiting, and each runs in under a second (X20).
- **X19.** On a fresh copy with the sample data, both views have customers and suppliers in every part, so the report looks full: in each of Customers and Suppliers, at least two organizations have money in each of the five parts, and several have money in more than one part, so the bars show the colors beside each other ([M2](running.md#sample-data)).
- **X20.** At the limits in Q1, either view arrives in under 200ms. It's worked out in a handful of reads whatever the number of records, never one per invoice, bill or organization, with sums made in the database where it can. Every unit test of this area, old and new, runs in under a second on this computer, because CI runs on a much slower machine.

## Screens

### Aged balances page

The page keeps the Accounting pages' look ([Accounting pages](books.md#accounting-pages)): the title "Aged balances" at top left in Instrument Sans, semibold, in ink, at the Company settings title's size, under the top bar's floating bar with space around it, and no line across the top. It has no panel saying a report is coming.

Level with the title, at the right, is the date picker: a "Balances as of" label in muted ink beside the date field, an input in the page color like the other inputs, and, once an earlier day is chosen, the "Back to today" button, a secondary button. Under the title is a segmented control with Customers and Suppliers, two joined buttons in the page color, fully rounded, with the current view in the primary color and Midnight text. It's the first of its kind, built as a Radix toggle group so the arrow keys move between the two. Under it, in muted ink, one line says what the view shows: "Money customers owe on issued invoices, by how late it is." or "Money the business owes on bills, by how late it is." When an earlier day is chosen, "Balances as of Oct 31, 2026" sits in ink beside it.

Below is one panel on the page background, white in light mode and black in dark, rounded with no outline. At its top, the legend: five 10px round swatches in the part colors, each beside its name in ink, in a row. Under it, the table. Its columns are Organization, a wide bar column with no heading text but a hidden label for screen readers, Not yet due, 1 to 30 days, 31 to 60 days, 61 to 90 days, Over 90 days and Total owed. Headings are in muted ink at the label size. Amounts are in JetBrains Mono, right-aligned with their cents, Total owed in ink and semibold, and a part with nothing in it in muted ink as $0.00. The organization's name is in ink, in Instrument Sans, and underlined on hover like other links. Rows are separated by space, not lines, with the page color on hover as rows have elsewhere. The open row shows a chevron, lucide-react's chevron-right turned down, before the name. A row's bar is 14px tall with 4px rounded ends, with 2px gaps between parts in the panel color.

An open row's items sit under it, indented under the name, on the same panel with a slightly quieter look: the page color as the background, rounded, with no outline. Each item is a line with its number in JetBrains Mono as a link, its due date, its days past due, its part as a swatch and name, and its amount at the right. Customers' items link to Invoices, and suppliers' to Bills.

The totals row has "Total" in semibold ink and the sums in JetBrains Mono semibold, with space above it, not a line. At the bottom of the table, the "Show 25 more" button is a secondary button, centered.

In dark mode the panel is black with the layers the other pages use, the tooltip on the raised surface, and the part colors as the visual design gives them.

### Aged balances in the menu

Aged balances is already one of the four Accounting links ([J15](books.md#the-accounting-pages)). It stays in the same place, with the same words.
