# ui-check: Profit and loss

Checked at http://localhost:5173 on a temporary database with the sample data, signed in as Alex Rivera, in light and dark mode at 1440 by 900. Page: `/accounting/profit-and-loss`, with the Dashboard's Spending by category (dark) and the Journal placeholder (dark) as neighbours. Not checked: the Dashboard and Journal in light mode, other widths, the sign-in screen. Console: no errors or warnings.

## Broken

None.

## Off-brand

None.

## Nits

1. **Category names in the statement were semibold** (both modes). Only Revenue, Total expenses and Profit should be. Fixed: the row names take their weight from the row.
2. **The chart tooltip leads with "Profit $…" and puts the month under it** (X10 names the month first). The content is complete. Left as it is: the dashboard's tooltips also lead with the value (`ChartTooltip`).
3. **The page is about 990px tall at 1440 by 900**, so the Profit margin row is just below the fold. The spec doesn't require it to fit. Left.
4. **The entries dialog's event word sat almost against the link's underline.** Fixed: a small gap before it.
5. **No Accounting link in the top bar.** The pages are reached from the user menu's Accounting group, as J15 says. Not this change.

## Looked right

Layout, the 12-month chart (years under Dec and Jan, "so far" under Nov, profit points below zero in Jan and Feb, one-line legend), the statement (switch, arrows with "Later period" off on the current month, label with "so far", "Change from October 2026", six categories with $0.00 muted, JetBrains Mono amounts, margin and points), Quarter and Year (Q3 2026 matches Jul to Sep; the earliest period has its back arrow off and shows New and dashes), the entries dialog from a statement amount and from a chart column (amounts sum to the total, links, Close, Escape returning focus), dark mode, fonts, and the Dashboard's Spending panel matching November's expenses.
