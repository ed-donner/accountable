# Spec: Accountable

Accountable as it stands today: the problem it solves, what it does and how it is built. This is the description of the product and the authority for what it is. Each change updates it so it describes the product after the change merges, and keeps its own intent and plan in `docs/changes/<branch name>/`.

## Problem

A small business keeps track of its customers and sales in spreadsheets, inboxes and people's heads. Nobody can see at a glance which companies we deal with, who our contacts are, what's in the sales pipeline, what happened last with a customer or what needs doing next.

## What Accountable is

Accountable is a business management system: a sales CRM that will grow into a full Business OS, including ERP. Today it is a complete sales CRM for a small team, on the web — a private Salesforce that does the everyday CRM essentials really well. It feels sharp, modern and professional, and is a pleasure to use.

- A small team shares one Accountable on the web: everyone signs in with an email and password and works on the same organizations, contacts and deals.
- Supabase holds the data and signs people in; no other business systems are involved.

## Out of scope

Not part of this version: roles and permissions — everyone can do everything; signing up in the app itself, or with Google, magic links or a password reset — people are added in Supabase's dashboard; a layout for phones; AI features; email, calendar or phone integrations; currencies other than US dollars; reports beyond the dashboard; tags or custom fields; changing the pipeline stages; importing or exporting data.

## Areas

One file per product area holds the detail behind this summary — the five sections, the four kinds of record, sign-in, the shared behaviour and the design — with each design decision filed under the area it applies to:

- [Dashboard](specs/dashboard.md): the landing page, how sales are going at a glance.
- [Organizations](specs/organizations.md): the companies we do business with, and the Organization record.
- [Contacts](specs/contacts.md): the people we deal with, including leads and customers, and the Contact record.
- [Deals](specs/deals.md): the potential sales and the Deal record.
- [Pipeline](specs/pipeline.md): the deals as cards on a board, one column per stage.
- [Activities](specs/activities.md): the Activity record, activities and follow-ups.
- [Tables](specs/tables.md): the search boxes — the top bar's and each table's — sort, add, edit and delete, and what deletion cascades to.
- [Sign-in](specs/sign-in.md): signing in and out, the user behind each record, and the menu under your initials.
- [Running it](specs/running.md): the two ways to run it, sample data, resetting and deploying.
- [Look and feel](specs/look-and-feel.md): the brand, light and dark modes and contrast.
- [Design](specs/design.md): architecture, data model, API and frontend.
