# Week 2 Day 4 instructions

Today a software factory builds the accounting side of Accountable. The books come first, because every report needs them: they go through the factory on their own, and the lead merges them. Then four issues go to the factory at once, one for each report: profit and loss, a balance sheet, the journal, and aged balances. A fifth small one turns an accepted quote into an invoice. Each issue starts an agent in the cloud, on GitHub's own computers, that takes it through the six stages on its own branch and opens a pull request. A second agent reviews each one, the first fixes what the review found, and the lead reviews and merges. On the course, you follow along with my checkpoints. Every prompt and file I used is at the end, if you'd rather build it yourself.

## Follow along with my checkpoints

My checkpoints are branches, like my versions of the earlier days, so they came with your copy of the repo. In the `accountable` folder:

### The books, and the factory

```
git checkout week2day4-books
```

The books were the factory's first issue: read their intent, with the agent's own decisions, and their plan in `docs/changes/books/`. The factory is a few files: `.github/workflows/factory.yml` runs it, `.github/workflows/merging-agent.yml`, the merging agent, brings its pull requests up to date after each merge, `.github/workflows/review.yml`, the review agent, reviews each pull request a person opens, and `.github/factory/` holds the prompts, which are the same prompts as in the earlier days' instructions. The issues I gave it are below, under "The issues".

### The day's end

```
git checkout week2day4-end
npm run seed
npm run dev
```

`npm run seed` brings your local database up to date and puts the sample data back, with its journal entries. It asks first, because it replaces what's in your local copy: type `yes`.

Open the menu under your initials, where Accounting lists the four reports: the profit and loss chart, the balance sheet's slider, the journal and the aged balances. Open any invoice or bill to see the entries it made, and an accepted quote for its Create invoice button. In `docs/changes/`, each report has its intent with the agent's own decisions, its plan, ui-check's report and the review. Stop the app with Ctrl+C when you're done.

## If you'd rather build it yourself

These are the steps and prompts behind my checkpoints. They take many hours of agent time. The factory runs on GitHub's computers with your Claude subscription, so it needs a Pro plan or above.

### Start from main

Your `main` holds your build from Day 3.

Or to build on my Day 3 version, this keeps your own work on a branch called `my-week2day3` and moves your `main` onto my branch:

```
git checkout main
git branch my-week2day3
git checkout --no-track -B main origin/week2day3-end
```

### Set up the factory

The factory's files are in my checkpoint. Copy them onto your `main`:

```
git checkout origin/week2day4-books -- .github/workflows/factory.yml .github/workflows/merging-agent.yml .github/workflows/review.yml .github/factory
git commit -m "The factory"
```

Then on GitHub, in your fork:

1. Push your `main`:

   ```
   git push fork main
   ```

   If you moved your `main` onto my branch and GitHub refuses the push, your fork's `main` still has your own work on it. Save that work to GitHub as its own branch, then replace your fork's `main`:

   ```
   git push fork my-week2day3
   git push --force fork main
   ```

2. Open the Actions tab. If GitHub asks, enable workflows, as on Week 1 Day 4.
3. Make a token for the factory, in a terminal: `claude setup-token`. It signs in with your browser and prints a token that lasts a year.
4. In your fork on GitHub, open Settings, then Secrets and variables, then Actions, and add a repository secret called `CLAUDE_CODE_OAUTH_TOKEN` with the token as its value.
5. In Settings, open Actions, then General, and under Workflow permissions tick "Allow GitHub Actions to create and approve pull requests", then Save. The factory opens its pull requests as GitHub Actions.
6. Open the Issues tab, turn Issues on in Settings if it's off, and add a label called `factory`.

### Prepare main: the books, through the factory

Every report needs the books, so they go to the factory first, on their own. The books' intent also covers what the four reports share, so they don't each build it their own way: the Accounting menu with a place for each report, and the backend's questions about balances and entries.

Open an issue titled `Books` with the intent below as its text, and add the `factory` label. The checklist on the issue ticks off the stages as the factory works. When its pull request is ready, review and merge it as under "Review and merge" below, before you open the other issues.

````
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
````

### The issues

Open one issue for each change below, with the title shown and the intent as its text. Then select all of them in the issue list and add the `factory` label to every one at once. Each label starts its own run of the factory: watch them in the Actions tab, and the checklist on each issue ticks off the stages.

#### Profit and loss

````
# Intent: profit and loss

## Problem

The dashboard shows sales and cash, but nobody can see whether the business is making a profit, or where its money goes.

## Proposed outcome

The Profit and loss page under Accounting opens with a chart of the last 12 months: revenue as one bar each month, expenses beside it stacked by category in each category's color, and a bold line for the profit. Below the chart, the statement for a chosen period: revenue, each expense category, total expenses, profit, and the profit margin as a percentage. A switch picks a month, a quarter or a year, with arrows to step back through earlier periods, and each figure shows its change from the period before. Clicking any figure, in the chart or the statement, opens the entries behind it, each linking to its invoice or bill.

## Constraints

- Every figure comes from the books, never worked out again from the invoices and bills.
- Revenue counts when an invoice is issued, and expenses on the bill date, so the page explains in one line that profit isn't the same as cash.
- The expense categories use the same colors as the spending chart in the dashboard's Money section.
- The chart matches the dashboard's other charts: the same chart library, the brand's colors in light and dark mode, and the same tooltips.
- A change from a period with nothing in it shows as new, never as a percentage, and nothing divides by zero.
- Every unit test, old and new, runs in under a second on this computer, because CI runs on a much slower machine.
- No new dependencies unless the plan makes the case for one.

## Not in this change

- Budgets, or comparing against a budget.
- A cash basis view.
- Exporting or printing the statement.

## Success criteria

1. npm run check passes.
2. Each month's revenue and expenses match the books' entries for that month exactly, and the statement adds up.
3. Clicking a figure lists exactly the entries behind it.
4. The month, quarter and year switches and the arrows show the right periods, with the right changes from the period before.
5. On a fresh copy with the sample data, the chart shows a full year and the page looks like it belongs in the app.
````

#### Balance sheet

````
# Intent: balance sheet

## Problem

Nobody can see what the business owns and what it owes on a given day, or see for themselves that the books balance.

## Proposed outcome

The Balance sheet page under Accounting shows two columns side by side. On the left, what the business owns: Cash and Receivable. On the right, what it owes and what belongs to the owner: Payable, Tax payable, Owner's equity and the profit to date. Each column's total sits at the bottom, with a clear mark when the two are equal. Above the columns, two stacked bars of the same height, one for each side, are made of the accounts in their own colors. A slider runs across the last 12 months, stopping at each month's end and at today. Moving it redraws the bars and the figures for that date, so you can watch the business change month by month and stay balanced. Clicking any figure opens the entries behind it, up to that date.

## Constraints

- Every figure comes from the books, as they stood at the end of the chosen date.
- The profit to date is all revenue less all expenses up to that date, since the books are never closed.
- If the two sides ever differ, the page says so plainly, with the difference, rather than hiding it.
- The slider works with the keyboard as well as the mouse.
- The bars match the dashboard's charts: the same chart library, the brand's colors in light and dark mode, and the same tooltips.
- Every unit test, old and new, runs in under a second on this computer, because CI runs on a much slower machine.
- No new dependencies unless the plan makes the case for one.

## Not in this change

- Comparing two dates side by side.
- Financial ratios.
- Exporting or printing the statement.

## Success criteria

1. npm run check passes.
2. For every date on the slider, each account's figure matches its balance in the books on that date, and the two sides are equal.
3. Clicking a figure lists exactly the entries behind it up to that date.
4. On a fresh copy with the sample data, the bars and columns are full for every month and the page looks like it belongs in the app.
````

#### Journal

````
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
````

#### Aged balances

````
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
````

#### Quote to invoice

In the video I started this one from my phone with Claude Code on the web instead. The factory builds it just as well.

````
# Intent: quote to invoice

## Problem

When a customer accepts a quote, someone has to type its lines again into a new invoice, which is slow and invites mistakes.

## Proposed outcome

An accepted quote has a Create invoice button. It makes a draft invoice on the quote's deal with the quote's lines, quantities, prices and Bill to, and opens it. The quote then links to its invoice, and the invoice links back to the quote.

## Constraints

- Only an accepted quote can make an invoice, and only one. After that the button opens the invoice.
- The invoice is an ordinary draft that can be changed until it's issued.
- The lines keep the quote's prices, even if a product's price has changed since.
- The tax comes from Settings, as on every invoice. If the rate has changed since the quote, the draft says so.
- The sample invoices that match an accepted quote are linked to it.
- Every unit test, old and new, runs in under a second on this computer, because CI runs on a much slower machine.
- No new dependencies unless the plan makes the case for one.

## Not in this change

- Invoicing part of a quote, or a deposit.
- One invoice for several quotes.

## Success criteria

1. npm run check passes.
2. The invoice's lines, quantities and prices match the quote's exactly.
3. A second invoice from the same quote is refused, through the page or the API.
4. The quote and the invoice link to each other.
````

### Review and merge

Each pull request opens as a draft while the factory works, and becomes ready when the review's fixes are in. Then, as the lead, read the change and the review, and run the full checks on your computer before you merge it:

```
git fetch fork
git checkout <the pull request's branch>
npm run check
```

The factory runs `npm run check:quick`, which skips the end-to-end tests. On my run, eight of the end-to-end tests the factory wrote failed on my computer, all mistakes in the tests, and I fixed them before merging. Then merge it on GitHub. After each merge the merging agent brings the others up to date with `main`, resolving any conflicts and running the checks again, so merge the next one when it has finished.

Then bring your local `main` up to date:

```
git checkout main
git pull fork main
npm run seed
npm run dev
```
