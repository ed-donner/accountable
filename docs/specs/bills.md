# Spec: Bills

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Bills

- **E1.** Bills records the bills the business receives from its suppliers, so the team can see what it owes, when each bill is due and what it spends. It's the eighth section in the top bar, after Quotes ([N1](shell.md#app-shell)), at `/bills`. Each bill has a supplier, the supplier's own bill number, a bill date, a due date, an amount before tax, the tax, a category and notes, and is unpaid or paid.
- **E2.** A bill's supplier is an organization, so an organization can be a customer, a supplier or both. Any organization can be picked, and nothing marks one as a supplier: an organization is a supplier because it has bills. The supplier is required, with "Choose a supplier", and once set it can be changed but not cleared (F5). A bill holds its supplier, so an organization with bills can't be deleted ([D4](records.md#deleting)). Its delete dialog says "This organization has 12 bills, so it can't be deleted."
- **E3.** The bill number is required, with "Enter the bill number", and is kept as typed, up to 50 characters, with spaces at either end dropped. The same supplier can't have two bills with the same number, ignoring case in any language, the way product names are compared (G2), so "INV-0042" can't be added beside "inv-0042" from the same supplier. Two suppliers can each have a bill with the same number. The page and the API refuse a number the supplier already has, with "This supplier already has a bill with this number" beside it, and so does the database, so two saves at once can't both get through. Moving a bill to another supplier checks its number against that supplier's bills. A longer number gets "Keep the bill number to 50 characters or fewer".
- **E4.** Amounts are in US dollars and cents, kept and sent as whole cents, as a product's price is ([G3](products.md#the-price-list)). The amount before tax and the tax are each from $0.00 to $1,000,000,000,000.00, and their boxes read what's typed as the Unit price box does (G4), with "Enter an amount in dollars and cents, such as 49.50". The tax is entered as it appears on the bill, because a supplier's tax can differ from ours, so it's never worked out from the company's tax rate. Left blank, it's $0.00. A bill's total is the amount plus the tax, worked out by the backend for every reply and never taken from what the browser sends. Bills' amounts always show their cents, such as `$1,240.00`, wherever they appear, the dashboard included.
- **E5.** The bill date and the due date are required, with "Choose a bill date" and "Choose a due date", as a deal's close date has "Choose a close date". The due date can't be before the bill date, with "The due date can't be before the bill date". The bill date can be any date. In the Add form, the bill date starts as today and the due date as 30 days after it, and the due date follows the bill date as it changes until the due date is changed by hand. Editing a bill keeps its due date as saved. The 30 days are fixed, not the payment terms in the company settings, which are what our customers get. A bill added through the API without a due date gets one 30 days after its bill date.
- **E6.** The category is required, from a fixed list, in this order: Software, Contractors, Travel, Office, Marketing and Other. It has no default, so forgotten choices can't pile up in Other, and leaving it blank gets "Choose a category". Each category has its own color ([Stage, chip and chart colors](visual-design.md#stage-chip-and-chart-colors)), shown as a round swatch beside its name wherever the category shows, so the color never carries the meaning alone.
- **E7.** Notes are optional and can run to several lines.

## Paid, unpaid and overdue

- **E8.** A bill is unpaid until it's marked paid, and a paid bill keeps the date it was paid. An unpaid bill is overdue once its due date is before today, so a bill due today isn't overdue yet, as with late deals. Overdue is worked out from today ([Terms](../spec.md#terms)), never saved, so a bill becomes overdue when the day changes, with nobody saving it.
- **E9.** Mark paid, on each unpaid bill's row and page, opens a small dialog that asks for the date it was paid, with today filled in. The paid date can't be in the future, with "The paid date can't be in the future", or before the bill date, with "The paid date can't be before the bill date". It shows "Bill marked paid." and happens once, however quickly its button is pressed (F10).
- **E10.** Mark unpaid, on each paid bill's row and page, undoes marking it paid, and clears its paid date. It doesn't ask first. It shows "Bill marked unpaid." with an Undo button that marks the bill paid again on the date it had, and the message stays for 10 seconds, as the archived message does ([G9](products.md#archiving)). One that fails says so and leaves the bill as it was.
- **E11.** The form has a Paid on box too, blank while the bill is unpaid, so a bill that's already been paid can be added in one go and a paid date can be corrected. It has the same checks as E9, and clearing it marks the bill unpaid.
- **E12.** Each bill records who added it and who last changed it, following U10. Marking it paid or unpaid counts as a change.

## Bills table

- **E13.** The Bills table follows T1 to T5, with Mark paid or Mark unpaid on each row beside Edit and Delete. Its columns are Supplier, Bill number, Category, Bill date, Due date, Total and Status. The status is a chip: Unpaid, then Overdue in its place once the bill is overdue, or Paid. The table's search matches the supplier, the bill number and the category (T2). Total sorts by amount, Category in the list's order, and Status as Overdue, Unpaid, Paid. Under Unpaid, Mark paid takes the row out of the table, and under Paid, Mark unpaid does. As with Archive (G10), focus then moves to the table's search box, so it's never left on nothing (Q3). Under All, the row stays, and focus stays on its button, which now reads Mark unpaid or Mark paid.
- **E14.** A status filter beside the search box, like Contacts' (T6), offers All, Unpaid, Overdue and Paid, each with a count, such as "Unpaid (9)". It's kept in the address as `status`: none means Unpaid, then `all`, `overdue` or `paid`. Unpaid includes the overdue bills, because they're unpaid too. The section opens on Unpaid, sorted by due date, earliest first, so overdue bills come first and the next to fall due follow them. The filter stays in the address with the search, sort and page (T4).
- **E15.** With no bills at all, the table invites the first one (T7). With bills but none under the filter, it says so, such as "No unpaid bills." or "No overdue bills.", with a button that shows All. A search with no matches says so, such as "No unpaid bills match "acme".", and offers to clear the search. If bills match under All, it also says how many, such as "4 bills match under All.", with a button that shows All. That button reads "Show all bills". Clearing the search leaves the filter as it was.

| Table | Columns | Default sort |
|---|---|---|
| Bills | Supplier, Bill number, Category, Bill date, Due date, Total, Status | Due date, earliest first, under the Unpaid filter |

## Adding, editing and deleting

- **E16.** Add and Edit open the same form in a dialog, following F1, F2 and F10. The supplier picker can be searched, but unlike the CRM's pickers (F3) it can't add an organization on the spot: with no match it says "No organizations match.", and a new supplier is added in Organizations first. That keeps the CRM's forms out of the bills area ([Layout rules](architecture.md#layout-rules)). The form shows the total as the amount and the tax are typed. Add bill on an organization's page fills in the supplier (F1). The checks apply to the bill as it would be after the save, so a paid date is checked against a bill date changed in the same save.

| Record | Required | Other fields | Defaults |
|---|---|---|---|
| Bill | Supplier, Bill number, Bill date, Due date, Amount, Category | Tax, Paid on, Notes | Bill date: today. Due date: 30 days after the bill date. Tax: $0.00. Paid on: blank, so unpaid. |

- **E17.** Delete asks first (D1), in a dialog that names the bill and its supplier and says it can't be undone: "Delete bill INV-0042 from Northwind Software? It will leave the dashboard's Money section. This can't be undone." Nothing else is deleted with it. After a delete from the bill's page, the app returns to Bills (R4).

## Bill page

- **E18.** A bill's page shows its bill number, its supplier as a link to the organization, its status chip, its total, the amount before tax and the tax, its category, its bill date, due date and paid date, its notes, and who added it and last changed it, as in R6. It has Edit, Mark paid or Mark unpaid, and Delete. There's no timeline, because nothing is logged against a bill. An address that couldn't be a bill, or names one that doesn't exist, shows "This bill no longer exists" with a link back to Bills (N4).

## An organization's bills

- **E19.** An organization's page has a Bills panel (R7), below its contacts, deals and quotes, listing every bill from it: unpaid ones first, earliest due first, then paid ones, newest bill date first. Each shows its bill number, which opens the bill's page, its due date, its total and its status chip. When any is unpaid, a line under the heading says how much, such as "$4,200.00 unpaid, $1,100.00 of it overdue", exact to the cent however large it gets. The panel has Add bill, which fills in the organization as the supplier, and scrolls once it lists more than about 8 bills. With no bills, it says "No bills from this organization." Bills aren't tied to deals, so a deal's page has no Bills panel.

## The Money section

- **E20.** Bills adds a Money section to the dashboard, below the dashboard's own part (H10). Its figures come from the bills area's own route, worked out by the backend with its today, and are read again when the day changes, as the dashboard's are. Every figure in it uses bills' totals, tax included, and is exact to the cent however large it gets, past the 2^53 cents a browser's numbers hold exactly.
- **E21.** **What we owe** is the total of every unpaid bill, overdue ones included, with how many there are. **Overdue** is the total of the overdue bills, with how many. Each links to Bills under that filter (E14). With no unpaid bills, both show $0.00.
- **E22.** **Due in the next 30 days** is a timeline of the unpaid bills due from today to 30 days from today, both days included, with their total and how many there are above it. Each bill is a bar at its due date, as tall as its total, in its category's color, and bills due on the same day stack. A bill too small to see beside the others is drawn 4px tall, so it can still be seen and pointed at. Overdue bills aren't on it, because Overdue already counts them. Pointing at a bar shows the bill's supplier, number, category and total, for that bill alone, not the whole day. A table behind the chart, for screen readers, lists the bills due, with their due date, supplier, number, category and total. With none due, it says "No bills due in the next 30 days."
- **E23.** **Spending by category** shows, for each of the last 12 months including the current one, the total of the bills dated in that month, paid or not, stacked by category, with a category too small to see drawn 4px tall, as on the timeline. A bill counts in the month of its bill date, so a bill dated in a later month isn't on it yet. Months with no bills show as zero, and the current month is marked "so far". Pointing at a month shows each category's total and the month's. A legend names the six categories beside their swatches. A table behind the chart, for screen readers, gives each month's total for each category, and the month's total. With no bills in the 12 months, it says "Spending will show here once you've added bills."
- **E24.** At the limits in Q1, the Money section's data arrives in under 200ms, as the dashboard's does.

## Screens

### Bills table

Laid out like the other tables ([Screens](records.md#screens)): the page title with Add bill beside it, then the search box with the status filter after it, then the table on a panel. Bill numbers, dates and totals are in JetBrains Mono, like other figures in tables, and totals sit at the right of their column with their cents. A category shows its 10px round swatch, then its name in ink. Edit, Mark paid or Mark unpaid, and Delete are icon buttons at the end of each row, always visible, with labels for screen readers in the table's pattern, the button's words and then the row's name, such as "Mark paid bill INV-0042 from Northwind Software". The row's name includes the supplier, because bill numbers repeat across suppliers. Mark paid uses lucide-react's circle-check icon, and Mark unpaid its undo-2 icon. An overdue row is marked by its Overdue chip alone, with no tint and no colored edge.

### Bill page

The two columns of the other record pages ([Screens](records.md#screens)). The page title is "Bill INV-0042", with the status chip after it and Edit, Mark paid or Mark unpaid, and Delete at the right. Under the title, "From Northwind Software" names the supplier, as a link. The left column holds the details panel: the total in JetBrains Mono at the headline figure size, then the amount before tax and the tax, the category with its swatch, the bill date, the due date and the paid date, or "Not paid yet" in muted ink, with the lines from R6 at its foot in muted ink. The right column holds the notes on a panel of their own, in body text with their line breaks kept, or "No notes." in muted ink.

### Bill form

A dialog like the other forms. The fields come in this order: Supplier, Bill number, Category, then Bill date and Due date side by side, then Amount and Tax side by side, each showing `$` at its start and its figures in JetBrains Mono. Under them, the total reads "Total $1,364.00", in JetBrains Mono, or "Total" alone until the amount can be read. Then come Paid on, with the hint "Leave blank if it isn't paid yet.", and Notes, a box about four lines tall. The button reads Save bill.

### Mark paid dialog

A small dialog titled "Mark bill INV-0042 paid", with a Paid on date box holding today, and Mark paid and Cancel buttons. A blank date gets "Choose a paid date". Once it closes, focus goes back to the button that opened it, or to the table's search box if that button's row has left the table.

### An organization's Bills panel

In the left column of the organization's page, under its contacts and deals, in the same style as their panels. The heading "Bills" has Add bill at the right, and the line saying what's unpaid sits under it in muted ink. Each bill is one row: the bill number as a link, the due date and the total in JetBrains Mono, and the status chip at the end. The due date takes the width of the longest date, such as Sep 30, 2026, and the total and the chip have fixed widths too, so each starts at the same place in every row.

### Money section

Below the dashboard's own part, with the same 12px gap as between its panels, comes the section heading "Money", then two panels side by side: Bills to pay on the left, at about 40% of the width, and Spending by category on the right, at about 60%, as in the dashboard's bottom row. At 1440 by 900 the whole section fits in the window once it's scrolled into view.

```
Money
+---------------------------------------+ +------------------------------------------------------+
| Bills to pay                          | | Spending by category                                 |
| What we owe           Overdue         | |                                          $18,240.00  |
| $24,310.00            $3,150.00       | |                                            so far    |
| 9 unpaid bills        3 bills         | |   stacked columns for 12 months, in category colors  |
|                                       | |                                                      |
| Due in the next 30 days   $14,200.00  | |                                                      |
|                           7 bills     | |                                                      |
| bars at each due date, Today to Dec 5 | | o Software  o Contractors  o Travel  o Office  ...   |
+---------------------------------------+ +------------------------------------------------------+
```

What we owe and Overdue are headline figures, in JetBrains Mono at the headline figure size, each with its label above and its count below in muted ink, and each a link. The figures are in ink, Overdue included: the label says what it is, so it needs no alert color. The timeline's axis starts at "Today" and marks each week, such as Nov 12, with its money axis on the right inside the panel. The spending chart follows the charts' rules in [Visual design](visual-design.md#charts).
