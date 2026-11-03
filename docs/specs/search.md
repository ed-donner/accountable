# Spec: Search

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Search

- **K1.** A search box in the top bar, on every screen once signed in, finds organizations, contacts and deals by any part of their name. Activities aren't searched.
- **K2.** Search ignores case, in any language, so "émile" finds "Émile", and gives the same results in the local copy, on SQLite, and the shared app, on Postgres. Spaces at either end are ignored, and `%` and `_` match only themselves.
- **K3.** Results update as you type, from the first letter, once typing pauses for 150ms. A reply to an older search never replaces a newer one.
- **K4.** Results come in three groups, Organizations, Contacts and Deals, in that order, and a group with no matches is left out. Each group shows up to 5: names that start with the text come first, then the rest, each in alphabetical order. A group with more than 5 ends with "See all 12 contacts" (or the matching word), which opens that section's table with the same search (T4). The table also searches its other columns (T2), so it can show more than the group counted.
- **K5.** Each result shows its name, with the part that matches in semibold, and one detail in muted ink: an organization's industry, a contact's organization, or a deal's organization. A deal also shows its stage chip after its name.
- **K6.** The arrow keys move through the results, Enter opens the one highlighted, and clicking a result opens it too. Opening a result clears the box and closes the list. Escape closes the list, and a second Escape clears the box.
- **K7.** With no matches, the list says "No organizations, contacts or deals match "harbour"." If the search fails, it says "Couldn't search. Try again." and keeps what was typed. A lost connection shows the message in N5 as usual.

## Screens

### Search box and results

The search box sits in the top bar after the five sections ([Shell](shell.md#shell)). It's 240px wide and 36px tall, in the page color like other inputs, with a magnifier icon and the placeholder "Search". Its label for screen readers is "Search organizations, contacts and deals".

The results open below the box, 420px wide and lined up with its right edge, on the raised surface with a soft shadow, rounded like picker lists. Group headings are labels in muted ink. Each result is one 44px row, with the highlighted one in the page color, as rows are on hover. Built with `cmdk` and Radix Popover, like the record pickers.
