# Week 2 Day 2: two features built side by side

The course's team of three on one computer: I was the lead, and two agents built one feature each at the same time in their own worktree. The lead prepared `main` first, merged products, brought company settings up to date, and merged that too.

- **Products** is the price list: name, description, unit price in whole cents, active or archived, and who added and last changed each product. Add, edit, search, archive and restore; no delete and no detail page.
- **Company settings** holds the business's details for quotes and invoices: name, address, email, phone, tax label and rate, payment terms, and the quote and invoice number prefixes. One row for the whole team, edited from the menu under the initials.

## What is here

- `products/intent.md` and `products/plan.md` — the agreed bar for the price list, and how it was built.
- `company-settings/intent.md` and `company-settings/plan.md` — the agreed bar for the settings, and how it was built.

The independent reviews, the specs and all the code are in my fork:

- Products review: https://github.com/RuiFSP/accountable/blob/main/docs/changes/products/independent-review.md
- Company settings review: https://github.com/RuiFSP/accountable/blob/main/docs/changes/company-settings/independent-review.md
- The build: https://github.com/RuiFSP/accountable

## How I worked

OpenCode, one agent per feature in its own worktree, on branches `products` and `company-settings`. Before either developer started, the lead read both intents and moved the code both features would need above the areas, once: shared record helpers on the backend, shared forms on the frontend, and test runs that take a port slot so two `npm run check` runs can go at once. Each feature went through the stages with the reviewer and ui-check subagents. The lead merged products first, then brought company settings up to date with `git merge main`, resolved the conflicts, ran `npm run check:quick` on the result, and merged it.

The reviews were the useful part: company settings' review caught a UTC value going into a naive column before the merge, and products' review found no Important findings but four nits, all fixed.
