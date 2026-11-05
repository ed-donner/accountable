# Spec: Quotes

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Quotes

- **Q5.** A quote holds the prices offered to a customer on one deal: lines from the price list, each with a quantity and a price, added up, with the tax from the company settings. Quotes is the seventh section in the top bar, after Products ([N1](shell.md#app-shell)). Each quote has its own page, and the pages of deals and organizations list their quotes (Q36, Q37).
- **Q6.** A quote is a draft, sent, accepted or declined. Statuses only move forward, so a mistake is fixed by copying the quote (Q25), and nothing moves a quote back.

| Status | Can become | By |
|---|---|---|
| Draft | Sent or declined | Mark as sent (Q20), Decline (Q24) |
| Sent | Accepted or declined | Accept (Q22), Decline (Q24) |
| Accepted, Declined | Nothing | |

- **Q7.** A sent quote shows as Expired from the day after its valid-until date, everywhere a status shows: its page, the Quotes table, the figures above it and the panels. On the valid-until date itself it's still Sent, as a deal due today isn't late. Expired is how a sent quote shows, worked out from today, and is never saved, so an expired quote can still be accepted or declined: the team decides whether to honor a late yes.

### Adding a quote

- **Q8.** New quote, on an open deal's Quotes panel or beside the Quotes section's title, opens the page for a new draft. From the Quotes section it first asks which deal, in a dialog with a searchable picker that lists open deals only, as in F3 but with no offer to add one. A closed deal's panel has no New quote, and says "Quotes can be added while the deal is open."
- **Q9.** Nothing is saved, and no number is taken, until Save quote. Leaving the page before then drops the new draft, as leaving the Company settings page drops what's typed (B10). The first save takes the quote's number (B15), so a draft nobody saved never uses up a number, and sets the quote's date to today. Its valid-until date starts 30 days after that, such as Dec 5, 2026 for a quote dated Nov 5, 2026, and can be changed while it's a draft. It can't be before the quote's date, with "Choose a date on or after the quote's date" beside it, and sending needs it to be today or later (Q20).
- **Q10.** A quote can be added or copied (Q25) only while its deal is open. A deal that closes some other way, such as being dragged to Lost, keeps its quotes as they are, and they can still be declined.

### Lines

- **Q11.** Add product opens a searchable list of the active products, each with its unit price (G3), and adds the one chosen as a new line at the end, with the product's name, description and unit price, and a quantity of 1. Archived products aren't in the list, and the backend refuses a new line for one with "This product is archived. Choose another." A product can be on more than one line.
- **Q12.** While the quote is a draft, a line's description, quantity and unit price can be changed, and a line can be removed. Its name stays the product's. Lines keep the order they were added in.
- **Q13.** A line keeps the product's name as it was when the line was added, and the description and price it has on the quote, so a later change to the product, or archiving it, never changes a quote. The backend takes a new line's name from the product, never from the request.

| Field | Rule | Message beside the field |
|---|---|---|
| Description | Optional, over as many lines as it needs. Starts as the product's description | |
| Quantity | Required. A whole number from 1 to 1,000,000, with commas allowed when typed (B17) | Enter a whole number from 1 to 1,000,000 |
| Unit price | Required. Dollars and cents from $0.00 to $1 trillion, typed as a product's price is (G4) | Enter a price in dollars and cents, such as 49.50 |

- **Q14.** A quote has at most 100 lines, with "Keep the quote to 100 lines or fewer", and a subtotal of at most $1 trillion, with "Keep the subtotal to $1 trillion or less" (B17). The page checks both before it saves, and so does the backend.

### Amounts and tax

- **Q15.** A quote adds up by B16: each line's amount is its quantity times its unit price, the subtotal adds up the lines, the tax is worked out once on the subtotal, to the nearest cent with halves rounding up, and the total is the subtotal plus the tax. Every amount shows with its cents, as in `$1,250.00`. The page works them out as you type, for the form and the preview. The backend works out what it saves from the lines, and never takes an amount from the request.
- **Q16.** A quote's value is its subtotal, before tax, as a deal's value is. The figures above the Quotes table (Q34) and the panels show values. The Quotes table and the quote itself show the total with tax too.
- **Q17.** A draft's tax follows the company settings, so changing the tax label or rate there changes every draft's tax and total. Sending a quote, or declining a draft (Q24), fixes the label and rate on it, as they are at that moment, and nothing changes them after, so only a draft's tax ever changes. A blank tax label shows as "Tax". The rate shows as B7 says, such as "Sales tax (8.875%)".

### Prepared for

- **Q18.** A quote says who it's for, under "Prepared for": the name of the deal's organization, then its main contact's name and email. Any that are blank are left out, so a deal with no main contact shows the organization alone. A draft follows the deal, so changing the deal's organization or main contact, or their names, changes it. Sending a quote, or declining a draft, fixes them on it as they are at that moment, and nothing changes them after. There's no customer address.

### Saving and sending

- **Q19.** Save quote saves the form, once however quickly it's pressed (F10), and shows "Quote saved." Errors show beside their fields (F2), a line's beside that line's box. If the save fails, the page keeps what was typed and says so. A save that changes nothing doesn't count as a change (U10). While someone is typing, a teammate's newer save to the same draft doesn't overwrite what they've typed, as on the Company settings page (B10), and the last save wins. Leaving the page drops anything not yet saved, as there.
- **Q20.** Mark as sent, on a draft, asks first: "Mark QT-0004 as sent? It can't be changed after this. To change it later, copy it to a new draft." It saves anything typed first, then sends, so what's sent is what's on screen. Sending fixes the company's details (Q30), the tax (Q17) and Prepared for (Q18) on the quote, records the day it was sent, and shows "Quote sent." It's refused, leaving the quote a draft with what was typed saved, when:

| When | Message |
|---|---|
| The deal is closed | This deal is closed, so its quotes can't be sent. |
| The deal has no organization | Give the deal an organization before sending its quote. |
| The quote has no lines | Add a line before sending the quote. |
| The valid-until date is before today | Choose a valid-until date from today on. (beside the date) |
| No company name is saved (B14) | Add the company's name in Company settings first. |

- **Q21.** Only a draft can be changed. A sent, accepted or declined quote's page shows the quote with no form, and the API refuses any change to its valid-until date or its lines with a 409: "QT-0004 has been sent, so it can't be changed. Copy it to make a new draft.", with accepted or declined in place of sent. A teammate's save to a draft that was sent while they were editing it is refused with the same words, and what they typed stays on screen.

### Accepting and declining

- **Q22.** Accept, on a sent quote, expired or not, asks first, naming everything it will change, such as "Accept QT-0004? Harbor & Pine renewal will move to Won with a value of $48,001, and QT-0003 will be marked declined. This can't be undone." Accepting does all of this in one save, so a failure leaves nothing done:
  - It marks the quote accepted, and records the day.
  - It moves the deal to Won by S1, as dragging its card there does: a probability of 100%, a close date of today, the main contact made a customer, a stage-change entry on the timelines with whoever accepted as who moved it (S2), and the deal at the top of the Won column (S9).
  - It sets the deal's value to the quote's value in whole dollars, to the nearest dollar with halves rounding up, so a subtotal of $48,000.50 makes the deal worth $48,001.
  - It marks the deal's other sent quotes declined. Its drafts stay drafts.

  Then a message says what changed, as P8's does: "Quote accepted. Harbor & Pine renewal is now Won at $48,001. Close date set to today. Sam Carter is now a customer."
- **Q23.** A deal has at most one accepted quote, and the database makes sure of it too. Accepting a draft is refused with "QT-0004 is a draft. Mark it as sent before accepting it." Accepting is refused with "This deal is closed, so its quotes can't be accepted." while the deal is closed, so accepting a quote is always what wins its deal, and a deal dragged to Won first can't accept one after. A won deal dragged back to an open stage keeps its accepted quote, so it can't accept another, and accepting is then refused with "This deal already has an accepted quote, QT-0004." Nothing undoes an acceptance, as nothing undoes a move to Won (P10).
- **Q24.** Decline, on a draft or a sent quote, asks first: "Decline QT-0004? This can't be undone." It marks the quote declined, records the day and shows "Quote declined." A declined draft has the company's details, its tax and Prepared for fixed as sending would, so it stops following the settings and the deal like any quote that isn't a draft. Declining changes nothing on the deal, and works on a closed deal's quotes too. A draft that's no longer wanted is declined, because quotes are never deleted (Q26).

### Copying

- **Q25.** Copy to new draft, on any quote whose deal is open, makes a new draft on the same deal at once and opens it, with "Copied to QT-0012." The copy has its own number, today's date and a valid-until date 30 days after it, and the same lines in the same order, with their names, descriptions, quantities and prices. That includes a line whose product has since been archived, because it's copied rather than added from the price list (Q11). Its company details, tax and Prepared for follow the settings and the deal, as on any draft. The original doesn't change.

### No deleting

- **Q26.** Quotes are never deleted, so their numbers never have gaps. Neither the app nor the API has a way to delete one. `npm run empty` removes them with every other record (C4).
- **Q27.** A quote holds its deal ([D4](records.md#deleting)), so a deal with quotes can't be deleted, and its delete dialog says "This deal has 2 quotes, so it can't be deleted." Quotes don't hold the deal's organization. Deleting it leaves the deal and its quotes: the drafts then show no organization under Prepared for, only the deal's main contact if it has one, and can't be sent until the deal has an organization again, and the sent ones keep theirs (Q18).

### The quote page

- **Q28.** Each quote has its own address, `/quotes/7`, and a new draft's page is `/quotes/new?deal=12`. The page shows the quote's number and status, a link to its deal, its date and valid-until date, the day it was sent and the day it was accepted or declined, and who added it and last changed it, as in R6. A draft has its form beside the preview. Any other quote shows the preview alone. An address that couldn't be a quote, or names one that doesn't exist, shows "This quote no longer exists" with a link back to Quotes (N4). A new draft's page for a deal that doesn't exist shows "This deal no longer exists" with a link back to Quotes, and for a closed deal it says "This deal is closed, so it can't take a new quote." with a link to the deal.
- **Q29.** Each quote records who added it and who last changed it, following U10. Saving a change, sending, accepting and declining count as changes, and so does being declined because another quote on the deal was accepted, which counts as a change by whoever accepted.

### The PDF

- **Q30.** Download PDF, on every quote's page, downloads the quote as a PDF named after its number, such as `QT-0004.pdf`. The backend makes it at that moment, from the quote as saved, so on a draft with changes not yet saved it saves them first. It shows the company's name, address, email and phone as they were fixed when the quote was sent, or when it was declined as a draft, so a later change to the company settings never changes a quote a customer has. A draft shows them as the company settings have them at that moment ([B1](settings.md#company-settings)). The tax follows Q17 the same way. A draft's PDF is marked Draft, and no other status is marked. A draft's Download PDF is refused with "Add the company's name in Company settings first." while no company name is saved (B14). A sent quote always has one, because sending needs it (Q20).
- **Q31.** The PDF looks like the preview: the same layout, fonts, colors, words and figures, drawn from the same reply ([Quote document](#quote-document)). It's US Letter, with as many pages as the lines need, the lines' column headings repeated at the top of each page, and each page numbered. The fonts are embedded, so it looks the same on any computer. They hold the Latin alphabets, accents included, and a character they don't have, such as Chinese or an emoji, is left blank on the PDF, with the rest of its text as typed.
- **Q32.** Everything on the PDF that someone typed, such as a line's description, the company's address or a deal's organization name, appears as plain text, exactly as typed, never read as markup or formatting. So `<b>Rush</b>` shows as those characters, and line breaks are kept.

### The Quotes section

- **Q33.** The Quotes table follows T1 to T5, with New quote as its Add button (Q8) and no Edit or Delete on its rows, because only a draft can be changed and no quote can be deleted. Clicking a row opens the quote. Number sorts in the order the numbers were taken, so QT-10000 comes after QT-9999, whatever the prefix was. Status sorts Draft, Sent, Expired, Accepted, Declined. Organization is the deal's organization as it is now, or None (F5).

| Table | Columns | Default sort |
|---|---|---|
| Quotes | Number, Deal, Organization, Status, Value, Total, Date, Valid until | Number, newest first |

- **Q34.** Above the table, six figures give the count and the total value of every quote, and of the quotes in each status: All, Draft, Sent, Expired, Accepted and Declined. An expired quote counts as Expired, not Sent. They count every quote, whatever the search. Each is also a filter, as Contacts' status filter is (T6): choosing one shows only that status, it works together with the search, and it stays in the address (T4). Clearing a search with no matches clears the filter too (T7).
- **Q35.** With no quotes at all, the table says "No quotes yet. Add the first one from an open deal." with New quote. A filter with no quotes says so, such as "No expired quotes.", with a button that shows them all.

### Panels on deals and organizations

- **Q36.** A deal's page has a Quotes panel, below its own panels (R7). It lists the deal's quotes, newest first, each with its number in JetBrains Mono, its status chip and its value, and each opens its quote. On an open deal it has New quote, and on a closed one Q8's line. With none, it says "No quotes yet."
- **Q37.** An organization's page has a Quotes panel too, listing the quotes on its deals, newest first, each with its number, status chip, value and the deal's name. A quote starts from a deal, so this panel has no New quote. With none, it says "No quotes yet." Both panels are short linked lists, as R5 says.

## Screens

### Quotes table

Laid out like the other tables ([Screens](records.md#screens)): the page title with New quote beside it, then the figures, then the search box, then the table on a panel. The figures sit on one panel across the page, as six buttons side by side, each with the status's name in the label style, its count, and its total value in JetBrains Mono at the headline figure size. They follow Contacts' status filter: the chosen one is Sea Green with Midnight text, as the current section is, and the others take the page color on hover. Money and dates in the table are in JetBrains Mono, as in other tables, and so is the number. Status is a chip in the tones in [Visual design](visual-design.md#stage-chip-and-chart-colors).

```
Quotes  [New quote]

+------------------------------------------------------------------------------------------------------------+
| [All 40        ] [Draft 8      ] [Sent 13      ] [Expired 2    ] [Accepted 15  ] [Declined 2   ]           |
| [$542,050.50   ] [$96,400.00   ] [$187,250.50  ] [$21,600.00   ] [$220,000.00  ] [$16,800.00   ]           |
+------------------------------------------------------------------------------------------------------------+
[Search]
+------------------------------------------------------------------------------------------------------------+
| Number    Deal              Organization   Status   Value        Total        Date          Valid until    |
| QT-0040   Annual support    Harbor & Pine  (Sent)   $18,000.00   $19,597.50   Nov 3, 2026   Dec 3, 2026    |
+------------------------------------------------------------------------------------------------------------+
```

### Quote page

The page title is the quote's number in JetBrains Mono at the page title size, with its status chip after it, or "New quote" before the first save. The deal's name sits under the title as a link, in the style of R6's lines. The buttons sit at the right of the title:

| Status | Main button | Other buttons |
|---|---|---|
| Draft | Save quote | Mark as sent, Decline, Copy to new draft, Download PDF |
| Sent or expired | Accept | Decline, Copy to new draft, Download PDF |
| Accepted or declined | | Copy to new draft, Download PDF |

Copy to new draft shows only while the deal is open (Q25). A new draft has Save quote alone. The main button is Sea Green with Midnight text, and the others are secondary buttons in the page color.

Below, two columns of panels on the page background, as on the record pages:

- **Left, 480px:** the details panel: Date, then Valid until on any quote but a draft, whose form has it, then Sent, Accepted or Declined, as each applies, with R6's lines at its foot in muted ink. On a draft, the form follows in its own panel: Valid until, as a date box, then "Lines" as a section heading, then each line in turn, then Add product. Each line shows its name in semibold, its description box, two lines tall and growing as lines are typed, then Quantity, a short box, Unit price, with `$` at its start and its figures in JetBrains Mono, and the line's amount in JetBrains Mono, with an icon button at the end to remove it, labeled for screen readers such as "Remove Pro license". Lines are separated by space, not lines. Add product opens a searchable list, built with `cmdk` and Radix Popover like the record pickers, with each product's price in JetBrains Mono in muted ink.
- **Right, the rest of the width:** the preview, which is the [Quote document](#quote-document) at the column's width. It stays in view while the form scrolls, and scrolls by itself if it's taller than the window, with its scrollbar in the paper colors, paper muted ink on paper, in dark mode too.

Enter in a one-line box saves, and in a description box it starts a new line. The dialogs for Mark as sent, Accept, Decline and the deal picker are the app's usual dialogs, and their main buttons read Mark as sent, Accept quote, Decline quote and Continue. Decline isn't a Delete, so its button isn't Raspberry. At 1280 by 720, the title, buttons and first line fit without scrolling.

### Quote document

The preview and the PDF are one design, set out here once. Its colors are the paper tokens: paper, paper ink, paper muted ink and the paper band, so ink and muted ink here mean paper ink and paper muted ink. Sizes are in points on the PDF, and the preview draws the sheet at those sizes, scaled to its column. It's always in the paper colors, white with Midnight ink, in dark mode too ([Color tokens](visual-design.md#color-tokens)), because it shows the paper the customer gets. The PDF's colors are the same values. On screen the sheet has the panels' 16px radius, and the PDF's page is square.

```
+-------------------------------------------------------------------------+
| Plainsong Systems                             Quote  (Draft)            |
| 48 Orchard Row, Suite 210                     Number            QT-0004 |
| Brooklyn, NY 11201                            Date          Nov 5, 2026 |
| accounts@plainsong.example                    Valid until   Dec 5, 2026 |
| (718) 555-0142                                                          |
|                                                                         |
| Prepared for                                                            |
| Harbor & Pine                                                           |
| Sam Carter                                                              |
| sam.carter@harborpine.example                                           |
|                                                                         |
| [ Item                                  Qty    Unit price      Amount ] |
|   Pro license                            12       $480.00   $5,760.00   |
|   Annual license, per seat                                              |
|   Training day                            2     $1,250.00   $2,500.00   |
|                                                                         |
|                                         Subtotal            $8,260.00   |
|                                         Sales tax (8.875%)    $733.08   |
|                                     [ Total               $8,993.08 ]   |
|                                                                         |
| QT-0004                                                     Page 1 of 1 |
+-------------------------------------------------------------------------+
```

- **Page:** US Letter, 612 by 792 points, with margins of 54 points, white.
- **Company, top left:** the company's details as Q30 says: the name in Instrument Sans semibold at 18 points, then the address over its lines, the email and the phone, each at 9 points in muted ink. Blank ones are left out.
- **Quote, top right:** "Quote" in Instrument Sans semibold at 24 points. A draft has a Draft chip after it, in the quiet tone, on the paper band with paper muted ink. Below come Number, Date and Valid until, each a label at 9 points semibold in muted ink, with its value beside it at 10 points in JetBrains Mono, lined up on the right. A new draft has no number until it's saved (Q9), so its preview leaves Number out.
- **Prepared for:** the label at 9 points semibold in muted ink, then the organization at 11 points semibold, then the contact's name and email at 10 points.
- **Lines:** the column headings Item, Qty, Unit price and Amount at 9 points semibold in muted ink, on the paper band with a 6-point radius. Each line has its name at 10 points semibold, its description under it at 9 points in muted ink with its line breaks kept, and its quantity, unit price and amount at 9.5 points in JetBrains Mono, lined up on the right. Lines are separated by space, not lines. Long descriptions wrap within the Item column. Qty, Unit price and Amount are each as wide as their widest figure, counted in characters, which JetBrains Mono makes all the same width, and at least as wide as their headings, and Item takes the rest, so the preview and the PDF size them alike.
- **Totals, at the right under the lines:** Subtotal and the tax, labeled as Q17 says, at 10 points, then Total on a Sea Green block with a 6-point radius and Midnight text, its label at 11 points semibold and its amount at 12 points in JetBrains Mono. Amounts line up with the Amount column.
- **Foot of each page:** the quote's number on the left and "Page 1 of 2" on the right, at 8 points in muted ink. The preview is one sheet, so its foot has the number alone.
- **Pages:** the preview is one sheet that grows with the lines. The PDF starts a new page when the next line won't fit, never splitting a line across two pages, and repeats the column headings at the top of the next. A line too long for a page of its own, which only a description of many lines could make, carries on over the next page rather than being cut off. The totals stay together, on the last page.
