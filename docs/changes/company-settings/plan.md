# Plan: company settings

This plan turns the company-settings intent and the spec, already updated on this branch, into build work: which files change, in what order, what could go wrong and how we'll know it works. IDs such as B6 and C11 are the spec's requirements, most of them in `docs/specs/settings.md`. The intent wins over the spec and the spec wins over this plan. If the build shows the spec is wrong, fix the spec in the same change and say so in `docs/STATUS.md`.

There's no new dependency. Zod, React Hook Form, Radix's dropdown menu, Sonner and Python's `decimal` already do everything the page and the API need.

The plan ends with the build. ui-check, the review and `docs/IMPROVE.md` come after it.

## Files that change

The change is small enough for one agent, working through the phases in [Order of work](#order-of-work). The backend and frontend meet only at the API below and at `shared/settings-cases.json`, so either side can be built against them first.

### What the two sides agree on

`GET /api/settings` and `PATCH /api/settings` both reply:

```json
{
  "company_name": "Plainsong Systems",
  "address": "48 Orchard Row, Suite 210\nBrooklyn, NY 11201",
  "email": "accounts@plainsong.example",
  "phone": "(718) 555-0142",
  "tax_label": "Sales tax",
  "tax_rate": "8.875",
  "payment_terms_days": 30,
  "quote_prefix": "QT-",
  "invoice_prefix": "INV-",
  "updated_at": "2026-11-05T14:03:00Z",
  "updated_by": { "id": "teammate-dana-whitfield", "name": "Dana Whitfield" }
}
```

- `company_name`, `address`, `email`, `phone` and `tax_label` can be `null`. `updated_by` is `null` at the defaults (B9, B13).
- `tax_rate` is always text, with no trailing zeros: `"8.5"`, `"0"`, `"100"`, `"0.001"`.
- The `PATCH` body holds any of the nine settings, and the backend ignores anything else, such as `updated_by`. `tax_rate` can be text or a number. A blank optional field can be sent as `""` or `null`, and is saved as `null`.
- A refusal is a 422 with `{"detail": "Check the form.", "fields": {...}}`, with the messages from B4's table. A prefix clash is always reported on `invoice_prefix`, as the table says, even when only `quote_prefix` was sent.

`shared/settings-cases.json` holds the cases both unit test suites run, so the page and the API agree on every edge:

- `tax_rates.accepted`: typed text, the stored thousandths and the text shown once saved, such as `["8.50", 8500, "8.5"]`. Includes `0`, `100`, `0.001`, `8.875` and spaces at the ends.
- `tax_rates.refused`: typed text and which message it gets, `range` or `decimals`, such as `["150", "range"]`, `["100.001", "range"]`, `["-1", "range"]`, `["8.8751", "decimals"]`, `["8,875", "range"]`, `["1e2", "range"]` and `["", "range"]`.
- `prefixes.accepted` and `prefixes.refused`, with the message for each refusal, `blank` or `characters`: `QT-`, `inv-`, `A`, ten characters, eleven characters, `QT_`, `QT -` and `É`.
- `clashes`: pairs of quote and invoice prefixes, and whether they clash: `QT-` and `INV-` don't, `INV-` and `inv-` do, `Q` and `QT-` do, `QT-` and `Q` do, `A-` and `AB` don't.

### Backend: new files

| File | What it holds |
|---|---|
| `backend/accountable/company/__init__.py` | Empty, as in `crm/` |
| `backend/accountable/company/tables.py` | The `company_settings` table from [backend.md](../../specs/backend.md#data-model). `company_name`, `address`, `email` and `phone` are text that can be blank. `tax_label` is text with a server default of `Sales tax`. `tax_rate` and `payment_terms_days` are integers that can't be blank, with server defaults of `0` and `30`. `quote_prefix` and `invoice_prefix` are text that can't be blank, with server defaults of `QT-` and `INV-`. Then `created_at`, `updated_at` and `updated_by`, the last a foreign key to `users` with an index, and `TABLE_OPTIONS`. A check constraint named `one_row` keeps `id` at 1, written as the expression `column("id") == 1`, because the layout test refuses SQL in a string |
| `backend/accountable/company/schemas.py` | `FIELD_MESSAGES` for the five fields with a fixed message. The field types: the tax rate as text or a number, turned into thousandths from its digits through `Decimal(str(value))`, with booleans, `NaN` and infinity refused. The two prefixes, each with its own blank message. `rate_text(thousandths)` for replies. `prefixes_clash(quote, invoice)`. `SettingsUpdate`, with every field `\| MISSING`, and the `CompanySettings` reply |
| `backend/accountable/company/router.py` | `GET` and `PATCH /settings`. The read joins `users` for `updated_by`'s name, through `users.person`. The save works in one `db.writing()` transaction: it reads the row, lays what was sent over it, refuses with `api.FieldError` if the result has no company name or the prefixes clash, then writes only `who.alterations(...)`, with `who.changed(...)` if anything changed (B5, B8) |
| `backend/accountable/company/sample_data.py` | The sample company from B12, and `fill(conn, now)`, which writes it over the one row with `updated_by` set to Dana Whitfield's id |
| `backend/accountable/migrations/versions/0004_company_settings.py` | Creates the table with its server defaults, check constraint, foreign key and index. Adds the one row, with `id` 1 and `created_at` and `updated_at` both now in UTC, leaving every setting to its server default (B13). On Postgres, turns on row-level security for the table. The downgrade drops the table |
| `shared/settings-cases.json` | The cases above |
| `backend/tests/test_company_settings.py` | See [Proof](#proof) |

### Backend: existing files

| File | Change |
|---|---|
| `backend/accountable/main.py` | Includes `company.router` in `_signed_in_routes`. Hands the error handler the CRM's and the company's field messages together |
| `backend/accountable/cli.py` | `fill_sample` also calls `company.sample_data.fill`, so a new database and `npm run seed` both get the sample company. Seed's question adds "The company settings will be replaced with the sample company's." `npm run empty` stays as it is (C4) |
| `backend/accountable/migrations/env.py` | Imports `company.tables` as well as `crm.tables`, so the metadata has every table |
| `backend/tests/test_migrations.py` | A fixture for a database at revision `0003` with records in it. New tests for the upgrade, the check constraint and the Postgres SQL. See [Proof](#proof) |
| `backend/tests/test_cli.py` | Seed puts the sample company back over changed settings, empty leaves them alone, and seed's question mentions them |
| `backend/tests/test_sample_data.py` | A seeded database has B12's settings, put down to Dana Whitfield |
| `backend/tests/test_layout.py` | Only `main.py`, `cli.py` and `migrations/env.py` name `company/` at the top level. A later area's folder may (architecture.md) |
| `backend/tests/test_every_route.py` | `test_the_routes_were_found` also expects `GET` and `PATCH /api/settings`, and `company_name` among the body's text fields, so the security and bad-input checks provably reach them |

`who.py`, `api.py`, `db.py` and `users.py` don't change. The settings use `who.alterations` and `who.changed` as they are, and `api.Name`, `api.Email` and `api.OptionalText` for their text fields.

### Frontend: new files

| File | What it holds |
|---|---|
| `frontend/src/company/settings.ts` | The `CompanySettings` type. `useCompanySettings()`, keyed `["settings"]`. `useSaveSettings()`, through `useWrite`. The checks: `taxRateProblem(text)` and `prefixProblem(text, blankMessage)`, each returning a message or nothing, and `prefixesClash(quote, invoice)`. They work on the text with patterns, never through `Number()` (B7). The Zod schema built from them, `toForm(settings)` and `toRequest(values)`. `toRequest` sends the rate as text and the payment terms as a number |
| `frontend/src/company/SettingsPage.tsx` | The page in [settings.md](../../specs/settings.md#company-settings-page). `PageHeader` with the title, then the who line, then the two columns of panels and Save settings. `LoadFailed` with no form when there's nothing to show (B11), and the keeping version above the form when a refresh fails. B14's message while `company_name` is `null`. When new settings arrive and the form isn't dirty, it resets to them. After a save it resets to the reply (B10) |
| `frontend/src/company/settings.test.ts`, `SettingsPage.test.tsx` | See [Proof](#proof) |

### Frontend: existing files

| File | Change |
|---|---|
| `frontend/src/App.tsx` | The `/settings` route |
| `frontend/src/components/UserMenu.tsx` | A Company settings item, with no icon, that goes to `/settings`. It sits with Sign out as the last group, so the space above moves from Sign out to it. It's there whether or not the backend has said who's signed in |
| `frontend/src/components/Field.tsx` | An optional `hint`, shown under the box in muted ink and joined to it with `aria-describedby`. While the field has an error, the error shows in its place. Used for the prefixes |
| `frontend/src/components/RecordLayout.tsx` | Exports `WhoAndWhen`, so the page's "Last changed by" line looks like the record pages' (R6) |
| `frontend/src/components/UserMenu.test.tsx` | The item is there, with and without the person, and choosing it opens `/settings` |
| `frontend/src/App.test.tsx` | `/settings` opens the page, with the top bar |
| `frontend/src/components/Shell.test.tsx` | On `/settings`, no section link is current (B2) |
| `frontend/src/layout.test.ts` | Outside `company/`, only `App.tsx` names it among the top-level files, `components/` and `lib/` |

### End-to-end tests

| File | Change |
|---|---|
| `e2e/settings.spec.ts` | New. See [Proof](#proof) |
| `e2e/menu.spec.ts` | The menu's items are now Company settings and Sign out. The contrast sweep adds `/settings`, in both modes, ready once the Company name box shows |
| `e2e/quality.spec.ts` | `/settings` joins the check for sideways scrolling at both sizes and the walk for console errors, each waiting for the Company name box. A new test tabs through the form in order and sees a focus ring on each box and on Save settings |

### Docs and the harness

| File | Change |
|---|---|
| `docs/STATUS.md` | The clearing steps for Supabase become one script in one transaction. It empties the five record tables, then sets the settings' columns and `updated_by` back with `DEFAULT` and `updated_at` to `now() at time zone 'utc'`. It says that this resets the company settings too, so the steps are for the start, before the team enters its own details (C11). The design entry becomes a build entry |
| `.claude/agents/ui-check.md` | Step 1 also reads `settings.md`, for the Company settings page |
| `docs/spec.md` and `docs/specs/` | Only where the build shows they're wrong |

## Order of work

Three phases. Each ends with `npm run check:quick` passing, and Phase 3 ends with `npm run check`.

### Phase 1: the backend

1. Write `company/tables.py` and migration `0004`, and import the tables in `migrations/env.py`. Write the migration tests and get `test_migrations.py` passing, offline Postgres SQL included, before going further, because everything else reads this row.
2. Write `shared/settings-cases.json`, then `company/schemas.py`.
3. Write `company/router.py`, and add it and its messages to `main.py`.
4. Write `company/sample_data.py`, and call it from `cli.fill_sample`. Add the line to seed's question.
5. Write `test_company_settings.py` and the additions to `test_cli.py`, `test_sample_data.py`, `test_layout.py` and `test_every_route.py`.

Done when `npm run check:quick` passes.

### Phase 2: the frontend

1. Add the `hint` to `Field.tsx` and export `WhoAndWhen`, and check that the record pages' tests still pass.
2. Write `company/settings.ts` and `settings.test.ts`, running the shared cases.
3. Write `SettingsPage.tsx` and its test.
4. Add the route to `App.tsx` and the item to `UserMenu.tsx`, with their tests and the `Shell.test.tsx` and `layout.test.ts` additions.

Done when `npm run check:quick` passes.

### Phase 3: end to end, and finishing

1. Write `e2e/settings.spec.ts`, and change `menu.spec.ts` and `quality.spec.ts`.
2. Start the app on a temporary database, `ACCOUNTABLE_DB=<scratchpad>/accountable.db npm run dev`, and go through the agent's checks under [By hand](#by-hand). Fix what's off. Stop the server and check ports 5173 and 8765 are free.
3. Update the clearing steps and add the build entry in `docs/STATUS.md`, and add `settings.md` to `.claude/agents/ui-check.md`.
4. Fix any part of the spec the build showed to be wrong.
5. Run `npm run check` until it passes.
6. Hand over to the project owner for the shared app's checks under [By hand](#by-hand).

## Risks

Most damaging first.

1. **The migration changes real databases, and nothing takes it back.** It runs on whatever database the app starts on: the owner's `data/accountable.db` in the main checkout, and the team's Supabase database at the next deploy. It only adds a table and one row and leaves every record alone, and the upgrade test proves that on a `0003` database with records in it. But once a database is at `0004`, `main`'s code won't start on it, because Alembic can't find that revision, until this branch merges. No agent starts the app on `data/accountable.db`: every run uses a temporary database through `ACCOUNTABLE_DB`. If the owner wants to try the branch on their own data, they copy the file first. All phases.
2. **The `products` branch is being built at the same time, and both branches add migration `0004` on top of `0003`.** Once both merge, Alembic would find two heads and the backend wouldn't start anywhere. Whichever branch merges second renames its migration to `0005`, with `down_revision = "0004"`, before it merges, and runs the migration tests again. A new test in `test_migrations.py` checks the migrations have one head, so the mistake fails `npm test` rather than a start. No database that lasts, such as the owner's or Supabase, may run a revision that later gets renumbered. The same merge will also have to reconcile the spec:
   - `products` says areas never import each other, where this branch says later areas may import `company/`
   - `products` has six sections, where B2 says five
   - both branches change `main.py`, `cli.py` and the file tree in `architecture.md`

   All phases, and the merge.
3. **A made-up company ends up on the team's real app.** Two paths could put it there. The migration must add only the defaults, never the sample company. The sample company comes only from `fill_sample`, which `db.py` runs on a new database alone (M1) and `npm run seed` runs on the local copy alone. The other path is the clearing steps, which reset the settings with `DEFAULT`, so their values come from the table and can't drift from B13. No test can run those steps, because `truncate` and `SET column = DEFAULT` are Postgres-only. So the migration tests read the migrated row and check it against B13, the offline Postgres SQL shows each server default, and the owner runs the steps by hand. Phases 1 and 3.
4. **The tax rate gets rounded somewhere.** A JavaScript number or a Python float on the way could turn 8.875 into something else. The page keeps the rate as text from the box to the request. The backend reads it with `Decimal(str(value))`. A JSON number arrives as a float, and Python writes a float's shortest form, so 8.875 reads back as `8.875`, and anything with more than three places is refused, not rounded. Booleans are refused before they can pass as 1 or 0. It's stored as an integer and written out again from that integer. The shared cases run on both sides. Phases 1 and 2.
5. **Blank boxes saved over the real settings.** If the page showed an empty form after a failed read, one press of Save settings would wipe the company's details. The page renders the form only from settings it has read, and `SettingsPage.test.tsx` checks a failed read shows no form at all (B11). Phase 2.
6. **A teammate's save wipes what someone is typing.** TanStack Query reads the settings again whenever the window is used again. The form takes the new values only while it isn't dirty, and the test changes the reply under a dirty form and checks the typed values stay (B10). Phase 2.
7. **Two saves at once slip past the checks.** The name and clash checks read the saved row, so they have to run inside the same transaction as the write, under the write lock, or two quick saves could each pass against the old values. The router does all of it inside one `db.writing()`. Phase 1.
8. **Field messages from two areas collide.** The error handler looks messages up by field name across every area. That's why the field is `company_name`, not `name`. `test_company_settings.py` checks the CRM's and the company's message keys don't overlap. Phase 1.
9. **The table is missing from the metadata.** A table exists in `db.metadata` only once its module has been imported. Without `env.py`'s import, the migration tests compare against a metadata with no `company_settings` in it. `test_every_table_column_and_nullable_matches` would then fail on the extra live table, so it can't pass by accident. Phase 1.
10. **The offline Postgres SQL can't write the row's insert.** Alembic's offline mode has to turn the row's times into SQL text. If SQLAlchemy can't write a `datetime` that way for Postgres, the `postgres_sql` fixture fails. If it does, pass the time through `op.inline_literal` or as ISO text. Phase 1.
11. **The layout tests refuse the obvious way to write a default or a check.** `sa.text(...)` and `CheckConstraint("...")` are both refused. Server defaults are plain strings, such as `server_default="0"`, which both databases accept for an integer column, and the check is an expression. Phase 1.
12. **Checks run in two steps through the API.** Pydantic checks each value before the route runs, and only the route can check the name and the clash against what's saved. So on a database with no company name, a body with a bad rate and no name gets the rate's message first, then the name's on the next try. The page always sends the name and checks it first, so only the API sees this. Accepted. Phase 1.
13. **End-to-end tests leak settings into each other.** The tests on one worker share a database. `settings.spec.ts` puts the sample data back before each test, and no other spec reads the settings. Each step waits for the exact thing it needs, such as the reply to the `PATCH` and the "Settings saved." message, never for the network to go quiet. Phase 3.
14. **Existing tests name the menu's items.** `menu.spec.ts` expects Sign out as the only `menuitem`, and `UserMenu.test.tsx` checks the menu's contents. Both get the new item. The keyboard test's arrow keys stay among the themes, so it shouldn't need to change. Phases 2 and 3.
15. **Unit tests take over a second.** The page test fills nine boxes. Paste values rather than typing them a key at a time, keep one rule to a test, and read the slow-test list at the end of `npm test`. Phase 2.
16. **The page doesn't fit at 1280 by 720.** The spec says the form and its button fit without scrolling. `settings.spec.ts` checks Save settings is inside the window at that size. If it isn't, tighten the spacing, and change the spec only with the owner's say. Phase 3.

## Proof

`npm run check` runs everything below apart from the by-hand checks, and fails if anything fails. The existing tests must still pass, with only the changes listed in [Files that change](#files-that-change).

The intent's success criteria:

1. `npm run check` passes: at the end of Phase 3.
2. The settings can be changed and saved, and everyone sees the same ones: `test_company_settings.py`, which reads them back as another teammate, and "a save is seen by every teammate" in `settings.spec.ts`.
3. Out-of-range values and clashing prefixes are refused with a clear message, through the page and the API: the shared cases in `test_company_settings.py` and `settings.test.ts`, `SettingsPage.test.tsx`, and the two refusal tests in `settings.spec.ts`.
4. The page shows who last changed the settings and when: `test_company_settings.py`, `SettingsPage.test.tsx` and `settings.spec.ts`.
5. A database that already exists starts with blank settings and the defaults, and the page asks for the name: the upgrade test in `test_migrations.py`, the B14 case in `SettingsPage.test.tsx`, and the owner's check on Supabase.

### Unit tests: backend (pytest)

| File | What it proves | Requirements |
|---|---|---|
| `test_company_settings.py` | A migrated database with no sample data gives B13's defaults with `updated_by` null. A good `PATCH` saves every field and replies with them, `updated_by` the signed-in teammate and `updated_at` the fixed time. Another teammate's `GET` sees the same. Every rule and message in B4, through `PATCH`: each tax rate and prefix in the shared cases, as text and, for the rates, as a number too, plus `true` and `"NaN"` for the rate. Payment terms of 0 and 365 saved, and -1, 366, 400, 30.5, `"30"` and `true` refused. Every clash pair, either way round. A bad email refused. Spaces at the ends dropped, blanks saved as null, and the address's own line breaks kept. While no name is saved, a `PATCH` without one is refused on `company_name`. Once one is saved, a `PATCH` of the rate alone works. A prefix sent alone is checked against the other one as saved. 8.875 is stored as 8875 and read back as `"8.875"`, and 8.50 comes back as `"8.5"`. A save with nothing changed leaves `updated_by` and `updated_at` alone. A body naming `updated_by` changes nothing. A second row can't be added to the table. The CRM's and the company's message keys don't overlap | B1, B3 to B9, B13, B14, U7, U10 |
| `test_migrations.py` | The existing comparisons now cover `company_settings`, its check constraint included. A `0003` database with records, upgraded, keeps every row as it was and gains one settings row with B13's defaults and no one recorded. The migrations have one head. The Postgres SQL creates `company_settings` with its server defaults, inserts its row, and turns on its row-level security, the last through the existing every-table test | B13, Data model, Security |
| `test_cli.py` | Seed over changed settings puts B12's back. Empty leaves changed settings as they were. Seed's question says the settings will be replaced | C4, B12 |
| `test_sample_data.py` | A seeded database has B12's settings, with Dana Whitfield as who last changed them on the seeding day | M3, M7, B12 |
| `test_layout.py` | At the top level, only `main.py`, `cli.py` and `migrations/env.py` name `company/` | Layout rules |
| `test_every_route.py` | The settings routes are among the routes found, so every check there reaches them: no token, a bad host, text the database can't store in each body field, a body that isn't a record | Security, U7 |

### Unit tests: frontend (Vitest)

| File | What it proves | Requirements |
|---|---|---|
| `company/settings.test.ts` | Every tax rate and prefix in the shared cases gets the same verdict and message as on the backend, and every clash pair the same answer. `toRequest` sends the rate as the typed text, unchanged apart from spaces at the ends, sends the payment terms as a number, and sends blanks as null | B4, B6, B7 |
| `company/SettingsPage.test.tsx` | The settings fill the form. "Last changed by Dana Whitfield on Nov 5, 2026" shows, and no line shows when `updated_by` is null. B14's message shows while there's no company name, and goes once one is saved. Each message beside its field when the page checks: a blank name, a rate of 150, three decimal places too many, 400 days, a bad prefix, `INV-` and `inv-`. None of those sends a request. The backend's 422 messages land beside their fields. A save sends one `PATCH` however quickly Save settings is pressed, shows "Settings saved." and updates the who line. A failed save keeps what was typed and says so. A failed read shows "Couldn't load this." and Try again, with no form. A failed refresh keeps the form with "Couldn't refresh this, so it may be out of date." A newer reply leaves a dirty form as typed, and fills a clean one. Enter in the address box adds a line rather than saving | B4, B5, B8 to B11, B14, F2, F10 |
| `components/UserMenu.test.tsx` | Company settings is in the menu, before Sign out, with the person and without, and choosing it opens `/settings` and closes the menu | N7, B2 |
| `App.test.tsx` | `/settings` opens the Company settings page inside the top bar | B2, N2 |
| `components/Shell.test.tsx` | On `/settings`, no section link is marked as current | B2 |
| `layout.test.ts` | Among the top-level files, `components/` and `lib/`, only `App.tsx` names `company/` | Layout rules |

The record pages' tests must still pass after `WhoAndWhen` is exported, and the form tests after `Field` gains its hint.

### End-to-end tests (Playwright Test)

`e2e/settings.spec.ts` puts the sample data back before each test. Like every test, each one fails on a console error it didn't expect and on any request outside the computer.

| Test | What it proves | Requirements |
|---|---|---|
| The menu opens Company settings, with no section marked as current | Choosing it from the menu opens `/settings` with the title "Company settings", the sample company's values in every box, and "Last changed by Dana Whitfield on" today. No section link is current | B2, B9, B12, N7 |
| A save is seen by every teammate | Alex Rivera changes every field, with a two-line address, a rate of 7.25 and different prefixes, and saves. The test waits for the `PATCH` reply and "Settings saved.". The line reads "Last changed by Alex Rivera on" today. After a reload the values are the same. Signed in as Dana Whitfield in a second browser context, the page shows the same values and Alex Rivera as who last changed them | B3, B8, B9, C3 |
| Out-of-range values are refused on the page | A blank name, a rate of 150, payment terms of 400 and `inv-` beside `INV-` each show their message beside the box, no `PATCH` is sent, and a reload shows the settings unchanged | B4, B5, B6 |
| The API refuses them too | `PATCH /api/settings` with a rate of 150, terms of 400, and a clashing prefix each get a 422 with B4's message on the right field, and `GET` shows the settings unchanged | B5, B6 |
| Enter saves, and the form fits at 1280 by 720 | At 1280 by 720, Save settings is inside the window without scrolling. Enter in the Phone box saves, and Enter in the Address box adds a line | Company settings page |

Changed files:

- **`e2e/menu.spec.ts`:** the item list is Company settings and Sign out. The contrast sweep covers `/settings` in both modes. (N7, L5)
- **`e2e/quality.spec.ts`:** `/settings` doesn't scroll sideways at either size and logs no console errors. Tab reaches every box and Save settings in order, each with a focus ring. (N3, Q2, Q3)

### By hand

- **The agent, on a temporary database:** the page in Chrome at 1280 by 720 and 1440 by 900, in light and dark mode. It checks the panels, the % and days after their boxes, the prefix hints, a field error, the "Settings saved." message, and the keyboard alone from the menu to Save settings. B14's message needs a database that existed before the settings, so a second temporary database is built only to revision `0003`, through `db._upgrade`, and the app then upgrades it as it would the owner's. Then it stops the server and checks the ports are free.
- **The project owner, on the shared app:** the agent never runs `npm start` or opens `.env`. If the owner chooses to, they run `npm start` against the team's Supabase database, which runs migration `0004` on it, as the next deploy would. Then they check that the Company settings page asks for the company name and shows nobody as having changed the settings (B13, B14), save the company's real details, and see them as a second teammate. On a Supabase project that still has the sample data, they run the new clearing steps from `docs/STATUS.md` and check that the records are gone and the page asks for the name again (C11). With the owner's go-ahead, the agent then uses the Supabase MCP server to confirm row-level security is on for `company_settings` and to run the security advisors, reporting only.
