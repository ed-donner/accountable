# Intent: company settings

## Problem

Quotes and invoices will need the business's own details: its name and address, its sales tax, how long customers have to pay and how documents are numbered. Accountable has nowhere to keep them.

## Proposed outcome

A Settings page, opened from the menu under your initials, holds the company's details for its documents: the company name, address, email and phone, a tax label and rate, the payment terms in days, and the prefixes for quote and invoice numbers. Anyone on the team can change them, and the page shows who changed them last and when.

## Constraints

- There's one set of settings for the whole team, kept in the database, not in .env.
- The tax rate is a percentage from 0 to 100, with up to three decimal places, such as 8.875%. The tax label is free text, such as Sales tax or VAT.
- Payment terms are a whole number of days from 0 to 365.
- Number prefixes are 1 to 10 characters, using only the letters A to Z in either case, digits and hyphens, and are kept exactly as typed. The quote and invoice prefixes must differ, ignoring case, and neither can start with the other, so a quote and an invoice can never share a number.
- Every save needs the company name, the tax rate, the payment terms and both prefixes. The address, email, phone and tax label can be blank.
- The address is one box of free text, over as many lines as it needs.
- A new database starts with settings filled in for a made-up company that fits the sample deals.
- The backend checks every value, as well as the page.
- Every unit test, old and new, runs in under a second on this computer, because CI runs on a much slower machine.
- No new dependencies unless the plan makes the case for one.

## Decisions

- **Databases that already exist:** the team's Supabase database and a local copy's existing file don't get the made-up company, because its name could end up on the team's real invoices. They start with blank settings apart from the defaults: payment terms of 30 days, QT- and INV- as the prefixes, Sales tax as the label and a rate of 0. Until someone saves a company name, the page asks for one, and it shows no one as having changed the settings.
- **Seed and empty:** `npm run seed` puts the made-up company's settings back. `npm run empty`, and the steps in `docs/STATUS.md` for clearing the sample data in Supabase, leave the settings alone, because they're the business's details, not records.

## Not in this change

- Using the settings on documents. Quotes and invoices come later.
- A next number or counter for quotes and invoices. It comes with them.
- Currencies other than US dollars, or more than one tax rate.
- A logo.
- Personal preferences. The theme stays where it is.

## Success criteria

1. npm run check passes.
2. The settings can be changed and saved, and everyone who signs in sees the same ones.
3. Values out of range, such as a tax rate of 150% or payment terms of 400 days, and prefixes that clash, such as INV- and inv-, are refused with a clear message, through the page or the API.
4. The page shows who last changed the settings and when.
5. A database that already exists starts with blank settings and the defaults, and the page asks for the company name until one is saved.
