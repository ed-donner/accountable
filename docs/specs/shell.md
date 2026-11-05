# Spec: App shell, the menu and the theme

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## App shell

- **N1.** Once signed in, a top bar on every screen links to the five sections: Dashboard, Organizations, Contacts, Deals and Pipeline. It also holds the search box ([Search](search.md#search)), today's date and the menu. The app opens on the Dashboard. Signed out, there's no top bar, only the sign-in screen (U1).
- **N2.** Every section and record has its own address, so refresh, back and forward all work.
- **N3.** The app is designed for 1280px wide and up, in light mode and dark mode. There's no phone layout.
- **N4.** Opening a record that no longer exists shows "This deal no longer exists" (or the matching word) with a link back to its section. So does an address that couldn't be a record, such as `/deals/abc`. An unknown address shows "This page no longer exists" with a link to the Dashboard, and keeps the top bar.
- **N5.** If the backend can't be reached, the app says so, and it never shows a blank screen. In the local copy, it says to check that Accountable is still running. In the shared app, it says to check the internet connection.
- **N6.** If a screen's data can't be read for any other reason, the screen says so and offers Try again. What's already showing stays, and a failed read never shows figures or an empty list as if they were real.
- **N7.** A round button at the far right of the top bar shows the signed-in person's initials (U8) and opens the menu. The menu shows their name and email, the theme (L1), Company settings ([B2](settings.md#company-settings)) and Sign out (U5).

## Theme

- **L1.** The menu offers three themes: Light, Dark and System. Light and Dark show that mode. System shows the mode the device is set to, and switches as soon as the device does, with the page open. The menu, and so the theme, is there on every screen once signed in, including the pages in N4 and while the message in N5 is showing.
- **L2.** The choice is remembered in this browser, so it survives a refresh, a restart and signing out, and the app opens in it with no flash of the other mode first, the sign-in screen included. A browser with no saved choice starts in Light, whatever the device's setting. The theme belongs to the browser, not the person, so whoever signs in next sees the same one. `npm run seed` and `npm run empty` leave it alone, because it isn't data.
- **L3.** Dark mode covers everything on screen: the sign-in screen, panels, tables, forms, record pages, the pipeline board, every chart, dialogs, the menu, search results, picker lists, chart tooltips, messages, and the browser's own date pickers, select lists and scrollbars.
- **L4.** Switching is instant, with no reload and no fade, and changes nothing but the colors. That includes System following the device.
- **L5.** Text in dark mode meets the same contrast rules as light mode, set out in [Color tokens](visual-design.md#color-tokens).

## Screens

### Shell

A rounded bar in the panel color across the top holds the Accountable wordmark, set in Instrument Sans, then the five sections with icons and labels. At the right, in this order, come the search box, today's date and the menu button. The current section is a Sea Green pill with Midnight text, in both modes.

The menu button is a 32px circle in Marigold with the initials in Midnight, in the label style, in both modes. Marigold keeps it apart from the Sea Green pill of the current section. Its label for screen readers is "Menu for Alex Rivera", with the person's name. Until the app has read who's signed in, or if it can't, such as while the message in N5 shows, the button shows a person icon in place of initials and is labeled "Menu", and the menu holds the themes, Company settings and Sign out without a name, so the theme can still be changed.

The menu opens below the button, lined up with its right edge, 240px wide, on the raised surface with a soft shadow, rounded like picker lists. At the top are the name in ink, semibold, and the email in muted ink. Someone with no display name has their email as their name (U8), so it shows once. Then comes "Theme" as a label in muted ink, over Light, Dark and System, each with its lucide-react icon (sun, moon, monitor) and a check mark beside the current choice. Last come Company settings and Sign out, with no icons. The groups are separated by space, not lines. It's built with Radix's dropdown menu, so the arrow keys move through it, Enter or Space chooses, and Escape closes it and puts focus back on the button. Choosing a theme applies it at once and closes the menu. Choosing Company settings closes the menu and opens the [Company settings page](settings.md#company-settings-page).

Messages appear at the bottom center, on the raised surface in ink, rounded like cards, with a soft shadow and no outline. Their icons are in ink too. The bar floats on the page background with space around it, so there's no line across the top of the page. There's no logo yet: `assets/accountable.jpg` is the course illustration.

The [sign-in screen](sign-in.md#sign-in-screen), [search results](search.md#search-box-and-results) and the [Company settings page](settings.md#company-settings-page) have their own files.
