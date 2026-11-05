# Plan: quotes and invoices share their code

From `intent.md`. Each step leaves the characterization tests in `test_quote_invoice_figures.py`, `test_quote_invoice_numbers.py` and `test_quote_invoice_pdfs.py` passing, and they run after every step. Invoice PDFs are compared byte for byte with copies made before step 4, after steps 4, 5 and 6, since ReportLab makes the same file for the same invoice.

## Where shared code goes

Quotes and invoices are later areas, which never import each other, and `company/` is the one area both may import, on both sides (`test_layout.py`, `layout.test.ts`). So everything the two share goes in `company/`.

## New dependencies

None. fpdf2 and the fontTools it brought are removed, with `uv remove fpdf2`.

## Order of work

1. **One set of reply models.** `Company` in `company/documents.py`, with `details_now()`, the company's details and the tax under the names of the columns a document fixes them in, and `company_in()`, the company as a reply carries it. `Line` and `line_reply()` in a new `company/lines.py`. Both areas' schemas use them, and invoices' issuing copies `details_now()`.
2. **One way to save lines.** `LineToSave`, `lines_of()`, `same_lines()` and `write_lines()` in `company/lines.py`. A table that keeps when each line last changed, as `quote_lines` does, gets the save's moment. Each area keeps its own rules for what a sent line becomes and its own messages: a quote's new line takes what's sent, and an invoice's its product's price and description unless they're sent.
3. **One way to work out the figures.** `subtotal()` and `on_subtotal()` in `company/tax.py`, used by both lists and both limits, and `document_figures()` in `company/lines.py`, a document's line replies and totals, used by a quote's page and a draft invoice's. `figures.draft_totals()`, which only called `tax.totals()`, goes.
4. **Move the layout, the drawing and the fonts to `company/`, unchanged.** `layout.py`, `pdf.py`, `fonts.py`, `characters.py` and `fonts/` from `invoices/`, `layout.ts` and `characters.ts` from `frontend/src/invoices/`, and the shared files as `document-designs.json`, `document-fonts.json` and `document-layout-cases.json`.
5. **Each kind's words.** `kinds` in `document-designs.json` gives each kind its words, which a design's row names by `word`, and says whether a heading shows over a blank field it heads. The layout's inputs take neutral names: `kind`, `date`, `end_date`, `recipient`, and `amount_due` for the banner's figure. Both layouts change step for step, and three quote cases join the shared ones.
6. **Quote PDFs from the shared layout.** `company/pdf.py` gives `look()`, the settings' look, and `download()`, which lays a document out, leaves out characters the fonts lack, draws it and names the file. `quotes/document.py` gives the quote's values. `quotes/pdf.py`, `quotes/fonts/` and fpdf2 go. The four quote records are taken again and the file test's font, title and logo lines change, as agreed. `test_quote_pdf.py` is rewritten through the API, and the end-to-end checks of a quote's PDF read its new text.
7. **The quote page's preview from the shared layout.** `company/DocumentDrawing.tsx` draws laid-out pages for both kinds, and `invoices/SampleInvoice.tsx` keeps the Settings page's sample. `quotes/QuotePreview.tsx` replaces `QuoteDocument.tsx`. The quote page reads the settings and the logo with the quote, as the invoice page does. The two paper tokens only the old sheet used go from `styles.css`.
8. **The spec, the status and this plan.**

## Files that change

- Backend: `company/documents.py`, `company/tax.py`, `company/lines.py` (new), `company/layout.py`, `company/pdf.py`, `company/fonts.py`, `company/characters.py` and `company/fonts/` (moved), `quotes/schemas.py`, `quotes/document.py`, `quotes/router.py`, `quotes/pdf.py` and `quotes/fonts/` (removed), `invoices/schemas.py`, `invoices/figures.py`, `invoices/routers/invoices.py`, `invoices/routers/pdf.py`, `pyproject.toml`, `uv.lock`.
- Shared: `document-designs.json`, `document-fonts.json`, `document-layout-cases.json` (renamed, the designs with `kinds`, the cases with neutral names and three quotes).
- Frontend: `company/layout.ts` and `company/characters.ts` (moved), `company/DocumentDrawing.tsx` (new), `invoices/SampleInvoice.tsx` (from `InvoicePreview.tsx`), `invoices/pages/Invoice.tsx`, `invoices/DraftForm.tsx`, `quotes/QuotePreview.tsx` (new), `quotes/QuoteDocument.tsx` (removed), `quotes/QuoteForm.tsx`, `quotes/pages/Quote.tsx`, `App.tsx`, `styles.css`.
- Tests: `test_quote_invoice_pdfs.py` and four records in `characterization/` (as agreed), `test_quote_pdf.py`, `test_document_layout.py` and `test_document_fonts.py` (renamed), `test_invoice_pdf.py`, `company/layout.test.ts` (moved), `company/DocumentDrawing.test.tsx` and `invoices/SampleInvoice.test.tsx` (from `InvoicePreview.test.tsx`), `quotes/QuotePreview.test.tsx` (replacing `QuoteDocument.test.tsx`), `quotes/QuoteForm.test.tsx`, `quotes/pages/Quote.test.tsx`, `App.test.tsx`, `e2e/quotes.spec.ts`.
- Docs: `spec.md`, `quotes.md`, `invoices.md`, `settings.md`, `shell.md`, `visual-design.md`, `architecture.md`, `backend.md`, `frontend.md`, `deploy.md`, `testing.md`, `STATUS.md`.

## Risks

- **A characterization test that can't stay unchanged.** Moving quotes to the invoice designs changes what their PDFs say, so the tests that record the old look fail by design. Agreed in advance: the four records and three lines of the file test. Anything more is reported.
- **Invoices changing by accident.** The byte comparison after steps 4 to 6 catches any change to an invoice's PDF, however small.
- **The quote page waiting on the settings.** It reads them with the quote, as the invoice page does, so a failed read says so with Try again. The closed-deal and missing pages show no preview and don't wait.
- **Speed.** The quote preview lays out every line on each keystroke, as a draft invoice's does. The speed test of a 100-line quote's preview stays under 100ms.

## Proof

- The 68 characterization tests after every step, and the related backend and frontend tests.
- Invoice PDFs byte for byte the same as before the change.
- The shared layout cases, run by both sides, including the three quote cases.
- `npm run check` at the end.
