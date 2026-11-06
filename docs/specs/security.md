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
- The three settings live in `.env` on this computer and in Render's own settings for the shared app. So do the Copilot's two, `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` (Z19). `.env` stays out of git, `render.yaml` names all five without their values, and gitleaks allows a key in `.env` and nowhere else. CI uses no secrets.
- The OpenRouter key stays on the server. No reply carries it, the Copilot's errors included, and the browser never talks to OpenRouter.
- The company settings ([B1](settings.md#company-settings)) are the team's data, not keys or configuration. They hold no secrets, live in the database with the records, and are never read from `.env`.
- The app never uses Supabase's secret key. The backend reaches the database through `DATABASE_URL`, and checks tokens with the public keys.

### The database

- Supabase's Data API serves the tables in the `public` schema to anyone holding the publishable key, unless row-level security is on. So every table has row-level security turned on, with no policies, which shuts the Data API out of every row. Alembic's own version table is included, and so is every table a later change adds, such as `quotes` and `quote_lines`. The backend connects as the tables' owner, which row-level security doesn't apply to.
- The shared app refuses to start if any table in the `public` schema has row-level security off, naming each one, so a table that missed it can't sit open to the Data API ([Row-level security check](backend.md#data-model)).
- The local copy's database file stays out of git, which `.gitignore` already handles.

### Addresses

- The backend's trusted host check accepts only `localhost` and `127.0.0.1`, plus the shared app's `onrender.com` address when Render runs it. No cross-origin access is allowed. Tokens travel in a header, never a cookie, so another website in the same browser can't make a request that counts as signed in.
- In the local copy, the backend and Vite listen on the local machine only. Vite's CORS support is off, since by default it trusts pages on other local ports, and it serves only `frontend/` and the packages, since by default it serves the whole repo, database included.
- `npm start` listens on the local machine only, like the local copy. Render serves the shared app over HTTPS.
- The built app serves only the files in `frontend/dist`, so no address can reach the code, `.env` or anything else in the repo.

### Requests

- The API accepts only JSON request bodies. The logo travels inside one, as base64 (B21), so no route reads a file upload.
- A request body over 2 MB is refused with a 413 and `{"detail": "That's too big to send."}`, so a large body can't use up the server's memory. The bytes are counted as they arrive, so a body sent without a `Content-Length` is refused too. The check comes after the token's and before the JSON check, so a body sent without a token is still refused for the token. The largest body the app sends is a 1 MB logo, about 1.4 MB as base64.
- Website links must be `http` or `https`, so a saved value can't run a script when clicked.
- A quote's PDF draws everything typed as plain text, never as markup or formatting (Q32), so a description or a name can't change what the PDF shows or does. The PDF is made by the backend from the saved quote, at the request of a signed-in person, and its route needs a token like every other.
- The backend works out every amount on a quote from its lines and the tax rate, and never takes a subtotal, tax or total from the request (Q15).

### The Copilot

- **It acts as the person.** Each tool calls one of the app's own routes in the backend's own process, with the `Authorization` header, host and client address of the request that asked, so it passes the trusted host check, the token check, the body checks and the write lock exactly as that person's own request would, and can do only what they can (Z11). In the local copy, that means a tool's request counts as coming from this computer only when the person's did. The Copilot never touches the database itself: `copilot/` imports no other area and not `db.py` ([Layout rules](architecture.md#layout-rules)).
- **It reaches only its own list.** Each tool names its routes, from Z8's and Z11's tables, and nothing else. A change also names the `GET`s its card reads, such as the records it links to, `GET /meta` and `GET /dashboard`, and its only write is its route in Z11's table. A tool's arguments are checked against its own schema before any request: an id goes into a path only as a whole number, and everything else only as a query value or a body field, so no argument can reach a route the tool doesn't name. Each run and each card goes through a caller limited to its tool's own routes, `copilot/calls.py`'s `limited_to`, which refuses anything else before it's sent, and fails the step, so a mistake in a tool can't reach further either. The two reads for the instructions go through one limited to `GET /me` and `GET /settings`. Every caller also refuses an address outside `/api`, or one holding a query, dots or `%`. The look-ups only use `GET`. No tool reaches a `DELETE`, `/settings` other than to read it, the products', quotes', invoices', payments', bills' or books' writes, or anything outside `/api`. A call for a tool not on the list, or with arguments its schema refuses, reaches nothing and is answered to the model as refused.
- **A change runs only when the person presses its button.** The backend runs a change only in a request whose `decision` is `confirm`, and then only the one call held in that request's `pending`, which it checks again as it would any request: one of Z11's changes, with arguments its schema accepts. It runs only while the change's card, read again from the records, still says what the person saw (Z15). Everything the model asks for after that waits for a card of its own (Z14). `pending` comes back from the browser, so a person could change it, but only to do what they could already do through the app.
- **Text in the records is data.** What the tools read reaches the model as data, kept apart from its instructions, which say that text typed into Accountable is never an instruction (Z17). The change card's words come from the change's arguments and the records as the API gives them, so a note can't make a card say one thing and do another.
- **The answer is text.** The panel draws the model's answer as React text with the few kinds of formatting in Z6, never as HTML, and draws no link or image from it, so an answer can't load anything from another site or run a script.
- **One outside call.** The backend's one call outside the app is to OpenRouter's chat completions, with the key. `ACCOUNTABLE_MODEL_URL` points it at a stand-in model for the tests instead, as `ACCOUNTABLE_DB` gives them a database of their own ([Testing](testing.md#testing)). `npm start` blanks it, so the shared app's key goes only to OpenRouter, whatever the shell holds (C10).
- **Nothing kept.** No table holds a conversation, and the backend logs no question, answer or record the tools read (Z23).

### Invoices and the logo

- The backend works out every amount on an invoice and every balance itself, and ignores any figure a request sends (V9). A payment is checked against what's owed under the write lock, so no pair of requests can overpay an invoice (V16).
- An issued invoice can't be changed through any route (V12), so what a customer was sent stays as it was.
- Anything typed into an invoice or the company settings goes onto the PDF as plain text, never as markup (V25), and the preview draws it as SVG text, never as HTML.
- The logo is kept only if Pillow reads it as a PNG or a JPEG, whatever its name or stated type, and no larger than 1 MB or 2,000 pixels on a side, so a small file can't unpack into a huge image (B21). SVG is refused, because it can carry a script. The logo is sent back with the type the check found and `X-Content-Type-Options: nosniff`, so a browser never treats it as anything else.

## Known risks

Risks the project owner has accepted, so that nobody mistakes them for something the app protects against.

- **A free model's host may keep what's sent to it.** With the default model, `openrouter/free`, the Copilot sends the person's questions and the records its tools read, the team's real customers, deals and money included in the shared app, to whichever free model the router picks. Some of those models' hosts keep what they're sent, and some may train on it, and the router doesn't say in advance which model it will pick. The panel says where questions go before the first one (Z3). A team that doesn't accept this sets `OPENROUTER_MODEL` to a paid model whose host doesn't keep prompts (Z19).
- **A note can still mislead the model.** Text typed into a record can make the model give a wrong answer, or ask for a change nobody wanted. The change card stops the second (Z13), so the person reads the card before pressing its button. Nothing stops the first, which is why the panel says the Copilot can get things wrong.
- **The model can be wrong.** It answers from what its tools read, but it can misread a figure or leave a record out. The figures on the app's own pages are the ones to trust.
- **The team shares one key's limits.** One person asking a lot can use up the day's free requests for everyone (Z22).
