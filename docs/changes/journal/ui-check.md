# ui-check: the journal

The last report, from the final run against the app on a temporary sample database, signed in as Alex Rivera, at 1440 wide in light and dark mode. Earlier runs found problems that were fixed (see below).

## UI check of http://localhost:5199

Checked: the seven ledger charts (cash, receivable, payable, tax_payable, owners_equity, revenue, expense_software) in dark and light, each after waiting about 3.5 seconds for the chart to finish drawing. Also `/accounting/journal`, invoice INV-0022 with the first payment's Accounting button open, and bill WT77131 (`/bills/73`), once in each mode. Label positions and fills were measured from the chart SVG, and computed fills read. Console: 0 errors and 0 warnings. Network requests weren't separately inspected. No code or data was changed.

### Broken

None.

### Off-brand

None.

### Nits

1. **Payable, dark and light: the "$25k" label sits right on the fill's top edge.** The fill's top at the right edge is 105.4px in the SVG and the label is centered at 101px, so its baseline touches the edge, with about 0.6px of overlap. It stays readable. The other moved labels clear the edge by a pixel or two: tax_payable "$37.5k" by about 1px, owners_equity "$37.5k" by about 2px.
2. **Light mode: the label colour rule can't be told apart there.** Ink and Midnight are both `rgb(7, 59, 76)` in light mode. In dark the rule holds.

### Looked right

- **Dark mode labels, all seven charts:** labels on the fill are Midnight and labels off it are Sea Mist.
- **Previously straddling labels:** payable "$25k", tax_payable "$37.5k" and owners_equity "$37.5k" no longer straddle the edge. They sit just above it in ink. No other label is hard to read.
- **Month names** sit in a band under the fill on every chart, and the line never crosses them.
- **"so far" and the ringed dot** are present on every chart, with the dashed last segment, and cover no label.
- **Fonts and colors:** the fill is Sea Green, and the axis, month and "so far" text is JetBrains Mono.
- **Journal, INV-0022 with the Accounting button open, and the bill's Details, Notes and Accounting panels** look right in both modes.

## Fixed after earlier runs

- The ledger chart had no "so far" label, and its end dot covered a money label: added the label, and gave the axis room beside the dot.
- Month names were struck through by the balance line: they now sit in a band under the fill.
- Money labels were unreadable in dark mode on or across the fill: Midnight on the fill, ink off it, and a label that would cross the fill's top edge stands just above it.
- The Notes and Accounting panels on a bill touched: they now have the same 12px gap as other panels.
- A payment's opened entry sat tight under its row: more space above it.

Not changed: the ledger charts take a few seconds to draw in on this slow machine (the same entrance animation as the dashboard's charts), and the app has no phone layout (N3), so 390 wide was only informational.
