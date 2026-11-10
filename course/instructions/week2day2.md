# Week 2 Day 2 instructions

Today a team builds two features at the same time. The lead prepares `main` first, then two developers each build one feature with their own coding agent, in their own worktree, and the person who merges brings both together. I recommend that rather than running the exact same Coding Agent runs as me, you simply follow along with my checkpoints. At the end I've laid out every interim step if you'd rather build it yourself.

## Follow along with my checkpoints

My checkpoints are branches, like my versions of the Week 1 days. In the `accountable` folder:

### The two intents

```
git checkout week2day2-intents
```

Read the two intents the developers agreed with their agents: `docs/changes/products/intent.md` and `docs/changes/company-settings/intent.md`. To see what the lead prepared before they started, list the lead's Prepare main commits:

```
git log --oneline --grep "^Prepare:"
```

`git show --stat` followed by a commit's id shows the files it changed.

### The results

```
git checkout week2day2-end
npm run seed
npm run dev
```

`npm run seed` installs anything new the app needs, brings your local database up to date and puts the sample data back, with today's sample products and the sample company. It asks first, because it replaces what's in your local copy: type `yes`.

Open the app, then look at Products in the top bar and Company settings in the menu under your initials. Then see how each feature got there, in `docs/changes/products/` and `docs/changes/company-settings/`: the intent, the plan and the independent review. `docs/STATUS.md` tells the story of each stage. Stop the app with Ctrl+C when you're done.

## If you'd rather build it yourself

These are the steps and prompts behind my checkpoints. They take several hours of agent time: my run of these two features took about seven.

### Start from main

Build on your own `main` from Day 5, or on my Day 5 version. To use mine, this keeps your own work on a branch called `my-day5` and moves your `main` onto my branch:

```
git checkout main
git branch my-day5
git checkout --no-track -B main origin/week1day5-end
```

### Prepare main for two developers

Two changes that every feature from today on needs, made first, on their own branch, so the two developers don't each make them their own way:

```
git checkout -b prepare
```

Start a fresh session (`/clear` in Claude Code), then:

```
The features from today on add business areas beside the CRM, such as products, settings and invoices. Each needs code that lives in crm/ today, such as who added and last changed a record, the checks on what's sent, and showing a save's errors beside its fields. Move the code that any area would need out of crm/ to the top level of the backend and the frontend, so that a new area never imports crm/. Don't change what the app does. Update the spec and the layout tests to match, and run npm run check. Leave the commits to me.
```

```
git add .
git commit -m "Prepare: shared code out of crm"
```

Start a fresh session, then:

```
Each agent runs npm run check when it finishes a piece of work, and the end-to-end tests use the same ports in every worktree, so two worktrees running it at the same time fail each other. Change the test setup so that each worktree's tests use ports no other worktree is using, with nothing to set by hand, and two worktrees on this computer can run npm run check at the same time and both pass. They share its cores and memory, so keep the speed tests reliable when that happens. Prove it by running npm run check in two worktrees at once. Leave the commits to me.
```

```
git add .
git commit -m "Prepare: tests that run side by side"
git checkout main
git merge prepare
git branch -d prepare
```

### Two developers, two worktrees

Today you play two developers, each building one feature in their own folder with their own coding agent, and then the person who merges both.

From the `accountable` folder, on `main`:

```
git worktree add ../accountable-products -b products
git worktree add ../accountable-company-settings -b company-settings
```

Open each new folder in its own VS Code window (File > New Window, then File > Open Folder). A new worktree has every file git tracks, but nothing git ignores, so in each window's terminal, install what the app needs:

```
npm install
uv sync
```

Your `.env` stays in `accountable`. The worktrees don't need it, because `npm run dev` and the tests use the local copy.

Start Claude Code in each window (`claude`). Claude Code treats a worktree as part of the same project, so it keeps your choices from Week 1: it doesn't ask again whether you trust the folder, and the Playwright MCP server and the frontend-design plugin are already on.

**Both agents can run the tests at the same time,** after the change above. `npm run dev` still uses fixed ports, so in a second folder it stops with "Port 5173 is in use"; `ACCOUNTABLE_WEB_PORT` and `ACCOUNTABLE_API_PORT` move it.

### Products

In the `accountable-products` window.

#### Plan

````
Create docs/changes/products/intent.md with the text below. Then read it with docs/spec.md and ask me about anything unclear, at most three questions. Update the intent with my answers.

# Intent: products

## Problem

Accountable knows our deals but not what we sell. Prices live in people's heads and old emails, so the same thing gets quoted at different prices.

## Proposed outcome

A Products section lists what the business sells. Each product has a name, a description, a unit price and whether it's active. Anyone on the team can add, edit, search for and archive products. This is the price list that quotes and invoices will use later.

## Constraints

- Prices are in US dollars and cents, such as $49.50, and are stored as whole cents, never as decimals.
- A product's name is required and unique, ignoring case.
- Products are archived rather than deleted. Archived products are hidden unless you choose to see them, and archiving can be undone.
- Each product records who added it and who last changed it, like every other record.
- The sample data includes about a dozen products with realistic prices that fit the sample deals, such as licenses, support plans and training days, with one or two archived, so the section looks full from the first visit.
- The search box in the top bar finds products too.
- Every unit test, old and new, runs in under a second on this computer, because CI runs on a much slower machine.
- No new dependencies unless the plan makes the case for one.

## Not in this change

- Using products on deals, quotes or invoices.
- Stock levels, categories, units of measure or variants.
- Price lists per customer, or discounts.

## Success criteria

1. npm run check passes.
2. A product can be added, edited, found with the search box, archived and restored.
3. Prices show in dollars and cents everywhere they appear.
4. Two products can't share a name, whatever the case, through the page or the API.
5. The sample data has products, and npm run empty clears them.
````

```
git add .
git commit -m "Plan: intent.md agreed"
```

#### Design

```
Read the intent for this branch, in docs/changes/, and update docs/spec.md and the area files in docs/specs/ so they describe the product with this change, as it will be once it's merged. Add an area file if the change needs one. Use the brand skill. List any concerns at the top of your reply.
```

Resolve the concerns, then read the changes in VS Code's Source Control view. That diff is your design.

```
git add .
git commit -m "Design: the spec"
```

#### Build

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

```
git add .
git commit -m "Build: products"
```

#### Test

```
Run npm run check and fix failures until it passes. Then use the ui-check subagent to check the pages this change adds or changes, signed in, and show me its report and the screenshots.
```

If ui-check found problems that this change caused, have your agent fix them:

```
Fix the problems ui-check found that this change caused, then run npm run check.
```

Run `npm run check` yourself, then `npm run dev`, and go through the success criteria in the intent. Press Ctrl+C to stop it.

```
git add .
git commit -m "Test: checks and ui-check"
```

If git says there's nothing to commit, carry on.

#### Deploy

Start a fresh session, then:

```
Use the reviewer subagent to review this branch against main. Report only, skip style.
```

Then, in the same session:

```
Fix the Important findings from the review. Run npm run check when you're done. Leave the commits to me.
```

```
git add .
git commit -m "Deploy: review fixes"
```

In the same session:

```
Follow docs/IMPROVE.md for this change. Leave the commits to me.
```

```
git add .
git commit -m "Deploy: harness improved"
```

If you have Codex as well, open a second terminal in the same folder, run `codex` and give it this prompt, at a time when nothing else is running the tests:

```
Review this branch against main with docs/REVIEW.md. Write your findings to independent-review.md in this branch's folder in docs/changes/, and don't change anything else. Skip style.
```

Then, back in your coding agent's session:

```
Fix the Important findings in this branch's independent-review.md, in docs/changes/. Run npm run check when you're done. Leave the commits to me.
```

```
git add .
git commit -m "Deploy: independent review"
```

### Company settings

In the `accountable-company-settings` window, at the same time as products.

#### Plan

````
Create docs/changes/company-settings/intent.md with the text below. Then read it with docs/spec.md and ask me about anything unclear, at most three questions. Update the intent with my answers.

# Intent: company settings

## Problem

Quotes and invoices will need the business's own details: its name and address, its sales tax, how long customers have to pay and how documents are numbered. Accountable has nowhere to keep them.

## Proposed outcome

A Settings page, opened from the menu under your initials, holds the company's details for its documents: the company name, address, email and phone, a tax label and rate, the payment terms in days, and the prefixes for quote and invoice numbers. Anyone on the team can change them, and the page shows who changed them last and when.

## Constraints

- There's one set of settings for the whole team, kept in the database, not in .env.
- The tax rate is a percentage with up to three decimal places, such as 8.875%, and can be zero. The tax label is free text, such as Sales tax or VAT.
- Payment terms are a whole number of days from 0 to 365.
- Number prefixes are short, such as QT- and INV-, and use only letters, digits and hyphens.
- The company name is required. The other details can be blank.
- A new database starts with settings filled in for a made-up company that fits the sample deals.
- The backend checks every value, as well as the page.
- Every unit test, old and new, runs in under a second on this computer, because CI runs on a much slower machine.
- No new dependencies unless the plan makes the case for one.

## Not in this change

- Using the settings on documents. Quotes and invoices come later.
- Currencies other than US dollars, or more than one tax rate.
- A logo.
- Personal preferences. The theme stays where it is.

## Success criteria

1. npm run check passes.
2. The settings can be changed and saved, and everyone who signs in sees the same ones.
3. Values out of range, such as a tax rate of 150% or payment terms of 400 days, are refused with a clear message, through the page or the API.
4. The page shows who last changed the settings and when.
````

```
git add .
git commit -m "Plan: intent.md agreed"
```

#### Design, Build, Test and Deploy

The same prompts and commits as for products, in this window. The one difference is the build's commit:

```
git add .
git commit -m "Build: company settings"
```

### Merge both

You're now the person who merges. Products goes first.

#### Merge products

In the `accountable` window:

```
git merge --no-ff products
```

#### Bring company settings up to date

Company settings was built before products was merged, so bring it up to date first. In the `accountable-company-settings` window:

```
git merge main
```

Git stops and lists the files where both branches changed the same lines. Start a fresh session (`/clear`), then have your agent resolve them:

```
Merging main into this branch stopped with conflicts. Resolve each one so that both changes keep working, keeping what each side added. Leave the commits to me.
```

Read what it changed, then finish the merge:

```
git add .
git commit --no-edit
```

Git found every conflict in the text. Now check that the merged code works:

```
npm run check:quick
```

If it fails, have your agent fix it:

```
npm run check:quick failed after merging main with this error: [paste the error]. Find the root cause, fix it and run npm run check. Leave the commits to me.
```

```
git add .
git commit -m "Merge: fix after merging main"
```

Run `npm run check`, then merge it, in the `accountable` window:

```
git merge --no-ff company-settings
```

#### Clean up

In the `accountable` window, once both are merged. Close the two worktree windows first.

```
git worktree remove ../accountable-products
git worktree remove ../accountable-company-settings
git branch -d products
git branch -d company-settings
```

Then run `npm run check` once more on `main`.
