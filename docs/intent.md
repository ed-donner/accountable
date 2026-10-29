# Intent: the Accountable prototype

## Problem

A small business keeps track of its customers and sales in spreadsheets, inboxes and people's heads. Nobody can see at a glance which companies we deal with, who our contacts are, what's in the sales pipeline or what happened last with a customer.

## Proposed outcome

Accountable is a business management system: a sales CRM that will grow into a full Business OS, including ERP. This first intent is a running prototype, a skeleton that later work builds on.

The prototype has a front end in `frontend/` and a back end in `backend/`, with the front end showing business data served by the back end. Everything is read-only, and the data is hard coded in the back end.

### Four kinds of record

- **Organization**: a company we do business with. Name, website, industry and notes. An organization has many contacts and many deals.
- **Contact**: a person we deal with. Name, email, phone, job title, the organization they belong to, and a status (lead, qualified or customer).
- **Deal**: a potential sale. Name, the organization and the main contact it is with, its stage (New, Qualified, Proposal, Negotiation, Won or Lost), its value in US dollars and its expected close date.
- **Activity**: something that happened with a contact or deal. Type (note, call or email), the contact or deal it relates to, a description and when it happened.

### Front end

- A simple navigation with one section per record type: Organizations, Contacts, Deals and Activities.
- Each section shows a table of that record type, listing every record the back end returns.
- The tables are read-only: no adding, editing, deleting, searching or sorting yet.
- The look follows Accountable's brand guidelines, which take priority over any general design guidance.

### Back end

- An API that returns the four record types.
- A realistic sample data set, hard coded in the back end: several organizations, several contacts, deals spread across the stages and a handful of activities.
- The records refer to each other, so a contact belongs to an organization and a deal names its organization and contact.

## Affected users and systems

- The sales team will use Accountable every day. For now, the only user is the developer running it locally.
- No other systems are involved yet.

## Constraints

- The technology in `docs/TECH_STACK.md`.
- It runs locally with one documented command that works on Mac, Linux and Windows.
- Not in this prototype: sign-in and user accounts, any notion of which company is using the app (everything is one shared workspace), a pipeline board, dashboards, charts, detail pages, and creating, editing or deleting records.

## Success criteria

1. The app starts locally with one documented command that works on Mac, Linux and Windows, and the browser shows Accountable with the four sections in the navigation.
2. Each section shows a table of the sample records, and what is on screen matches what the API returns.
3. The API can be called on its own and returns the sample organizations, contacts, deals and activities.
4. `docs/STATUS.md` is updated to record what was built and how to run it.

## Open questions

- Where the data lives once it is no longer hard coded, and when sign-in arrives, are for later intents.
