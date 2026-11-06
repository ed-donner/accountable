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
