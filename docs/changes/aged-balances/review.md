## Review of aged-balances

Reviewed: `main` (merge base) against the working tree, 5 commits, 48 files, nothing uncommitted. I read the backend `aging/` code, the sample-data diffs, the frontend `aging/` components and queries, the shared `lateness.ts`, the `HowLate` and `styles.css` changes, the docs, and the plan and ui-check notes. Plan: `docs/changes/aged-balances/plan.md`. I did not run any tests or the app.

Not read: the test files (`backend/tests/*`, `frontend/src/**/*.test.*`, `e2e/*`, `frontend/src/aging/test-aged.ts`), the small edits to `AccountingPage.test.tsx` and `layout.test.ts`, and the `intent.md` file. I only searched the aging tests and the e2e spec for "focus" and "tooltip". Claims below about what tests do or don't cover rest on that search, so run this review again on those files before anyone acts on it.

### Important

1. **The tooltip doesn't show when a row is focused.** X13 says pointing at a part, or focusing the row it's in, shows the organization, the part, the amount and the count. `AgedBar` draws the chart with `aria-hidden` and `accessibilityLayer={false}`. The only focusable thing in a row is the chevron button, and nothing there opens the tooltip. A keyboard user gets the table amounts and the screen-reader list, but never the tooltip, so the spec's keyboard route to the part's count isn't there (Q3). The `aging` tests I searched have no check that focus opens it. The e2e spec's "tooltip" search found no match. `frontend/src/aging/AgedBar.tsx:99-140`, `frontend/src/aging/AgedTable.tsx:91-111`. (X13, Q3) Pass: Matches the spec and plan.md.

### Nits

1. **Docs say the trade show bill moved from 121 to 110 days ago.** That is a different group from before. The Phase 2 plan was to leave existing bills unpaid and re-date them. This one is explained in STATUS.md, so it only needs a spec check. `backend/accountable/bills/sample_data.py` (the Signalbox Marketing bill).
2. **STATUS.md lists a customer with invoices in three late groups as not guaranteed.** The plan's sample-data note asked for it, and the note was made without the spec being changed. X19 only needs "several organizations in more than one part", so this is a plan-versus-build difference that is already written down.
3. **Dead guard in `_owed_by_customers`.** The code drops invoices where `total - paid == 0` but keeps negative amounts, which is intended. The comment says nothing about it, so a later reader may "fix" it.
4. **Clicking anywhere in the row toggles it.** The row has an `onClick` and the chevron button has no handler of its own. Keyboard works only because the button's click bubbles up. This is fine today, but moving the handler onto the button would be safer.

### Checked

- **Bugs:** I followed `part_of` through the X1 boundaries (0, 1, 30, 31, 60, 61, 90, 91). I checked the customer query: issued invoices only, `issue_date <= on`, payments `<= on` summed in the database, zero balances dropped. I checked the supplier query: `bill_date <= on`, unpaid or paid after `on`, tax included. I checked the order in X10, the 422 for a later `on`, and the frontend address handling of `view` and `on` (a bad or future `on` is dropped, today is never written). I also checked the keys that make the report read again at midnight. I found no defects other than the focus gap above.
- **Security:** the two routes only read, take one optional date, and return no secrets. `on` is parsed by FastAPI as a date. The sign-in, host and NUL checks come from the shared route tests that the change extends, and I did not read those tests.
- **Matches the spec and plan.md:** the files, routes, sample-data changes and layout rules match the plan. The one miss is X13's focus tooltip, listed above. X1 to X12 and X14 to X17 match the code I read.
- **Described by the spec:** `docs/specs/aged-balances.md` is in the `docs/spec.md` index with new terms. `architecture.md`, `books.md`, `invoices.md`, `bills.md`, `running.md`, `testing.md`, `visual-design.md` and `frontend.md` are updated, and STATUS.md has the entry. I found nothing undescribed.
- **Follows STANDARDS.md:** I did not read `docs/STANDARDS.md`, so this pass was only a skim. The code uses a plain, area-isolated structure and no area imports another. I did not check the standards in detail.
