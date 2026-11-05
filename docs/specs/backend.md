# Spec: Data model, backend rules and API

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Data model

Every table also has `id` and `created_at`, and all but `stage_changes` have `updated_at`.

The local copy keeps these tables in SQLite and the shared app in Postgres on Supabase. Both use the same tables, built by the same migrations, through SQLAlchemy Core.

**users**

| Column | Type | Notes |
|---|---|---|
| id | text | the Supabase user id, or a fixed id for each made-up teammate |
| name | text | the display name, optional |
| email | text | required |

Each person's row is added the first time the backend sees their token, and updated when the token shows a new name or email (U9). Rows are never deleted, so a removed person's records still show their name. Someone with no display name has no `name`, and replies give their email in its place (U8).

**Who on every record**

Organizations, contacts, deals, activities and products each also have:

| Column | Type | Notes |
|---|---|---|
| created_by | foreign key to users | who added it. Blank only on records from before sign-in (U12) |
| updated_by | foreign key to users | who last changed it, following U10. The same as `created_by` until someone changes it |

Stage changes also have `created_by`, for who moved the deal (U11).

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

The products table belongs to the price list, not the CRM, so it's in `products/tables.py` ([Layout rules](architecture.md#layout-rules)). Nothing links to it yet.

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
| updated_by | foreign key to users | who last changed them. Blank at the defaults, until someone saves them |

The table holds one row, with `id` 1. The migration that makes the table adds it with the defaults, and a check constraint keeps `id` at 1, so no second row can appear. The API has no route that adds or deletes one. Each setting's default, and `updated_by`'s blank, are kept in the table itself, as server defaults, so the migration's row takes them from there. The clearing steps in [C11](running.md#running-and-keeping-data) set those columns back with Postgres's `DEFAULT`, rather than writing the values out a second time, and set `updated_at` to the time of clearing, because it has no default in the database. The tax rate is a whole number of thousandths, because SQLite has no exact decimal type and would keep 8.875 as a binary fraction, and the same column type then works on both databases.

Notes:

- **Links:** required links are enforced by the API, not the database, because deletes have to be able to blank them. The database columns allow blank.
- **Which database:** `db.py` uses SQLite at `data/accountable.db` in the local copy and Postgres at `DATABASE_URL` in the shared app (C8). Everything specific to either one stays in `db.py` and the migrations. Postgres connections are checked before each use, because Render's sleep leaves dead ones in the pool, the pool holds at most 5, to stay within the session pooler's limit, and connecting gives up after 10 seconds, so a start can't hang on an unreachable Supabase. Reads on Postgres run in autocommit, with no BEGIN or ROLLBACK: its default isolation gives each query its own snapshot anyway, so a read transaction would only add round trips, and from far away each one costs 80ms or more. Writes are still one transaction each.
- **New database:** the migrations add the company settings' row with the defaults, and the sample data then fills it with the sample company's ([B12](settings.md#starting-values)). A database that already exists gets only the defaults, from the same migration (B13). In the local copy, a first start builds the database under a temporary name and renames it once the migrations and sample data are done, so an interrupted first start can't leave an empty database behind. In the shared app, a database with none of the app's tables is new, and the first start builds the tables and adds the sample data in one transaction, which Postgres can roll back whole.
- **Ids:** never used twice, so an old address can't open a different record. SQLite would otherwise give the newest record's id to the next one after a delete. Every table gets `TABLE_OPTIONS` from `db.py`. Postgres never reuses an id, so it needs nothing extra. Users keep the id Supabase gave them.
- **Foreign keys:** SQLite turns these off by default. They're turned on for each connection with `connection.setconfig(sqlite3.SQLITE_DBCONFIG_ENABLE_FKEY, True)` in a SQLAlchemy connect event. This keeps to the "no raw SQL" rule, and it has been checked on Python 3.12. Postgres always enforces them.
- **Migrations:** these run when the backend starts, all in one transaction, on both databases. On SQLite they run with foreign keys off, because SQLite makes most table changes by rebuilding the table, and dropping the old table with foreign keys on would run its delete rules, blanking links and deleting activities. Steps that only SQLite needs, such as those rebuilds, are skipped on Postgres, where Postgres can change a table in place. Every migration, the first ones included, runs from an empty database on both, so a new Supabase project gets the whole history.
- **Row-level security:** on Postgres, the migrations turn on row-level security for every table, Alembic's version table included, with no policies ([Security](security.md#the-database)). SQLAlchemy has no way to say this, so it's the one place the migrations use raw SQL, and it runs only on Postgres.
- **Row-level security check:** on Postgres, once the migrations have run, the backend reads Postgres's catalog through SQLAlchemy Core and refuses to start if any table in the `public` schema has row-level security off. It runs inside the migrations' transaction, so a start that fails it changes nothing. The message names each one, such as "Row-level security is off for these tables: notes. Turn it on in a migration." That catches a later migration that forgot, and a table added in Supabase's dashboard. The check lives in `db.py`.
- **Indexes:** on every foreign key, `deals (stage, position)`, `activities (occurred_at)`, `activities (follow_up_date)` and `stage_changes (changed_at)`, and a unique one on `products (name_key)`.
- **Times:** stored in UTC with no time zone, on both databases, so the API always sends times with a `Z`. Otherwise the browser would read a UTC time as local.
- **Unique product names:** the database refuses a second product with the same `name_key`, so two saves at once can't both get through, and the API turns that refusal into the message beside the name (G8), never a 500. The key is worked out in Python, so it's the same on both databases. An index on the database's own `lower(name)` would differ between them, because SQLite's `lower()` only knows the letters A to Z, and an index can't use the lowercase function `db.py` gives SQLite. Saves check the key first, inside the write lock, so the usual case never reaches the refusal. Postgres also refuses an index entry over 2,704 bytes, its own few included, and that refusal isn't a duplicate, so it would be a 500. A name has at most 200 characters (G2), and no character's key is more than 12 bytes, so a key is at most 2,400 bytes, inside the 2,690 Postgres 16 took (`INDEXED_KEY_BYTES` in `products/tables.py`).
- **Prices:** whole cents in a 64-bit integer, as `deals.value` is for whole dollars. The API takes `unit_price_cents` as a whole number and refuses anything else, so `49.5` is refused, not rounded. The browser holds whole numbers exactly up to about 9 quadrillion, far past the limit.
- **Search:** case is ignored the same way on both databases (K2). SQLite's own `lower()` only knows the letters A to Z, so `db.py` gives SQLite a lowercase function that knows every language, and matching uses it on both sides of the comparison.
- **Dates:** close dates and follow-up dates are plain dates. In the frontend, always read them with date-fns `parseISO`. `new Date("2026-10-31")` reads as UTC and shows the day before in US time zones.
- **Probabilities:** the six usual probabilities live in one place in the backend. The frontend reads them from `GET /api/meta`.

## Backend rules

`rules.py` holds one function that applies a stage change, used by both the deal update and the move. It runs in one transaction, so a failure leaves nothing half done:

1. Add the `stage_changes` row.
2. Set the probability to the new stage's usual one, unless this request gave one.
3. On Won or Lost, set the close date to today, unless this request gave one.
4. On Won, set the main contact's status to customer, if there is a main contact.
5. Put the deal at the top of the new column, unless this request gave a place.

The function takes today's date and the person making the change as arguments, so tests can fix them. It records that person on the `stage_changes` row, on the deal, and on the main contact if step 4 changes their status (U10). The backend's today is the date in the zone set by `TZ`, which `render.yaml` sets to the team's zone, or the computer's own zone without it, or with a value that isn't a zone name, which the computer's own clock then reads as it can.

Adding a deal at Won uses step 4 and writes no `stage_changes` row. Moving a card renumbers the target column in the same transaction. With a few hundred rows at most, this is simple and quick enough, and no fractional position scheme is needed. Renumbering leaves the other cards' `updated_at` and `updated_by` alone.

Every add and save sets `created_by` and `updated_by` from the token, never from the request.

Saving the company settings reads the row, applies what was sent, checks the result against B4 to B7, and writes it, all in one transaction under the write lock. It sets `updated_by` and `updated_at` only if a value changed, as U10 says. The messages for their fields live in `company/schemas.py`, and `main.py` hands them to the error handler for a request to `/api/settings`.

Every write takes one lock in `db.py`, because FastAPI runs requests on separate threads and renumbering reads a column before writing it, so two quick moves could otherwise undo each other. Teammates' moves on the shared app go through the same lock. It lives in the process, so the shared app runs as one process (W6).

Last activity in the list replies comes from grouped queries, one for each kind of record, not one query per row, so the lists stay quick at the Q1 limits.

Reset and empty delete rows inside a transaction and leave the file and tables in place. This is why they're safe while the app is running, and why an emptied database isn't treated as new. Reset also writes the sample company's settings over the settings row, and empty leaves the row alone (C4).

## API

All routes are under `/api` and use JSON. Every route needs a valid token in the `Authorization` header, and refuses with 401 without one ([Security](security.md#signing-in)). Validation errors return 422 with a message per field, and a missing record returns 404. An id that couldn't be a record, such as one past 2,147,483,647, the largest Postgres's `integer` holds, is a validation error, and the frontend treats such an address as a missing record without asking, and so is text with no valid encoding, or with a NUL character, which Postgres can't store though SQLite can.

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
| `GET /settings` | The company settings, with who last changed them and when (B9) |
| `PATCH /settings` | Change the settings sent. The checks apply to the settings as they'd be after the save (B5), so while no company name is saved, a save that leaves it out is refused. |

The local copy also has these two, which need no token and which the shared app doesn't have (U16):

| Method and path | Purpose |
|---|---|
| `GET /local/teammates` | The made-up teammates, for the sign-in screen |
| `POST /local/sign-in` | Body: `user_id`. Returns a token for that teammate. |

Signing in to the shared app goes from the browser straight to Supabase Auth, so it has no route here.

Products have no delete route, so `DELETE /products/{id}` gets a 405 (G9). A product's name that's taken gets a 422 with a message beside `name`, like any other field (G2).

The single-record replies for organizations, contacts, deals and products carry `created_by` and `updated_by`, each with the person's id and name, or null for a record from before sign-in, and `created_at` and `updated_at` in UTC. Timeline entries carry `created_by` the same way, and the company settings carry `updated_by` and `updated_at`, with `updated_by` null until someone saves them, and again after the clearing steps. Names follow U8. A record counts as changed since it was added when its `updated_at` differs from its `created_at`, so an add sets both from one moment, and the changes the app makes around a save, such as renumbering a column, leave the other records' `updated_at` alone as well as their `updated_by` (U10, R6). Records from before sign-in, with no one recorded, can have their two times a moment apart, so on those the record pages treat a difference under a second as no change.

The tax rate travels as text in replies, such as `"8.875"`, without trailing zeros, so nothing on the way can round it (B7). Requests can send it as text or as a number, and the backend checks it from its digits. Python's JSON reader would make a number with a point a float, which loses digits past about the 16th, so the settings' routes use `api.ExactNumbersRoute`, which reads such a number as a `Decimal` with every digit sent. No other route uses it, so every other area's bodies are read as before.

The list routes return every row, and the table does its searching, sorting and paging in the browser. At these limits that's small and quick, and it makes typing in the search box feel instant.

A timeline merges activities and stage changes in the backend, removes duplicates and sorts them newest first. Each entry says what it is, so the frontend can show the right controls: stage-change entries have no Edit or Delete.
