# Plan: company settings

Based on `docs/changes/company-settings/intent.md` (the bar) and `docs/spec.md` with `docs/specs/company-settings.md`, `design.md`, `sign-in.md`, `running.md`, `look-and-feel.md` and `tables.md` (the product, decisions 14–18 among them). No code written yet. The intent wins over the spec and the spec wins over this plan; if the build shows the spec is wrong, fix the spec in the same change and say so in `docs/STATUS.md`.

No new dependencies. The email check is a small pattern, and the page reuses the existing form, panel, button and date helpers.

## Files that change

### What the sides agree on

- **One row.** `company_settings` holds one row with `id = 1`. Nothing else writes a second row.
- **The API.** `GET /api/settings` returns the row; `PUT /api/settings` takes the fields below and returns the saved row. Both routes are behind the existing sign-in check.
- **The fields.** `name`, `address`, `email`, `phone`, `tax_label`, `tax_rate_thousandths`, `payment_terms_days`, `quote_prefix`, `invoice_prefix`, plus `updated_by` and `updated_at` on the reply. `id` is on the reply only.
- **The rules.** The name is trimmed and must not be empty. A filled email must match `^[^@\s]+@[^@\s]+\.[^@\s]+$`. The tax rate is an integer from 0 to 100000 thousandths of a percent. Payment terms are an integer from 0 to 365. A prefix is at most 10 characters of `A–Z`, `a–z`, `0–9` and `-`, and may be blank. Optional text is trimmed; blank becomes `null`. The page and the API apply the same rules.
- **The messages.** The API refuses a bad value with a 400 and a plain string in `detail`, for example "The tax rate must be between 0 and 100." The page shows its own message in the form's error line before it calls the API.
- **Who and when.** `updated_by` is the signed-in user's email and `updated_at` is the UTC moment. Both move only when a stored value differs. The API returns `updated_at` as an ISO timestamp with an offset, and the page shows it in the reader's local time with the existing `formatDateTime`.
- **The sample.** Brightloop, 1 Brightloop Plaza, Floor 12, New York, NY 10004; hello@brightloop.example; +1 555 0100; Sales tax at 8875 thousandths; 30 days; `QT-` and `INV-`. The sample row is last changed by Priya, two days before the seed runs.
- **The page.** `/settings`, reached from the menu under your initials. The form's query key is `["settings"]`; a save puts the server's reply into that cache.

### Backend — new

- `backend/app/routes/company_settings.py` — `GET` and `PUT /api/settings`. The route reads id 1, trims and validates every field, rejects with a 400 detail, and on a change writes `updated_by` and `updated_at`. It reads `updated_at` back with UTC attached when SQLite hands back a naive value, so the reply always carries an offset.
- `backend/migrations/versions/0004_company_settings.py` — creates `company_settings` with the fields above, and on Postgres only turns on row-level security for it. No data insert: the sample row belongs to the seed.
- `backend/tests/test_company_settings.py` — a fresh seeded SQLite database per test, the local app, and a signed-in client. The API's read, save, validation, attribution and one-row behaviour.

### Backend — edited

- `backend/app/db.py` — the `company_settings` Table in the metadata; the module docstring no longer says four tables; `_unversioned_revision` returns the exact revision the tables and columns match (`0001`, `0002`, `0003` or `0004`) instead of `head`, so a database with the 0002 schema and no version table is not stamped as 0004 and made to skip the migrations it still needs; `prepare()` calls `seed.ensure_settings(target)` after seeding, so an existing database with records gets the sample row too.
- `backend/app/main.py` — include the company settings router behind the same sign-in dependency as the rest.
- `backend/app/seed.py` — one sample settings row, `ensure_settings` that inserts id 1 only when it is missing, the row in `seed()` and so in a reset, and `updated_at` as an aware UTC time.
- `backend/tests/test_migrations.py` — the exact schema includes `company_settings`; the 0001, 0002-schema-without-a-version and current-schema-without-a-version cases reach 0004 and keep their rows; the new row lands; the Postgres offline SQL creates the table and enables RLS on it.
- `backend/tests/test_seed.py` — five tables, the exact `company_settings` columns, the Brightloop values, a teammate as who last changed them, a database with records but no settings row getting one, and the idempotent counts including the settings row.
- `backend/tests/test_reset.py` — the counts include the settings row and the version is `0004` after a reset.
- `backend/tests/test_built_app.py` — `/settings` is one of the addresses that serves the built page.

### Frontend — new

- `frontend/src/pages/Settings.tsx` — the page: a query for the row, a loading and a load-error state, the last-change line, and a local `SettingsForm` with labelled fields, a save action, a saving state, a saved line and the form error line. The form is `noValidate`, so every client-side message comes from `settingsInput` and the same error line. The form is keyed by `updated_at`, so the saved reply repopulates it with the stored values. The form is local because no other page uses it.
- `frontend/src/pages/Settings.test.tsx` — the page and its form: the loaded values, the last-change line, a save payload, blanks becoming 0 or `null`, an API error shown, a rejected save, and the client-side messages.
- `frontend/src/lib/settings.ts` — `formatTaxRate` and `parseTaxRateToThousandths` with integer arithmetic, `initialSettingsForm` and `settingsInput` which trim, turn blanks into 0 or `null`, and return either a `CompanySettingsInput` or the first plain error. No float maths and no new dependency.
- `frontend/src/lib/settings.test.ts` — the parsers, the formatter, and every rule and boundary.

### Frontend — edited

- `frontend/src/api/client.ts` — `CompanySettings`, `CompanySettingsInput` and `api.settings.get` / `api.settings.save`.
- `frontend/src/api/client.extra.test.ts` — a settings GET and PUT with the right paths, methods and bodies.
- `frontend/src/components/UserMenu.tsx` — a Settings link after the email, before the theme choices; it closes the menu and goes to `/settings`.
- `frontend/src/components/UserMenu.test.tsx` — the link is there, it navigates, and the menu closes; the theme and sign-out cases still pass.
- `frontend/src/routes.tsx` — the `/settings` route inside the signed-in shell; the five section links stay as they are.
- `frontend/src/routes.test.tsx` — the `api` mock gains settings; `/settings` joins the signed-in top-bar sweep, the signed-out check and the menu route check.
- `frontend/src/routes.extra.test.tsx` — the `api` mock gains settings, so the shared mock matches the client's new surface.
- `frontend/src/styles/brand.css` — a small `.settings-panel` width, a `.settings-meta` line for the last change and `.user-menu-settings` spacing for the menu link; every value from a token, the existing `.panel`, `.record-form`, `.field`, `.btn-primary` and `.form-error`, no new color literal.

### End-to-end

- `e2e/settings.spec.ts` — new: the page from the menu, Brightloop's values and last-change line, a save that survives a reload and is seen by Priya, blank rate and terms becoming 0, a no-op save leaving the line alone, and the page and API refusing out-of-range values, an 11-character prefix, a bad email and a blank name. Reset the sample data before each test because every one changes the one row.
- `e2e/menu.spec.ts` — the menu is on every route including `/settings`, and the open menu holds Settings; `/settings` joins the theme sweep, and the existing sign-out walk still passes.
- `e2e/security.spec.ts` — `/api/settings` is in the sample of routes that refuse without a token.
- `e2e/sign-in.spec.ts` — `/settings` joins the signed-out addresses that show the sign-in screen; the settings spec opens it after choosing a teammate.

### Docs

- `docs/STATUS.md` — what lands in each phase and the final check result.
- `docs/spec.md` and its area files — only if the build shows a spec line is wrong; the spec already describes this change.
- `docs/changes/company-settings/plan.md` — only if the plan itself changes.

### Untouched

- `backend/app/records.py` — the new route imports `read_or_404`; it needs no new shared helper.
- `frontend/src/components/Field.tsx`, `frontend/src/lib/dates.ts` — reused as they are.
- `e2e/helpers.ts` — the reset, sign-in, console and outside-request guards are reused.
- `e2e/startup.spec.ts`, `e2e/screenshots.spec.ts` — no change.
- `package.json`, `pyproject.toml`, `uv.lock` — no dependency is added.

## Order of work

### Phase 1 — Schema and the sample row

1. Add the `company_settings` table to `backend/app/db.py` and fix `_unversioned_revision` to return the exact revision.
2. Add `0004_company_settings.py` with the table and, on Postgres, row-level security.
3. Add the sample row and `ensure_settings` to `backend/app/seed.py`; call it from `prepare()` after seeding; make `seed()` and a reset load the same row.
4. Update `test_migrations.py`, `test_seed.py` and `test_reset.py`; add the 0002-schema and current-schema upgrade cases.

Done when: the migration, seed and reset tests pass; a 0002-schema database without a version table keeps its records and gains the table and the sample row; a database with records but no settings row gains one; no row is ever duplicated.

### Phase 2 — The API

1. Add `backend/app/routes/company_settings.py`: read id 1, validate every field with the agreed messages, save with the two attribution fields only when a stored value differs, and return `updated_at` with an offset.
2. Include the router in `backend/app/main.py`.
3. Add `backend/tests/test_company_settings.py`; the existing route sweep picks up the new GET and PUT.
4. Add `/settings` to the built-page check.

Done when: the API tests pass, signed out the route refuses like every other, and a save by another teammate changes only who and when.

### Phase 3 — The page and the menu

1. Add the types and calls to `frontend/src/api/client.ts` and their test.
2. Add `frontend/src/lib/settings.ts` and its test: integer tax parsing and formatting, the shared rules, the first-error result.
3. Add `frontend/src/pages/Settings.tsx` with the query, the last-change line and the local form; add its test. Use the existing form, panel, button, error and date pieces, and the brand tokens.
4. Add the Settings link to `frontend/src/components/UserMenu.tsx`; add the `/settings` route; update both route test files and the menu test.
5. Run `npm run dev` and walk the page: open it from the menu, read the sample values, change them, save, reload, and check the last-change line.

Done when: the Vitest suites pass; the page opens from the menu on every signed-in page; a save updates the values and the line; the page shows the server's message when the API refuses.

### Phase 4 — Build

1. Add `e2e/settings.spec.ts` and update `e2e/menu.spec.ts`, `e2e/security.spec.ts` and `e2e/sign-in.spec.ts`.
2. Run `npm run check`.
3. Walk criteria 2–4 in the browser: open Settings, save as one teammate and see the values as another, try the out-of-range values through the page and the API, and read the last-change line. Reset the sample data afterwards.
4. Update `docs/STATUS.md` with the result and any spec correction the build needed.

Done when: `npm run check` passes, including the new backend, frontend and end-to-end tests, and the four criteria hold. ui-check, the reviewer and `docs/IMPROVE.md` come after this plan, not inside it.

## Risks

Most damaging first.

1. **A database is stamped past the new table.** `_unversioned_revision` used to return `head` for a database with the 0002 columns and no version table; with 0004 in place, `head` would mean 0004 and the new table would never be created. Mitigation: return the exact revision the tables and columns match, and test a 0002-schema database with records and no version table. Phase 1.
2. **The page and the backend drift apart.** The same rules live in two places: a tax rate of 100.001 or a prefix of 11 characters could pass one side and fail the other. Mitigation: `lib/settings.ts` and the route carry the same boundaries, and both suites test 0, 100, 365, 10 characters and the first value past each. Phase 2 and 3.
3. **The tax rate loses precision.** A float or a `Number("8.875") * 1000` path can produce 8874.999. Mitigation: integer thousandths everywhere; parse the string parts with integers; test 8.875, 0.001, 100 and 100.001. Phase 2 and 3.
4. **The last-change time is wrong by the timezone.** SQLite drops the timezone from a `DateTime`, and a naive UTC value shown as local is off by the server's offset. Mitigation: store UTC, attach UTC on read, return an ISO timestamp with an offset, and format with `formatDateTime`; assert the offset in the API test. Phase 2 and 3.
5. **An existing settings row is overwritten.** The sample row must only appear when none exists, or a real deployment would lose the team's values on a restart. Mitigation: `ensure_settings` checks for id 1 and inserts only when it is missing; a test deletes the row, runs the startup path and checks the values; another checks an existing row is left alone. Phase 1.
6. **RLS is missed on the new table.** The design says every public table refuses the Data API; the sixth table needs the same. Mitigation: enable it in 0004 on Postgres and assert it in the offline SQL test. Phase 1.
7. **The one row makes tests order-dependent.** A settings test that saves changes the only row, so the next test sees the wrong values. Mitigation: a fresh seeded database per backend settings test; reset the sample data before each end-to-end settings test. Phase 2 and 4.
8. **The new page slips past the coverage gate.** The page, the parser and the menu link are new code, and `npm run check` demands 80% on the frontend. Mitigation: the unit tests cover the loaded, saving, saved, error and validation paths; the end-to-end test walks the real page. Phase 3 and 4.
9. **The menu and route changes break the existing walk.** The theme and sign-out tests open the same menu, and the top-bar sweep renders every route. Mitigation: update both route test files and the menu spec in the same phase, and keep the five section links unchanged. Phase 3 and 4.

## Proof

`npm run check` runs everything below and fails if any of it fails. The four criteria map to the tests that prove them:

1. **`npm run check` passes.** The whole suite, including the new backend, frontend and end-to-end tests.
2. **A save is shared and survives.** `test_company_settings.py`, `Settings.test.tsx`, `settings.spec.ts` (Alex saves, reload, Priya signs in), and `test_seed.py`.
3. **Bad values are refused with a clear message.** `test_company_settings.py` and `lib/settings.test.ts` at every boundary; `settings.spec.ts` through the page and the API.
4. **The page shows who and when.** `test_company_settings.py` for the fields and the no-op save, `Settings.test.tsx` for the line, and `settings.spec.ts` for the real page.

### Unit — backend (pytest)

- `test_company_settings.py` — `GET` returns the one row and its fields; `PUT` saves trimmed values and returns them; a save by Priya sets `updated_by` and moves `updated_at`; a no-op save leaves both; a body naming a person is ignored; blank optional text becomes `null`; the name of only spaces, a bad email, a tax rate of -1, 100001 or 150000, payment terms of -1, 366 or 400, an 11-character prefix and a prefix with a space or underscore each get a 400 with a plain message; the table still holds one row.
- `test_migrations.py` — the migrated schema matches the tables exactly, `company_settings` included; a 0001 database, a 0002-schema database without a version table and a current-schema database without one each reach 0004 and keep their rows; the settings table and row are there; the Postgres SQL creates the table and enables RLS on it.
- `test_seed.py` — the five tables and the exact `company_settings` columns; a fresh database has one Brightloop row with the agreed values and Priya as who last changed it; a database with records but no settings row gets one; an existing row is not replaced; re-seeding keeps one row; the API serves the row.
- `test_reset.py` — a reset restores the sample settings row and leaves the version table at 0004.
- `test_built_app.py` — `/settings` is served the built page.
- `test_every_route.py` — no edit; its existing sweep now covers `GET` and `PUT /api/settings` in both copies.

### Unit — frontend (Vitest)

- `lib/settings.test.ts` — `formatTaxRate` for 0, 1, 100, 8875 and 100000; parsing 0, 8.875, 100, 0.001, blank, `%`, too many decimals, negative, over 100 and text; `initialSettingsForm`; `settingsInput` trims text, turns blank optional text into `null`, blank rate and terms into 0, and returns the first error for a blank name, bad email, bad tax rate, terms outside 0–365, and prefixes over 10 or outside the allowed characters.
- `pages/Settings.test.tsx` — loading; a load error; the loaded Brightloop values and the last-change line; a save with trimmed fields and the exact `CompanySettingsInput`; the saved reply repopulating the form and updating the line; blank rate and terms becoming 0 and blank text becoming `null`; a save that the API refuses showing its message; client-side validation stopping the save; the saving state.
- `api/client.extra.test.ts` — `api.settings.get` is a plain GET at `/api/settings`; `api.settings.save` is a PUT with the JSON body; the reply is typed.
- `components/UserMenu.test.tsx` — the Settings link is in the menu, goes to `/settings` and closes it; the theme choices and sign-out still behave.
- `routes.test.tsx` — signed out, `/settings` shows the sign-in screen; signed in, the page is reachable, the five section links stay, and the menu is on it.
- `routes.extra.test.tsx` — the `api` mock gains settings; the New deal action tests still pass.

### End-to-end (Playwright, `e2e/`)

- `settings.spec.ts` — open Settings from the menu and see Brightloop's values and the last-change line; change the name, address, tax rate, terms and prefixes, save, reload, and see them; sign out, sign in as Priya and see the same values with Alex as who last changed them; Priya saves and the line names her; blank tax rate and terms save as 0; a save that changes nothing leaves the line alone; the page shows a clear message for a 150% tax rate and 400-day terms, and the API returns a 400 for those, an 11-character prefix, a bad email and a blank name; no console errors.
- `menu.spec.ts` — the menu is on every route including `/settings`, and the open menu holds Settings; `/settings` joins the theme sweep, and the existing sign-out walk still passes.
- `security.spec.ts` — `/api/settings` refuses without a token, like the other routes.
- `sign-in.spec.ts` — signed out, `/settings` shows the sign-in screen; the settings spec opens it after choosing a teammate.
- The existing startup, contacts, crud, pipeline, activities, dashboard and screenshots specs still pass.
