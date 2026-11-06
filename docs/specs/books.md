# Spec: The books

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## The books

Accountable keeps double-entry books in the background. Every event that moves money posts a journal entry, so the books say what the business earned, what it owns and what it owes, and can be checked the way an accountant would check them. Nobody types an entry: the invoices, payments, bills and the opening balance post their own, in the save that changes them. The first reports are [Profit and loss](profit-and-loss.md#profit-and-loss), the [Balance sheet](balance-sheet.md#balance-sheet) and Aged balances ([aged-balances.md](aged-balances.md#aged-balances)), which works out its figures from the invoices and bills and checks them against the books. The other Accounting page still says its report is coming, and the backend already answers what reports ask: an account's balance on a date, each account's totals by month, and the entries behind any figure.

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
- **J4.** Each entry records the day it's dated, what kind of record it's for and that record's id (its source), what kind of event it was, the page that opens the record, who made the change, and when. The kinds are invoice, payment, bill, bill payment (a bill's paid entry, whose source is the bill) and opening balance. The events are in J5 and J7. A reversing entry also records the entry it reverses, and an entry that has been reversed says by which. The page it opens is the source's own, such as `/invoices/7` or `/bills/12`. A payment's is its invoice's, because payments have no page of their own, and the opening balance's is `/settings`. A source that has since been deleted keeps its address, which then shows N4's message.
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

- **J9.** The books are complete from the first day. The migration that adds them posts the entries for every record the database already has, dated by each record's own dates, with no one recorded as making them: each issued or void invoice's issue entry, and for a void one its reversal too, dated the same, each payment's, each bill's, and for a paid bill its paid entry, and the opening balance. Drafts have none. A new database's sample records post theirs as they're made, put down to the same made-up teammates (M7), so the books are complete on a fresh copy too. Sample entries are posted by the same code every save uses, never written out another way.
- **J10.** `npm run seed` resets the books with everything else, and posts the entries for the sample records and the sample company's opening balance. `npm run empty` removes every journal entry with the records, then posts the opening balance's entry again from the settings it leaves, so an emptied copy's books still agree with its settings, and the books still balance. The clearing steps for the shared app remove the journal entries in the same transaction as the records and the settings, so there's nothing for the books to disagree with. These are the only ways entries leave the database ([C4](running.md#running-and-keeping-data), C11).

### The checks

- **J11.** Four checks hold on the sample data and after every kind of change in J5 and J6, and they're run in their own file, `backend/tests/test_books_checks.py`, which no later change may edit:
  1. Every entry balances: its debits equal its credits.
  2. The books as a whole balance: over every entry, the debits equal the credits.
  3. Receivable equals what the issued invoices say is still owed: each issued invoice's total less its payments, void invoices and drafts counting as nothing owed.
  4. Payable equals the total of the unpaid bills, tax included.

  The checks read the books and the records through the database, never through the code that posts, so a mistake in the posting can't hide from them. A later change that needs another check adds it in a file of its own.

### Reading the books

- **J12.** The backend answers three questions, each from the entries alone, and none of them is stored:
  - **Balance on a date:** every account's balance on a day, counting every entry dated up to and including it (`GET /books/balances`). Without a day, it's today.
  - **Totals by month:** for each month in a range, each account's debits, its credits and its balance at the month's end (`GET /books/months`). Without a range, it's the last 12 months, as every chart by month shows.
  - **The entries behind a figure:** the entries in a range of dates that touch an account, or any of several given together (the balance sheet's Profit to date needs the revenue and the six expense accounts, [X15](balance-sheet.md#reading-it)), newest first, each with its lines, its source, the page that opens it and a label naming the record, such as the invoice's number or "8841 from Northwind Software" for a bill, or nothing if the record has been deleted or has no name, as a payment and the opening balance have none (`GET /books/entries`). The books don't read the areas to name a record: each area that posts gives `main.py` a function that names its records in one read, as it gives its holds and cash, so the label is the record's name now, not as it was when posted. A balance on a day is the entries to that day, a month's figure the entries between the month's first and last days, so any figure can be traced to the invoices, payments and bills behind it, reversals included.

  Sums are sent as strings of digits, with a minus sign in front below zero, as the cash flow's are (Y20), because a sum of 46 invoices can pass what a browser holds exactly. A line's own amount is a number. The routes start with `/api/books` ([API](backend.md#api)).
- **J13.** The books' Cash and the cash flow's agree. On a fresh copy with the sample data, the Cash account's balance on today equals Cash today on the dashboard's cash flow ([Y16](cash-flow.md#reading-it)), to the cent. They count the same payments and paid bills, and the opening balance. They can differ only where the business moved cash before the opening balance's date: the cash flow leaves those payments and bills out of its balance, because the opening balance is the cash at the start of its date (Y9), and the books keep every entry. The sample data moves no cash before its opening balance's date.
- **J14.** At the limits in Q1, the balances, the totals by month and a page of entries each arrive in under 200ms. Posting adds a few writes to a save and never one per line or per record, and the reads group in the database by day and account, and fold into months in Python, as the cash flow does, so none of them takes a read for each record.

### The Accounting pages

- **J15.** The menu under the person's initials has an Accounting group of four links, Profit and loss, Balance sheet, Journal and Aged balances, between the themes and Company settings ([N7](shell.md#app-shell)). They open `/accounting/profit-and-loss`, `/accounting/balance-sheet`, `/accounting/journal` and `/accounting/aged-balances`, each with its own address (N2). `/accounting` alone opens Profit and loss. Like Company settings, an Accounting page keeps the top bar, isn't one of its nine sections, and so leaves no section marked as current. Any other address under `/accounting` shows "This page no longer exists" (N4).
- **J16.** Profit and loss ([X1 to X19](profit-and-loss.md#profit-and-loss)) , Balance sheet ([X1](balance-sheet.md#the-day)) and Aged balances ([X1 to X20](aged-balances.md#aged-balances)) are reports of their own. For now the other Accounting page is a placeholder that says the report is coming and what it will show, in plain words. It has its title, "This report is coming soon." and what it will hold:

| Page | What it says it will show |
|---|---|
| Journal | Every entry in the books, newest first, each linking to the invoice, payment or bill it came from. |
| Aged balances | (Has its report: [aged-balances.md](aged-balances.md#aged-balances).) |

  The placeholder reads nothing from the backend, so they never show a failed read, and they work with the network off apart from the app itself.

## Screens

### Placeholder pages

Profit and loss and Balance sheet have screens of their own ([Profit and loss](profit-and-loss.md#screens), [Balance sheet](balance-sheet.md#screens)), under the same title, and so has Aged balances ([Aged balances page](aged-balances.md#aged-balances-page)). Each placeholder page is the page title at the top left, in Instrument Sans at the size the Company settings title has, semibold, in ink, and under it one panel on the page background, rounded with no outline, as the other panels are, in light and dark mode. The panel is about 560px wide and left-aligned under the title. In it, the lucide-react Info icon in Cerulean comes before "This report is coming soon." in semibold ink, then, under it in muted ink, the sentence for that page from J16. No button, no figure, no table and no gradient. It sits as it does on every page, under the top bar's floating bar with space around it, and there's no line across the top.

The placeholder is one component, which takes the title and the sentence, so the wording is in one place. Their words are the ones in J16, with no exclamation marks.

### Accounting links in the menu

Under the themes, "Accounting" is a label in muted ink, in the same style as "Theme", over four links with no icons and no check marks, each as tall as a theme's row. Choosing one closes the menu and opens the page. The menu is still 240px wide, and groups are separated by space, not lines. The arrow keys, Enter, Space and Escape work as for the rest of the menu.
