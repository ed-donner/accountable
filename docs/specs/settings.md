# Spec: Company settings

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Company settings

- **B1.** The company settings are one set of details for the whole team, kept in the database: the company name, address, email and phone, a tax label and rate, the payment terms in days, the prefixes for quote and invoice numbers, and how invoices look: their design, accent color and logo (B18). They're there for quotes and invoices. Invoices use them ([Invoices](invoices.md#invoices)), and quotes, which Accountable doesn't have yet, will use them too.
- **B2.** Company settings, in the menu under your initials ([N7](shell.md#app-shell)), opens the Company settings page at `/settings`. Like a section, it has its own address (N2) and keeps the top bar, but it isn't one of the sections, so no section is marked as current while it's open.
- **B3.** Anyone who can sign in can see and change the settings, and everyone sees the same ones. A teammate's save shows when the window is used again or the page is refreshed, as with records. If two people save at once, the last save wins.

### Fields and rules

- **B4.** Every save needs the company name, the tax rate, the payment terms, both prefixes, the design and the accent color. The address, email, phone, tax label and logo can be blank. Spaces at the ends of a field are dropped, and an optional field left blank is saved blank.

| Field | Rule | Message beside the field |
|---|---|---|
| Company name | Required | Enter the company name |
| Address | Optional. One box of free text, over as many lines as it needs | |
| Email | Optional. Must look like an email address, as in [F6](records.md#adding-and-editing) | Enter a valid email address |
| Phone | Optional. Free text | |
| Tax label | Optional. Free text, such as Sales tax or VAT | |
| Tax rate | Required. A percentage from 0 to 100, with at most three decimal places, such as 8.875 | Blank, not a number or out of range: Enter a rate from 0 to 100%. More than three decimal places: Use at most three decimal places |
| Payment terms | Required. A whole number of days from 0 to 365 | Enter a whole number of days from 0 to 365 |
| Quote prefix | Required. 1 to 10 characters, using only the letters A to Z in either case, digits and hyphens | Blank: Enter a prefix, such as QT-. Too long, or another character: Use up to 10 letters, digits and hyphens |
| Invoice prefix | As the quote prefix, and it can't clash with it (B6) | Blank: Enter a prefix, such as INV-. Too long, or another character: as the quote prefix. A clash: Clashes with the quote prefix. Neither can start with the other, ignoring capitals |

- **B5.** The backend checks every value, whatever sends it, and refuses a save with any bad value, with a message for each bad field: beside the field on the page (F2), and in the API's 422 reply ([API](backend.md#api)). The page checks the same rules before it sends anything, so most mistakes show without a trip to the backend. The checks apply to the settings as they'd be after the save, so a save that leaves out the company name is refused while none has been saved, and a prefix is checked against the other one as it will be saved.
- **B6.** The quote and invoice prefixes can't be the same, ignoring capitals, and neither can start with the other, so a quote's number and an invoice's can never be the same, whatever follows the prefix. So QT- and INV- are fine, and INV- and inv-, or Q and QT-, are refused. Prefixes are kept exactly as typed, capitals included.
- **B7.** The tax rate is checked from the digits as typed, and never passes through a binary fraction, so 8.875 stays exactly 8.875 on the page, in the API and in the database. Trailing zeros don't count as decimal places, so 8.8750 is accepted as 8.875, and a point with digits on one side only, such as .5 or 5., is a number too. Once saved, it shows without trailing zeros, so a rate typed as 8.50 shows as 8.5. A rate sent to the API as a JSON number is checked from every digit sent too, so 8.8750000000000001 is refused, not rounded to 8.875.

### Saving

- **B8.** Save settings saves the whole form. It saves once, however quickly it's pressed, and shows "Settings saved." Anything typed while the save is on its way stays in its box, still to be saved, and the other boxes show what was saved. If the save fails, the page keeps what was typed and says so, as forms do (F10). A save that changes nothing, such as pressing Save settings with nothing changed, doesn't count as a change (U10), so who last changed the settings stays as it was.
- **B9.** The page shows who last changed the settings and when, such as "Last changed by Dana Whitfield on Oct 30, 2026", with the name following U8. The backend takes the person from the token of whoever saves, never from the request (U7). Settings nobody has saved yet, or since the clearing steps reset them (B13), show no such line.
- **B10.** While someone is typing on the page, a teammate's newer save doesn't overwrite what they've typed. The form takes the newer values only if nothing has been typed since it was filled or last saved, and otherwise the next save wins over the teammate's (B3). Leaving the page, or a session ending (U6), drops anything not yet saved, as closing a form's dialog does.
- **B11.** If the settings can't be read, the page says "Couldn't load this." and offers Try again, as in N6, and shows no form, so blank boxes can never be saved over the real settings. If a later read fails with the form already showing, the form stays, with "Couldn't refresh this, so it may be out of date."

### Starting values

- **B12.** A new database starts with the settings of a made-up company that sells the kind of work in the sample deals, put down to Dana Whitfield as who last changed them, on the day of seeding (M7). Its email uses `.example` and its phone number is in the 555-0100 to 555-0199 range kept for fiction, so nothing points at a real company (M5). `npm run seed` puts these settings back, and `npm run empty` leaves the settings as they are, because they're the business's details, not records (C4). Both only ever touch the local copy, where a made-up company does no harm.

| Field | Sample company |
|---|---|
| Company name | Plainsong Systems |
| Address | 48 Orchard Row, Suite 210, then Brooklyn, NY 11201 on a second line |
| Email | `accounts@plainsong.example` |
| Phone | (718) 555-0142 |
| Tax label and rate | Sales tax, 8.875% |
| Payment terms | 30 days |
| Prefixes | QT- and INV- |
| Design and accent color | Banner, in `#0E6B6B`, a deep teal |
| Logo | A made-up logo for Plainsong Systems, a PNG kept with the sample data |

- **B13.** A database that already existed before the company settings came in, such as the team's Supabase database or an existing `data/accountable.db`, doesn't get the made-up company, because its name could end up on the team's real invoices. It starts with the defaults: the company name, address, email and phone blank, Sales tax as the label at a rate of 0%, payment terms of 30 days, QT- and INV- as the prefixes, the Classic design in Midnight, `#073B4C`, and no logo. No one shows as having changed them (B9). Clearing the sample data in Supabase (C11) puts the settings back to these same defaults, removing the logo, with no one recorded, so a made-up company never stays on the team's real app.
- **B14.** Until someone saves a company name, the page says "No company name yet. Enter one below." Every save needs the name (B4), so once one is saved, only the clearing steps in C11 can take it away again.

### For quotes and invoices

These are what quotes and invoices share, kept in `company/` so both use the same. Invoices use them now, and quotes will when they come.

- **B15.** Each quote and each invoice takes a number: its prefix as the settings have it at that moment, then the next in that kind's own count, with at least four figures, such as QT-0001, then QT-0002, and QT-10000 after QT-9999. Quotes and invoices are counted apart, so the first of each is 0001. A number is taken inside the save of its document, under the write lock, so two documents saved at the same moment never get the same number, and a save that fails gives its number back, so none is skipped. Changing a prefix changes the next number's start but not its count. `npm run seed` and `npm run empty` start each count again at 1 (C4), and so do the clearing steps for the shared app (C11).
- **B16.** A line's amount is its quantity times its unit price, in whole cents. The subtotal adds up the lines. The tax is worked out once, on the subtotal, never line by line, at the tax rate, to the nearest cent, with halves rounding up, and the total is the subtotal plus the tax. Both sides work it out in whole numbers, the backend for what it saves, never from totals the browser sends, and the browser for what a page shows before it saves. The browser multiplies the subtotal by the rate through BigInt, because past a subtotal of about $900 million the product is too big for a JavaScript number to hold exactly, and the tax could come out a cent wrong. Both run the cases in `shared/totals-cases.json`.
- **B17.** A quantity is a whole number from 1 to 1,000,000. A fraction, text, `true` or anything outside that is refused, with "Enter a whole number from 1 to 1,000,000". Typed, it can have commas in threes, such as 1,000. A subtotal is at most $1 trillion, the most a deal is worth, with "Keep the subtotal to $1 trillion or less" past it, so an accepted quote's value always fits its deal, and every amount, tax at 100% included, is a whole number of cents the browser holds exactly.

### Documents

- **B18.** A Documents panel on the page sets how invoices look: one of three designs, Classic, Banner or Ledger ([V28](invoices.md#designs)), an accent color, and the company's logo. They're settings like the rest: saved by Save settings, shared by the whole team, and covered by B3, B5 and B8 to B10. An invoice takes them as they are when it's drawn, issued or not ([V13](invoices.md#issuing)). The other company details can hold any characters, but an invoice isn't issued while one that it copies has a character the invoice's fonts can't draw ([V10](invoices.md#issuing)).
- **B19.** Beside the choices, a preview shows a made-up sample invoice in the chosen design, accent color and logo, and changes as soon as one is chosen, before anything is saved. It has the company's details as they are on the page, a Bill to, three lines and the tax at the page's rate, and it's drawn the way an invoice's preview is ([V24](invoices.md#pdf)), so it's what the PDF will look like.
- **B20.** The accent color is a hex color, picked with the browser's color picker or typed, such as `#0E6B6B`. It must stand at least 4.5:1 against white, the contrast small text needs, so text in it on white, and white text on it, can both be read in print. A color is kept as `#` and six capital hex digits, and a typed one may use small letters. The backend and the page check it by the same formula, WCAG's contrast ratio, which gives the figures in [Color tokens](visual-design.md#color-tokens), and both sides' unit tests run the cases in `shared/accent-cases.json`.
- **B21.** Choose logo takes a PNG or a JPEG of up to 1 MB and at most 2,000 pixels on each side. The backend reads the file itself and refuses anything that isn't really a PNG or a JPEG, whatever its name or the type the browser gives it, SVG included, since an SVG can carry a script. The page checks the size and the name's ending first, so most mistakes show without a trip to the backend, but the backend's check is the one that counts. Remove logo takes it away. Like the other settings, the choice is saved by Save settings.
- **B22.** The logo is kept in the database with the settings, because Render's disk keeps nothing ([Free plan limits](deploy.md#free-plan-limits)). With no logo, invoices leave its space out, and the company's name stands in its place.

| Field | Rule | Message beside the field |
|---|---|---|
| Design | Required. Classic, Banner or Ledger | Choose a design |
| Accent color | Required. `#` and six hex digits, at least 4.5:1 against white | Not a hex color: Enter a color as # and six hex digits, such as #0E6B6B. Too light: Too light to read on white. Choose a darker color |
| Logo | Optional. A real PNG or JPEG, up to 1 MB and 2,000 pixels on each side | Not a PNG or JPEG: Choose a PNG or JPEG image. Too big: Choose an image of 1 MB or less. Too many pixels: Choose an image no more than 2,000 pixels wide or tall |

## Screens

### Company settings page

The page title, "Company settings", sits at the top left, with the line from B9 under it in muted ink, in the style of the record pages' lines (R6). Below come two columns of panels on the page background, each half the width:

- **Left:** a Company panel with Company name, Address, Email and Phone. The address box is four lines tall, and grows as more lines are typed.
- **Right:** a Tax panel with Tax label and Tax rate, then a Quotes and invoices panel with Payment terms, Quote prefix and Invoice prefix.

Below them, across the whole width, a Documents panel. Its left part, about 40% of the width, holds Design, Accent color and Logo. Design is the three designs as cards side by side, each with a small drawing of its page and its name under it, working as one radio group, so the arrow keys move between them, with the chosen one ringed in Sea Green. Accent color is a round swatch that opens the browser's color picker, with the hex box beside it. Logo shows the logo on a white tile, or "No logo" in muted ink, with Choose logo and Remove logo after it, and the hint "PNG or JPEG, up to 1 MB." in muted ink. Its right part holds the sample invoice's first page, as in the invoice page's preview ([Invoice page](invoices.md#invoice-page)), scaled to fit.

Each panel has its name as a section heading. Fields have their label above them, inputs in the page color, and errors beside the field in Raspberry text, as in the record forms. The tax rate box has % after it and the payment terms box has days after it, in muted ink. Those two boxes are short, so the unit sits beside the number. Under each prefix, a hint in muted ink says "Up to 10 letters, digits and hyphens." While no company name is saved, B14's message sits in the Company panel under its heading, in ink, after lucide-react's Info icon in Cerulean. It has no box behind it, so it can't be taken for a box to type in.

Save settings sits at the top right, level with the page title, in Sea Green with Midnight text, as main buttons are, so it's in view while the page is at its top. Enter in a one-line box saves, and in the address box it starts a new line. At 1280 by 720, the company and tax panels and the button fit without scrolling, and the page scrolls to the Documents panel.

There's no dialog on this page, and no Cancel: leaving the page is how to drop a change (B10).
