# Plan: quote to invoice

This plan turns the intent, and the spec already updated on this branch, into build work: which files change, in what order, what could go wrong and how we'll know it works. Ids such as V33 and Q38 are the spec's requirements. The intent wins over the spec, and the spec wins over this plan. If the build shows the spec is wrong, fix the spec in the same change and say so in `docs/STATUS.md`.

The plan ends with the build. ui-check, the review and `docs/IMPROVE.md` come after it.

There's no new dependency. It's SQLAlchemy Core and FastAPI on the backend, and React, React Router and TanStack Query on the frontend, all in use already.

## The one design decision

Quotes and invoices are both later areas, and the layout rules say later areas never import each other (`backend/tests/test_layout.py`, `frontend/src/layout.test.ts`). This change needs a link in both directions, so the plan keeps the rule and bends it one way only:

- **Invoices owns everything that writes or reads the link.** The route that makes the invoice lives in `invoices/`, not `quotes/`: `POST /api/invoices/from-quote/{quote_id}`. The spec's `POST /quotes/{id}/invoice`, and its `invoice` field on the quote's reply, would have made `quotes/` import `invoices/`, and `test_layout.py` also checks that an area's routes start with its own words. The quote's page learns about its invoice from `GET /api/invoices?quote_id=7`, the way a deal's page learns its invoices from `?deal_id=7` (V20).
- **`invoices/` may import `quotes/tables.py`,** for the foreign key and for reading the accepted quote, its lines and its fixed Prepared for. Nothing else of quotes'. `quotes/` still imports nothing of invoices'. This is the same exception the layout already gives every later area for `crm/tables.py` and `products/tables.py`, and it needs one line in the layout rules and in the two layout tests.
- **On the frontend the quote's page gets its invoice controls handed in by `App.tsx`,** as the deal's page gets its panels (R7). `invoices/QuoteInvoice.tsx` gives two components that take plain props, the main button and the details line, and `App.tsx` passes them to the quote page as a prop. `quotes/` imports nothing of `invoices/`, and `invoices/` imports no quotes code, because the invoice's reply carries what its page needs about the quote.

The spec says otherwise in a few places, so the first phase corrects it. That's the "spec is wrong" case above, and `docs/STATUS.md` says so.

## Files that change

### What the parts agree on

**The link** (V36, V37, [backend.md](../../specs/backend.md#data-model))

- `invoices.quote_id`: nullable foreign key to `quotes.id`, no delete rule, with a unique index. Both databases let a unique column hold many blanks, so invoices not made from a quote don't clash.
- Set once, when the draft is made. No route sets or changes it afterwards. Deleting a draft deletes the row, so the link goes and the quote is free (V36). Voiding leaves it.

**Making the invoice** (V33, V34, V37, V38)

- `start_from_quote(conn, quote_id, user, today, now)` in `invoices/routers/invoices.py`, beside `start_invoice`, inside one `db.writing()`. In order:
  1. Reads the quote with its deal's stage, 404 if missing.
  2. Refuses with 409 when the quote isn't accepted, when an invoice has `quote_id` = it, or when the deal isn't won. The existing invoice check is a query, and the unique index is the last guard: an `IntegrityError` on `quote_id` becomes the same 409, so a race that gets past the query still gets V37's words. The words name the invoice, "INV-0042", or "a draft invoice" without a number.
  3. Inserts the draft with `quote_id`, a Bill to from the quote's fixed `prepared_for_*` columns through the existing `figures.bill_to`, and `who.added(user, now)`.
  4. Copies the quote's lines whole and in order through `write_lines` from `company/lines.py`, as `LineToSave` values with the quote line's product, name, description, quantity and unit price. It runs none of `_check_text`, `_check_subtotal` or the price-list lookup, which is V38 and V34. A later save runs them as it does for any draft.
  5. Returns `detail(...)`. It doesn't write to the quote, so the quote's `updated_at` and `updated_by` stay as they were.
- A refusal that comes from a message, not a field, uses the file's `refuse()`.

**What the replies carry** ([backend.md](../../specs/backend.md#api))

- `InvoiceDetail.quote`: `null`, or `{id, number, tax_label, tax_rate}`, with `tax_rate` as `rate_text` so it compares as text with the draft's own `tax_rate`, which is the settings' rate as it is now. The page shows V35's notice while they differ and the invoice is a draft, so the page reads no settings for it.
- `InvoiceRow.quote_id`, so the list can answer `GET /api/invoices?quote_id=7` with its one row, which the quote's page reads for the invoice's id, number and what it shows as. `_list_query` gains the `quote_id` filter beside `deal_id` and `organization_id`.
- Nothing is added to the quotes' replies.

**Frontend, between files** (Q38, V35, V36)

- `invoices/QuoteInvoice.tsx` exports `QuoteInvoiceButton` and `QuoteInvoiceLine`. Both take `{quoteId, number, status, dealStage}` and read `useQuoteInvoice(quoteId)`, which TanStack Query shares between them. The button renders nothing unless the quote is accepted. It's Create invoice, or Open invoice once the read finds one, and off with Q38's words while the deal isn't won or the request is on its way. The line renders nothing without an invoice.
- `quotes/pages/Quote.tsx` takes an optional prop, `invoice?: {Button, Line}`, and puts `Button` first among an accepted quote's buttons and `Line` at the foot of the details panel, passing the quote's own fields. Without the prop it draws neither, so the quote's tests need no invoice code.
- `App.tsx` passes `invoice={{Button: QuoteInvoiceButton, Line: QuoteInvoiceLine}}` to `Quote`.

### Docs

| File | Change |
|---|---|
| `docs/specs/backend.md` | The route is `POST /invoices/from-quote/{quote_id}`; the `invoice` field leaves `GET /quotes/{id}`; `GET /invoices` takes `?quote_id=`; the invoice's `quote` carries `tax_rate` as text; the making of the draft moves under invoices, with the import it needs |
| `docs/specs/architecture.md` | Layout rules: `invoices/` may import `quotes/tables.py`, and the frontend hands the quote page its invoice controls through `App.tsx`. The new files in the tree |
| `docs/specs/invoices.md`, `docs/specs/quotes.md` | Q38 and V33 to V38 are unchanged in what they ask for. Only wording that names the route or says the quote's reply holds the invoice is corrected |
| `docs/specs/testing.md` | The test file for the sample data, the layout tests and the names of the new tests, as built |
| `docs/STATUS.md` | Quote to invoice added to what's done. The corrections above are noted |
| `docs/spec.md`, other area files | Already updated on this branch. The build adds whatever it settles |

### Backend: new files

| File | What it holds |
|---|---|
| `backend/accountable/migrations/versions/0013_invoice_quote.py` | Adds `invoices.quote_id` with its foreign key and unique index, in batch mode as SQLite needs. Existing invoices keep it blank, and the migration links nothing, because an old invoice's lines were typed or chosen and no record says which quote it came from. Downgrade drops the index and the column |
| `backend/tests/test_quote_invoice.py` | The route and the link (V33 to V38) |

### Backend: existing files

| File | Change |
|---|---|
| `backend/accountable/invoices/tables.py` | The `quote_id` column and its unique index. Imports `quotes.tables` |
| `backend/accountable/invoices/schemas.py` | `QuoteLink` and `InvoiceDetail.quote`, `InvoiceRow.quote_id`, and the new messages: not accepted, already has an invoice, no longer won |
| `backend/accountable/invoices/routers/invoices.py` | `start_from_quote` and its route, `quote_id` in `_list_query`, `detail` filling `quote`. `delete_draft` needs nothing, since the row goes with the link |
| `backend/accountable/invoices/sample_data.py` | Links each accepted quote to the first sample invoice on its deal. It reads the accepted quotes by deal in one query and sets `quote_id` as the invoice is written. The quotes are filled before the invoices already (`cli.fill_sample`) |
| `backend/tests/test_layout.py` | `("quotes", "tables")` allowed for `invoices/` and nobody else, and a test that `quotes/` imports nothing of `invoices/`. The case table gains the pairs |
| `backend/tests/test_every_route.py` | A sample body for the new `POST`, `{}`, so its security and bad-input checks run |
| `backend/tests/test_migrations.py` | `0013` builds the same table as `invoices/tables.py`, upgrades a database at `0012` with invoices in it, downgrades, and writes for Postgres offline |
| `backend/tests/test_sample_data.py` | The sample links (M3) |
| `backend/tests/test_invoices.py`, `test_delete.py`, `test_limits.py` | Searched for anything that states the invoice's columns, the route list or the list query's reads, and changed only where one does |

### Frontend: new files

| File | What it holds |
|---|---|
| `frontend/src/invoices/QuoteInvoice.tsx` | `QuoteInvoiceButton` and `QuoteInvoiceLine` |
| `frontend/src/invoices/QuoteInvoice.test.tsx` | Their tests |

### Frontend: existing files

| File | Change |
|---|---|
| `frontend/src/invoices/queries.ts` | `quote` and `quote_id` in the types, `InvoiceFilter` gains `{quote_id: number}`, `useQuoteInvoice`, and `useCreateInvoiceFromQuote`, which puts the new invoice in the cache and refreshes the quote's invoice read, the deal's and organization's lists and the Money figures, as `useStartInvoice` does |
| `frontend/src/invoices/pages/Invoice.tsx` | "From quote QT-0004" under the title, any status, and the tax-rate notice on a draft (V35), in the style of the page's other notices |
| `frontend/src/quotes/pages/Quote.tsx` | The `invoice` prop and its two places (Q38) |
| `frontend/src/App.tsx` | Hands `Quote` its invoice controls |
| `frontend/src/layout.test.ts` | `quotes/` and `invoices/` still import nothing of each other, and `quotes/pages/Quote.tsx` takes its controls from outside |
| `frontend/src/invoices/pages/Invoice.test.tsx`, `frontend/src/quotes/pages/Quote.test.tsx` | The new cases below. Existing replies in `test-*.ts` helpers gain `quote: null` and `quote_id: null` where a type needs them |

### End to end

| File | Change |
|---|---|
| `e2e/quote-to-invoice.spec.ts` | New (see Proof) |
| `e2e/invoices.spec.ts`, `e2e/quotes.spec.ts`, `e2e/data.spec.ts`, `e2e/failures.spec.ts` | Searched for anything the change alters, such as an accepted quote's buttons, the sample invoices' look or a failed read, and changed only where one does. The count of the top bar's links doesn't change, as no section is added |

## Order of work

### Phase 1: the spec, then the table

1. Correct the spec as the Docs table says, so the build follows it.
2. `0013`, the column in `invoices/tables.py`, and `test_migrations.py`. The migration test fails first on a missing column, then passes.
3. Teach `test_layout.py` and `layout.test.ts` the new rule, with the tests that `quotes/` stays clear of `invoices/`.

### Phase 2: making the invoice

4. `test_quote_invoice.py` first, with the accepted-quote fixture: lines, order, Bill to, the refusals, the double request. Then `start_from_quote`, its route and the schemas, until it passes.
5. The `quote` field on the detail, `quote_id` on rows and in the list filter, and the delete-then-create-again case.
6. `test_every_route.py` gets the sample body.

### Phase 3: the sample data

7. Link the accepted quotes in `invoices/sample_data.py`, with the `test_sample_data.py` case. Check `npm run seed` on a temporary database and read the links back.

### Phase 4: the invoice page

8. Types, `useQuoteInvoice` and `useCreateInvoiceFromQuote` in `queries.ts`.
9. "From quote" and the notice in `Invoice.tsx`, each with its test.

### Phase 5: the quote page

10. `QuoteInvoice.tsx` and its tests, the `invoice` prop in `Quote.tsx`, and `App.tsx`. Then the layout test.

### Phase 6: end to end, and finish

11. `e2e/quote-to-invoice.spec.ts`, then `npm run e2e -- e2e/quote-to-invoice.spec.ts`, and the other e2e files the change touches.
12. `docs/specs/testing.md` and `docs/STATUS.md` brought level with what was built. Then `npm run check:quick`, and fix what fails in the code and not in the rules. The end-to-end tests are run by the owner.

## Risks

- **The layout rules.** The route and the quote's reply are placed to keep `quotes/` clear of `invoices/`. If a test in `test_layout.py` asks for more than one line of change, stop and settle it in the spec before going on.
- **A race on Create invoice.** Two clicks can both pass the check for an existing invoice. The unique index is what stops the second, and a test sends two requests at the same moment. SQLite and Postgres both raise `IntegrityError` for it, and the route must catch it inside `db.writing()` so the lock is released and the answer is the 409, not a 500.
- **Exact copies.** Criterion 2 needs the lines to match to the cent, and V38 needs a draft that breaks V8 to still be made. The saving code must not run the draft's checks on the copy, but a later `PATCH` must. A test makes a quote with a 1,500 character description and a character the fonts lack, creates the invoice and saves it, in that order.
- **The tax note comparing the wrong things.** It compares the quote's fixed rate with the settings' now, and shows on drafts only. A quote that was declined as a draft has a rate fixed too, but it can't be accepted, so it never reaches this. The test sets the rate to a value and back, to see the note go.
- **Two requests for one read.** The button and the line both read the quote's invoice. They must share one query key, or the page makes two reads, and a failed read must show once, with Try again (N6).
- **Cache.** Creating an invoice must refresh the deal's and organization's invoice panels, the Invoices table and the Money figures, and the quote's own read. Deleting the draft must refresh the quote's, or Open invoice would open a page that says the invoice no longer exists. The test deletes and goes back.
- **Sample data order.** Linking in `invoices/sample_data.py` depends on `cli.fill_sample` filling quotes first, as it does. A test seeds and checks that every accepted quote has exactly one linked invoice and that no other invoice is linked. The wipe takes its order from the tables' foreign keys (`cli.py`), so the new key should be respected without a change, and `test_cli.py` checks seed and empty run clean.
- **Speed.** Every unit test under one second on this computer. The new tests build a handful of records through the API and don't use `limits_data.py`. The one place the Q1 data matters is the invoices list, which gains a column and a filter, so `test_limits.py` is read for its read counts and run.
- **Old data.** The migration links nothing, so existing quotes in the owner's database that were invoiced by hand show Create invoice and can make a second invoice. That's accepted, since nothing in the data says which invoice came from which quote. STATUS.md says so.
- **Playwright waits.** The end-to-end test waits for the exact reply or row the next step needs, not for the page to settle, as AGENTS.md asks.

## Proof

`npm run check:quick` passes on this computer. It runs Prettier, ESLint, ruff, gitleaks, the type checks and the unit tests, and the coverage stays over 80%. The end-to-end tests are run by the owner with `npm run check`.

### Unit tests: backend (pytest)

`backend/tests/test_quote_invoice.py`, each test under a second:

- An accepted quote on a won deal makes a draft whose lines match the quote's one for one, in order, with the same product, name, description, quantity and unit price, and the same subtotal to the cent (criterion 2, V34), including after a product's price changed and after it was archived.
- Its Bill to is the quote's Prepared for set out as V5 sets it out, with a blank contact or email left out, and it ignores the deal's organization or contact changed since the quote was sent.
- Its tax is the settings' now. With the rate changed since the quote, the reply's `quote.tax_rate` is the quote's and the invoice's `tax_rate` the settings', and they match when the rate is put back (V35).
- A second request is refused with a 409 naming the invoice (criterion 3, V37), when the first is a draft, issued and void. Two requests sent at the same moment make one invoice and one refusal.
- A draft, sent or declined quote is refused. A deal moved out of Won is refused with V33's words. A quote that isn't there gets a 404.
- The quote is unchanged: its status, lines, `updated_at` and `updated_by`.
- The link is on both replies and in `GET /invoices?quote_id=` (criterion 4, V36). An invoice not made from a quote has `quote` null and isn't in that list.
- Deleting the draft frees the quote, and a second invoice can then be made. Voiding doesn't.
- A description over 1,000 characters and a character the fonts lack are copied whole. Save draft and Issue invoice are then refused with the field's message (V38). After the field is fixed, issuing works and posts to the books as any invoice does.
- Issuing a draft made from a quote gives it a number, dates and copies as V11 says, and the link stays.

Other backend tests:

- `test_layout.py`: `invoices/` may import `quotes/tables.py` and nothing else of quotes'; `quotes/` imports nothing of invoices'; the routes' prefixes still start with their area's words.
- `test_every_route.py`: the new route gets the security and bad-input checks, and a body of `{}`.
- `test_migrations.py`: `0013` matches `invoices/tables.py`, upgrades a database at `0012` with invoices and quotes in it and leaves every row as it was with `quote_id` blank, downgrades cleanly, a second head is refused, and offline Postgres output has the column and the index.
- `test_sample_data.py`: every accepted sample quote is linked to exactly one invoice, the first on its deal, with the quote's lines, and no other invoice is linked (M3). Seeding on the 1st of a month still holds.
- `test_cli.py`, `test_delete.py`: seed and empty still leave the tables as they were, and an organization or deal is still held by its invoices.

### Unit tests: frontend (Vitest)

- `QuoteInvoice.test.tsx`: Create invoice on an accepted quote only, and nothing on a draft, sent, expired or declined one; off with Q38's words while the deal isn't won; off while the request is on its way, and a double press making one request; Open invoice and the line "Invoice INV-0042", or "Draft invoice", once there is one; a refused click because the quote already has an invoice, reading again and showing Open invoice; a failed read with Try again (N6); and the new invoice's page opened with "Invoice created from QT-0004."
- `Quote.test.tsx`: the page draws the handed-in button and line, and without the prop draws neither.
- `Invoice.test.tsx`: "From quote QT-0004" on a draft, an issued invoice and a void one, and not on one without a quote; the notice with the quote's label and both rates in its words while they differ, gone when they match, absent for a label change alone and absent once issued; and a draft made from a quote with a field that breaks V8 showing its message at once.
- `layout.test.ts`: `quotes/` and `invoices/` import nothing of each other.
- The existing tests that build an invoice reply pass with `quote: null` added to it.

### End-to-end tests (Playwright Test)

`e2e/quote-to-invoice.spec.ts`, on a temporary database:

- Makes a quote with three lines on a deal, sends and accepts it, presses Create invoice, and finds the draft open with the quote's lines, quantities and prices to the cent, its Bill to, "From quote" with the quote's number as a working link and the success message (criteria 2 and 4).
- Goes back through that link and finds Open invoice, a line naming the invoice, and that Open invoice opens the same invoice. Issues it and finds the link still there on both pages.
- Changes a product's price and the tax rate in Company settings before creating the invoice, and finds the lines unchanged, the tax at the new rate and the notice in its words. Puts the rate back and finds the notice gone.
- Tries a second invoice through the API and finds a 409 (criterion 3), and finds the page's second try, after the invoice is made in another tab, showing Open invoice.
- Deletes the draft and finds Create invoice back on the quote.
- Finds a fresh copy's accepted quotes showing Open invoice, each opening an invoice with the quote's lines.
- Has no console errors, and waits for the exact reply or row each step needs.

The existing end-to-end tests that touch an accepted quote or the sample invoices, `e2e/quotes.spec.ts`, `e2e/invoices.spec.ts`, `e2e/data.spec.ts` and `e2e/failures.spec.ts`, are read and changed only where they state something this change alters.
