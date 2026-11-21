# Plan: dark mode

This plan builds what `intent.md` asks for, as `docs/spec.md` now describes it: GEN-9 to GEN-11, concerns 13 to 16, and the colors and "Light and dark mode" in 2.6. Nothing changes in the backend, the database or the API, and no dependency is added.

## Files that change

### New files

| File | What it holds |
|---|---|
| `frontend/src/lib/mode.ts` | Reads the mode from the `dark` class on `<html>`, switches it, and saves the choice under `accountable-mode`. Components use `useMode()`, built on `useSyncExternalStore` like `lib/motion.ts`. |
| `frontend/src/lib/mode.test.ts` | Unit tests for `mode.ts`, and for the script in `index.html` |
| `frontend/src/components/layout/ModeButton.tsx` | The moon or sun button, with its tooltip and its name for screen readers |
| `frontend/src/components/layout/ModeButton.test.tsx` | Its unit tests |
| `frontend/src/styles/tokens.test.ts` | Checks the tokens: dark values, contrast in both modes, and no colors outside `index.css` |
| `e2e/tests/mode.spec.ts` | The end-to-end tests for the mode |
| `docs/changes/dark-mode/pixel-check.config.ts` and `pixel-check.spec.ts` | The one-off light-mode comparison (success criterion 4). `npm test` doesn't run it. |
| `docs/changes/dark-mode/pixel-check.md` | The comparison's result |
| `docs/changes/dark-mode/dashboard-light.png`, `dashboard-dark.png`, `pipeline-light.png`, `pipeline-dark.png` | Success criterion 3 |

### Styles and the page shell

- **`frontend/src/styles/index.css`**
  - Every color becomes a plain CSS variable, with its light value under `:root` and its dark value under `.dark`. That includes each brand color's text shade and tint, which today are fixed values inside `@theme inline` (risk 1). `@theme inline` then points at the variables.
  - The new roles from 2.6: `--raised`, `--line-strong`, `--hover`, `--accent`, `--drop`, `--icon-bg`, `--selected`, `--selected-ink` and `--overlay`. Each brand color itself (`--sea-green` and the rest) is also a variable, with the same value in both modes.
  - The light block's selector is `:root, .dark .on-band`, so the top bar and band keep the light values (concern 13, risk 3).
  - The dark shadows from 2.6.
  - `color-scheme: light` or `dark`, following the mode.
  - Tailwind's `dark:` variant follows the `dark` class (concern 16).
  - A rule that turns transitions off while the mode switches (risk 8).
  - The scrollbar thumb uses `--line-strong`.
  - shadcn's `--muted` points at `--page`, which has the same light value.
- **`frontend/index.html`**: the short script in `<head>` that sets the `dark` class before the page draws. If Phase 3 shows a flash, the stylesheet link also moves here (risk 5).
- **`frontend/src/main.tsx`**: loses its stylesheet import, but only if the link moves to `index.html`.
- **`frontend/src/components/layout/TopBar.tsx`**: the mode button goes at the right end.
- **`frontend/src/components/ui/sonner.tsx`**: the theme follows `useMode()` in place of the fixed `"light"`, and messages use `--raised`.

### Colors typed into components, each moving to a token

| File | Typed in today | Token |
|---|---|---|
| `components/DataTable.tsx`, `pages/ContactPage.tsx`, `pages/OrganizationPage.tsx` | Row hover `#F5F8F9` | `--hover` |
| `components/board/BoardColumn.tsx` | Drop tint `#E1E9EB` | `--drop` |
| `components/board/DealCard.tsx` | Hover shadow | `--shadow-hover` (new) |
| `components/dashboard/chartParts.tsx` | White tooltip and its shadow | `--raised`, `--shadow-tooltip` (new) |
| `components/dashboard/chartStyle.ts` | Axis `#56747E`, grid `#E4ECEE` | `--ink-subtle`, `--line` |
| `components/dashboard/RevenueChart.tsx` | Line `#05A87E`, fill `#06D6A0`, hover line `#B9C9CE`, white dot ring | `--sea-green-line` (Sea Green in dark mode), `--sea-green`, `--line-strong`, `--panel` |
| `components/dashboard/DealsWonChart.tsx` | Bars `#FFC145`, hover `#F0F4F5`, labels `#073B4C` | `--marigold`, `--page`, `--ink` |
| `components/dashboard/Funnel.tsx` | `#0D6E8E`, `#06D6A0` | `--cerulean-text`, `--sea-green` |
| `components/dashboard/RecentActivity.tsx`, `components/timeline/TimelineEntry.tsx` | Icon circle `#EAF0F2` | `--icon-bg` |
| `components/states.tsx` | Loading placeholder `#E4ECEE` | `--line` |
| `components/timeline/TypePicker.tsx` | Chosen type `bg-band text-band-ink` | `--selected`, `--selected-ink` |
| `components/StageBar.tsx` | Past stages mixed with `#073B4C` | `--band` |
| `components/ui/dialog.tsx`, `components/ui/alert-dialog.tsx` | Overlay `rgba(7,59,76,0.4)`, white panel | `--overlay`, `--raised` |
| `components/ui/button.tsx` | Delete hover `#A9213F`, the band button's two Sea Mist tints | `--destructive-hover`, `--band-button`, `--band-button-hover` (new, the same in both modes) |
| `components/Badges.tsx` | Late badge on Raspberry's text shade | `--destructive`, fixed at `#C42A50` (risk 4) |
| `lib/rules.ts` | `TONE_COLOR` hex values | `var(--slate)` and the others |

The Delete button also moves to `--destructive` (risk 4).

### Leftover `dark:` styles

- **`components/ui/checkbox.tsx`, `ui/select.tsx` and `ui/input-group.tsx`** lose their `dark:` classes. That way these controls follow the tokens like every other control, and dark mode doesn't give selects a grey fill that inputs don't have (concern 16).

### Docs

- **`docs/spec.md`** gets a few additions, so it describes everything the code will have. REVIEW.md flags any code the spec doesn't describe.
  - In 2.6:
    - the card hover shadow and the chart tooltip shadow, with their dark values
    - the band button's two tints
    - Delete's hover color, `#A9213F`
    - any dark value changed by eye in Phase 5
  - In 2.9, the tests in Proof that it doesn't list yet.
- **`docs/STATUS.md`**: progress, then the finished change.

### Unchanged

- **`Band.tsx`, `RecordBand.tsx` and `PipelineStrip.tsx`** stay as they are: they get the light values from the band rule in `index.css`.
- **The backend** doesn't change either.

## Order of work

Each phase ends with `npm run check:quick` passing.

### Phase 0: a steady "before"

1. **Write the pixel check** (`pixel-check.config.ts`, `pixel-check.spec.ts`).
   - It reuses the end-to-end setup: its own backend on a freshly seeded database, and Vite on port 5273.
   - It screenshots every page at 1440x900 in light mode: Dashboard, Organizations, an organization, Contacts, a contact, Deals, a deal, Pipeline and Not found.
   - The browser's clock is fixed and reduced motion is on.
   - A style hides the mode button, and matches nothing on the base code.
   - It compares with Playwright's own `toHaveScreenshot`, so no dependency is added.
2. **Run it twice on the base code** (commit `587f581`). The two runs must match exactly, which shows the check is steady before we rely on it. If something moves between runs, such as a time, an animation or a font loading late, fix the check until it doesn't.

### Phase 1: tokens, light values only

Nothing should look different at the end of this phase.

1. In `index.css`, turn every color into a plain variable, with light values only, and point `@theme inline` at them.
2. Move every color typed into a component to its token, as in the table above.
3. Make `dark:` follow the class, and remove the `dark:` classes from the three shadcn files.
4. Write `tokens.test.ts`: the "no colors outside `index.css`" check, and contrast in light mode.
5. Run the pixel check against the base. There must be no differences. This shows light mode didn't shift before any dark value exists (risk 2).

### Phase 2: dark values

1. Add the `.dark` block: every dark value in 2.6, the dark shadows and `color-scheme: dark`.
2. Add the band rule, so the top bar and band keep their light values.
3. Put the Late badge and Delete on the fixed `--destructive`.
4. Extend `tokens.test.ts` to dark mode: every color that changes has a dark value, and contrast holds.
5. Add the `dark` class by hand in the browser's developer tools, and look at each page. The button doesn't exist yet.

### Phase 3: the switch

1. **`lib/mode.ts`** and its tests.
2. **The script in `index.html`** and its tests.
3. **Check for a flash before fixing anything** (risk 5):
   - Save `dark`, hold back the app's code, and load the page.
   - If the page isn't already dark, link the stylesheet from `index.html`, then check again.
4. **`ModeButton`** in the top bar, with its tests.
5. **Messages follow the mode** (`sonner.tsx`).
6. **No fade on switching:** `mode.ts` turns transitions off for the switch.

### Phase 4: end-to-end tests

1. Write `e2e/tests/mode.spec.ts` (Proof).
2. Run the whole `npm test`, so the existing journeys show light mode still works.

### Phase 5: by eye, then the record

1. **Look at every screen in both modes, in Chrome:**
   - the tables, record pages, board and dashboard
   - dialogs, selects, pickers and messages
   - chart tooltips, date pickers and scrollbars
   - a card being dragged

   Check each against 2.6 and the brand. Tune the decorative dark values if they need it (risk 6). If a value changes, change the spec with it, and keep `tokens.test.ts` passing.
2. **Take the four screenshots** for success criterion 3: the dashboard and the pipeline in each mode.
3. **Final pixel check:**
   - Take the "before" shots from the base commit, in a worktree under `.claude/worktrees/`. Take the "after" shots from the branch on the same day.
   - Record the result in `pixel-check.md`, page by page:
     - With the button hidden, there are no differences.
     - With the button shown, every differing pixel is inside its box.

### Phase 6: wrap up

1. Add the spec additions listed under Docs.
2. Update `docs/STATUS.md`.
3. Run `npm run check` and fix anything it finds until it passes (success criterion 1).

## Risks

1. **Fixed values in `@theme inline`.**
   - Tailwind writes these values straight into each class, so a `.dark` rule can't change them. Every color that differs by mode has to be a plain variable first.
   - A color that gets missed shows up light in dark mode. The no-colors test and the by-eye pass catch it.
2. **Light mode shifting by a pixel.** Moving values into variables, pointing `--muted` at `--page`, and the new tokens could each change something.
   - Phase 1 ends with a pixel check showing no differences, before any dark value exists. A shift gets caught where it's cheap to trace.
   - On a computer set to dark, light mode does change on purpose: selects, checkboxes and input groups lose their grey tint (concern 16). The pixel check runs with the browser in light, Playwright's default, which is what the spec describes.
3. **The band's light values.**
   - A variable that points at another, such as `--card: var(--panel)`, takes its value where it's declared. So restoring `--panel` alone in the band wouldn't restore `--card`. That's why the band repeats the whole light block (`:root, .dark .on-band`).
   - Tooltips and dialogs opened from the band are drawn outside it, so they follow the mode. That's what we want.
4. **White text on colors that turn lighter.** The Late badge, the Delete button, and the stage bar's Negotiation and Lost fills put white text on Raspberry's or Cerulean's text shade. In dark mode those shades get lighter, and white text on them would fail contrast.
   - Late and Delete move to the fixed `--destructive`.
   - The stage bar sits in the band, so it keeps the light values.
   - `tokens.test.ts` checks white on `--destructive`.
5. **A flash of light mode on reload.**
   - The app runs on Vite's dev server (`npm run dev`). There the stylesheet arrives with the app's JavaScript, after the browser may already have drawn the empty page.
   - Today that blank page is white next to the app's `#F0F4F5`, too close to notice. Next to `#04232E` it would show.
   - Phase 3 checks for it first. The fix is to link the stylesheet from `index.html`, which makes the browser wait for it before drawing.
6. **Dark values nobody has seen yet.** The text and control values are checked for contrast. The lines, row hover, drop tint, icon circles and badge tints were chosen on paper, so Phase 5 may change some of them. The spec changes with them.
7. **Charts and CSS variables.**
   - Recharts puts colors in SVG attributes. Chrome and Edge read `var(--token)` there, and shadcn's own charts rely on that.
   - If a part needs a real color value, read it from the token and redraw when the mode changes.
8. **Fading on switch.** Many controls have 150ms color transitions, so switching would fade them out of step, and the spec says colors change at once. `mode.ts` turns transitions off for the switch and back on after the next frame.
9. **A steady pixel check.**
   - The sample data is set relative to the day it's seeded, and the Log activity box's "When" follows the clock. Phase 0 shows that the check gives the same pixels twice.
   - Before and after are taken on the same day. If the build runs over several days, the before shots are taken again from the base commit on the day of the after shots.
10. **Other open tabs.** Another tab keeps its mode until it's reloaded. The spec doesn't ask for tabs to follow each other, so this plan doesn't add it.
11. **The one-off files in `docs/`.** `npm run check` doesn't lint `docs/`, but the pre-commit hook lints any staged script. Keep the pixel-check files lint-clean, or make them plain `.mjs` if the type-aware rules can't reach them.

## Proof

### Unit tests (Vitest)

**`lib/mode.test.ts`**

- Light when `<html>` has no `dark` class.
- Switching to dark:
  - adds the class
  - saves `dark`
  - updates every component using `useMode()`
- Switching back removes the class and saves `light`.
- If saving fails, the switch still happens, with no error.
- The script in `index.html`, read from the file and run in jsdom:
  - a saved `dark` gives dark mode
  - `light`, nothing saved, or any other value gives light mode
  - storage that can't be read gives light mode, with no error
  - it uses the same storage key as `mode.ts`

**`ModeButton.test.tsx`**

- In light mode, it shows a moon and is named "Switch to dark mode".
- Clicking it:
  - switches to dark
  - saves the choice
  - shows a sun named "Switch to light mode"
- Clicking again goes back to light.

**`styles/tokens.test.ts`**

- Every color variable has a dark value, except those 2.6 lists as the same in both modes.
- Contrast holds in both modes, as stated in 2.6:
  - `--ink`, `--ink-muted` and `--ink-subtle` at 4.5:1 or more on `--page`, `--panel` and `--raised`
  - `--ink` and `--ink-muted` on `--accent`
  - each text shade on its tint, and on the three surfaces
  - `--selected-ink` on `--selected`, and white on `--destructive`
  - the band's text on `--band`
  - `--control-border` and `--focus` at 3:1 or more on the three surfaces
- No hex, `rgb()` or `hsl()` color anywhere in `frontend/src` outside `styles/index.css` and the test files.

The existing unit tests keep passing with the new top bar.

### End-to-end tests (`e2e/tests/mode.spec.ts`)

Each test gets a fresh browser profile, so each starts in light mode.

1. **The journey** (GEN-9, GEN-10, success criterion 2):
   1. The dashboard opens in light mode.
   2. Switch to dark.
   3. Go to the Pipeline: still dark, with black cards.
   4. Reload: still dark.
   5. Switch back to light, then reload: still light.
2. **Switching leaves the page as it was** (GEN-11):
   - On Contacts, type a search and scroll down, then switch. The search text, the rows and the scroll position are unchanged.
   - A marker set on `window` before the switch is still there, so the page didn't reload.
   - Right after the click, a Second button already has its dark color, so nothing faded.
3. **Dark before the app's code runs** (GEN-10, no flash): with `dark` saved and `/src/main.tsx` answered with an empty module, the page still loads with the `dark` class and the `#04232E` background.
4. **The device's setting is ignored** (GEN-10, concern 16): with the browser set to dark, the app opens in light mode, and the deal form's Stage select shows no grey tint.
5. **Dialogs, menus, messages and charts follow** (GEN-9, concern 14): in dark mode:
   - the Add contact dialog is Midnight
   - its Status list is black
   - the "Contact added" message is Midnight
   - a revenue chart tooltip is Midnight
6. **The band looks the same in both modes** (concern 13): on a late deal's page, a screenshot of the top bar and band in light mode matches one in dark mode exactly, with the mode button masked. That band has the stage bar and badges.

The existing journeys keep passing, and they all run in light mode.

### One-off checks, not kept as tests

- **The pixel comparison** (success criterion 4), recorded in `pixel-check.md`.
- **The four screenshots** (success criterion 3).
- **Every screen by eye in both modes** (spec 2.9).
- **`npm run check` passes** (success criterion 1).

### Where each part of the intent is proven

| Intent | Proof |
|---|---|
| A toggle on every page, across every section | E2E 1 and 5, `ModeButton.test.tsx` |
| Light is the default, and the choice is remembered | E2E 1, `mode.test.ts` |
| Kept in the browser, read before the page draws | E2E 3, the `index.html` tests |
| The brand's dark surfaces, with a Midnight band | `tokens.test.ts`, E2E 6, by eye |
| Light mode looks exactly as it does today | The pixel check, after Phase 1 and at the end |
| Colors in one place, as tokens | `tokens.test.ts` (no colors outside `index.css`) |
| Contrast in dark mode | `tokens.test.ts` |
| Charts, dialogs and messages follow | E2E 5, by eye |
| No new dependencies | No change to `package.json` |
