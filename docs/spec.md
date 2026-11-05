# Spec: Accountable

This file is the short version of the spec: the problem Accountable solves, what it is, the terms and quality rules every area shares, and an index of the [area files](#area-files) in `docs/specs/`, which hold the detail. Together they describe Accountable as it is today. A change edits the files it affects on its branch, so that once the change is merged, the spec describes the product with that change in it. Each change's own intent and plan are in `docs/changes/<branch name>/`.

The look is set by [Visual design](specs/visual-design.md#visual-design) and the [design reference](specs/visual-design.md#design-reference), `docs/mockups/4-chosen-design.html`. The stack is in `docs/TECH_STACK.md`.

## Problem

A small business keeps track of its customers and sales in spreadsheets, inboxes and people's heads. Nobody can see at a glance which companies we deal with, who our contacts are, what's in the sales pipeline, what happened last with a customer or what needs doing next. Prices live in people's heads and old emails too, so the same thing gets quoted at different prices. What's agreed with a customer is in emails and spreadsheets, so nothing ties a quote to its deal, and nobody can see what was offered or whether the customer accepted. And the business tracks what customers owe it, but not what it owes: nobody can see which supplier bills are unpaid, when they're due, or what the business spends each month.

## What Accountable is

Accountable is a business management system: a sales CRM that will grow into a full Business OS, including ERP. Today it's a complete sales CRM for a small team, shared on the web: a private Salesforce that does the everyday CRM essentials really well. It also holds the business's price list, its first step beyond the CRM, and the quotes made from it, each on its deal, which a customer's yes turns into a won deal. Invoices will use the price list later. It keeps the bills the business receives from suppliers too, with what it owes and what it spends. It should feel sharp, modern and professional, and be a pleasure to use.

**Who uses it:** a small sales team, sharing one Accountable every day with their own real data. Each person signs in with their own email and password, everyone works on the same records, and each record shows who added it. They start from the sample data to look around, then clear it and type in their own records. No other systems are involved yet.

**Two ways to run it:** the **shared app** is the team's, on Render, with its data in Postgres on Supabase. The **local copy** runs on one computer with `npm run dev`, with the sample data and made-up teammates to sign in as, and needs neither Supabase nor the internet. It's where the app is built and tried out, and nothing done in it reaches the team's data. [running.md](specs/running.md) has both.

**Eight sections:**

| Section | What it's for |
|---|---|
| Dashboard | The landing page: how sales are going at a glance and what needs doing next, with what we owe and spend below |
| Organizations | The companies we do business with, each with its contacts, its deals and a combined timeline |
| Contacts | The people we deal with, including leads and customers, each with a timeline |
| Deals | The potential sales, each with its stage, value, close date and timeline |
| Pipeline | The deals as cards on a board, one column per stage, moved by dragging |
| Products | The price list: what the business sells, and at what price |
| Quotes | The prices offered to customers, each quote on its deal, with its status and a PDF to send |
| Bills | The bills the business receives from suppliers: what's unpaid, what's overdue and what's been paid |

Around them, a search box in the top bar finds any organization, contact, deal or active product, and a menu under your initials holds the theme, Company settings and Sign out.

**Seven kinds of record:**

- **Organization:** a company we do business with. It has many contacts and many deals.
- **Contact:** a person we deal with, at an organization, with a status of lead, qualified or customer.
- **Deal:** a potential sale, with an organization and a main contact, moving through six stages.
- **Activity:** a note, call or email that happened, or needs to happen, with a contact or a deal, with an optional follow-up date.
- **Product:** something the business sells, with a unique name, a description and a unit price in dollars and cents. It's archived rather than deleted once it's no longer sold.
- **Quote:** the prices offered on a deal, as lines from the price list with a quantity and a price each, added up with the tax. It's a draft until it's sent, then accepted or declined, and it's never deleted.
- **Bill:** a bill the business has received from a supplier, which is an organization. It has the supplier's own bill number, a bill date and a due date, an amount before tax, the tax, a category and notes, and is unpaid or paid. An unpaid bill is overdue once its due date has passed.

**One set of company settings:** the business's own details for its quotes and invoices, shared by the whole team: its name, address, email and phone, a tax label and rate, the payment terms and the prefixes for quote and invoice numbers. Quotes use them for their numbers, their tax and the company's details on their PDFs, and keep the details and the tax as they were when each was sent. Bills don't use them: a bill's tax is the supplier's, and its due date is 30 days after its bill date. Invoices come later, and what they'll share with quotes is ready for them: the counter that numbers them and the sums for their totals ([B15 to B17](specs/settings.md#for-quotes-and-invoices)).

**Not in Accountable yet:**

- Roles and permissions: everyone who can sign in can do everything
- A sign-up page, a password reset, changing a password in the app, or signing in with Google or a magic link. People are added, and their passwords set, in Supabase's dashboard.
- Moving the records in a local copy to the shared app
- Seeing teammates' changes as they happen. They show when the window is used again or the page is refreshed.
- A warning when two people edit the same record, or the company settings, at once. The last save wins.
- A history of every change. Each record keeps who added it and who last changed it, and the company settings keep who last changed them, nothing in between.
- A layout for phones
- Invoices. The counter for invoice numbers and the sums for their totals are ready, and quotes use the same ones.
- Emailing quotes, a page where a customer accepts a quote online, or turning a quote into an invoice
- A customer's address, or notes, on a quote
- Finding quotes with the top bar's search
- Purchase orders, receipts, or approving bills before they're paid
- Paying part of a bill, or recurring bills
- Attaching a scan of a bill
- Accounting entries
- A company logo
- Personal settings. The theme belongs to the browser (L2), and the company settings to the team.
- AI features
- Email, calendar or phone integrations
- Currencies other than US dollars, or more than one tax rate on what the business sells. A bill's tax is entered as the supplier charged it.
- Products on deals or invoices. Quotes have them, as lines.
- Stock levels, product categories, units of measure or variants
- Price lists for particular customers, or discounts
- Reports beyond the dashboard
- Tags or custom fields
- Changing the pipeline stages
- Importing, exporting or backing up data
- Undo, apart from restoring an archived product, and the Undo that marks a bill paid again just after it was marked unpaid

## Terms

| Term | Meaning |
|---|---|
| Shared app | The team's Accountable, on Render, with its data in Supabase. `npm start` runs it on this computer. |
| Local copy | Accountable on one computer from `npm run dev`, with its own SQLite file and made-up teammates |
| Teammate | Someone who can sign in to the shared app, added in Supabase's dashboard. In the local copy, one of the four made-up teammates. |
| Name | A teammate's display name in Supabase, or their email if they have none |
| Initials | From the name, such as AR for Alex Rivera, or the email's first letter if there's no display name |
| Added by, last changed by | The teammate who added a record, and the one whose save last changed it |
| Theme | Light, Dark or System, chosen in the menu. System follows the device's setting. |
| Mode | What's on screen, light or dark, set by the theme |
| Today | The date in the team's time zone. The backend takes it from `TZ`, which `render.yaml` sets, or from the computer's own zone without it. The browser takes it from the device, which for the team is the same zone. |
| Open deal | Stage is New, Qualified, Proposal or Negotiation |
| Closed deal | Stage is Won or Lost |
| Late deal | An open deal whose close date is before today. A deal due today isn't late. |
| Usual probability | The probability of close a deal takes when it moves to a stage, from the table below |
| Expected revenue | Value times probability, rounded to the nearest dollar for each deal, then added up. Halves round up, on both the backend and the frontend, using whole-number arithmetic. Open deals only. |
| Month won | The calendar month of a Won deal's close date |
| Lead | A contact with the Lead status. There's no separate list of leads. |
| Overdue follow-up | Not done, with a follow-up date before today |
| Upcoming follow-up | Not done, with a follow-up date of today or later |
| Blank link | A deal's organization or main contact, or a contact's organization, cleared by a delete. Shown as "None". |
| Unit price | A product's price for one, in US dollars and cents, kept as a whole number of cents |
| Active product | A product that isn't archived. Every product starts out active. |
| Archived product | A product taken off the price list. It's hidden from the Products table unless Show archived is ticked, and from the top bar's search, and Restore makes it active again. |
| Company settings | The one set of company details the whole team shares, on the Company settings page. Not to be confused with the three settings in `.env` and Render that decide which copy runs (C8). |
| Tax rate | The sales tax as a percentage, from 0 to 100 with up to three decimal places, such as 8.875% |
| Payment terms | How many days customers have to pay, from 0 to 365 |
| Number prefix | The start of a quote's or an invoice's number, such as QT- or INV- |
| Held record | A deal or an organization that a record in another area points at, such as a quote on the deal or a bill from the organization. It can't be deleted (D4). A quote holds its deal, and a bill its supplier. |
| Quote number | The quote prefix, then the next in the quotes' own count, such as QT-0004, taken when the quote is first saved (B15, Q9) |
| Line | One product on a quote, with the name it had when added, a description, a quantity and a unit price. Its amount is the quantity times the unit price. |
| Quote's value | The subtotal of its lines, before tax, as a deal's value is before tax (Q16) |
| Quote status | Draft, Sent, Accepted or Declined, saved on the quote (Q6) |
| Expired quote | A sent quote whose valid-until date is before today. It shows as Expired, and is still a sent quote underneath (Q7). |
| Valid-until date | The last day a quote holds: 30 days after the quote's date, the day it was first saved, unless it's changed while a draft |
| Prepared for | Who a quote is for: the deal's organization and main contact, followed while it's a draft and fixed once it's sent or declined (Q18) |
| Bill | A bill the business has received from a supplier, for money it owes |
| Supplier | The organization a bill is from. Any organization can be one, and a customer can be a supplier too. |
| Bill number | The supplier's own number for its bill, unique among that supplier's bills, ignoring case |
| Bill total | A bill's amount before tax plus its tax, in dollars and cents, worked out by the backend |
| Unpaid bill | A bill not yet marked paid, overdue or not |
| Overdue bill | An unpaid bill whose due date is before today. A bill due today isn't overdue. |
| Paid bill | A bill marked paid, with the date it was paid |
| What we owe | The total of every unpaid bill, tax included |
| Bill category | One of Software, Contractors, Travel, Office, Marketing and Other, set on each bill |
| Spending | The bills' totals, tax included, by the month of their bill date, paid or not |

| Stage | Usual probability |
|---|---|
| New | 5% |
| Qualified | 20% |
| Proposal | 40% |
| Negotiation | 70% |
| Won | 100% |
| Lost | 0% |

## Quality

- **Q1.** At 1,000 contacts, 500 deals, 5,000 activities, 500 products, 1,000 quotes with 5,000 lines between them and 1,000 bills, in the local copy: the dashboard's data arrives in under 200ms, a table opens in under a second, a table's search keystroke updates within 100ms, the top bar's search shows its results within 300ms of the last keystroke, and dragging a card stays smooth, meaning no task longer than about 250ms, which leaves room for cards to slide apart during a drag. A quote with 100 lines updates its preview within 100ms of a keystroke, and its PDF downloads in under a second. The shared app on Render's free plan is slower, and isn't held to these figures ([deploy.md](specs/deploy.md#free-plan-limits)).
- **Q2.** No errors in the browser's console, on any screen, at any time.
- **Q3.** All controls can be reached by keyboard, with a visible focus ring. Animations respect the system's reduced motion setting.
- **Q4.** Chrome is the one supported and tested browser. Safari and Firefox may work, but nobody has checked.

## Area files

Each area of the product has a file in `docs/specs/` with its requirements and, where it has one, its screen. The files under Across every area describe how the whole product looks and is built. Requirement ids, such as T5 or P4, are unique across the files. Q1 to Q4 are the quality rules above, and the quotes' requirements carry on from Q5.

**Product areas**

| File | What it covers | Requirements |
|---|---|---|
| [shell.md](specs/shell.md) | The top bar, addresses, missing pages, the connection message, failed reads, the menu, the theme, and the shell's screen | N1 to N7, L1 to L5 |
| [sign-in.md](specs/sign-in.md) | Signing in and out, names and initials, who added and changed each record, the local copy's made-up teammates, and the sign-in screen | U1 to U16 |
| [search.md](specs/search.md) | The top bar's search, and its screen | K1 to K8 |
| [records.md](specs/records.md) | Organizations, contacts and deals: the tables, adding and editing, deleting, held records, the record pages and the panels other areas add to them, and their screens | T1 to T10, F1 to F12, D1 to D4, R1 to R7 |
| [deals.md](specs/deals.md) | Stage changes, the pipeline board and its screen | S1 to S9, P1 to P11 |
| [activities.md](specs/activities.md) | Activities, follow-ups and timelines | A1 to A7 |
| [products.md](specs/products.md) | The price list: unit prices in dollars and cents, unique names, archiving and restoring, the product page, and their screens | G1 to G12 |
| [quotes.md](specs/quotes.md) | Quotes: statuses, lines, amounts and tax, Prepared for, sending, accepting and declining, copying, the PDF, the Quotes section, the panels on deals and organizations, and their screens, the quote document included | Q5 to Q37 |
| [bills.md](specs/bills.md) | Bills from suppliers: amounts in cents, unique bill numbers, due dates, categories, paid, unpaid and overdue, the table, the form, the bill page, an organization's bills, the dashboard's Money section, and their screens | E1 to E24 |
| [dashboard.md](specs/dashboard.md) | The dashboard's figures, charts and lists, the sections other areas add below them, and its screen | H1 to H10 |
| [running.md](specs/running.md) | The local copy and the shared app, sample data, keeping data, and the commands and first run | M1 to M7, C1 to C11 |
| [settings.md](specs/settings.md) | The company settings: the page, each field's rules, saving, who last changed them, the sample company and the defaults, the numbers and sums that quotes use and invoices will, and the page's screen | B1 to B17 |
| [deploy.md](specs/deploy.md) | The shared app on Render: `render.yaml`, building, starting, settings and the free plans' limits | W1 to W9 |

**Across every area**

| File | What it covers |
|---|---|
| [visual-design.md](specs/visual-design.md) | Color tokens and contrast, stage and chart colors, type, shapes, charts, motion, words, and the design reference |
| [architecture.md](specs/architecture.md) | How the parts connect in each copy, every file and folder, the layout rules and the libraries |
| [backend.md](specs/backend.md) | The data model, including users and who added each record, the backend rules and the API |
| [frontend.md](specs/frontend.md) | Server data, signing in, today's date, instant updates, board figures, dragging, dialogs inside dialogs, search, bills and the theme |
| [security.md](specs/security.md) | Signing in and the token check, keys and settings, row-level security, and which addresses can reach the app |
| [testing.md](specs/testing.md) | The type checks, tests, code checks, hooks, subagents and CI, and which tests cover which requirements |
