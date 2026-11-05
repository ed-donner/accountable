# Spec: Accountable

This file is the short version of the spec: the problem Accountable solves, what it is, the terms and quality rules every area shares, and an index of the [area files](#area-files) in `docs/specs/`, which hold the detail. Together they describe Accountable as it is today. A change edits the files it affects on its branch, so that once the change is merged, the spec describes the product with that change in it. Each change's own intent and plan are in `docs/changes/<branch name>/`.

The look is set by [Visual design](specs/visual-design.md#visual-design) and the [design reference](specs/visual-design.md#design-reference), `docs/mockups/4-chosen-design.html`. The stack is in `docs/TECH_STACK.md`.

## Problem

A small business keeps track of its customers and sales in spreadsheets, inboxes and people's heads. Nobody can see at a glance which companies we deal with, who our contacts are, what's in the sales pipeline, what happened last with a customer or what needs doing next. Prices live in people's heads and old emails too, so the same thing gets quoted at different prices.

## What Accountable is

Accountable is a business management system: a sales CRM that will grow into a full Business OS, including ERP. Today it's a complete sales CRM for a small team, shared on the web: a private Salesforce that does the everyday CRM essentials really well. It also holds the business's price list, its first step beyond the CRM, which quotes and invoices will use later. It should feel sharp, modern and professional, and be a pleasure to use.

**Who uses it:** a small sales team, sharing one Accountable every day with their own real data. Each person signs in with their own email and password, everyone works on the same records, and each record shows who added it. They start from the sample data to look around, then clear it and type in their own records. No other systems are involved yet.

**Two ways to run it:** the **shared app** is the team's, on Render, with its data in Postgres on Supabase. The **local copy** runs on one computer with `npm run dev`, with the sample data and made-up teammates to sign in as, and needs neither Supabase nor the internet. It's where the app is built and tried out, and nothing done in it reaches the team's data. [running.md](specs/running.md) has both.

**Six sections:**

| Section | What it's for |
|---|---|
| Dashboard | The landing page: how sales are going at a glance, and what needs doing next |
| Organizations | The companies we do business with, each with its contacts, its deals and a combined timeline |
| Contacts | The people we deal with, including leads and customers, each with a timeline |
| Deals | The potential sales, each with its stage, value, close date and timeline |
| Pipeline | The deals as cards on a board, one column per stage, moved by dragging |
| Products | The price list: what the business sells, and at what price |

Around them, a search box in the top bar finds any organization, contact, deal or active product, and a menu under your initials holds the theme and Sign out.

**Five kinds of record:**

- **Organization:** a company we do business with. It has many contacts and many deals.
- **Contact:** a person we deal with, at an organization, with a status of lead, qualified or customer.
- **Deal:** a potential sale, with an organization and a main contact, moving through six stages.
- **Activity:** a note, call or email that happened, or needs to happen, with a contact or a deal, with an optional follow-up date.
- **Product:** something the business sells, with a unique name, a description and a unit price in dollars and cents. It's archived rather than deleted once it's no longer sold.

**Not in Accountable yet:**

- Roles and permissions: everyone who can sign in can do everything
- A sign-up page, a password reset, changing a password in the app, or signing in with Google or a magic link. People are added, and their passwords set, in Supabase's dashboard.
- Moving the records in a local copy to the shared app
- Seeing teammates' changes as they happen. They show when the window is used again or the page is refreshed.
- A warning when two people edit the same record at once. The last save wins.
- A history of every change. Each record keeps who added it and who last changed it, nothing in between.
- A layout for phones
- AI features
- Email, calendar or phone integrations
- Currencies other than US dollars
- Products on deals, quotes or invoices
- Stock levels, product categories, units of measure or variants
- Price lists for particular customers, or discounts
- Reports beyond the dashboard
- Tags or custom fields
- Changing the pipeline stages
- Importing, exporting or backing up data
- Undo, apart from restoring an archived product

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

| Stage | Usual probability |
|---|---|
| New | 5% |
| Qualified | 20% |
| Proposal | 40% |
| Negotiation | 70% |
| Won | 100% |
| Lost | 0% |

## Quality

- **Q1.** At 1,000 contacts, 500 deals, 5,000 activities and 500 products, in the local copy: the dashboard's data arrives in under 200ms, a table opens in under a second, a table's search keystroke updates within 100ms, the top bar's search shows its results within 300ms of the last keystroke, and dragging a card stays smooth, meaning no task longer than about 250ms, which leaves room for cards to slide apart during a drag. The shared app on Render's free plan is slower, and isn't held to these figures ([deploy.md](specs/deploy.md#free-plan-limits)).
- **Q2.** No errors in the browser's console, on any screen, at any time.
- **Q3.** All controls can be reached by keyboard, with a visible focus ring. Animations respect the system's reduced motion setting.
- **Q4.** Chrome is the one supported and tested browser. Safari and Firefox may work, but nobody has checked.

## Area files

Each area of the product has a file in `docs/specs/` with its requirements and, where it has one, its screen. The files under Across every area describe how the whole product looks and is built. Requirement ids, such as T5 or P4, are unique across the files.

**Product areas**

| File | What it covers | Requirements |
|---|---|---|
| [shell.md](specs/shell.md) | The top bar, addresses, missing pages, the connection message, failed reads, the menu, the theme, and the shell's screen | N1 to N7, L1 to L5 |
| [sign-in.md](specs/sign-in.md) | Signing in and out, names and initials, who added and changed each record, the local copy's made-up teammates, and the sign-in screen | U1 to U16 |
| [search.md](specs/search.md) | The top bar's search, and its screen | K1 to K8 |
| [records.md](specs/records.md) | Organizations, contacts and deals: the tables, adding and editing, deleting, the record pages, and their screens | T1 to T10, F1 to F12, D1 to D3, R1 to R6 |
| [deals.md](specs/deals.md) | Stage changes, the pipeline board and its screen | S1 to S9, P1 to P11 |
| [activities.md](specs/activities.md) | Activities, follow-ups and timelines | A1 to A7 |
| [products.md](specs/products.md) | The price list: unit prices in dollars and cents, unique names, archiving and restoring, the product page, and their screens | G1 to G12 |
| [dashboard.md](specs/dashboard.md) | The dashboard's figures, charts and lists, and its screen | H1 to H9 |
| [running.md](specs/running.md) | The local copy and the shared app, sample data, keeping data, and the commands and first run | M1 to M7, C1 to C11 |
| [deploy.md](specs/deploy.md) | The shared app on Render: `render.yaml`, building, starting, settings and the free plans' limits | W1 to W9 |

**Across every area**

| File | What it covers |
|---|---|
| [visual-design.md](specs/visual-design.md) | Color tokens and contrast, stage and chart colors, type, shapes, charts, motion, words, and the design reference |
| [architecture.md](specs/architecture.md) | How the parts connect in each copy, every file and folder, the layout rules and the libraries |
| [backend.md](specs/backend.md) | The data model, including users and who added each record, the backend rules and the API |
| [frontend.md](specs/frontend.md) | Server data, signing in, today's date, instant updates, board figures, dragging, dialogs inside dialogs, search and the theme |
| [security.md](specs/security.md) | Signing in and the token check, keys and settings, row-level security, and which addresses can reach the app |
| [testing.md](specs/testing.md) | The type checks, tests, code checks, hooks, subagents and CI, and which tests cover which requirements |
