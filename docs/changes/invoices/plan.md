# Plan: invoices and payments

This plan turns the invoices intent and the spec, already updated on this branch, into build work: which files change, in what order, what could go wrong and how we'll know it works. IDs such as V11 and B21 are the spec's requirements, most of them in `docs/specs/invoices.md` and `docs/specs/settings.md`. The intent wins over the spec and the spec wins over this plan. If the build shows the spec is wrong, fix the spec in the same change and say so in `docs/STATUS.md`.

The plan ends with the build. ui-check, the review and `docs/IMPROVE.md` come after it.

## New dependencies, and the case for them

**ReportLab, for the PDF (runtime).** The PDF has to carry three fonts, cut down to the characters it uses, place text, blocks and an image exactly, run over several pages, and come out the same on any computer (V24 to V28). Writing a PDF by hand means font subsetting and image embedding, which `docs/TECH_STACK.md` says not to hand-roll. The choices:

| Library | Why or why not |
|---|---|
| ReportLab 5.1 | The most used Python PDF library, maintained for 25 years, under a BSD licence. Draws on a canvas at exact positions, embeds and subsets TTF fonts, and places PNG and JPEG images. Chosen |
| fpdf2 | Also able, but LGPL, and brings fontTools and defusedxml as well as Pillow |
| WeasyPrint | Turns HTML into PDF, but needs Pango from the system, which the intent rules out |
| xhtml2pdf | Built on ReportLab with HTML in front, which brings back the markup that V25 keeps out |

Checked on 2026-11-05 with `uv pip compile --only-binary :all:` for Python 3.12: ReportLab 5.1.0 resolves with Pillow 13.0.0 and charset-normalizer 3.5.2, all as wheels, on Linux x86_64, which is what Render's native Python runtime uses, and on macOS arm64 and Windows. Nothing compiles and nothing comes from the system.

**Pillow, for the logo (runtime).** ReportLab brings it already. The logo check (B21) imports it directly, so it's added as a direct dependency too, `uv add reportlab pillow`, rather than relying on ReportLab keeping it.

**pypdf, for the tests (dev only).** The PDF tests read the text back out of the file to check its figures against the API's, and a subset TTF font stores glyph numbers rather than letters, so the text needs a reader that follows the font's map back to letters. pypdf 6.21 is pure Python with no dependencies, under a BSD licence. `uv add --dev pypdf`.

**No new npm packages.** The preview is SVG drawn by React, the fonts are the ones the app already bundles, the color picker is the browser's own, and the charts use Recharts and `components/charts/`.

**Font files, not packages.** The PDF carries the app's three fonts as TTF files, which the npm packages don't hold (they hold web fonts). Static TTFs of Instrument Sans (Regular, SemiBold), Instrument Serif (Regular) and JetBrains Mono (Regular, Medium) go in `backend/accountable/invoices/fonts/`, with each family's OFL licence. They come from each family's own release: Google Fonts' repositories for Instrument Sans and Instrument Serif, and JetBrains' release for JetBrains Mono. Downloads go in a new empty folder of their own first and are checked before they're copied in. If a family publishes only a variable font, its static weights are made once with fontTools' instancer, run through `uvx`, which adds nothing to the project.

## Files that change

The change is large, so it's in six phases ([Order of work](#order-of-work)). One agent can build it in order. After Phase 1, the backend's Phases 2 and 3 and the frontend's Phases 4 and 5 meet only at what's below, so a second agent could take the frontend once Phase 1 is done.

The build also puts in the spec what this plan adds and the spec doesn't say yet: `invoices/fonts.py` and `invoices/characters.py` on the backend and `invoices/characters.ts` on the frontend, pypdf, nested field errors in `api.field_messages` and `lib/saveErrors.ts`, `fetchFile` in `lib/api.ts`, the 413's words, the every-route test's sample bodies, and the new test files in `testing.md`.

### What the two sides agree on

**An invoice in a list,** from `GET /api/invoices`, and the start of every invoice reply:

```json
{
  "id": 7,
  "number": "INV-0042",
  "shows_as": "overdue",
  "deal": { "id": 12, "name": "Annual support" },
  "organization": { "id": 3, "name": "Harbor & Pine" },
  "bill_to": "Harbor & Pine\nAttn: Sam Carter\nsam@harbor.example",
  "issue_date": "2026-09-01",
  "due_date": "2026-10-01",
  "total_cents": 1306500,
  "owed_cents": 500000
}
```

- `shows_as` is `draft`, `issued`, `part_paid`, `overdue`, `paid` or `void` (V3), worked out by the backend from its own today.
- A draft has `number`, `issue_date` and `due_date` null, and its `organization` is its deal's, or null. Its `total_cents` is worked out from its saved lines at the settings' rate as it is now. `owed_cents` is 0 for a draft and a void invoice.
- `?deal_id=` and `?organization_id=` narrow the list for a panel (V20, V21). The organization's list is the invoices issued to it and the drafts on its deals.

**One invoice,** from `GET /api/invoices/{id}`, adds:

```json
{
  "status": "issued",
  "days_late": 35,
  "deal_stage": "won",
  "company": { "name": "Plainsong Systems", "address": "48 Orchard Row…", "email": "…", "phone": "…" },
  "tax_label": "Sales tax",
  "tax_rate": "8.875",
  "lines": [
    { "id": 1, "product_id": 4, "name": "Annual support plan", "description": "Email and phone…", "quantity": 2, "unit_price_cents": 360000, "amount_cents": 720000 }
  ],
  "subtotal_cents": 1200000,
  "tax_cents": 106500,
  "paid_cents": 806500,
  "payments": [
    { "id": 3, "paid_on": "2026-09-20", "amount_cents": 806500, "method": "bank_transfer", "reference": "Wire 4471", "created_at": "2026-09-20T15:02:00Z", "created_by": { "id": "teammate-alex-rivera", "name": "Alex Rivera" } }
  ],
  "issued_by": { "id": "…", "name": "Dana Whitfield" },
  "voided_by": null,
  "voided_at": null,
  "created_by": { "…": "…" }, "updated_by": { "…": "…" }, "created_at": "…", "updated_at": "…"
}
```

- For a draft, `company`, `tax_label` and `tax_rate` are the settings as they are now, so the preview draws a draft from the reply and the page's edits alone. For an issued invoice they're the copies made at issue (V11).
- `tax_rate` is text, as the settings send it (B7). `days_late` is null unless overdue. `method` is `bank_transfer`, `card`, `check`, `cash` or `other`.
- The "Issued by" line takes its date from `issue_date`, so it needs no column of its own.

**Saving a draft,** `PATCH /api/invoices/{id}`, and **issuing** it, `POST /api/invoices/{id}/issue`, take the same body:

```json
{
  "bill_to": "Harbor & Pine\nAttn: Sam Carter",
  "lines": [
    { "id": 1, "product_id": 4, "description": "…", "quantity": 2, "unit_price_cents": 360000 },
    { "product_id": 9, "description": null, "quantity": 1, "unit_price_cents": 240000 }
  ]
}
```

- The lines are the whole list, in order. A line with an `id` of this invoice keeps the name it has. A line without one takes its product's name now, which is when it's first saved, and its product has to be active. Any `name`, `amount_cents` or total sent is ignored (V9).
- A refusal is a 422 with `{"detail": "Check the form.", "fields": {...}}`. A line's field is keyed by its place, such as `lines.2.quantity`, which is React Hook Form's own path for it. The draft-wide refusals in V10 come under `form`, such as `{"form": "This deal has no organization. Choose one on the deal before issuing."}`, and the company details' character refusal names its field in the words of V10.
- An invoice that isn't a draft gets a 409, "This invoice has been issued, so it can't be changed."

**Starting a draft,** `POST /api/invoices`, takes `{"deal_id": 12}` and replies with the new invoice. A deal that isn't won gets a 409, "Only a won deal can start an invoice."

**A payment,** `POST /api/invoices/{id}/payments`, takes `{"paid_on": "2026-09-20", "amount_cents": 806500, "method": "bank_transfer", "reference": null}` and replies with the whole invoice, as do void and deleting a payment.

**The Money section,** `GET /api/invoices/money`:

```json
{
  "owed": { "cents": 4825000, "count": 14 },
  "overdue": { "cents": 912000, "count": 5 },
  "groups": [
    { "key": "not_due", "cents": 3913000, "count": 9 },
    { "key": "1_30", "cents": 480000, "count": 2 },
    { "key": "31_60", "cents": 232000, "count": 1 },
    { "key": "61_90", "cents": 100000, "count": 1 },
    { "key": "over_90", "cents": 100000, "count": 1 }
  ],
  "payments": [{ "month": "2025-12", "label": "Dec", "cents": 1125000, "count": 3 }]
}
```

`payments` always has the 12 months from `months.last_months`, oldest first, with zeros where there were none.

**The company settings** add `"invoice_design": "banner"`, `"accent_color": "#0E6B6B"` and `"logo": {"media_type": "image/png", "width": 600, "height": 200}`, or `"logo": null`. `PATCH /api/settings` takes `invoice_design`, `accent_color`, and `logo` as the file's bytes in base64, or null to remove it. Leaving `logo` out keeps it. `GET /api/settings/logo` sends the bytes.

**Shared files,** read by both unit suites:

- `shared/accent-cases.json`: colors accepted, with how each is kept, such as `["#0e6b6b", "#0E6B6B"]`, and refused, with which message, `format` or `light`. It includes the edge of 4.5:1, with `#767676` at 4.54:1 accepted and `#777777` at 4.48:1 refused, and `#073B4C`, `#FFC145`, `#06D6A0`, `073B4C`, `#073B4`, `#GGGGGG` and blank.
- `shared/invoice-designs.json`: the page, 612 by 792 points, its margins, and for each design every block's place, size, font, size of type and color, with colors either fixed, such as the paper's ink `#1F2A30`, or `accent`, or `accent_tint` and a strength. A tint is worked out the same way on both sides, channel by channel as a whole number, from the strength in hundredths, so `#0E6B6B` at 10 is the same color in the preview and the PDF.
- `shared/invoice-fonts.json`: for each of the five font files, its units per em and every character's advance width, as whole font units. Made by `invoices/fonts.py` from the TTFs, never by hand. Also the characters invoices can show (V9): those every text font has, so a character is never shown in one design and refused in another.
- `shared/invoice-layout-cases.json`: invoices given to the layout, with what has to come out: the text of every line drawn and the page it lands on. It covers a short invoice in each design, a description that wraps, one word longer than its column, a Bill to of six lines, explicit line breaks, a run of spaces, a company address of many lines, an invoice of 100 lines over several pages with the headings repeated, totals that don't fit after the last line and move to a new page, each mark, and no logo.

**The layout,** made by `invoices/layout.py` and `invoices/layout.ts` from the same input, is a list of pages, each a list of items in points from the top left of the page: `text` (x, y, font, size, color, anchor `start` or `end`, the text), `block` (x, y, width, height, color, corner radius) and `logo` (x, y, width, height). The void mark across the page is a `text` with an angle. The preview draws the items as SVG and `pdf.py` draws them on a ReportLab canvas, turning y upside down. Neither decides where anything goes.

Text is measured from `invoice-fonts.json`, never from what the browser or ReportLab measures. Lines break greedily at spaces, a word wider than its column breaks between characters, explicit line breaks are kept, and spaces at the end of a line don't count towards its width. A row of the lines table stays on one page, and the totals stay together.

### Backend: new files

| File | What it holds |
|---|---|
| `backend/accountable/invoices/__init__.py` | Empty, as in the other areas |
| `backend/accountable/invoices/tables.py` | `invoices`, `invoice_lines` and `payments` from [backend.md](../../specs/backend.md#data-model), with `who.columns()` on `invoices`, `created_by` and `created_at` on `payments`, and `TABLE_OPTIONS`. `invoices.deal_id` and `invoices.organization_id` are foreign keys with no delete rule, so the database refuses a held delete too. `invoice_lines.invoice_id` deletes with the invoice. The unique index on `number`, and indexes on `due_date`, `paid_on` and every foreign key. Money columns are `BigInteger`. `RECORDS = (invoices, payments)`, and `HOLDS`, a `Hold` for each of the two links, both with the noun `invoice` |
| `backend/accountable/invoices/schemas.py` | `FIELD_MESSAGES`, every message in V8, V10 and V15. The field types: the Bill to, up to 6 lines and 500 characters. A description, up to 1,000. A quantity, from `company/tax.py`. A unit price, `api.Cents`. A payment's amount, more than 0. The method, one of five. A reference, up to 100. `DraftLine` and `Draft`, with up to 100 lines, `PaymentIn`, `NewInvoice`, and the replies above. A field that's required but left out is `\| MISSING` with its message added by the route, so a missing invoice is a 404 before any body check (Risks 9) |
| `backend/accountable/invoices/figures.py` | Pure functions, with today passed in: what an invoice shows as (V3), days late, what's owed, which group of How late it's in, and a draft's totals at a rate. No database |
| `backend/accountable/invoices/characters.py` | Which characters invoices can show, read from `shared/invoice-fonts.json`, and `unprintable(text)`, which gives the ones in a text they can't, each once, in order. A line break is fine. A tab or other control character counts as unprintable and is named in the message as "a tab" |
| `backend/accountable/invoices/routers/__init__.py` | Empty |
| `backend/accountable/invoices/routers/invoices.py` | `GET /invoices`, `POST /invoices`, `GET`, `PATCH` and `DELETE /invoices/{invoice_id}`, `POST /invoices/{invoice_id}/issue` and `/void`, and their queries. The list reads every invoice with its deal, organization and paid total in one query, grouped, and works out `shows_as` with `figures.py`. Saving and issuing follow the steps in [Backend rules](../../specs/backend.md#backend-rules), all inside one `db.writing()`. Issue takes today through `api.Today`, so tests can fix it |
| `backend/accountable/invoices/routers/payments.py` | `POST /invoices/{invoice_id}/payments` and `DELETE /invoices/{invoice_id}/payments/{payment_id}`. Reads the invoice and its payments and checks the amount against what's owed inside the payment's own `db.writing()` (V16) |
| `backend/accountable/invoices/routers/money.py` | `GET /invoices/money`: what's owed, overdue and in each group from one grouped query over issued invoices and their paid totals, and the payments by month from one grouped query on `paid_on`. Included in the area before `routers/invoices.py`, so `/invoices/money` is matched before `/invoices/{invoice_id}` (Risks 10) |
| `backend/accountable/invoices/routers/pdf.py` | `GET /invoices/{invoice_id}/pdf`. Reads the invoice and the settings with the logo, lays it out and draws it. A draft gets a 409. Replies `application/pdf` with `Content-Disposition: attachment; filename="INV-0042.pdf"`. The prefix has only letters, digits and hyphens (B4), so the name needs no escaping |
| `backend/accountable/invoices/layout.py` | Reads `shared/invoice-designs.json` and lays out an invoice in a design, as above. Takes the invoice as plain values, the accent color and the logo's size, so it knows nothing of the database or ReportLab |
| `backend/accountable/invoices/pdf.py` | Registers the five TTFs once per process, then draws a layout's pages on a ReportLab canvas: `drawString` and `drawRightString` for text, `roundRect` for blocks, `drawImage` for the logo, with alpha for the void mark. Never `Paragraph` or any other markup (V25). Sets the PDF's title to the number |
| `backend/accountable/invoices/fonts.py` | Reads the five TTFs with ReportLab's font reader and writes `shared/invoice-fonts.json`, through `uv run -m accountable.invoices.fonts`. `test_invoice_fonts.py` checks the file is what the fonts give |
| `backend/accountable/invoices/fonts/` | The five TTF files and the OFL licences |
| `backend/accountable/invoices/sample_data.py` | `fill(conn, today)`. Reads the won deals of the last 12 months from `crm.tables`, with their organizations and main contacts, the active products from `products.tables`, and the settings. Gives each deal one invoice of 1 to 4 lines from the sample products, the last line's price set so the subtotal is the deal's value. Issues them in date order with `take_number`, so INV-0001 is the oldest, and records payments, all as in [Sample data](#sample-data) below. Put down to the made-up teammates with `sample.put_down_to` |
| `backend/accountable/company/logo.py` | `check(data: bytes)`: opens the bytes with Pillow, checks the format is PNG or JPEG and the size within B21 from the header alone, before anything is decoded, then `verify()`s the file. Returns the media type, width and height, or raises `api.FieldError({"logo": ...})` with B21's message. Sets `Image.MAX_IMAGE_PIXELS` for the checks it makes, so Pillow's own guard can't be loosened by accident |
| `backend/accountable/company/sample-logo.png` | A made-up logo for Plainsong Systems, about 600 by 200 pixels, in Midnight and the sample teal, on a clear background, well under 1 MB. Drawn once with Pillow and Instrument Sans, then committed. The script isn't kept |
| `backend/accountable/migrations/versions/0007_invoices.py` | Adds `invoice_design` and `accent_color` to `company_settings`, with server defaults `classic` and `#073B4C`, so an existing database gets them (B13). Creates `company_logo`, with its `one_row` check, `invoices`, `invoice_lines` and `payments`, with their indexes. On Postgres, turns on row-level security for the four new tables. The downgrade drops them and the two columns |
| `shared/accent-cases.json`, `shared/invoice-designs.json`, `shared/invoice-fonts.json`, `shared/invoice-layout-cases.json` | As above |
| `backend/tests/test_invoices.py`, `test_invoice_figures.py`, `test_payments.py`, `test_money.py`, `test_invoice_layout.py`, `test_invoice_fonts.py`, `test_invoice_pdf.py`, `test_logo.py`, `test_api.py` | See [Proof](#proof) |

### Backend: existing files

| File | Change |
|---|---|
| `pyproject.toml`, `uv.lock` | `reportlab` and `pillow`, and `pypdf` in the dev group, through `uv add` |
| `backend/accountable/main.py` | An `Area` for invoices, with its routers, money's first, its `FIELD_MESSAGES` and its `HOLDS`. A middleware that refuses a body over 2 MB with a 413, `{"detail": "That's too big to send."}`, counting the bytes as they arrive, so a body with no `Content-Length` is caught too. It sits inside the token check and outside the JSON check |
| `backend/accountable/api.py` | `field_messages` keys a nested field by its whole place after `body`, such as `lines.2.quantity`, and looks its message up by the last part. Flat bodies get the same keys as before |
| `backend/accountable/cli.py` | Imports `invoices.tables` and `invoices.sample_data`. `RECORDS` gains invoices and payments, so seed and empty count them. `KEPT` gains `company_logo`, so empty leaves the logo. `fill_sample` calls `invoices.sample_data.fill` after the company's, since issuing reads the settings and takes numbers |
| `backend/accountable/company/tables.py` | The two new columns, and `company_logo` |
| `backend/accountable/company/schemas.py` | `DESIGNS`, the design's type, the accent color's check from WCAG's contrast ratio, kept as capitals, and the logo as base64 text, decoded with `validate=True`, so text that isn't base64 is refused with "Choose a PNG or JPEG image". Their messages in `FIELD_MESSAGES`. `SettingsUpdate` and `CompanySettings` gain the three fields |
| `backend/accountable/company/router.py` | `PATCH` checks a logo with `logo.check` and writes or deletes the `company_logo` row in the same transaction, which counts as a change (B9). `GET /settings/logo` sends the bytes with the type from the row and `X-Content-Type-Options: nosniff`, or a 404. Replies carry `logo` from the row's type, width and height, never its bytes |
| `backend/accountable/company/documents.py` | `current_logo(conn)`, the logo's bytes, type and size or None, for the PDF |
| `backend/accountable/company/sample_data.py` | The sample company gains the Banner design and `#0E6B6B`, and `fill` writes `sample-logo.png` as the logo, replacing any there |
| `backend/accountable/migrations/env.py` | Imports `invoices.tables` |
| `backend/tests/limits_data.py` | Adds 1,000 invoices with 3,000 lines and 1,500 payments to the Q1 fill, across every status, on its won deals |
| `backend/tests/test_migrations.py` | A database at `0006` with records, upgraded. Postgres SQL for the new tables. See [Proof](#proof) |
| `backend/tests/test_every_route.py` | `with_id` fills every placeholder in a path, not just the first, for the payment's delete. A sample body for each route whose body has required fields, used where the tests send `{"stage": "new"}` now, so they still reach the route. `test_the_routes_were_found` names the new routes and their body text fields. A body over 2 MB is refused on every write |
| `backend/tests/test_delete.py` | `test_no_area_holds_a_deal_or_an_organization_yet` becomes a check that invoices give their two holds, and new tests delete a deal and an organization that real invoices hold |
| `backend/tests/test_company_settings.py` | The design, accent color and logo through `PATCH`, the logo's route, and who changed them |
| `backend/tests/test_cli.py`, `test_sample_data.py`, `test_layout.py` | See [Proof](#proof) |

### Frontend: new files

| File | What it holds |
|---|---|
| `frontend/src/invoices/queries.ts` | The types above. `useInvoices(filter)`, `useInvoice(id)`, `useMoney()`, and through `useWrite`: `useStartInvoice`, `useSaveDraft`, `useIssue`, `useVoid`, `useDeleteDraft`, `useRecordPayment`, `useDeletePayment` |
| `frontend/src/invoices/status.ts` | Each `shows_as`'s label and chip tone, from the table in [visual-design.md](../../specs/visual-design.md#stage-chip-and-chart-colors), its place in the filter and the sort, and each method's label |
| `frontend/src/invoices/characters.ts` | As `characters.py`, from the same table |
| `frontend/src/invoices/layout.ts` | As `layout.py`, from the same JSON |
| `frontend/src/invoices/InvoicePreview.tsx` | Draws a layout's pages as SVG, one under another, scaled to its column. Text is SVG text with `font-kerning: none` and `font-variant-ligatures: none`, as ReportLab draws it, and never HTML. The logo is an `<image>` from an object URL. Exports `SampleInvoice`, the made-up invoice B19 shows, for `App.tsx` to hand the settings page |
| `frontend/src/invoices/DraftForm.tsx` | The draft's form: the Bill to, the lines as a field array, Add line with the product picker, the totals from `company/tax.ts`, and the checks in V8 and V9 before anything is sent |
| `frontend/src/invoices/PaymentForm.tsx` | Record payment's dialog, in `FormDialog`, with the checks in V15 |
| `frontend/src/invoices/panels.tsx` | `DealInvoices` and `OrganizationInvoices`, each a `RecordPanel` (V20, V21), and the New invoice button they and the table share |
| `frontend/src/invoices/MoneySection.tsx` | The Money section, a `DashboardSection` (V29 to V31) |
| `frontend/src/invoices/charts/HowLate.tsx`, `PaymentsChart.tsx` | The five bars, and the 12 months of payments in the style of the deals-won chart, from `components/charts/`. The CRM's charts stay in `crm/charts/`, which a later area can't import |
| `frontend/src/invoices/pages/Invoices.tsx` | The table, its filter in the address as Contacts' is (T4, T6), its empty state, and New invoice with its won-deal picker |
| `frontend/src/invoices/pages/Invoice.tsx` | The invoice page: `PageHeader` with its buttons, the draft's form or the issued details and payments, and the preview. Asks before leaving with changes, with React Router's `useBlocker` and the browser's `beforeunload`. Reads the invoice again when `useToday` changes |
| `frontend/src/company/accent.ts` | The accent color's check, as `company/schemas.py` makes it |
| `frontend/src/company/DocumentsPanel.tsx` | The Documents panel: the designs as a radio group, the accent color's swatch and box, the logo with Choose logo and Remove logo, and the preview it's given |
| Tests beside each | See [Proof](#proof) |

### Frontend: existing files

| File | Change |
|---|---|
| `frontend/src/App.tsx` | The Invoices section, with lucide-react's `ReceiptText`. `/invoices` and `/invoices/:id`. `DealInvoices` and `OrganizationInvoices` in the panel lists, `MoneySection` in the dashboard's sections, and `SampleInvoice` for the settings page |
| `frontend/src/lib/api.ts` | `fetchFile(path)`, which fetches a file with the token and gives a `Blob`, with `api()`'s errors. `download()` is built on it |
| `frontend/src/lib/saveErrors.ts` | Puts a nested field's error, such as `lines.2.quantity`, beside that field, and `form` at the top of the form |
| `frontend/src/company/settings.ts` | The three new settings in the type, the form's values and its checks. The logo in the form is what's saved, a new file or removed, and `toRequest` sends it only when it changed |
| `frontend/src/company/SettingsPage.tsx` | Save settings moves to the header, at the right. The Documents panel goes below the others, given the preview `App.tsx` hands the page |
| `frontend/src/App.test.tsx`, `layout.test.ts`, `lib/api.test.ts`, `lib/saveErrors.test.ts`, `company/settings.test.ts`, `company/SettingsPage.test.tsx` | See [Proof](#proof) |

### End-to-end tests

| File | Change |
|---|---|
| `e2e/invoices.spec.ts` | New. See [Proof](#proof) |
| `e2e/files/logo.png`, `e2e/files/not-a-picture.png` | A small real PNG, and a text file with a `.png` name, for the logo tests |
| `e2e/helpers.ts` | `startInvoice`, `saveDraft` and `issueInvoice` through the API, for tests that need an issued invoice |
| `e2e/settings.spec.ts` | The Documents panel. Save settings at the top |
| `e2e/dashboard.spec.ts` | The Money section |
| `e2e/problem.spec.ts` | What customers owe is on the dashboard (H9) |
| `e2e/records.spec.ts` | A deal and an organization held by invoices can't be deleted |
| `e2e/quality.spec.ts`, `e2e/menu.spec.ts` | `/invoices` and an invoice's page, draft and issued, join the sideways-scroll, console, keyboard and contrast checks |
| `e2e/stress.spec.ts` | Invoices opens in under a second, the Money section's data in under 200ms, and a PDF downloads in under a second |

### Docs and the harness

| File | Change |
|---|---|
| `docs/STATUS.md` | The clearing steps truncate `payments`, `invoice_lines` and `invoices` with the rest, delete the `company_logo` row, and set `invoice_design` and `accent_color` back with `DEFAULT`, still in one transaction. The run instructions mention Invoices, the Money section and the Documents panel. The design entry becomes a build entry |
| `.claude/agents/ui-check.md` | Step 1 also reads `invoices.md`, for the Invoices table, the invoice page and the Money section |
| `docs/spec.md` and `docs/specs/` | What this plan adds, listed above, and anything the build shows to be wrong |

### Sample data

`invoices/sample_data.py` works from the CRM's 32 won deals as the database has them, never from `crm/sample_data.py`, which a later area can't import. With 30 days' terms, it aims for:

- **Drafts:** the wins of this month that closed in the last few days, at least 2, even on the 1st.
- **Void:** one invoice from about four months ago, voided, and a second on the same deal that's paid.
- **Overdue:** at least one in each group, chosen from older wins left unpaid or part paid: due 10, 45, 75 and 120 days ago, and more if the months allow.
- **Part paid and not yet due:** about 4, from last month's wins.
- **Issued and not yet due:** the rest of this month's and last month's.
- **Paid:** every other one, in one or two payments, 5 to 25 days after issue.
- **A payment in every month:** the oldest month's invoice is paid on its issue date, and one invoice is paid today, so each of the 12 months has a payment, this one included even on the 1st.

Each invoice is issued on its deal's close date, so on the 1st, this month's drafts and today's payment still fall in this month. Methods rotate through bank transfer, card and check, and about half have a reference such as `Wire 4471` or `Check 1182`.

## Order of work

Six phases. Each ends with `npm run check:quick` passing, and Phase 6 ends with `npm run check`. Every run of the app uses a temporary database: `ACCOUNTABLE_DB=<scratchpad>/accountable.db npm run dev`.

### Phase 1: invoices and payments on the backend

1. `uv add reportlab pillow` and `uv add --dev pypdf`, and check `npm run check:quick` still passes.
2. Write `invoices/tables.py`, the new columns and `company_logo` in `company/tables.py`, and migration `0007`, and import the tables in `migrations/env.py`. Get `test_migrations.py` passing, offline Postgres SQL included, before going further.
3. Write `invoices/figures.py` and `test_invoice_figures.py`.
4. Change `api.field_messages` for nested fields, with its test.
5. Write `invoices/schemas.py` and the `invoices`, `payments` and `money` routers, without the character check, and add the area to `main.py`. Add the body limit.
6. Write `test_invoices.py`, `test_payments.py` and `test_money.py`, and change `test_every_route.py` and `test_delete.py`.

### Phase 2: how invoices look, on the backend

1. Fetch the fonts into a folder of their own, check them, copy the five TTFs and the licences into `invoices/fonts/`. Write `invoices/fonts.py`, run it to make `shared/invoice-fonts.json`, and write `test_invoice_fonts.py`.
2. Write `invoices/characters.py`, and add the check to saving and issuing a draft, and to issuing for the company's details (V9, V10), with tests in `test_invoices.py`.
3. Write `shared/accent-cases.json`, then the design, accent color and logo in `company/schemas.py` and `company/router.py`, `company/logo.py` and `current_logo`, with `test_logo.py` and the additions to `test_company_settings.py`.
4. Write `shared/invoice-designs.json` and `invoices/layout.py`, then `shared/invoice-layout-cases.json` and `test_invoice_layout.py`. Draw each design on paper first, as a sketch, so the JSON describes a page someone has looked at.
5. Write `invoices/pdf.py` and the `pdf` router, and `test_invoice_pdf.py`. Open a PDF of each design and look at it.

### Phase 3: sample data

1. Draw `company/sample-logo.png` and check it passes `logo.check`. Add the design, accent color and logo to `company/sample_data.py`.
2. Write `invoices/sample_data.py`, and change `cli.py`: `RECORDS`, `KEPT` and `fill_sample`.
3. Add the invoices to `test_sample_data.py` and `test_cli.py`, and to `limits_data.py`.

### Phase 4: the preview and the Documents panel

1. Add `fetchFile` to `lib/api.ts` and nested fields to `lib/saveErrors.ts`, with their tests.
2. Write `invoices/characters.ts`, `invoices/layout.ts` and `layout.test.ts`, running the shared cases, then `InvoicePreview.tsx` and its test.
3. Write `company/accent.ts` and its test, add the new settings to `company/settings.ts`, and write `DocumentsPanel.tsx`. Move Save settings and add the panel in `SettingsPage.tsx`, with the preview as a prop. Hand it `SampleInvoice` in `App.tsx`.

### Phase 5: invoices on the frontend

1. Write `invoices/queries.ts` and `invoices/status.ts`.
2. Write `pages/Invoices.tsx` and its test.
3. Write `DraftForm.tsx`, `PaymentForm.tsx` and `pages/Invoice.tsx`, with their tests.
4. Write `panels.tsx`, `MoneySection.tsx` and the two charts, with their tests.
5. Add the section, the routes, the panels and the dashboard section to `App.tsx`, with `App.test.tsx` and `layout.test.ts`.

### Phase 6: end to end, and finishing

1. Write `e2e/invoices.spec.ts`, the files in `e2e/files/` and the helpers, and change the other specs listed above. Run each file with `npm run e2e -- <file>` as it's written.
2. Start the app on a temporary database and go through the agent's checks under [By hand](#by-hand). Fix what's off. Stop the server by its process ID, and check ports 5173 and 8765 are free.
3. Update the clearing steps and the run instructions, and add the build entry, in `docs/STATUS.md`. Add `invoices.md` to `.claude/agents/ui-check.md`.
4. Put in the spec what this plan adds, and fix any part the build showed to be wrong.
5. Run `npm run check`, in the background or with the longest timeout, until it passes.
6. Hand over to the project owner for the shared app's checks under [By hand](#by-hand).

## Risks

Most damaging first.

1. **The migration changes real databases, and nothing takes it back.** `0007` runs on whatever database the app starts on, and once a database is at `0007`, `main`'s code won't start on it until this branch merges. It only adds tables and two columns with defaults, and the upgrade test proves that on a `0006` database with records in it. No agent starts the app on `data/accountable.db`: every run uses a temporary database. If the owner wants to try the branch on their own data, they copy the file first. All phases.
2. **Quotes and bills are being built at the same time.** Each branch will add a migration after `0006`, so whichever merges second renames its own and runs the migration tests again. `test_the_migrations_have_one_head` fails `npm test` if that's missed. No database that lasts may run a revision that later gets renumbered. The merges will also have to settle the order of sections in the top bar, the requirement letters, `main.py`'s list of areas, the Money section, which bills may want to add to, the Documents settings in `company/`, which quotes may want too, and the spec's summary. The quotes branch may also make PDFs: the prepare change left PDFs with each feature, to be brought together after the merges. All phases, and the merges.
3. **The PDF doesn't look like its preview (criterion 7).** The two are drawn by different programs, so anything one decides on its own can drift. The layout decides every place on both sides from one JSON and one table of widths. The shared cases check the two layouts give the same lines on the same pages. The preview turns off kerning and ligatures, which ReportLab doesn't use. The browser's fonts are the variable Fontsource fonts and the PDF's are static TTFs, so a glyph may differ by a fraction of a point. That only nudges text inside its line, because neither side measures with them. What's left is the by-hand comparison of each design. If the two still look different in a way that matters, the fallback is to draw the preview from the PDF's own layout as the backend gives it, at the cost of a trip per pause in typing. Phases 2, 4 and 6.
4. **Invoice numbers with a gap or a repeat (criterion 6).** A number is taken only inside the issue's own transaction, with `take_number` under the write lock, so a failure later in that transaction gives it back. Only drafts can be deleted, and drafts have no number. The test issues 20 drafts from 20 threads at once and checks the numbers run from 1 to 20 with none missing. Phase 1.
5. **An issued invoice changes (criterion 3).** Each write route reads the status inside its own transaction before changing anything. A test sends every write route an issued invoice and checks each is refused with nothing changed, and a change to the settings or a product after issue leaves the invoice's reply and its PDF as they were. Phase 1.
6. **Payments that add up to more than the total (criterion 4).** The check reads what's owed inside the payment's transaction, under the write lock. A test sends two payments from two threads, each under what's owed and together over it, and checks one is refused. Phase 1.
7. **A logo that's a weapon.** A 1 MB PNG can unpack into an image of billions of pixels, enough to use up the 512 MB of Render's free plan. `logo.check` reads the size from the header and refuses anything over 2,000 pixels a side before Pillow decodes it, then `verify()`s it, and a test sends a small PNG that claims 20,000 by 20,000. An SVG, a GIF, a text file named `.png` and bytes that aren't base64 are refused. The route sends the logo with the type the check found and `nosniff`. The PDF draws the logo from the stored bytes, which already passed the check. Phase 2.
8. **Typed markup reaching the PDF (V25).** ReportLab's `Paragraph` reads markup, so `pdf.py` never uses it. A test puts `<b>Acme</b> & Co` and `<font color="red">x</font>` in the Bill to and a description, reads the PDF's text back, and finds them exactly as typed. The preview draws SVG text through React, which never reads it as markup. Phases 2 and 4.
9. **The every-route test can't reach the new routes.** It puts an id into the first placeholder only, and the payment's delete has two. It also sends `{"stage": "new"}` to every route with an id and expects a 404 for a missing record, but a body with a required field left out gets a 422 first. `with_id` fills every placeholder, and the test gets a sample body for each route that needs one, rather than the routes being loosened to suit it. Phase 1.
10. **`/invoices/money` read as an invoice's id.** FastAPI matches routes in the order they're added, and `money` isn't a number, so after `/invoices/{invoice_id}` it would be a 422. The money router is added first, and `test_money.py` reads it through the app. Phase 1.
11. **Overdue on the wrong day.** The backend's today comes from `TZ`, and the browser's from the device. A page open overnight would keep yesterday's statuses, so the invoice pages and the Money section read again when `useToday` changes, as the dashboard does. The figures tests fix today, and test the due date, the day after, and each group's edges. Phases 1 and 5.
12. **Field errors on the lines land nowhere.** `api.field_messages` keys every field by its second place, so every line's error would say `lines`. It now keeps the whole place, and `lib/saveErrors.ts` sets nested fields. Their tests show a flat body gets the same keys as before. Phases 1 and 4.
13. **Unit tests take over a second.** The PDF tests load fonts and subset them, the issue test runs 20 threads, and the 100-line case lays out several pages. Fonts are registered once per process. Each test makes one PDF, the 100-line PDF is made once for the tests that read it, and the slow-test list at the end of `npm test` is read after each phase. The frontend's preview tests use small invoices, and the 100-line case runs on `layout.ts` alone, without drawing. Phases 2 to 5.
14. **Sample data that doesn't fill every part (criterion 9).** It hangs off the CRM's won deals and today's date. The test seeds on several days, the 1st of a month among them, and checks each status, each group of How late, a payment in each of the 12 months, the drafts on won deals, and each invoice's subtotal against its deal's value. Phase 3.
15. **The Money section or the Invoices table is slow at the limits.** Both come from grouped queries, never one per invoice, and the stress run fills 1,000 invoices and 1,500 payments and times them. Phases 1 and 6.
16. **The 2 MB limit breaks something that worked.** The largest body the app sends today is a few kilobytes. The limit counts bytes as they arrive, so it works without `Content-Length` too, and a test sends a body just under it and one just over it to a write route. Phase 1.
17. **The logo kept or lost by the wrong command.** Empty wipes every table not in `KEPT`, so without `company_logo` there, `npm run empty` would delete it. `test_cli.py` checks empty leaves it and seed puts the sample one back. The clearing steps delete it on Supabase, which no test can run, so the owner runs them by hand. Phases 3 and 6.
18. **Characters the fonts can't draw.** The allowed set is the characters every text font has, so a design can't print a character another design accepted. The check runs on the Bill to, descriptions and line names on every save, and on the company's details at issue. A tab is named "a tab", so the message doesn't show an invisible character in quotes. Phase 2.
19. **End-to-end tests need an overdue invoice.** Issuing always uses today, so no test can make one through the API. The tests that need one use the sample data, put back before each, and find their invoice by its status rather than by its number. Every step waits for the exact thing it needs, such as the reply to the issue or the download, never for the network to go quiet. Phase 6.
20. **The settings page changes for its existing tests.** Save settings moves to the header and the page now scrolls. `settings.spec.ts` checks the button by its role, not its place, and its check at 1280 by 720 still finds it in the window. Phases 4 and 6.
21. **Coverage drops under 80%.** This is the largest change yet. Every new module has its own test file, and coverage is read at the end of each phase rather than at the end. Phases 1 to 5.

## Proof

`npm run check` runs everything below apart from the by-hand checks, and fails if anything fails. The existing tests must still pass, with only the changes listed in [Files that change](#files-that-change).

The intent's success criteria:

1. `npm run check` passes: at the end of Phase 6.
2. An invoice with three lines adds up exactly, tax included, in the app and on the PDF: the shared cases in `test_tax.py` and `tax.test.ts`, which already cover half cents, three-line invoices in `test_invoices.py` and `test_invoice_pdf.py`, the draft's figures in `Invoice.test.tsx`, and the first test in `invoices.spec.ts`, which reads the figures on the page.
3. An issued invoice can't be changed, through the page or the API, and its number never changes: `test_invoices.py`, `Invoice.test.tsx` and "an issued invoice can't be changed" in `invoices.spec.ts`.
4. Payments bring the balance to zero and the invoice becomes paid, and a payment for more than the balance is refused: `test_payments.py`, `Invoice.test.tsx` and the first test in `invoices.spec.ts`.
5. An issued invoice past its due date shows as overdue on its page, in the list and on the dashboard: `test_invoice_figures.py`, `test_money.py`, and "overdue shows everywhere" in `invoices.spec.ts`.
6. Invoice numbers have no gaps or repeats, even when two are issued at the same moment: the 20-thread test in `test_invoices.py`.
7. Each design, with any accepted accent color and a logo, gives a PDF that looks like its preview: the shared layout cases on both sides, `test_invoice_pdf.py`, and the by-hand comparison.
8. A file that isn't a PNG or JPEG is refused as a logo, even when renamed to `.png`: `test_logo.py` and the logo test in `settings.spec.ts`.
9. A fresh copy with the sample data has full Invoices, deal pages and Money section: `test_sample_data.py` and "the sample data fills every part" in `invoices.spec.ts`.

### Unit tests: backend (pytest)

| File | What it proves | Requirements |
|---|---|---|
| `test_invoices.py` | A draft starts on a won deal only, with the Bill to filled in from its organization and main contact and blank parts left out. Saving: lines take their product's name, price and description, a saved line keeps its name after the product is renamed, an archived product can't start a line, each rule in V8 at and past its limit with its message, a nested error keyed `lines.2.quantity`, amounts and totals sent ignored, an emoji, a Chinese character, an Arabic one and a tab refused in the Bill to, a description and a line's name while accented letters, € and © are kept. Issuing: each refusal in V10, including a character the fonts lack in each of the company's five details, naming the field. The number, dates, organization and copies in V11 with today fixed, the prefix as the settings have it, and a failed issue taking no number. 20 drafts issued from 20 threads get INV-0001 to INV-0020. Every write to an issued invoice, and its delete, refused with a 409 and nothing changed. A change to the settings, the tax rate or a product after issue leaves its reply as it was. A draft saved after a teammate issued it gets the 409. Void: a 409 with payments, and an issued one voided keeps its number and owes nothing. The list's filters by deal and organization, drafts on an organization's deals included, and an issued invoice staying with its organization after the deal's changes. Who added, changed, issued and voided each | V2 to V14, V19 to V22, B15, B16, U7, U10 |
| `test_invoice_figures.py` | With today fixed: each of the six in V3, part paid and overdue together showing Overdue, due today not overdue, due yesterday 1 day late, and days late of 0, 1, 30, 31, 60, 61, 90 and 91 in the right groups | V3, V29, V31 |
| `test_payments.py` | Each rule in V15 with its message: today and the issue date allowed, tomorrow and the day before issue refused, $0.00 and a cent over what's owed refused. Paying in full makes it Paid, and paying in two parts too. Two payments from two threads that together overpay: one refused. A payment on a draft or a void invoice refused. Deleting a payment puts what's owed back up and turns Paid back to Part paid. Who recorded each | V15 to V18 |
| `test_money.py` | Against a small dataset with known answers and today fixed: drafts and void invoices left out, part paid counted by what's owed, each group's edges, payments by month across the turn of a year with zeros for empty months, an empty database with zeros everywhere, and `/invoices/money` reached as itself, not as an id | V29 to V31 |
| `test_invoice_layout.py` | Every case in `shared/invoice-layout-cases.json` gives its lines on its pages. Every item stays inside the page's margins, and the void mark is in every page. Each design places the logo inside 2 by 0.75 inches keeping its shape, and leaves its space out with no logo | V24, V26 to V28 |
| `test_invoice_fonts.py` | `shared/invoice-fonts.json` is exactly what `fonts.py` makes from the TTFs, so neither can change alone. The characters invoices can show include A to Z, accented letters, digits, $, € and ©, and not an emoji, 漢 or a tab | V9, V28 |
| `test_invoice_pdf.py` | For each design, with a logo and without: the file is a PDF of the right number of pages, its text, read back with pypdf, has the number, the Bill to, each line's name, amount and the totals exactly as the API gives them, for an invoice of three lines whose tax has a half cent. `<b>Acme</b> & Co` and a `<font>` tag come back as typed. PAID, OVERDUE and VOID are on the pages they should be. The 100-line invoice has "page 2 of" and its headings on every page. The fonts are embedded. A draft's PDF gets a 409, and the reply is named after the number | V24 to V28 |
| `test_logo.py` | A PNG and a JPEG kept, with the type, width and height Pillow found. Refused with B21's messages: a text file named `logo.png`, an SVG, a GIF, a WebP, a file of 1 MB and a byte, a PNG 2,001 pixels wide, a small PNG whose header claims 20,000 by 20,000, a truncated PNG and text that isn't base64 | B21, Security |
| `test_company_settings.py` | The design, accent color and logo saved through `PATCH` and read back. The accent cases in `shared/accent-cases.json`, kept as capitals. Leaving `logo` out keeps it, null removes it. Saving or removing the logo sets who last changed the settings. `GET /settings/logo` sends the bytes with their type and `nosniff`, and a 404 with none. An existing database's defaults are Classic, `#073B4C` and no logo | B13, B18 to B22, B9 |
| `test_migrations.py` | The comparisons cover the new tables and columns. A `0006` database with records, upgraded, keeps every row, has the new columns at their defaults and empty new tables. The Postgres SQL makes the money columns `bigint`, keeps the new defaults in the table, and turns on row-level security for the four new tables. One head | B13, Data model, Security |
| `test_cli.py` | Seed and empty count invoices and payments in their question. Empty leaves the logo and the design. Seed puts the sample logo, design and accent color back, and starts the invoice count again at 1 | C4, B12 |
| `test_sample_data.py` | Seeded on several days, the 1st of a month among them: M3's invoices and payments rows, each status, each group of How late, a payment in each of the 12 months, drafts only on this month's wins, each invoice's subtotal its deal's value and its figures adding up, the numbers in issue order, and the sample logo passing `logo.check` | M3, M7, V29, B12 |
| `test_every_route.py` | The new routes are found, with their body text fields, and so get every check: no token, a bad host, an id that can't be a record, the largest id missing, text the database can't store, and a body a website could send unasked. A body over 2 MB gets a 413 on a write, and one just under doesn't | Security, U7 |
| `test_delete.py` | Invoices give two holds. A deal with only a draft can't be deleted, nor an organization with an issued invoice, each with the words in D4, and `delete-impact` lists them | D4, V21 |
| `test_layout.py` | `invoices/` imports only `crm/tables.py`, `products/tables.py` and `company/`, and `company/` never imports `invoices/` | Layout rules |
| `test_api.py`, new | A nested field is keyed by its whole place and gets its message by its last part, and a flat body's keys are unchanged | V8, F2 |

### Unit tests: frontend (Vitest)

| File | What it proves | Requirements |
|---|---|---|
| `invoices/layout.test.ts` | Every case in `shared/invoice-layout-cases.json` gives the same lines on the same pages as the backend. `characters.ts` allows and refuses what `characters.py` does | V9, V24, V26 |
| `invoices/InvoicePreview.test.tsx` | Each design draws its accent color and logo. Each mark shows as V27 says, DRAFT on a draft. Markup typed into the Bill to shows as text, with no element made from it | V19, V25, V27, V28 |
| `invoices/pages/Invoices.test.tsx` | The columns, the filter with its counts and the filter in the address, Overdue's chip, a draft's "Draft" and its deal's organization, the sort by issue order and by status, the empty state, and New invoice's picker listing won deals only and opening the new draft | V4, V22, V23, T4, T6, T7 |
| `invoices/pages/Invoice.test.tsx` | A draft: the Bill to and lines, figures that change as you type, from the totals cases, Add line offering active products only, each message in V8 and V9 before anything is sent, a server error beside `lines.2.quantity`, Save draft sending once however quickly it's pressed, leaving with changes asking first and leaving without them not, Issue invoice asking and then showing the number, each refusal in V10 at the top, and Delete draft asking. An issued invoice: no way to edit it, the bar, paid and owed, days late, Record payment with each message in V15, deleting a payment asking first, Void offered only with no payments, Download PDF fetching the file under its number, and a page whose invoice no longer exists | V4 to V19, V24, N4 |
| `invoices/panels.test.tsx` | A deal's panel lists its invoices, has New invoice on a won deal only, and says which empty message fits. An organization's panel shows each invoice's deal | V20, V21 |
| `invoices/MoneySection.test.tsx` | The two figures with their counts, Overdue linking to Invoices showing Overdue, the five groups, the 12 months with "so far", each empty state, and the section reading again when the day changes | V29 to V31 |
| `company/accent.test.ts` | Every case in `shared/accent-cases.json` gets the same verdict and message as on the backend | B20 |
| `company/DocumentsPanel.test.tsx` | Choosing each design with the arrow keys, an accent color too light refused beside its box, choosing a logo shows it at once, a file over 1 MB or not ending in `.png`, `.jpg` or `.jpeg` refused before sending, Remove logo, and the preview changing before anything is saved | B18 to B21 |
| `company/SettingsPage.test.tsx` | Save settings at the top sends the design, accent color and new logo with the rest, sends no logo when it hasn't changed, and puts B21's message from the backend beside Logo | B8, B18, B21 |
| `company/settings.test.ts` | `toRequest` with each state of the logo | B18 |
| `lib/saveErrors.test.ts` | A nested field's error lands beside it, and `form` at the top | F2 |
| `lib/api.test.ts` | `fetchFile` sends the token and gives the file, with `api()`'s errors, and `download()` still saves under the name given | V24 |
| `App.test.tsx` | Invoices is in the top bar, `/invoices` and `/invoices/:id` open, the panels are on a deal's and an organization's page, and the Money section is on the dashboard | N1, V1, R7, H10 |
| `layout.test.ts` | `invoices/` imports only what a later area may, and `company/` never imports `invoices/` | Layout rules |

### End-to-end tests (Playwright Test)

Like every test, each one fails on a console error it didn't expect and on any request outside the computer. Tests that change the settings or need the sample data put it back first.

| Test | What it proves | Requirements |
|---|---|---|
| `invoices.spec.ts`: a won deal's invoice, from draft to paid | Made through the API: a won deal and three products. On the deal's page, New invoice opens a draft with its Bill to filled in. Add three lines, change a quantity and a price, and the page shows the subtotal, the tax with its half cent rounded up and the total, worked out by hand in the test. Save draft waits for its reply. Issue invoice, answered yes, waits for its reply and shows INV- and four figures and the due date 30 days on. Download PDF gives `INV-….pdf`, starting `%PDF`. A payment of more than what's owed is refused beside Amount. A part payment shows Part paid and the bar. The rest shows Paid | V4 to V8, V10, V11, V15 to V19, V24, B16 |
| An issued invoice can't be changed | Its page has no form, no Save draft and no Issue invoice. `PATCH` and `DELETE` through the API get the 409. Changing the invoice prefix in the settings leaves its number as it was | V12, V11 |
| Overdue shows everywhere | With the sample data, the table's Overdue filter lists invoices. The first opens with its Overdue chip, days late and OVERDUE on the preview. The dashboard's Overdue figure equals what those invoices owe, as the API lists them | V3, V22, V27, V29 |
| Leaving a draft asks first | With a change not saved, following a link asks, Stay keeps the change, and Leave goes. With nothing changed, it doesn't ask | V8 |
| Characters the fonts lack | An emoji in the Bill to shows its message and sends nothing. With `漢` in the company's address, Issue invoice is refused naming the address in Company settings | V9, V10 |
| Void, and delete a payment | An issued invoice with no payments is voided, keeps its number and shows VOID. Once one has a payment, Void isn't offered. Deleting that payment puts what's owed back | V14, V17 |
| The sample data fills every part | On a fresh seed: every filter has rows, a won deal's panel lists its invoice, and the Money section's figures, five groups and 12 bars are all above zero | V20, V22, V29, M3 |
| `records.spec.ts`: held records | Deleting a deal with a draft, or an organization with an issued invoice, shows the held dialog with only Close | D4, V21 |
| `settings.spec.ts`: Documents | Choosing Ledger and a valid accent color changes the preview before saving. A color too light shows its message. `e2e/files/logo.png` is chosen and saved, and after a reload the logo shows in the panel and on an invoice's preview. `e2e/files/not-a-picture.png` gets "Choose a PNG or JPEG image" from the backend, and nothing changes. At 1280 by 720, Save settings is in the window | B18 to B22, criterion 8 |
| `dashboard.spec.ts`: the Money section | Below the dashboard's own part, with the sample data: Owed to us equals what the API's list owes, and an emptied database shows each empty state | V29, V30, H10 |
| `problem.spec.ts` | What customers owe and what's overdue are on the dashboard, and who has paid is two clicks away | H9 |
| `quality.spec.ts`, `menu.spec.ts` | `/invoices` and an invoice's page, draft and issued, don't scroll sideways at either size, log no console errors, meet the contrast checks in both modes, and Tab reaches every box and button of the draft's form in order, each with a focus ring | N3, Q2, Q3, L5 |
| `stress.spec.ts` | At the Q1 limits: Invoices opens in under a second, the Money section's data arrives in under 200ms, and a PDF downloads in under a second, each the median of five | Q1 |

### By hand

- **The agent, on a temporary database:** the Invoices table, a draft's page, an issued, part-paid, overdue, paid and void invoice, the deal and organization panels, the Money section and the Documents panel, in Chrome at 1440 by 900 and 1280 by 720, in light and dark mode. For each of the three designs, with the sample logo and with a dark and a light accepted accent color, it downloads the PDF and compares it with the preview side by side: the same lines on the same pages, the same marks, the logo in the same place. It prints one of each to PDF in black and white to check it still reads. Then it stops the server by its process ID and checks the ports are free.
- **The project owner, on the shared app:** the agent never runs `npm start` or opens `.env`. If the owner chooses to, they run `npm start` against the team's Supabase database, which runs migration `0007` on it, as the next deploy would. Then they take an invoice from draft to paid with a logo, download its PDF, and see it as a second teammate. On a Supabase project that still has the sample data, they run the new clearing steps and check the invoices, payments and logo are gone and the settings are at their defaults. With the owner's go-ahead, the agent then uses the Supabase MCP server to confirm row-level security is on for the four new tables and to run the security advisors, reporting only.
