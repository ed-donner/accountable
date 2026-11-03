# Spec: Deal stages and the pipeline

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Stage changes

- **S1.** These rules apply however a stage changes: on the board, in the deal form, or anywhere else.

| Move | Probability | Close date | Main contact | Timeline |
|---|---|---|---|---|
| To an open stage | The new stage's usual one | Unchanged | Unchanged | New entry |
| To Won | 100% | Today | Status becomes Customer | New entry |
| To Lost | 0% | Today | Unchanged | New entry |
| From Won or Lost to an open stage | The new stage's usual one | Unchanged | Unchanged, stays a Customer if they were one | New entry |

- **S2.** The entry reads "Moved from Proposal to Negotiation", and on timelines it shows who moved the deal (A7). It appears on the deal's timeline, on its main contact's timeline, on its organization's timeline and in the dashboard's recent activity.
- **S3.** Moving a card within its own column changes nothing but its place, and adds no entry.
- **S4.** A probability set by hand stays until the stage changes.
- **S5.** A won deal with a blank main contact is still won. There's just no contact to update.
- **S6.** A contact's status can be edited by hand at any time. Apart from that, only a move to Won changes it, and nothing changes it back. Moving a deal to Qualified doesn't make its contact Qualified: they share a word and nothing else.
- **S7.** A reopened deal keeps its close date, so it shows as late from the next day until someone sets a new date.
- **S8.** A deal added straight into Won counts as a win, so its main contact becomes a customer. It gets no stage-change entry, because nothing moved.
- **S9.** A deal whose stage changes anywhere but the board goes to the top of its new column. A new deal goes to the top of its column too.

## Pipeline

- **P1.** One column per stage, in order: New, Qualified, Proposal, Negotiation, Won, Lost. Each column is headed by a solid block in its stage color.
- **P2.** Dragging a card to another column changes its stage, following S1. Dragging within a column changes its place. A card can be dropped anywhere and stays there after a refresh and a restart.
- **P3.** The board shows the total value and expected revenue of open deals. Each open column shows its deal count, total value and expected revenue. Won and Lost show their count and total value, because expected revenue would just repeat the value or show zero.
- **P4.** All figures change the moment a card lands, before the server replies. If the save fails, the card returns to where it was and a message says so. Every move gets its own message, even if another move has started or the board has been left.
- **P5.** A card shows the deal's name, organization, main contact, value, probability and close date. Clicking it opens the deal.
- **P6.** A late card stands out through a Late chip and a Raspberry tint across the whole card, pale in light mode and deep in dark mode.
- **P7.** Each column has an Add deal button that opens the form at that stage.
- **P8.** After a drop on Won or Lost, a message says what else changed, such as "Marked as Won. Close date set to today. Sam Carter is now a customer."
- **P9.** Cards can also be moved with the keyboard. Space picks a card up, the arrow keys move it within and across columns, and Space drops it. Enter opens the deal.
- **P10.** There's no undo. Dropping a card on Won replaces the expected close date and any hand-set probability, and makes the main contact a customer. Dragging it back restores none of these, which is why P8's message says exactly what changed.
- **P11.** Every deal stays on the board, so the Won and Lost columns only get longer and could reach hundreds of cards. Each column scrolls by itself.

## Screens

### Pipeline

```
Pipeline                      Open pipeline $1,240,000   Expected revenue $369,500

+-----------+ +-----------+ +-----------+ +-----------+ +-----------+ +-----------+
| New    11 | | Qualified | | Proposal  | | Negotiat. | | Won    32 | | Lost   12 |
| $310,000  | | $420,000  | | $290,000  | | $220,000  | | $494,500  | | $186,000  |
| Expected  | | Expected  | | Expected  | | Expected  | |           | |           |
| + Add deal| | + Add deal| | + Add deal| | + Add deal| | + Add deal| | + Add deal|
+-----------+ +-----------+ +-----------+ +-----------+ +-----------+ +-----------+
+-----------+ +-----------+
| $36,000   | | $36,000 Late   (late card: Raspberry tint)
| Deal name | | Deal name |
| Org       | | Org       |
| Contact   | | Contact   |
| 5%   Date | | 20%  Date |
+-----------+ +-----------+
```

Each column is headed by a solid block in its stage color, using the text color from the [stage table](visual-design.md#stage-chip-and-chart-colors). The block holds the stage name and deal count, the total value, the expected revenue for open stages, and Add deal. It stays put while the cards below it scroll, and the page header stays put too.

Cards are in the panel color on the page background and lead with their value, so the money is the first thing read down a column. A dragged card lifts with a soft shadow, the only shadow on the board. Card text is cut off with an ellipsis if it doesn't fit, with the full text in the browser's own tooltip, because a component on each of 500 cards would slow dragging.
