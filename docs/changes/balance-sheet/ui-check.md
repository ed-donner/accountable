# ui-check: balance sheet

## UI check of http://localhost:5173

Checked: Balance sheet (`/accounting/balance-sheet`) in light and dark mode at 1440x900, signed in as Alex Rivera. That covered the slider, the bars, the columns, the equal mark and the entries dialog. I also glanced at Profit and loss, Journal and Aged balances in dark mode. I left the app in light mode and signed in. The sign-in screen and the other pages were not checked, and I did not check the out-of-balance, error or empty-day states or the sub-1440 layout. I did not read the 3 earlier console log entries that the tool listed (`console-2026-11-06T06-25-19-225Z.log#L1` and `#L2-L4`). Console messages at warning level or above: 0, and nothing loaded from outside localhost.

Screenshots (all in `.playwright-mcp/`): `balance-sheet-light-1440.png`, `balance-sheet-light-dec-1440.png`, `balance-sheet-cash-dialog-light-1440.png`, `balance-sheet-menu-light-1440.png`, `balance-sheet-dark-1440.png`, `balance-sheet-tooltip-dark-1440.png`, `profit-and-loss-dark-1440.png`, `journal-dark-1440.png`, `aged-balances-dark-1440.png`.

### Broken

None.

### Off-brand

1. **Balance sheet, light and dark: the bars don't fill the chart.** The spec (X7) says the two bars share one scale from $0 to the larger side's total, so when the books balance they fill the chart. The axis instead rounds up to a "nice" top. At today's stop the total is $309,788.06 but the axis tops out at $500k, so the bars reach about 62% of the chart height, 136px of 220px. At Dec 31, 2025 the total is $51,242.45 against a $100k top, so they reach about half. The top and halfway ticks read $500k and $250k rather than the total and half of it. Screenshots: `balance-sheet-light-1440.png`, `balance-sheet-light-dec-1440.png`.

### Nits

1. **Entries dialog: it opens with focus on Close.** The spec doesn't say where initial focus goes. Focus did return to the Cash figure button after Escape.
2. **Balance sheet, light: the left Total sits higher than the right Total.** The left column has 2 accounts and the right 4, so the totals don't line up across the page. The mark is centered under the pair, as specced.

### Looked right

- **Slider:** 12 stops from Dec 31, 2025 to Today, the year under Dec and Jan, the chosen name in ink and semibold, an ink thumb with a ring, the track Sea Green up to it. The value reads as the day written out, the name is "Date", and Left, Right and Home worked.
- **Fits the window:** 900px high in both modes with no scroll; the panel is 960px wide and left-aligned.
- **Stops:** every stop from Dec 31, 2025 to today had equal totals, the equal mark, and bars of the same height, redrawn at once with no empty chart.
- **Bars and columns:** segments in the spec's order and colors (the ink segment turns Sea Mist in dark mode); the tooltip gives the account, its figure and the day; totals are in JetBrains Mono; the equal chip is Sea Green with Midnight text.
- **Entries dialog:** 560px wide, titled "Cash up to Nov 6, 2026", with the figure and "Balance on" line, rows with date, words, who and effect; Show more took Cash from 100 to 108 of 108; Escape and Close closed it; Profit to date's 116 entries summed to its figure.
- **Dark mode:** page and panel colors are the spec's.
- **Top bar:** nine sections, none current, on all four Accounting pages; the other three pages still show their placeholders.

## What was done about it

The one off-brand finding was caused by this change and is fixed: `BalanceBars` now runs its scale from $0 to the larger side's total, with the axis ticks at $0, half and the total, so balanced bars fill the chart. A unit test checks that the bar's top reaches the top of the plot. The nits are the spec's own layout and Radix's default focus, and are left as they are. The app was started on a temporary database and stopped afterwards, and its ports are free.
