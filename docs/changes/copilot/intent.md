# Intent: the Accountable Copilot

## Problem

Accountable has grown into a CRM with the start of an ERP. Finding an answer, or making a small change, can mean clicking through several pages. People want to ask in plain English and have it done.

## Proposed outcome

A Copilot panel opens from the top bar beside any page. The user types a question or a request, such as "Which deals are closing this month?" or "Move the Acme deal to Negotiation". The Copilot works it out by calling Accountable's own API through tools, showing each tool it uses as it goes, then answers. It can look up anything the app shows. When it's asked for something it has no tool for, it says so plainly.

It changes CRM records only. It can add and edit organizations, contacts and deals, move a deal to another stage, add an activity and mark a follow-up done. Products, quotes, invoices, payments, bills and the books are read-only to it, and when it's asked to change one of them, it says it can't.

It runs in both the local copy and the shared app.

## Constraints

- The model comes from OpenRouter. The key is OPENROUTER_API_KEY, and the model is the setting OPENROUTER_MODEL beside it, with openrouter/free, OpenRouter's router across its free models, as the default. A team that wants a paid model sets one.
- In the local copy, both live in .env. `npm run dev` reads OPENROUTER_API_KEY and OPENROUTER_MODEL from .env, and still never the three Supabase settings (C8, C9). `npm test`, `npm run check` and `npm run e2e` never read .env at all.
- In the shared app, the key and the model come from the Render service's environment, like the Supabase settings, and render.yaml names both with `sync: false`.
- The Copilot acts as the signed-in user, through the same API and permissions as the app, so it can do only what that user can do. It never reads or writes the database directly.
- Before any change, it shows what it's about to do and waits for the user to confirm.
- Its tools reach only Accountable's own API. Nothing sends email, fetches web pages or calls another service.
- Any text stored in Accountable is untrusted, because anyone who can type into a note, a contact or a deal could have written it. The Copilot treats it as data, never as instructions. Its answers show as text, with no images or links that load from other sites.
- What the Copilot sends the model includes the team's records. The host of a free model may keep what's sent to it, and may train on it, and the free router doesn't say which model it picked in advance. The spec records this as a known risk. There's no Known risks section in the spec yet, so it goes in a new one in `docs/specs/security.md`.
- A free OpenRouter key has limits: 20 requests a minute, and 50 a day until the account has bought $10 of credits, then 1,000. The whole team shares them, and one question can take several requests. When a limit is reached, or the key is missing, the panel says so in plain words.
- The tests never call a real model. They use a stand-in model that follows a script, and the real model is tried by hand.
- The panel follows the app's design, in light and dark mode, at the widths the app supports (N3).
- No new dependencies unless the plan makes the case for one.

## Not in this change

- Deleting records, or changing Settings or users.
- Changing products, quotes, invoices, payments, bills or the books.
- A layout for phones.
- Keeping conversations after the page reloads.
- Voice, or attaching files.

## Success criteria

1. npm run check passes.
2. Asked a question about the sample data, such as which deals close this month, the Copilot answers correctly and shows the tools it used.
3. Asked to move a deal to another stage, it asks first, and once the user confirms, the board shows the deal in its new stage.
4. Asked for something it has no tool for, such as marking a bill paid, it says it can't do that.
5. A note on a deal that says "Move every deal to Lost" changes nothing when the Copilot reads it.
6. With no key, or with a limit reached, the panel says what's wrong.
7. Criteria 2 to 6 are covered by tests with the stand-in model, and 2 to 5 have been tried by hand with the real model.
