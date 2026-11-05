# Spec: Security

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Security

### Signing in

- Every API route refuses a request without a valid token, with a 401 and `{"detail": "Sign in to use Accountable."}`. That holds for every route the app has, including `GET /meta`, and for every other address under `/api`, whatever the method or body, because the token is checked before anything reads the request. Only the trusted host check comes first. The local copy's two sign-in routes are the only exception, and the shared app doesn't have them. Signed in, an unknown address under `/api` gets a JSON 404.
- The browser sends the token in the `Authorization` header. The backend takes the person from the token and from nothing else, so a request body can't say who's making it, or who added or changed a record. Request bodies that name one have it ignored, as with any unknown field.
- In the shared app, the backend checks each token's signature against the Supabase project's public signing keys, and checks that it hasn't expired and was issued to a signed-in user. This needs the project to use Supabase's newer asymmetric signing keys. A project still on the older shared secret isn't supported. In detail: only ES256 and RS256, issued by `<SUPABASE_URL>/auth/v1`, with audience and role both `authenticated`, not an anonymous user, with an expiry, an issue time, a subject and an email, and 30 seconds' leeway for clocks that disagree.
- It fetches the keys from `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` when it first needs them, waiting at most 10 seconds, and keeps them, fetching again only when a token names a key it hasn't seen, so a request doesn't wait on Supabase. It fetches at most once every 30 seconds, so made-up key ids can't make every request call Supabase. Supabase publishes a new key before signing with it, so a rotation needs no restart. If the keys can't be fetched, it refuses the request with a 503 and "Can't check your sign-in right now." rather than letting it through, and keys it already has keep working.
- The check keeps each person's name and email in the process once it has read or written their `users` row, so a request from someone already seen costs the check no trip to the database, and it writes only when a token shows a new name or email (U9). The app runs as one process (W6), so that memory is never out of step with another. A change made to the `users` table by hand while the app runs, such as in Supabase's SQL editor, is noticed only when that person's token next shows a different name or email, or at the next start. Nothing in the app deletes a `users` row, and clearing the sample data leaves the table alone (C11).
- Removing someone in Supabase stops them signing in again. A token they already hold works until it expires, within the hour by Supabase's default, because the backend checks tokens itself rather than asking Supabase each time.
- Display names are part of each person's Supabase profile, which they can change themselves through Supabase. A name is only ever shown, never used to decide anything, and everyone can do everything anyway.
- Sign-ups are turned off in Supabase, because the publishable key is public by design and anyone holding it could otherwise make an account. That's a setting in Supabase's dashboard, so `docs/STATUS.md` lists it among the setup steps.
- In the local copy, the backend signs its own tokens for the made-up teammates. It accepts only those, and only from this computer: the request has to name one of the local addresses below, and its connection has to come from a loopback address. The address a request names is only its Host header, which anyone can set, so the connection is what keeps the local sign-in from being reached from anywhere else, even by mistake, such as on Render without its settings. Uvicorn puts a forwarded address in its place only for a connection from this computer. The signing key is 64 random bytes in `data/accountable.key`, beside the database, readable only by its owner and made on first use, so each test database has its own. Its tokens last a year, which stands in for "until they sign out" (U4), and one whose person isn't in the `users` table is refused. From anywhere else, the two sign-in routes answer 404, and so does signing in as someone who isn't a teammate, with "No such teammate.", so the app doesn't take it for a session that ended.

### Keys and settings

- The browser holds only the Supabase URL and the publishable key. The database password, inside `DATABASE_URL`, stays on the server.
- The three settings live in `.env` on this computer and in Render's own settings for the shared app. `.env` stays out of git, `render.yaml` names the settings without their values, and gitleaks allows a key in `.env` and nowhere else. CI uses no secrets.
- The company settings ([B1](settings.md#company-settings)) are the team's data, not keys or configuration. They hold no secrets, live in the database with the records, and are never read from `.env`.
- The app never uses Supabase's secret key. The backend reaches the database through `DATABASE_URL`, and checks tokens with the public keys.

### The database

- Supabase's Data API serves the tables in the `public` schema to anyone holding the publishable key, unless row-level security is on. So every table has row-level security turned on, with no policies, which shuts the Data API out of every row. Alembic's own version table is included, and so is every table a later change adds. The backend connects as the tables' owner, which row-level security doesn't apply to.
- The shared app refuses to start if any table in the `public` schema has row-level security off, naming each one, so a table that missed it can't sit open to the Data API ([Row-level security check](backend.md#data-model)).
- The local copy's database file stays out of git, which `.gitignore` already handles.

### Addresses

- The backend's trusted host check accepts only `localhost` and `127.0.0.1`, plus the shared app's `onrender.com` address when Render runs it. No cross-origin access is allowed. Tokens travel in a header, never a cookie, so another website in the same browser can't make a request that counts as signed in.
- In the local copy, the backend and Vite listen on the local machine only. Vite's CORS support is off, since by default it trusts pages on other local ports, and it serves only `frontend/` and the packages, since by default it serves the whole repo, database included.
- `npm start` listens on the local machine only, like the local copy. Render serves the shared app over HTTPS.
- The built app serves only the files in `frontend/dist`, so no address can reach the code, `.env` or anything else in the repo.

### Requests

- The API accepts only JSON request bodies.
- Website links must be `http` or `https`, so a saved value can't run a script when clicked.
