# Spec: App shell and light and dark mode

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## App shell

- **N1.** A top bar on every screen links to the five sections: Dashboard, Organizations, Contacts, Deals and Pipeline. The app opens on the Dashboard.
- **N2.** Every section and record has its own address, so refresh, back and forward all work.
- **N3.** The app is designed for 1280px wide and up, in light mode and dark mode. There's no phone layout.
- **N4.** Opening a record that no longer exists shows "This deal no longer exists" (or the matching word) with a link back to its section. So does an address that couldn't be a record, such as `/deals/abc`. An unknown address shows "This page no longer exists" with a link to the Dashboard, and keeps the top bar.
- **N5.** If the backend can't be reached, the app says so and says to check that Accountable is still running. It never shows a blank screen.
- **N6.** If a screen's data can't be read for any other reason, the screen says so and offers Try again. What's already showing stays, and a failed read never shows figures or an empty list as if they were real.

## Light and dark mode

- **L1.** A button in the top bar switches between light mode and dark mode on every screen, including the pages in N4 and while the message in N5 is showing. Light mode is the default, whatever the device's own setting.
- **L2.** The choice is remembered in this browser, so it survives a refresh and a restart, and the app opens in it with no flash of light mode first. Another browser starts in light mode. `npm run seed` and `npm run empty` leave the choice alone, because it isn't data.
- **L3.** Dark mode covers everything on screen: panels, tables, forms, record pages, the pipeline board, every chart, dialogs, picker lists, chart tooltips, messages, and the browser's own date pickers, select lists and scrollbars.
- **L4.** Switching is instant, with no reload and no fade, and changes nothing but the colors.
- **L5.** Text in dark mode meets the same contrast rules as light mode, set out in [Color tokens](visual-design.md#color-tokens).

## Screens

### Shell

A rounded bar in the panel color across the top holds the Accountable wordmark, set in Instrument Sans, then the five sections with icons and labels, then at the far right the mode button and today's date. The current section is a Sea Green pill with Midnight text, in both modes.

The mode button sits just before the date. It's a 32px round icon button showing a moon in light mode and a sun in dark mode, both from lucide-react. Its label for screen readers says what it will do: "Switch to dark mode" or "Switch to light mode". On hover it takes the page color, like the section links.

Messages appear at the bottom center, on the raised surface in ink, rounded like cards, with a soft shadow and no outline. Their icons are in ink too. The bar floats on the page background with space around it, so there's no line across the top of the page. There's no logo yet: `assets/accountable.jpg` is the course illustration.
