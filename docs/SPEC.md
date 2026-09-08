# Accountable

Accountable is a business management system: a sales CRM that will grow in to a full Business OS including ERP.

## Phase 1

The goal of this phase is a running skeleton: a front end in `frontend/` and a back end in `backend/`, with the front end showing business data served by the back end. Make everything read-only with data hard coded.

When complete, update docs/STATUS.md to reflect what's done.

### Information

Four kinds of record to start with.

- **Organization**: a company we do business with. Name, website, industry and notes. An organization has many contacts and many deals.
- **Contact**: a person we deal with. Name, email, phone, job title, the organization they belong to, and a status (lead, qualified or customer).
- **Deal**: a potential sale. Name, the organization and the main contact it is with, its stage (New, Qualified, Proposal, Negotiation, Won or Lost), its value in US dollars and its expected close date.
- **Activity**: something that happened with a contact or deal. Type (note, call or email), the contact or deal it relates to, a description and when it happened.

### Front end

- A simple navigation with one section per record type: Organizations, Contacts, Deals and Activities.
- Each section shows a table of that record type, listing every record the back end returns.
- Tables are read only. No adding, editing, deleting, searching or sorting yet.
- The look follows `docs/BRAND.md`.

### Back end

- An API that returns the four record types.
- The data is hard coded inside the back end: a realistic sample set with several organizations, several contacts, deals spread across the stages and a handful of activities.
- The records refer to each other, so a contact belongs to an organization and a deal names its organization and contact.

### Not in this phase

- No sign-in and no user accounts.
- No notion of which company is using the app. Everything is one shared workspace for now.
- No pipeline board, dashboard, charts or detail pages.
- No creating, editing or deleting records.

### Success criteria

1. The app starts locally with one documented command, and the browser shows Accountable with the four sections in the navigation
2. Each section shows a table of the sample records, and what is on screen matches what the API returns
3. The API can be called on its own and returns the sample organizations, contacts, deals and activities
4. The file docs/STATUS.md is updated and records the progress
