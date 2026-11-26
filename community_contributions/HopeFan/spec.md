# Currency: US and Australian dollars

Part of the Accountable spec. The index is in `docs/spec.md`. The menu it lives in: `docs/specs/accounts.md`.

## Requirements

- R55. The user menu (`docs/specs/accounts.md`, R48) has a currency choice with two options: **US dollar** 🇺🇸 and **Australian dollar** 🇦🇺, one marked as selected, between the theme choice and **Sign out**. Choosing one changes every amount in the app at once, with no reload, and choosing the other changes it back.
- R56. US dollar is the default for someone who hasn't chosen. The choice is remembered in the browser only (local storage), so it belongs to that browser and not to the account or the database. It is applied before the first amount is drawn, so a reload never shows US dollars first.
- R57. The initials button shows the flag of the current currency as a small badge at its corner, so the currency is visible with the menu closed. The button's accessible name stays "User menu", and its tooltip (`title`) names the currency, for example "Australian dollar".
- R58. Every amount follows the choice: table cells, record pages, the pipeline's totals, cards and column headers, the dashboard's tiles, charts, axes, tooltips and funnel, and confirmation messages. Axis titles and labels name the current currency (for example "Revenue won (AUD)"). Nothing is left in the other currency.
- R59. Stored values never change. The database, the API and the data model stay in whole US dollars, and the switch is only how amounts are shown. A deal's value in a form is always typed and edited in USD, and its label says so ("Value (USD)"), in both currencies. A saved value reads back unchanged after switching currency and back.
- R60. One fixed exchange rate converts USD to AUD, defined in one place in the frontend with the date it was set. There are no live lookups. Converted amounts are rounded to whole dollars, so a total shown in AUD can differ from the sum of the rounded figures beside it by a dollar or two. That is accepted.
- R61. Sorting and filtering a table use the displayed currency's amounts, so the order is the same in both currencies.

## Formats

- US dollar: `USD 48,000`, compact `USD 50k`, as before.
- Australian dollar: `AUD 72,960`, compact `AUD 76k`. The same shapes with `AUD` in place of `USD`, so the code is always in the text and a flag is never the only signal.
- Negative amounts keep their minus sign in front, as before.

## Design

- The two options are radio-style items like the theme's, each with its flag, its name and a check on the selected one. A thin rule separates the currency group from the theme group, and a label ("Currency") sits above it, in the same small muted text as the theme's label.
- The badge is a 16px circle with a ring in the panel color, at the lower right of the initials circle. It uses the flag's emoji, drawn by CSS from a `data-flag` attribute so it is not part of the button's text, and no image files are added. It is decorative (`aria-hidden`), because the button's name already says the currency.
- The stat tiles on the dashboard show the currency code as a small label before the number on the same line, as they do for USD today, so they follow the same rule for AUD.
- The rate is an approximation for display, not for accounting, and the app says nothing about it on screen apart from this spec.

## Tests

- **Frontend (Vitest)**: conversion and rounding, `money` and the compact form in both currencies, negative amounts, the stored choice and its failure when local storage is blocked, the menu's new group, and the badge.
- **End to end (Playwright)**: switch to AUD and see the dashboard, a table and the pipeline change, switch back and see them restore, reload and see the choice kept, and check that a deal's edit form still says USD.
