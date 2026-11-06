# ui-check report: the books

Checked at http://localhost:5173 on a temporary database, signed in as Alex Rivera, at 1440 by 900.

**Checked:** the four Accounting pages in light and dark mode, `/accounting` redirecting, `/accounting/no-such-page` in both modes, and the user menu open in both modes. It made no saves or edits.

**Not checked:** other sizes, the menu's arrow keys, Enter, Space and Escape, the System theme, and the pages with the network off.

## Broken

None.

## Off-brand

None.

## Nits

None.

## Looked right

- **Profit and loss, light:** title in Instrument Sans 28px semibold in Midnight. Panel 560px wide, left-aligned, white, 16px radius, no border, shadow or gradient. Info icon in Cerulean `#118AB2`, "This report is coming soon." semibold in ink, and the sentence under it in muted ink, matching J16 word for word. No scrolling, no section marked current, page background `#F0F4F5`. No console errors or warnings, nothing loaded from outside localhost, and all three fonts loaded.
- **Balance sheet, Journal, Aged balances, light:** the same layout and J16's words, no exclamation marks (from screenshots).
- **Dark mode, all four:** page `#04232E`, panel `#0B3240`, title and lead line `#CDD8DB`, sentence `#9AB1B8`, icon still Cerulean, no border or gradient (computed styles for Profit and loss, screenshots for the rest).
- **`/accounting`** redirects to `/accounting/profit-and-loss`.
- **`/accounting/no-such-page`** shows "This page no longer exists" with Back to Dashboard, in both modes, and keeps the top bar.
- **User menu, both modes:** 240px wide. An Accounting group between the themes and Company settings, with a muted 13px semibold label like "Theme" and four links with no icons or check marks. Each link is 36px tall like a theme row, and groups are separated by space, not lines. Choosing Balance sheet closed the menu and opened the page.
- **Console:** 27 messages over the session, none errors or warnings.

Screenshots are in `.playwright-mcp/`, such as `profit-and-loss-light-1440.png`, `journal-dark-1440.png` and `menu-light-1440.png`.
