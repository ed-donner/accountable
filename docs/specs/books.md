# Spec: The books

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## The books

Accountable keeps double-entry books in the background. Every event that moves money posts a journal entry, so the books say what the business earned, what it owns and what it owes, and can be checked the way an accountant would check them. Nobody types an entry: the invoices, payments, bills and the opening balance post their own, in the save that changes them. Every invoice, payment and bill shows the entries it made in an Accounting panel, the Journal page lists every entry with filters and a search, and an account's ledger charts its balance and follows it line by line. The reports are [Profit and loss](profit-and-loss.md#profit-and-loss) and Aged balances ([aged-balances.md](aged-balances.md#aged-balances)), which works out its figures from the invoices and bills and checks them against the books. Balance sheet still says its report is coming, and the backend already answers what they will ask: an account's balance on a date, each account's totals by month, and the entries behind any figure.

### Accounts

- **J1.** The chart of accounts is fixed. It has twelve accounts, in this order, each with a type: assets are what the business owns, liabilities what it owes. The chart is kept in the code, not the database, and nothing in the app adds, renames or removes an account.

| Account | Type | What it holds |
|---|---|---|
| Cash | Asset | The money the business has. The opening balance, plus the payments received, less the bills paid |
| Receivable | Asset | What customers still owe on issued invoices |
| Payable | Liability | What the business still owes on unpaid bills |
| Tax payable | Liability | The sales tax charged on issued invoices |
| Owner's equity | Equity | What the owner put in: the opening balance |
| Revenue | Revenue | What issued invoices charged before tax |
| Software, Contractors, Travel, Office, Marketing, Other | Expense | What the bills cost, tax included, one account for each bill category ([E6](bills.md#bills)) |

- **J2.** An account's balance is its debits less its credits for an asset or an expense, and its credits less its debits for a liability, equity or revenue, so a balance is above zero when the account is on its usual side. It's below zero when the account has gone the other way, such as Cash when the business is overdrawn, and it shows with a minus sign, as the cash flow's balances do (Y12).

### Entries

- **J3.** A journal entry is a dated set of lines. Each line debits or credits one account by an amount in whole cents, more than 0. Every entry balances: its debits add up to its credits, to the cent. The backend refuses to write one that doesn't, so no save can leave unbalanced books. A line whose amount would be 0, such as the tax on an invoice with no tax, is left out, and an event with no money in it, such as an opening balance of $0.00, posts no entry at all.
- **J4.** Each entry records the day it's dated, what kind of record it's for and that record's id (its source), what kind of event it was, a description, its document number, the page that opens the record, who made the change, and when. The description is a line of plain words written when the entry is posted and never worked out again, so it keeps the wording it had (table below). The document number is the number the person knows the record by: an invoice's number, a payment's invoice's number, a bill's own bill number, and none for the opening balance. A reversing entry has the description for its event, and an entry reposted by a change has the same one as the reversal beside it.

| Event | Description |
|---|---|
| `invoice_issued` | Invoice INV-0007 issued |
| `payment_recorded` | Payment received on INV-0007 |
| `bill_added` | Bill 4417 from Northwind Software |
| `bill_paid` | Bill 4417 paid |
| `opening_balance_set` | Opening balance set |
| `invoice_voided` | Invoice INV-0007 voided |
| `payment_deleted` | Payment deleted from INV-0007 |
| `bill_changed` | Bill 4417 changed |
| `bill_unpaid` | Bill 4417 marked unpaid |
| `bill_deleted` | Bill 4417 deleted |
| `opening_balance_changed` | Opening balance changed |
| `opening_balance_cleared` | Opening balance cleared |

  The kinds are invoice, payment, bill, bill payment (a bill's paid entry, whose source is the bill) and opening balance. The events are in J5 and J7. A reversing entry also records the entry it reverses, and an entry that has been reversed says by which. The page it opens is the source's own, such as `/invoices/7` or `/bills/12`. A payment's is its invoice's, because payments have no page of their own, and the opening balance's is `/settings`. A source that has since been deleted keeps its address, which then shows N4's message.
- **J5.** Each event posts exactly these entries, on these dates, with the amounts the record holds, never worked out again:

| Event | Posts | Dated |
|---|---|---|
| `invoice_issued` | Debit Receivable with the invoice's total. Credit Revenue with its subtotal, and Tax payable with its tax ([B16](settings.md#for-quotes-and-invoices)) | The issue date |
| `payment_recorded` | Debit Cash and credit Receivable, with the payment's amount | The payment's date |
| `bill_added` | Debit the expense account for the bill's category and credit Payable, with the bill's total, tax included, since Accountable doesn't claim tax back | The bill date |
| `bill_paid` | Debit Payable and credit Cash, with the bill's total. Posted when a bill is marked paid, or added or saved with a paid date | The date it was paid |
| `opening_balance_set` | Debit Cash and credit Owner's equity, with the opening balance. Below zero, the sides swap, so an overdrawn account debits Owner's equity and credits Cash | Its date |

Saving a draft, deleting a draft, sending a quote and every other change that moves no money post nothing.

- **J6.** Entries are never changed or deleted. A change undoes an entry with a reversing entry: the same lines with debits and credits swapped, dated the same as the entry it reverses, so every month's figures still match the records. An entry is reversed at most once, and the reversal of a reversal doesn't exist, because a change posts a fresh entry instead. The events that reverse, and what they reverse:

| Event | Reverses | Then posts |
|---|---|---|
| `invoice_voided` | The invoice's issue entry. An invoice with payments can't be voided (V14), so nothing else is open | Nothing |
| `payment_deleted` | The payment's entry | Nothing |
| `bill_changed` | The bill's entry, when the amount, tax, category or bill date changed, and its paid entry too, when it's paid and the total or the paid date changed | The new entry or entries, as `bill_added` and `bill_paid` post them, with the event `bill_changed` |
| `bill_unpaid` | The bill's paid entry | Nothing |
| `bill_deleted` | The bill's entry, and its paid entry if it's paid | Nothing |
| `opening_balance_changed` | The opening balance's entry, when the amount or the date changes | The new entry |
| `opening_balance_cleared` | The opening balance's entry | Nothing |

A save that changes nothing money-related, such as a bill's notes, due date or number, or its supplier, posts nothing, and the Undo that marks a bill paid again just after it was marked unpaid (E10) posts a new `bill_paid` entry on the date it had.

- **J7.** An entry is posted in the same database transaction, under the same write lock, as the change that causes it, so a record never exists without its entry, and an entry never exists without its record. If the entry can't be posted, the change isn't made and the person gets an error, never a half-done save. Issuing an invoice, recording or deleting a payment, voiding, adding, changing, deleting, marking paid and marking unpaid a bill, and saving the settings with a changed opening balance each post inside their own transaction, so the books can't go wrong between one request and the next.
- **J8.** Each entry says who made the change, taken from the token as every save is (U7), never from the request. For the opening balance that's whoever saved the settings. An entry posted for a record that already existed (J9) has no one recorded, and shows no name.

### The records that already exist

- **J9.** The books are complete from the first day. The migration that adds them posts the entries for every record the database already has, dated by each record's own dates, with no one recorded as making them: each issued or void invoice's issue entry, and for a void one its reversal too, dated the same, each payment's, each bill's, and for a paid bill its paid entry, and the opening balance. Drafts have none. A new database's sample records post theirs as they're made, put down to the same made-up teammates (M7), so the books are complete on a fresh copy too. Sample entries are posted by the same code every save uses, never written out another way. The migration that adds the description and the document number (J4), `0013`, fills them in for every entry already there, from the record each came from, in the wording of the table in J4, in a fixed number of queries however many entries there are. Where a record has since gone, such as a deleted bill, the entry gets the description from its event alone and no document number.
- **J10.** `npm run seed` resets the books with everything else, and posts the entries for the sample records and the sample company's opening balance. `npm run empty` removes every journal entry with the records, then posts the opening balance's entry again from the settings it leaves, so an emptied copy's books still agree with its settings, and the books still balance. The clearing steps for the shared app remove the journal entries in the same transaction as the records and the settings, so there's nothing for the books to disagree with. These are the only ways entries leave the database ([C4](running.md#running-and-keeping-data), C11).

### The checks

- **J11.** Four checks hold on the sample data and after every kind of change in J5 and J6, and they're run in their own file, `backend/tests/test_books_checks.py`, which no later change may edit:
  1. Every entry balances: its debits equal its credits.
  2. The books as a whole balance: over every entry, the debits equal the credits.
  3. Receivable equals what the issued invoices say is still owed: each issued invoice's total less its payments, void invoices and drafts counting as nothing owed.
  4. Payable equals the total of the unpaid bills, tax included.

  The checks read the books and the records through the database, never through the code that posts, so a mistake in the posting can't hide from them. A later change that needs another check adds it in a file of its own.

### Reading the books

- **J12.** The backend answers four questions, each from the entries alone, and none of them is stored:
  - **Balance on a date:** every account's balance on a day, counting every entry dated up to and including it (`GET /books/balances`). Without a day, it's today.
  - **Totals by month:** for each month in a range, each account's debits, its credits and its balance at the month's end (`GET /books/months`). Without a range, it's the last 12 months, as every chart by month shows.
  - **The entries behind a figure:** the entries in a range of dates that touch an account, newest first, each with its lines, its source, the page that opens it and a label naming the record, such as the invoice's number or "8841 from Northwind Software" for a bill, or nothing if the record has been deleted or has no name, as a payment and the opening balance have none (`GET /books/entries`). The books don't read the areas to name a record: each area that posts gives `main.py` a function that names its records in one read, as it gives its holds and cash, so the label is the record's name now, not as it was when posted. A balance on a day is the entries to that day, a month's figure the entries between the month's first and last days, so any figure can be traced to the invoices, payments and bills behind it, reversals included. The entries can also be narrowed to those whose description or document number holds some text, ignoring case, and to those a record made, by its kind and id (a bill's include its paid entries), which is what the Journal's search and the Accounting panels use ([J17 and J19](#the-journal-and-the-ledgers)).
  - **An account's ledger:** every line that touched one account, newest first, each with the account's running balance after it, and the account's balance after its last line (`GET /books/accounts/{key}/ledger`). Lines are ordered by their entry's date, then by entry, then by line, and the running balance adds them up from the account's first line in that order, by J2's rule for the account, whichever page is asked for ([J18](#the-journal-and-the-ledgers)).

  Sums are sent as strings of digits, with a minus sign in front below zero, as the cash flow's are (Y20), because a sum of 46 invoices can pass what a browser holds exactly. A line's own amount is a number. The routes start with `/api/books` ([API](backend.md#api)).
- **J13.** The books' Cash and the cash flow's agree. On a fresh copy with the sample data, the Cash account's balance on today equals Cash today on the dashboard's cash flow ([Y16](cash-flow.md#reading-it)), to the cent. They count the same payments and paid bills, and the opening balance. They can differ only where the business moved cash before the opening balance's date: the cash flow leaves those payments and bills out of its balance, because the opening balance is the cash at the start of its date (Y9), and the books keep every entry. The sample data moves no cash before its opening balance's date.
- **J14.** At the limits in Q1, the balances, the totals by month, a page of entries with any filter or search, and a page of a ledger with its running balances each arrive in under 200ms. A ledger's running balances are worked out in the database in one query over the account's lines, never a read for each line. Posting adds a few writes to a save and never one per line or per record, and the reads group in the database by day and account, and fold into months in Python, as the cash flow does, so none of them takes a read for each record.

### The Accounting pages

- **J15.** The menu under the person's initials has an Accounting group of four links, Profit and loss, Balance sheet, Journal and Aged balances, between the themes and Company settings ([N7](shell.md#app-shell)). They open `/accounting/profit-and-loss`, `/accounting/balance-sheet`, `/accounting/journal` and `/accounting/aged-balances`, each with its own address (N2). An account's ledger opens at `/accounting/accounts/cash`, with the account's key from J1 after `accounts/`, and has no link in the menu. `/accounting` alone opens Profit and loss. Like Company settings, an Accounting page keeps the top bar, isn't one of its nine sections, and so leaves no section marked as current. Any other address under `/accounting` shows "This page no longer exists" (N4). A ledger for a key that isn't one of the twelve accounts shows "This account no longer exists" with a link back to Journal.
- **J16.** Profit and loss ([X1 to X19](profit-and-loss.md#profit-and-loss)) and Aged balances ([X1 to X20](aged-balances.md#aged-balances)) have their reports. Balance sheet is for now a placeholder that says the report is coming and what it will show, in plain words. It has its title, "This report is coming soon." and what it will hold. Journal is a real page ([J17](#the-journal-and-the-ledgers)) and has no placeholder:

| Page | What it says it will show |
|---|---|
| Balance sheet | What the business owns and owes on any day you choose, and what's left over for the owner. |

  The placeholder reads nothing from the backend, so they never show a failed read, and they work with the network off apart from the app itself.

### The journal and the ledgers

Everything here is read only (J6). No page, panel or button in it adds, changes, reverses or deletes an entry, and the backend has no route that does.

- **J17.** The Journal page lists every entry in the books, newest first, by date, then the newest posted first, so a reversal comes above the entry it cancels. Each entry shows its date, its description, its document number as a link to the record it came from (J4), a "Reversal" mark on an entry that reverses another and a "Reversed" mark on one that has been, who made it and when, and its lines: each line's account, as a link to the account's ledger, and its amount in a Debit column or a Credit column, never both, so a line's amount is on its own side as an accountant expects. Under the lines the entry's totals sit under the two columns, and they're equal (J3). An opening balance's link opens Company settings, and a source that has been deleted keeps its link, which shows N4's message (J4). The page has:
  - **A search** for text in an entry's description or document number, ignoring case, anywhere in it, so "inv-00" finds the invoices and "northwind" a supplier's bills. Unlike a table's search, which filters what the page already holds, this one asks the backend, so it takes effect once typing pauses for 150ms, as the top bar's does ([K3](search.md#search)), and a reply to an older search never replaces a newer one. It ignores case in any language and gives the same results on SQLite and Postgres (K2), and takes up to 100 characters.
  - **An account filter**, one of the twelve accounts or "All accounts", which keeps the entries with a line in that account and still shows every line of each, as the backend's does (J12).
  - **From and To dates**, both days included, either or both, keeping the entries dated within them. A From after the To finds nothing and says so.
  - **Clear filters**, shown only while any is set.

  The filters and search combine, and are kept in the page's address (`/accounting/journal?account=cash&from=2026-10-01`), so refresh, back and forward keep them (N2) and a link to a filtered Journal can be shared. A filter or search that changes starts the list again from its top. The page says how many entries match, such as "230 entries" or "12 of 230 entries" when filtered.
- **J18.** An account's ledger opens by clicking the account's name wherever the app shows one: in the Journal and in an Accounting panel (J19). It shows the account's name and type, its balance, a chart of its balance at the end of each of the last 12 months, and a table of every line that touched it, newest first, each with its date, description, document number as a link to the record, the Debit and Credit columns, and the account's running balance after that line. The running balance follows J2's rule for the account, so Payable rises with a credit and Cash with a debit. The newest line's running balance is the account's balance in the books and the figure the header shows. It counts every entry, including any dated after today, so with none of those it's the account's balance on today (J12). The ledger has no filters. The chart's last month is this month, marked "so far" as the other charts' are. A month with no entries carries the balance before it. With no line in the account, the ledger says "No entries in this account yet." and the chart is the account at $0.00.
- **J19.** Every invoice, payment and bill shows an Accounting panel with exactly the entries it made, oldest first, reversals included, each as in J17 with its date, description, lines, the Debit and Credit columns, the totals and the Reversal and Reversed marks, and each account linking to its ledger. An invoice's has its issue entry and, if it was voided, the reversal. A payment's has its entry and, once the payment is deleted, nothing, because a deleted payment has no row to show it on, so its reversal is read in the Journal. A bill's has its entries and its paid entries, with the reversals and the entries that replace them when it was changed, unpaid or marked paid again. A draft invoice has no Accounting panel, because it posts nothing (J5), nor does a quote. The panel sits on the invoice page, with each payment's on its row (V33), and on the bill page (E26). A bill of $0.00 posts no entry (J3), so its panel says "No entries."
- **J20.** Reading is quick. The Journal and a ledger load a page of 100 at a time and load the next page as the end of the list scrolls into view, with a Load more button after the last row for anyone who can't scroll, which also works from the keyboard (Q3), until all are shown. The next page is read before the end is reached, so scrolling doesn't stop at it. The lists stay quick at the limits in Q1, and with all the entries in the sample data, because a page is read and drawn at a time. A page already read isn't read again unless the entries change or the day does.
- **J21.** The pages follow the rules of every screen. A read that fails shows N6's message with Try again, and what is already showing stays. A search or filter that finds nothing says "No entries match." with Clear filters. With no entries at all, the Journal says "No entries yet. They appear here as invoices, payments and bills are entered." The pages and panels show no console errors (Q2), reach every control by keyboard with a visible focus ring (Q3), and the account links, the document links and the Load more button are real links and buttons.
- **J22.** On a fresh copy with the sample data the Journal, each ledger and every panel on an invoice, a payment and a bill are full: about 230 entries in the Journal, and a ledger with a chart and lines for Cash, Receivable, Payable, Tax payable, Owner's equity, Revenue and each expense account the bills use. Every ledger's newest running balance equals the account's balance in J12, so Receivable's equals what the invoices say is owed, Payable's what the unpaid bills say, and Cash's the cash flow's Cash today (J11, J13).

## Screens

### Placeholder pages

Profit and loss has its own screen ([Screens](profit-and-loss.md#screens)), and so has Aged balances ([Aged balances page](aged-balances.md#aged-balances-page)), and Journal has its own ([Journal page](#journal-page)). The placeholder page is the page title at the top left, in Instrument Sans at the size the Company settings title has, semibold, in ink, and under it one panel on the page background, rounded with no outline, as the other panels are, in light and dark mode. The panel is about 560px wide and left-aligned under the title. In it, the lucide-react Info icon in Cerulean comes before "This report is coming soon." in semibold ink, then, under it in muted ink, the sentence for that page from J16. No button, no figure, no table and no gradient. It sits as it does on every page, under the top bar's floating bar with space around it, and there's no line across the top.

The placeholder is one component, which takes the title and the sentence, so the wording is in one place. Its words are the ones in J16, with no exclamation marks.


### Entries

The Journal and the Accounting panels draw an entry the same way, in one component. An entry is a block, with no line or border across its top or on one edge, set apart from the next by space. Its heading row holds the date in JetBrains Mono, the description in semibold ink, then the document number as a link in ink, underlined in the line color as links are, and at the right the marks: "Reversal" and "Reversed" as quiet chips (the Draft chip's tones, never Raspberry, because a reversal is a normal event and not a warning). In the Journal a row of muted ink under the heading says who made it and when, such as "Dana Whitfield, Oct 30, 2026", or nothing for an entry posted for a record that already existed (J8). Under it come the lines as a table of three columns, Account, Debit and Credit, with the two money columns the same width, right-aligned, in JetBrains Mono with the currency, such as $1,250.00. A line's other side is left empty, not $0.00. The account is a link in ink, underlined as the document number is, opening its ledger. A reversal's lines show the swapped sides exactly as posted. The last row is "Total" in semibold with the debits' total under Debit and the credits' under Credit, which are equal. A line sits 36px tall, the table has no grid lines, only a faint rule above the totals row in the line color, and a reversed entry is not dimmed or struck through, since it still counts in the books.

The headings "Account", "Debit" and "Credit" are in muted ink, in every entry's table, so a screen reader hears each figure's column, and a sighted reader sees them on each entry.

### Journal page

The page title "Journal" at the top left, as the other Accounting pages have it, with "230 entries" beside it in muted ink. Under it one toolbar panel, then one panel holding the entries. In the toolbar, in one row: a search box with the lucide-react Search icon and the placeholder "Search description or document", an account select reading "All accounts", From and To date inputs and, only while a filter is set, a "Clear filters" text button. The controls are the ones the other forms use, with their focus ring, and the labels "Search entries", "Account", "From" and "To" for screen readers. The entries panel is in the panel color, rounded with no outline, with each entry as in Entries, a 24px gap between them. After the last loaded entry, "Showing 100 of 230 entries" in muted ink and a Load more button, a secondary button, while more remain. While the next page loads, the entries stay and a quiet "Loading more..." sits at the foot. The first load shows five grey placeholder entries in the shapes of real ones, and the failed read and empty states are the words in J21, centered in the panel, with a Cerulean Info icon in front of the first.

### Ledger page

The title is the account's name, such as "Cash", with its type beside it in muted ink ("Asset"), and a small link back to the Journal, "All entries", at the right. Under it, two panels side by side, the balance panel and the chart panel. The balance panel holds the account's balance as the headline figure in JetBrains Mono with its currency, negative with a minus sign (J2), and under it in muted ink "after 87 lines, last on Oct 30, 2026" or "No entries yet" with none. The chart panel is the line chart ([Charts](visual-design.md#charts)): the balance at each of the last 12 months' ends, the month names in a band under the fill, where the line can't cross them, this month's segment dashed and ended in a ringed dot labeled "so far", the money axis inside the panel on the right, its labels Midnight where they stand on the fill and ink elsewhere, and the same tooltip as the dashboard's, on the raised surface, giving the month and the balance with its currency. A table behind the chart, for screen readers, lists each month's balance. Below, the lines panel: a table with the columns Date, Description, Document, Debit, Credit and Balance, the money columns right-aligned in JetBrains Mono, newest first, the header row sticking to the top of the panel while it scrolls, loading as in the Journal. Each row's description is plain ink, its document number a link to the record, and its Balance in semibold. A row from a reversing entry carries the quiet "Reversal" chip after its description, and one that was reversed the "Reversed" chip. The Debit and Credit cells are blank on the other side.

### Accounting panels

On an invoice's page and a bill's page ([V33](invoices.md#the-invoice-page), [E26](bills.md#bill-page)), a panel headed "Accounting" in the same panel style as the page's others, at the foot of the left column on an invoice, below its Payments panel, and below the notes in the right column on a bill. It holds the record's entries in the Entries layout, oldest first, and no who-and-when line. With none, "No entries." in muted ink. A payment's panel is the same, opened by the Accounting button on its row in the Payments panel, with no heading of its own. A failed read shows N6's message in the panel with Try again, and does not take the rest of the page with it.

### Accounting links in the menu

Under the themes, "Accounting" is a label in muted ink, in the same style as "Theme", over four links with no icons and no check marks, each as tall as a theme's row. Choosing one closes the menu and opens the page. The menu is still 240px wide, and groups are separated by space, not lines. The arrow keys, Enter, Space and Escape work as for the rest of the menu.
