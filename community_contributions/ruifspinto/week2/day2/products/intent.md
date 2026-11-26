# Intent: products

## Problem

Accountable knows our deals but not what we sell. Prices live in people's heads and old emails, so the same thing gets quoted at different prices.

## Proposed outcome

A Products section lists what the business sells. Each product has a name, a description, a unit price and an active state: active products show in the list, archived ones don't. Anyone on the team can add, edit, search for and archive products, and restore them. There is no product detail page: products live in the table, and who added and last changed each one shows there. This is the price list that quotes and invoices will use later.

## Constraints

- Prices are in US dollars and cents, such as $49.50, and are stored as whole cents, never as decimals.
- A product's name is required and unique, ignoring case, across active and archived products alike, so an archived product's name stays reserved.
- Products are archived rather than deleted. Archiving is the same as making a product inactive: archived products are hidden unless you choose to see them, and archiving can be undone by restoring them.
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
4. Two products can't share a name, whatever the case, through the page or the API — even when one of them is archived.
5. The sample data has products, and `npm run seed` brings them back.
