# Week 2 Day 3 instructions

All the prompts to build quotes, invoices and bills at the same time, merge them, bring them together and add a cash flow chart.

## Start from main

Your `main` holds your build from Day 2, with products and company settings merged.

Or to carry on from my Day 2 version. This keeps your own work on a branch called `my-week2day2` and moves your `main` onto my branch, then puts it on your fork:

Your fork's `main` has the ruleset from Day 2, which blocks force pushes, so turn it off first: in your fork on GitHub, open Settings, then Rules, then Rulesets, set the ruleset's **Enforcement status** to **Disabled** and save. Then:

```
git checkout main
git branch my-week2day2
git checkout --no-track -B main origin/week2day2-end
git fetch fork
git push --force-with-lease fork main
```

Then set the ruleset back to **Active**.

## Prepare main for three developers

As on Day 2, the lead goes first. Quotes, invoices and bills will each need some of the same changes to shared code, so find them and make them once, before the three developers start.

```
git checkout -b prepare
```

Start a fresh session (`/clear` in Claude Code), then:

```
Today three developers will build quotes, invoices and bills at the same time, each in its own worktree. Their intents are in course/instructions/week2day3.md. Read them with docs/spec.md and the code, and list what two or more of the three would each have to build or change in code they share, so I can make those changes once, first. For each, say which features need it and what you'd change, keeping what the app does the same. Don't change anything yet.
```

Read the list. Two overlaps stay with the features on purpose: quotes and invoices each make their own PDF, and invoices and bills each add to a Money section on the dashboard. After the merges, the team brings those together, which is today's refactor. Then:

```
Make those changes on this branch, except anything for the PDFs or the Money section, which we'll bring together after the merges. Don't change what the app does. Update the spec and the layout tests to match, and run npm run check. Leave the commits to me.
```

```
git add .
git commit -m "Prepare: shared code for quotes, invoices and bills"
```

Today three agents, and later four, work on this one computer, and each runs the tests when it finishes a piece of work. Start a fresh session, then:

```
Three or four agents will work on this computer at once, each in its own worktree, and each runs npm run check or npm run check:quick when it finishes a piece of work. More than two test runs at once overload the computer, and tests time out. Make test runs take turns, so that no more than two run at once and the rest wait, saying they're waiting. Keep the speed tests reliable. Prove it by running npm run check in three worktrees at once. Leave the commits to me.
```

```
git add .
git commit -m "Prepare: test runs take turns"
git push fork prepare
```

In a real team each developer has their own computer, so nobody waits for anyone else's tests. Here you play the whole team on one.

**[GitHub step, to write from Ed's recording]** `main` is protected since Day 2, so the lead's change goes through a pull request too: open one for `prepare` against the fork's `main`, and merge it once CI passes.

Then bring your `main` up to date:

```
git checkout main
git pull fork main
git branch -d prepare
```

## Three developers, three worktrees

From the `accountable` folder, on `main`:

```
git worktree add ../accountable-quotes -b quotes
git worktree add ../accountable-invoices -b invoices
git worktree add ../accountable-bills -b bills
```

Open each in its own VS Code window, and in each window's terminal:

```
npm install
uv sync
```

Then start Claude Code in each window, and give all three their prompts at once. Since Prepare main, their test runs take turns.

## The three features

Each feature goes through the same stages as on Day 2, with the same prompts and commits, in its own window. Only the Plan prompt and the build's commit differ.

### Quotes, in accountable-quotes

````
Create docs/changes/quotes/intent.md with the text below. Then read it with docs/spec.md and ask me about anything unclear, at most three questions. Update the intent with my answers.

# Intent: quotes

## Problem

We agree prices with customers in emails and spreadsheets. Nothing ties a quote to its deal, and nobody can see what was offered or whether the customer accepted.

## Proposed outcome

On any open deal, you can create a quote: pick products, set quantities, and adjust each line's description or price. The quote adds up its lines, applies the tax from Settings and shows the total. While you edit, a live preview beside the form shows the quote exactly as the customer will see it. When it's ready, you mark it sent and download it as a PDF that looks like the preview, with the company's details from Settings, in Accountable's brand. When the customer says yes, you mark it accepted, and the deal moves to Won with the quote's value. A Quotes section lists every quote with its status, with the total value of quotes in each status at the top, and each deal and organization shows its quotes.

## Constraints

- Amounts are stored as whole cents. A line's amount is its quantity times its unit price. Tax is worked out once, on the subtotal, and rounded to the nearest cent, with halves rounding up.
- A quote's number is the quote prefix from Settings followed by a sequence, such as QT-0001, given when the quote is created, with no gaps or repeats.
- A quote is valid for 30 days from when it's created, unless you change the date.
- A quote is draft, sent, accepted or declined. A sent quote shows as expired once its valid-until date has passed. Only a draft can be changed. To change a sent quote, you copy it to a new draft.
- A line keeps the product's name and price as they were when it was added, so a later change to the product doesn't change the quote. The quote keeps the tax label and rate as they were when it was sent.
- Only active products can be added to a quote.
- Accepting a quote moves its deal to Won by the same rules as dragging it on the board, with the timeline entry and who moved it, and sets the deal's value to the quote's subtotal, before tax, rounded to the nearest dollar. A deal can have only one accepted quote.
- The backend works out every amount. It never trusts totals sent from the browser.
- The PDF is made when you download it. Anything typed into the quote appears on the PDF as plain text, never as markup.
- Any PDF library must install with uv and run on Render's native Python runtime with no system packages.
- The sample data includes quotes, built from the sample products, on the deals in Proposal and Negotiation: some drafts, some sent, one or two expired and one declined. Every won deal from the last three months has an accepted quote that matches its value. Lists and panels look full from the first visit.
- Every unit test, old and new, runs in under a second on this computer, because CI runs on a much slower machine.
- No new dependencies unless the plan makes the case for one.

## Not in this change

- Emailing quotes, or a page where the customer accepts online.
- Discounts, or more than one tax rate.
- Turning a quote into an invoice.

## Success criteria

1. npm run check passes.
2. A quote with three lines adds up exactly, tax included, in the app and on the PDF.
3. A sent quote can't be changed, through the page or the API.
4. Accepting a quote moves the deal to Won with the quote's value, and the deal's timeline shows who moved it.
5. The PDF downloads, looks like the preview, and shows the company's details, the lines and the totals.
6. On a fresh copy with the sample data, the Quotes section and the deal pages are full of realistic quotes.
````

The build's commit is `git commit -m "Build: quotes"`.

### Invoices, in accountable-invoices

````
Create docs/changes/invoices/intent.md with the text below. Then read it with docs/spec.md and ask me about anything unclear, at most three questions. Update the intent with my answers.

# Intent: invoices and payments

## Problem

Once a deal is won, billing happens outside Accountable. Nobody can see what customers owe, which invoices are overdue or who has paid.

## Proposed outcome

For a won deal, you can create an invoice: pick products, set quantities, and adjust each line's description or price. The invoice adds up its lines and applies the tax from Settings. While you edit, a live preview beside the form shows the invoice exactly as the customer will see it. When it's ready, you issue it: it gets its number, its due date comes from the payment terms in Settings, and you can download it as a PDF that looks like the preview. You record payments against an issued invoice as they arrive, in full or in part, and the invoice shows a bar of how much is paid and what's still owed. Paid, overdue and void invoices carry a clear mark on the preview and the PDF.

The invoices look the way the business wants. In Settings, a new Documents section lets you choose one of three invoice designs, pick an accent color and upload the company's logo, with a preview of a sample invoice that updates as you choose.

An Invoices section lists every invoice with its status and balance, each deal and organization shows its invoices, and a new Money section on the dashboard, below the sales charts, shows what customers owe, how much of it is overdue and how late (not yet due, 1 to 30, 31 to 60, 61 to 90 and over 90 days), and the payments received each month over the last 12 months.

## Constraints

- Amounts are stored as whole cents. A line's amount is its quantity times its unit price. Tax is worked out once, on the subtotal, and rounded to the nearest cent, with halves rounding up.
- An invoice gets its number when it's issued, never as a draft: the invoice prefix from Settings followed by a sequence, such as INV-0001, with no gaps or repeats, even when two people issue invoices at the same moment.
- The due date is the issue date plus the payment terms in Settings.
- An invoice is draft, issued, paid or void. An issued invoice shows as part paid when some of it is paid, and as overdue when money is still owed after its due date.
- Only a draft can be changed or deleted. An issued invoice never changes. A mistake is fixed by voiding the invoice, which keeps its number and marks the PDF VOID. An invoice with payments can't be voided.
- A line keeps the product's name and price as they were when it was added. The invoice keeps the tax label and rate as they were when it was issued.
- A payment has a date, an amount, a method (bank transfer, card, check, cash or other) and an optional reference. It must be more than zero and no more than what's still owed. A payment entered by mistake can be deleted, and the balance goes back up.
- The backend works out every amount and balance. It never trusts totals sent from the browser.
- The PDF is made when you download it. Anything typed into the invoice appears on the PDF as plain text, never as markup.
- Any PDF library must install with uv and run on Render's native Python runtime with no system packages.
- The three designs are distinct, professional and readable in print. The accent color is checked for contrast against white, and the page refuses one that would make text hard to read.
- The logo is a PNG or JPEG of up to 1 MB, kept in the database, since Render's disk doesn't keep files. The backend checks that the file really is an image of that type, whatever its name says, and refuses anything else, including SVG.
- The sample data includes invoices for the won deals of the last 12 months, each matching its deal's value: most paid, some part paid, some overdue by different amounts, and a few drafts, so every panel and chart looks full from the first visit. The sample company has a logo and a design chosen.
- Every unit test, old and new, runs in under a second on this computer, because CI runs on a much slower machine.
- No new dependencies unless the plan makes the case for one.

## Not in this change

- Credit notes or refunds.
- Emailing invoices, payment reminders, online payment or recurring invoices.
- Creating an invoice from a quote.
- Accounting entries.

## Success criteria

1. npm run check passes.
2. An invoice with three lines adds up exactly, tax included, in the app and on the PDF.
3. An issued invoice can't be changed, through the page or the API, and its number never changes.
4. Payments bring the balance down to zero and the invoice becomes paid. A payment for more than the balance is refused.
5. An issued invoice past its due date shows as overdue on its page, in the list and on the dashboard.
6. Invoice numbers have no gaps or repeats, even when two invoices are issued at the same moment.
7. Each of the three designs, with any accepted accent color and a logo, gives a PDF that looks like its preview.
8. A file that isn't a PNG or JPEG is refused as a logo, even when it's renamed to end in .png.
9. On a fresh copy with the sample data, the Invoices section, the deal pages and the dashboard's Money section are full of realistic figures.
````

The build's commit is `git commit -m "Build: invoices and payments"`.

### Bills, in accountable-bills

````
Create docs/changes/bills/intent.md with the text below. Then read it with docs/spec.md and ask me about anything unclear, at most three questions. Update the intent with my answers.

# Intent: bills

## Problem

Accountable tracks the money customers owe us but not the money we owe. Nobody can see which supplier bills are unpaid or when they're due.

## Proposed outcome

A Bills section records the bills the business receives: the supplier, the supplier's own bill number, the bill date, the due date, the amount before tax, the tax, a category and notes. You mark a bill paid when you pay it. The list shows what's unpaid, what's overdue and what's been paid, with each category in its own color, and each organization shows its bills.

A new Money section on the dashboard, below the sales charts, shows what we owe and how much of it is overdue, a timeline of the bills due in the next 30 days, and spending by category for each of the last 12 months.

## Constraints

- A bill's supplier is an organization, so an organization can be a customer, a supplier or both.
- Amounts are stored as whole cents. The tax is entered as it appears on the bill, since a supplier's tax can differ from ours. The total is the amount plus the tax, worked out by the backend.
- The due date starts as 30 days after the bill date, and can be changed.
- Categories are a fixed list: Software, Contractors, Travel, Office, Marketing and Other.
- A bill is unpaid or paid, with the date it was paid. An unpaid bill shows as overdue when its due date has passed. Marking a bill paid can be undone.
- The same supplier can't have two bills with the same bill number.
- Each bill records who added it and who last changed it, like every other record.
- The sample data includes bills over the last 12 months from a handful of supplier organizations added for the purpose, such as a software vendor, a contractor and an office landlord, with regular monthly bills and occasional large ones: most paid, some unpaid and a few overdue, so every panel and chart looks full from the first visit.
- Every unit test, old and new, runs in under a second on this computer, because CI runs on a much slower machine.
- No new dependencies unless the plan makes the case for one.

## Not in this change

- Purchase orders, receipts, or approving bills before they're paid.
- Paying part of a bill.
- Attaching a scan of the bill.
- Recurring bills.
- Accounting entries.

## Success criteria

1. npm run check passes.
2. A bill can be added, edited, marked paid and marked unpaid again.
3. The dashboard's figures for what we owe, what's overdue and what's due in the next 30 days match the unpaid bills, and the spending chart matches the bills by month and category.
4. A bill number used twice for the same supplier is refused, through the page or the API.
5. An unpaid bill past its due date shows as overdue in the list and on the dashboard.
6. On a fresh copy with the sample data, the Bills section and the dashboard's Money section are full of realistic figures.
````

The build's commit is `git commit -m "Build: bills"`.

### The stages, in each window

After each Plan:

```
git add .
git commit -m "Plan: intent.md agreed"
```

Design:

```
Read the intent for this branch, in docs/changes/, and update docs/spec.md and the area files in docs/specs/ so they describe the product with this change, as it will be once it's merged. Add an area file if the change needs one. Use the brand skill. List any concerns at the top of your reply.
```

```
git add .
git commit -m "Design: the spec"
```

Build:

```
Read the intent for this branch, in docs/changes/, with docs/spec.md, and write plan.md beside the intent with four sections: Files that change, Order of work, Risks and Proof. Proof lists the unit and end-to-end tests. The plan ends with the build, since ui-check, the review and docs/IMPROVE.md come later. Don't write any code yet.
```

```
git add .
git commit -m "Build: plan.md"
```

Start a fresh session (`/clear` in Claude Code), then:

```
Implement the plan.md for this branch, in docs/changes/, following its order of work. Write the tests in its Proof section and run them as you go. Leave the commits to me.
```

Then the build's commit, as above.

Test:

```
Run npm run check and fix failures until it passes. Then use the ui-check subagent to check the pages this change adds or changes, signed in, and show me its report and the screenshots.
```

```
Fix the problems ui-check found that this change caused, then run npm run check.
```

```
git add .
git commit -m "Test: checks and ui-check"
```

Deploy, in a fresh session:

```
Use the reviewer subagent to review this branch against main. Report only, skip style.
```

```
Fix the Important findings from the review. Run npm run check when you're done. Leave the commits to me.
```

```
git add .
git commit -m "Deploy: review fixes"
```

```
Follow docs/IMPROVE.md for this change. Leave the commits to me.
```

```
git add .
git commit -m "Deploy: harness improved"
```

With Codex, in a second terminal in the same folder:

```
Review this branch against main with docs/REVIEW.md. Write your findings to independent-review.md in this branch's folder in docs/changes/, and don't change anything else. Skip style.
```

```
Fix the Important findings in this branch's independent-review.md, in docs/changes/. Run npm run check when you're done. Leave the commits to me.
```

```
git add .
git commit -m "Deploy: independent review"
```

**[GitHub step, to write from Ed's recording]** push each branch to the fork and open its pull request against the fork's `main`.

## Merge all three

Quotes goes first, then invoices, then bills. Before the first merge, note where `main` is, so you can review the three together afterward:

```
git tag before-erp main
```

### Merge quotes

**[GitHub step, to write from Ed's recording]** merge the quotes pull request on GitHub. Then, in the `accountable` window, `git pull fork main`.

### Bring invoices up to date and merge it

In the `accountable-invoices` window:

```
git merge main
```

Start a fresh session (`/clear`), then:

```
Merging main into this branch stopped with conflicts. Resolve each one so that both changes keep working, keeping what each side added. Leave the commits to me.
```

```
git add .
git commit --no-edit
npm run check:quick
```

If it fails:

```
npm run check:quick failed after merging main with this error: [paste the error]. Find the root cause, fix it and run npm run check. Leave the commits to me.
```

```
git add .
git commit -m "Merge: fix after merging main"
```

Run `npm run check`, then push, let CI pass and merge the pull request. Then `git pull fork main` in the `accountable` window.

### Bring bills up to date and merge it

The same steps in the `accountable-bills` window.

## Bring the three together

You're now the integration lead. `main` takes changes only through pull requests, so work on a branch, in the `accountable` window:

```
git checkout -b money
```

### One Money section

Invoices and bills each added a Money section to the dashboard, and the cash flow chart goes at the top of it later, so this comes first. Start a fresh session, then:

```
Invoices and bills each added to the Money section of the dashboard, on their own. Make it one section designed as a whole, with what customers owe us and what we owe suppliers side by side, in the brand's style. Update the spec to match. Run npm run check when you're done. Leave the commits to me.
```

```
git add .
git commit -m "Integrate: one Money section"
git push fork money
```

Open its pull request, let CI pass and merge it. Then:

```
git checkout main
git pull fork main
git branch -d money
```

## Four developers at once

Four more pieces of work can now go ahead side by side: a review of the three features together, the refactor, one story in the sample data, and the cash flow chart. From the `accountable` folder, on `main`:

```
git worktree add ../accountable-review -b review
git worktree add ../accountable-refactor -b refactor
git worktree add ../accountable-sample-story -b sample-story
git worktree add ../accountable-cash-flow -b cash-flow
```

Open each in its own VS Code window, run `npm install` and `uv sync` in each, start Claude Code, and give all four their first prompts at once.

### Review the three together, in accountable-review

Start a fresh session, then:

```
Use the reviewer subagent to review what quotes, invoices and bills changed, together, from the tag before-erp to this branch. Look most for code that does the same job twice and for bugs where the three features meet. Report only, skip style.
```

```
Fix the Important findings from the review that aren't about code doing the same job twice. Run npm run check when you're done. Leave the commits to me.
```

```
git add .
git commit -m "Integrate: review fixes"
```

### Refactor, in accountable-refactor

First, tests that pin down what the code does today:

```
Before we refactor quotes and invoices, write characterization tests for what they do today: each line's amount, the subtotal, the tax and the total, the numbering, and what their PDFs contain. Change only test files. Run npm run check when you're done. Leave the commits to me.
```

```
git add .
git commit -m "Refactor: characterization tests"
```

Then the refactor itself:

```
Quotes and invoices each have their own code for line items, totals and the PDF. Bring it together so both use the same code, and so quotes also use the invoice design, accent color and logo chosen in Settings. Keep every characterization test passing without changing it. Update the spec to match. Run npm run check when you're done. Leave the commits to me.
```

```
git add .
git commit -m "Refactor: one document renderer"
```

### One story in the sample data, in accountable-sample-story

```
The sample data for quotes and invoices was written separately. Make it tell one story: every won deal from the last three months has an accepted quote and an invoice with the same lines and the same value as the deal, and the dashboard's figures agree with each other. Run npm run check when you're done. Leave the commits to me.
```

```
git add .
git commit -m "Integrate: one story in the sample data"
```

### Cash flow, in accountable-cash-flow

The finale: a new feature built on all three. The same stages as this morning's features, starting with:

````
Create docs/changes/cash-flow/intent.md with the text below. Then read it with docs/spec.md and ask me about anything unclear, at most three questions. Update the intent with my answers.

# Intent: cash flow

## Problem

The dashboard shows what customers owe us and what we owe suppliers, but not the question a small business asks every week: how much cash will we have, and when?

## Proposed outcome

A cash flow chart at the top of the dashboard's Money section. For each of the last 12 months it shows the money that came in from customers' payments and the money that went out on paid bills, and a line for the cash balance at the end of each month. From today, the line continues as a dashed forecast for the next 3 months, built from the open invoices and the unpaid bills. A switch adds the likely deals as a lighter band on top of the forecast. Hovering a month shows its figures, and clicking a forecast month lists the invoices, bills and deals behind it.

## Constraints

- The balance starts from an opening cash balance and the date it applies to, entered once in Settings. Without one, the chart shows money in and out with no balance line.
- Money in is the payments received, by payment date. Money out is the paid bills, by the date they were paid.
- In the forecast, each open invoice's unpaid balance is expected on its due date plus that customer's average days late on the invoices they've paid before, or the average for all customers if they have no history, and never before tomorrow. Each unpaid bill is expected on its due date, and never before tomorrow.
- Likely deals are the open deals' value times their probability, expected on the close date plus the payment terms in Settings. They're off by default and drawn apart from the forecast, so the forecast stays what the invoices and bills say.
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
````

Then Design, Build, Test and Deploy with the same prompts and commits as the three features. The build's commit is `git commit -m "Build: cash flow"`.

### Merge the four

Push each branch and open its pull request as it finishes. Merge them in the order they finish. The first merges straight away. For each of the others, bring it up to date first, in its window:

```
git merge main
```

If git stops with conflicts, start a fresh session and use the same prompt as this morning:

```
Merging main into this branch stopped with conflicts. Resolve each one so that both changes keep working, keeping what each side added. Leave the commits to me.
```

Then `git add .`, `git commit --no-edit` and `npm run check:quick`, with the same fix prompt if it fails. Push, let CI pass and merge the pull request, then `git pull fork main` in the `accountable` window.

## Finish together

Back in the `accountable` window, on a branch of your own:

```
git checkout -b finish
```

### A bug

```
[What you saw, and the steps to see it.] Find the root cause and show me the evidence before you fix anything. Then write a test that fails without the fix, fix it and run npm run check. Leave the commits to me.
```

```
git add .
git commit -m "Fix: [the bug]"
```

### The first impression

```
Use the ui-check subagent to check every page on a fresh copy of the app with the sample data, signed in, in light and dark mode, and show me its report and the screenshots.
```

Fix what it finds with the same fix prompt as before, then push `finish`, open its pull request, let CI pass and merge it.

## Clean up

Close the worktree windows, then in the `accountable` window:

```
git checkout main
git pull fork main
git worktree remove ../accountable-quotes
git worktree remove ../accountable-invoices
git worktree remove ../accountable-bills
git worktree remove ../accountable-review
git worktree remove ../accountable-refactor
git worktree remove ../accountable-sample-story
git worktree remove ../accountable-cash-flow
git branch -d quotes invoices bills review refactor sample-story cash-flow finish
git tag -d before-erp
```
