## Review of quote-to-invoice

Reviewed: the working tree against `main`, 5 commits, 34 files, nothing uncommitted. Plan: `docs/changes/quote-to-invoice/plan.md`, with `intent.md`.

Not read: the test files (`test_quote_invoice.py`, `test_migrations.py`, `QuoteInvoice.test.tsx`, the other frontend tests, `e2e/quote-to-invoice.spec.ts`), `ui-check.md`, and most of the spec and doc edits. I read the sample-data, layout and every-route test diffs, the testing.md and architecture.md lines that came up in a search, and all the production code. I did not run `npm run check` or any test, so every finding below comes from reading the code.

### Important

None.

### Nits

1. **`useQuoteInvoice` runs for quotes that can't have an invoice.** `QuoteInvoiceButton` and `QuoteInvoiceLine` call the hook before the `status !== "accepted"` return. Every sent or declined quote page therefore makes a `GET /invoices?quote_id=` that nothing uses. The hook can't be called after an early return, so either leave it or split the component. `frontend/src/invoices/QuoteInvoice.tsx:16,65`.
2. **A failed read leaves Create invoice disabled with no message beside the button.** `invoice === undefined` keeps the button off. The retry message appears only in the details line. This is deliberate in the plan (N6), but the button gives no hint of why it's off. `frontend/src/invoices/QuoteInvoice.tsx:54`.
3. **Two doc comments are stacked in `queries.ts`.** The comment for `InvoiceDetail` ("For a draft, the company and the tax…") now sits above `QuoteLink`'s comment, so it no longer sits directly above `InvoiceDetail`. `frontend/src/invoices/queries.ts:54-56`.
4. **The sample-data link depends on insertion order.** `accepted.pop(plan.deal.id)` links the first invoice in issue order. That matches "first on its deal" only because ids follow insertion order. The test does check against the lowest id, so a change would be caught. `backend/accountable/invoices/sample_data.py:215-219`.

### Checked

- **Bugs:** I followed `start_from_quote` through the 404 and 409 refusals. The order is accepted, then existing invoice, then won, as the plan says. The insert runs in a savepoint, so the unique index turns a racing second request into the same 409 that names the winner. The lines are copied whole with `LineToSave.saved` and `write_lines`, so V38 holds. The quote isn't written to. The migration adds the column, foreign key and unique index in batch mode and downgrades cleanly. Cache refresh is covered: `useWrite` invalidates everything, and `useDeleteRecord` refreshes the quote's invoice read. Nothing broken.
- **Security:** The new route takes `CurrentUser`, and `test_every_route.py` gets a sample body and a `WRITES` assertion for it. `quote_id` is a typed query id. No data is exposed. Nothing found.
- **Matches the spec and plan.md:** The route, the `quote` link, `quote_id` on rows and the filter, the Bill to copy from the quote's Prepared for, and the V35 note on drafts only all follow the plan. The sample invoices are linked to their accepted quotes (M3). The layout exception goes one way only, and the layout tests enforce it. The plan's race, 409, delete-then-recreate and V38 tests are listed in the plan, but I didn't open the test files to check them. Nothing missing.
- **Described by the spec:** I searched the docs for the old `/quotes/{id}/invoice` route and found no leftovers. The architecture, testing and backend files were updated. Nothing found.
- **Follows STANDARDS.md:** I did not read STANDARDS.md. The code I read looks consistent with the surrounding files, but this pass was not done.
