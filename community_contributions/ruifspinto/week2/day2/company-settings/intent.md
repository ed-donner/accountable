# Intent: company settings

## Problem

Quotes and invoices will need the business's own details: its name and address, its sales tax, how long customers have to pay and how documents are numbered. Accountable has nowhere to keep them.

## Proposed outcome

A Settings page, opened from the menu under your initials, holds the company's details for its documents: the company name, address, email and phone, a tax label and rate, the payment terms in days, and the prefixes for quote and invoice numbers. Anyone on the team can change them, and the page shows who changed them last and when.

## Constraints

- There's one set of settings for the whole team, kept in the database, not in .env.
- The company name is required. The other details can be blank.
- The address is one free-text block. A filled email must look like an email; the phone is free text.
- A blank tax rate or payment terms value saves and shows as 0.
- The tax rate is a percentage from 0 to 100 with up to three decimal places, such as 8.875%. The tax label is free text, such as Sales tax or VAT.
- Payment terms are a whole number of days from 0 to 365.
- Number prefixes are at most 10 characters, such as QT- and INV-, and use only letters, digits and hyphens.
- A new database starts with settings filled in for a made-up company that fits the sample deals.
- The backend checks every value, as well as the page.
- Every unit test, old and new, runs in under a second on this computer, because CI runs on a much slower machine.
- No new dependencies unless the plan makes the case for one.

## Not in this change

- Using the settings on documents. Quotes and invoices come later.
- Currencies other than US dollars, or more than one tax rate.
- A logo.
- Personal preferences. The theme stays where it is.

## Success criteria

1. npm run check passes.
2. The settings can be changed and saved, and everyone who signs in sees the same ones.
3. Values out of range, such as a tax rate of 150% or payment terms of 400 days, are refused with a clear message, through the page or the API.
4. The page shows who last changed the settings and when.
