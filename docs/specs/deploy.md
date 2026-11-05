# Spec: The shared app on Render

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Deploying

- **W1.** The shared app is one web service on Render's free plan, described by `render.yaml`. FastAPI serves the built frontend and the API from one address, `https://<service name>.onrender.com`, so the browser still talks to one address and needs no cross-origin setup.
- **W2.** Render builds the app by installing the Python and Node packages from their lock files, ReportLab and Pillow among them as wheels, with no system packages, and building the frontend into `frontend/dist`, with the Supabase URL and publishable key built in. It starts the backend on the port Render gives it. As the backend starts, the migrations run and then the row-level security check ([Security](security.md#the-database)), before it answers anything. If either fails, the backend stops, so the deploy fails rather than serving anything.
- **W3.** `render.yaml` sets `PYTHON_VERSION` to a full 3.12 release, because Render's default Python is newer than `pyproject.toml` allows, and `TZ` to the team's time zone, which sets the backend's today. It also pins `UV_VERSION`, because Render's default uv is older than the one that wrote `uv.lock`, and `NODE_VERSION`, to match CI, though Render's default Node 24 would also do. It names `DATABASE_URL`, `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` without values, so Render asks for them on the first deploy and keeps them. Their values are never in the file.
- **W4.** `render.yaml` sets the region nearest the Supabase project: `oregon`, `ohio`, `virginia`, `frankfurt` or `singapore`. Every query crosses between the two, and Render can't change a service's region once it exists.
- **W5.** Render deploys `main` each time CI passes on it, and never a commit whose CI failed.
- **W6.** The service runs as one instance with one worker process, because the lock that keeps writes in order lives in the process ([Backend rules](backend.md#backend-rules)).
- **W7.** Any address outside `/api` that isn't a built file gets the app's page, so every address in N2 works on refresh. Once signed in, an unknown address under `/api`, or a known one with the wrong method, gets a JSON 404, as other API errors do. The page itself is sent with `Cache-Control: no-cache`, so a browser can't keep an old page asking for built files that a deploy has replaced.
- **W8.** The backend connects to Supabase through its session pooler, on port 5432. The direct connection is IPv6 only on Supabase's free plan, and Render can't reach it.
- **W9.** The first start against an empty Supabase database builds the tables and adds the sample data in one transaction, so an interrupted first start leaves nothing behind (M1).

## Free plan limits

- Render's free plan puts the app to sleep after 15 minutes without visits, and the next visit takes about a minute to wake it. The page waits rather than failing.
- Render's disk is wiped on every deploy and restart, so the app keeps nothing on it. All the team's data is in Supabase, the company's logo included (B22), and each invoice's PDF is made when it's downloaded, never kept.
- Supabase pauses a free project after a week without use. Restoring it in Supabase's dashboard brings it back with its data.
- The free plan gives the app a tenth of a CPU, so it's slower than the local copy, most of all when making a PDF. Q1's limits are measured on the local copy.
