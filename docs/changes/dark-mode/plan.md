# Plan: dark mode

This plan turns the dark-mode intent and the spec, already updated on this branch, into build work: which files change, in what order, what could go wrong and how we'll know it works. IDs such as L2 and P6 are the spec's requirements. The intent wins over the spec and the spec wins over this plan. If the build shows the spec is wrong, fix the spec in the same commit and say so in `docs/STATUS.md`.

Every color value comes from the spec's [Color tokens](../../spec.md#color-tokens) table. This plan names tokens but doesn't repeat their values, so there's one list to keep right.

There's no backend change and no new dependency. lucide-react already has `Moon` and `Sun`, and Sonner and Tailwind already do what's needed.

## Files that change

### Docs

| File | Change |
|---|---|
| `docs/spec.md` | Already updated on this branch. Changes only if the build shows it's wrong |
| `docs/STATUS.md` | Dark mode added to what's done, at the end |
| `docs/changes/dark-mode/` | This plan, and `dashboard-light.png`, `dashboard-dark.png`, `pipeline-light.png` and `pipeline-dark.png` at the end |

### Frontend: existing files

| File | Change |
|---|---|
| `frontend/index.html` | A short inline script at the top of `<head>` that reads the saved mode and, for dark, sets `data-mode="dark"` and `color-scheme: dark` on `<html>` before anything draws |
| `frontend/src/styles.css` | New tokens in `@theme`: `raised`, `on-won`, `midnight`, `line`, `focus`, `veil`, and the shadows `dialog`, `popover`, `tooltip`, `lift` and `message`. A `:root[data-mode="dark"]` block giving every token that changes its dark value. Sonner's color variables set from the tokens. The focus ring, `link`, `btn-primary` and `btn-danger` pointed at tokens. `--color-sea-mist` removed once nothing uses it |
| `frontend/src/test-setup.ts` | Clears the saved mode, `data-mode` and `color-scheme` after each test, so one test's mode can't leak into the next |
| `frontend/src/components/Shell.tsx` | The mode button just before the date. The current section's pill gets `text-midnight`, because it inherits ink today |
| `frontend/src/components/Chip.tsx` | The Sea Green, Marigold and Coral tones use `text-midnight`. The `midnight` tone becomes `won`: `bg-ink text-on-won` |
| `frontend/src/crm/StageChip.tsx` | Won uses the renamed `won` tone |
| `frontend/src/components/FormDialog.tsx`, `ConfirmDelete.tsx` | `bg-raised`, `bg-veil` in place of `bg-ink/40`, `shadow-dialog` |
| `frontend/src/components/RecordPicker.tsx` | `bg-raised`, `shadow-popover` |
| `frontend/src/crm/charts/ChartTooltip.tsx` | `bg-raised`, `shadow-tooltip` |
| `frontend/src/crm/board/DealCard.tsx` | `shadow-lift` in place of the literal shadow |
| `frontend/src/crm/board/Column.tsx` | Sea Green, Marigold and Coral heads use `text-midnight`. Won is `bg-ink text-on-won`. The drop slot is `bg-line/50` |
| `frontend/src/crm/Timeline.tsx` | Call, Email and Note icons use `text-midnight` |
| `frontend/src/crm/pages/Contacts.tsx` | The selected status filter pill gets `text-midnight`, because it inherits ink today |
| `frontend/src/crm/pages/Dashboard.tsx` | Both scrollbars use the `line` token |
| `frontend/src/crm/charts/stageColors.ts` | Text on the bright fills is `midnight`. Won's text is `on-won`. White comes from a token, not `#ffffff` |
| `frontend/src/crm/charts/RevenueChart.tsx` | Month labels in `midnight`. Each money label in `midnight` or ink, depending on whether it sits on the fill. The end dot ringed in `panel`, not `#fff` |
| `frontend/src/crm/charts/geometry.ts` | A pure function that says whether a money label's middle falls on the fill, given the label's position and the fill's height at the right-hand edge |
| `frontend/src/crm/charts/SalesFunnel.tsx` | Leader lines use the `line` token |

`DealsWonChart.tsx` and `PipelineBand.tsx` need no change: they already use tokens that will take dark values (ink, `bar-soft`, grid, muted, page) or go through `stageColors.ts`.

### Frontend: new files

| File | What it holds |
|---|---|
| `frontend/src/lib/mode.ts` | The storage key `accountable-mode`, reading the saved mode (light if it's missing, unknown or can't be read), saving it, and applying it to `<html>` |
| `frontend/src/components/ModeButton.tsx` | The 32px round button with lucide's `Moon` or `Sun`, labelled "Switch to dark mode" or "Switch to light mode". It keeps the mode in state, starting from the saved choice |
| `frontend/src/lib/mode.test.ts`, `components/ModeButton.test.tsx`, `colors.test.ts` | See [Proof](#proof) |

### Tests: existing files

| File | Change |
|---|---|
| `frontend/src/components/Shell.test.tsx` | The mode button is in the bar, just before the date, on every section |
| `frontend/src/crm/charts/geometry.test.ts` | Cases for the money-label function |
| `frontend/src/crm/charts/charts.test.tsx` | Text colors on the fills, and the end dot's ring |
| `e2e/quality.spec.ts` | The Tab-through counts go up by one, for the new button on every screen |
| `e2e/mode.spec.ts` | New. See [Proof](#proof) |

## Order of work

Four phases. Each ends with `npm run check:quick` passing, and Phase 4 ends with `npm run check`. Commit at the end of each phase.

### Phase 1: light mode on tokens, with no visible change

Every color moves onto a token, still with light values only, so this phase can be proved to change nothing.

1. Add the new tokens to `@theme` with their light values. `veil` is Midnight at 40%, and each shadow takes the exact value its component uses today.
2. Replace every literal color and every misused token in the files listed above. That means `#fff`, `#ffffff`, the four `rgba(7,59,76,…)` shadows, `bg-ink/40`, every `text-ink` on Sea Green, Marigold and Coral, the two pills that inherit ink, and every use of `sea-mist`.
3. Rename the chip's `midnight` tone to `won`.
4. Add `colors.test.ts`.
5. Compare light mode with `main`, as set out under [By hand](#by-hand). There's no button yet, so nothing is masked, and any difference at all is a bug.

Done when the unit tests pass and the comparison shows no difference.

### Phase 2: the switch

1. Add the dark block to `styles.css` with every dark value from the spec's table.
2. Write `lib/mode.ts`, then `ModeButton.tsx`, then put the button in `Shell.tsx`.
3. Add the inline script to `index.html`. It does only what `lib/mode.ts` does for a saved dark choice, and it fails quietly to light.
4. Clear the mode between tests in `test-setup.ts`.
5. Write `mode.test.ts`, `ModeButton.test.tsx` and the `Shell.test.tsx` cases. Write the first six tests of `e2e/mode.spec.ts`, which cover switching, remembering, no flash, every screen and keeping what's on screen. Raise the Tab counts in `quality.spec.ts`.

Done when the toggle works on every screen, is remembered after a reload, and a saved dark choice is in place before the app's script runs.

### Phase 3: dark mode everywhere

1. Add the money-label function to `geometry.ts` and use it in `RevenueChart.tsx`. Set the month labels to `midnight` and the end dot's ring to `panel`.
2. Set Sonner's color variables, radius and shadow from the tokens. This is also when light-mode messages change, the one planned change to light mode besides the button.
3. Write the dark-mode contrast sweep and the remaining tests in `e2e/mode.spec.ts`. Run the sweep and fix whatever it finds. Text that inherits ink onto a bright fill is the likely kind.
4. Walk every screen in dark mode in Chrome. That covers each section, a record page, both dialogs, a dialog on top of a dialog (F3), a picker list, a chart tooltip, a message, a drag on the board, and the date and select controls.

Done when the sweep passes in both modes and the walk-through finds nothing.

### Phase 4: finish

1. Compare light mode with `main` again, masking only the mode button's area.
2. Take the four screenshots.
3. Walk through by hand at 1440 by 900 and 1280 by 720, in both modes.
4. Update `docs/STATUS.md`.
5. Run `npm run check` until it passes.

## Risks

Most damaging first. Where a risk says "checked", it was confirmed while writing this plan, by reading the package's source.

1. **The screenshots or a by-hand run wipe real data.** Both need sample data, and `npm run seed` on the everyday database would replace the user's real records. Never seed, empty or open `data/accountable.db`. Start a separate copy of the app on a temporary database through `ACCOUNTABLE_DB`, on its own ports, the way the tests do, and close it afterwards. Phases 1 and 4.
2. **Text disappears on the bright fills in dark mode.** Seven places put ink on Sea Green, Marigold or Coral. Once ink turns Sea Mist, that text falls to about 1.3:1. Five of them say `text-ink` and can be found by searching: the chips, the column heads, the timeline icons, `stageColors.ts` and `btn-primary`. Two inherit ink and can't be found that way: the current section's pill and the selected status filter. There may be others. Phase 1 moves all the known ones to `midnight`, and the contrast sweep in Phase 3 finds any that were missed. Phases 1 and 3.
3. **Light mode drifts by a shade.** The intent says light mode looks exactly as it does today, apart from the button and messages. Moving values into tokens can still shift a pixel. For example, `bg-ink/40` is mixed by Tailwind in oklab, and a token written as `rgb(… / 40%)` might not come out identical. The light comparison with `main` catches this, after Phase 1 and again at the end. If a token can't match exactly, it keeps the form that does match.
4. **A flash of light mode on every load.** Vite's dev server delivers the styles through JavaScript, so until the app's script runs, the page has no styles at all. Module scripts wait until the page has been read, so only a classic inline script at the top of `<head>` runs early enough. Setting `color-scheme: dark` there makes Chrome paint that early moment dark. The no-flash test holds back `main.tsx` and checks the page is already dark. Phase 2.
5. **The storage key is written in two places.** The inline script in `index.html` and `lib/mode.ts` both name `accountable-mode`. If the two drift apart, the reload still ends up dark once React starts, so only the flash shows it. A Vitest case runs the script from `index.html` in jsdom with the key taken from `mode.ts`. Phase 2.
6. **Sonner's own styles win.** Sonner adds its stylesheet to the page while the app runs (checked), so it may come after ours, and it sets its colors on `[data-sonner-toaster][data-sonner-theme='light']`. Our rule needs a more specific selector, and the end-to-end test checks the message's computed colors in both modes. Sonner gives its icons no color of their own (checked), so they take the text color. Phase 3.
7. **The dark block loses to Tailwind's variables, or a variable is missing.** Tailwind puts `@theme` variables in its `theme` layer, and any rule outside a layer beats them, so the dark block goes outside any layer. Tailwind may only output theme variables it sees used. A token used only inside a TypeScript string, such as `var(--color-midnight)` in `stageColors.ts`, relies on Tailwind's scan finding it, as `--color-grid` does today. Check the served CSS for each new variable. `colors.test.ts` also checks that every variable the dark block sets exists in `@theme`, so a typo can't fail silently. Phases 1 and 2.
8. **The contrast sweep has blind spots.** It reads CSS colors, so it can't judge SVG text drawn over an SVG shape, such as the revenue chart's labels on the fill. It also doesn't account for opacity. So it checks HTML text only, skips disabled controls, and allows exactly the two agreed exceptions: white on the brand's Cerulean and Raspberry fills. The chart text on fills is covered by Vitest instead. It runs in light mode too, as a control. If light mode fails it today, stop and take that to the project owner rather than change light mode. Phase 3.
9. **Existing tests count Tab stops.** `quality.spec.ts` tabs 18, 16 and 10 times, and the new button adds a stop before each page's content. Raise each count by one, and keep every check that the controls are still reached. Phase 2.
10. **The revenue chart has two accepted weak spots.** The spec accepts that the Sea Mist line reads as a pale rim on the fill, and that a money label lying across the top of the fill is hard to read whichever color it takes. The function decides by the label's middle and is tested right at the edge. The dark screenshot is where the project owner judges both. Phases 3 and 4.
11. **The browser's own controls can't be tested automatically.** Date pickers and select lists open outside the page, where Playwright can't see them. The test checks they get `color-scheme: dark`, and the by-hand walk checks they look right. Phases 3 and 4.
12. **One test's mode leaks into the next.** jsdom keeps `localStorage` and `<html>` attributes between tests in a file. `test-setup.ts` clears them after each test. Each Playwright test gets a new browser context, so it always starts in light mode. Phase 2.

## Proof

`npm run check` runs everything below and fails if anything fails. The backend doesn't change, so the pytest suite stays as it is and must still pass.

The intent's success criteria:

1. `npm run check` passes, at the end of Phase 4.
2. The toggle works and is remembered after a reload: `e2e/mode.spec.ts`, the first two tests below.
3. Screenshots of the dashboard and the pipeline in both modes: [By hand](#by-hand).

### Unit tests (Vitest)

| File | What it proves | Requirements |
|---|---|---|
| `lib/mode.test.ts` | No saved choice, an unknown value, or storage that throws on reading all give light. A saved dark choice gives dark. Saving writes the key and sets `data-mode` and `color-scheme` on `<html>`. Storage that throws on writing still switches the mode. The script in `index.html`, run in jsdom, applies a saved dark choice under the same key as `mode.ts`, and leaves light alone. | L1, L2 |
| `components/ModeButton.test.tsx` | In light mode it shows a moon and is labelled "Switch to dark mode". A click switches to dark, saves it, and shows a sun labelled "Switch to light mode". A second click switches back. Enter and Space work as well as a click. | L1, L4, Q3 |
| `components/Shell.test.tsx` | The mode button is in the top bar, just before the date, on every section and on a record's address. | L1 |
| `colors.test.ts` | No app file in `frontend/src` other than `styles.css` names a color value such as `#fff`, `rgb(…)` or `hsl(…)`. Every variable set in the dark block exists in `@theme`. | Color tokens |
| `crm/charts/geometry.test.ts` | A money label is on the fill when its middle is below the fill's top and off it when its middle is above, including the cases right at the edge and a label lying across it. | Charts |
| `crm/charts/charts.test.tsx` | The revenue chart's month labels, and money labels below the fill's top, use `midnight`. Those above it use ink. The end dot is ringed in `panel`. Funnel and band text on Sea Green, Marigold and Coral uses `midnight`, and on Won uses `on-won`. | Charts, L5 |

The existing page, board and chart tests must still pass after the Phase 1 renames.

### End-to-end tests (Playwright Test)

All in a new `e2e/mode.spec.ts`. They use the existing fixtures, so each one also fails on any console error it didn't expect and on any request outside the computer, which covers Q2 in dark mode. Colors are checked as computed values against the spec's table.

| Test | What it proves | Requirements |
|---|---|---|
| The app opens in light mode, and the button switches to dark and back | A new browser starts light. A click turns the page background, the panels and the ink to their dark values, and swaps the button's label. A second click returns every one of them to light. | L1, L4 |
| The choice is remembered after a reload | Dark survives a reload and a new tab in the same browser. Switching back to light also survives a reload. | L2 |
| A saved dark choice is in place before the app's script runs | With `main.tsx` held back, `<html>` already has `data-mode="dark"` and `color-scheme: dark`. | L2 |
| The button is on every screen and works there | The five sections, a deal's page, a record that no longer exists (N4), an unknown address, and with the connection message showing (N5). | L1 |
| Switching keeps what's on screen | A search typed on Organizations, its address and the scroll position are unchanged after switching, and the page didn't reload. | L4 |
| The button can be reached by Tab, shows a focus ring and works with Enter and Space | Tab reaches it after the five sections. Its outline is the `focus` token in each mode. Both keys switch the mode. | Q3, L1 |
| Dialogs, picker lists, chart tooltips and messages follow the mode | In dark mode: the Add deal dialog is `raised` over the `veil`, its organization picker list is `raised`, a chart tooltip is `raised`, and the "Deal saved." message is `raised` with ink text and no outline. The date and select inputs have `color-scheme: dark`. In light mode: the same message is white with Midnight text and no outline. | L3 |
| The Won stage and late cards take their dark colors | In dark mode, the Won column head and Won chip are Sea Mist with Midnight text, and a late card has the dark late tint. In light mode, both look as they do today. | L3, P6 |
| Text on every screen meets the contrast rules, in both modes | Run in both modes, over the dashboard, Organizations, Contacts with a status filter on, Deals, a deal's page, the pipeline with a late card, and the Add deal dialog. Every visible HTML text is at least 4.5:1 against the background behind it, apart from the two agreed exceptions. | L5 |

`e2e/quality.spec.ts` keeps its existing tests, with the Tab counts raised by one.

### By hand

- **Light mode is unchanged.** Run `main` from a git worktree and this branch side by side, each on its own copy of the same temporary database, on the same day, with reduced motion so the charts are fully drawn. Screenshot both at 1440 by 900: the dashboard, the three tables, the three kinds of record page, the pipeline, and the Add deal dialog. Then compare them pixel by pixel. In Phase 1 nothing is masked. At the end, only the mode button's area is masked. Messages aren't on screen in these shots, and they're the one planned change. Any other difference is a bug.
- **The four screenshots.** `dashboard-light.png`, `dashboard-dark.png`, `pipeline-light.png` and `pipeline-dark.png` go in `docs/changes/dark-mode/`. Take them at 1440 by 900 from a copy of the app on a fresh temporary database with sample data, never `data/accountable.db`, with reduced motion.
- **A walk in Chrome.** At 1440 by 900 and 1280 by 720, in dark mode: the native date picker and select lists, the scrollbars, focus rings on the page, a panel and a dialog, the revenue line and its labels, late cards, a drag on the board with its shadow and slot, and a dialog on top of a dialog with a picker list inside.
- **The project owner** judges the dark screenshots, especially the revenue line and the money labels on the fill, and has the final say on how it looks.
