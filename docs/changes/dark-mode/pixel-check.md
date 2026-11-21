# Pixel check: light mode before and after dark mode

Success criterion 4: light mode didn't shift. Every page was screenshotted in light mode at 1440x900, full length, before and after the change, and compared pixel by pixel with no tolerance. The only difference is the mode button.

## How it was run (Nov 20, 2026)

- `pixel-check.config.ts` and `pixel-check.spec.ts`, in this folder. `npm test` doesn't run them.
- The end-to-end setup: a backend on a freshly seeded database (port 8100) and Vite on port 5273, in Chrome.
- The browser's clock fixed at 6pm today, reduced motion on, and the browser in light mode (Playwright's default).
- **Before:** the base commit, `587f581`, in a worktree under `.claude/worktrees/`, with its own `npm ci`. Linking the main checkout's `node_modules` instead made Vite refuse the fonts (403, outside the project folder), so those shots were thrown away.
- **After:** the `dark-mode` branch with every change in place, on the same day, against the same before shots.
- Compared with Playwright's `toHaveScreenshot` (`maxDiffPixels: 0`, `threshold: 0`). With the button shown, the spec decodes both images in the browser and finds the box around every pixel that differs.

## Steadiness (Phase 0)

On the base code, two runs gave the same pixels on every page. Nudging `--page` from `#f0f4f5` to `#f0f4f6` made it fail on 213,892 pixels, so the check can see a one-step change.

During the build, the check passed with the button hidden at the end of Phase 1 (every color moved to tokens, no dark values yet) and again after Phase 3 (the stylesheet linked from `index.html`).

## Result, mode button hidden

| Page | Size | Differing pixels |
|---|---|---|
| Dashboard | 1440x1492 | 0 |
| Organizations | 1440x1140 | 0 |
| An organization | 1440x900 | 0 |
| Contacts | 1440x2440 | 0 |
| A contact | 1440x1550 | 0 |
| Deals | 1440x2180 | 0 |
| A deal (late, with its stage bar) | 1440x997 | 0 |
| Pipeline | 1440x900 | 0 |
| Not found | 1440x900 | 0 |

The first of three runs on the branch found 6 pixels on Organizations, each 1 step out of 255, along the diagonal stroke of the small external-link icon beside a website. The next two runs found none on any page, against the same before shots. So that was the browser's antialiasing varying between runs, not the change.

## Result, mode button shown

On every page, 119 pixels differ, all inside a 16x16 box at (1382, 24): the moon icon. The button's box is 36x36 at (1372, 14). Nothing outside it changed, and every page kept its size.
