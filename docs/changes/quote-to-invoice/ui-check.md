# ui-check report: quote to invoice

Run against the local copy on a temporary database, signed in as Alex Rivera, at 1440 by 900 in light and dark mode. Checked: `/quotes/41` (accepted, no invoice), `/quotes/16` and `/quotes/14` (accepted, with an invoice), `/invoices/33` (made from a quote, reached by Open invoice), a sent quote (`/quotes/40`) and a draft quote (`/quotes/39`). The data was left as found. Create invoice was not clicked.

The console had no errors or warnings on any page. Nothing loaded from outside localhost. The fonts were Instrument Sans and JetBrains Mono, and there was no sideways overflow.

## Broken

None.

## Off-brand

None.

## Nits

1. **`/quotes/16` and `/quotes/14`, both modes:** the Invoice line read "Invoice" with a mono link "Draft". V36 says "Draft invoice" while the invoice has no number. **Fixed:** the link now reads "Draft invoice" (`invoices/QuoteInvoice.tsx`, with its unit and end-to-end tests).
2. **The sample invoices behind both quotes are drafts, not issued,** so the numbered form "Invoice INV-xxxx" could not be checked on screen. This is how the sample data falls (the newest wins are drafts), not a fault of this change. The numbered form is covered by the unit tests.

## Looked right

- `/quotes/41`, light and dark: Create invoice is the first header button, Sea Green fill with Midnight text, in Instrument Sans, 36px tall, 8px from Download PDF. No Invoice line in the details panel.
- `/quotes/16` and `/quotes/14`: the same button reads Open invoice and opens the invoice. The details panel has an Invoice line below Accepted with the link in JetBrains Mono, and nothing overflows.
- `/invoices/33`, light and dark: "From quote QT-0016" under the title, 13px muted ink, the number in JetBrains Mono, the whole line one link to `/quotes/16`. It does not clash with the header buttons. The preview stays white in both modes.
- `/quotes/40` (sent) and `/quotes/39` (draft): no Create invoice, Open invoice or Invoice line.
