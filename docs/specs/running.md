# Spec: Running, sample data and keeping data

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Sample data

- **M1.** A new database is filled with sample data. "New" means the database was only just created, not that its tables are empty, so an emptied database stays empty after a restart.
- **M2.** Sample dates are worked out from the day of seeding, so a fresh copy always looks current. Running `npm run seed` later refreshes it.
- **M3.** The content is fictional, realistic and the same each time, in these rough amounts:

| Record | About | Must include |
|---|---|---|
| Organizations | 24 | At least 6 industries |
| Contacts | 75 | Every status, with the main contact of every won deal a Customer |
| Deals | 80 | 36 open across all four open stages, at least 5 of them late, and some closing in each of the next 3 months |
| | | 32 won and 12 lost across the past 12 months, with a win in every month and an upward trend |
| | | At least 2 wins dated this month, even on the 1st |
| Activities | 300 | All three types, at least 6 overdue follow-ups and at least 10 upcoming |

- **M4.** Every sample deal has a full stage history, so timelines and the funnel look right from the start.
- **M5.** Emails and websites use the reserved `.example` domain, so nothing points at a real company.
- **M6.** The sample Won and Lost columns start newest first.

## Running and keeping data

- **C1.** `npm run dev` is the one documented command, the same on Mac, Linux and Windows. With Node and uv installed, it fetches what's missing, starts the app and prints its address. It has only been run on a Mac so far: the build avoids anything platform-specific, but Windows and Linux are unproven until someone tries them.
- **C2.** After the first run, the app starts and works with no internet connection. It loads nothing from outside the computer, including fonts.
- **C3.** Every change survives a browser refresh and a restart.
- **C4.** `npm run seed` resets to the sample data. `npm run empty` removes every record. Both show how many of each record will be lost and go ahead only if `yes` is typed.
- **C5.** After `npm run empty`, every screen still works and invites the first record.
- **C6.** Both commands are safe to run while the app is running. A refresh shows the result.
- **C7.** There are no backups and no export. Everything lives in `data/accountable.db`, so a reset, `git clean -x`, deleting the folder or losing the computer loses it all. `docs/STATUS.md` explains that copying the file is the backup.

## Commands and first run

| Command | What it does |
|---|---|
| `npm run dev` | Sets up if needed, starts the app, prints its address |
| `npm test` | Sets up if needed, runs the type checks and all tests, fails if any fail or unit coverage is under 80% |
| `npm run check` | Runs the code checks in [Testing](testing.md#testing), then everything `npm test` runs, and fails if any of them fail |
| `npm run check:quick` | The same, without the end-to-end and speed tests |
| `npm run format` | Fixes the formatting with Prettier and ruff |
| `npm run seed` | Resets to the sample data, after asking |
| `npm run empty` | Empties the database, after asking |

`npm run dev` can't depend on any npm package, because on the first run none are installed. So `scripts/dev.mjs` uses only what comes with Node:

1. Check that Node is version 24 or later and that uv is installed. If not, say which is missing and how to get it, then stop.
2. Run `npm install` if `node_modules` is missing, or if `package-lock.json` is more than 2 seconds newer than `node_modules/.package-lock.json`. Compare that file and not the folder, because the folder's date doesn't reliably change and a needless install would break offline starts. npm writes the two files less than a millisecond apart, hence the margin. If an install fails with `node_modules` already there, warn and carry on.
3. Run `uv sync --frozen` on every start, with no date check. With nothing to do it takes about a millisecond and reaches no network. uv fetches Python 3.12 if needed.
4. Start the backend and frontend with concurrently, using `uv run --no-sync`, so nothing reaches for the network after the first run.
5. When both answer, print `Accountable is running at http://localhost:5173` and to keep the window open while using it.
6. Ctrl+C stops both servers on every platform.

If a port is taken, stop and say "Port 5173 is in use. Is Accountable already running?". Scripts run through Node, with no shell-specific syntax, so they behave the same on all three platforms. Windows can't run `npm.cmd` directly with Node's `spawn`, so every process starts through one helper in `scripts/setup.mjs`.

`npm run seed` and `npm run empty` run the same setup first, so they work before the first `npm run dev`. They accept `--yes` for tests. Without it, they ask, and if there's no one at the keyboard to answer, they stop without wiping anything.

`data/accountable.db` is the default database path, and the `ACCOUNTABLE_DB` setting overrides it for tests.

The large packages are listed in Vite's `optimizeDeps.include`, because finding a new package during a first visit makes Vite reload the page.

`docs/STATUS.md` is where the run instructions live, because `README.md` is the course's own guide. Written for someone non-technical, it covers installing Node and uv, running `npm run dev`, keeping the window open, stopping with Ctrl+C, the seed and empty commands, and copying `data/accountable.db` as a backup.
