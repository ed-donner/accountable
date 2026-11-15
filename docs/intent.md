# Intent: the Accountable MVP

## Problem

A small business keeps track of its customers and sales in spreadsheets, inboxes and people's heads. Nobody can see at a glance which companies we deal with, who our contacts are, what's in the sales pipeline, what happened last with a customer or what needs doing next.

## Proposed outcome

Accountable is a business management system: a sales CRM that will grow into a full Business OS, including ERP. This first version, the MVP, is a complete sales CRM for one person, running on their own computer. Think of it as a private Salesforce that does the everyday CRM essentials really well. It should feel sharp, modern and professional, and be a pleasure to use.

### Five sections

Each section is an item in the left menu: Overview, Pipeline, Deals, Contacts and Organizations.

- **Overview** (the dashboard), the landing page: how sales are going at a glance. Deals won and revenue won month by month over the last 12 months up to the current month (no date picker), the open pipeline and its expected revenue (each deal's value times its probability of close), a sales funnel showing how much value reaches each stage, recent activity, and the follow-ups that are coming up or overdue. It should be visually stunning, with at least a line chart, a bar chart and a visual of the pipeline. Which figures each one shows, and how, is the designer's call.
- **Organizations**: the companies we do business with. Open one to see its contacts and deals.
- **Contacts**: the people we deal with, including leads and customers, with a filter by status. Open one to see their organization and a timeline of everything that has happened with them.
- **Deals**: the potential sales, with each one's stage, value and close date. Open one to see its details and its timeline. A deal still open after its expected close date stands out, in the table and on its pipeline card.
- **Pipeline** (its own item in the left menu, next to Overview): the deals as cards on a board, one column per stage. Drag a card to another column to change the deal's stage, or within a column to change its place; a card can be dropped anywhere in a column, and it stays where it was dropped. A new deal can be added straight into a column, at that stage. The board shows the total value and expected revenue of the deals still open, each column shows its own, and the figures change as soon as a card moves.

Every table has a search box, columns you can sort by clicking their headings, a way to add a new record, and edit and delete on each row. That's how we add a new deal, a new lead or a new customer. Deleting asks first, and says what will happen to the records linked to the one being deleted. Deleting unlinks rather than cascades: deleting an organization leaves its contacts with no organization and deletes nothing else, and deleting a contact leaves its deals with no main contact. The one thing removed along with a record is its activities. An activity on a deleted contact or deal is deleted too, unless it's also linked to another record that still exists, in which case it stays on that record.

Deals are the exception, because a deal must have an organization: an organization that still has deals can't be deleted. The confirmation says so, names how many deals are in the way, and asks for those deals to be moved to another organization or deleted first.

From any contact or deal you can log an activity (a note, call or email) and give it a follow-up date. An activity logged from a deal can also name a contact, and one logged from a contact can also name a deal; it then shows in both timelines. A follow-up shows on the dashboard as a task until it's marked done. Activities can be edited and deleted too. When a deal moves to another stage, including Won or Lost, an entry such as "Moved from Proposal to Negotiation" appears in its timeline and in the dashboard's recent activity by itself.

### Four kinds of record

- **Organization**: a company we do business with. Name, website, industry and notes. An organization has many contacts and many deals.
- **Contact**: a person we deal with. Name, email, phone, job title, the organization they belong to (optional, since a new lead may not have one yet), and a status (lead, qualified or customer). A lead is a contact with the lead status, so there's no separate list of leads.
- **Deal**: a potential sale. Name, the organization it is with (required) and its main contact (optional), its stage (New, Qualified, Proposal, Negotiation, Won or Lost), its value in US dollars, its probability of close, and its expected or actual close date. Each stage has a usual probability of close: New 10%, Qualified 25%, Proposal 50%, Negotiation 75%, Won 100% and Lost 0%. A deal takes its new stage's probability when it moves; a probability set by hand is kept until the stage changes. When a deal moves to Won or Lost, its close date becomes today, and it can still be edited afterwards; moving a deal back out of Won or Lost leaves its close date as it is.
- **Activity**: something that happened, or needs to happen, with a contact, a deal or both. Type (note, call or email), the contact and/or deal it relates to (at least one), a description and when it happened, and optionally a follow-up date and whether it's done. It shows in the timeline of each record it relates to.

### Sample data

Accountable comes with realistic sample data, so every screen looks alive the first time it starts: organizations across several industries, contacts at every status, deals at every stage (including deals won and lost over the past months, deals expected to close in the months ahead and a few running late), and activities with some follow-ups due soon and some overdue. Roughly 15 organizations, 40 contacts, 30 deals and 80 activities, enough that the dashboard's 12 months of charts have data in them.

### Look and feel

The look follows Accountable's brand guidelines, which take priority over any general design guidance. The MVP is light mode, designed for a laptop or desktop screen.

## Affected users and systems

- One salesperson, using Accountable on their own computer every day. The rest of the sales team joins later.
- Their data runs to hundreds of records, up to about 1,000 in each table. Tables can simply scroll at that size, so pagination is optional.
- No other systems are involved yet.

## Constraints

- The technology in `docs/TECH_STACK.md`.
- It runs locally with one documented command that works on Mac, Linux and Windows, and needs no internet connection to use.
- Every change is kept: it's still there after a browser refresh, and every time the app starts it shows every change made before.
- One documented command resets the data to the sample data, to start again from scratch.
- It feels fast: with up to about 1,000 records in each table, pages open, searches filter and actions take effect without a noticeable wait.
- It's accessible: everything can be done with the keyboard as well as the mouse (including moving a deal to another stage), focus is always visible, every form field has a label, and text has readable contrast.
- Not in the MVP: sign-in, user accounts or several users; a dark mode or a layout for phones; AI features; email, calendar or phone integrations; currencies other than US dollars; reports beyond the dashboard; tags or custom fields; changing the pipeline stages; importing or exporting data.

## Success criteria

1. Someone non-technical can start Accountable with the one documented command, open it in a browser and land on the dashboard, with sample data on every screen.
2. Organizations, contacts (leads, qualified contacts and customers) and deals can each be added, found by searching, sorted, edited and deleted from their tables, and every change is still there after a refresh and after a restart. Deleting asks first, unlinks rather than cascades, and won't delete an organization that still has deals. The reset command brings back the sample data.
3. Contacts can be filtered by status, and each record's page shows the records it's linked to.
4. Dragging a deal to another column on the pipeline changes its stage and its probability of close to that stage's default, and the deals list shows both. Moving a deal to Won or Lost sets its close date to today. A card dropped anywhere in a column, including higher or lower in its own column, stays there after a refresh. The board's and the columns' totals and expected revenue change as soon as the card moves. A deal added in a column starts at that stage, and late deals stand out.
5. An activity or follow-up logged on a contact or deal appears in its timeline, newest first, and in both timelines when it names both, and so does an entry for each change of stage. Follow-ups show on the dashboard as upcoming or overdue until they're marked done.
6. The dashboard's figures match the data, and they reflect a deal marked won or a new follow-up.
7. Every screen is sharp, modern and professional, and follows the brand. The dashboard is visually stunning, with a line chart, a bar chart and a visual of the pipeline.
8. With about 1,000 records in each table, screens and actions respond without a noticeable wait.
9. Every action above can be done with the keyboard alone, with visible focus throughout.
10. Before it's called done, someone has used it end to end in a real browser, the way a salesperson would: every section and every action above, each screen checked by eye, with no errors in the browser's console. Passing tests is necessary, but it isn't enough.

## Open questions

- Sign-in, several people sharing the same data, and a record of who did what are for a later intent.
- Making Accountable available to people beyond the computer it runs on is for later too.
