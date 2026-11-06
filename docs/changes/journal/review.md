## Review of journal

Reviewed: `main` (merge base) against the working tree on `journal`, 5 commits, 65 files, nothing uncommitted. Plan: `docs/changes/journal/plan.md`, with `intent.md` and `ui-check.md` beside it.

Not read: I only skimmed the test files and e2e specs for the claims the spec makes. I did not read them line by line:
- `backend/tests/test_books_journal.py`
- `backend/tests/test_migrations.py`
- `backend/tests/test_books_reads.py`
- `backend/tests/test_limits.py`
- the new frontend tests
- `e2e/journal.spec.ts`

I read every changed non-test source file and the spec files I needed. I could not run the app or the tests.

### Important

None.

### Nits

1. **A bill-number change leaves a reversal and its repost with different wording.** Take a bill saved with "bill_number" changed from A to B. `reverse` copies the old document, so the reversal reads "Bill A changed". The repost uses the new number, so it reads "Bill B changed". `plan.md` asks for this. But J4 says "an entry reposted by a change has the same [description] as the reversal beside it," which is false in this case. Either narrow the J4 sentence or add a test for it. `backend/accountable/books/post.py` (`reverse`), `backend/accountable/bills/books.py:77`. (J4) Pass: matches the spec.
2. **`description` has an empty default in the database.** `plan.md` said to make it required once filled. The build kept a `server_default=""` instead, so `test_books_checks.py` could keep writing bare rows. This is documented in the spec and in STATUS. The risk is that a future insert that skips `describe` goes in with a blank description and nothing flags it. `backend/accountable/books/tables.py:38`, `backend/accountable/migrations/versions/0013_journal_wording.py:118`. Pass: bugs.
3. **The chart reads balances as `Number` for the heights.** Beyond about $90 trillion the heights lose precision. The tooltip and the table stay exact because they use BigInt. This is acceptable given the $1 trillion limits and `plan.md` says the same. `frontend/src/books/charts/BalanceChart.tsx:103`.
4. **Paging is by offset on a live list.** An entry posted by someone else between two pages shifts the later pages, so one entry can show twice or be skipped until a refetch. `key={entry.id}` would also produce a React duplicate-key warning in that case. `frontend/src/books/queries.ts:88`. Pass: bugs.
5. **A panel reads at most 500 entries and does not say so.** `useRecordEntries` asks for `limit=500`. A bill changed hundreds of times would silently drop the newest entries, since the order is oldest first. This is unlikely, but a "showing first 500" note or paging would close it. `frontend/src/books/queries.ts:118`.

### Checked

- **Bugs:** I followed the ledger query (window sum ordered by date, entry id, line id, signed by `accounts.debit_normal`) and the header balance (`accounts.balance` over total debits and credits). Both agree when the newest line is the last in the ordering. `reversed_by_id` is a left join on `reverses_id`, which is at most one per entry, so lines are not duplicated. The `kind`/`source_id` pair check, the oldest-first order for a panel, and the bill-includes-bill_payment rule all hold. In `0013` the fill is a fixed set of correlated UPDATEs. Entries with a deleted record fall back to the event's wording and no document. The frontend search debounce, the address-held filters, `keepPreviousData` with `hasNext` masked, `useLoadMore` and the empty and error states all work as I traced them. Nothing found beyond the nits.
- **Security:** The new routes sit under the existing `/books` router, so sign-in and host checks apply. `q` goes through `SearchText` (length limit) and the `%`/`_` escaping in `holding`. `kind` is checked against a fixed list, and `source_id` and the ledger `key` are validated. There are no writes and no new data exposed. Nothing found.
- **Matches spec and plan.md:** The build follows the plan's files, order and tests. The departures (default on `description`, the order within a day, `bill_payment`, the ledger as its own route) are listed in STATUS and the spec. The read-only (405), equal-totals, reversal-order and layout-rule claims have tests listed. I confirmed the ones I saw: the `layout.test.ts` and `test_layout.py` rules are in. I did not confirm the rest line by line. Only nit 1 is a gap here.
- **Described by spec:** `backend.md` data model and API, `books.md` J4/J9/J17–J19, `architecture.md`, `testing.md`, `visual-design.md` and the `spec.md` index all cover the new code. STATUS is updated. I found no code the spec leaves undescribed.
- **Follows STANDARDS.md:** I did not open `STANDARDS.md` separately. The code follows the repo's existing patterns (Core queries, shared components, tokens only in the chart, accessible names on the new controls). I found nothing to flag, and style is skipped as asked.

Unconfirmed: the `0013` `CASE` and string concatenation with bound literals on Postgres. Run `test_migrations.py`'s offline SQL check, then start the app once on a Supabase copy, as `plan.md` risk 12 says.
