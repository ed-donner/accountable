This project will use the following high level technical stack:

1. Node.js 26, the current LTS (24 or later works) / TypeScript for the frontend, using React and Vite, in `frontend/`
2. Python 3.12 for the backend using uv, with FastAPI, in `backend/`, with `pyproject.toml` and `uv.lock` at the repo root

The frontend gets its data from the backend's JSON API. The backend keeps the data in a local SQLite database file, using SQLAlchemy Core with no raw SQL, and fills it with the sample data when the database is new. Alembic migrations update the tables when they change, so later features don't wipe real data, and they run by themselves when the backend starts.

Prefer popular, well-supported libraries to custom code, such as for the data tables, the charts and the drag-and-drop pipeline. Don't hand-roll what a mature library does well.

For now it runs locally. Later, Supabase will provide sign-in and the database, and the app will be deployed to Render.

Commands are npm scripts in a `package.json` at the repo root, with `frontend/` as an npm workspace, so they work the same on Mac, Linux and Windows:

- `npm run dev` fetches whatever is missing on the first run, then starts the backend and the frontend together and prints the app's address
- `npm test` runs all the tests and fails if any test fails
- `npm run check` runs the formatting, lint, complexity, type and secrets checks and all the tests, and fails if any of them fail. `npm run check:quick` leaves out the end-to-end tests
- `npm run format` fixes the formatting
- A git pre-commit hook, through lefthook, formats the staged files, then runs the lint, type and secrets checks
- `npm run seed` resets the database to the sample data, after asking
- `npm run empty` empties the database, after asking

`docs/STATUS.md` says how to run the app. `README.md` is the course's own guide, so leave it as it is.

Testing will cover:

1. Unit tests for the frontend, using Vitest
2. Unit tests for the backend, using pytest
3. End-to-end tests of the whole app in a browser, in `e2e/`, using Playwright Test (`@playwright/test`) with the installed Google Chrome. They start the app themselves, so `npm test` needs nothing else running.

The tests use a database of their own, so running them never changes your data.
