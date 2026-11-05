# Intent: money

## Problem

Invoices and bills each added their own row to the dashboard's Money section, one under the other, built separately. The section reads as two areas stacked rather than one picture of the business's money. The rows don't match: the figures sit at different insets, one chart has its money axis on the left and the others on the right, one labels every other month and another every month, and "so far" is marked three different ways. What customers owe us and what we owe suppliers, the two figures most worth comparing, sit far apart.

## Proposed outcome

One Money section designed as a whole, in the brand's style: what customers owe us on the left and what we owe suppliers on the right, side by side, each told the same way, so the two can be read across.

## Constraints

- Every figure, chart and empty state the section has today stays, with the same sums. No backend change.
- Each side still reads its own figures, so a side that can't load says so and leaves the other showing.
- The dashboard's own part doesn't change, and the whole section still fits 1440 by 900 once scrolled to.
- Follows the brand skill and `docs/specs/visual-design.md`.

## Decisions

- **Two columns, two rows:** customers on the left, suppliers on the right, at equal widths. The first row is where things stand: the two figures, then when it's due. The second is the last 12 months: money received, then money spent. Panels in a row are the same height and built from the same parts, so their figures, headings and charts line up across.
- **The same parts on both sides:** the figures, the heading over How late and Due in the next 30 days, the month headings with this month's figure beside last month's, and the two month charts, which share their size, column width, money axis on the right, month labels and "so far".
- **Spending gets a month heading like Payments received:** "Spending in November", with this month's total beside last month's, and the category legend moves up beside it, so the two month charts start and end at the same height.
- **Nothing owed shows the figures at $0.00,** as What we owe does, with "Nothing owed." in place of How late.

## Not in this change

- A figure for what's owed to us less what we owe, or anything else new.
- Any change to the figures' sums or to the routes that give them.

## Success criteria

1. `npm run check` passes.
2. The spec describes the section as one, in `dashboard.md`, `invoices.md`, `bills.md` and `visual-design.md`.
3. Checked in the browser at 1440 by 900, in light and dark mode.
