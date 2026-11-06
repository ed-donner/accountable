# Spec: Visual design

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Visual design

The brand skill is the source for all of this, and it takes priority over any general design guidance.

### Color tokens

Every color is a token with a light and a dark value, and every screen uses the tokens. Where the spec says a panel, card or backing is in the panel color, it's white in light mode and dark Midnight in dark mode. Ink is Midnight in light mode and Sea Mist in dark mode.

Dark mode keeps the brand skill's page and Sea Mist ink, but not its black panels, because clarity and contrast come first. On black, shadows vanish and a dialog barely shows against a dimmed page. So dark mode is built in three layers that each get a step lighter: the page, then panels and cards, then dialogs, picker lists, chart tooltips and messages. Each layer stands out from the one beneath it, as white panels do on the light page.

| Token | Light | Dark | Use |
|---|---|---|---|
| Page | `#F0F4F5` | `#04232E` | Page background, row hover, inputs including the search box, secondary buttons, percentage pills, the highlighted menu item and search result |
| Panel | `#FFFFFF` | `#0B3240` | Panels, cards, the top bar, the sign-in panel, the revenue figure's backing |
| Raised | `#FFFFFF` | `#12404F` | Dialogs, the menu, search results, picker lists, chart tooltips and messages, which float over the rest |
| Ink | `#073B4C` Midnight | `#CDD8DB` Sea Mist | Body text and headings, the revenue line, the deals-won bars, the Won fill, the cash flow's balance line |
| Ink on Won | `#CDD8DB` Sea Mist | `#073B4C` Midnight | Text on the Won fill |
| Midnight | `#073B4C` | `#073B4C` | Text on Sea Green, Marigold and Coral, including on the revenue chart's fill |
| Muted ink | `#4A6B76` | `#9AB1B8` | Secondary text, a switch's track while it's off |
| Line | `#CDD8DB` Sea Mist | `#45646E` | Link underlines, funnel leader lines, scrollbars, the cash flow's zero line, the owed part of an invoice's bar until it's overdue, and at half strength the slot where a dragged card will land |
| Grid | `#E4ECEE` | `#1E4350` | Chart grid lines |
| Soft bar | `#839DA5` | `#6C858E` | The current month's bar, halfway between ink and the panel, and the Other bill category |
| Soft Sea Green | `#83EBD0` | `#098470` | Money expected in on the cash flow, halfway between Sea Green and the panel |
| Soft Coral | `#FBC6B5` | `#815F56` | Money expected out on the cash flow, halfway between Coral and the panel |
| Soft Marigold | `#FFE0A2` | `#857A43` | The cash flow's likely deals band, halfway between Marigold and the panel |
| Focus ring | `#118AB2` Cerulean | `#4CB3D6` | Focus rings, a lighter Cerulean in dark mode so it shows on every layer |
| Primary | `#06D6A0` Sea Green, Midnight text | Same | Main buttons, including Sign in, current section, the paid part of an invoice's bar, the chosen design's ring, money in on the cash flow |
| Secondary | `#FFC145` Marigold, Midnight text | Same | The initials circle, on the menu button and the local copy's sign-in screen |
| Sea Green text | `#047A5B` | `#51E2BC` | If Sea Green is ever needed as text, and a switch's track while it's on |
| Marigold text | `#866522` | `#FFD47D` | If Marigold is ever needed as text |
| Raspberry text | `#D23E62` | `#F591A9` | Error messages beside a field. Light mode uses the Alert chip's shade |
| Information | `#118AB2` Cerulean, white text | Same | Stage-change entries, charts, the Not yet due bar in How late, and the icon before the Company settings page's ask for a company name |
| Alert | `#EF476F` Raspberry, white text | Same | Delete buttons, charts, the late bars in How late, the owed part of an overdue invoice's bar |
| Small chip, Information | `#107FA4`, white text | Same | Negotiation and Unpaid chips |
| Small chip, Alert | `#D23E62`, white text | Same | Late, Overdue and Lost chips, the connection message |
| Late tint | `#FDECF1` | `#4B2436` | Late cards |
| Archived chip | `#CDD8DB` Sea Mist, ink text | `#3B5862`, ink text | The Archived chip on products |
| Paper | `#FFFFFF` | `#FFFFFF` | Behind a quote's preview, under its white pages |
| Paper muted ink | `#4A6B76` | `#4A6B76` | The scrollbar of a quote's preview, on paper |
| Veil | Midnight at 40% | Black at 50% | Behind dialogs |
| Shadow | Midnight, 18% to 24% | Black, 40% to 50% | Dialogs, the menu, search results, picker lists, chart tooltips, messages, the dragged card |

Small text meets 4.5:1 in both modes, and anything that isn't text, such as the focus ring, meets 3:1:

| Pair | Light | Dark |
|---|---|---|
| Ink on page, panel, raised | 10.91:1, 12.08:1, 12.08:1 | 11.24:1, 9.35:1, 7.71:1 |
| Muted ink on page, panel, raised | 5.19:1, 5.74:1, 5.74:1 | 7.28:1, 6.06:1, 5.00:1 |
| Ink and muted ink on the late tint | 10.61:1, 5.05:1 | 9.00:1, 5.83:1 |
| Ink on the archived chip | 8.30:1 | 5.24:1 |
| Paper muted ink on paper, a quote preview's scrollbar | 5.74:1 | Same |
| Sea Green text on page, panel | 4.81:1, 5.33:1 | 10.08:1, 8.39:1 |
| Marigold text on page, panel | 4.86:1, 5.39:1 | 11.65:1, 9.69:1 |
| Raspberry text on raised, where the forms are | 4.56:1 | 5.08:1 |
| Midnight on Sea Green, Marigold, Coral | 6.40:1, 7.46:1, 5.13:1 | Same |
| Text on the Won fill | 8.30:1 | 8.30:1 |
| Focus ring on page, panel, raised | 3.58:1, 3.96:1, 3.96:1 | 6.79:1, 5.65:1, 4.66:1 |

In dark mode, each layer is 1.2:1 against the one beneath it, a little more than white panels on the light page at 1.11:1. Inputs keep the page color, so in a dialog they sit 1.46:1 darker than the dialog around them. The late tint is about as light as a panel and stands out by its color. The paper tokens are the light mode's panel and muted ink under their own names, with the same value in both modes, behind a quote's preview and on its scrollbar, because the preview shows the paper the customer gets ([Quote document](quotes.md#quote-document)). The previews' pages, a quote's and an invoice's, are the one thing on screen that dark mode leaves light (L3), in the designs' own colors. The archived chip is a quiet grey in both modes, so it never reads as a stage or a warning. In dark mode it stands 1.79:1 against a panel and 2.15:1 against a row's hover, because the Line token's dark value would put ink on it at only 4.37:1.

The three soft colors mark what's expected rather than what has happened, as the soft bar marks a month not yet over. All but Soft Marigold in dark mode stand below 3:1 against the panel, so the forecast never rests on them alone: it sits after this month, under its own "Forecast" label, beside a dashed line, and its tooltip says what's expected. Money out on the cash flow is Coral, the brand's third color, rather than Raspberry, because paying a bill isn't an alert. A switch's two tracks both stand at least 3:1 against the panel, and the knob's place, left for off and right for on, says which it is, so its color never carries it alone.

The small chip shades are an agreed exception to the brand, for small chips only. White text on the brand's Cerulean and Raspberry is 3.96:1 and 3.62:1, below the usual 4.5:1 minimum for small text, and these slightly darker shades reach it at 4.57:1 and 4.56:1 and look almost the same. The pipeline band, the funnel, the pipeline's column headers and the delete buttons keep the exact brand colors, so small white text on their Cerulean and Raspberry fills stays at 3.96:1 and 3.62:1. These fills and their text are the same in both modes, so the same figures, and the same exception, hold in dark mode.

### Stage, chip and chart colors

| Stage | Fill | Text on it |
|---|---|---|
| New | Sea Green `#06D6A0` | Midnight |
| Qualified | Marigold `#FFC145` | Midnight |
| Proposal | Coral `#F78C6B` | Midnight |
| Negotiation | Cerulean `#118AB2` | White |
| Won | Midnight `#073B4C`, Sea Mist `#CDD8DB` in dark mode | Sea Mist, Midnight in dark mode |
| Lost | Raspberry `#EF476F` | White |

Six stages share the brand's five colors, keeping the brand's order: Lost takes the fifth color and Won takes the ink. The colors can't carry meaning alone: the chart validator puts Marigold and Coral just under its line for telling colors apart (14.5 against 15), and Sea Green, Marigold and Coral are all below 3:1 on white. So every stage color has the stage's name beside it.

Won is the one stage whose color changes with the mode. Midnight almost disappears on the dark surfaces, at 1.13:1 on a panel, so in dark mode Won turns Sea Mist with Midnight text, following the ink as the revenue line and the deals-won bars do. The other five stages look the same in both modes.

Within a mode, a stage keeps its color everywhere. Negotiation and Lost chips use the small chip shades above, and larger fills, such as the pipeline band, the funnel and the pipeline's column headers, use the colors in this table. Other sets of three follow the brand's trio:

| Set | Sea Green | Marigold | Coral |
|---|---|---|---|
| Contact status | Customer | Qualified | Lead |
| Activity type | Call | Email | Note |

Stage-change entries use Cerulean, which marks them as information.

Bill categories are six, like the stages, and share the brand's five colors in the brand's order. The sixth, Other, takes the soft bar's grey rather than the ink, so the leftover category stays quiet beside the others:

| Bill category | Color |
|---|---|
| Software | Sea Green `#06D6A0` |
| Contractors | Marigold `#FFC145` |
| Travel | Coral `#F78C6B` |
| Office | Cerulean `#118AB2` |
| Marketing | Raspberry `#EF476F` |
| Other | Soft bar, `#839DA5`, `#6C858E` in dark mode |

A category shows as a round swatch in its color beside its name in ink, in the Bills table, on a bill's page and in the charts' legend and tooltips, and as its color in the Money section's bars. It's never a filled chip: Office and Marketing chips would take the small chip shades of Unpaid and Overdue, and a bill's category and status sit in the same row. As with the stages, Sea Green, Marigold and Coral are below 3:1 on white, so the name always sits beside the swatch. Apart from Other, the colors are the same in both modes.

Quotes, invoices and bills show their status in chips, in these tones, agreed ahead of them so the three areas match. Each tone is already in `Chip.tsx`, so none is new. Quotes use Draft, Sent, Accepted, Expired and Declined, invoices use Draft, Issued, Part paid, Overdue, Paid and Void ([V3](invoices.md#invoices)), and bills use Unpaid, Paid and Overdue:

| Status | Chip | Used by |
|---|---|---|
| Draft | Quiet: the page color with muted ink, as on a follow-up's Done chip, or the panel color where the chip sits on the page, as beside a quote's number or a draft invoice's title, or on a table row under the pointer, which takes the page color, so its shape shows | Quotes, invoices |
| Sent, Issued, Unpaid | Small chip, Information: waiting on someone | Quotes, invoices, bills |
| Part paid | Marigold | Invoices |
| Accepted, Paid | Sea Green | Quotes, invoices, bills |
| Expired, Declined, Overdue | Small chip, Alert, as Late, Overdue and Lost are | Quotes, invoices, bills |
| Void | Archived, which never reads as a warning | Invoices |

As with stages, each chip names its status, so its color never carries the meaning alone.

### Type

The fonts are bundled through Fontsource, so nothing loads from outside the app's own address.

| Use | Font | Size and line height | Weight |
|---|---|---|---|
| Page title | Instrument Sans | 28/36 | 600 |
| Section heading | Instrument Sans | 16/24 | 600 |
| The dashboard's Money heading | Instrument Sans | 20/28 | 600 |
| Body, table text | Instrument Sans | 14/20 | 400 |
| Label, chip | Instrument Sans | 13/18 | 600 |
| Dashboard summary line | Instrument Serif | 22/30 | 400 |
| Revenue won figure | JetBrains Mono | 52/60 | 500 |
| Quote number as a page title | JetBrains Mono | 28/36 | 500 |
| Other headline figures, including the Money section's, such as Cash today, Owed to us, Overdue, What we owe and this month's payments and spending, column totals, a product's price, an invoice's total and a bill's total on their pages, the figures above the Quotes table | JetBrains Mono | 24/30 | 500 |
| Board totals | JetBrains Mono | 20/26 | 500 |
| Card value | JetBrains Mono | 19/26 | 500 |
| Money, counts, dates in tables | JetBrains Mono | 13/20 | 400 |
| Probability and date on cards | JetBrains Mono | 12/18 | 400 |
| Chart axis | JetBrains Mono | 12/16 | 400 |

Numbers are always in JetBrains Mono, so columns of figures line up. Quotes and invoices set their own sizes, in points, in their designs ([V28](invoices.md#designs)). Instrument Serif appears in one place only: the dashboard's summary line.

### Shapes

- Panels have a 16px radius, cards 10px, inputs and buttons 8px, and chips are fully round.
- A switch, such as Likely deals, is a fully round track 36 by 20px, in muted ink while off and in Sea Green text while on, with a round knob in the panel color, 16px across, at the left while off and the right while on. Its label sits after it, in ink, and the whole of it can be clicked. It's a checkbox underneath, with the switch role, and shows the focus ring.
- Panels are in the panel color on the page background, white in light mode and dark Midnight in dark mode, with no outline and no shadow.
- There are no gradient fills, and no borders on one edge of a panel. There's no line across the top of the page.
- Late cards are marked by the chip and tint, never a colored edge.
- A quote's or an invoice's preview, and the sample on the Company settings page, is white pages in both modes, with the designs' own colors rather than the app's tokens ([V28](invoices.md#designs)), because it shows what will print. `colors.test.ts` still holds: those colors live in `shared/document-designs.json`, outside `frontend/src`.
- Pipeline columns are headed by a solid block in the stage color, never a colored bar or edge.
- Labels are in sentence case, not capitals. No text runs joined with middle dots, and no arrows added to link text.

### Charts

- **Line chart:** a 2px line in ink over a solid Sea Green area that runs to the panel's left, right and bottom edges. Won takes the ink, and the fill brings in the brand's primary color without losing the line. The money axis sits inside the panel on the right, and the month labels sit on the fill. The revenue figure sits at the top left on a backing in the panel color, so grid lines don't run through it.
- **Line chart text in dark mode:** Sea Mist can't be read on Sea Green, at 1.30:1, so anything that sits on the fill is Midnight in both modes: the month labels, and each money label below the fill's top at the right-hand edge. Money labels above it are in ink. A label goes by where its middle falls.
- **Line's current month:** the last segment is dashed, so an unfinished month doesn't look like a fall in sales. It ends in a dot in ink, ringed in the panel color.
- **Bar chart:** thin bars in ink with 4px rounded tops. The current month is in the soft bar color, halfway between ink and the panel, labeled "so far".
- **Sales funnel:** stacked segments narrowing from top to bottom, in stage colors, with 2px gaps and softly rounded corners. The top edge of each segment is as wide as the value that reached it, and the last segment tapers a little further so the shape ends in a neat spout. Each stage name sits inside its segment in the stage's text color. Its full value sits to the right in ink, joined by a dotted leader line in the line color. The percentage carried forward sits in a pill in the page color, level with the join between two stages, because it describes the step between them. Built with Recharts' `FunnelChart` and a custom `shape`.
- **Pipeline band:** compact blocks, 76px tall, sized by value with 2px gaps. A small stage keeps a minimum width so its label still fits.
- **The Money section's month charts:** Payments received and Spending by category sit side by side and share one layout, so they line up: a column a month, 18px wide with 4px rounded tops, every month named under it, the money axis inside the panel on the right, and "so far" in ink above the current month's column. The columns are wider than the deals-won bars, so the thinnest spending segment still shows. This month's total sits in the heading above each chart, beside last month's, so neither chart labels its columns.
- **Spending by category:** each month's segments are stacked in the categories' order from Software at the bottom to Other at the top, in the category colors, with 2px gaps in the panel color between segments, so neighboring colors stay apart, and 4px rounded corners on top of each column. A segment too small to see at the chart's scale is drawn 4px tall above its 2px gap, and the axis's top makes room for it. Pointing at it still gives its real figure. The current month is marked by its "so far" label, never by a lighter color, because color means the category here. The legend sits at the right of the heading and figures, in three columns of two in the same order, each category's swatch beside its name, so the chart starts and ends level with the payments chart beside it.
- **Due in the next 30 days:** a timeline from today to 30 days on, with a thin bar at each bill's due date in its category color and 4px rounded tops. Bills due on the same day stack, with 2px gaps, and a bill too small to see is drawn 4px tall, as in Spending by category. The axis starts at "Today" and marks each week. It has no direct labels: the total due sits beside its heading as a figure. Its money axis is as wide as the spending chart's below it.
- **All charts:** one axis per chart, so revenue and deal count are never on the same one. Faint horizontal grid lines only, in the grid color. Direct labels on the current month only, which is usually the highest in the sample data. Text is in ink, never the series color, apart from Midnight text on the bright fills. Each chart has a hover tooltip, on the raised surface.
- **How late:** five horizontal bars, one per group in order of lateness, sized against the largest, with 4px rounded ends. Not yet due is Cerulean and the four late groups Raspberry, and each bar has its group's name before it and its amount and count after it, in ink.
- **Payments received:** in ink, with the current month in the soft bar color, as the deals-won bars are, and laid out as Spending by category beside it.
- **Cash flow:** one money axis, on the right, for the bars and the line alike, since both are money, running below zero for money out. It fits what's shown, so the bars can be read with the switch off, and grows to make room for the likely deals' band while the switch is on. Its figures are $0, then each end of the axis and halfway to each, each only where it has 20px to itself, so a short run below zero for money out never crowds $0, and the chart leaves room under the axis's lowest end for its figure. Money in rises from the zero line as a thin bar in Sea Green, and money out drops below it as a thin bar in Coral, each with 4px rounded ends away from the line, so in and out read by their place as well as their color. The zero line is 1px in the line color, and the other grid lines stay faint. This month's bars are in their full colors, marked by "so far", never by a lighter color, because a lighter color means the forecast here. What's still expected this month carries on past the end of each bar, after a 2px gap in the panel color, in Soft Sea Green or Soft Coral, and the forecast months' bars are in those soft colors throughout. A sliver too small to see is drawn 4px long, as in Spending by category. The cash balance is a 2px line in ink through each month's end-of-month point, at the middle of its month: solid up to last month's point, which is a dot in ink ringed in the panel color, as the revenue line's current month is, then dashed to the end. The likely deals' band is Soft Marigold, from the forecast line up to the balance with the likely deals, behind the bars and the line, with no line of its own. Nothing on the chart has a direct label other than "so far" and "Forecast", because the figures above it say where the balance stands.
- **Money on axes:** shortened with the currency, such as `$40k` and `$1.2M`, and `-$40k` below zero.

### Motion

The revenue line and its fill draw in once on load. Cards slide apart while one is dragged, and settle into place when dropped. Dialogs fade in quickly. Nothing else moves, and all of it stops under reduced motion. Switching between light and dark mode is instant, with no fade.

### Words

Plain business English, short labels, no exclamation marks.

| Where | Text |
|---|---|
| Buttons | Add deal, Save deal, Delete deal, Log activity, Add product, Save product, Archive, Restore, New quote, Save quote, Mark as sent, Accept, Decline, Copy to new draft, New invoice, Add line, Save draft, Issue invoice, Delete draft, Record payment, Void, Download PDF, Choose logo, Remove logo, Add bill, Save bill, Delete bill, Mark paid, Mark unpaid, Undo, Show all bills |
| Menu button, for screen readers | Menu for Alex Rivera |
| Menu | Theme. Light. Dark. System. Company settings. Sign out. |
| Sign-in | Sign in. Email. Password. |
| Sign-in failed | That email and password don't match. |
| Sign-in service unreachable | Can't reach the sign-in service. Check your internet connection. |
| Too many sign-in tries | Too many tries. Wait a minute and try again. |
| Session ended | Your session has ended. Sign in again. |
| Local copy's sign-in | This is a local copy with made-up data. Choose who to sign in as. |
| Who added and changed | Added by Alex Rivera on Oct 12, 2026. Last changed by Dana Whitfield on Oct 30, 2026. |
| Company settings page | Company settings. Company. Tax. Quotes and invoices. Cash. Opening balance. As of. Documents. Design. Accent color. Logo. Save settings. |
| Opening balance hint | The cash in the bank at the start of that day. The dashboard's cash flow counts from it. Put a minus sign in front if the account was overdrawn. |
| No company name saved | No company name yet. Enter one below. |
| Prefix hint | Up to 10 letters, digits and hyphens. |
| Search, for screen readers | Search organizations, contacts, deals and products |
| No search matches | No organizations, contacts, deals or products match "harbour". |
| Search failed | Couldn't search. Try again. |
| More search results | See all 12 contacts |
| Messages | Deal saved. Deal deleted. Product archived. Product restored. Settings saved. Quote saved. Quote sent. Quote declined. Copied to QT-0012. Draft saved. Draft deleted. Invoice issued. Invoice voided. Payment recorded. Payment deleted. Bill saved. Bill deleted. Bill marked paid. Bill marked unpaid. |
| Quote accepted | Quote accepted. Harbor & Pine renewal is now Won at $48,001. Close date set to today. Sam Carter is now a customer. |
| Quote dialogs | Mark QT-0004 as sent? It can't be changed after this. To change it later, copy it to a new draft. Accept QT-0004? Decline QT-0004? This can't be undone. |
| Quote refused | QT-0004 has been sent, so it can't be changed. Copy it to make a new draft. This deal is closed, so its quotes can't be sent. Give the deal an organization before sending its quote. Add a line before sending the quote. Add the company's name in Company settings first. |
| Quotes, empty | No quotes yet. Add the first one from an open deal. No expired quotes. Quotes can be added while the deal is open. |
| Invoice statuses | Draft. Issued. Part paid. Overdue. Paid. Void. |
| Invoice marks, on the page | DRAFT. PAID. OVERDUE. VOID. |
| Issuing and voiding | Issue this invoice? Once it's issued, it can't be changed. Void INV-0042? It keeps its number and is marked VOID. This can't be undone. |
| Leaving a draft | Leave without saving? Your changes to this draft will be lost. |
| Errors | Enter a name. Choose an organization. Enter your email. Enter a price in dollars and cents, such as 49.50. Enter a rate from 0 to 100%. Clashes with the quote prefix. Neither can start with the other, ignoring capitals. That's more than the $1,250.00 still owed. Too light to read on white. Choose a darker color. Choose a PNG or JPEG image. Invoices can't show "漢". Take it out to save. Choose a supplier. Enter the bill number. Keep the bill number to 50 characters or fewer. Choose a bill date. Choose a due date. Choose a category. Choose a paid date. Enter an amount in dollars and cents, such as 49.50. The due date can't be before the bill date. The paid date can't be in the future. The paid date can't be before the bill date. Enter an amount in dollars and cents, such as 25,000.00. Keep the opening balance within $1 trillion either way. Enter the opening balance. Choose the date of the opening balance. The date can't be in the future. |
| Product name taken | A product with this name already exists. An archived product has this name. Restore it or choose another. |
| Bill number taken | This supplier already has a bill with this number. |
| Empty table | No deals yet. Add the first one. No invoices yet. Start one from a won deal. |
| Archived products | Show archived (2). Every product is archived. 2 archived products match. |
| Bills filter | Unpaid (9). No unpaid bills. No overdue bills. No unpaid bills match "acme". 4 bills match under All. |
| Bill form | Paid on. Leave blank if it isn't paid yet. Total $1,364.00. |
| Mark paid dialog | Mark bill INV-0042 paid. |
| An organization's bills | $4,200.00 unpaid, $1,100.00 of it overdue. No bills from this organization. |
| Money section | Money. Owed to us. Overdue. How late. Not yet due. 1 to 30 days. 31 to 60 days. 61 to 90 days. Over 90 days. Payments received in November. October $11,250.00. Nothing owed. No payments in the last 12 months. What we owe. 9 unpaid bills. Due in the next 30 days. Spending in November. |
| Empty funnel | Deals will show here once you've added some. |
| Empty Money charts | No bills due in the next 30 days. Spending will show here once you've added bills. |
| Cash flow | Cash flow. Money in. Money out. Cash. Forecast. Likely deals. Cash today. End of February. Expected. With likely deals. so far. |
| Cash flow tooltip | Money in. Money out. 3 payments. 2 bills. Cash at the end of October. So far. Still expected. Expected in. Expected out. 4 invoices. Expected cash at the end of December. Likely deals. 2 deals. With likely deals. |
| Cash flow month | Expected in December 2026. Still expected in November 2026. Coming in. Going out. Likely deals. Due Oct 12, 2026. Expected Nov 6, 2026. Closes Dec 18, 2026. Pays 6 days late on average. Close. |
| Cash flow, empty | No opening balance yet. Add one in Company settings to see the cash balance. Cash flow will show here once money comes in or goes out. Nothing expected in December 2026. |
| Empty follow-ups | No follow-ups due. |
| Connection lost, local copy | Can't reach Accountable. Check that it's still running. |
| Connection lost, shared app | Can't reach Accountable. Check your internet connection. |
| Failed read | Couldn't load this. |
| Failed read, with something already showing | Couldn't refresh this, so it may be out of date. |
| Delete dialog | Delete Harbor & Pine? Its 4 contacts and 3 deals will stay, with no organization. This can't be undone. |
| Deleting a bill | Delete bill INV-0042 from Northwind Software? It will leave the dashboard's Money section. This can't be undone. |
| An organization with bills | Harbor & Pine can't be deleted. This organization has 12 bills, so it can't be deleted. |

Money always carries its currency, as in `$48,000`. A product's price also carries its cents, as in `$49.50` and `$1,250.00`, and so does every amount on an invoice and a payment, and a bill's amounts, as in `$1,240.00`, the Money section's figures included, while deal values stay in whole dollars. The cash flow's figures carry their cents too, a likely deal's included, and a balance below zero has a minus sign before the currency, as in `-$4,250.00`. Dates read `Oct 31, 2026`, and times read `Oct 31, 3:20 PM`.

## Design reference

`docs/mockups/4-chosen-design.html` is the reference for the shell, the dashboard and the pipeline, with `4-chosen-design-dashboard.png` and `4-chosen-design-pipeline.png` beside it. It brings together:

- **Mockup 2, Work desk:** the page shell and the dashboard.
- **Mockup 3, Deal wall:** the style of the pipeline board.
- **A top-down sales funnel** in place of Mockup 2's funnel bars, in the style common in sales CRMs.

Organizations, Contacts, Deals, Products, Quotes, Invoices, Bills, the record pages and the dashboard's Money section aren't in the mockup, and follow the screens in [records.md](records.md#screens), [products.md](products.md#screens), [quotes.md](quotes.md#screens), [invoices.md](invoices.md#screens), [bills.md](bills.md#screens) and [cash-flow.md](cash-flow.md#screens), with the Money section laid out as one in [dashboard.md](dashboard.md#dashboard-1), with the same shell, colors and type. Nor is the quote document, the preview and the PDF, which [quotes.md](quotes.md#quote-document) sets out, or the invoice's three designs, which [invoices.md](invoices.md#designs) sets out. Nor are the sign-in screen, the search results, the menu and the Company settings page, which follow their own screens in [sign-in.md](sign-in.md#sign-in-screen), [search.md](search.md#search-box-and-results), [shell.md](shell.md#shell) and [settings.md](settings.md#company-settings-page). The mockup's top bar has no Products, Quotes, Invoices or Bills section, search box or menu, and ends with the date. Mockups 1 to 3 stay in `docs/mockups/` as a record of the options, and aren't a reference. The figures in the mockups come from `docs/mockups/shared.js` and are examples. The app's sample data follows M1 to M6.

The mockups show light mode only. Dark mode follows the dark values in [Color tokens](#color-tokens), and `docs/changes/dark-mode/` holds screenshots of the dashboard and the pipeline in both modes, at 1440 by 900 with the sample data.

Where the spec and the mockup disagree, the spec is right.
