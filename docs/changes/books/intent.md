# Intent: the books

## Problem

Accountable records invoices, payments and bills, but it keeps no books. Nobody can see whether the business is making a profit, what it owns and owes on a given day, or check that the figures add up the way an accountant would.

## Proposed outcome

Accountable keeps double-entry books in the background. Every event that moves money posts a journal entry: issuing or voiding an invoice, recording or deleting a payment, adding, changing or deleting a bill, marking a bill paid or unpaid, and the opening cash balance in Settings. The records that already exist get their entries too, so the books are complete from the first day.

A new Accounting section in the menu has four pages for the reports to come: Profit and loss, Balance sheet, Journal and Aged balances. For now each says the report is coming soon. The backend gives those reports what they'll need: any account's balance on a given date, each account's totals month by month, and the entries behind any figure, each linking to the invoice, payment or bill it came from.

## Constraints

- A fixed chart of accounts: Cash, Receivable, Payable, Tax payable, Owner's equity, Revenue, and one expense account for each bill category (Software, Contractors, Travel, Office, Marketing and Other).
- Issuing an invoice debits Receivable with its total, and credits Revenue with its subtotal and Tax payable with its tax, on the issue date. A payment debits Cash and credits Receivable, on the payment date.
- A bill debits the expense account for its category with its total, tax included, and credits Payable, on the bill date. Tax on a bill counts as part of the expense, since Accountable doesn't claim tax back. Marking a bill paid debits Payable and credits Cash, on the date it was paid.
- The opening balance in Settings debits Cash and credits Owner's equity, on its date.
- Every entry balances: its debits equal its credits, to the cent. Amounts are whole cents.
- Entries are never changed or deleted. When something is voided, deleted, changed or undone, a reversing entry cancels the old one, dated the same as the entry it reverses, and a changed bill or opening balance then posts a new entry. That way every month's figures still match the records.
- An entry is posted in the same database transaction as the change that causes it, so a record never exists without its entry, or an entry without its record.
- Each entry records which record it came from, what kind of event it was, and who made the change.
- The four checks below run in their own test file, backend/tests/test_books_checks.py, which no later change may edit: every entry balances; the books as a whole balance; Receivable equals what the issued invoices say is still owed; Payable equals the total of the unpaid bills.
- The Accounting pages follow the app's design, in light and dark mode, and each placeholder says plainly what the page will show.
- Every unit test, old and new, runs in under a second on this computer, because CI runs on a much slower machine.
- No new dependencies unless the plan makes the case for one.

## Not in this change

- The reports themselves.
- Entering journal entries by hand, or changing the chart of accounts.
- Closing a year, tax returns, or claiming tax back on bills.
- Bank accounts or reconciling with a bank statement.

## Success criteria

1. npm run check passes.
2. Every invoice issued, payment, void, bill, bill paid and opening balance has exactly the entries above, and a reversal cancels its entry exactly.
3. Receivable matches the invoices, Payable matches the bills, and the books balance, on the sample data and after every kind of change.
4. On a fresh copy with the sample data, the ledger's Cash today equals the cash balance the dashboard's cash flow chart shows for today.
5. The Accounting section appears in the menu with its four pages, each saying what's coming.

## Decisions

- Entries for records that already exist are posted by the migration, dated by each record's own dates, with no person recorded as having made the change.
- A line of an entry whose amount is zero, such as the tax on an invoice with no tax, is left out; an entry with no money at all, such as a zero opening balance, isn't posted.
- Deleting a bill reverses its bill entry, and its paid entry too if it was paid; marking a bill unpaid reverses the paid entry, each dated as the entry it reverses.
- Changing the opening balance or its date reverses the old entry and posts a new one; clearing it only reverses.
- "Cash today" counts entries dated up to and including today, matching the cash flow's definition, so entries dated in the future don't count.
