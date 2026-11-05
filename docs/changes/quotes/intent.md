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

## Decisions

- **Status moves:** statuses only move forward. A draft can be sent or declined, and a sent quote can be accepted or declined. Nothing moves back, so a mistake is fixed by copying the quote. A sent quote past its valid-until date can still be accepted or declined, because it's the team's call whether to honour a late yes.
- **Quotes and the deal's stage:** a quote can be created, sent or accepted only while its deal is open, so accepting a quote is always what wins the deal. A deal dragged to Won first can't then accept one of its quotes. Accepting a quote marks the deal's other sent quotes declined in the same save, and its drafts stay drafts. If a won deal is dragged back to an open stage, its accepted quote stays accepted, so that deal can't accept another.
- **No deleting:** quotes can never be deleted, so their numbers never have gaps. A draft that's no longer wanted is marked declined. A quote holds its deal ([D4](../../specs/records.md#deleting)), so a deal with quotes can't be deleted.
- **Prepared for:** a quote shows who it's for: the deal's organization name, and its main contact's name and email. Like the tax, these are fixed when the quote is sent, and until then follow the deal. A quote can't be sent while its deal has no organization.
- **Status totals:** the totals at the top of the Quotes section count each quote's value, its subtotal before tax, as a deal's value does.
- **PDF of a draft:** any quote can be downloaded as a PDF. A draft's PDF is marked Draft.
- **Copying:** a copy is a new draft on the same deal, with a new number, a valid-until date 30 days from the day it's made, and the same lines as the original, names and prices included. The original doesn't change.
- **Timeline:** sending, accepting or declining a quote adds no timeline entry of its own. Only the deal's move to Won does, as any stage change does.

## Not in this change

- Emailing quotes, or a page where the customer accepts online.
- Discounts, or more than one tax rate.
- Turning a quote into an invoice.
- A customer address on quotes, which would need addresses on organizations, or a notes box on quotes.
- Finding quotes with the search box in the top bar.

## Success criteria

1. npm run check passes.
2. A quote with three lines adds up exactly, tax included, in the app and on the PDF.
3. A sent quote can't be changed, through the page or the API.
4. Accepting a quote moves the deal to Won with the quote's value, and the deal's timeline shows who moved it.
5. The PDF downloads, looks like the preview, and shows the company's details, the lines and the totals.
6. On a fresh copy with the sample data, the Quotes section and the deal pages are full of realistic quotes.
