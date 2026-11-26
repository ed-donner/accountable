# Plan: currency switch

Built from `docs/changes/currency/intent.md`, `docs/spec.md` and `docs/specs/currency.md` (R55 to R61). No code is written yet. Frontend only: no backend, API, database or dependency changes.

Each phase ends with something that runs, with its tests passing and an update to `docs/STATUS.md`. The commits are the person's.

## How it works

- **A small store, not a prop.** `src/lib/currency.ts` holds the current currency (`"USD"` or `"AUD"`), the rate, and the subscribe and read functions for React's `useSyncExternalStore`. It reads local storage once, when the module loads, so the first render already has the saved choice. That meets R56 without touching `index.html`, because the app is drawn by React after the module runs.
- **`money()` and `moneyCompact()` keep their signatures.** They read the store, convert `USD` values with the fixed rate and format with the current code. The roughly 15 files that call them need no change to their calls.
- **Re-rendering on change.** `Shell.tsx` subscribes with a `useCurrency()` hook and uses the currency as the `key` of the page area, so choosing a currency remounts the current page and every `money()` call runs again, including those inside memoized table columns. The cost is that page-local state (a scroll position, an open dialog) resets on a switch. That is fine, because the switch is made from the menu, with nothing else open, and the data stays in the query cache. The alternative, a `useMoney()` hook in every component, touches every file listed under Phase 2 and needs the columns' dependencies kept right, which is more risk for no visible benefit.
- **The rate** is one exported constant, `USD_TO_AUD = 1.52`, with `RATE_DATE = "2026-11-23"`, an approximation for display (R60). Conversion is `Math.round(usd * rate)` in `money` and rounding in the compact form.
- **Stored values never change** (R59). Nothing converts back: forms read and write USD and the label stays "Value (USD)". Sorting and searching in tables use the display text, as they do now, so they follow the currency (R61).
- **Flags** are emoji (🇺🇸, 🇦🇺) in the menu and as a 16px badge on the initials button, marked `aria-hidden`. No image files.

## Files that change

### `frontend/`

| File                                          | What changes                                                                                                                                                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/currency.ts`                         | New. The `Currency` type, the `CURRENCIES` list with code, name and flag, `USD_TO_AUD` and `RATE_DATE`, `readCurrency`, `getCurrency`, `setCurrency` (stores it, tells subscribers), `subscribe`, `convert`, and the `useCurrency` hook. |
| `src/lib/format.ts`                           | `money` and `moneyCompact` convert and use the current code. `money` returns `AUD 72,960` and `moneyCompact` `AUD 76k`.                                                                                                                  |
| `src/components/UserMenu.tsx`                 | A "Currency" radio group between the theme group and Sign out, with a separator and a small muted label, and the flag badge on the initials button. The button's name stays "User menu"; its `title` names the currency (see Risks).     |
| `src/components/Shell.tsx`                    | Subscribes to the currency and uses it as the `key` of the page area.                                                                                                                                                                    |
| `src/pages/dashboard/FigureTiles.tsx`         | The small code label before the number works for any code, not only `USD `.                                                                                                                                                               |
| `src/pages/dashboard/Charts.tsx`              | The axis title reads "Revenue won (USD)" or "(AUD)" from the current currency.                                                                                                                                                           |
| `src/components/forms.tsx`                    | Unchanged: the deal value label stays "Value (USD)". Listed so it is checked, not forgotten.                                                                                                                                             |
| `src/lib/currency.test.ts`                    | New unit tests.                                                                                                                                                                                                                          |
| `src/lib/format.test.ts`                      | Adds the AUD cases.                                                                                                                                                                                                                      |
| `src/components/UserMenu.test.tsx`            | Adds the currency group and badge cases.                                                                                                                                                                                                 |
| `src/pages/Dashboard.test.tsx`                | Adds a case with AUD.                                                                                                                                                                                                                    |
| `src/test/setup.ts`                           | Resets the currency to USD and clears its stored value before each test, so tests don't leak into each other.                                                                                                                            |
| `src/test/tokens.test.ts`, `contrast.test.ts` | Unchanged. The badge's ring uses the existing `--panel` token and no hex colors.                                                                                                                                                         |

### `e2e/`

| File               | What changes                                                    |
| ------------------ | --------------------------------------------------------------- |
| `currency.spec.ts` | New. The switch, the restore, the reload and the form label.    |
| `menu.spec.ts`     | Adds the currency group to its check of what the menu contains. |

### Docs

| File                     | What changes                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `docs/STATUS.md`         | Updated at the end of every phase. A line for the currency change, with its test counts. |
| `docs/specs/currency.md` | Corrected if the build finds anything the spec got wrong.                                |
| `docs/changes/currency/` | Four screenshots: the dashboard and the pipeline, in USD and in AUD.                     |

## Order of work

### Phase 0: Check what exists

1. Run `npm run check:quick` on the branch as it is, to know it starts green.
2. List every `money(` and `moneyCompact(` call, and every other place that writes "USD" in `frontend/src` and `e2e/`, to confirm the file list above is complete.

Ends with: a green baseline and a complete list.

### Phase 1: The store and the formatting

1. Add `lib/currency.ts` with its tests first: conversion and rounding, storing and reading, failure when local storage is blocked, and the subscribe and notify behaviour.
2. Change `money` and `moneyCompact` to use it, and extend `format.test.ts` for both currencies.
3. Reset the currency in `test/setup.ts`.

Ends with: with USD chosen every existing test passes unchanged, and AUD formats correctly in the unit tests. The app looks the same, because nothing offers the choice yet.

### Phase 2: The menu and the screens

1. Add the currency group and the flag badge to `UserMenu.tsx`, and key the page area on the currency in `Shell.tsx`.
2. Fix the dashboard tile label and the chart axis title.
3. Add the unit tests for the menu, the dashboard and the badge, then `e2e/currency.spec.ts` and the line in `menu.spec.ts`.
4. Open the app, switch to Australian dollars and go through all five sections by eye.

Ends with: the whole app switches and switches back, and `npm run check:quick` passes.

### Phase 3: Spec, status and screenshots

1. Take the four screenshots with Playwright into `docs/changes/currency/`.
2. Update `docs/STATUS.md`, and `docs/specs/currency.md` if anything changed.
3. Run `npm run check`, with the end-to-end tests.

Ends with: everything green and the intent's four success criteria met.

## Risks

- **A screen formats money on its own.** Any `toLocaleString` or a hard-coded "USD" would stay in US dollars. Phase 0 lists them, and Phase 2's by-eye pass and the end-to-end test across the dashboard, a table and the pipeline are the net. Mitigation beyond that: a guard test in `format.test.ts` fails if a `.tsx` file outside the tests contains the text `"USD "`, like the hex guard in `tokens.test.ts`. The deal form's label `Value (USD)` is the one allowed case.
- **Remounting on a switch resets page state.** Accepted (see How it works). If it shows a flash of skeletons because data isn't cached, the fallback is to keep the old data visible while it re-renders; the data doesn't change, so nothing needs refetching.
- **The button's accessible name.** Existing unit and end-to-end tests find the menu by the name "User menu", so the name stays exactly that and the currency goes in the button's `title`. Decided with the person.
- **Rounding.** AUD totals can differ by a dollar or two from the sum of the figures beside them (R60). The tests assert each figure on its own, never a sum across rounded parts.
- **Rate wrong or stale.** It is an approximation, set in one place with its date. Updating it is a one-line change, and the tests build their expected values from the constant, not from a typed number, so they keep passing.
- **Emoji flags don't draw on every system.** On Windows, flag emoji show as letters ("AU"). The currency code is always in the text, so nothing depends on the flag (spec, Formats). Accepted.
- **Local storage blocked.** The choice then lasts for the visit and the default is USD, like the theme.
- **The end-to-end tests share fixed ports.** Don't run two test runs at once.

## Proof

### Unit tests (Vitest)

- `currency.test.ts`: USD is the default with nothing stored; a stored `AUD` is read back; an unknown stored value falls back to USD; blocked storage falls back to USD and `setCurrency` doesn't throw; `setCurrency` stores the value and notifies subscribers once; unsubscribing stops notifications; `convert` rounds to whole dollars and leaves USD unchanged.
- `format.test.ts`: `money` in USD is as before (`USD 48,000`, `USD 0`, negative); in AUD it converts and shows `AUD 72,960`, with a negative and a zero; `moneyCompact` in AUD for under 1,000, thousands and millions, with the trimming of `.0`; the guard test that no component hard-codes `"USD "`.
- `UserMenu.test.tsx`: the menu lists US dollar and Australian dollar with flags and a check on the current one; choosing Australian dollar stores it, moves the check and changes the badge; choosing US dollar again restores it; the keyboard works on the new items (arrow keys and Enter); the theme choice and Sign out still work.
- `Dashboard.test.tsx`: with AUD chosen, the tiles show the `AUD` label with converted numbers and the revenue chart's axis title says AUD.
- Existing `DataTable.test.tsx` and page tests: pass unchanged with USD, which proves the default is untouched.

### End to end (Playwright with Chrome)

- `currency.spec.ts`, **switching**: sign in, open the dashboard and note the open pipeline figure. Open the menu, choose Australian dollar, and the figure reads `AUD` with the converted number. The Deals table and the Pipeline's column totals show `AUD` too.
- **Switching back**: choose US dollar and the dashboard, the Deals table and the Pipeline show their original figures exactly.
- **Remembered**: choose Australian dollar, reload, and the dashboard is in AUD from the first paint, with the flag badge showing.
- **Stored value untouched**: with AUD chosen, open a deal's edit form. It says "Value (USD)" and holds the stored USD value, and saving without a change leaves the deal's value the same after switching back.
- `menu.spec.ts`: the menu contains email, the three themes, the two currencies and Sign out.
- The existing 32 end-to-end tests pass unchanged, which proves nothing changed for someone who never touches the switch.
