## Review of profit-and-loss

Reviewed: the working tree against `main` (merge base: `main`'s tip), 5 commits, 59 files, and no uncommitted or untracked files. Plan: `docs/changes/profit-and-loss/plan.md`, with `intent.md` and `ui-check.md` in the same folder.

Not read: I did not read these changed files, and the first group is nearly all of the change's tests:
- Backend tests: `backend/tests/test_profit_and_loss.py`, `test_profit_and_loss_rules.py`, `test_books_reads.py`, `test_every_route.py`, `test_layout.py`, `test_limits.py` and `test_sample_data.py`.
- Frontend tests and helpers: every `*.test.ts(x)` file and `test-profit.ts`.
- End-to-end specs: all of `e2e/`.
- The frontend files that only change imports: `bills/*`, `layout.test.ts`, the moved `StackSegment.tsx` and `categories.tsx`.
- Docs: I read only the grep hits and the start of the `docs/STATUS.md` entry. I did not read the diffs of `docs/specs/architecture.md`, `testing.md` or `visual-design.md`.

Because the tests are unread, I did not check the "find the test that tries it" part of the spec pass for any spec claim. I did not run anything. Run this review again on the unread files before anyone acts on it.

### Important

None.

### Nits

1. **Chart and statement can disagree on a month with negative revenue.** `columnsOf` clamps revenue with `Math.max(0, …)`, so a month whose voids exceed its issues draws no revenue column. The statement, tooltip and table show the negative sum. This happens when an invoice is issued in October and voided in November. X6 says the chart's column and the statement always agree. `frontend/src/books/profit/ProfitChart.tsx:46`. (X6, X8) Unconfirmed: it needs a run with such data.
2. **The tooltip doesn't lead with the month.** X10 says the tooltip names the month and then gives the figures. It leads with "Profit $…" and puts the month under it. `ui-check.md` noted this and left it. Either change the code or change X10. `frontend/src/books/profit/ProfitChart.tsx:96`. (X10)
3. **The entries route reports a count of 0 when `offset` is past the end.** The count comes from a window function over the returned rows, so an empty page has no row to carry it. A client can't tell "past the end" from "nothing matches". The page never does this, because `getNextPageParam` stops at `count`. `backend/accountable/books/router.py:241`. (X13)
4. **The entries route accepts `from` after `to`.** It returns an empty list with a total of 0 and no 422. This is harmless, and the plan lists only bad dates and bad limits as 422s. `backend/accountable/books/router.py:219`.

### Checked

- **Bugs:** I read the pure rules, both routes, the label lookups and the page's state handling.
  - Period edges, half-away-from-zero rounding and the zero-division branches are correct.
  - The back and forward day logic matches X5. The arrows are off when there is no entry or no later period, and the shown period is never after today.
  - The 12 months are grouped in the database and folded in Python, and an entry's amount sums to the figure's total. No Important bugs found; the nits above are what turned up.
- **Security:** the new queries use bound parameters. `figure` is validated against a fixed list and `period` is a `Literal`. The routes sit under the books router and use the same checks as the rest, and `/books/entries` now adds labels, which are record numbers and supplier names, to its reply. The entry rows gain no new personal data. Nothing found.
- **Matches the spec and plan.md:** X1 to X19 and the plan's file list match the code I read. `books/` imports no area, since names come in through `app.state.labels`. The categories and stack segment moved to `components/charts/`. The explanation line, switch, arrows, statement, dialog and chart match the spec. The test-proof half is not checked, as stated under "Not read".
- **Described by the spec:** `profit-and-loss.md` is in the `docs/spec.md` index. The J12 wording ("or has no name") and the routes in `backend.md` are updated. The `STATUS.md` entry exists. I did not read the architecture, testing and visual-design diffs.
- **Follows STANDARDS.md:** I did not read `docs/STANDARDS.md`. I looked at the code only for obvious breaks of AGENTS.md's rules, such as work done in the page that the backend should do, and found none.
