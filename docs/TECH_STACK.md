This project will use the following high level technical stack:

1. Node.js 26, the current LTS (24 or later works) / TypeScript for the frontend, using React and Vite, in `frontend/`
2. Python 3.12 for the backend using uv, with FastAPI, in `backend/`, with `pyproject.toml` and `uv.lock` at the repo root

The frontend gets its data from the backend's JSON API. The backend uses SQLAlchemy Core with no raw SQL, apart from turning on row-level security in Postgres-only migrations, and fills a new database with the sample data. Alembic migrations update the tables when they change, so later features don't wipe real data, and they run by themselves when the backend starts.

Prefer popular, well-supported libraries to custom code, such as for the data tables, the charts, the drag-and-drop pipeline and signing in. Don't hand-roll what a mature library does well.

Accountable runs two ways:

- **The shared app** is the team's. Supabase provides sign-in, through Supabase Auth with an email and password, and the database, Postgres. It deploys to Render's free plan as one web service described by `render.yaml`, where FastAPI serves the built frontend and the API, and Render deploys `main` each time CI passes. Its settings are `DATABASE_URL`, `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, in `.env` on your own computer and in Render's settings for the deployed app. The browser holds only the publishable key.
- **The local copy** runs on your own computer, with its data in a SQLite file, the sample data and made-up teammates to sign in as. It needs neither Supabase nor the internet, and nothing done in it reaches the team's data.

Commands are npm scripts in a `package.json` at the repo root, with `frontend/` as an npm workspace, so they work the same on Mac, Linux and Windows:

- `npm run dev` fetches whatever is missing on the first run, then starts the local copy's backend and frontend together and prints the app's address
- `npm start` builds the frontend and runs the shared app on your own computer the way Render does, against Supabase
- `npm test` runs all the tests and fails if any test fails
- `npm run check` runs the formatting, lint, complexity, type and secrets checks and all the tests, and fails if any of them fail. `npm run check:quick` leaves out the end-to-end tests
- `npm run format` fixes the formatting
- A git pre-commit hook, through lefthook, formats the staged files, then runs the lint, type and secrets checks
- GitHub Actions runs gitleaks and then `npm run check:quick` on every push, to any branch, so the end-to-end tests run only on your own computer
- `npm run seed` resets the local copy's database to the sample data, after asking
- `npm run empty` empties the local copy's database, after asking. Neither ever touches Supabase.

`docs/STATUS.md` says how to run the app. `README.md` is the course's own guide, so leave it as it is.

Testing will cover:

1. Unit tests for the frontend, using Vitest
2. Unit tests for the backend, using pytest
3. End-to-end tests of the whole app in a browser, in `e2e/`, using Playwright Test (`@playwright/test`) with the installed Google Chrome. CI leaves them out. They start the app themselves, so `npm test` needs nothing else running.

The tests use SQLite databases of their own and never touch Supabase, so running them never changes your data, and CI needs no secrets.
