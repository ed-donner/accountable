# Spec: Organizations, contacts and deals

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Tables

- **T1.** Organizations, Contacts and Deals each have a search box, sortable column headings, an Add button, and Edit and Delete on every row. Clicking a row opens the record.
- **T2.** Search updates as you type, ignores case, and matches any text column.
- **T3.** Clicking a heading sorts ascending, then descending, and a further click never clears the sort. Blank values sort last either way. The Stage column sorts in pipeline order, and the Status column sorts Lead, Qualified, Customer.
- **T4.** Search, sort and page stay in the address, so coming back from a record returns to the same view.
- **T5.** Tables show 50 rows a page. Search and sort cover every row, not just the current page.
- **T6.** Contacts has a status filter (All, Lead, Qualified, Customer) showing a count for each. It works together with search.
- **T7.** An empty table invites the first record. A search with no matches says so and offers to clear the search. Clearing it also clears the status filter on Contacts, and the Won-only view on Deals (T10).
- **T8.** A late deal shows a Late chip beside its close date in the Deals table.
- **T9.** Last activity is the date of the newest entry on that record's timeline.
- **T10.** The dashboard's won figures link to Deals showing Won deals only. Deals has no stage filter of its own, so this view only shows after following those links, with a button to show every stage.

| Table | Columns | Default sort |
|---|---|---|
| Organizations | Name, Industry, Website, Contacts, Open deals, Open value, Last activity | Name |
| Contacts | Name, Organization, Job title, Email, Phone, Status, Last activity | Name |
| Deals | Name, Organization, Main contact, Stage, Value, Probability, Expected revenue, Close date | Close date, earliest first |

## Adding and editing

- **F1.** Add and Edit open the same form in a dialog. The Add buttons on an organization's page, a contact's page and a pipeline column fill in what they already know.
- **F2.** Errors appear beside the field, in plain words such as "Enter a name".

| Record | Required | Other fields | Defaults |
|---|---|---|---|
| Organization | Name | Website, Industry, Notes | |
| Contact | Name, Organization | Email, Phone, Job title, Status | Status: Lead |
| Deal | Name, Organization, Main contact, Stage, Value, Close date | Probability | Stage: New, or the column's stage. Probability: the stage's usual one. Close date: today, if added at Won or Lost. |
| Activity | Type, Description, When, and the contact or deal it relates to | Follow-up date, Done | Type: Note. When: now. |

So a contact can't be added before their organization exists, and a deal can't be added before its organization and main contact exist. F3 lets the form add them on the spot.

- **F3.** Organization and contact pickers can be searched. If nothing matches, they offer to add the record in a second dialog, then select it. Without this, a required link would mean cancelling a half-filled form to go and add it. The bill form's supplier picker is the one exception: it doesn't offer to add an organization ([E16](bills.md#adding-editing-and-deleting)).
- **F4.** In the deal form, choosing an organization narrows the main contact list to that organization's contacts. Choosing a contact first fills in their organization. Nothing forces the two to match, because people change companies.
- **F5.** A blank link shows as "None" and can stay blank when the record is saved. A link that's set can be changed but not cleared.
- **F6.** Email must look like an email address if given. Website must be an `http` or `https` address, and `https://` is added if it's left off. Value must be a whole number of dollars, zero or more, which keeps every total exact. Probability must be a whole number from 0 to 100.
- **F7.** The close date of a won or lost deal can't be in the future, because its revenue would then be missing from the dashboard. An open deal's close date can be any date.
- **F8.** Changing the stage in the deal form shows the new probability, and the new close date for Won or Lost, straight away. Both can be overtyped before saving, and what's shown is what's saved. Moving between open stages leaves the close date alone, including one that's just been typed. A trip through Won or Lost and back restores it.
- **F9.** Two organizations, contacts or deals can share a name. Products can't ([G2](products.md#the-price-list)).
- **F10.** A save or delete happens once, however quickly its button is pressed. If it fails, the dialog stays open with what was typed, and says so.
- **F11.** A form that can't read the lists it needs closes and says so, rather than opening with an empty picker.
- **F12.** The activity form's When box holds minutes. Leaving it untouched keeps the activity's exact time.

The Copilot adds and edits organizations, contacts, deals and activities through the same routes as these forms, so every rule here holds for it too, and a refusal reaches it in the same words ([Z11](copilot.md#what-it-can-change)). Its arguments use the API's own field types, so a value F2 or F6 refuses on its own is refused before any change card, and the rules that need the records, such as F5's and F7's, come back from the route when the change runs.

## Deleting

- **D1.** Delete always asks first, in a dialog that names the record, gives the real counts and says it can't be undone. An activity is named by its description. If the counts can't be read, the dialog says so and won't delete.

| Deleting | What the dialog says happens |
|---|---|
| Organization | Its contacts and deals stay and are left with no organization |
| Contact | Their deals stay and are left with no main contact. Activities logged on the contact are deleted. |
| Deal | Its activities and stage-change entries are deleted. If it was won, its revenue leaves the dashboard. A deal with quotes can't be deleted (D4). |
| Activity | It's removed from every timeline and from the dashboard |

- **D2.** Won deals stay on the dashboard after their organization or contact is deleted.
- **D3.** Activities logged on a deal stay when that deal's main contact is deleted, because they belong to the deal.
- **D4.** A deal or an organization can't be deleted while a record in another area holds it, such as an invoice on the deal or a bill from the organization, so that record is never left pointing at nothing. Each area says which of its records hold a deal or an organization. The delete dialog is then titled "Annual support can't be deleted", says what holds it, such as "This deal has 2 quotes and 1 invoice, so it can't be deleted.", and offers only Close. A delete that gets past the dialog, such as one sent while a teammate adds an invoice, is refused with the same words. Contacts and activities are never held. A quote holds its deal ([Q27](quotes.md#no-deleting)). Every invoice holds its deal, and an issued one the organization it was issued to ([V21](invoices.md#on-deals-and-organizations)). A bill holds its supplier organization, so an organization with bills says "This organization has 12 bills, so it can't be deleted." ([E2](bills.md#bills)).

## Record pages

- **R1.** An organization's page shows its details and notes, its contacts, its deals, its bills (R7) and the combined timeline. It has Add contact and Add deal buttons.
- **R2.** A contact's page shows their details, status and organization, the deals where they're the main contact, and their timeline. It has an Add deal button.
- **R3.** A deal's page shows its details, stage, value, probability, expected revenue, close date, organization and main contact, a Late chip if late, and its timeline.
- **R4.** Each page has Edit and Delete. After a delete, the app returns to the section's table.
- **R5.** The contacts and deals listed on these pages are short linked lists, not tables, so T1 doesn't apply to them.
- **R6.** Each page shows who added the record and when, such as "Added by Alex Rivera on Oct 12, 2026", and who last changed it and when, such as "Last changed by Dana Whitfield on Oct 30, 2026", following U8 to U12. The second line is left out if nobody has changed the record since it was added. A record with no one recorded shows the dates alone, such as "Added Oct 12, 2026". Nobody chooses these in a form: the backend sets them from the token of whoever saves.
- **R7.** Other areas can add panels to a deal's and an organization's page, such as a deal's quotes or an organization's bills. They come below the page's own panels in its side column, each given the record as the page has it, in the order `App.tsx` gives them. Quotes adds a Quotes panel to both ([Q36, Q37](quotes.md#panels-on-deals-and-organizations)), Invoices adds an Invoices panel to both, below the Quotes panel ([V20, V21](invoices.md#on-deals-and-organizations)), and Bills adds a Bills panel to an organization's page, below its Invoices panel ([E19](bills.md#an-organizations-bills)).

## Screens

### Tables

A page title with the Add button beside it, then the search box, then the table on a panel. Rows are separated by space and a hover tint, not lines. Row height is 44px. Edit and Delete are icon buttons at the end of each row, always visible, with labels for screen readers.

### Record pages

Two columns of panels on the page background. The left, narrower one holds the details, with the lines from R6 at the foot of the details panel in muted ink, plus the linked contacts and deals. The right one holds the timeline, as the main thing on the page, with Log activity at its top. Each timeline entry has a round colored icon showing its type.
