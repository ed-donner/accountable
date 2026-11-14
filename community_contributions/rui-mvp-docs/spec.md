# Spec: the Accountable MVP

Requirements come from `docs/intent.md`; that document is the bar. This spec fixes the design choices intent left open.

## Concerns

1. **Google Fonts need the internet.** Brand fonts (Instrument Sans, Instrument Serif, JetBrains Mono) come from Google Fonts, but the app must work offline. Bundle the font files locally so the app needs no connection.
2. **Stage probabilities aren't specified.** Intent says each stage has a usual probability but doesn't give values. This spec sets them (see Design); change them here if they feel wrong.
3. **Position within a pipeline column.** "Stays where it was dropped" needs a stored order per deal. This spec adds a `position` field, renumbered on every drop. Refresh behaviour is covered by a test.
4. **Stage-change entries aren't activities.** Intent gives activities only three types (note, call, email), but stage changes must appear in timelines and recent activity. This spec records them as system-generated entries in the same list, read-only.
5. **Dashboard chart choice is the designer's call.** This spec picks the charts so the UI has one target; the designer can swap them as long as intent's requirements (line, bar, pipeline visual, correct figures) still hold.
6. **Cascade delete grows the confirmation.** The delete dialog lists every record and activity that will go; with sample data an organization can take a dozen rows. The dialog must scroll, not truncate.

## Requirements (summary)

- Five sections: Dashboard, Organizations, Contacts, Deals, Pipeline. Four record types: Organization, Contact, Deal, Activity.
- Every table: search box, sortable columns, add, edit, delete per row; delete confirms and cascades (org → contacts + deals; contact/deal → activities).
- Contacts filter by status (lead, qualified, customer). One activity links to exactly one contact or deal; follow-ups show on the dashboard until done.
- Pipeline: one column per stage (New, Qualified, Proposal, Negotiation, Won, Lost), drag between and within columns, add a deal directly in a column, board and column totals update live, overdue deals stand out.
- Dashboard: last-12-months won deals and revenue, open pipeline and expected revenue, funnel by stage, recent activity, upcoming/overdue follow-ups.
- Sample data on first start; one command resets to it after confirmation; all changes survive refresh and restart. Out of scope per intent (sign-in, dark mode, mobile, AI, integrations, non-USD, tags, custom stages, import/export).

## Design

### Architecture

- **Backend** (`backend/`): Python 3.12, FastAPI, SQLAlchemy Core, SQLite file. Seeds sample data when the database is new. `npm run seed` drops and recreates it, asking for confirmation first.
- **Frontend** (`frontend/`): React + Vite + TypeScript, talks to the backend JSON API.
- **Commands** (root `package.json`): `npm run dev`, `npm test`, `npm run seed`. Tests: Vitest (frontend), pytest (backend), Playwright in `e2e/` on installed Chrome; tests use their own database.

### Data model

| Table | Fields |
|---|---|
| organizations | id, name, website, industry, notes |
| contacts | id, name, email, phone, job_title, organization_id, status |
| deals | id, name, organization_id, contact_id, stage, value_cents, probability, close_date, position |
| activities | id, type (note, call, email, stage_change), contact_id?, deal_id?, description, happened_at, follow_up_date?, done |

- Exactly one of `contact_id` / `deal_id` is set; `stage_change` rows are system-generated (read-only), written automatically when a deal's stage changes, e.g. "Moved from Proposal to Negotiation".
- Stage probabilities: New 10%, Qualified 25%, Proposal 50%, Negotiation 75%, Won 100%, Lost 0%. A manual probability persists until the stage changes, then resets to the new stage's default.
- Expected revenue = value × probability, over deals not in Won/Lost.
- Money stored in cents (integers), displayed in US dollars.

### API (JSON, under `/api`)

- `/organizations`, `/contacts`, `/deals`, `/activities`: list (with `q` search, sort, status/stage filters), create, update, delete (delete returns the counts and names of cascaded records for the confirmation dialog).
- `/dashboard`: aggregated figures for the charts, pipeline totals, recent activity, follow-ups.
- `/deals/{id}/stage`: move a deal (stage + position); returns updated probability and totals.

### Frontend

- Client-side routing to the five sections plus record detail pages (organization: contacts + deals lists; contact/deal: details + timeline newest first).
- **Tables**: TanStack Table for search, sort, filters, pagination-free layout; one shared table component with add/edit modal and delete-confirm dialog.
- **Charts**: Recharts — line (revenue won per month), bar (deals won per month), funnel/pipeline visual built from stage bars.
- **Pipeline**: dnd-kit; each column keeps a `position` per card, dropped cards persist their exact slot, totals recompute from the store after each move.
- **State/data**: a small query layer (React Query) caching API responses; every mutation updates the cache so totals and lists move immediately.

### Look and feel

Follow the brand skill: Instrument Sans headings/body, Instrument Serif accent, JetBrains Mono for numbers and money. Light mode only — page background `#F0F4F5`, white rounded panels with no outline. Sea Green / Marigold / Coral for three side-by-side things (stages, chart series), Cerulean fourth, Raspberry fifth; Midnight `#073B4C` for ink. Darken Sea Green and Marigold for small text. No one-edge borders, no gradient fills. Plain, neutral business copy, no exclamation marks. Laptop/desktop layout.
