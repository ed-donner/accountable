# Independent review: invoices

Reviewed on 2026-11-05 against `main`, following `docs/REVIEW.md`. Style was excluded.

Scope: `git diff main...HEAD`, with branch HEAD `ca5db2472d441d10691df429432f24160da7f1f9`, main `685335f7826281285af92c218ea6b0a662941469`, and merge base `5e5035db9b16256ac1be07d68d4699f92da63587`. Checks ran on the branch, not a merged tree.

Seven Important findings need fixing before merge. No additional findings arose from the security, spec-description or non-style standards passes.

## Important

### 1. The overnight refresh silently discards unsaved draft edits

**Location:** `frontend/src/invoices/queries.ts:112–114`; `frontend/src/invoices/pages/Invoice.tsx:113–119`.

`useInvoice` includes today in its query key. When the date changes, the new query initially has no data, so `InvoiceRecord` replaces `DraftPage` with `LoadFailed`. This unmounts the form and its unsaved-work guard. The successful response then mounts a fresh form from the last saved invoice, losing everything typed since the last save. This also happens when a laptop wakes the following day and the window receives focus.

**Reproduced:** loaded a draft, changed Bill to to `Unsaved customer address`, advanced the clock across midnight and dispatched focus. After the new read, Bill to was the original `Harbor & Pine\nAttn: Sam Carter`, without saving or navigating. A temporary component regression test fails at this assertion.

V8 and the draft-form rule in `docs/specs/frontend.md` protect unsaved work; V31's date refresh must preserve it. Keep the form and its state mounted while refreshing the date-dependent data. Add a regression covering a dirty draft across midnight and focus; the existing suite does not catch this loss.

### 2. A valid multiline description prints outside the PDF page

**Location:** `backend/accountable/invoices/layout.py:397–416`; `frontend/src/invoices/layout.ts:533–558`.

The layout moves an oversized row to a new page once, then draws the entire row even when it is taller than that page. V8 allows descriptions of up to 1,000 characters over multiple lines, so this is reachable with ordinary accepted input.

**Reproduced:** issued an invoice through the API with one line whose description is `Item 01` through `Item 60`, separated by newlines: only 479 characters. Issuing and downloading the PDF both return 200. In all three designs, the layout places the final four description lines below the 792-point page boundary; `Item 57` starts at y=799.4 in Classic/Banner and y=802.4 in Ledger. Those lines are clipped from the printed page, and the preview uses the same overflowing layout.

This breaks V26's continuation onto subsequent pages and V28's requirement to show the description. Handle a row taller than a full page in both renderers, preserving the supported input. The shared layout fixtures and margin tests need this case; their existing long descriptions do not exercise it.

### 3. Editing during a successful save loses the saved identity of new lines

**Location:** `frontend/src/invoices/pages/Invoice.tsx:259–267`; `backend/accountable/invoices/routers/invoices.py:262–301`.

The save response is applied only if the entire form is unchanged while the request is pending. If a user adds a product, presses Save draft and edits any field before the response, the form keeps the new line's `id: null` instead of its newly assigned server ID. The dirty-form refresh protection also prevents the subsequent query response from reconciling it.

**Reproduced:** delayed a save response assigning line ID 99, edited Bill to during the request, then saved again. The second request omitted the line ID. The backend consequently treats the already-saved line as new: a product rename changes its saved name, and archiving the product after the first save makes the next save or issue reject it with `Choose an active product`.

That violates V6's guarantee that saved lines retain their names and remain usable after archiving. Merge returned IDs into the corresponding surviving lines while retaining edits made during the request. Add a delayed-save test that edits the form and then renames or archives the product before the next save; duplicate-submit coverage does not test this sequence.

### 4. Inherited values bypass the invoice's length validation when saved or issued

**Location:** `backend/accountable/invoices/routers/invoices.py:278–296,357–366`.

The request schemas validate explicitly supplied descriptions and Bill to, but `_resolved_lines` can fill a description from a product and `_save_draft` can retain the Bill to populated from the deal. The final resolved values receive subtotal and font-character checks, without the invoice's length checks. The source product descriptions and organization names permit values beyond the invoice limits.

**Reproduced through ordinary authenticated API requests on a temporary database:** saved an organization name of 501 ASCII characters and a product description of 1,001 characters, started an invoice on its won deal, then issued with only `{"lines":[{"product_id": ...}]}`. Issuing returned 200 with a 554-character Bill to and a 1,001-character description. Sending those same values explicitly on another invoice returned 422 for both fields. The shared `api.Request` checks accept these printable strings, so they do not prevent the bypass.

V8–V10 require the backend to check every final value and refuse issuing while a field breaks those rules. Validate the resolved draft before writing or issuing, including omitted fields populated from other records. Add tests for inherited over-limit values as well as explicit request values.

### 5. Failed invoice-related reads omit the required error and retry behavior

**Location:** `frontend/src/invoices/DraftForm.tsx:257–262,302–305`; `frontend/src/invoices/panels.tsx:135–148`.

The Add line picker never examines `products.error`. After an initial products read fails, it continues to say `Loading products` and offers no retry, preventing the user from adding a line. The deal/organization invoice panels show `Couldn't load this.` on an initial failure but likewise provide no retry; with cached data, they suppress the failure entirely and can show a stale empty list as current.

**Reproduced:** returned 500 for the products request and opened Add line. The component remained in its loading message, and the regression expecting a Try again button failed. The panel branches show the same missing recovery and stale-data handling directly.

N6 requires a visible failure, Try again, and preservation of existing data without presenting a failed read as real empty data. Apply that behavior to these queries. Add failed-initial-read and failed-refetch tests; the existing panel failure test only checks the error text, allowing the missing retry to pass.

### 6. Number sorting gives the wrong order for invoices issued on the same day

**Location:** `frontend/src/invoices/pages/Invoices.tsx:14–19,31`.

`issueOrder` sorts by issue date, then invoice ID. IDs are allocated when drafts are created, while numbers are assigned when invoices are issued. Create draft A, create draft B, then issue B before A on the same day: ascending Number puts A (`INV-0002`) before B (`INV-0001`).

**Reproduced:** rendered those two rows and selected ascending Number. The component returned `INV-0002, INV-0001`. The existing sorting test gives the invoices different issue dates, so it cannot catch the incorrect same-day tie-breaker.

V22 requires sorting in issue order, including across prefix changes. Use an actual issue sequence rather than draft ID to resolve that order, and test drafts issued in reverse creation order on the same date, including a prefix change.

### 7. A valid taxed invoice cannot be settled with one full-balance payment

**Location:** `backend/accountable/invoices/schemas.py:96`; `frontend/src/invoices/PaymentForm.tsx:33–35`.

The backend caps payment amounts at `api.MAX_CENTS`, the $1 trillion unit-price limit. The frontend's `parsePrice` imposes the same cap. B17 allows a $1 trillion subtotal plus tax up to 100%, giving a valid $2 trillion invoice; V15 pre-fills its payment form with the full balance and permits an amount up to what is owed.

**Reproduced:** issued a $1 trillion subtotal invoice at 100% tax. Issuing returned 200 with `total_cents: 200000000000000`. Recording that outstanding balance returned 422 with `Enter an amount more than $0.00`. The frontend also rejects its own prefilled positive balance. Splitting the receipt into separate payments is a workaround, but fails to record one actual full payment as one payment.

Separate the supported payment amount from the unit-price cap, retaining the transactional check against the outstanding balance. Add a full-payment test for the maximum valid taxed total; the current limits tests do not cover this combination.

## Verification

- `npm run check` passed: 3,249 backend tests, 1,388 frontend tests, 290 end-to-end tests and 12 speed tests; all 4,939 passed, along with formatting, lint, types and secrets checks.
- Four additional component probes outside the repository failed at the intended assertions for findings 1, 3, 5 and 6. API probes on temporary SQLite databases reproduced findings 2, 4 and 7. No production database was used or modified.
- Reviewed request parsing, shared validation and transactional paths for backend findings. Hosted Supabase behavior was not exercised by these probes.
- Only this review document was added to the working tree; no implementation, tests or other documentation were changed.
