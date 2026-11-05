# Plan: money

This plan turns the money intent into build work. The intent wins over the spec and the spec wins over this plan. There's no backend change and no new dependency. The baseline for the look is the commit the branch started from, `d98f638`.

## The design

```
Money
+---------------------------------------------+ +---------------------------------------------+
| Owed to us              Overdue             | | What we owe             Overdue             |
| $48,250.00              $9,120.00           | | $24,310.00              $3,150.00           |
| 14 invoices             5 invoices          | | 9 unpaid bills          3 bills             |
|                                             | |                                             |
| How late                                    | | Due in the next 30 days  $14,200.00 7 bills |
| Not yet due   [==========]   $39,130.00   9 | |   bars at each due date, Today to Dec 5     |
| 1 to 30 days  [==]            $4,800.00   2 | |                                       $10k  |
| ...                                         | | Today   Nov 12   Nov 19   Nov 26   Dec 3    |
+---------------------------------------------+ +---------------------------------------------+
+---------------------------------------------+ +---------------------------------------------+
| Payments received in November               | | Spending in November   o Software ...      |
| $3,400.00   October $11,250.00              | | $1,240.00   October $18,240.00   ...       |
|   one ink column a month, "so far"   $40k   | |   stacked columns in category colors  $20k  |
| Dec  Jan  Feb ...                    Nov    | | Dec  Jan  Feb ...                    Nov    |
+---------------------------------------------+ +---------------------------------------------+
```

The left column is the invoices area's, the right the bills area's. The rows come from one grid with subgrid columns, so a "Couldn't refresh this" line above one side moves both sides' panels down together and the rows stay level.

## Files that change

### Frontend

| File | Change |
|---|---|
| `frontend/src/components/MoneySection.tsx` | New. The section's frame and the parts both sides share: `MoneySection` (the heading and the two-column grid), `MoneyColumn` (one side, with its failed read), `OwingPanel` and `MoneyFigure` (the first row), `MonthsPanel` (the second row) |
| `frontend/src/components/charts/monthColumns.tsx` | New. What both month charts share: their margins, column width, money axis and "so far" label |
| `frontend/src/App.tsx` | Puts `InvoicesMoney` and `BillsMoney` side by side in `MoneySection` |
| `frontend/src/invoices/MoneySection.tsx` | Builds invoices' side from the shared parts. Nothing owed shows the figures at $0.00 |
| `frontend/src/invoices/charts/PaymentsChart.tsx` | The shared month chart layout: money axis on the right, every month labeled, the shared column width |
| `frontend/src/bills/charts/MoneySection.tsx` | Builds bills' side from the shared parts. The Bills to pay heading goes, so the panel leads with What we owe, as invoices' leads with Owed to us. Spending gets its month heading, with the legend beside it |
| `frontend/src/bills/charts/SpendingChart.tsx` | The shared month chart layout. The total above this month's column goes, since the heading has it. The legend moves out to the heading |
| `frontend/src/bills/charts/DueTimeline.tsx` | Its money axis takes the shared width, so it lines up with the spending chart's below |

### Tests

| File | Change |
|---|---|
| `frontend/src/invoices/MoneySection.test.tsx` | Nothing owed shows $0.00 and 0 invoices |
| `frontend/src/bills/charts/MoneySection.test.tsx` | The panel is What we owe, not Bills to pay. Spending's heading, this month's total and last month's, and its "so far" |
| `frontend/src/App.test.tsx` | The four panels' names, in order. A new test: one side failing to load leaves the other showing |
| `e2e/dashboard.spec.ts` | The panels' names. A check that the two sides sit side by side, level and the same size |
| `e2e/bills.spec.ts`, `e2e/data.spec.ts` | The bills panel's new name, What we owe |

The other tests that name the section's parts, `e2e/invoices.spec.ts`, `e2e/problem.spec.ts`, `e2e/menu.spec.ts`, `e2e/failures.spec.ts` and `frontend/src/main.test.tsx`, use names that don't change. Searched for: `Bills to pay`, `Owed to us`, `Payments received`, `Spending by category`, `so far`, `due-total`, `paid-this-month`.

### Docs

| File | Change |
|---|---|
| `docs/spec.md` | The summary says the section has the two sides side by side |
| `docs/specs/dashboard.md` | H10 and the Money section's screen |
| `docs/specs/invoices.md` | V29, V30 and invoices' side's screen |
| `docs/specs/bills.md` | E20, E22, E23 and bills' side's screen |
| `docs/specs/visual-design.md` | Charts, type and words for the section |
| `docs/specs/architecture.md` | The two new files, and rows becoming sides |
| `docs/specs/frontend.md`, `docs/specs/backend.md`, `docs/specs/testing.md` | Rows becoming sides, and the new tests |
| `docs/STATUS.md` | What this change did, and the user guide's description of the section |

## Proof

`npm run check`, then the section checked in the browser at 1440 by 900 in light and dark mode, with the sample data and with an empty database.
