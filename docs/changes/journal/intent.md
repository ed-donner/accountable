# Intent: the journal

## Problem

The books are hidden. Nobody can see the entries an invoice or a bill made, or follow an account's balance over time.

## Proposed outcome

Every invoice, payment and bill shows an Accounting panel with the entries it made: each line's account, debit and credit, with reversals marked. The Journal page under Accounting lists every entry, newest first, with filters for the account and the dates, and a search by description or document number, each entry linking to the record it came from. Clicking an account anywhere opens its ledger: a chart of its balance over the last 12 months, and every line that touched it with a running balance.

## Constraints

- Everything here is read only. Entries can't be changed from these pages.
- Debits and credits are shown the way an accountant expects: in two columns, with each entry's totals equal.
- The Journal and each ledger stay quick with every entry in the sample data, and load more as you scroll or page.
- The chart matches the dashboard's other charts: the same chart library, the brand's colors in light and dark mode, and the same tooltips.
- Every unit test, old and new, runs in under a second on this computer, because CI runs on a much slower machine.
- No new dependencies unless the plan makes the case for one.

## Not in this change

- Entering or editing journal entries.
- Exporting the journal.

## Success criteria

1. npm run check passes.
2. The Accounting panel on an invoice, a payment or a bill shows exactly the entries it made, reversals included.
3. Each ledger's running balance ends at the account's balance in the books.
4. The filters and search find the right entries.
5. On a fresh copy with the sample data, the Journal, the ledgers and the panels are full and look like they belong in the app.

## Decisions

- A payment has no page of its own, so its Accounting panel sits with the payment on the invoice page, and the invoice's panel shows the invoice's own entries only.
- Entries with the same date are ordered newest first by when they were posted, so a reversal comes above the entry it cancels.
- A ledger's running balance follows the account's own sign rule (J2), so a liability or revenue account's balance rises with a credit; the chart shows the balance at each month's end.
- The date filters are inclusive and use entry dates; the search matches a description or a document number, ignoring case and any part of the text.
- The Journal and ledgers load in pages as you scroll, and a running balance is computed on the backend over all earlier lines, so it stays right when filters or paging are used.
- Entries get a stored description and document number (migration 0013, filled in for old entries), written when they are posted like every other figure on an entry, so the search needs no joins to other areas' tables and old wording never changes.
- The ledger is its own route with the running balance worked out in the database by a window function over the account's lines, so a later page, or the newest line, always agrees with the account's balance and the cost stays one query.
- A ledger counts every entry, including any dated after today, so its newest balance is the account's balance in the books; the chart ends at this month, marked "so far", and the two can differ only when an entry is dated in a later month.
- Panels read the entries one record made through `kind` and `source_id` on `/books/entries`, a bill's including its paid entries; a payment's panel opens from its row, and a deleted payment's reversal is read in the Journal only.
- The Journal's filters and search live in the page's address so refresh and back work, the search asks the backend after a 150ms pause as the top bar's does, and Load more sits beside the scroll loading so keyboard users can reach every entry.
- Reversal and Reversed use the quiet chip, not the alert one, since a reversal is a normal event; account and document links are ink with the line-color underline, as other links are, because Cerulean is under 4.5:1 on white.
