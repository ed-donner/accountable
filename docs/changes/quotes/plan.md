# Plan: quotes

This plan turns the quotes intent and the spec, already updated on this branch, into build work: which files change, in what order, what could go wrong and how we'll know it works. IDs such as Q20 and D4 are the spec's requirements. The quotes' own are Q5 to Q37 in `docs/specs/quotes.md`, after the quality rules Q1 to Q4. The intent wins over the spec and the spec wins over this plan. If the build shows the spec is wrong, fix the spec in the same change and say so in `docs/STATUS.md`.

The plan ends with the build. ui-check, the review and `docs/IMPROVE.md` come after it.

## Files that change

The change is for one agent, working through the phases in [Order of work](#order-of-work). The backend and the frontend meet only at the API below, so either side can be built against it.

### New dependencies

The intent allows a new dependency only if the plan makes the case. This change adds two, both Python, and nothing on the frontend.

**fpdf2, for the PDF.** The quote has to become a PDF in the backend (Q30), with the brand's fonts embedded, rounded fills, text that wraps, pages that break with their headings repeated, and nothing typed read as markup (Q32). That isn't something to hand-write: embedding and subsetting a TrueType font alone is a project. The candidates:

| Library | Why or why not |
|---|---|
| fpdf2 | Pure Python. It and what it needs, fontTools, Pillow and defusedxml, install from wheels with uv, so it runs on Render's native Python runtime with no system packages. It draws text as plain text unless asked for its markdown or HTML, which we never ask for. It embeds and subsets TTF fonts, draws rounded rectangles, and has tables that repeat their headings across pages. Actively maintained. LGPL-3.0, which asks nothing of an app run as a service |
| ReportLab | Mature and BSD-licensed, but its flowing text, `Paragraph`, reads a markup of its own, so every typed value would need escaping, and one missed field breaks Q32. Its canvas is plain text but leaves wrapping and page breaks to us |
| WeasyPrint | Would draw the preview's HTML, but needs Pango from the system, which Render's native runtime doesn't have. The intent rules it out |
| xhtml2pdf, borb and others | Read HTML or markup by design, or are far less used |

**pypdf, for the tests only**, in the dev group. A PDF with embedded fonts holds glyph numbers, not letters, so a test can't search its bytes for "$8,993.08". pypdf reads the text back through the font's own map, so the backend tests can check the company's details, the lines and the totals on the PDF to the cent (success criteria 2 and 5). It's pure Python and BSD-licensed. pdfminer.six would do too, but is larger and slower.

Phase 1 checks fpdf2 against these needs, and its speed, before anything is built on it. The build records both versions in the Libraries table in `docs/specs/architecture.md`.

**Fonts.** fpdf2 embeds TrueType, and the Fontsource packages hold WOFF2, so the backend keeps static TTF copies of Instrument Sans Regular and SemiBold and JetBrains Mono Regular and Medium in `backend/accountable/quotes/fonts/`, from the families' own releases, with their OFL licence texts, which `docs/mockups/fonts/` already has. Four files of roughly 100 to 300KB each.

### What the parts agree on

`GET /api/quotes/{id}` replies with the quote as its page and its PDF show it. The PDF route draws from the same model, so the two can't disagree:

```json
{
  "id": 4,
  "number": "QT-0004",
  "status": "draft",
  "deal": { "id": 12, "name": "Renewal and upgrade", "stage": "proposal" },
  "quote_date": "2026-11-05",
  "valid_until": "2026-12-05",
  "sent_on": null,
  "decided_on": null,
  "company": {
    "name": "Plainsong Systems",
    "address": "48 Orchard Row, Suite 210\nBrooklyn, NY 11201",
    "email": "accounts@plainsong.example",
    "phone": "(718) 555-0142"
  },
  "prepared_for": { "organization": "Harbor & Pine", "contact": "Sam Carter", "email": "sam.carter@harborpine.example" },
  "tax_label": "Sales tax",
  "tax_rate": "8.875",
  "lines": [
    {
      "id": 31,
      "product_id": 1,
      "name": "Standard license, per user per year",
      "description": "Annual license, per seat",
      "quantity": 12,
      "unit_price_cents": 48000,
      "amount_cents": 576000
    }
  ],
  "subtotal_cents": 826000,
  "tax_cents": 73308,
  "total_cents": 899308,
  "created_at": "2026-11-05T14:03:00Z",
  "created_by": { "id": "teammate-alex-rivera", "name": "Alex Rivera" },
  "updated_at": "2026-11-05T14:03:00Z",
  "updated_by": { "id": "teammate-alex-rivera", "name": "Alex Rivera" }
}
```

- `company`, `prepared_for`, `tax_label` and `tax_rate` are the quote's own once it isn't a draft, and the settings' and the deal's as they are now while it is (Q17, Q18, Q30). Any text in them can be `null`. A blank tax label is `null`, and the page and PDF show "Tax".
- `tax_rate` is text, as `GET /settings` gives it (B7). Amounts are whole cents. `amount_cents`, `subtotal_cents`, `tax_cents` and `total_cents` are worked out by the backend, never read from a request.
- `status` is `draft`, `sent`, `accepted` or `declined`. Expired is never sent: the page works it out from `valid_until` and today (Q7).
- `GET /api/quotes/new/{deal_id}` replies with `deal`, `company`, `prepared_for`, `tax_label` and `tax_rate` alone, what a new draft starts with (Q8, Q9). A missing deal is a 404.
- `GET /api/quotes` replies with one row per quote: `id`, `number`, `status`, `deal_id`, `deal_name`, `deal_stage`, `organization_id`, `organization_name`, `quote_date`, `valid_until`, `subtotal_cents`, `tax_cents` and `total_cents`. `?deal_id=` and `?organization_id=` narrow it for the panels, newest first.
- `POST /api/quotes` takes `{"deal_id": 12, "valid_until": "2026-12-05", "lines": [...]}`, with `valid_until` optional. `PATCH /api/quotes/{id}` takes `valid_until` and `lines`, each optional. A line is `{"id": 31, "description": ..., "quantity": 12, "unit_price_cents": 48000}` to keep one already on the quote, or `{"product_id": 1, "description": ..., "quantity": 1, "unit_price_cents": 48000}` to add one. Lines are sent whole, in order. Both reply with the quote.
- `POST /api/quotes/{id}/send`, `/accept`, `/decline` and `/copy` take `{}`, because the backend refuses a POST that isn't JSON. Send and decline reply with the quote, copy with the new quote. Accept replies `{"quote": {...}, "deal": {"id": 12, "name": "...", "value": 48001}, "changes": {"close_date": "2026-11-05", "new_customer": "Sam Carter", "declined": ["QT-0003"]}}`, which the page turns into Q22's message.
- `GET /api/quotes/{id}/pdf` replies `application/pdf` with `Content-Disposition: attachment; filename="QT-0004.pdf"`. The number is only the prefix's letters, digits and hyphens and the figures (B4), so it's safe in the header as it is.
- A refusal that belongs to the quote's status or its deal is a 409 with `{"detail": "..."}` in the spec's words, such as "QT-0004 has been sent, so it can't be changed. Copy it to make a new draft." One that belongs beside a box is a 422 with `{"detail": "Check the form.", "fields": {...}}`, where a line's field is named by its place, such as `lines.2.quantity`, and the quote's own as `valid_until` or `lines`.

### Backend: new files

| File | What it holds |
|---|---|
| `backend/accountable/quotes/__init__.py` | Empty, as in the other areas |
| `backend/accountable/quotes/tables.py` | `quotes` and `quote_lines`, as in [backend.md](../../specs/backend.md#data-model), with `*who.columns()` on `quotes` and `**TABLE_OPTIONS` on both. `quotes.deal_id` is a foreign key to `deals` with no delete rule. `quote_lines.quote_id` deletes with its quote, and `product_id` points at `products`. The status check is an expression, `quotes.c.status.in_(STATUSES)`, and the accepted-quote index is `Index(..., unique=True, sqlite_where=..., postgresql_where=...)`, because the layout test refuses SQL in a string. `RECORDS = (quotes,)`, so seed and empty count quotes, not their lines. `HOLDS = (Hold(quotes.c.deal_id, "quote"),)` |
| `backend/accountable/quotes/schemas.py` | The messages: `FIELD_MESSAGES` for `deal_id`, `valid_until`, `lines`, `product_id`, `quantity`, `unit_price_cents` and `description`, and the refusals in Q11, Q14, Q20, Q21, Q23 and Q28 as named constants, each sentence written once. The request models, `QuoteCreate`, `QuoteUpdate` with `MISSING` defaults, and `LineIn`, a subclass of `api.Request` so a line's description gets the same check on text the database can't store. `Quantity` comes from `company/tax.py` and `Cents` from `api.py`. The reply models: `QuoteDocument`, the shape above without the quote's own fields, which the PDF draws, `QuoteDetail`, `QuoteRow`, `NewQuote` and `Accepted` |
| `backend/accountable/quotes/document.py` | `document(conn, quote_row)` and `new_document(conn, deal_id)`: a quote as its page and PDF show it. The company's details and the tax from the quote's own columns once it isn't a draft, or from `current_settings()` while it is. Prepared for from the quote's columns, or from the deal's organization and main contact through `crm/tables.py`. The lines with their amounts, and the totals through `company/tax.py`'s `totals()`. `fixed_details(conn, deal_id)`, what sending and declining a draft copy onto the quote. Used by the router, the PDF and the sample data |
| `backend/accountable/quotes/pdf.py` | `quote_pdf(doc: QuoteDocument, *, draft: bool) -> bytes`, drawing [Quote document](../../specs/quotes.md#quote-document) with fpdf2: US Letter, the four fonts from `fonts/`, the paper colors as constants, the lines as an fpdf2 table with its headings repeated on each page, the totals kept together on the last page, and "Page 1 of 2" at each foot. Every value goes through the plain-text calls, with fpdf2's markdown and HTML never used. The colors' names match the paper tokens in `styles.css`, which a test compares |
| `backend/accountable/quotes/router.py` | `router = APIRouter(prefix="/quotes")` and the routes in [backend.md](../../specs/backend.md#api), each write in one `db.writing()`. Adding and copying take the number with `take_number(conn, "quote")` (B15). Saving lines keeps a line with an id as it is, apart from the description, quantity and price sent, and adds a line with a `product_id` only if that product is active, taking its name from `products`. It refuses another quote's line id, then works out the subtotal with `totals()` and refuses past the limit before writing. Sending and declining a draft copy `fixed_details`. Accepting checks, then declines the deal's other sent quotes, then calls `rules.change_stage(conn, deal_id, "won", ..., value=(subtotal_cents + 50) // 100)`. The PDF route builds the document and returns `Response(content=..., media_type="application/pdf", headers=...)` |
| `backend/accountable/quotes/sample_data.py` | `fill(conn, today)`, after the company's fill, because it reads the settings and takes numbers. It reads the deals and their stage changes from the database, never importing the CRM's sample data. An accepted quote goes on every deal won this month or in the two before, dated so it was sent before the close date and accepted on it, and put down to the teammate who moved the deal to Won. Its last line's price is set by hand so the subtotal is the deal's value to the cent. Drafts and sent quotes go on each deal in Proposal and Negotiation, dated after the deal reached Proposal: two of them past their valid-until date, and one declined with a newer copy beside it. Quotes are added in date order, so `take_number` numbers them QT-0001 onwards (M8). About 40 quotes, most with three lines or more, from the sample products, some prices changed by hand |
| `backend/accountable/quotes/fonts/` | The four TTF files and the OFL licence texts |
| `backend/tests/test_quotes.py`, `test_quote_pdf.py`, `pdf_text.py` | See [Proof](#proof). `pdf_text.py` is a small script that prints a PDF's text with pypdf, for the end-to-end test |
| `backend/accountable/migrations/versions/0007_quotes.py` | Creates both tables, their foreign keys, the indexes, the status check and the partial unique index, with explicit columns as the other migrations have them. On Postgres, turns on row-level security for both. The downgrade drops them |

### Backend: existing files

| File | Change |
|---|---|
| `backend/accountable/main.py` | A fourth `Area(routers=[quotes.router], messages=quotes_schemas.FIELD_MESSAGES, holds=quotes_tables.HOLDS)` at the end of `AREAS` |
| `backend/accountable/api.py` | `field_messages` names a field inside a list by its place, so `("body", "lines", 2, "quantity")` becomes `lines.2.quantity`, and looks its message up by its own name, `quantity`. Every existing field sits at the top level, so their keys don't change |
| `backend/accountable/crm/rules.py` | `change_stage` takes `value: int \| None = None`, and step 6 sets it when given. Nothing else in the CRM changes |
| `backend/accountable/cli.py` | Imports `quotes.tables`. `RECORDS` gains `quotes_tables.RECORDS`, and `fill_sample` calls `quotes_sample_data.fill(conn, today)` after the company's fill |
| `backend/accountable/migrations/env.py` | Imports `quotes.tables` |
| `backend/tests/limits_data.py` | Adds 1,000 quotes with 5,000 lines between them, across the 500 deals, and one draft with 100 lines for the speed tests (Q1) |
| `backend/tests/test_rules.py` | A value passed to the stage change is set, and none leaves the value alone |
| `backend/tests/test_delete.py` | `test_no_area_holds_a_deal_or_an_organization_yet` becomes a test that quotes hold deals and nothing holds an organization. Two new tests use the real holds: a deal with two quotes gets the 409 and "This deal has 2 quotes, so it can't be deleted.", and an organization whose deals have quotes still deletes |
| `backend/tests/test_layout.py` | `AREAS` gains `quotes`. A test that `quotes/` imports only `company/`, `crm.tables`, `crm.rules` and `products.tables`, which the existing rules already enforce for any later area |
| `backend/tests/test_every_route.py` | `test_the_routes_were_found` also expects each quote route, `valid_until` among the body's text fields on `POST /api/quotes` and `PATCH /api/quotes/{quote_id}`, and no `DELETE` under `/api/quotes`. The record-route checks reach `GET /api/quotes/new/{deal_id}` by themselves |
| `backend/tests/test_migrations.py` | A `database_from_before_quotes` fixture at `0006` with records and a quote count in it. The comparisons, the one-head test and the Postgres checks now reach the two new tables |
| `backend/tests/test_sample_data.py` | The `seeded` fixture also fills the company and the quotes. New checks for M3's quotes rows and M8 |
| `backend/tests/test_cli.py` | The counts name quotes, a first seed gives about 40, and seed and empty wipe both new tables |
| `pyproject.toml`, `uv.lock` | `fpdf2` in `dependencies` and `pypdf` in the dev group, through `uv add` |

`db.py`, `who.py`, `holds.py`, `sample.py` and `company/` don't change. The quotes area uses `who.added`, `who.changed`, `who.alterations`, `who.with_names`, `who.authorship`, `holds.Hold`, `company.documents.take_number` and `current_settings`, and `company.tax.totals` as they are.

### Frontend: new files

| File | What it holds |
|---|---|
| `frontend/src/quotes/queries.ts` | The types for the shapes above. `useQuotes(filter?)`, keyed `["quotes", filter]`, `useQuote(id)`, `useNewQuote(dealId)`, and the writes through `useWrite`: `useSaveQuote(id?)`, `useSendQuote`, `useAcceptQuote`, `useDeclineQuote` and `useCopyQuote`, the last four sending `{}`. `downloadQuote(quote)` calls `download()` with the number as the file name |
| `frontend/src/quotes/status.ts` | `shownStatus(quote, today)`, which gives `expired` for a sent quote past its date. The status names, their chip tones from [Visual design](../../specs/visual-design.md#stage-chip-and-chart-colors), the sort order, `figures(rows, today)` for Q34, and `acceptedMessage(reply)` for Q22's message |
| `frontend/src/quotes/QuoteDocument.tsx` | The sheet: the quote document drawn from a `QuoteDocument` and the lines and totals it's given, at the PDF's sizes in CSS points, scaled to its column with `zoom`, measured with `useSize` from `components/charts/`. It uses only the paper tokens |
| `frontend/src/quotes/QuoteForm.tsx` | A draft's form: React Hook Form with Zod and `useFieldArray` for the lines. Each line's quantity read with `parseQuantity` and its price with `parsePrice`. Add product, a `cmdk` list of active products in a Radix Popover, built like `RecordPicker`'s. It hands the preview the lines as typed, through `useWatch`, and the sums from `company/tax.ts` |
| `frontend/src/quotes/dialogs.tsx` | `NewQuoteDialog`, a `FormDialog` with a `RecordPicker` given only open deals and no `onAdd` (Q8). `SendDialog`, `AcceptDialog` and `DeclineDialog`, on `components/Confirm.tsx`. `AcceptDialog` names the deal, the value in whole dollars and the sent quotes it will decline, from the deal's quotes |
| `frontend/src/quotes/panels.tsx` | `dealQuotesPanel` and `organizationQuotesPanel`, each a `RecordPanel` showing `useQuotes({deal_id})` or `useQuotes({organization_id})` as a `LinkedList`, with New quote on an open deal |
| `frontend/src/quotes/pages/Quotes.tsx` | The Quotes table: `PageHeader` with New quote, the figures as a filter kept in the address as `status`, built as Contacts' is, then `DataTable` with Q33's columns, `rowHref` to the quote, no row actions, and `clearParams={["status"]}` |
| `frontend/src/quotes/pages/Quote.tsx` | The quote page at `/quotes/:id` and `/quotes/new`: `RecordHeader`'s layout with the number, chip and buttons by status, the details panel with `AddedAndChanged`, the form on a draft and the preview beside it. `MissingRecord` for a missing quote or deal. Mark as sent and Download PDF save a changed draft first. A newer reply fills the form only if nothing has been typed since it was filled or saved, as `SettingsPage.tsx` does (B10) |
| `frontend/src/components/Confirm.tsx` | The AlertDialog `ConfirmDelete` is built on, with a title, a message, a confirm label, the button's tone and `onConfirm`. `ConfirmDelete` becomes a wrapper around it with the danger tone, and its tests don't change |
| `frontend/src/quotes/*.test.ts(x)`, `quotes/pages/*.test.tsx` | See [Proof](#proof) |

### Frontend: existing files

| File | Change |
|---|---|
| `frontend/src/App.tsx` | Quotes in `SECTIONS`, with lucide's `FileText` drawn as Products' icon is. The `/quotes`, `/quotes/new` and `/quotes/:id` routes. `dealQuotesPanel` in `DEAL_PANELS` and `organizationQuotesPanel` in `ORGANIZATION_PANELS` |
| `frontend/src/styles.css` | The four paper tokens, `--color-paper`, `--color-paper-ink`, `--color-paper-muted` and `--color-paper-band`, in `@theme` only, so dark mode leaves them as they are |
| `frontend/src/lib/saveErrors.ts` | A field named by its place, such as `lines.2.quantity`, goes beside its box when the form has one, read with `getValues(path)`, rather than into a message |
| `frontend/src/components/ConfirmDelete.tsx` | Built on `Confirm.tsx` |
| `frontend/src/layout.test.ts` | `AREAS` gains `quotes` |
| `frontend/src/lib/saveErrors.test.ts` | A line's field lands beside its box, and one the form doesn't have becomes a message |
| `frontend/src/App.test.tsx` | `/quotes`, `/quotes/new?deal=12` and `/quotes/4` open their pages, and the deal and organization pages get the Quotes panel |

### End-to-end tests

| File | Change |
|---|---|
| `e2e/quotes.spec.ts` | New. See [Proof](#proof) |
| `e2e/helpers.ts` | `addQuote(request, dealId, lines)` and `sendQuote(request, id)`, for tests that need a quote in a given state, and `pdfText(path)`, which runs `uv run --no-sync python backend/tests/pdf_text.py`, as `fillToLimits` runs its script |
| `e2e/start.spec.ts` | The walk through the sections includes Quotes |
| `e2e/quality.spec.ts` | `/quotes`, the first sample quote and a draft join the sideways-scrolling check at both sizes, the console walk opens a quote, saves a draft and opens each dialog, and the top-bar checks expect seven section links on one line at 1280 |
| `e2e/menu.spec.ts` | `SECTIONS` gains `/quotes`. The contrast sweep adds `/quotes`, a draft with its form and preview, and a sent quote, in both modes |
| `e2e/stress.spec.ts` | The Quotes table opens in under a second, the 100-line draft's preview updates within 100ms of a keystroke, and its PDF downloads in under a second (Q1) |

### Docs and the harness

| File | Change |
|---|---|
| `docs/STATUS.md` | The SQL under Clear the sample data truncates `quote_lines` and `quotes` too. The run instructions mention Quotes. The design entry becomes a build entry |
| `docs/specs/architecture.md` | fpdf2's and pypdf's versions in Libraries, and `components/Confirm.tsx` |
| `docs/specs/testing.md` | `backend/tests/pdf_text.py` and the e2e helpers, if the build changes them from what's here |
| `.claude/agents/ui-check.md` | Step 1 also reads `quotes.md`. The pages include a draft quote, with its form and preview, and a sent one |
| `docs/spec.md` and `docs/specs/` | Only where the build shows they're wrong |

## Order of work

Four phases. Each ends with `npm run check:quick` passing, and Phase 4 ends with `npm run check`. The PDF comes first, because it's the one part that rests on a library the project hasn't used.

### Phase 1: the PDF, against a fixed document

1. `uv add fpdf2` and `uv add --dev pypdf`. Fetch the four TTF files into `quotes/fonts/` with their licences.
2. Write `QuoteDocument` in `quotes/schemas.py`, then `quotes/pdf.py`, drawing a document built by hand in the test, with no tables or routes yet.
3. Write `test_quote_pdf.py`'s tests against it: the text read back, the totals to the cent, markup shown as typed, 100 lines over several pages with the headings repeated, the Draft mark, and the colors against `styles.css`'s paper tokens, which go into `styles.css` now. Time the 100-line PDF.
4. If fpdf2 can't draw the design, or a 100-line PDF takes more than about 300ms on this computer, stop and tell the owner before going on, with what was found. ReportLab's canvas, drawing every value as plain text, is the fallback.

Done when `npm run check:quick` passes, `ty` included.

### Phase 2: quotes on the backend

1. Add `value` to `rules.change_stage`, with its tests in `test_rules.py`.
2. Change `api.field_messages` for fields inside a list. The existing route tests, which read top-level fields' messages by name, show nothing else moves, and `test_quotes.py` covers the new naming once the routes exist.
3. Write `quotes/tables.py` and migration `0007`, and import the tables in `migrations/env.py` and `cli.py`. Get `test_migrations.py` passing, offline Postgres SQL included, before going further.
4. Write the rest of `quotes/schemas.py`, then `quotes/document.py`, then `quotes/router.py`, and add the area to `main.py`. Point `test_quote_pdf.py` at documents from the router as well as the hand-built one.
5. Write `test_quotes.py`, and the changes to `test_delete.py`, `test_layout.py` and `test_every_route.py`.
6. Write `quotes/sample_data.py`, call it from `cli.fill_sample`, and change `test_sample_data.py` and `test_cli.py`. Add the quotes to `limits_data.py`.

Done when `npm run check:quick` passes.

### Phase 3: quotes on the frontend

1. Write `components/Confirm.tsx` and rebuild `ConfirmDelete` on it, with its tests still passing. Change `lib/saveErrors.ts` and its test.
2. Write `quotes/queries.ts` and `quotes/status.ts`, with `status.test.ts`.
3. Write `QuoteDocument.tsx`, then `QuoteForm.tsx`, then `pages/Quote.tsx` and `dialogs.tsx`, each with its tests.
4. Write `pages/Quotes.tsx` and `panels.tsx`, with their tests.
5. Add the section, routes and panels to `App.tsx`, with `App.test.tsx` and `layout.test.ts`.

Done when `npm run check:quick` passes.

### Phase 4: end to end, and finishing

1. Add the helpers to `e2e/helpers.ts`, write `e2e/quotes.spec.ts`, and change `start.spec.ts`, `quality.spec.ts`, `menu.spec.ts` and `stress.spec.ts`. Run them with `npm run e2e -- e2e/quotes.spec.ts` and the others as they're changed.
2. Start the app on a temporary database, `ACCOUNTABLE_DB=<scratchpad>/accountable.db npm run dev`, and go through the agent's checks under [By hand](#by-hand). Fix what's off. Stop the server by its own process ID and check ports 5173 and 8765 are free.
3. Update `docs/STATUS.md`, `.claude/agents/ui-check.md` and the Libraries table in `architecture.md`.
4. Fix any part of the spec the build showed to be wrong, and say so in `docs/STATUS.md`.
5. Run `npm run check` in the background, wait for it, and fix failures until it passes.
6. Hand over to the project owner for the checks under [By hand](#by-hand).

## Risks

Most damaging first.

1. **The migration changes real databases, and nothing takes it back.** It runs on whatever database the app starts on. It only adds two empty tables, and the upgrade test proves it keeps every record and the quote count on a `0006` database. But once a database is at `0007`, `main`'s code won't start on it until this branch merges. No agent starts the app on `data/accountable.db`: every run uses a temporary database through `ACCOUNTABLE_DB`. All phases.
2. **Invoices and bills are being built at the same time, and each adds migration `0007` on top of `0006`.** Whichever merges later renumbers its migration, and `test_the_migrations_have_one_head` fails `npm test` until it does. No database that lasts may run a revision that later gets renumbered. The same merges meet in these shared places, so the later branch adds its entry beside this one's rather than replacing it:
   - `AREAS` in `main.py`, `RECORDS` and `fill_sample` in `cli.py`, `SECTIONS`, the panel lists and the routes in `App.tsx`, and `styles.css`
   - the area lists in `test_layout.py` and `layout.test.ts`, the routes in `test_every_route.py`, the holds test in `test_delete.py`, which checks that quotes hold deals rather than that they're the only hold, and the section counts in `quality.spec.ts`
   - `pyproject.toml` and `uv.lock`, if invoices adds a PDF library of its own. The PDFs are brought together after the merges, as the intent says

   All phases, and the merge.
3. **Accepting moves a deal some other way than the stage rules.** A won deal makes its contact a customer, records who moved it and puts the deal at the top of Won (S1). Accepting goes through `rules.change_stage` and nothing else, and passes the value to it, so the quotes area never writes the deal. The change to the CRM is one argument and one line, and `test_rules.py` covers it. `test_quotes.py` checks every row of S1's Won move after an accept, with today fixed. Phase 2.
4. **An amount comes out a cent wrong, or from the browser.** The backend works out the subtotal from the lines it saves, in whole cents, through `company/tax.py`, and replies with the tax and total from that. The request models have no total fields, and a test sends made-up totals and checks they're ignored. The browser's sums use `company/tax.ts`, with the shared cases. The value passed to the deal is `(subtotal_cents + 50) // 100`, with a test at a half dollar. Phases 2 and 3.
5. **A sent quote changes.** Every write route checks the status inside its own `db.writing()`, under the write lock, so a teammate's send can't slip in between the check and the write (Q21). The company's details, the tax and Prepared for are copied onto the quote when it's sent, and the reply and the PDF read the quote's own columns from then on. A test saves new settings and a new deal name after sending, and checks the reply and the PDF are unchanged. Phase 2.
6. **fpdf2 can't draw the design, or is too slow.** Phase 1 finds out before anything else rests on it. fpdf2 parses and subsets each font for every PDF, which costs time. If a 100-line PDF is slow, keep the fonts it embeds to the four, and make the test fixtures build each PDF once per module rather than once per test. Every unit test still has to run in under a second on this computer. Phase 1.
7. **Typed text becomes markup on the PDF.** fpdf2's `markdown=True` and `write_html` are never used, and `pdf.py` sets text only through `cell` and `multi_cell` and the table's cells, with markdown off. `test_quote_pdf.py` puts `<b>Rush</b>`, `**bold**` and `--` in a description and the company's address, and checks they read back exactly as typed. Phase 1.
8. **Font files go missing on Render.** Render runs `uv sync --locked --no-dev`, which installs the project in editable mode from the repo, so `quotes/fonts/` is read where it sits. `pdf.py` finds the fonts from its own file's place, never from the working folder. The fonts come from the families' own releases, and their licences sit beside them. Phase 1.
9. **A line's error never reaches its box.** Today the backend reports any error inside the lines under `lines`, and the page puts only top-level fields beside their boxes. Both change in this plan, with tests on each side, and Phase 3's form test sends a 422 for `lines.2.quantity` and finds the message beside that line's Quantity. Phases 2 and 3.
10. **The every-route test meets new routes.** It sends sample values to every route. `GET /quotes/new/{deal_id}` has the deal in its path rather than a required query, so on an empty database it's a record route that's missing, as the test expects, not a GET that fails. Its body-text check reads top-level fields only, so `test_quotes.py` checks a NUL in a line's description itself. The body-less POSTs take `{}`, because the backend refuses a POST that isn't JSON. Phase 2.
11. **The partial index isn't seen the same way on both databases.** SQLite and Postgres both have partial unique indexes, and SQLAlchemy writes both from `sqlite_where` and `postgresql_where`. If reflection on SQLite drops the `WHERE`, the migration test's index comparison could see a difference that isn't there. Then the comparison checks the index's name and columns, and `test_quotes.py` proves on SQLite that a second accepted quote on a deal is refused, while the offline Postgres SQL shows the `WHERE`. Phase 2.
12. **The sample data doesn't add up.** Every won deal from the last three months needs an accepted quote whose value is the deal's to the dollar, and the sample products have cents, such as $49.50. The last line of each such quote has its price set by hand to make up the difference, which is how a salesperson would do it, and `test_sample_data.py` checks every accepted quote against its deal on each of the six seeding days, the 1st of a month included. The quotes read the deals' stage changes for their dates, so a quote is never dated before its deal reached Proposal. Phase 2.
13. **The preview is slow at 100 lines.** Each keystroke re-renders the preview. The rows are memoized on their own values, the sums are one pass, and the 100ms limit in Q1 is measured in `stress.spec.ts`. If it misses, the preview takes the typed values after a short pause instead. Phase 3.
14. **A teammate's save, or a save on its way, loses what's typed.** The form takes a newer reply only while nothing has been typed since it was filled or saved, and after a save it keeps anything typed while the save was on its way, as `SettingsPage.tsx` does. Lines are matched by id when that happens. `Quote.test.tsx` covers both. Phase 3.
15. **Dark mode reaches the preview.** The paper tokens sit in `@theme` only and the dark block never sets them, so they stay as they are. The preview uses no other color. `menu.spec.ts`'s contrast sweep and a unit test of the classes the sheet uses check it. Phase 3.
16. **End-to-end tests leak into each other.** `quotes.spec.ts` puts the sample data back before each test, makes the quotes it needs through the API, and waits for the exact reply each step needs, such as the `PATCH` or the `send` and its message, or the `download` event, never for the network to go quiet. The download is saved to the test's own output folder. Phase 4.
17. **The top bar no longer fits.** Seven sections leave more room than the nine N1 allows for, and `quality.spec.ts` checks the bar at 1280 and 1536 with the widest date. Phase 4.
18. **ty can't see fpdf2's types.** If fpdf2's types are incomplete, ty may complain where `pdf.py` calls it. Fix the calls or narrow the types in our code, never by turning a rule off. If that can't be done, ask the owner. Phase 1.

## Proof

`npm run check` runs everything below apart from the by-hand checks, and fails if anything fails. The existing tests must still pass, with only the changes listed in [Files that change](#files-that-change).

The intent's success criteria:

1. `npm run check` passes: at the end of Phase 4.
2. A quote with three lines adds up exactly, tax included, in the app and on the PDF: the shared cases on both sides, the three-line test in `test_quote_pdf.py`, and "a quote with three lines" in `quotes.spec.ts`, which checks the form, the preview, the Quotes table and the downloaded PDF's text against the same figures.
3. A sent quote can't be changed, through the page or the API: `test_quotes.py`'s refusals, `Quote.test.tsx`'s sent quote with no form, and "a sent quote can't be changed" in `quotes.spec.ts`, which also sends a `PATCH` through the API.
4. Accepting a quote moves the deal to Won with the quote's value, and the deal's timeline shows who moved it: `test_quotes.py` and "accepting wins the deal" in `quotes.spec.ts`.
5. The PDF downloads, looks like the preview, and shows the company's details, the lines and the totals: `test_quote_pdf.py`, the download in `quotes.spec.ts`, and the owner's look beside the preview.
6. On a fresh copy with the sample data, the Quotes section and the deal pages are full of realistic quotes: `test_sample_data.py`, and "the sample quotes" in `quotes.spec.ts`.

### Unit tests: backend (pytest)

| File | What it proves | Requirements |
|---|---|---|
| `test_quotes.py` | **Adding:** on an open deal only, refused on Won and Lost. The first save takes the next number with the prefix as it is, and an add that fails gives it back. The date is today and valid-until 30 days on, or the date sent. A valid-until date before the quote's date is refused beside the box. **Lines:** only active products, an archived one refused with Q11's words. The name taken from the product, whatever the request says. A kept line keeps its product and name. Another quote's line id refused. The quantity and price rules at and past each limit, 101 lines refused, and a subtotal past $1 trillion refused with B17's words. A NUL in a description refused. Made-up totals in the request ignored. **Tax and details:** a draft's tax and company details follow a change to the settings, and its Prepared for follows a change to the deal. After sending, or declining a draft, none of them change. **Statuses:** every move in Q6, and every move it doesn't allow refused with its words. A sent, accepted or declined quote refuses any change to its date and lines. Each of Q20's refusals leaves the quote a draft. An expired quote is still accepted. **Accepting:** the deal goes to Won by every line of S1, with the stage change put down to whoever accepted, and its value set to the subtotal in whole dollars, $48,000.50 giving $48,001. The deal's other sent quotes are declined and its drafts left. A closed deal refuses, a reopened won deal with an accepted quote refuses a second one, and two accepts under way at once give one accepted quote. The database refuses a second accepted quote on a deal. **Copying:** a new number, today's date, the same lines, an archived product's line included, and the original unchanged. **Field messages:** a bad quantity on the third line comes back as `lines.2.quantity` with B17's words, and a bad `valid_until` under its own name. **The rest:** `DELETE` gets a 405. The list narrowed by deal and by organization. Who added and last changed through every change in Q29, and a save that changes nothing leaves it alone | Q5 to Q29, B15 to B17, S1, U10 |
| `test_quote_pdf.py` | Read back with pypdf. A three-line quote's company details, Prepared for, lines, subtotal, tax and total, to the cent, matching its reply. A sent quote's company details unchanged after the settings change, and a draft's following them. "Draft" on a draft's PDF and on no other. A blank tax label shown as "Tax", and the rate as B7 has it. `<b>Rush</b>` and `**bold**` shown as typed, and a description's line breaks kept. 100 lines over several pages, the headings at the top of each and "Page 1 of 3" at each foot. The file's name and media type. A draft refused while no company name is saved. The paper colors in `pdf.py` match `--color-paper`, `--color-paper-ink`, `--color-paper-muted` and `--color-paper-band` in `styles.css`, and Sea Green matches `--color-sea-green` | Q30 to Q32, Q17, B7 |
| `test_rules.py` | A value passed to the stage change is set on the deal, and without one the value stays | S1 |
| `test_delete.py` | Quotes hold deals and nothing holds an organization. A deal with two quotes gets the 409 with "This deal has 2 quotes, so it can't be deleted." and `held_by` lists them. An organization with quotes on its deals still deletes, leaving the deals and quotes | D4, Q27 |
| `test_migrations.py` | The comparisons, foreign key indexes and the every-table checks now cover both tables. A `0006` database with records and a quote count, upgraded, keeps every row and the count. The Postgres SQL makes the cents columns `bigint`, the accepted-quote index partial, and turns on row-level security for both tables | Data model, Security |
| `test_sample_data.py` | On each seeding day, the 1st included: about 40 quotes from the sample products, most with three lines or more. Drafts and sent quotes on every deal in Proposal and Negotiation, at least two expired, one declined with a newer quote on its deal. Every deal won this month or in the two before has one accepted quote whose value is its own, accepted on its close date by the teammate who moved it to Won. Numbers from QT-0001 in date order, the next new quote carrying on after them, and each sent quote's details the sample company's | M3, M4, M8 |
| `test_cli.py` | The counts name quotes, a first seed gives about 40, and seed and empty wipe both tables and start the count again at 1 | C4 |
| `test_layout.py` | `quotes` is found among the areas, imports only what a later area may, and its routes start with `quotes` alone | Layout rules |
| `test_every_route.py` | Every quote route is found, so the security and bad-input checks reach it, and `DELETE` isn't among them | Security, U7 |

### Unit tests: frontend (Vitest)

| File | What it proves | Requirements |
|---|---|---|
| `quotes/status.test.ts` | A sent quote is Expired from the day after its date and Sent on the date itself. Drafts, accepted and declined quotes never expire. The figures count and add up each status, expired apart from sent. The accept message has each part only when it applies | Q7, Q22, Q34 |
| `quotes/QuoteDocument.test.tsx` | The company's details, Prepared for, the lines, the totals and the tax label as given, blank ones left out, "Tax" for a blank label. The Draft chip only on a draft. Text with `<b>` shown as typed. Only paper tokens in its classes | Q17, Q18, Q30 to Q32 |
| `quotes/QuoteForm.test.tsx` | Add product lists active products only, with their prices. A new line takes the product's name, description and price, with a quantity of 1. The preview's totals change as a quantity or price is typed, matching the shared cases. Each field's message beside its box, `1,000` read as a thousand, 101 lines refused before sending, and a 422 for `lines.2.quantity` beside that line | Q11 to Q15, Q19 |
| `quotes/pages/Quote.test.tsx` | Each status's buttons, Copy only on an open deal. A sent quote has no form. A new draft from `/quotes/new?deal=12` saves once and opens its page. Mark as sent asks first and saves a changed draft before sending. Accept's dialog names the deal, its value and the quote it will decline, and the message after. Decline asks first. A save refused because a teammate sent the quote keeps what was typed and shows the words. Download PDF saves a changed draft and then calls `download` with the number. A newer reply leaves a changed form alone and fills an unchanged one. Missing quotes and deals, and a closed deal's new draft | Q8, Q9, Q19 to Q25, Q28, Q30 |
| `quotes/pages/Quotes.test.tsx` | The columns, the default sort newest first, Number in the order taken past QT-9999, Status in Q33's order. The six figures and their values, used as a filter kept in the address and with the search. Each empty state. New quote's dialog lists open deals only, with no offer to add one | Q8, Q33 to Q35 |
| `quotes/panels.test.tsx` | A deal's panel lists its quotes with their chips and values and has New quote only when the deal is open, or Q8's line. An organization's lists the quotes on its deals with the deal's name. "No quotes yet." with none | Q36, Q37 |
| `crm/forms/forms.test.tsx`, `crm/Timeline.test.tsx`, `crm/pages/Deal.test.tsx` | Their delete dialogs unchanged, passing on the rebuilt `ConfirmDelete`, the held one included | D1, D4 |
| `lib/saveErrors.test.ts` | A line's field lands beside its box, and one the form doesn't have becomes a message | F2 |
| `App.test.tsx` | The Quotes section, its routes, and the panels on a deal's and an organization's page | N1, R7 |
| `layout.test.ts` | `quotes` is found among the areas and imports only what a later area may | Layout rules |

### End-to-end tests (Playwright Test)

| File and test | What it proves | Requirements |
|---|---|---|
| `quotes.spec.ts`: a quote with three lines | From a deal in Proposal, New quote, three products with one quantity and one price changed, Save quote. The form, the preview and the Quotes table show the same subtotal, tax and total to the cent, and so does the downloaded PDF's text, read with `pdfText` | Q8 to Q19, Q30, success criteria 2 and 5 |
| `quotes.spec.ts`: a sent quote can't be changed | Mark as sent, confirmed. The page shows no form, and a `PATCH` through the API gets the 409 and its words | Q20, Q21 |
| `quotes.spec.ts`: accepting wins the deal | Accept, confirmed, on a deal with another sent quote. The message, the deal at Won with the quote's value in whole dollars, its contact a customer, the other quote declined, and a stage-change entry on the deal's timeline naming who accepted | Q22, Q23, S1, S2, A7 |
| `quotes.spec.ts`: copying and declining | Copy to new draft opens a new number with the same lines. Decline on the old draft marks it declined | Q24, Q25 |
| `quotes.spec.ts`: the PDF downloads | Download PDF gives a file named after the number that starts with `%PDF-`, with the company's details, Prepared for and the lines in its text | Q30 to Q32 |
| `quotes.spec.ts`: the sample quotes | On a fresh copy, the Quotes section's figures and rows, a deal in Proposal with quotes in its panel, a won deal with its accepted quote, and an organization with quotes from more than one deal | M3, Q33 to Q37, success criterion 6 |
| `quotes.spec.ts`: the status filter | Choosing Expired shows only expired quotes, stays after a refresh, and works with the search | Q34, T4 |
| `quotes.spec.ts`: a deal with quotes can't be deleted | Delete on a deal with a quote shows "Renewal and upgrade can't be deleted", says the deal has a quote, and offers only Close | D4, Q27 |
| `start.spec.ts`, `quality.spec.ts`, `menu.spec.ts` | Quotes among the sections, no sideways scrolling on the quote pages at 1280 and 1440, no console errors through the quote pages and dialogs, a focus ring through the form, seven sections on one line at 1280, and every text on the quote pages meeting its contrast in both modes, with the preview staying in the paper colors | N1, Q2, Q3, L3, L5 |
| `stress.spec.ts` | At Q1's limits: the Quotes table opens in under a second, the 100-line draft's preview updates within 100ms of a keystroke, and its PDF downloads in under a second | Q1 |

### By hand

The agent, on a temporary database in Phase 4, in Chrome at 1440 by 900 and 1280 by 720, in light mode and dark mode:

- Make a quote on a sample deal, change a line, send it, accept it, and check the deal, its timeline, the Quotes section and the organization's panel.
- Download a PDF of a draft and of a sent quote, open each beside its preview, and check they look alike: the fonts, the colors, the Sea Green total, the Draft chip, and a quote long enough to run onto a second page.
- Change the company settings after sending, and check the sent quote's PDF and preview haven't changed while a draft's have.

The project owner, after the build:

- Looks at the quote pages and a PDF against the spec and the brand, and has the final say on how they look.
- Runs `npm start` against an empty Supabase database, which proves migration `0007` runs from empty on Postgres and the row-level security check passes. Then makes, sends, accepts and downloads a quote, and runs the updated clearing steps in `docs/STATUS.md`, which should leave no quotes and start their count again at 1.
