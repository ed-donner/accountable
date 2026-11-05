# Independent review of `bills`

Reviewed against `main` (`5e5035d`), through branch HEAD `6f083b9`: all 79 changed files, including implementation, tests, migrations and documentation. The working tree was clean before review. Followed `docs/REVIEW.md`, the branch's intent and plan, and the relevant specifications. Style was excluded.

**Not read: None.**

## Important

### 1. Small bills disappear from a stack and cannot be hovered

Location: [StackSegment.tsx](../../../frontend/src/bills/charts/StackSegment.tsx), lines 18–19.

Every segment above another loses two pixels of height, and the component returns nothing when the remainder is zero or negative. At a 600 × 240 chart size, put a $4,500 bill first and a $49 bill second on the same due date. The second bill's height is 1.96 pixels before the gap, so it disappears entirely. Its supplier, number and amount cannot be reached through the timeline's tooltip, although the count and hidden table still include it. Which bill disappears depends on its position in the stack.

An additional Vitest reproduction using an unmodified copy of `DueTimeline` rendered two table rows but only one bar. The existing chart tests pass because their stacked values are large enough. The same component can suppress small categories in the spending chart.

This breaks E22's individual bill bars and tooltips, and E23's category stacks. Limit the gap for small positive values and retain a visible, hoverable representation. Cover stacks with substantially different amounts.

### 2. Valid bills can produce totals that lose cents in the browser

Locations: [queries.ts](../../../frontend/src/bills/queries.ts), lines 41–50; [BillsPanel.tsx](../../../frontend/src/bills/BillsPanel.tsx), line 27; [schemas.py](../../../backend/accountable/bills/schemas.py), lines 104–105.

The aggregate API fields are JSON numbers decoded into JavaScript `number`, and the organization's unpaid line also adds totals with `number`. Individual bills fit safely, but their sums need not.

Reproduced through the actual API on a temporary database: create 46 unpaid bills with both amount and tax at the permitted maximum of 100,000,000,000,000 cents each, then another unpaid bill for one cent. These 47 bills are within the documented field and record limits. The API correctly returns `9200000000000001` cents; JSON parsing rounds this to `9200000000000000`. What we owe consequently shows `$92,000,000,000,000.00` instead of `$92,000,000,000,000.01`. The supplier panel's sum loses the same cent, and other aggregate figures have the same exposure.

This requires unusually large balances, but violates the supported amounts and exact totals in E4 and E19–E23. Preserve exact cents through aggregate serialization, parsing, summation and display. Add a regression case whose combined total exceeds `Number.MAX_SAFE_INTEGER`; testing each bill's maximum alone does not exercise this.

## Nits

1. **The Unicode normalization test never sends a decomposed character.** In [test_bills.py](../../../backend/tests/test_bills.py), line 249, both strings in the purported composed/decomposed pair contain U+00E9. The comment says otherwise. Bills currently normalize correctly, but removing their NFC normalization would not fail this case or the other bill-number tests. Use `Cafe\u0301-1` for the second value so the plan's E3 normalization guarantee is actually checked.

2. **The form still disagrees with the API at the calendar's upper boundary.** [BillForm.tsx](../../../frontend/src/bills/BillForm.tsx), lines 26–27, turns `9999-12-20` into a default due date of `10000-01-19`, which the backend refuses. The API clamps its own default to `9999-12-31`. A user must manually correct the generated value to save. This is the previously recorded open nit in `docs/STATUS.md`, confirmed again; align the defaults and test the same boundary on both sides.

## Review passes and validation

- **Bugs:** traced creation, editing, payment and Undo, deletion, filtering, dashboard calculations, charts and shared component changes. The two Important findings and the calendar nit above remain.
- **Security:** reviewed request/authentication guards, database constraints, migration permissions and handling of bill text. No additional finding. No live Supabase deployment was exercised.
- **Matches spec and plan:** compared behavior and tests with the Bills requirements and affected shared requirements. The findings above include the uncovered normalization claim and missing aggregate/chart boundary cases.
- **Described by spec:** checked the updated area files, index and file/test inventories. No additional finding.
- **Standards:** checked substantive architecture, validation and test requirements; excluded style. No additional finding.
- **Validation:** `npm run check` passed: 2,714 backend, 1,281 frontend, 290 end-to-end and 11 speed tests, **4,296 total**, plus formatting, lint, secrets and type checks. The additional chart reproduction failed as described above; the API reproduction confirmed the precision loss. Reproductions used temporary files and a temporary database. No implementation or existing test was edited, and no review-started server remains running.

Only this report was added to the branch. No fixes were applied.
