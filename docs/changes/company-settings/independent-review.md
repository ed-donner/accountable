# Independent review: company-settings

Reviewed `main` (`d0906c4`) against `company-settings` (`c87c78b`) using `docs/REVIEW.md`. The working tree was clean at the start. Style is excluded.

Two Important findings need fixing before merge. One non-blocking test-coverage finding follows.

## Important

### 1. A pending save silently discards further edits

Location: [SettingsPage.tsx](../../../frontend/src/company/SettingsPage.tsx), lines 61–65.

Only Save settings is disabled while the request is pending; all nine fields remain editable. When the request finishes, `reset(toForm(saved))` unconditionally replaces the entire form with the submitted version. Anything typed after submission disappears without being saved, even though the page announces “Settings saved.” This is particularly easy to encounter on the shared app's slower connection. `useWrite` also waits for the subsequent query invalidations, extending the interval in which this can happen.

Reproduced with the real component and a delayed mocked PATCH: change the company name, press Save settings, change Phone from `(718) 555-0142` to `(718) 555-0199` while Save settings is disabled, then release the response. Phone reverts to `(718) 555-0142`. An assertion that the later edit survives fails. The probe was kept outside the repository.

Prevent editing for the duration of submission, or preserve changes made after the submitted snapshot and leave those changes dirty. Add a regression test with a delayed response and an edit made after submission. The existing tests cover duplicate submissions and a teammate's refresh, but neither covers this loss of input.

### 2. Numeric tax rates are rounded before their precision and range are checked

Location: [schemas.py](../../../backend/accountable/company/schemas.py), lines 47–58.

`Decimal(str(value))` receives an already parsed Python float when the request uses a JSON number. It cannot recover digits lost by JSON decoding. Consequently, the API accepts invalid rates and stores a rounded value, contrary to B4, B5 and B7 and the plan's risk 4.

Reproduced through authenticated `PATCH /api/settings` requests on a temporary database, sending the bodies as raw JSON text:

| Request body | Actual result | Required result |
|---|---|---|
| `{"tax_rate":8.8750000000000001}` | 200, rate `"8.875"` | 422, “Use at most three decimal places” |
| `{"tax_rate":100.000000000000001}` | 200, rate `"100"` | 422, “Enter a rate from 0 to 100%” |

The same values sent as strings correctly receive 422. Preserve the numeric token's decimal precision before conversion to a float, then apply the existing checks. Keep support for numeric requests, which is part of the API contract. Add tests using raw JSON bodies: tests that first create Python floats or call `json.loads` have already lost the evidence before sending the request.

## Non-blocking test coverage

### 3. Overlapping partial saves do not exercise the prefix invariant

Location: [test_company_settings.py](../../../backend/tests/test_company_settings.py), lines 260–263; [router.py](../../../backend/accountable/company/router.py), lines 55–60.

The implementation correctly reads and checks the settings inside `db.writing()`, but no settings test overlaps two requests. The sequential prefix tests and the generic lock test would still pass if the read moved outside the lock. That leaves the concurrency claim in B5/B6, the backend spec and plan risk 7 without a regression test, which the review policy asks reviewers to flag.

Start with `QT-` and `INV-`, then overlap `{"quote_prefix":"DOC-"}` and `{"invoice_prefix":"doc-"}`. Each passes against the original row separately, but together they violate B6. A deterministic test should require one successful save, one 422, and a final pair that does not clash, and should fail if the read/check is moved outside the write lock. This is a coverage gap, not an observed concurrency defect in the current code.

## Review coverage and validation

Separate passes covered bugs, security, agreement with the spec and plan, spec completeness, and non-style standards. No additional security or documentation findings were identified. The review covered the settings API and page, migration and sample/reset behavior, shared components, test-runner changes and their tests.

The API reproductions used a disposable SQLite database; the UI reproduction used a temporary Vitest file importing the unchanged component. No application code or existing tests were edited. Supabase and the owner's database were not used.

`npm run check` passed: 3,249 tests (2,032 backend, 954 frontend, 255 end-to-end and 8 speed), with all formatting, lint, secrets and type checks passing. The review file also passes Prettier. The existing suite does not detect the two reproduced defects above.
