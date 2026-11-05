# Spec: Search

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Search

- **K1.** A search box in the top bar, on every screen once signed in, finds organizations, contacts, deals and products by any part of their name. Activities, archived products ([G10](products.md#archiving)) and invoices aren't searched. The Invoices table has its own search (V22).
- **K2.** Search ignores case, in any language, so "émile" finds "Émile", and gives the same results in the local copy, on SQLite, and the shared app, on Postgres. Spaces at either end are ignored, and `%` and `_` match only themselves.
- **K3.** Results update as you type, from the first letter, once typing pauses for 150ms. A reply to an older search never replaces a newer one.
- **K4.** Results come in four groups, Organizations, Contacts, Deals and Products, in that order, and a group with no matches is left out. Each group shows up to 5: names that start with the text come first, then the rest, each in alphabetical order. A group with more than 5 ends with "See all 12 contacts" (or the matching word), which opens that section's table with the same search (T4). The table also searches its other columns (T2), such as a product's description, so it can show more than the group counted.
- **K5.** Each result shows its name, with the part that matches in semibold, and one detail in muted ink: an organization's industry, a contact's organization, a deal's organization, or a product's unit price, with its cents, in JetBrains Mono (G3). A deal also shows its stage chip after its name.
- **K6.** The arrow keys move through the results, Enter opens the one highlighted, and clicking a result opens it too. Opening a result clears the box and closes the list. Escape closes the list, and a second Escape clears the box.
- **K7.** With no matches, the list says "No organizations, contacts, deals or products match "harbour"." If the search fails, it says "Couldn't search. Try again." and keeps what was typed, and clicking the box or pressing the down arrow tries again. A lost connection shows the message in N5 as usual, and adds nothing to the list.
- **K8.** While the next search loads, the last results stay on screen, so the list doesn't flicker as you type. Clearing the box drops them. The box takes up to 100 characters, the longest search the API accepts. The backend answers each search with one query, every kind at once, so a keystroke costs one round trip to the database.

## Screens

### Search box and results

The search box sits in the top bar after the seven sections ([Shell](shell.md#shell)). It's 180px wide and 36px tall, so the top bar still fits on one line at 1280px, in the page color like other inputs, with a magnifier icon and the placeholder "Search". Its label for screen readers is "Search organizations, contacts, deals and products", and it tells them whether its results are open.

The results open below the box, 420px wide, wider than the box, and lined up with its right edge, on the raised surface with a soft shadow, rounded like picker lists. Group headings are labels in muted ink. Each result is one 44px row, with the highlighted one in the page color, as rows are on hover. Built with `cmdk` and Radix Popover, like the record pickers.
