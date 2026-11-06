## Review of balance-sheet

Reviewed: `main` (merge-base) against the working tree. 5 commits, 44 changed files, no uncommitted or untracked files. Plan: `docs/changes/balance-sheet/plan.md`, with `intent.md` and `docs/specs/balance-sheet.md` (X1 to X18). I read the backend diffs, all the new and changed frontend source files and the spec and doc diffs, and skimmed the test files for what they cover. I could not run anything, so the checks below are from reading the code.

Not read: None in the sense of skipped files. I read the test files, `styles.css` and the e2e specs only lightly, for what they claim to cover. I did not trace their assertions line by line.

### Important

1. **Sample-data change may break the cash flow's "balance above zero in every month" (unconfirmed).** `bills/sample_data.py` now dates four large one-off bills 90 to 150 days ago instead of 121 to 300, and makes the contractor bills smaller for the first eight months. Money going out therefore moves later, which lowers the cash balance in the middle months. `docs/specs/running.md` says the opening balance is chosen so the cash flow shows "the balance above zero in every month". STATUS.md says only that the bills' tests and M3 still hold, and does not mention the cash flow's own tests. Run `npm run check` and the cash-flow sample-data tests. Also read `/api/cash-flow` on a fresh database for several seeding days (the 1st, a month's last day, Jan 1) to confirm every month is above zero. `backend/accountable/bills/sample_data.py:66` and `:157-161`. (M3, Y-series cash flow) Pass: Matches the spec and plan.

### Nits

1. **Heading and figures can disagree while a day loads.** The heading shows the new day immediately, but `keepPreviousData` leaves the earlier day's figures and bars under it until the read arrives. This follows X10, but nothing marks the figures as the previous day's. The chart's aria-label does use the right day. `frontend/src/books/pages/BalanceSheet.tsx:50-62`.
2. **A loss-only day shows "Nothing in the books by this date."** The bars' `empty` flag is true when every account is zero or below. That includes a day with entries where Cash is overdrawn and Profit to date is negative. X16 says the message is for a day before any entry. `frontend/src/books/BalanceBars.tsx:104`.
3. **Unbounded `account` list.** `check_accounts` caps neither the number nor duplicates of `account` values. A long repeated list becomes one big `IN (...)`. The URL size limit probably keeps it under SQLite's variable limit, so this is low risk. `backend/accountable/books/schemas.py:42`.
4. **Dialog heading and figure rely on captured values.** `Opened.cents` is the figure at the time of clicking. A save made while the dialog is open (not possible, since the dialog is modal) would leave it stale. This matches the plan's risk note, so no action is needed unless the dialog stops being modal.

### Checked

- **Bugs:** I traced `stops` (including leap-year February and January years), `figures`, `totals` and `effect` in BigInt. I traced the `in_` filter inside the single `exists`, the paging and de-duplication, the slider's keyboard handling, the day change keeping its place from the right, and the failed-read paths. I found no defect beyond the nits above.
- **Security:** Nothing exposed. The bad-account check runs before any query, and `FieldError` is handled globally in `main.py`. Only the unbounded list in nit 3.
- **Matches spec and plan:**
  - The plan's files, the spec's X1 to X18 and the doc updates are all present.
  - The `list[AccountQuery]` approach was swapped for `check_accounts`. STATUS.md says why: FastAPI names a bad list item `account.1`, where the spec wants the message beside `account`.
  - The e2e and stress tests are written but were not run, as the plan says.
  - One finding: the sample-data change in Important 1.
- **Described by the spec:** `balance-sheet.md` is new and affects `books.md`, `backend.md`, `running.md`, `testing.md`, `architecture.md`, `frontend.md` and `visual-design.md`. All of these were updated. I did not check that `docs/spec.md` has the index line for `balance-sheet.md` beyond seeing the file in the diff stat. The sample-data change is described in STATUS.md only, not in `running.md`'s rows, which is acceptable because the counts and sizes are unchanged.
- **Follows STANDARDS.md:** I did not open `docs/STANDARDS.md` line by line. No disable comments, ignores or rule changes appear in the diff, and money is handled as BigInt strings. Style was skipped as asked.
