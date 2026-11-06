## Review of `books`

Reviewed: `books` against `main` (merge base `main`), 5 commits, 64 files, working tree clean, no untracked files. Plan: `docs/changes/books/plan.md`, with `intent.md` alongside it. I couldn't run the app or the tests.

Not read: None. I read the diffs of the backend source, the migration, the spec and plan, and the frontend source. I did not read the new test files (`test_books*.py`, the e2e specs, the frontend tests) or the docs diffs other than `books.md` and the `spec.md` index. I only grepped `test_migrations.py`.

### Important

1. **Migration `0012` writes an empty entry for a $0.00 opening balance.** The settings accept an opening balance of 0 (`OpeningBalance` only caps the size). In `_opening_balance_entries`, `abs(0)` gives both lines amount 0. `_entry` then filters those lines out, but `_write` still inserts the entry row. A database already at `0011` with `opening_balance_cents = 0` therefore gets a `journal_entries` row with no lines. J3 says an opening balance of $0.00 "posts no entry at all", and J9 says the migration posts what the app would. The live path is correct: `post()` returns `None` when no lines are left. The sample data and the `cli.py` repost go through `post()`, so they are also fine. Only the migration differs.
   - Effect: `GET /books/entries` shows a phantom `opening_balance_set` entry with `lines: []`, the entry counts are off, and `opening_balance_changed` or `opening_balance_cleared` later reverses it into another empty entry.
   - Fix: in `_post_existing_records`, drop any entry whose filtered lines are empty before `_write`. This would also guard a zero-total bill. Add a test with opening 0 to `test_migrations.py`.
   - `backend/accountable/migrations/versions/0012_books.py:167-169` and `:227-235`. No migration test uses 0 for the opening balance: `test_migrations.py` only passes `-125000`, `-425000` and `4_000_000`. (J3, J9) Pass: Bugs, Matches the spec.

### Nits

1. **Month range error field.** In `books/router.py` `_month_range`, a `from` given alone and later than the current month reports "The first month can't be after the last" on `from`. That's reasonable but unstated in the spec (`books/router.py:68-69`).
2. **Unstated month floor.** `FIRST_MONTH = "1000-01"` is a floor on the default range that the spec doesn't mention (`books/schemas.py:30`).
3. **Zero-line guard in `_entry`.** The `_entry` helper filters zero lines but nothing checks that an entry kept any line. This is the cause of Important 1.

### Checked

- **Bugs:**
  - `post` and `reverse`: balance check before write, a single open entry found by the `reverses_id` unique index, and swapped stored lines on the same date.
  - Routes: all invoice, payment, bill and settings routes post inside their own write transaction. There are no other writers of invoices, payments, bills or the opening balance outside the sample data and the CLI.
  - `bills/books.py` against every J6 row (amount, tax, category, date, paid date, Undo, delete): correct.
  - Reads: balance, month folding and entries paging are correct.
  - The only defect found is Important 1.
- **Security:** the new routes are `GET` only, take the user from the token, and show no secrets. `created_by` comes from `CurrentUser`. Row-level security is enabled on both new tables for Postgres. Nothing found.
- **Matches the spec and plan:** files, routes, helper names and layout match `plan.md`, and the J-rules are met except J3 and J9 in the migration (Important 1). I did not confirm that tests cover the J7 failure and 405 claims, since I didn't open the test files.
- **Described by the spec:** `books.md` is in the `docs/spec.md` index (J1 to J16), the terms are added, and the affected area files were updated. Nothing found.
- **Follows STANDARDS.md:** I did not read `docs/STANDARDS.md`. I looked at the code for layout rules (`books/` imports no area; areas import only `books.post`), types, and plain SQLAlchemy Core with grouped queries and a fixed number of reads, and saw no breaks. I did not run `npm run check`.
