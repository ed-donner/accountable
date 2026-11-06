# UI check: aged balances

Checked at http://localhost:5173 on a fresh temporary database with the sample data, signed in as Alex Rivera, at 1440 by 900.

**Checked:** Aged balances' Customers view, Suppliers view, a row opened to its items, the legend, the totals row, a bar tooltip, an earlier day (Sep 27, 2026) with "Back to today", and the empty state (Jan 1, 2020), in light mode and dark mode, except that the Suppliers view and the earlier-day view weren't looked at in dark. Also the dashboard's Money section in both modes, the user menu, and the Journal placeholder in light mode. Profit and loss and Balance sheet placeholders and the sign-in screen weren't opened.

Screenshots are in `.playwright-mcp/`: `aged-customers-light-1440.png`, `aged-open-light-1440.png`, `aged-tooltip-light-1440.png`, `aged-suppliers-light-1440.png`, `aged-earlier-suppliers-light-1440.png`, `aged-empty-light-1440.png`, `menu-light-1440.png`, `aged-customers-dark-1440.png`, `dashboard-dark-1440.png`, `dashboard-light-1440.png`, `journal-light-1440.png`.

## Broken

None.

## Off-brand

None. Fonts confirmed by computed styles: Instrument Sans Variable and JetBrains Mono Variable only. Dark page background `rgb(4, 35, 46)`. No console errors or warnings, no requests to outside addresses.

## Nits

1. **Aged balances, light and dark: the tooltip's order differed from the spec.** It showed the amount first, then the organization, then the part. X13 lists the name, the part with its swatch, the amount, then the count. *Fixed:* the tooltip now shows them in that order.
2. **Aged balances, light: the bar column changed width between views.** On Suppliers, long names such as "Fieldstone Development" wrapped onto two lines and moved the amount columns. *Fixed:* the name column is at least 240px and doesn't wrap.
3. **Aged balances, light: "Back to today" looks like plain bold text.** It is the standard secondary button, whose page-colored background is the same as the page it sits on in the header. *Not changed:* the spec calls for a secondary button, and it looks the same elsewhere.

## Looked right

- Customers: title, segmented control (current view in Sea Green with Midnight text), description line, legend with five round swatches, panel with no outline, space between rows, no line above the totals row, monospace amounts with muted `$0.00`, 2px gaps in bars, a small $320.00 segment still visible, part colors Cerulean, Marigold, Coral, Raspberry, Deep Raspberry, and a row opening to its items with the chevron turned down.
- Suppliers: toggles with `?view=suppliers`, a row opens, totals row present.
- Earlier day: `on=2026-09-27` in the address, "Balances as of Sep 27, 2026" and "Back to today" appear, figures change.
- Empty state: "Nothing owed." with "Customers owe nothing on this day." and the legend still showing.
- Dark mode: dark panel with adjusted part colors, tooltip on the raised surface, nothing cut off. X19 holds: at least two organizations in each part, several in more than one.
- Dashboard's Money section, both modes: How late has five colors in the same order, with figures matching the Customers totals.
- User menu lists the four Accounting links, and the Journal placeholder still says "This report is coming soon."
