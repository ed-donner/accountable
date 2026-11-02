# Intent: dark mode

## Problem

Accountable only has a light mode, and some people prefer a dark screen.

## Proposed outcome

A dark mode with a toggle on every page, across every section.

## Constraints

- Light mode stays the default, and the app remembers the choice.
- Light mode looks exactly as it does today, apart from the toggle and messages, which move onto the brand colors.
- Colors stay in one place, as tokens, with no scattered overrides.
- Text in dark mode meets the same contrast rules as spec.md.
- Charts, dialogs and messages follow the mode too.
- No new dependencies unless the plan makes the case for one.

## Decisions

- **Surfaces:** dark mode keeps the brand skill's page `#04232E` and Sea Mist `#CDD8DB` ink, but not its black panels. Clarity and good contrast come ahead of strict adherence to the brand colors, so panels and cards are a step lighter than the page, and dialogs, picker lists, chart tooltips and messages a step lighter again.
- **Messages:** in both modes, messages use the brand's tokens in place of Sonner's own near-black text and grey outline. This is the one change to light mode besides the toggle.
- **Won and Midnight marks:** in dark mode, the Won stage, the revenue line and the deals-won bars turn Sea Mist. Won becomes a Sea Mist block with Midnight text. This is the one exception to "a stage keeps its color everywhere", and the spec says so.
- **Toggle:** a small round icon button in the top bar, at the far right just before today's date. It shows a moon in light mode and a sun in dark mode, with a label for screen readers.
- **Remembering the choice:** saved in the browser's own storage, not the database. No backend change, and the page opens in the right mode with no flash of light first. Another browser starts in light mode, and `npm run seed` and `npm run empty` leave the choice alone.

## Not in this change

- Following the device's own dark mode setting.
- A layout for phones.

## Success criteria

1. npm run check passes.
2. A new end-to-end test proves that the toggle works and is remembered after a reload.
3. Screenshots of the dashboard and the pipeline in both modes are saved in docs/changes/dark-mode/.
