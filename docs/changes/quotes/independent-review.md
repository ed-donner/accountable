# Independent review: quotes

Reviewed `quotes` at `e3fac077e1b730f59f21108c97e8b8429b3a1b90` against its merge base with `main`, `5e5035db9b16256ac1be07d68d4699f92da63587`, following `docs/REVIEW.md`. Style was excluded as requested.

## Important

### 1. A teammate sending the quote destroys the dirty draft on refetch

**Location:** `frontend/src/quotes/pages/Quote.tsx:55–65` (`QuoteRecord`).

Change a draft's quantity without saving, let a teammate send that quote, then return to the window. The focus refetch returns `status: "sent"`, and line 61 replaces `DraftQuote` with `FixedQuote`. That unmounts the form and discards its unsaved values. The dirty-form protection inside `useQuoteForm` cannot prevent its parent from removing it. This also loses the values retained after a refused save when a later refetch arrives.

Q21 explicitly requires the teammate's typed values to stay on screen; Q19 and plan risk 14 require preservation across another person's changes. A temporary regression test changed quantity to `20`, returned the sent quote on refetch, and found the quantity box gone. The existing Q21 test at `Quote.test.tsx:230` only makes PATCH return 409: its GET continues returning a draft, so it misses the actual status transition.

Keep the dirty values available when the fetched status changes, while preventing edits from being saved to the fixed quote and explaining the conflict. Cover a real changed GET response as well as the refused PATCH.

### 2. The first save drops edits made while its request is pending

**Location:** `frontend/src/quotes/pages/Quote.tsx:235` (`NewDraftForm`).

Create a new quote, add a product with quantity `1`, press Save quote, and type `25` while POST is pending. Once the response arrives, the success callback navigates to `/quotes/{id}`. Although `takeSaved` preserves those newer values in the original form, navigation unmounts it; the saved quote page initializes from the server's quantity `1`. The newer edits disappear without warning.

This contradicts plan risk 14's requirement to retain anything typed while saving. The temporary regression reproduced `1` where `25` should remain. The existing pending-save test at `Quote.test.tsx:212` exercises PATCH on an existing draft, which never crosses this navigation boundary.

Preserve the current form values and newly assigned line IDs across the first-save transition, leaving changes made during the request available for the next save. Add the equivalent pending-edit test for POST and navigation.

### 3. An archived-product rejection is stored in an error field that is never displayed

**Locations:** `frontend/src/lib/saveErrors.ts:21–28`; `frontend/src/quotes/QuoteForm.tsx:35–42,268–304`.

Add an active product to a draft, let a teammate archive it before the quote is saved, then save. This is a valid request: `backend/accountable/quotes/router.py:100–109` rejects the new line with a 422 field error at `lines.0.product_id`, saying “This product is archived. Choose another.” The actual form values contain `product_id`, so `showSaveError` calls `setError` and suppresses the notification. However, the form only renders errors for description, quantity and unit price. No message appears anywhere, and repeated saves keep failing with no explanation.

This breaks Q19/F2's visible save-error behavior. A temporary test using a product added through the real picker reproduced the missing message. The purported fallback coverage at `saveErrors.test.ts:59` uses `{ lines: [{ quantity: "1" }] }`, omitting the `product_id` that the actual form always contains, so it takes a different path.

Display errors on non-editable line properties beside the line or in a notification. Test the archived-product response with the real form shape and rendered UI.

### 4. Accept proceeds after the read needed to explain its consequences fails

**Location:** `frontend/src/quotes/pages/Quote.tsx:399–405,448–455` (`FixedQuote`).

If `GET /quotes?deal_id=…` fails, `dealQuotes.data ?? []` treats the unknown sibling quotes as an empty list. Once the request fails, `isPending` becomes false, enabling Accept quote; the error is never checked or displayed. The confirmation consequently omits the other sent quotes, but `accept_quote` still declines them all in its transaction (`backend/accountable/quotes/router.py:321–326`). A user can authorize irreversible changes that the dialog failed to name.

This violates Q22's requirement that the confirmation name everything it will change and N6's rule against presenting a failed read as real empty data. A temporary test returned HTTP 500 for the sibling list and confirmed that Accept quote remained enabled. The existing success-path confirmation coverage does not exercise this failure.

Require a successful read before enabling confirmation, show the failure and a retry, and test that a failed supporting read cannot authorize acceptance.

### 5. Failed deal and product reads silently produce unusable pickers

**Locations:** `frontend/src/quotes/dialogs.tsx:15–43` (`NewQuoteDialog`); `frontend/src/quotes/QuoteForm.tsx:324–377` (`AddProduct`).

Both pickers ignore their query's error state. An initial failure of `GET /deals` becomes `options: []`, so New quote reports that no open deals match, even when deals exist. An initial failure of `GET /products` leaves Add product blank: its empty-state message also requires `products.data`, which is absent after failure. Neither tells the user the read failed or offers recovery, blocking quote creation or adding lines.

N6 requires visible read failures with Try again, and F11 explicitly forbids a form opening with an empty picker when its required lists could not be read. Two temporary tests injected HTTP 500 into these reads; both failed because the required error/retry UI was absent. Successful-picker tests do not cover this claim.

Handle these required reads explicitly: follow F11 for the new-quote dialog and give the product picker a visible failure and retry that preserves the draft. Test failed reads separately from genuinely empty lists.

## Validation and scope

- `npm run check` passed: 2,910 backend, 1,259 frontend, 283 end-to-end and 12 speed tests; 4,464 total. Formatting, lint, types and secrets checks also passed. The run took 9m 22s and reported concurrent test activity when listing slow unit tests.
- Six additional regression probes ran against a temporary copy of the frontend outside the repository. All six failed as described above, while the copied file's 28 existing tests passed. The two picker probes support finding 5. No repository tests or implementation files were changed.
- Read the branch's 93-file change, including production code, test bodies, migration, dependency changes, documentation, intent and plan. Checked the security and non-style standards passes; no additional findings from those passes. The four binary fonts were checked through their accompanying licences and the passing PDF embedding tests.
- **Not read:** no textual branch changes remain unread. Binary font internals were not manually audited. Live Supabase/Postgres deployment and manual visual comparison were not performed.

## Nits

None. Style was excluded.
