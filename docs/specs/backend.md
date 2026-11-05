# Spec: Data model, backend rules and API

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Data model

Every table also has `id` and `created_at`, and all but `stage_changes`, `invoice_lines` and `payments` have `updated_at`. Stage changes and payments are never edited, and an invoice's lines change only with their invoice.

The local copy keeps these tables in SQLite and the shared app in Postgres on Supabase. Both use the same tables, built by the same migrations, through SQLAlchemy Core.

**users**

| Column | Type | Notes |
|---|---|---|
| id | text | the Supabase user id, or a fixed id for each made-up teammate |
| name | text | the display name, optional |
| email | text | required |

Each person's row is added the first time the backend sees their token, and updated when the token shows a new name or email (U9). Rows are never deleted, so a removed person's records still show their name. Someone with no display name has no `name`, and replies give their email in its place (U8).

**Who on every record**

Organizations, contacts, deals, activities, products, quotes, invoices and bills each also have:

| Column | Type | Notes |
|---|---|---|
| created_by | foreign key to users | who added it. Blank only on records from before sign-in (U12) |
| updated_by | foreign key to users | who last changed it, following U10. The same as `created_by` until someone changes it |

Stage changes also have `created_by`, for who moved the deal (U11), and payments `created_by`, for who recorded them (V18).

The company settings have `updated_by` alone, for who last changed them (B9). Their one row is added by a migration, not a person, so there's no `created_by`.

**organizations**

| Column | Type | Notes |
|---|---|---|
| name | text | required |
| website, industry, notes | text | optional |

**contacts**

| Column | Type | Notes |
|---|---|---|
| name | text | required |
| email, phone, job_title | text | optional |
| organization_id | foreign key | set to blank when the organization is deleted |
| status | text | `lead`, `qualified` or `customer` |

**deals**

| Column | Type | Notes |
|---|---|---|
| name | text | required |
| organization_id | foreign key | set to blank when the organization is deleted |
| main_contact_id | foreign key | set to blank when the contact is deleted |
| stage | text | one of the six stages |
| value | 64-bit integer | whole US dollars, 0 or more. Postgres's `integer` stops at about $2.1 billion, and the API accepts up to $1 trillion |
| probability | integer | 0 to 100 |
| close_date | date | expected if open, actual if closed |
| position | integer | place in its column, lowest at the top |

**activities**

| Column | Type | Notes |
|---|---|---|
| type | text | `note`, `call` or `email` |
| contact_id | foreign key | deleted with the contact |
| deal_id | foreign key | deleted with the deal |
| description | text | required |
| occurred_at | datetime | stored in UTC |
| follow_up_date | date | optional |
| follow_up_done | boolean | false by default |

A check constraint makes sure exactly one of `contact_id` and `deal_id` is set.

**stage_changes**

| Column | Type | Notes |
|---|---|---|
| deal_id | foreign key | deleted with the deal |
| from_stage, to_stage | text | |
| changed_at | datetime | stored in UTC |

Stage changes get their own table because they aren't activities: they have no type or description, can't be edited, and give the funnel its history.

**products**

| Column | Type | Notes |
|---|---|---|
| name | text | required |
| name_key | text | the name with its case taken out, by Python's `casefold()`, then written in Unicode's NFC form, so an accented letter typed as one character matches the same letter typed as a letter and an accent. The backend sets it on every save. Unique, so it's what makes names unique (G2) |
| description | text | optional |
| unit_price_cents | 64-bit integer | whole US cents, 0 to 100,000,000,000,000, which is $1 trillion |
| active | boolean | true by default, and false once archived |

The products table belongs to the price list, not the CRM, so it's in `products/tables.py` ([Layout rules](architecture.md#layout-rules)). Quote lines link to it, for the product each was added from (Q13).

**company_settings**

| Column | Type | Notes |
|---|---|---|
| company_name | text | required on every save. Blank only at the defaults, before the first save or after the clearing steps (B13, B14) |
| address | text | optional, and can hold several lines |
| email, phone | text | optional |
| tax_label | text | optional. `Sales tax` by default |
| tax_rate | integer | thousandths of a percent, 0 to 100,000, so 8.875% is 8875. 0 by default |
| payment_terms_days | integer | 0 to 365. 30 by default |
| quote_prefix, invoice_prefix | text | required. `QT-` and `INV-` by default |
| invoice_design | text | `classic`, `banner` or `ledger`. `classic` by default (B18) |
| accent_color | text | `#` and six capital hex digits, at least 4.5:1 against white. `#073B4C` by default (B20) |
| updated_by | foreign key to users | who last changed them. Blank at the defaults, until someone saves them |

The table holds one row, with `id` 1. The migration that makes the table adds it with the defaults, and a check constraint keeps `id` at 1, so no second row can appear. The API has no route that adds or deletes one. Each setting's default, and `updated_by`'s blank, are kept in the table itself, as server defaults, so the migration's row takes them from there. The clearing steps in [C11](running.md#running-and-keeping-data) set those columns back with Postgres's `DEFAULT`, rather than writing the values out a second time, and set `updated_at` to the time of clearing, because it has no default in the database. The tax rate is a whole number of thousandths, because SQLite has no exact decimal type and would keep 8.875 as a binary fraction, and the same column type then works on both databases.

**number_counters**

| Column | Type | Notes |
|---|---|---|
| kind | text | `quote` or `invoice`. Unique |
| last_number | integer | the last number that kind has taken, so the next is one more (B15) |

**company_logo**

| Column | Type | Notes |
|---|---|---|
| image | binary | the file's bytes, up to 1 MB, as the backend checked them (B21) |
| media_type | text | `image/png` or `image/jpeg`, from what the check found, never from the file's name or what the browser said |
| width, height | integer | in pixels, 1 to 2,000 each, so the designs can fit it without reading the image |

The table holds at most one row, with `id` 1, kept by a check constraint as the settings' row is, and no row means no logo. It's a table of its own so that reading the settings, which every invoice does, never reads the image. Removing the logo deletes the row. Saving or removing it counts as a change to the settings, so it sets their `updated_by` and `updated_at` (B9).

**invoices**

| Column | Type | Notes |
|---|---|---|
| deal_id | foreign key | required. Holds the deal (V21), so no delete rule |
| organization_id | foreign key | the organization it was issued to, set on issuing. Blank on a draft. Holds the organization, so no delete rule |
| status | text | `draft`, `issued` or `void`. Paid, overdue and part paid are worked out, never kept (V3) |
| number | text | such as `INV-0042`, set on issuing (B15). Blank on a draft. Unique |
| issue_order | integer | the count the number took on issuing (B15), so the Invoices table sorts Number in the order issued, whatever the prefix (V22). Blank on a draft |
| bill_to | text | as typed, up to 6 lines and 500 characters |
| issue_date, due_date | date | set on issuing. Blank on a draft |
| company_name, company_address, company_email, company_phone | text | copies of the company settings, set on issuing (V11). Blank on a draft, whose preview shows the settings as they are |
| tax_label | text | copied on issuing |
| tax_rate | integer | thousandths of a percent, as in `company_settings`, copied on issuing |
| subtotal_cents, tax_cents, total_cents | 64-bit integer | worked out by the backend on issuing, from the lines and the copied rate (B16). Blank on a draft, whose figures are worked out when it's read, at the settings' rate as it is then |
| issued_by, voided_by | foreign key to users | who issued it and who voided it |
| voided_at | datetime | when it was voided, in UTC |

**invoice_lines**

| Column | Type | Notes |
|---|---|---|
| invoice_id | foreign key | deleted with the invoice, which only a draft can be |
| position | integer | the line's place on the invoice, from 1 |
| product_id | foreign key | the product it came from. Products are never deleted, so it never needs blanking |
| name | text | the product's name when the line was added (V6) |
| description | text | optional, up to 1,000 characters |
| quantity | integer | 1 to 1,000,000 (B17) |
| unit_price_cents | 64-bit integer | 0 to $1 trillion in cents. A line's amount is worked out, never kept |

**payments**

| Column | Type | Notes |
|---|---|---|
| invoice_id | foreign key | required. No delete rule: only a draft can be deleted, and a draft has no payments |
| paid_on | date | not after the day it's recorded, and not before the invoice's issue date |
| amount_cents | 64-bit integer | more than 0, and no more than what was owed when it was recorded. A request can send up to $2 trillion, the most an invoice can total: a $1 trillion subtotal with tax at 100% (B17) |
| method | text | `bank_transfer`, `card`, `check`, `cash` or `other` |
| reference | text | optional, up to 100 characters |

The invoices tables belong to the invoices area, in `invoices/tables.py`, and the logo's table to `company/tables.py`, beside the settings.

A kind's row is added when it takes its first number, so the migration adds none, and a kind with no row starts at 1. It belongs to `company/`, beside the prefixes, and `company/documents.py`'s `take` is the one thing that changes it. It gives the number and its count, and `take_number` the number alone. The numbers themselves stay on the documents. Each area that numbers its documents gives `main.py` the column they're kept in, as a `Numbered`, as it gives its holds, and `main.py` puts every area's on the app. A save of the settings that changes a prefix reads them from there to find a number of the other kind that starts with it (B6), so `company/` never names an area. Seed, empty and the clearing steps delete its rows, as they delete the documents, so each count starts again at 1.

**quotes**

| Column | Type | Notes |
|---|---|---|
| number | text | such as QT-0004, taken in the save that adds the quote (B15, Q9). It never changes |
| deal_id | foreign key | required, with no delete rule, so the quote holds its deal (D4, Q27) |
| status | text | `draft`, `sent`, `accepted` or `declined`. Expired is worked out from `valid_until` and today, never saved (Q7) |
| quote_date | date | today, when the quote was first saved |
| valid_until | date | 30 days after `quote_date` unless changed while a draft |
| subtotal_cents | 64-bit integer | the lines' amounts added up, 0 to 100,000,000,000,000, which is $1 trillion. The backend works it out from the lines at every save of them |
| company_name, company_address, company_email, company_phone | text | the company's details from the settings, fixed when the quote is sent, or declined as a draft. Blank while a draft, which shows the settings' as they are (Q30) |
| tax_label, tax_rate | text, integer | fixed when the quote is sent, or declined as a draft, with the rate in thousandths of a percent, as `company_settings` keeps it. Blank while a draft, whose tax follows the settings (Q17) |
| prepared_for_organization, prepared_for_contact, prepared_for_email | text | fixed when the quote is sent, or declined as a draft. Blank while a draft, which follows its deal, and any can stay blank after (Q18) |
| sent_on | date | the day it was sent, blank until then |
| decided_on | date | the day it was accepted or declined, blank until then |

A check constraint keeps `status` to the four. A unique index on `deal_id`, for accepted quotes only, makes sure a deal has at most one accepted quote, on both databases (Q23). Tax and totals aren't saved: the replies work them out from `subtotal_cents` and the rate, the quote's own once it's no longer a draft, or the settings' while it is. A draft's company details, tax and Prepared for come from the settings and the deal at each read, so nothing on a draft needs updating when they change.

**quote_lines**

| Column | Type | Notes |
|---|---|---|
| quote_id | foreign key | deleted with the quote, which only seed and empty do (Q26) |
| position | integer | its place on the quote, from 1, in the order the lines were added (Q12) |
| product_id | foreign key | the product it was added from. Products are never deleted, so it needs no delete rule |
| name | text | the product's name when the line was added, taken from the products table, never from the request (Q13) |
| description | text | optional, and can hold several lines |
| quantity | integer | 1 to 1,000,000 (B17) |
| unit_price_cents | 64-bit integer | whole US cents, 0 to 100,000,000,000,000, as a product's price is |

A line's amount is worked out, never saved. A quote has at most 100 lines (Q14). The two tables belong to the quotes area, so they're in `quotes/tables.py` ([Layout rules](architecture.md#layout-rules)).

**bills**

| Column | Type | Notes |
|---|---|---|
| organization_id | foreign key to organizations | the supplier. Required, with no delete rule, so it holds the organization (D4) |
| bill_number | text | required, as typed with the spaces at its ends dropped, 50 characters at most |
| bill_number_key | text | the bill number with its case taken out, as `products.name_key` is. The backend sets it on every save |
| bill_date | date | required |
| due_date | date | required, never before `bill_date` |
| amount_cents | 64-bit integer | the amount before tax, in whole US cents, 0 to 100,000,000,000,000, which is $1 trillion |
| tax_cents | 64-bit integer | the tax as it appears on the bill, in whole cents, with the same limits. 0 by default |
| category | text | `software`, `contractors`, `travel`, `office`, `marketing` or `other` |
| notes | text | optional, and can hold several lines |
| paid_on | date | the date it was paid. Blank while it's unpaid |

The bills table belongs to `bills/tables.py`. It has no total column: the backend adds the amount and the tax in its queries and replies, so a total can never disagree with its parts. Overdue isn't kept either, because it changes with the day (E8). A unique index on `(organization_id, bill_number_key)` keeps each supplier's numbers apart (E3), and a check constraint keeps `category` to the six. The rules that need today, such as a paid date not in the future, are the API's, because a database constraint can't know the team's today.

Notes:

- **Links:** required links are enforced by the API, not the database, because deletes have to be able to blank them. The database columns allow blank. A bill's supplier is the one exception: no delete can blank it, because the organization's delete is refused (D4), so `bills.organization_id` is required in the database too.
- **Which database:** `db.py` uses SQLite at `data/accountable.db` in the local copy and Postgres at `DATABASE_URL` in the shared app (C8). Everything specific to either one stays in `db.py` and the migrations. Postgres connections are checked before each use, because Render's sleep leaves dead ones in the pool, the pool holds at most 5, to stay within the session pooler's limit, and connecting gives up after 10 seconds, so a start can't hang on an unreachable Supabase. Reads on Postgres run in autocommit, with no BEGIN or ROLLBACK: its default isolation gives each query its own snapshot anyway, so a read transaction would only add round trips, and from far away each one costs 80ms or more. Writes are still one transaction each.
- **New database:** the migrations add the company settings' row with the defaults, and the sample data then fills it with the sample company's ([B12](settings.md#starting-values)). A database that already exists gets only the defaults, from the same migration (B13). In the local copy, a first start builds the database under a temporary name and renames it once the migrations and sample data are done, so an interrupted first start can't leave an empty database behind. In the shared app, a database with none of the app's tables is new, and the first start builds the tables and adds the sample data in one transaction, which Postgres can roll back whole.
- **Ids:** never used twice, so an old address can't open a different record. SQLite would otherwise give the newest record's id to the next one after a delete. Every table gets `TABLE_OPTIONS` from `db.py`. Postgres never reuses an id, so it needs nothing extra. Users keep the id Supabase gave them.
- **Foreign keys:** SQLite turns these off by default. They're turned on for each connection with `connection.setconfig(sqlite3.SQLITE_DBCONFIG_ENABLE_FKEY, True)` in a SQLAlchemy connect event. This keeps to the "no raw SQL" rule, and it has been checked on Python 3.12. Postgres always enforces them.
- **Migrations:** these run when the backend starts, all in one transaction, on both databases. On SQLite they run with foreign keys off, because SQLite makes most table changes by rebuilding the table, and dropping the old table with foreign keys on would run its delete rules, blanking links and deleting activities. Steps that only SQLite needs, such as those rebuilds, are skipped on Postgres, where Postgres can change a table in place. Every migration, the first ones included, runs from an empty database on both, so a new Supabase project gets the whole history.
- **Row-level security:** on Postgres, the migrations turn on row-level security for every table, Alembic's version table included, with no policies ([Security](security.md#the-database)). SQLAlchemy has no way to say this, so it's the one place the migrations use raw SQL, and it runs only on Postgres.
- **Row-level security check:** on Postgres, once the migrations have run, the backend reads Postgres's catalog through SQLAlchemy Core and refuses to start if any table in the `public` schema has row-level security off. It runs inside the migrations' transaction, so a start that fails it changes nothing. The message names each one, such as "Row-level security is off for these tables: notes. Turn it on in a migration." That catches a later migration that forgot, and a table added in Supabase's dashboard. The check lives in `db.py`.
- **Indexes:** on every foreign key, `deals (stage, position)`, `activities (occurred_at)`, `activities (follow_up_date)`, `stage_changes (changed_at)`, `quote_lines (quote_id, position)`, `invoices (due_date)`, `payments (paid_on)`, `bills (due_date)` and `bills (bill_date)`, and unique ones on `products (name_key)`, `number_counters (kind)`, `invoices (number)`, `bills (organization_id, bill_number_key)` and, for accepted quotes only, `quotes (deal_id)`. SQLAlchemy writes the last as a partial index on both databases. Both databases let a unique column hold many blanks, so invoice drafts, which have no number yet, don't clash.
- **Held records:** a later area's column that holds a deal or an organization (D4), `quotes.deal_id`, `invoices.deal_id`, `invoices.organization_id` and `bills.organization_id` so far, is a foreign key with no delete rule, so the database refuses the delete too, should one ever get past the route's check.
- **Times:** stored in UTC with no time zone, on both databases, so the API always sends times with a `Z`. Otherwise the browser would read a UTC time as local.
- **Unique product names:** the database refuses a second product with the same `name_key`, so two saves at once can't both get through, and the API turns that refusal into the message beside the name (G8), never a 500. The key is worked out in Python, so it's the same on both databases. An index on the database's own `lower(name)` would differ between them, because SQLite's `lower()` only knows the letters A to Z, and an index can't use the lowercase function `db.py` gives SQLite. Saves check the key first, inside the write lock, so the usual case never reaches the refusal. Postgres also refuses an index entry over 2,704 bytes, its own few included, and that refusal isn't a duplicate, so it would be a 500. A name has at most 200 characters (G2), and no character's key is more than 12 bytes, so a key is at most 2,400 bytes, inside the 2,690 Postgres 16 took (`INDEXED_KEY_BYTES` in `products/tables.py`).
- **Unique bill numbers:** the database refuses a second bill from one supplier with the same `bill_number_key`, and the API turns that refusal into the message beside the bill number (E3), never a 500, as it does for product names. Saves check the key first, inside the write lock. A bill number has at most 50 characters, so its key fits Postgres's index with room to spare.
- **Prices:** whole cents in a 64-bit integer, as `deals.value` is for whole dollars, for products, quote and invoice lines, a quote's subtotal, an invoice's totals and payments alike. The API takes `unit_price_cents` as a whole number and refuses anything else, so `49.5` is refused, not rounded. A bill's `amount_cents` and `tax_cents` are taken the same way. The browser holds whole numbers exactly up to about 9 quadrillion, far past the limit, and past a bill's largest total of $2 trillion. A sum of bills or of invoices can pass that, from 46 at the most, so `GET /bills/dashboard` and `GET /invoices/money` send their sums as strings of digits, such as `"9200000000000001"`, which the browser reads as a BigInt. `api.py`'s `CentsSum` sends them that way for both.
- **Search:** case is ignored the same way on both databases (K2). SQLite's own `lower()` only knows the letters A to Z, so `db.py` gives SQLite a lowercase function that knows every language, and matching uses it on both sides of the comparison.
- **Dates:** close dates, follow-up dates, a quote's dates and a bill's three dates are plain dates. In the frontend, always read them with date-fns `parseISO`. `new Date("2026-10-31")` reads as UTC and shows the day before in US time zones.
- **Probabilities:** the six usual probabilities live in one place in the backend. The frontend reads them from `GET /api/meta`.

## Backend rules

`rules.py` holds one function that applies a stage change, used by both the deal update and the move. It runs in one transaction, so a failure leaves nothing half done:

1. Add the `stage_changes` row.
2. Set the probability to the new stage's usual one, unless this request gave one.
3. On Won or Lost, set the close date to today, unless this request gave one.
4. On Won, set the main contact's status to customer, if there is a main contact.
5. Put the deal at the top of the new column, unless this request gave a place.
6. Set the value, if this request gave one, as accepting a quote does (Q22).

The function takes today's date and the person making the change as arguments, so tests can fix them. A later area changes a deal only through it, so accepting a quote passes the value rather than writing the deal itself. It records that person on the `stage_changes` row, on the deal, and on the main contact if step 4 changes their status (U10). The backend's today is the date in the zone set by `TZ`, which `render.yaml` sets to the team's zone, or the computer's own zone without it, or with a value that isn't a zone name, which the computer's own clock then reads as it can.

Adding a deal at Won uses step 4 and writes no `stage_changes` row. Moving a card renumbers the target column in the same transaction. With a few hundred rows at most, this is simple and quick enough, and no fractional position scheme is needed. Renumbering leaves the other cards' `updated_at` and `updated_by` alone.

Every add and save sets `created_by` and `updated_by` from the token, never from the request.

Saving the company settings reads the row, applies what was sent, checks the result against B4 to B7, and writes it, all in one transaction under the write lock. It sets `updated_by` and `updated_at` only if a value changed, as U10 says. The messages for their fields live in `company/schemas.py`, and `main.py` hands them to the error handler for a request to `/api/settings`.

A deal's and an organization's delete check what holds the record first, inside the delete's own transaction, under the write lock, so nothing can come to hold it between the check and the delete. Each area gives `main.py` its holds in `holds.py`'s terms: the column that points at the held record, and the word for one of its records, such as `invoice`. `main.py` puts every area's on the app, and the CRM's routes read them from there, so they never name another area. Those routes' delete-impact replies list what holds the record, kind by kind, and a delete of a held record gets a 409 in the dialog's words (D4).

Quotes' saves each run in one transaction under the write lock, as every write does, and check the quote's status and its deal's stage inside it, so a teammate's send or a move on the board can't slip in between:

- **Adding** checks the deal is open, then takes the number with `take_number` from `company/documents.py` and sets the date to today, so an add that fails gives its number back (B15). **Copying** does the same, with the original's lines.
- **Saving the lines** takes them whole and in order. A line with an id keeps its product and name and takes the description, quantity and price sent. A line without one has to name an active product, and takes its name from the products table. A line left out is removed, and a line with another quote's id is refused. Then `totals()` in `company/tax.py` works out the subtotal from the lines as they'll be saved, and a subtotal past $1 trillion is refused before anything is written. A quote that isn't a draft is refused with a 409 first (Q21).
- **Sending** checks Q20's conditions, then copies the company's details and the tax label and rate from `current_settings()`, and the deal's organization and main contact, onto the quote, as they are at that moment. **Declining** a draft copies them the same way, so only a draft follows the settings and the deal.
- **Accepting** checks the quote is sent and the deal is open with no accepted quote, marks the quote accepted, marks the deal's other sent quotes declined, then calls the stage-change function above with Won and the quote's value in whole dollars, `(subtotal_cents + 50) // 100`, so halves round up as tax and expected revenue do. The deal, its contact and the declined quotes are put down to the person accepting.

The PDF is made by `quotes/pdf.py` from the same reply `GET /quotes/{id}` gives, so it and the page show the same words and figures. It draws every value as text, with nothing read as markup (Q32), and embeds the fonts from `quotes/fonts/`.

Saving a bill reads it, applies what was sent, checks the result against E3 to E6 and E9, and writes it, all in one transaction under the write lock, so a paid date is checked against a bill date changed in the same save, and a number against the supplier it will have. The paid date is checked against the backend's today. A bill added without a due date gets its bill date plus 30 days, or the calendar's last day for a bill dated in its last 30. A supplier that doesn't exist gets "Choose a supplier", checked before the database's foreign key could turn it into a 500. Every problem is given at once, each beside its field. A save sets `updated_by` and `updated_at` only if a value changed (U10). The total in every reply is `amount_cents` plus `tax_cents`, and a total sent in a request is ignored, as any unknown field is. The messages for its fields live in `bills/schemas.py`.

The figures for bills' row of the Money section (E20 to E23) come from two queries, never one per bill, using the backend's today: one reads the unpaid bills, from which what we owe, what's overdue and what's due in the next 30 days are all worked out, and one reads the bills dated in the 12 months. Python folds those into months and categories, as the CRM's revenue chart does with `month_series`, because grouping by month in the database needs date functions that differ between SQLite and Postgres. At 1,000 bills that's a few hundred rows, well within Q1.

Every write takes one lock in `db.py`, because FastAPI runs requests on separate threads and renumbering reads a column before writing it, so two quick moves could otherwise undo each other. Teammates' moves on the shared app go through the same lock. It lives in the process, so the shared app runs as one process (W6).

Last activity in the list replies comes from grouped queries, one for each kind of record, not one query per row, so the lists stay quick at the Q1 limits.

Saving a draft reads the invoice, refuses with a 409 if it's no longer a draft (V12), checks what was sent against V8, checks the Bill to and the lines as they'll be saved against V8 and V9 again, so a Bill to filled in from the deal or a description taken from a product is held to the same limits as one sent, and replaces its lines with the ones sent, all in one transaction under the write lock. Issuing does the same, then, in the same transaction:

1. Checks the draft can be issued (V10), reading the deal's organization and the company settings inside the transaction.
2. Takes the next number with `take` from `company/documents.py` (B15), so a failure later in these steps gives it back, and keeps its count as the invoice's `issue_order`.
3. Sets the issue date to today and the due date to today plus the payment terms, from the settings as they are.
4. Copies the company's details, the organization, and the tax label and rate, and works out the subtotal, tax and total with `company/tax.py`.
5. Sets the status to issued, `issued_by` to the person from the token, and `updated_by` and `updated_at` as any save does.

The function takes today's date as an argument, as the stage rules do, so tests can fix it. Twenty drafts issued at once go through the lock one at a time and get twenty numbers in a row.

Recording a payment reads the invoice and its payments, works out what's owed, and refuses an amount over it, all in one transaction under the write lock, so two payments at once can't overpay (V16). Voiding checks for payments the same way. What an invoice shows as (V3), its days late and what's owed are worked out in `invoices/` from the stored status, total, due date and payments, with today passed in, and the figures for invoices' row of the Money section come from grouped queries, not one query per invoice, so they stay quick at the Q1 limits.

The PDF is made when it's asked for, with ReportLab, from the same layout the preview draws (V24). Text is placed as text, never through ReportLab's markup, so nothing typed is read as markup (V25). The fonts are TTF files kept with the backend and carried in the PDF, cut down to the characters it uses. Their widths, and the characters every one of them has, which are the characters invoices can show (V9), are in `shared/invoice-fonts.json`, which `invoices/fonts.py` writes from the files, and a test checks the two still agree.

Saving a logo decodes it from base64, reads it with Pillow, which comes with ReportLab, and keeps it only if Pillow finds a PNG or a JPEG within the limits in B21. A file Pillow can't read, or reads as anything else, gets B21's message.

Reset and empty delete rows inside a transaction and leave the file and tables in place. This is why they're safe while the app is running, and why an emptied database isn't treated as new. Reset also writes the sample company's settings over the settings row, with its design, accent color and logo, and empty leaves the row and the logo alone (C4). Seed's sample quotes and issued invoices take their numbers through `take_number`, in the order they were made and issued, so the next new quote or invoice carries on after them.

## API

All routes are under `/api` and use JSON. Every route needs a valid token in the `Authorization` header, and refuses with 401 without one ([Security](security.md#signing-in)). Validation errors return 422 with a message per field, and a missing record returns 404. A field inside a list is keyed by its whole place, such as `lines.2.quantity`, which is the page's own path for it, and takes the message of its own name. A list item that isn't a record at all is keyed by its place, such as `lines.1`, and takes the list's message. A refusal of a draft as a whole, such as a deal with no organization, comes under `form` (V10). An id that couldn't be a record, such as one past 2,147,483,647, the largest Postgres's `integer` holds, is a validation error, and the frontend treats such an address as a missing record without asking, and so is text with no valid encoding, or with a NUL character, which Postgres can't store though SQLite can.

| Method and path | Purpose |
|---|---|
| `GET /me` | The signed-in person's name, email and initials (U8) |
| `GET /meta` | Stages in order with usual probabilities, statuses, activity types |
| `GET /organizations` | All rows, with contact count, open deal count, open value, last activity |
| `POST /organizations` | Add |
| `GET /organizations/{id}` | One record with its contacts and deals |
| `PATCH /organizations/{id}` | Edit the fields sent |
| `DELETE /organizations/{id}` | Delete |
| `GET /organizations/{id}/delete-impact` | The counts for the delete dialog |
| `GET /organizations/{id}/timeline?limit&offset` | Timeline |
| `/contacts`, `/contacts/{id}` and so on | The same set of routes |
| `/deals`, `/deals/{id}` and so on | The same set of routes |
| `POST /deals/{id}/move` | Body: `stage`, `before_deal_id` (null for the end of the column). Returns the deal and what else changed. |
| `POST /activities` | Add, with `contact_id` or `deal_id` |
| `PATCH /activities/{id}` | Edit, including marking a follow-up done |
| `DELETE /activities/{id}` | Delete |
| `GET /dashboard` | Everything on the dashboard, in one reply |
| `GET /products` | Every product, archived ones included, each with `active` |
| `POST /products` | Add, active |
| `GET /products/{id}` | One product |
| `PATCH /products/{id}` | Edit the fields sent. `active` set to false archives the product, and set to true restores it. |
| `GET /search?q=` | Up to 5 organizations, contacts, deals and active products whose names hold `q`, with a count for each kind (K1 to K5). `q` is 1 to 100 characters once the spaces at its ends are gone. |
| `GET /settings` | The company settings, with who last changed them and when (B9), and the logo's type, width and height, or null with no logo |
| `PATCH /settings` | Change the settings sent. The checks apply to the settings as they'd be after the save (B5), so while no company name is saved, a save that leaves it out is refused. `logo` is the file's bytes in base64, or null to remove it, so the request stays JSON |
| `GET /settings/logo` | The logo's bytes, with its checked type and `X-Content-Type-Options: nosniff`, or a 404 with no logo |
| `GET /quotes` | Every quote, with its deal's name, the deal's organization, its status as saved, its dates, value, tax and total. `deal_id` or `organization_id` narrows it to one deal's quotes, or the quotes on one organization's deals, for the panels (Q36, Q37) |
| `GET /quotes/new/{deal_id}` | What a new draft on the deal starts with, before it's saved: Prepared for, the tax label and rate, the company's details, and whether the deal is open (Q8, Q9) |
| `POST /quotes` | Add a draft on an open deal, with its valid-until date and lines. Takes its number (B15) |
| `GET /quotes/{id}` | One quote as its page and PDF show it: its lines with their amounts, the subtotal, tax and total, Prepared for, the tax label and rate, and the company's details, each as fixed on the quote, or as the settings and the deal have them now for a draft, and who added and last changed it |
| `PATCH /quotes/{id}` | Change a draft's valid-until date or lines. Lines are sent whole, in order (Q12, Q13) |
| `POST /quotes/{id}/send` | Mark a draft as sent (Q20) |
| `POST /quotes/{id}/accept` | Accept a sent quote, moving its deal to Won (Q22). Returns the quote and what else changed, as the move does |
| `POST /quotes/{id}/decline` | Decline a draft or a sent quote (Q24) |
| `POST /quotes/{id}/copy` | Copy a quote to a new draft on the same open deal (Q25). Returns the new quote |
| `GET /quotes/{id}/pdf` | The quote as a PDF, made at that moment (Q30), as `application/pdf`, with `Content-Disposition` naming the file after the number, such as `QT-0004.pdf` |
| `GET /invoices` | Every invoice, with its deal, organization, what it shows as (V3), total and what's owed. `?deal_id=` or `?organization_id=` gives a record's panel its list (V20, V21) |
| `POST /invoices` | Body: `deal_id`. Starts a draft on a won deal, with its Bill to filled in (V4, V5). A deal that isn't won gets a 409, and one that isn't there a 422 beside `deal_id` |
| `GET /invoices/{id}` | One invoice with its lines, figures, payments, days late, and who added, issued and voided it |
| `PATCH /invoices/{id}` | A draft's Bill to and lines, the lines sent as the whole list in order. A 409 once issued (V12) |
| `DELETE /invoices/{id}` | Delete a draft. A 409 once issued |
| `POST /invoices/{id}/issue` | Body: the Bill to and lines, as for `PATCH`. Saves them and issues the draft in one transaction (V10, V11) |
| `POST /invoices/{id}/void` | Void an issued invoice with no payments (V14) |
| `POST /invoices/{id}/payments` | Body: `paid_on`, `amount_cents`, `method`, `reference`. Records a payment (V15, V16) |
| `DELETE /invoices/{id}/payments/{payment_id}` | Delete a payment (V17) |
| `GET /invoices/{id}/pdf` | The PDF, made now, as `application/pdf` named after the number (V24). A draft gets a 409 |
| `GET /invoices/money` | Invoices' row of the dashboard's Money section, in one reply (V29). Its sums are strings of digits (Prices, above); each count is a number |
| `GET /bills` | Every bill, each with its supplier's id and name and its `total_cents`. `?organization_id=` gives one organization's, for its Bills panel (E19) |
| `POST /bills` | Add. Without `due_date`, it's 30 days after `bill_date` (E5). With `paid_on`, it's added paid |
| `GET /bills/{id}` | One bill, with its supplier's id and name and its `total_cents` |
| `PATCH /bills/{id}` | Edit the fields sent. `paid_on` set to a date marks the bill paid, and set to null marks it unpaid (E9 to E11) |
| `DELETE /bills/{id}` | Delete (E17) |
| `GET /bills/dashboard` | Bills' row of the Money section, in one reply: the backend's `today`, so the page can tell when the day has passed it, what we owe and what's overdue, each as a total and a count, the unpaid bills due from today to 30 days on, in due date order, and each of the last 12 months' spending by category, oldest first (E20 to E23). Its sums are strings of digits (Prices, above); each due bill's total is a number |

The local copy also has these two, which need no token and which the shared app doesn't have (U16):

| Method and path | Purpose |
|---|---|
| `GET /local/teammates` | The made-up teammates, for the sign-in screen |
| `POST /local/sign-in` | Body: `user_id`. Returns a token for that teammate. |

Signing in to the shared app goes from the browser straight to Supabase Auth, so it has no route here.

`DELETE /organizations/{id}` and `DELETE /deals/{id}` get a 409 while another area's records hold the record (D4), such as `{"detail": "This deal has 2 quotes and 1 invoice, so it can't be deleted."}`, and their `delete-impact` replies carry `held_by`, a list of `{"noun": "quote", "count": 2}`, empty when nothing holds the record. Contacts are never held, so theirs doesn't.

Each area's routes start with words of its own after `/api`, such as `/api/products` or `/api/settings`, never another area's, so `main.py` can give a field error the messages of the area whose route it reached. A later area's lists for a deal or an organization go under its own words, such as `/api/bills?organization_id=7`, not under `/api/organizations`. Routes that belong to no area, such as `/api/search`, have messages of their own or none.

An invoice's routes refuse what its status doesn't allow with a 409 and the words in V10 to V16, never a 500. A line's amount, a subtotal, a tax or a total sent with a draft is ignored (V9).

Products have no delete route, so `DELETE /products/{id}` gets a 405 (G9). Nor do quotes, so `DELETE /quotes/{id}` gets a 405 too (Q26). Sending, accepting, declining and copying take no fields, so their body is `{}`, because every POST has to be JSON. A change a quote's status doesn't allow, such as editing a sent quote or accepting a draft, gets a 409 with Q20's, Q21's or Q23's words, such as `{"detail": "QT-0004 has been sent, so it can't be changed. Copy it to make a new draft."}`, and a refusal that belongs beside a field, such as a valid-until date in the past, gets a 422 with the message beside it, a line's as `lines.2.quantity`. A product's name that's taken gets a 422 with a message beside `name`, like any other field (G2).

A bill number the supplier already has gets a 422 with a message beside `bill_number` (E3). Bills have no `delete-impact` route, because nothing is deleted with a bill or left pointing at one. A bill's category travels as its lowercase word, such as `software`, and its dates as `YYYY-MM-DD`. Replies don't say whether a bill is overdue: the page works that out from `due_date`, `paid_on` and its own today, so it changes when the day does (E8).

The single-record replies for organizations, contacts, deals, products, quotes, invoices and bills carry `created_by` and `updated_by`, each with the person's id and name, or null for a record from before sign-in, and `created_at` and `updated_at` in UTC. Timeline entries carry `created_by` the same way, and the company settings carry `updated_by` and `updated_at`, with `updated_by` null until someone saves them, and again after the clearing steps. Names follow U8. A record counts as changed since it was added when its `updated_at` differs from its `created_at`, so an add sets both from one moment, and the changes the app makes around a save, such as renumbering a column, leave the other records' `updated_at` alone as well as their `updated_by` (U10, R6). Records from before sign-in, with no one recorded, can have their two times a moment apart, so on those the record pages treat a difference under a second as no change.

The tax rate travels as text in replies, such as `"8.875"`, without trailing zeros, so nothing on the way can round it (B7). Requests can send it as text or as a number, and the backend checks it from its digits. Python's JSON reader would make a number with a point a float, which loses digits past about the 16th, so the settings' routes use `api.ExactNumbersRoute`, which reads such a number as a `Decimal` with every digit sent. No other route uses it, so every other area's bodies are read as before.

The list routes return every row, and the table does its searching, sorting and paging in the browser. At these limits that's small and quick, and it makes typing in the search box feel instant.

A timeline merges activities and stage changes in the backend, removes duplicates and sorts them newest first. Each entry says what it is, so the frontend can show the right controls: stage-change entries have no Edit or Delete.
