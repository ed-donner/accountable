# Plan: products

Based on `docs/changes/products/intent.md` (the bar) and `docs/spec.md` with `docs/specs/products.md` (the product). This plan stops at the build; ui-check, the review and `docs/IMPROVE.md` come later. No code written yet.

Working rule: one `active` flag is the archive state; the API owns the name rule; the Products page is a table, not a detail page. No new dependencies.

## Files that change

**New — backend**

- `backend/app/routes/products.py` — `ProductIn` (name, description, `price_cents`), list (`q` over name and description, sort, order, `include_archived`), create, update, archive and restore; no delete route. Names are trimmed and blank names rejected; prices are whole cents from zero up to what the integer column stores; uniqueness is compared casefolded in Python across active and archived products. Uses `read_or_404`, `stamp_created` and `stamp_updated`.
- `backend/migrations/versions/0003_products.py` — creates `products` (`id`, `name`, `description`, `price_cents`, `active`, `created_by`, `updated_by`) and enables row-level security on Postgres. Down revision `0002`.
- `backend/tests/test_products.py` — create, list, update, archive and restore; default active-only list and `include_archived`; `q` and sort; price validation; blank name; case and whitespace duplicates; archived names; updating an archived product keeps it archived; no delete route.

**Edited — backend**

- `backend/app/db.py` — the `products` Table (`description` as Text, `price_cents` non-null, `active` Boolean non-null, attribution columns); the module docstring no longer says four tables.
- `backend/app/main.py` — include the products router behind the sign-in guard.
- `backend/app/routes/search.py` — add `product` to `Kind` and `TABLES`; return active products only, leaving archived ones out.
- `backend/app/seed.py` — a dozen products, ten active and two archived: Starter license, Team license, Priority support, Annual support plan, Onsite training day, Remote training day, Implementation package, Data migration, Custom report and API access, plus archived Legacy add-on and Pilot license. `Priority support` is `$149.50` so the cents path appears in sample data; `Onsite training day` is `$1,200.00`. Insert through `insert_sample` so every row carries attribution.
- `backend/tests/test_search.py` — four kinds in name order; a product is found; an archived product is not; existing expected lists updated.
- `backend/tests/test_seed.py` — five record tables; the product columns; twelve products, ten active and two archived; at least one price with cents; attribution covers products; the API serves products.
- `backend/tests/test_migrations.py` — products in `RECORD_TABLES`; the pre-change database upgrades to `0003` and keeps its rows; Postgres offline SQL creates the table and enables row-level security.
- `backend/tests/test_reset.py` — products in the counts and dirtied data; the reset leaves version `0003` and the schema agreeing.
- `backend/tests/test_who.py` — product attribution on add, edit, archive, restore and a save that changes nothing; product replies carry both emails. Each test uses its own product name, since the shared sample database now seeds products.

**New — frontend**

- `frontend/src/pages/Products.tsx` — the Products page: active products by default, `include_archived=true` when Show archived is checked; columns Name, Description, Unit price, Status, Added by and Last changed by; prices always with cents through `formatUsdWithCents`; no View or Delete. Add and edit use the form; Archive and Restore are row actions with no confirmation; failures show an inline message.
- `frontend/src/pages/Products.test.tsx` — the page's unit proof: sample rows, prices (`$49.00`, `$149.50`, `$1,200.00`), badges, Show archived, search, add, edit, archive, restore, duplicate message, empty and error states, `?q=` initial search, and the same link followed twice.
- `frontend/src/components/ProductForm.tsx` — modal form with Name, Description and Unit price (USD); pre-fills on edit; uses `parseUsdToCents` and shows the API's message; no active checkbox, because new products start active and archive/restore owns the state.

**Edited — frontend**

- `frontend/src/api/client.ts` — `Product` and `ProductInput`; `SearchKind` gains `product`; `api.products.list(includeArchived)`, `create`, `update`, `archive`, `restore`; the `post` helper's body becomes optional so archive and restore send no payload.
- `frontend/src/api/client.extra.test.ts` — the five product requests, including the `include_archived=true` query, and a product search result.
- `frontend/src/lib/money.ts` — `formatUsdWithCents`, the two-decimal price formatter the Products spec asks for; `formatUsd` keeps its whole-dollar style elsewhere.
- `frontend/src/routes.tsx` — Products in the navigation and a `/products` route; six sections.
- `frontend/src/components/DataTable.tsx` — four optional props: `initialQuery` for the top-bar product link, `initialQueryKey` so the same query re-applies when its link is followed again, `toolbar` for Show archived, and `rowAction` for Archive/Restore. Existing props and four tables keep their behaviour.
- `frontend/src/components/DataTable.test.tsx` — the new optional props and their defaults; the existing suite unchanged.
- `frontend/src/components/SearchBox.tsx` — Products group and label; a product result goes to `/products?q=<encoded name>` instead of `/{kind}s/{id}`.
- `frontend/src/components/SearchBox.test.tsx` — product group, product click and Enter, and the location probe now includes the query string.
- `frontend/src/routes.test.tsx` — the six section links include Products; `/products` is in the top-bar pages.
- `frontend/src/routes.extra.test.tsx` — the mocked API gains products; the Products route renders its heading.
- `frontend/src/styles/brand.css` — `.badge-active` from `--tint-sea-green` and `.badge-archived` from `--color-page` with `--color-ink`; a small toolbar label for the checkbox; tighter table cell padding below 1180px so the wider prices still fit a 1024px laptop. No new color tokens, and `colors.test.ts` gains a check for every badge in both modes.

**New — end-to-end**

- `e2e/products.spec.ts` — sample data and Show archived; add, edit, search, archive and restore with a refresh; prices; attribution; duplicate names through the page and the API, including an archived name; `npm run seed` restores the products; no console errors.

**Edited — end-to-end**

- `e2e/startup.spec.ts` — Products in the sections list; ten active rows on `/products`; the API serves products.
- `e2e/search.spec.ts` — a top-bar product match opens `/products` with the query filled; an archived product has no match.
- `e2e/menu.spec.ts` — `/products` in the section list; the panel follows light and dark like the other sections.
- `e2e/security.spec.ts` — `/api/products` in the no-token sample.

**Edited — docs**

- `docs/spec.md` and the area files in `docs/specs/` — the spec describes the change first: `products.md` is new, and `spec.md`, `design.md`, `tables.md`, `sign-in.md` and `running.md` gain products, with `look-and-feel.md` decision 18 added after the review.
- `docs/STATUS.md` — after the build, with the exact counts and coverage from the run output, not from memory.
- `README.md` — Products in the feature list and products in the top-bar search line; keep it short.
- `docs/changes/products/plan.md` — this file, if the plan changes.

**Untouched**

`package.json` and `frontend/package.json` stay as they are: no new dependencies. `backend/app/records.py`, `backend/migrations/env.py`, `scripts/e2e.mjs`, `playwright.config.ts`, `render.yaml` and `e2e/screenshots.spec.ts` need no edits. `docs/IMPROVE.md` comes after this plan.

## Order of work

### Phase 1 — Backend record and API

Add the `products` table to `db.py`, migration `0003` and `app/routes/products.py`, and include the router. The list is active-only by default; `include_archived=true` returns both. Create starts a product active. Update keeps its active state. Archive and restore set it through `stamp_updated`, so the last-changed email moves only when the state actually changes. The name rule runs on create and update: trim, reject blank, compare `casefold()` against every product, archived included. The price is whole cents, zero or more and no larger than the integer column stores. No delete route.

Tests: `test_products.py` on its own empty SQLite database, the product cases in `test_who.py`, and the schema half of `test_migrations.py`.

Done when: `/api/products` lists, creates, updates, archives and restores; duplicate names are refused through the API; `DELETE` is a 405; the migration builds the table and RLS; the focused backend tests are green.

### Phase 2 — Sample data and search

Seed the twelve products, ten active and two archived, with the cents and whole-dollar examples. Add products to `search.py` as active-only matches. Update the existing search, seed, reset and migration expectations for the new table and the fourth search kind.

Done when: a fresh database and `npm run seed` both show twelve products, ten active; the top-bar search finds an active product and leaves an archived one out; `test_seed.py`, `test_search.py`, `test_reset.py` and `test_migrations.py` are green.

### Phase 3 — Frontend table and form

Add the client types and calls, then the Products route and navigation. Extend `DataTable` with the optional `initialQuery`, `initialQueryKey`, `toolbar` and `rowAction` props, keeping the four existing tables unchanged. Build `ProductForm` and the Products page: active-only default, Show archived, six columns, prices through `formatUsdWithCents` in the shared mono style, status badges, the API's duplicate message in the form, and archive/restore without a dialog. Special-case the top-bar product path so it lands on `/products?q=` and the table's search box takes that query, including when the same product is chosen twice.

Tests: `Products.test.tsx`, the new cases in `DataTable.test.tsx`, `SearchBox.test.tsx`, `client.extra.test.ts`, and the route tests.

Done when: a product can be added, edited, searched, archived and restored in the browser; prices and attribution show; the Products page has no detail page and no Delete; the focused frontend tests are green.

### Phase 4 — End-to-end

Write `products.spec.ts` and update `startup`, `search`, `menu` and `security` for the new section, query path and API route. Every test signs in through the local teammate screen, resets its own sample data, and watches the console.

Done when: the products intent criteria hold in a real browser, the existing e2e suite still passes, and no console errors appear.

### Phase 5 — Build

Run `npm run check` and fix every gate: Prettier, ESLint, ruff, complexity, `tsc`, `ty`, gitleaks and `npm test` with coverage. Reseed the local sample database with `npm run seed` and make one pass through `/products`, because the migration creates an empty table on an existing database. Update `README.md` and `docs/STATUS.md` with the exact run results.

Done when: `npm run check` exits 0, the local sample database shows ten active and two archived products, and the status record is current. This is where the plan stops; ui-check, the review and `docs/IMPROVE.md` follow.

## Risks

1. **Existing databases get an empty Products table.** The migration creates the table but does not invent rows, and `prepare()` only seeds a database with no organizations. A local or Supabase database that already has data shows no products until `npm run seed` wipes and reloads it. The build reseeds the local sample database; if existing data must survive with products, that is a separate backfill decision.
2. **Name uniqueness across two databases and archived rows.** A database unique index would behave differently on SQLite and Postgres, and a plain `lower()` index would miss casefold details. Keep one Python helper that trims and casefolds, use it on create and update, and test cases, whitespace, archived names and direct API calls.
3. **No detail page breaks the top-bar path assumption.** `SearchBox` currently turns every match into `/{kind}s/{id}`. Product matches must go to `/products?q=`, and the table must take an initial search without remounting or losing the Show archived state. Cover navigation from another page, navigation while already on `/products`, and choosing the same product twice after editing the table's box.
4. **The shared table changes.** `DataTable`'s action column and toolbar serve four existing areas. The new props must be optional and default to today's behaviour, and the existing table tests must stay green. Products must show Archive/Restore and never Delete.
5. **Money display can be read two ways.** `formatUsd` omits cents for whole dollars, so a `$1,200` product would show `$1,200` while `$149.50` shows its cents. The spec and intent say prices show in dollars and cents everywhere, so the page and the form use `formatUsdWithCents`, which always shows two decimals; the shared helper keeps its whole-dollar style for deals and dashboard totals.
6. **Unit tests can outgrow the one-second cap.** Use the existing empty temp SQLite pattern with fsync off for API tests, in-memory engines for migration tests, and small frontend fixtures. Do not run `npm run seed` or the migration chain inside an ordinary unit test.

## Proof

### Unit — backend (pytest, `backend/tests/`)

- `test_products.py` — create, read, update and list; `active` starts true; `description` may be null; prices are cents; active-only default and `include_archived=true`; `q` matches name and description; sort by name and price; blank names and prices outside the column's range refused; `PRIORITY SUPPORT` and whitespace variants of an existing name refused on create and update; an archived name stays reserved; updating an archived product keeps it archived; `DELETE` is 405. Runs on its own empty database, like `test_crud.py`.
- `test_who.py` — a product added by Alex carries both emails; Priya's edit sets only the last-changed one; a no-op save leaves it; archive and restore move it; the product reply carries both emails.
- `test_search.py` — a product joins the four kinds in name order; `zzy` finds it; an archived product is absent; the existing case, accent and `%`/`_` tests still pass.
- `test_seed.py` — five tables; product columns; twelve products, ten active and two archived; at least one price with cents; every product attributed to a teammate; the API serves products; reseeding is idempotent.
- `test_migrations.py` — migrated and metadata schemas match for products; a pre-change database upgrades to `0003`, keeps its rows and gains an empty products table; Postgres offline SQL creates products and enables RLS.
- `test_reset.py` — reset rebuilds the products and leaves version `0003` and the schema agreeing.
- `test_every_route.py` — automatically picks up the new product routes and proves each refuses without a signature; no edit expected.

### Unit — frontend (Vitest, `frontend/src/**/*.test.ts(x)`)

- `pages/Products.test.tsx` — active rows only by default; Show archived adds the archived rows with badges; the six columns and their dashes; `$49.00`, `$149.50` and `$1,200.00`; search by name and description; Add sends trimmed name, null description and parsed cents; Edit pre-fills and saves; an archived row shows Edit and Restore, and editing it keeps it archived; an invalid price keeps the form open with a message; a duplicate API message is shown; Archive and Restore call the API and the row changes or disappears; a failed action leaves the row and shows a message; loading, error and empty states; `?q=` fills the table search; the same link followed twice re-applies it.
- `components/DataTable.test.tsx` — an optional row action gets the right row and shows Archive or Restore; an optional toolbar renders; an initial query filters on first paint and re-applies when its key changes; the existing search, sort, filter and delete tests stay green.
- `lib/money.test.ts` — `formatUsdWithCents` always shows two decimals and round-trips with `parseUsdToCents`.
- `components/SearchBox.test.tsx` — the Products group appears; clicking or pressing Enter on a product goes to `/products?q=<encoded name>` and clears the box; the existing organization, contact and deal paths are unchanged.
- `api/client.extra.test.ts` — `list()` calls `/api/products`, `list(true)` adds `include_archived=true`, and create, update, archive and restore use the right methods and paths; a product is a valid search result.
- `routes.test.tsx`, `routes.extra.test.tsx` — six section links including Products; `/products` renders the Products heading; the top bar is present on the new page.
- `lib/colors.test.ts` — every badge's text holds 4.5:1 on its fill in both modes, and the one-place rule still holds.

### End-to-end (Playwright, `e2e/`)

- `products.spec.ts` — `/products` shows ten active rows with Active badges, `Starter license` at `$49.00`, `Priority support` at `$149.50`, `Onsite training day` at `$1,200.00`, and Added by / Last changed by; Show archived makes twelve and shows two Archived badges; no Delete. Add `Workshop day` at `1,250.50`, edit it, search for it, archive it (it leaves the active list), Show archived, edit the archived row and see it stay archived, restore it, reload and see it persist. A second teammate edits through the API and the table credits both emails; the sample attribution check pins two differing teammate emails, not the teammates' names. Adding `PRIORITY SUPPORT` through the form shows the API's duplicate message; the same name through the API is refused; `Legacy add-on` is refused because the archived name is reserved. `npm run seed` brings back the ten active and two archived products. No console errors.
- `search.spec.ts` — typing `priority` in the top bar offers `Priority support` under Products; choosing it opens `/products` with the query and the row shown. `legacy` offers no product match. The existing organization, contact and deal search and the per-table search still pass.
- `startup.spec.ts` — Products is a section and its table has ten rows; `/api/products` answers.
- `menu.spec.ts` — Products is in the section list and its panel follows light and dark.
- `security.spec.ts` — `/api/products` refuses without a token and answers when signed in.

### Intent criteria

1. `npm run check` passes — the Build phase.
2. Add, edit, search, archive and restore — `Products.test.tsx` and `products.spec.ts`.
3. Prices show in dollars and cents — `Products.test.tsx`, `test_seed.py` and `products.spec.ts`.
4. Two products cannot share a name through the page or the API, archived included — `test_products.py` and `products.spec.ts`.
5. The sample data has products and `npm run seed` brings them back — `test_seed.py`, `test_reset.py` and `products.spec.ts`.

## Review follow-up

The review of this branch found six findings; all are fixed here.

- **Prices show cents.** The Products table and the edit form use `formatUsdWithCents`, so whole-dollar prices read `$49.00` and `$1,200.00`; `Products.test.tsx`, `money.test.ts` and `products.spec.ts` assert it. Below 1180px the table cells tighten, so the wider prices still fit a 1024px laptop without scrolling the page sideways.
- **The same product twice re-applies its search.** `DataTable` takes an `initialQueryKey` and the Products page passes the router's `location.key`, so a second click on the same top-bar match fills the table's box again.
- **The Archived badge meets AA in light mode.** It uses `--color-ink` on `--color-page`, and `colors.test.ts` resolves every badge rule and checks the 4.5:1 ratio in both modes.
- **The list `q` ignores case on both databases.** `products.py` uses `ilike`, not `like`, which is case-sensitive on Postgres.
- **The sample attribution test is no longer pinned to row order.** It checks that the two cells hold different teammate emails instead of naming the teammates.
- **The 1180px top-bar rule has a home.** `look-and-feel.md` decision 18 records it.
