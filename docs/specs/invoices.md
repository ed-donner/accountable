# Spec: Invoices and payments

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Invoices

- **V1.** Invoices is where billing happens: what the business has charged its customers for won deals, what they've paid and what they still owe. It's the eighth section in the top bar, after Quotes ([N1](shell.md#app-shell)), at `/invoices`, and each invoice has its own page at `/invoices/<id>` (N2).
- **V2.** An invoice is for one deal, and a deal can have several. Only a deal in Won can start a new one. A deal that moves out of Won later, on the board or in its form, keeps its invoices, and they carry on as usual: a draft can still be edited and issued, and payments can still be recorded.
- **V3.** An invoice is a draft, issued or void, and an issued invoice is paid once nothing is owed on it. Its chip, its mark and the Invoices table show one of six, the first that fits:

| Shows as | When |
|---|---|
| Draft | Not issued yet |
| Void | Voided (V14) |
| Paid | Issued, and its payments add up to its total |
| Overdue | Issued, money still owed, and today is after its due date, whether or not some of it is paid |
| Part paid | Issued, some of it paid, and not past its due date |
| Issued | Issued, nothing paid, and not past its due date |

An invoice due today isn't overdue, as a deal due today isn't late. Days late is the number of days from the due date to today, so an invoice due yesterday is 1 day late. The backend works out what each invoice shows as from today ([Terms](../spec.md#terms)), so the page, the table and the dashboard always agree.

### Drafts

- **V4.** New invoice starts a draft. It's on a won deal's Invoices panel (V20), and beside the Invoices page's title, where it first asks for the deal, in a dialog whose picker lists won deals only, saying "Choose a won deal" if none is chosen. The draft opens straight away on its own page, with no lines and its Bill to filled in (V5).
- **V5.** The Bill to box says who the invoice is for. A new draft fills it from the deal: the organization's name, then "Attn:" and the main contact's name, then the contact's email, each on its own line, leaving out any that's blank. Organizations have no address in Accountable, so the address is typed here. It can be edited until the invoice is issued. Spaces and line breaks at its ends are dropped, as in every field (B4), and the rest is kept exactly as typed, runs of spaces included.
- **V6.** Add line picks a product from a searchable list of active products ([G10](products.md#archiving)). The line takes the product's name, unit price and description as they are at that moment, with a quantity of 1. Its name stays as it was taken, even if the product is renamed or archived later, and its price stays unless it's changed on the line. A product archived before the line is first saved can't start one, and the line says "Choose an active product". A line's description, quantity and unit price can be changed, and a line can be removed. Lines keep the order they were added in.
- **V7.** A line's amount, the subtotal, the tax and the total follow [B16](settings.md#for-quotes-and-invoices), at the tax label and rate in Company settings as they are now, so a draft follows the settings until it's issued. The figures on the page change as you type. Elsewhere, in the Invoices table and on the panels, a draft's figures come from the backend, from its lines as last saved.
- **V8.** Save draft saves the Bill to and the lines together. It saves once, however quickly it's pressed, and says "Draft saved." Anything typed while the save is on its way stays, still to be saved, and a line the save added takes the id the backend gave it, so the next save keeps its name and product as V6 says. If it fails, the page keeps what was typed and says so, as forms do (F10). What was typed also stays when the page reads the draft again for a new day (V31). Leaving the page with changes not yet saved asks first: "Leave without saving? Your changes to this draft will be lost.", with Leave and Stay. Delete draft asks first, as deletes do (D1): "Delete this draft? It has no number yet, so nothing is skipped. This can't be undone." Only a draft can be deleted.

| Field | Rule | Message beside the field |
|---|---|---|
| Bill to | Required to issue. Up to 6 lines and 500 characters | Enter who the invoice is for. Keep the Bill to to 6 lines and 500 characters |
| Description | Optional. Up to 1,000 characters, over several lines | Keep the description to 1,000 characters or fewer |
| Quantity | A whole number from 1 to 1,000,000 ([B17](settings.md#for-quotes-and-invoices)) | Enter a whole number from 1 to 1,000,000 |
| Unit price | $0.00 to $1 trillion, typed as in [G4](products.md#the-price-list) | Enter a price in dollars and cents, such as 49.50 |
| Lines | Up to 100, and at least one to issue | Add a line before issuing. An invoice can have up to 100 lines |
| Subtotal | At most $1 trillion (B17) | Keep the subtotal to $1 trillion or less |
| Characters | The Bill to, each description and each line's name use only characters the invoice's fonts can draw (V28) | Invoices can't show "漢". Take it out to save. A line's name, which can't be edited, says: Invoices can't show "漢". Remove this line, rename the product and add it again |

- **V9.** The backend checks every value, whatever sends it, as with the company settings (B5), and works out every amount itself from the quantities, the unit prices and the tax rate. It checks each value as it will be saved, so a Bill to filled in from the deal, or a description taken from a product, is held to V8's limits as one typed is, since organization names and product descriptions have no such limits of their own. A line's amount, a subtotal, a tax or a total sent in a request is ignored, as any unknown field is. The fonts cover the letters A to Z with their accents in most European languages, digits, punctuation and the common symbols, such as $, € and ©, but not emoji or scripts such as Chinese or Arabic. A character they can't draw would print as a blank box, so a draft that has one isn't saved, whether by Save draft or Issue invoice, and the field gets the message above, naming each such character once. A character that can't be seen would show as empty quotes, so the message names it instead: "a tab", "an unusual space" for a space the fonts lack, and "an invisible character" for any other, by its Unicode category. The page checks before it sends, and the backend checks again on every save.

### Issuing

- **V10.** Issue invoice saves the draft and issues it in one step, after asking "Issue this invoice? Once it's issued, it can't be changed." It's refused, with the reason beside the field or at the top of the form, while a field breaks a rule in V8, while the draft has no lines, while its total is $0.00, with "The total must be more than $0.00 to issue.", while its deal has no organization, with "This deal has no organization. Choose one on the deal before issuing.", while no company name is saved, with "Enter the company's name in Company settings before issuing." ([B14](settings.md#starting-values)), and while any of the company's details that issuing copies (V11), its name, address, email, phone or tax label, has a character the invoice's fonts can't draw (V9), naming the field and the character, such as "The address in Company settings has "漢", which invoices can't show. Change it there before issuing." Company settings themselves take any characters (B4), so this is the one place they're checked.
- **V11.** Issuing gives the invoice:
  - **Its number**, as in [B15](settings.md#for-quotes-and-invoices): the invoice prefix as the settings have it at that moment, then the next in the invoices' count, such as INV-0042. Only issuing takes a number, a draft never has one, and only a draft can be deleted, so the numbers have no gaps. Two invoices issued at the same moment get different numbers, one after the other.
  - **Its dates:** today as its issue date, and as its due date the issue date plus the payment terms in Company settings.
  - **Its organization:** the deal's organization at that moment. The invoice belongs to it from then on: it stays on that organization's page and holds it (V21), even if the deal's organization changes later.
  - **A copy of everything written on it,** which never changes after: the company's name, address, email and phone, the Bill to, the lines, the tax label and rate, and the figures. A later change in Company settings, or to a product, leaves an issued invoice as it was.
- **V12.** An issued invoice never changes. Its page has no way to edit it, and the API refuses any change to it, or its deletion, with a 409: "This invoice has been issued, so it can't be changed." So does a save of a draft that a teammate has issued in the meantime, and the page then shows the invoice as issued. Recording or deleting a payment changes only what's owed and what it shows as (V3), and voiding only its status.
- **V13.** How an invoice looks, its design, accent color and logo, isn't copied when it's issued. It follows Company settings as they are when the preview is drawn or the PDF is made ([B18](settings.md#documents)), so a new logo shows on every invoice, old ones included.

### Voiding

- **V14.** Void invoice puts right a mistake in an issued invoice. It asks first: "Void INV-0042? It keeps its number and is marked VOID. This can't be undone." A void invoice keeps its number and everything on it, and nothing is owed on it. An invoice with payments can't be voided: Void isn't offered, and the API refuses with a 409, "This invoice has payments, so it can't be voided." A draft is deleted rather than voided, and the API refuses to void one with "A draft is deleted rather than voided.", or a void invoice with "This invoice is already void." To bill again, start a new invoice on the deal.

### Payments

- **V15.** Record payment adds a payment to an issued invoice with money owed. The form opens with the date as today, the amount as what's still owed, and the method as Bank transfer.

| Field | Rule | Message beside the field |
|---|---|---|
| Date | Required. Not after today, and not before the issue date | Enter the date it was paid. A payment can't be dated in the future. A payment can't be dated before the invoice was issued |
| Amount | Required. More than $0.00 and no more than what's still owed, typed as in G4. That can be up to $2 trillion, a $1 trillion subtotal with tax at 100% (B17), more than a price can be | Enter an amount more than $0.00. That's more than the $1,250.00 still owed |
| Method | Bank transfer, Card, Check, Cash or Other | Choose how it was paid |
| Reference | Optional. Up to 100 characters, such as a check number | Keep the reference to 100 characters or fewer |

- **V16.** The backend checks the amount against what's owed inside the payment's own save, under the write lock, so two payments recorded at the same moment can never add up to more than the total. A payment that brings what's owed to zero makes the invoice Paid. A draft or a void invoice can't take a payment.
- **V17.** A payment entered by mistake can be deleted, after asking: "Delete this payment of $500.00? What's owed goes back up to $1,250.00." A paid invoice then shows as part paid, issued or overdue again (V3). A payment can't be edited: delete it and record it again.
- **V18.** Each payment shows who recorded it and when, such as "Recorded by Alex Rivera on Oct 30, 2026", with the name following U8. The backend takes the person from the token, as for every save (U7).

### The invoice page

- **V19.** A draft's page has the draft's form beside a live preview of the invoice, exactly as the customer will see it, which follows every keystroke. An issued invoice's page has the same preview beside its details: what it shows as, its total, what's paid and what's owed, a bar of how much is paid and what's still owed, its due date and, once overdue, how many days late, its payments, and Download PDF, Record payment and Void. A draft shows who added it and last changed it, as in R6. An issued invoice shows who added it and who issued it and when, such as "Issued by Dana Whitfield on Oct 30, 2026", and a void one who voided it and when. An address that couldn't be an invoice, or names one that doesn't exist, shows "This invoice no longer exists" with a link back to Invoices (N4).

### On deals and organizations

- **V20.** A deal's page has an Invoices panel ([R7](records.md#record-pages)) listing its invoices, newest first, each with its number, or "Draft", its chip, its total and what's owed, and each opening the invoice. On a won deal it has New invoice. With none, it says "No invoices yet.", or on a deal that isn't won, "A deal can be invoiced once it's won."
- **V21.** An organization's page has an Invoices panel the same way, with each invoice's deal and no New invoice. It lists the invoices issued to the organization, and the drafts on its deals. Every invoice holds its deal, drafts included, and an issued one holds the organization it was issued to, so neither can be deleted while they have invoices ([D4](records.md#deleting)), such as "This deal has 2 invoices, so it can't be deleted."

### Invoices table

- **V22.** The Invoices table follows T1 to T5, and has a filter by what each invoice shows as, like Contacts' (T6): All, Draft, Issued, Part paid, Overdue, Paid and Void, each with its count. Its columns are Number, Organization, Deal, Status, Issued, Due, Total and Owed, sorted by Issued, newest first, to start with, so drafts come last (T3). Number sorts in the order the invoices were issued, by the count each number took (B15), whatever the prefix and whatever order their drafts were started in, and Status in the order of the filter. Search matches the number, the organization, the deal and the Bill to. A draft shows "Draft" in muted ink in place of its number, and its deal's organization. There's no Edit or Delete on a row, since only a draft can change, and that happens on its page.
- **V23.** With no invoices at all, the table says "No invoices yet. Start one from a won deal." with New invoice (T7).

| Table | Columns | Default sort |
|---|---|---|
| Invoices | Number, Organization, Deal, Status, Issued, Due, Total, Owed | Issued, newest first |

### PDF

- **V24.** Download PDF, on an issued invoice's page, paid and void ones included, saves the invoice as a PDF named after its number, such as `INV-0042.pdf`. The PDF is made at that moment, in the design, accent color and logo Company settings have then (V13), and shows what the preview shows, the same design, words and figures, with the lines broken and the pages turned at the same places. A draft has no PDF, and the API refuses one with a 409: "A draft has no PDF. Issue it first."
- **V25.** Anything typed into an invoice, and anything from Company settings, appears on the PDF and the preview as the plain text it is, never as markup, so a Bill to of `<b>Acme</b> & Co` shows exactly that.
- **V26.** The pages are US Letter. An invoice too long for one page carries on to the next, with the lines' headings repeated at the top of each new page and the totals after the last line. A line moves whole to the next page if it doesn't fit, unless it's taller than a page on its own, such as one whose description runs to many short lines: that carries on from page to page, its quantity, unit price and amount beside its first part. Each page ends with the number and the page, such as "INV-0042, page 2 of 3". The preview shows the same pages, one under another.
- **V27.** A paid, overdue or void invoice carries a mark near its title, the word in capitals in its own color: PAID, OVERDUE or VOID, on the preview and the PDF alike. A void invoice also has VOID large and faint across the middle of every page, so a printed copy can't be taken for one to pay. A draft's preview is marked DRAFT, with "Draft" where the number goes and the dates it would have if issued today. Once anything is paid, the totals add Paid and Balance due under the total.

### Designs

- **V28.** There are three designs, Classic, Banner and Ledger, chosen in Company settings ([B18](settings.md#documents)). Each is distinct, professional and easy to read in print, and each holds the same things: the logo and the company's name, address, email and phone, the word Invoice, the number, the issue date and the due date, the Bill to, the lines, each with its name, its description under it, its quantity, unit price and amount, then the subtotal, the tax with its label and rate, such as "Sales tax (8.875%)", and the total.

| Design | How it looks |
|---|---|
| Classic | The logo and the company's details at the top left, and Invoice in the accent color at the top right, with the number and dates under it. The lines' headings and the total are in the accent color. |
| Banner | A solid block of the accent color across the top of the page, with Invoice, the number and the balance due in white. The logo, the company's details and the Bill to sit side by side below it, and the total sits in a solid block of the accent color with white text. |
| Ledger | The company's name large in Instrument Serif at the top, with the logo at the right. Everything is in ink, with the accent color on Invoice and the total only, and the lines' rows are tinted grey on every other row. |

All three set their words in Instrument Sans and their figures in JetBrains Mono, as the app does, with Ledger's headings in Instrument Serif. The PDF carries the fonts with it, so it looks the same on any computer. The logo fits inside 2 inches by 0.75 inches, keeping its shape, never stretched or cut off. None has a gradient or a line along one edge, and rows are separated by space or tints.

The page is paper, white with its own ink, `#1F2A30`, and muted ink, `#5B6970`, in both of the app's modes. PAID is green, `#047A5B`, OVERDUE red, `#D23E62`, and VOID and DRAFT the muted ink. Every color on the page stands at least 4.5:1 against white, the accent color included (B20). These colors come from the designs' own description, which the preview and the PDF both read, not from the app's tokens.

## Money on the dashboard

- **V29.** Invoices give the left side of the dashboard's Money section, below the cash flow's row and beside bills' side ([H10](dashboard.md#dashboard)). The row counts issued invoices only, never drafts or void ones, and money in it carries its cents, as on invoices.

| Part | What it shows |
|---|---|
| Owed to us | What customers still owe, every issued invoice's balance added up, with how many invoices that is |
| Overdue | How much of that is overdue, with how many invoices, linking to Invoices showing Overdue |
| How late | What's owed in five groups by days late: Not yet due, 1 to 30 days, 31 to 60 days, 61 to 90 days and Over 90 days, each with its amount and how many invoices. Not yet due includes invoices due today |
| Payments received | A bar chart of the payments received in each of the last 12 months, including this one, by the date they were paid, with this month marked "so far" as in H4, and this month's total beside last month's above it, as Spending by category has beside it |

- **V30.** Each part has a designed empty state, and nothing divides by zero. With nothing owed, Owed to us and Overdue show $0.00 and 0 invoices, as What we owe does beside them, and "Nothing owed." takes How late's place. With no payments in the 12 months, the figures show $0.00 and "No payments in the last 12 months." takes the chart's place.
- **V31.** The row follows today, so invoices move into Overdue, and along the groups, as days pass, and it reads its figures again when the day changes, as the dashboard does.

Invoices also give the cash flow at the top of the Money section its money in, the payments by the date they were paid, and its money expected in, the open invoices, each on its due date plus its customer's average days paid late ([Y2, Y5 and Y6](cash-flow.md#the-forecast)).

## Screens

### Invoices table

Laid out like the other tables ([Screens](records.md#screens)): the page title with New invoice beside it, then the search box with the filter after it, then the table on a panel. Numbers, dates and money are in JetBrains Mono, like other money in tables, and money carries its cents. Status is a chip in its tone from [Stage, chip and chart colors](visual-design.md#stage-chip-and-chart-colors). Owed on a paid or void invoice shows $0.00 in muted ink.

### Invoice page

The page title is the number, or "Draft invoice" for a draft, with its chip after it and its buttons at the right. Below come two columns: a left one, 480px wide, and the preview on the right as the main thing on the page. The preview's pages sit straight on the page background, scaled to the column's width, one under another with 24px between, with 4px corners and no outline or shadow, as panels have none.

**A draft:** the left column holds a Bill to panel, with the box six lines tall, then a Lines panel. Each line is a card in the page color, with its name in semibold and a remove button at its right, labeled "Remove Pro license" for screen readers, then its Description, two lines tall, and Quantity and Unit price side by side, with its amount at the right in JetBrains Mono. Add line comes after the lines, as a secondary button opening the product picker, built like the record pickers. Under it the subtotal, tax and total sit in JetBrains Mono, right-aligned. The title's buttons are Delete draft, Save draft, a secondary button, and Issue invoice, the main button in Sea Green.

**An issued invoice:** the left column holds a details panel, with the total at the headline figure size, the bar, and under it "$750.00 paid" and "$500.00 owed" in JetBrains Mono, then the issue and due dates, with an Overdue chip and "12 days late" once it's late, and the lines from V19 at the foot in muted ink. The bar is 8px tall and fully round: the paid part in Sea Green, and the owed part in the line color, or in Raspberry once it's overdue. Below comes a Payments panel, with Record payment at its top and each payment as a row: its date, amount, method and reference, then who recorded it in muted ink, with a delete button labeled "Delete payment of $500.00". The title's buttons are Void, a secondary button, while it has no payments, and Download PDF, the main button.

Record payment opens a dialog like the other forms, with Date, Amount, which shows `$` at its start, Method as a select, and Reference. Its button reads Record payment.

### Invoices panels

On a deal's or an organization's page, below the page's own panels and its Quotes panel in the side column (R7), headed Invoices, with New invoice at the right on a won deal. Each invoice is one row of a short linked list (R5): its number in JetBrains Mono, or "Draft" in muted ink, then its chip, with its total at the right and what's owed under it in muted ink. On an organization's page, the deal's name sits under the number, on a line of its own in muted ink, so a long one has the row's width rather than sharing a line with the chip.

### Money section

Invoices' side is the left column of the dashboard's Money section, under the cash flow's row ([Screens](cash-flow.md#screens)), with bills' side beside it, built from the same parts so the two read across ([Dashboard](dashboard.md#dashboard-1)): Owed to us above, 332px tall, level with What we owe, and Payments received below, 360px tall, level with Spending by category.

```
+---------------------------------------------+
| Owed to us              Overdue             |
| $48,250.00              $9,120.00           |
| 14 invoices             5 invoices          |
|                                             |
| How late                                    |
| Not yet due   [==========]   $39,130.00   9 |
| 1 to 30 days  [==]            $4,800.00   2 |
| 31 to 60 days [=]             $2,320.00   1 |
| 61 to 90 days [=]             $1,000.00   1 |
| Over 90 days  [=]             $1,000.00   1 |
+---------------------------------------------+
+---------------------------------------------+
| Payments received in November               |
| $3,400.00   October $11,250.00              |
|                                      $40k   |
|   a column a month in ink, the last in      |
|   the soft bar color, "so far" above it     |
| Dec  Jan  Feb ...                    Nov    |
+---------------------------------------------+
```

Owed to us and Overdue are figures at the headline size, each with its label above and its count under it in muted ink, and Overdue links to Invoices showing Overdue. Under them, the heading How late, at the label size, sits level with Due in the next 30 days beside it. How late is five rows spread over the rest of the panel, as the timeline beside it fills its own, each with its group's name in ink, a bar sized by amount against the largest group, its amount in JetBrains Mono and its count in muted ink. The Not yet due bar is in Cerulean, as information, and the four late groups in Raspberry, as alerts, each with its name beside it, so the color never carries the meaning alone. Payments received has the heading "Payments received in November", then this month's total at the headline size beside last month's, "October $11,250.00", in muted ink, as Spending by category beside it does. Its chart is laid out as the spending chart ([Charts](visual-design.md#charts)): a column a month in ink with 4px rounded tops, every month named, the current month in the soft bar color with "so far" above it, a money axis on the right shortened as `$40k`, and a tooltip with the month's total and how many payments.
