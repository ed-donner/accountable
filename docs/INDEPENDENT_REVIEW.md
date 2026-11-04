# Independent review: `multi-user`

Reviewed on 2026-11-04, comparing `week1day5-end` (`8bb015a`) with `multi-user` (`ececff3`). The working tree was clean when the review began. The emphasis is code quality and readability, using `AGENTS.md`, `docs/STANDARDS.md`, `docs/REVIEW.md`, the current specs and the branch's intent and plan.

**Four Important findings and four non-blocking nits.** The main concern is session lifetime: the screen, token, requests, query cache and pending mutations can disagree about which session is current. The existing checks all pass, but focused reproductions expose the failures below.

## Important

These are behavior defects under `docs/REVIEW.md`, rather than requests for stylistic changes. Each was reproduced against the current source using temporary Vitest tests outside the repository.

### 1. A late 401 can sign out a newly signed-in person

**Location:** [frontend/src/lib/api.ts](../frontend/src/lib/api.ts#L127), particularly line 131; [frontend/src/lib/session.ts](../frontend/src/lib/session.ts#L92).

Every 401 calls `endSession(SESSION_ENDED)` against whichever session is current when the response arrives. The request no longer carries any information that lets this handler distinguish its original session from a later one. `endSession` checks only whether someone is signed in.

**Reproduction:** hold an authenticated request's response, sign out, sign in again successfully, then release the old response as a 401. The new session becomes `signed-out` and its token is removed. This can also happen when several requests fail for an expired session and one refusal arrives after the person has signed in again. It can discard work in the new session, contrary to U4/U6.

**Suggested fix:** capture the session identity or generation alongside the token when sending a request. Apply a response's session-ending side effect only if that session is still current. Add a deferred-response test covering reauthentication before the old refusal arrives; the existing API test covers only a refusal within one session.

### 2. A pending pipeline move can restore data after sign-out clears it

**Location:** [frontend/src/components/SignIn.tsx](../frontend/src/components/SignIn.tsx#L17), with [frontend/src/crm/queries.ts](../frontend/src/crm/queries.ts#L343).

The new session boundary relies on `client.clear()`. That clears the caches, but does not stop an already running mutation's callbacks. A pipeline move retains its previous deal list in `confirmedDeals`; when its response arrives, `onSuccess` calls `show()`, which writes the old session's records back into the same `QueryClient`. After clearing the mutation cache, `isMutating()` is zero, so the `onSettled` guard also skips removing that saved list.

**Reproduction:** start a move and hold its response, sign out through the real session code and `SignedIn` wrapper, and confirm that `['deals']` is absent. Release the successful move response. `['deals']` now contains the previous session's deal again. The next person can see these cached records while their own read is pending, violating U5. The existing sign-out test seeds settled query data; it does not leave a write pending.

**Suggested fix:** give cached data and optimistic mutation state an explicit session lifetime. A fresh `QueryClient` per session is one option; otherwise guard callbacks with the session generation and clear `confirmedDeals` as part of session teardown. Cover successful and failed moves completing after sign-out, including after another person signs in. This concerns stale client-side effects; a server write already accepted need not be undone.

### 3. ArrowDown does not retry a failed search while its message is open

**Location:** [frontend/src/crm/Search.tsx](../frontend/src/crm/Search.tsx#L196), especially the `!open` condition at line 206.

K7 promises that clicking the box or pressing the down arrow retries a failed search. `reopen()` implements the retry, but the keyboard handler calls it only when `open` is false. A failed search normally leaves `open` true and displays “Couldn't search. Try again.”, so ArrowDown does nothing. After a connection failure, the logical `open` state can likewise remain true even though no results panel is visible.

**Reproduction:** return 500 for a search, wait for the failure message, then press ArrowDown without first pressing Escape. Only the original request is sent. The current tests exercise click-to-retry and ArrowDown after Escape, leaving this case uncovered.

**Suggested fix:** allow ArrowDown to retry when `search.isError`, independently of whether the panel is open, while retaining normal arrow navigation for successful results. Test both a server error and a failed fetch.

### 4. Local sign-in reports success after losing the token to a storage failure

**Location:** [frontend/src/lib/session.ts](../frontend/src/lib/session.ts#L41), also `currentToken()` at line 85 and `signInAs()` at line 107.

`saveToken()` catches storage errors and says the session will last until reload, but no token is retained in memory. `signInAs()` still publishes `SIGNED_IN`, while every subsequent request obtains its token by reading storage again. With unavailable or full storage, the app therefore shows a successful sign-in and immediately sends an unauthenticated request, returning the person to sign-in.

**Reproduction:** make `Storage.setItem` throw `QuotaExceededError`, return a valid token from local sign-in, then read the session and call `currentToken()`. The session is `signed-in`, but the token is `null`.

**Suggested fix:** retain the active local token in memory and treat storage as persistence, keeping it synchronized with cross-tab events. Alternatively, report the storage failure before declaring sign-in successful. The state and token must agree. Add a test that attempts an authenticated request after storage fails, rather than checking only the displayed session state.

## Nits: code quality and readability

### 1. Remove the circular dependency between the session and API modules

**Location:** [frontend/src/lib/session.ts](../frontend/src/lib/session.ts#L4) and [frontend/src/lib/api.ts](../frontend/src/lib/api.ts#L3).

Both modules explain that the other must not be read during initialization. The plan also records changing `connectionMessage` into a function to accommodate this cycle. That is a fragile constraint for future maintainers: adding an otherwise ordinary module-level value can change whether the app loads.

Separate the small session/token store from the operations that perform sign-in requests, so dependencies run in one direction. Keep backend transport and error handling centralized. This would also make the lifetime fixes above easier to understand without introducing a general service framework.

### 2. Give the authorship helpers explicit data contracts

**Location:** [backend/accountable/crm/who.py](../backend/accountable/crm/who.py#L19).

Centralizing authorship is useful, but `dict[str, Any]` and `row: Any` hide the distinction between database user IDs and reply `Person` objects. `authorship()` also depends on four string-named columns that only `with_names()` supplies. Callers then merge the result over `row._mapping`, silently replacing the ID fields with people.

Use small named types for the write values and reply values, and make the required row shape explicit at this boundary. A name such as `with_authorship_names` would also distinguish these joins from organization/contact-name joins. This keeps the existing lightweight helpers while making a wrong key or mismatched representation easier to catch during editing.

### 3. Share a consistent Supabase test double

**Location:** [frontend/src/lib/session.test.ts](../frontend/src/lib/session.test.ts#L9) and [frontend/src/components/SignIn.test.tsx](../frontend/src/components/SignIn.test.tsx#L17).

These tests independently implement the same client boundary, with different behavior. The session fake clears a saved token and emits `SIGNED_OUT`; the screen fake's `signOut` does neither, and its `getSession` always returns null. Successful sign-in is also disconnected from token persistence. That makes tests of the same user action mean different things in different files.

Extract a small reusable fake whose saved session and events agree, and override only the failure or delay a test needs. Test scenarios should still drive observable behavior. This would support the missing session-transition cases without repeating a second auth implementation in every test file.

### 4. Make the combined organization query easier to read field by field

**Location:** [backend/accountable/crm/routers/organizations.py](../backend/accountable/crm/routers/organizations.py#L36).

Combining related records into one query has a documented reason: remote database latency. Keep that optimization. However, the deal arm of `_linked()` contains two anonymous text nulls, and readers must count positions against the contact arm to learn that they mean `job_title` and `status`. `_detail()` then combines query execution, missing-record handling and both record conversions.

Label the corresponding fields and placeholders in both arms, and give the two linked-record conversions small descriptive helpers. SQL unions still align by position, but the intended correspondence would be visible locally, making additions less error-prone without adding a generic query layer.

## What is working well

The branch largely follows the project's layout rules. CRM behavior stays in `crm/`; common sign-in, users and settings remain outside it. Attribution is applied through shared helpers, with explicit handling for unchanged saves and the records indirectly affected by a move. Middleware order, PostgreSQL casts and reduced database round trips have comments explaining their reasons. The request-level security coverage and explicit end-to-end waits are also useful safeguards.

The needed improvements are concentrated around ownership of asynchronous session state and a few implicit data contracts. The reviewed code does not call for a broad architectural rewrite.

## Validation and limits

- `npm run check -- --failures-only` passed: **2,868 tests**, comprising 1,790 backend, 821 frontend, 249 end-to-end and 8 speed tests, in 3m 56s. Formatting, lint, type and secrets checks also passed.
- Four additional temporary tests imported the current application modules and used the real query client and components, with fetch responses or storage failures controlled by the tests. All four failed on the expected-behavior assertions described above. They were kept outside the repository and are not included in the passing suite count.
- No application code or permanent tests were changed for this review. The full suite used its own temporary databases. No live Supabase or Render instance was exercised; the deployment caveats already recorded in `docs/STATUS.md` remain outside this verification.
