# Independent review: cash-flow

Reviewed `e5632f3` against `main` using `main...HEAD` (merge base `053d7e7`; current `main` is `06e261f`). All 72 changed files were inspected for bugs, security, agreement with the spec and plan, documentation coverage, and non-style standards. Style was excluded. No changed file was left unread. This reviews the branch's changes; it does not test a merge with the newer commits on `main`.

## Important

### 1. An accepted deal date can break both cash flow routes

Location: `backend/accountable/crm/cash.py:33`.

The CRM accepts `9999-12-31` as a close date, but adding nonzero payment terms to it raises `OverflowError`. Every cash flow request calculates every open deal's expected date before filtering out dates beyond the forecast. Consequently, one such deal prevents the entire cash flow and every month's list from loading, even with Likely deals off.

Reproduced through the authenticated API on a temporary sample database: `/api/cash-flow` initially returned 200; `PATCH /api/deals/{id}` with `{"close_date":"9999-12-31"}` on an open deal returned 200; both `/api/cash-flow` and `/api/cash-flow/expected?month=2026-11` then returned 500. The date passes the request model and the CRM's save rules, so this is reachable without bypassing validation.

Guard the date arithmetic so deals outside the representable forecast range are omitted without failing the request, as Y13 requires for deals beyond the forecast. Add a regression that saves the date through the API and reads both routes. The current beyond-forecast test uses February 2027 and does not exercise this boundary.

### 2. A failed refresh of a month's list silently presents stale data

Location: `frontend/src/cashflow/MonthDialog.tsx:76`.

`Listed` renders `LoadFailed` only when the query has no data. TanStack Query keeps its previous data when a later request fails, so an open dialog, or a reopened cached dialog, silently shows the old invoices, bills and totals after a 500 response. A previously empty result also continues saying “Nothing expected” with no warning or retry button. This violates N6, which the cash flow's frontend spec explicitly applies to the dialog.

Confirmed with the real component and query hooks: load December's list successfully, make that endpoint return 500, and refetch its query. The query enters the error state, but the old invoice remains and the dialog has neither an alert nor Try again.

Show the refresh warning and retry control alongside retained data, including the empty-result branch. Add tests for a failed refresh after both a populated and an empty successful response. `MonthDialog.test.tsx` currently tests only a failed first read; the row's refresh-failure test does not cover the dialog's separate endpoint.

### 3. The settings form rejects an unchanged opening date that the backend preserves

Location: `frontend/src/company/settings.ts:139`–`144`; used by `frontend/src/company/SettingsPage.tsx:58`.

B24 says a date that was valid when saved stays valid. The backend implements that exception by comparing the submitted date with `saved_on`. The frontend instead rejects every date after its current day, without considering the saved date. If an opening balance was saved on November 5 and the clock or time zone is subsequently corrected to November 4, changing an unrelated setting is blocked by the opening date. The form requires the user to alter valid saved financial settings before it can send the otherwise acceptable save.

Confirmed that `openingBalanceProblems("40000.00", "2026-11-05", "2026-11-04")` returns the future-date error. The backend's `test_a_date_that_was_fine_when_it_was_saved_stays_fine` explicitly accepts this situation, but no frontend test exercises it.

Give the form's validation the saved date and preserve the same exception as the backend. Add a page test that loads the saved date, changes only an unrelated setting, and verifies that Save settings sends the request.

## Test coverage findings

The review policy requires flagging prohibitions or guarantees that no test would catch becoming false. These two implementations currently follow the spec, but their promised proofs are missing:

- **Y15: Likely deals is off on every dashboard visit and is not remembered.** `frontend/src/cashflow/CashFlowRow.test.tsx:67` checks the initial unchecked state and then enables it, but never leaves and returns. The end-to-end toggle test turns it off before finishing. Add a test that enables it, navigates away, returns to the dashboard, and checks that the switch, band, extra figure and dialog's deals are off again; include a reload to catch persistence in browser storage.
- **Y14: likely deals exclude sales tax.** The exact-amount assertions in `backend/tests/test_cash_flow.py:385` and the other likely-deal cases run with the empty database's 0% tax. The sample-data and end-to-end checks do not assert an independently calculated likely-deal amount with nonzero tax. Adding tax to expected revenue could therefore pass these checks. Set a nonzero tax rate, assert the exact pretax amount in the month and its list, then change only the tax rate and verify that the amount and balances with deals stay unchanged.

## Verification and scope

- `npm run check -- --failures-only` passed: 4,354 backend tests, 1,734 frontend tests, 328 end-to-end tests and 19 speed tests; 6,435 total in 6m 45s. All formatting, lint, type and secrets checks passed. The cash flow and month-list speed checks measured 16.0ms and 14.7ms.
- Additional API and frontend probes used temporary databases and files outside the repository. No production code or existing tests were edited to reproduce the findings.
- No additional security finding was identified. The new routes use the existing authentication and host checks, their query validation rejects malformed text, and the migration preserves the existing table's security boundary.
- The new area, API, settings, migration, sample data and tests are described and indexed in the spec. Apart from the findings above, no additional functional mismatch with the spec or plan was identified. No style nits are reported.
- Only this report was added to the working tree. The owner's database and git index were left untouched.
