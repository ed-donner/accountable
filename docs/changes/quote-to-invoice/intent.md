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

## Decisions

- The one-invoice rule is enforced in the database (a unique link from invoice to quote), so two clicks at once can't make two; the API refuses the second with a conflict error. The route and the link live in the invoices area (`POST /api/invoices/from-quote/{quote_id}`, which reads quotes' tables), because quotes and invoices may not import each other.
- Bill to is copied from the quote's Prepared for, which is fixed once the quote is sent, not from the deal's current organization and contact.
- The "rate has changed" note compares the tax rate the quote kept when it was sent with the rate in Settings now, and shows on the draft only.
- A voided invoice still counts as the quote's invoice, so the button keeps opening it; deleting a draft invoice removes the link and lets the quote make a new one.
- Create invoice needs the deal to be won, as any new invoice does, and the draft copies the quote exactly even where a description is over 1,000 characters or has a character the invoice fonts lack; the draft then shows those messages and can't be saved or issued until they're fixed.
