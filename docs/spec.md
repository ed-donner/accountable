# Spec: Accountable

This file is the short version of the spec: the problem Accountable solves, what it is, the terms and quality rules every area shares, and an index of the [area files](#area-files) in `docs/specs/`, which hold the detail. Together they describe Accountable as it is today. A change edits the files it affects on its branch, so that once the change is merged, the spec describes the product with that change in it. Each change's own intent and plan are in `docs/changes/<branch name>/`.

The look is set by [Visual design](specs/visual-design.md#visual-design) and the [design reference](specs/visual-design.md#design-reference), `docs/mockups/4-chosen-design.html`. The stack is in `docs/TECH_STACK.md`.

## Problem

A small business keeps track of its customers and sales in spreadsheets, inboxes and people's heads. Nobody can see at a glance which companies we deal with, who our contacts are, what's in the sales pipeline, what happened last with a customer or what needs doing next.

## What Accountable is

Accountable is a business management system: a sales CRM that will grow into a full Business OS, including ERP. Today it's a complete sales CRM for one person, running on their own computer: a private Salesforce that does the everyday CRM essentials really well. It should feel sharp, modern and professional, and be a pleasure to use.

**Who uses it:** one salesperson, using Accountable on their own computer every day with their own real data. They start from the sample data to look around, then clear it and type in their own records. The rest of the sales team joins later. No other systems are involved yet.

**Five sections:**

| Section | What it's for |
|---|---|
| Dashboard | The landing page: how sales are going at a glance, and what needs doing next |
| Organizations | The companies we do business with, each with its contacts, its deals and a combined timeline |
| Contacts | The people we deal with, including leads and customers, each with a timeline |
| Deals | The potential sales, each with its stage, value, close date and timeline |
| Pipeline | The deals as cards on a board, one column per stage, moved by dragging |

**Four kinds of record:**

- **Organization:** a company we do business with. It has many contacts and many deals.
- **Contact:** a person we deal with, at an organization, with a status of lead, qualified or customer.
- **Deal:** a potential sale, with an organization and a main contact, moving through six stages.
- **Activity:** a note, call or email that happened, or needs to happen, with a contact or a deal, with an optional follow-up date.

**Not in Accountable yet:**

- Sign-in, user accounts, several people sharing the same data, or a record of who did what
- Reaching Accountable from anywhere but the computer it runs on
- A layout for phones
- Following the device's own dark mode setting
- AI features
- Email, calendar or phone integrations
- Currencies other than US dollars
- Reports beyond the dashboard
- Tags or custom fields
- Changing the pipeline stages
- Importing, exporting or backing up data
- Undo

## Terms

| Term | Meaning |
|---|---|
| Today | The date on the computer running the app |
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

| Stage | Usual probability |
|---|---|
| New | 5% |
| Qualified | 20% |
| Proposal | 40% |
| Negotiation | 70% |
| Won | 100% |
| Lost | 0% |

## Quality

- **Q1.** At 1,000 contacts, 500 deals and 5,000 activities: the dashboard's data arrives in under 200ms, a table opens in under a second, a search keystroke updates within 100ms, and dragging a card stays smooth, meaning no task longer than about 250ms, which leaves room for cards to slide apart during a drag.
- **Q2.** No errors in the browser's console, on any screen, at any time.
- **Q3.** All controls can be reached by keyboard, with a visible focus ring. Animations respect the system's reduced motion setting.
- **Q4.** Chrome is the one supported and tested browser. Safari and Firefox may work, but nobody has checked.

## Area files

Each area of the product has a file in `docs/specs/` with its requirements and, where it has one, its screen. The files under Across every area describe how the whole product looks and is built. Requirement ids, such as T5 or P4, are unique across the files.

**Product areas**

| File | What it covers | Requirements |
|---|---|---|
| [shell.md](specs/shell.md) | The top bar, addresses, missing pages, the connection message, failed reads, light and dark mode, and the shell's screen | N1 to N6, L1 to L5 |
| [records.md](specs/records.md) | Organizations, contacts and deals: the tables, adding and editing, deleting, the record pages, and their screens | T1 to T10, F1 to F12, D1 to D3, R1 to R5 |
| [deals.md](specs/deals.md) | Stage changes, the pipeline board and its screen | S1 to S9, P1 to P11 |
| [activities.md](specs/activities.md) | Activities, follow-ups and timelines | A1 to A6 |
| [dashboard.md](specs/dashboard.md) | The dashboard's figures, charts and lists, and its screen | H1 to H9 |
| [running.md](specs/running.md) | Sample data, running the app, keeping data, and the commands and first run | M1 to M6, C1 to C7 |

**Across every area**

| File | What it covers |
|---|---|
| [visual-design.md](specs/visual-design.md) | Color tokens and contrast, stage and chart colors, type, shapes, charts, motion, words, and the design reference |
| [architecture.md](specs/architecture.md) | How the parts connect, every file and folder, the layout rules and the libraries |
| [backend.md](specs/backend.md) | The data model, the backend rules and the API |
| [frontend.md](specs/frontend.md) | Server data, today's date, instant updates, board figures, dragging, dialogs inside dialogs, and the two modes |
| [security.md](specs/security.md) | What keeps the data reachable only from this computer |
| [testing.md](specs/testing.md) | The type checks, tests, code checks, hooks, subagents and CI, and which tests cover which requirements |
