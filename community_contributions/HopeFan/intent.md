# Intent: currency switch

## Problem

Accountable shows every amount in US dollars. People who sell in Australia, or report to someone who thinks in Australian dollars, have to convert in their head.

## Proposed outcome

A currency choice in the user menu: **US dollar** and **Australian dollar**, each with its flag (🇺🇸 and 🇦🇺). Picking one changes every amount in the app to that currency, and picking the other changes it back. The current currency's flag also shows on the menu button, so you can see which one you're in without opening the menu.

## Constraints

- Stored values stay in USD in the database. The switch changes only how amounts are shown: the backend, its API and its data don't change.
- The choice is remembered in the browser only (local storage), like the theme. US dollar is the default.
- Every amount follows the choice: tables, record pages, the dashboard and its charts, the pipeline totals and cards, and the confirmation messages.
- Amounts in forms: a deal's value is still typed in USD (the currency it is stored in), and the form says so.
- One exchange rate, kept in one place in the code, with the date it was set. No live rate lookups, so the app stays fast and works offline.
- Money is formatted by one function, as today, so no screen formats it on its own.
- No new dependencies unless the plan makes the case for one.

## Not in this change

- More than two currencies, or a list a person can edit.
- Live or historical exchange rates.
- Storing a deal in a currency other than USD.

## Success criteria

1. npm run check passes.
2. A new end-to-end test proves that switching to Australian dollars changes the amounts on the dashboard, a table and the pipeline, that switching back restores them, and that the choice is remembered after a reload.
3. Unit tests cover the conversion and the formatting in both currencies, including the compact chart format.
4. Screenshots of the dashboard and the pipeline in both currencies are saved in docs/changes/currency/.
