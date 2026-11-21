# Intent: dark mode

## Problem

Accountable only has a light mode, and some people prefer a dark screen.

## Proposed outcome

A dark mode with a toggle on every page, across every section.

## Constraints

- Light mode stays the default, and the app remembers the choice.
- The choice is kept in the browser (localStorage) and read before the page draws, so a reload never flashes light mode. Nothing changes in the backend or the database.
- Dark mode uses the brand's dark surfaces: a `#04232E` page with black panels and cards. The top bar and the band under it stay Midnight (`#073B4C`).
- Light mode looks exactly as it does today, apart from the toggle.
- Colors stay in one place, as tokens, with no scattered overrides.
- Text in dark mode meets the same contrast rules as spec.md.
- Charts, dialogs and messages follow the mode too.
- No new dependencies unless the plan makes the case for one.

## Not in this change

- Following the device's own dark mode setting.
- A layout for phones.

## Success criteria

1. npm run check passes.
2. A new end-to-end test proves that the toggle works and is remembered after a reload.
3. Screenshots of the dashboard and the pipeline in both modes are saved in docs/changes/dark-mode/.
4. A one-off pixel comparison shows light mode didn't shift: every page is screenshotted in light mode at 1440x900 before and after the change, the only difference is the toggle, and the result is recorded in docs/changes/dark-mode/. It isn't kept as a test.
