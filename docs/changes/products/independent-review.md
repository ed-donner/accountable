# Independent review: products

Reviewed on 2026-11-05 against `main` (`d0906c4`), through branch HEAD `ea74f59`. The working tree was clean at the start. Applied the separate passes in `docs/REVIEW.md`: bugs, security, spec and plan compliance, spec completeness, and non-style coding standards. Style is excluded.

## Important

### 1. Restore notifications survive sign-out and mutate through the previous session's cache

**Location:** `frontend/src/products/queries.ts:58–60`, with `frontend/src/lib/records.ts:20–22` and `frontend/src/components/SignIn.tsx:14–26`.

Archive a product, sign out, and sign in again before the notification disappears. Sonner retains the notification when the old `Toaster` unmounts and gives it to the new one. Its Restore callback still holds the old `useSetActive` mutation and query client. Clicking it sends the restore with the **current** token, because `api()` reads the token for each request, but invalidates only the **previous** session's query cache. The product becomes active in the database while the current table still displays it as archived, even though “Product restored.” appears.

Confirmed with a temporary Vitest reproduction using the real `SignedIn`, Products page, session functions and Sonner, with the API stood in as in the repository's tests. Archive used Alex's token; after switching to Dana, Restore used Dana's token, changed the backing record, issued no new products read and left the row's Restore button on screen. The same problem applies when the same person signs back in. This breaks U5's session isolation and the frontend requirement to refresh data after a write.

Scope notifications and their actions to the session that created them. Discard or disable them when that session ends, including notifications from operations that finish after sign-out. Add a regression covering archive, sign-out, sign-in and the old Restore action; the existing product and session tests never combine these steps.

### 2. Unbounded product names exceed Postgres's index limit and return 500

**Location:** `backend/accountable/products/tables.py:12–19`, `backend/accountable/products/schemas.py:22,30`, and migration `0004_products.py:42`.

The new unique index stores the entire normalized name, but neither product request model bounds its length. Following the complete request path confirms that a long, nonblank ASCII name passes JSON parsing, `api.Name` and `api.Request._storable`; the form also has no length check. Postgres cannot index sufficiently large values. Its resulting `ProgramLimitExceeded` is not a duplicate-name `IntegrityError`, so the API returns the generic 500 instead of a field error. SQLite accepts the same input.

Confirmed through the real API routes with migration-created, disposable Postgres and SQLite databases. A deterministic 8,192-character name made by concatenating `sha256(str(i).encode()).hexdigest()` for `i` in `range(128)` produced:

| Operation | SQLite | Postgres |
|---|---|---|
| Add product at 4,950 cents | 201 | 500 |
| Rename an existing product to that name plus `edit` | 200 | 500 |

Postgres reported `index row requires 8208 bytes, maximum size is 8191`. This makes accepted product input fail in the shared app and bypasses F2's field-level feedback.

Define and enforce a product-name bound that keeps the normalized UTF-8 index key safe, with matching form feedback and spec updates, or use an index representation that supports the permitted names. Cover both add and rename, including Unicode expansion during normalization. The existing SQLite tests and offline Postgres DDL assertions cannot expose this failure.

## Non-style nit

### 1. The documented concurrent-name guarantee is not exercised concurrently

**Location:** `backend/tests/test_products.py:223–241` and the product-name coverage claim in `docs/specs/testing.md`.

The tests for getting past the name check disable `_check_name` and send sequential requests against SQLite. They usefully prove that the unique index rejects a duplicate, but do not exercise overlapping saves from independent connections or Postgres's aborted-transaction behavior. The testing spec nevertheless says it covers “two saves of one name at once,” and the backend spec promises a field error rather than a 500. Add coverage for those conditions, or accurately narrow the testing claim. No current concurrency failure was demonstrated.

## Validation and scope

- `npm run check` passed: **3,279 tests**, including all end-to-end and speed tests, in **4m 09s**. The first attempt could not access the uv cache under the sandbox; the permitted full run passed.
- The two findings above were reproduced separately using temporary files and databases outside the repository. No Supabase connection or owner database was used.
- No additional authentication, spec-completeness or non-style standards findings were identified.
- Only this report was added to the branch. No application, test, spec, status or configuration files were edited.
