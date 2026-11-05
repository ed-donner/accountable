# Plan: products

This plan turns the products intent, and the spec already updated on this branch, into build work: which files change, in what order, what could go wrong and how we'll know it works. IDs such as G4 and K8 are the spec's requirements. The intent wins over the spec, and the spec wins over this plan. If the build shows the spec is wrong, fix the spec in the same change and say so in `docs/STATUS.md`.

The plan ends with the build. ui-check, the review and `docs/IMPROVE.md` come after it, and so does the walk on Supabase.

There's no new dependency. lucide-react 1.66 already has `Package`, `Archive` and `ArchiveRestore`, and Sonner 2.0.8 messages can carry a button through `action` (both checked in `node_modules`).

The build adds three things the spec doesn't say yet, and puts them in the spec when it adds them:

- **`backend/accountable/sample.py`**, a new top-level file. The product samples need the CRM sample data's `moment()` and its rule for which teammate added and changed each record, and `products/` can't import `crm/`. They move up, unchanged, so the CRM's sample data comes out exactly as before. It goes in the file tree in `architecture.md`.
- **`name_key` is normalized as well as casefolded:** `unicodedata.normalize("NFC", name.casefold())`. Otherwise "é" typed as one character and "é" typed as "e" plus an accent wouldn't clash. This goes in the `products` table in `backend.md`.
- **Field messages are chosen by area.** Today `main.py` hands the error handler the CRM's messages for every request. Both areas have a field called `description`, and the CRM's message for it is "Enter a description". So `main.py` picks the messages of the area whose route the request reached. This goes in the layout rules in `architecture.md`.

## Files that change

### What the parts agree on

**API, between the backend and the frontend**

- `GET /api/products` gives every product, archived ones included, as `[{id, name, description, unit_price_cents, active}]`, ordered by name.
- `POST /api/products` takes `{name, description, unit_price_cents}` and answers 201 with the product's detail. The detail is the row plus `created_at`, `created_by`, `updated_at` and `updated_by`, as the CRM's details carry them.
- `GET /api/products/{id}` gives the detail, or a 404.
- `PATCH /api/products/{id}` takes any of `name`, `description`, `unit_price_cents` and `active`, and gives the detail. `active: false` archives the product and `active: true` restores it. A save that alters nothing writes nothing (U10).
- `DELETE /api/products/{id}` gets a 405, because the path has no delete.
- A taken name gets a 422: `{"detail": "Check the form.", "fields": {"name": "A product with this name already exists"}}`. For an archived product's name, the message is "An archived product has this name. Restore it or choose another."
- `unit_price_cents` is a JSON whole number from 0 to 100,000,000,000,000. Anything else, `49.5`, `"4950"` and `true` included, gets a 422 with "Enter a price in dollars and cents, such as 49.50" beside it.
- `GET /api/search?q=` gives `{organizations, contacts, deals, products}`. The first three are exactly as today. `products` is `{count, results: [{id, name, unit_price_cents}]}`, with active products only.

**Backend, between files**

- `search.py` at the top level defines `Kind`: its name, such as `"products"`, a function that takes the name matcher and gives a select of `kind, id, name, detail, extra`, and a function that turns a row into the kind's reply result. `detail` and `extra` are text, so the union lines up on Postgres. `search.router(kinds)` builds the route. The groups in the reply come in the order of the kinds.
- `crm/search.py` gives `KINDS` for organizations, contacts and deals, using the same columns and results as today's router. `products/search.py` gives `KINDS` for products. It puts the price, cast to text, in `detail`, and its result turns it back into whole cents.
- `main.py` builds the search route from `[*crm.search.KINDS, *products.search.KINDS]`.
- `sample.py` has `moment(day, number)` and `put_down_to(number, added_at, today, every)`. These are `crm/sample_data.py`'s `moment` and `_who`, moved up as they are.
- `api.py` has `MAX_CENTS = MAX_VALUE * 100` and `Cents = Annotated[StrictInt, Field(ge=0, le=MAX_CENTS)]`.
- `products/tables.py` has `name_key(name)`, which both the router and the sample data use.

**Frontend, between files**

- `components/Search.tsx` takes `groups`, each with `kind`, `heading`, `address(id)`, `detail(result)` and an optional `chip(result)`. The box's label for screen readers and its no-matches message are made from the headings, in lower case: "organizations, contacts, deals and products".
- `crm/searchGroups.tsx` gives the CRM's three groups, and `products/searchGroups.tsx` gives Products. `App.tsx` hands the box the CRM's groups first.
- `DataTable` gains two optional props. `rowAction(row)` gives a row's second button, with a label, an icon and what it does, in place of Delete. A table gives `onDelete` or `rowAction`, never both. `hidden` describes rows that stay out of the table until a box shows them: which rows, the address setting (`archived`), the box's label, the message when every row is hidden, and the message when only hidden rows match a search. With `hidden`, the table draws the box with its count, keeps it in the address, and counts hidden matches with its own search.
- `RecordHeader` gains an optional `action`, with a label, an icon, what it does and whether it's pending, in place of Delete.
- `lib/money.ts` adds `price(cents)`, giving `$1,250.00`, `priceText(cents)`, giving `1250.00` for the form, and `parsePrice(text)`, giving whole cents or `null`.
- `Chip` gains an `archived` tone, `bg-archived text-ink`, from a new `--color-archived` token.
- The price box's form field is called `unit_price_cents`, as the API's is, so a 422 on it lands beside the box (`lib/saveErrors.ts` matches by name). The form converts the typed text to cents when it sends.
- Products' query keys are `["products"]` and `["products", id]`.

### Docs

| File | Change |
|---|---|
| `docs/spec.md`, `docs/specs/*.md` | Already updated on this branch. The build adds the three points above, and anything else it finds |
| `docs/STATUS.md` | Products added to what's done, at the end. The run instructions say the search finds products and describe the Products section. The SQL that clears the sample data in Supabase gains `products` |

### Backend: existing files

| File | Change |
|---|---|
| `backend/accountable/api.py` | `MAX_CENTS` and the `Cents` field type |
| `backend/accountable/main.py` | Adds the products router, and the search route built from both areas' kinds in place of `crm.routers.search`. Picks field messages by area: requests under `/api/products` get the products area's messages, and the rest get the CRM's |
| `backend/accountable/cli.py` | `fill_sample` fills the CRM's sample data, then the products. `_counts` and `_wipe` include `products`, so seed and empty name them and remove them (C4) |
| `backend/accountable/migrations/env.py` | Imports `products.tables` as well, so the metadata, and with it the migration tests, see the products table |
| `backend/accountable/crm/sample_data.py` | Uses `sample.moment` and `sample.put_down_to` in place of its own |
| `backend/accountable/crm/routers/search.py` | Removed. The route and its shared parts move to `search.py`, and the CRM's three kinds to `crm/search.py` |

### Backend: new files

| File | What it holds |
|---|---|
| `backend/accountable/search.py` | `Kind`, the text check, the matcher (`_holding`, moved as it is), the one union query over every kind, the order, the limit of 5, the counts, and `router(kinds)`. Reply results are typed `SerializeAsAny[BaseModel]`, so each area's result keeps its own fields |
| `backend/accountable/sample.py` | `moment` and `put_down_to`, moved from `crm/sample_data.py` |
| `backend/accountable/crm/search.py` | The CRM's three kinds, with their selects and result models moved from the old router |
| `backend/accountable/products/__init__.py` | Empty |
| `backend/accountable/products/tables.py` | The `products` table from `backend.md`, with `*who.columns()`, `TABLE_OPTIONS`, `active` defaulting to true, and a unique index `ix_products_name_key`. Also `name_key(name)` |
| `backend/accountable/products/schemas.py` | `FIELD_MESSAGES` (`name`, `unit_price_cents`, `active`), so a bad `description` gets the default "Check this field", the two messages for a taken name, `ProductCreate`, `ProductUpdate` with `MISSING` for unsent fields and `active` as `StrictBool`, `ProductRow` and `ProductDetail(ProductRow, Authorship)` |
| `backend/accountable/products/router.py` | The four routes. Adding and editing check `name_key` inside the write lock, skipping the product's own row, so a product can change the case of its own name. They also turn the unique index's refusal into the same field error, caught outside `db.writing()` because Postgres aborts the transaction (G2). An edit that changes the name sets `name_key` again |
| `backend/accountable/products/search.py` | The products kind: active products whose names hold the text, with the price as the detail |
| `backend/accountable/products/sample_data.py` | The twelve products below, dated from the seeding day, put down to the made-up teammates with `sample.put_down_to` |
| `backend/accountable/migrations/versions/0004_products.py` | Creates `products`, with its who columns, their foreign keys and indexes named as in `0003`, `sqlite_autoincrement`, and the unique index. On Postgres only, turns on row-level security for it. Adds no rows (M1). Downgrade drops the table |

### Frontend: existing files

| File | Change |
|---|---|
| `frontend/src/App.tsx` | Routes for `/products` and `/products/:id`. Hands `Search` the CRM's groups, then the products group |
| `frontend/src/styles.css` | `--color-archived` in `@theme`, Sea Mist, and in the dark block, `#3B5862` |
| `frontend/src/components/Shell.tsx` | A sixth section, Products, after Pipeline. Its icon is lucide's `Package` at 17px with a stroke width of 1.75, to match `Icon.tsx`, so `SECTIONS` holds icon elements rather than names. The date gets `whitespace-nowrap` |
| `frontend/src/components/Chip.tsx` | The `archived` tone |
| `frontend/src/components/DataTable.tsx` | `rowAction` and `hidden`, as agreed above. With neither, it behaves exactly as today |
| `frontend/src/components/RecordLayout.tsx` | `RecordHeader`'s `action` |
| `frontend/src/lib/money.ts` | `price`, `priceText` and `parsePrice`. `parsePrice` trims the text and accepts an optional `$`, dollars with or without commas in threes, and an optional point with one or two figures. It works out cents as dollars times 100 plus the cents, all whole numbers. It refuses anything else, and anything past the limit |
| `frontend/src/crm/Search.tsx` | Moves to `components/Search.tsx` |

### Frontend: new files

| File | What it holds |
|---|---|
| `frontend/src/components/Search.tsx` | The box, as today, apart from three changes: it's 180px wide, it takes its groups from props, and it makes its label and no-matches message from them. It no longer imports `crm/` |
| `frontend/src/crm/searchGroups.tsx` | Organizations with the industry, Contacts with the organization, and Deals with the organization and `StageChip` |
| `frontend/src/products/queries.ts` | The `Product`, `ProductRow` and `ProductDetail` types, `useProducts`, `useProduct`, `useSaveProduct`, and `useSetActive`, which archives or restores and shows "Product archived." with a Restore button for 10 seconds, or "Product restored." |
| `frontend/src/products/ProductForm.tsx` | Name, Description as a four-line box, and Unit price with `$` before it in JetBrains Mono. "Save product" and "Product saved." Name messages from the API land beside the name (G8) |
| `frontend/src/products/searchGroups.tsx` | The Products group, with `price()` as the detail in JetBrains Mono (K5) |
| `frontend/src/products/pages/Products.tsx` | The table (G5 to G7): Name with the Archived chip, Description cut to one line, and Unit price. `rowAction` gives Archive or Restore, and `hidden` hides archived products behind Show archived. When Archive takes a row out of the table, focus moves to the table's search box |
| `frontend/src/products/pages/Product.tsx` | The page (G11): the header with the Archived chip and Archive or Restore, the details panel with the price at 24/30, the status and the added and changed lines, and the description panel. `MissingRecord` for a bad address (G12) |

### Tests: existing files

| File | Change |
|---|---|
| `backend/tests/conftest.py` | `Make.product()` |
| `backend/tests/test_search.py` | Unchanged through Phase 1. Then gains the products tests in [Proof](#proof), and its exact-reply tests gain `products` |
| `backend/tests/test_layout.py` | Checks every area folder, `crm/` and `products/`. An area never imports another, and only `main.py`, `cli.py` and `migrations/env.py` name one. `db.py` and `search.py` import neither |
| `backend/tests/test_migrations.py` | The unique index on `products (name_key)` among the spec's indexes. On Postgres, `products.unit_price_cents` is a `bigint`. The existing row-level security and id checks pick up the new table by themselves |
| `backend/tests/test_cli.py` | `EMPTY` and the counts include products, and seed gives 12 |
| `backend/tests/test_sample_data.py` | The products line of M3, and products in the M7 and U14 checks |
| `backend/tests/limits_data.py`, `test_limits.py` | 500 products at the limits. `/api/products` is quick. The query caps cover `/api/products`, `/api/products/{product}` and `/api/search` at one query each |
| `backend/tests/test_every_route.py` | `test_the_routes_were_found` names a products route. Everything else picks up the new routes by itself |
| `frontend/src/crm/Search.test.tsx` | Moves to `components/Search.test.tsx`, given the real groups from both areas, with the new label and message |
| `frontend/src/App.test.tsx`, `main.test.tsx` | The new search label, and the two products routes |
| `frontend/src/components/Shell.test.tsx` | Six sections in order, with Products last |
| `frontend/src/components/DataTable.test.tsx` | `rowAction` and `hidden`, below |
| `frontend/src/lib/money.test.ts` | The price cases below |
| `frontend/src/layout.test.ts` | Checks every area folder, as the backend's test does |
| `e2e/helpers.ts` | `addProduct(request, name, values)` |
| `e2e/start.spec.ts` | The top bar links to the six sections |
| `e2e/quality.spec.ts` | Each `tabThrough` count goes up by one. The keyboard walk reaches the Products link, Show archived and a row's Archive button. A new test checks the top bar stays on one line at 1280px wide on Nov 30, 2026 |
| `e2e/search.spec.ts` | The Products group, its prices, archived products left out, and "See all 6 products" |
| `e2e/data.spec.ts` | `/products` in `SCREENS`. Seed brings back the sample products, empty removes them, and from an empty database the first product can be added |
| `e2e/failures.spec.ts` | The Products table and a product's page in `SCREENS`, `/products/abc` and a missing id among the addresses that lead nowhere, a failed archive, and a double click on Archive |
| `e2e/menu.spec.ts` | `/products` in `SECTIONS`. The contrast sweep, in both modes, covers Products with Show archived ticked and an archived product's page |
| `e2e/stress.spec.ts` | Products opens in under a second at the limits |

`e2e/products.spec.ts`, `backend/tests/test_products.py`, `frontend/src/products/ProductForm.test.tsx`, `products/pages/Products.test.tsx` and `products/pages/Product.test.tsx` are new.

### Sample products

Twelve products, at least 3 with cents and 2 archived, priced to fit the sample deals, which run from $6,000 to $96,000 (M3). One has two lines of description, so the page shows its line breaks. One has none, so the page shows "No description.".

| Name | Unit price | Notes |
|---|---|---|
| Standard license, per user per year | $480.00 | |
| Group-wide license, per site per year | $9,600.00 | |
| Extra user seat, per month | $49.50 | |
| Annual support plan | $3,600.00 | |
| Premium support plan | $7,800.00 | Two lines of description |
| Training day, on site | $1,250.00 | |
| Training day, remote | $850.00 | |
| Data migration, per system | $4,500.00 | |
| Setup and configuration | $2,400.00 | No description |
| Front desk kiosk | $1,149.99 | |
| Label printer | $289.95 | Archived |
| Phone system starter pack | $1,990.00 | Archived |

Each is added 60 to 300 days before the seeding day, by the teammates in turn. Every third one is last changed by the next teammate since. The two archived ones are always last changed by another teammate, because archiving is a change.

## Order of work

Four phases. Each ends with `npm run check:quick` passing, and Phase 4 ends with `npm run check`. Each new test is seen to fail once, by breaking your own copy of the code it covers and then putting your copy back, never through git. Any by-hand look at the app runs on a temporary database through `ACCOUNTABLE_DB`.

### Phase 1: search moves to the top level, with no visible change

1. Backend: write `search.py` and `crm/search.py` from the old router, point `main.py` at them, and remove `crm/routers/search.py`. Add `/api/search` to the query caps in `test_limits.py`.
2. Backend: move `moment` and `_who` into `sample.py`.
3. Frontend: move the box to `components/Search.tsx`, write `crm/searchGroups.tsx`, and hand the groups over in `App.tsx`. Move `Search.test.tsx` with no change to what it expects.
4. `test_layout.py` checks that `search.py` never imports `crm/`.

Done when `npm run check:quick` passes and no existing test changed what it expects. `test_search.py`, `test_sample_data.py` and the moved `Search.test.tsx` are the proof that nothing moved.

### Phase 2: products on the backend

1. `api.Cents`, `products/tables.py`, migration `0004` and `env.py`, with the `test_migrations.py` changes.
2. `products/schemas.py` and `products/router.py`, the router and the messages by area in `main.py`, `Make.product()`, and `test_products.py`.
3. `products/search.py`, its kind in `main.py`, and the products tests in `test_search.py`.
4. `products/sample_data.py` and `cli.py`, with `test_sample_data.py` and `test_cli.py`.
5. `limits_data.py` and `test_limits.py`.
6. `test_layout.py` for both areas, and `test_every_route.py`.

Done when `npm run check:quick` passes.

### Phase 3: products on the frontend

1. `price`, `priceText` and `parsePrice` in `lib/money.ts`, with their tests.
2. The archived color token and the `archived` chip tone.
3. `rowAction` and `hidden` in `DataTable`, and `action` in `RecordHeader`, with their tests. The CRM's pages and their tests stay as they are.
4. `products/queries.ts`, `ProductForm.tsx`, both pages, and `searchGroups.tsx`, with their tests. Add the routes and the group in `App.tsx`.
5. The sixth section, the 180px box and the date that doesn't wrap, with the Shell, App and main tests. Then `layout.test.ts` for both areas.

Done when `npm run check:quick` passes.

### Phase 4: end to end, and finish

1. `addProduct` in `e2e/helpers.ts`, then `e2e/products.spec.ts`.
2. The changes to the other end-to-end specs listed above.
3. The three spec additions at the top of this plan, and anything else the build found, in the spec files. Then `docs/STATUS.md`, including the run instructions and the SQL that clears the sample data in Supabase.
4. Run `npm run check` until it passes, and read its list of unit tests that took a second or more.

That's the end of this plan. ui-check, the review and `docs/IMPROVE.md` follow.

## Risks

Most damaging first.

1. **The owner's records, or the team's.** Migration `0004` runs on whatever database the app starts on, and nothing takes it back. `data/accountable.db` holds the owner's records. No agent starts the app on it, or seeds, empties or opens it. The tests use their own databases, and any by-hand look uses `ACCOUNTABLE_DB`. The team's database on Supabase gets `0004` at the first start after the merge. That migration only adds a table, but the row-level security check at start stops the shared app if the table missed it, which would be an outage. The offline Postgres SQL test checks the statement is there and that the price is a `bigint`, before anything reaches Supabase. Phases 2 and 4.
2. **Moving search changes it.** The reply for the three CRM kinds has to stay byte for byte the same, still in one query (K8), and still agreeing between SQLite and Postgres. Phase 1 moves the code with `test_search.py` unchanged, which compares whole replies, and adds a one-query cap. Postgres refuses a union whose columns differ in type, so every kind fills `detail` and `extra` as text. The products kind casts its price to text and turns it back into cents. Pydantic would serialize an area's result typed as plain `BaseModel` as `{}`, so the results are typed `SerializeAsAny`, and the exact-reply tests catch it if that's wrong. Phases 1 and 2.
3. **A price drifts by a cent.** In floating point, `0.29 * 100` is `28.999999999999996` and `1.10 * 100` is `110.00000000000001`. `parsePrice` never multiplies a decimal: it reads the dollars and the cents as two whole numbers. The backend accepts only `StrictInt`, so `49.5` and `"4950"` are refused, not rounded, and so is `true`, which Python counts as a whole number. `price()` uses whole-number division and the remainder. The largest price, 100,000,000,000,000 cents, is well under the 2^53 the browser holds exactly. Phases 2 and 3.
4. **Two products end up with one name.** The ways it could happen: case rules that differ between the databases, two forms of an accented letter, two saves at once, and an archived product being forgotten. `name_key` is worked out in Python, normalized and casefolded, so both databases agree. The check runs inside the write lock, and the unique index backs it up. On Postgres, the index's refusal aborts the transaction, so the router catches it outside `db.writing()`. A test removes the check to reach the index, and expects a 422, not a 500. The archived message needs to know which product holds the name, so the check reads that row's `active`. Phase 2.
5. **The top bar wraps.** Measured at 1280px: 75px to spare, and a Products link takes 108px. At 240px the box made the date wrap. At 180px there's about 17px to spare with a 12-character date. A font or label change could take that away, so `quality.spec.ts` sets the browser's clock to Nov 30, 2026, opens the app at 1280 by 720, and checks the bar is 56px tall and the date is on one line. Phase 3.
6. **One area's messages show on another's fields.** Both areas have `name` and `description`, and the CRM's "Enter a description" is wrong for an optional product description. `main.py` picks the messages by area, and `test_products.py` sends a bad `description` and expects the products area's message. Phase 2.
7. **The shared table and header change under the CRM.** `DataTable` and `RecordHeader` serve every CRM table and page. The new props are optional, and with neither given, both behave exactly as today. Their existing tests, and the CRM page tests, pass unchanged. Phase 3.
8. **Focus, and a message that goes away.** Archive takes its row out of the table when archived products are hidden, which would leave focus on nothing (Q3). Focus moves to the table's search box. The message's Restore button goes when the message does, which may be too soon for someone using the keyboard. Sonner pauses a message while the pointer is over it, and its hotkey, Alt+T, moves focus to the messages and pauses them, but reaching the button with Tab alone doesn't pause it (checked in Sonner's source). So the archived message stays for 10 seconds rather than Sonner's usual 4. Restore is always on the row behind Show archived and on the product's page too, so nothing is lost if the button goes. Phase 3.
9. **Tests that count Tab stops, name five sections or quote the search label.** `quality.spec.ts`, `start.spec.ts`, `menu.spec.ts`, `Shell.test.tsx`, `App.test.tsx` and `main.test.tsx` all do. Each is listed above, and each keeps every check it makes today. Phases 3 and 4.
10. **Unit tests over a second.** `DataTable.test.tsx`'s sort test already took 1.4 seconds in the last full check, under the load of every layer at once. The products table tests use a handful of rows, and only paging tests make more than 50. Seeding the sample data six times in `test_sample_data.py` now adds the products too, which is a few milliseconds. Read the slow list at the end of each `npm test`. All phases.
11. **An area reaches into another.** The products code needs things that live in `crm/` today: the sample data's time helper and its who rule. Both move to `sample.py` first. Everything else the products pages need is already in `components/` and `lib/`. The layout tests, for both areas on both sides, fail on any import across. Phases 1 to 3.
12. **Spec claims that no test tries.** The spec now says `DELETE /products/{id}` gets a 405, two saves at once can't both get through, the date never wraps at 1280px, and search stays one query. Each has a test below. The review checks for claims like these. All phases.

## Proof

`npm run check` runs everything below and fails if anything fails. The existing tests must still pass, with only the changes listed under [Tests: existing files](#tests-existing-files).

The intent's success criteria:

1. `npm run check` passes, at the end of Phase 4.
2. A product can be added, edited, found with the search box, archived and restored: `e2e/products.spec.ts`, the first test below, with `test_products.py`, `test_search.py`, `Products.test.tsx` and `Product.test.tsx` beneath it.
3. Prices show in dollars and cents everywhere they appear: `money.test.ts`, then the table, page, form and search result in their unit tests, and all four in `e2e/products.spec.ts`.
4. Two products can't share a name, whatever the case, through the page or the API: `test_products.py` through the API, `ProductForm.test.tsx` and `e2e/products.spec.ts` through the page.
5. The sample data has products, and `npm run empty` clears them: `test_sample_data.py`, `test_cli.py` and `e2e/data.spec.ts`.

### Unit tests: backend (pytest)

| File | What it proves | Requirements |
|---|---|---|
| `test_products.py` (new) | Add, edit, archive and restore through the API, each giving the detail with who added and last changed it. Archiving and restoring count as changes, and a save with nothing altered writes nothing. The list holds archived products, each with `active`. A missing id is a 404. `DELETE` is a 405 and leaves the product. A body naming someone changes nothing | G1, G9, G10, G12, U10 |
| `test_products.py` | Names: "PRO LICENSE" is refused beside "Pro license", "ÉMILE" beside "émile", and "é" as two characters beside "é" as one. A name held by an archived product gets the archived message. Spaces at the ends are dropped before the check. A product can change the case of its own name. With the router's check taken out, the unique index still refuses the second one, and the reply is the same 422, not a 500 | G2, G8 |
| `test_products.py` | Prices: 0 and 100,000,000,000,000 are accepted. -1, one past the limit, `49.5`, `"4950"`, `true` and `null` are refused with the price message. A bad `description` gets the products area's message, not the CRM's | G3, F2 |
| `test_search.py` | Unchanged through Phase 1. Then: products are found by part of their name in any case, with their price in whole cents. Archived products are left out of the results and the count. Products come fourth. Their descriptions aren't searched. The limit of 5 and the count hold for products as for the others | K1, K4, K5, G10 |
| `test_migrations.py` | The migrations build the products table as `products/tables.py` declares it, with the unique index on `name_key` and ids that are never reused. On Postgres, written out offline, `unit_price_cents` is a `bigint` and row-level security is on for `products` | Data model, Security |
| `test_sample_data.py` | Twelve products on every seeding day, at least 3 with cents and 2 archived, all with unique names. Each was added by a teammate, the archived ones last changed by another, and nothing is dated after today. The same content each time | M2, M3, M7, U14 |
| `test_cli.py` | Seed and empty name the products in what will be lost. Seed gives 12 products, and empty leaves none, along with every other record | C4 |
| `test_limits.py` | 500 products at the limits. `/api/products` answers within the list limit. `/api/products`, `/api/products/{id}` and `/api/search` each make one query | Q1, K8 |
| `test_layout.py` | `crm/` and `products/` never import each other. Only `main.py`, `cli.py` and `migrations/env.py` name either. `db.py` and `search.py` name neither | Layout rules |
| `test_every_route.py` | Picks up the four products routes by itself, so each refuses anyone not signed in, refuses ids that can't be records and unstorable text in every field, and gives nothing away to another origin | Security, U7 |

### Unit tests: frontend (Vitest)

| File | What it proves | Requirements |
|---|---|---|
| `lib/money.test.ts` | `price` gives `$0.00`, `$0.07`, `$49.50`, `$1,250.00` and `$1,000,000,000,000.00`. `parsePrice` gives the same cents for `49.50`, `49.5`, `$49.50` and ` 49.50 `, gives 125000 for `1,250` and `$1,250.00`, 29 for `0.29`, 110 for `1.10` and 50 for `.5`. It refuses `49.505`, `-1`, `12a`, `1,25`, an empty box, and one cent past the limit. Round trips from `priceText` give back the same cents | G3, G4 |
| `components/DataTable.test.tsx` | A `rowAction` replaces Delete, labeled with the row's name. With `hidden`: hidden rows stay out until the box is ticked, the box shows their count, and its setting stays in the address. Ticked, they sort among the rest. Every row hidden gives the every-hidden message with a button that ticks the box. A search that matches only hidden rows says how many, with the same button. Clearing the search leaves the box as it was | G5 to G7, T4, T7 |
| `products/ProductForm.test.tsx` | Add and Edit fill and send the right fields, with the price in whole cents, and Edit shows `1250.00`. A bad price is stopped before sending, with the message beside the box. A taken name from the API shows beside the name, in both forms. Save sends once however quickly it's pressed. A failed save keeps what was typed | G4, G8, F2, F10 |
| `products/pages/Products.test.tsx` | Columns, prices with cents, the description on one line, and the default sort by name. Archived products are hidden until Show archived is ticked, then show the chip and Restore. Archive sends `active: false` once however quickly it's pressed, shows the message with Restore, and moves focus to the search box. Restore on the message sends `active: true`. The empty states, a failed read, and Try again | G5 to G7, G9, G10, N6 |
| `products/pages/Product.test.tsx` | The name, the price at the headline size with its cents, the status, the description with its line breaks or "No description.", and who added and last changed it. An archived product shows the chip and Restore. Archiving stays on the page. `/products/abc` and a missing id say "This product no longer exists" | G3, G11, G12, R6, N4 |
| `components/Search.test.tsx` | Everything it proves today, with the new label and message. Plus: the Products group comes fourth, each result's price shows with its cents in JetBrains Mono, and "See all 6 products" opens Products with the same search | K4, K5, K7, G3 |
| `components/Shell.test.tsx` | Six sections in order, Products last with its icon, and the date set not to wrap | N1 |
| `App.test.tsx`, `main.test.tsx` | `/products` and `/products/:id` open their pages, and the search box has its new label | N2, K1 |
| `layout.test.ts` | Only `App.tsx` names `crm/` or `products/`, and neither area names the other | Layout rules |
| `colors.test.ts` | Unchanged, and it now covers `--color-archived`: the dark block can't set a token `@theme` lacks, and no other file names its value | Color tokens |

### End-to-end tests (Playwright Test)

Every test fails on any console error it didn't name in advance, and on any request outside the computer, which covers Q2 and C2 on the new screens.

| Test | What it proves | Requirements |
|---|---|---|
| `products.spec.ts`: a product can be added, edited, found, archived and restored | Add "Rooftop survey" at `1,250.5` from the Products page, and it shows as `$1,250.50` in the table, on its page and in the edit form as `1250.50`. Edit its price. Find it with the top bar's search, with its price beside it, and open it. Archive it from its page, and it's gone from the search and the table. Tick Show archived, Restore it from its row, and it's back in the search | Success criterion 2, G3, G6, G9, G11, K1 |
| `products.spec.ts`: a name can't be used twice | Adding "ROOFTOP SURVEY" beside "Rooftop survey" shows the message beside the name, and so does a name an archived product has, with its own message. The same through the API gives the 422. Renaming a product to its own name in capitals saves | Success criterion 4, G2, G8 |
| `products.spec.ts`: the Restore on the message undoes an archive | Archive from a row, press Restore on the message, and the row is back, with focus having moved to the search box after the archive | G9, Q3 |
| `products.spec.ts`: the table keeps its view | Search, sort, page and Show archived survive opening a product and coming back (T4). The empty states in G7 show for every product archived, and for a search only archived products match | G5 to G7 |
| `products.spec.ts`: who added and changed | A product added as one teammate and archived as another shows both lines on its page | G12, R6 |
| `search.spec.ts` | The Products group, fourth, with prices. Archived products are left out. "See all 6 products" opens the table with the same search | K1, K4, K5 |
| `data.spec.ts` | After seed, Products has the sample products, with 2 hidden behind Show archived. After empty, Products invites the first product, and the first one can be added | Success criterion 5, M3, C4, C5 |
| `start.spec.ts` | The top bar links to six sections, Products among them, and each one's link shows as current | N1 |
| `quality.spec.ts` | Tab reaches the Products link, Show archived and a row's Archive button, each with a focus ring. At 1280 by 720, with the browser's clock on Nov 30, 2026, the top bar is one line and the date doesn't wrap | Q3, N1, N3 |
| `failures.spec.ts` | A failed read on the Products table and a product's page says so and offers Try again, keeping what was showing. `/products/abc` and a missing id say the product no longer exists. A failed archive says so and leaves the product. A double click on Archive archives once, with no error | N4, N6, G9, F10 |
| `menu.spec.ts` | The theme holds on Products. The contrast sweep passes in both modes on Products with Show archived ticked, so the Archived chip is checked, and on an archived product's page | L1, L5 |
| `stress.spec.ts` | Products opens in under a second with 500 products | Q1 |
