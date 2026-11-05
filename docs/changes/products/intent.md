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

## Decisions

- **Product page:** each product has a simple page of its own, like the other records, with its details, who added it and who last changed it, and Edit and Archive. It has no timeline. A search result for a product opens this page.
- **Search and archived products:** the search box in the top bar leaves archived products out. To find or restore one, turn on Show archived in the Products table.
- **Existing databases:** the sample products only go into a new database or come from `npm run seed`, as M1 says for all sample data. The migration adds the products table but no rows, so an existing local copy and the team's database on Supabase start with an empty Products section.
- **Active and archived:** these are one setting. An active product is one that isn't archived.
- **Archived names:** archived products still count when checking that a name is unique, so restoring one can never make two products with the same name.

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
