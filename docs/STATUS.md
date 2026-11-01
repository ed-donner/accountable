The MVP is built and its automated tests pass. `docs/intent.md` says what it is, `docs/spec.md` has the requirements and design, `docs/TECH_STACK.md` has the stack, and `docs/plan.md` is the build plan that was followed. The next stage is the Test stage: the checks by hand listed under Proof in the plan, which tests can't settle, and then the project owner's own use.

## Build progress

- **Phase 1, a shell that runs:** done.
- **Phase 2, database, rules and sample data:** done.
- **Phase 3, the API:** done. At the 1,000 contacts, 500 deals and 5,000 activities limit, the dashboard's data arrives in about 22ms against a 200ms limit.
- **Phase 4, tables and forms:** done.
- **Phase 5, record pages and timelines:** done.
- **Phase 6, pipeline:** done. The first board used `@dnd-kit/sortable` and had a 241ms task at the limits, so it now has one draggable and a droppable per column, and slides the cards apart itself. The longest task while dragging into a 240-card column is about 70ms to 180ms, against the project owner's limit of about 250ms. `@dnd-kit/sortable` is gone and the spec says why.
- **Phase 7, dashboard:** done. It was checked against the mockup at both sizes with sample data, an empty database and data at the limits.
- **Phase 8, finish the build:** done.

## Running Accountable

This runs on your own computer, and nothing you enter leaves it.

### Install two things, once

1. **Node**, version 24 or later: get the LTS installer from <https://nodejs.org>.
2. **uv**: follow the steps at <https://docs.astral.sh/uv/getting-started/installation/>.

You'll also need Google Chrome, which is the one browser Accountable is tested with.

### Start it

Open a terminal in this folder and run:

```
npm run dev
```

The first time, this downloads what Accountable needs, so it takes a few minutes and needs an internet connection. After that it starts in seconds and works with no connection at all. When it's ready it prints an address:

```
Accountable is running at http://localhost:5173
```

Open that address in Chrome. Keep the terminal window open while you use Accountable.

If it says a port is in use, Accountable is probably already running in another window.

### Stop it

Click on the terminal window and press Ctrl+C.

### Start again from the sample data, or start with your own

Accountable comes with made-up sample data so you can look around.

- `npm run seed` replaces everything with fresh sample data.
- `npm run empty` removes everything, so you can type in your own records.

Both tell you what will be lost and only go ahead if you type `yes`. Both are safe with the app running: refresh the browser to see the result.

### Back up your data

Everything lives in one file, `data/accountable.db`. Copy that file somewhere safe to back it up. There's no undo, and nothing is backed up for you, so if the file is lost or this folder is deleted, your records go with it.

### Not yet proven

Accountable has only been run on a Mac. It's built to work the same on Windows and Linux, but nobody has tried it there yet. Safari and Firefox may work, but only Chrome is checked.

## Running the tests

`npm test` runs the type check and every test. It uses its own temporary database, so it never touches your data.
