# Spec: Data model, backend rules and API

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Data model

Every table also has `id` and `created_at`, and all but `stage_changes` have `updated_at`.

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
| value | integer | whole US dollars, 0 or more |
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

Notes:

- **Links:** required links are enforced by the API, not the database, because deletes have to be able to blank them. The database columns allow blank.
- **New database:** a first start builds the database under a temporary name and renames it once the migrations and sample data are done, so an interrupted first start can't leave an empty database behind.
- **Ids:** never used twice, so an old address can't open a different record. SQLite would otherwise give the newest record's id to the next one after a delete. Every table gets `TABLE_OPTIONS` from `db.py`.
- **Foreign keys:** SQLite turns these off by default. They're turned on for each connection with `connection.setconfig(sqlite3.SQLITE_DBCONFIG_ENABLE_FKEY, True)` in a SQLAlchemy connect event. This keeps to the "no raw SQL" rule, and it has been checked on Python 3.12.
- **Migrations:** these run with foreign keys off, all in one transaction. SQLite makes most table changes by rebuilding the table, and dropping the old table with foreign keys on would run its delete rules, blanking links and deleting activities.
- **Indexes:** on every foreign key, `deals (stage, position)`, `activities (occurred_at)`, `activities (follow_up_date)` and `stage_changes (changed_at)`.
- **Times:** SQLite stores no time zone, so the API always sends times with a `Z`. Otherwise the browser would read a UTC time as local.
- **Dates:** close dates and follow-up dates are plain dates. In the frontend, always read them with date-fns `parseISO`. `new Date("2026-10-31")` reads as UTC and shows the day before in US time zones.
- **Probabilities:** the six usual probabilities live in one place in the backend. The frontend reads them from `GET /api/meta`.

## Backend rules

`rules.py` holds one function that applies a stage change, used by both the deal update and the move. It runs in one transaction, so a failure leaves nothing half done:

1. Add the `stage_changes` row.
2. Set the probability to the new stage's usual one, unless this request gave one.
3. On Won or Lost, set the close date to today, unless this request gave one.
4. On Won, set the main contact's status to customer, if there is a main contact.
5. Put the deal at the top of the new column, unless this request gave a place.

The function takes today's date as an argument, so tests can fix it. The backend's today is the computer's local date.

Adding a deal at Won uses step 4 and writes no `stage_changes` row. Moving a card renumbers the target column in the same transaction. With a few hundred rows at most, this is simple and quick enough, and no fractional position scheme is needed.

Every write takes one lock in `db.py`, because FastAPI runs requests on separate threads and renumbering reads a column before writing it, so two quick moves could otherwise undo each other.

Last activity in the list replies comes from grouped queries, one for each kind of record, not one query per row, so the lists stay quick at the Q1 limits.

Reset and empty delete rows inside a transaction and leave the file and tables in place. This is why they're safe while the app is running, and why an emptied database isn't treated as new.

## API

All routes are under `/api` and use JSON. Validation errors return 422 with a message per field, and a missing record returns 404. An id that couldn't be a record, such as one too large for SQLite, is a validation error, and so is text with no valid encoding.

| Method and path | Purpose |
|---|---|
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

The list routes return every row, and the table does its searching, sorting and paging in the browser. At these limits that's small and quick, and it makes typing in the search box feel instant.

A timeline merges activities and stage changes in the backend, removes duplicates and sorts them newest first. Each entry says what it is, so the frontend can show the right controls: stage-change entries have no Edit or Delete.
