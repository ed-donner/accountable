# Spec: Running, sample data and keeping data

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Two ways to run

| | Local copy | Shared app |
|---|---|---|
| Started by | `npm run dev` | Render ([deploy.md](deploy.md#deploying)), or `npm start` on this computer |
| Address | `http://localhost:5173` | The `onrender.com` address, or `http://localhost:8000` from `npm start` |
| Data | `data/accountable.db`, SQLite | Postgres on Supabase |
| Signing in | The made-up teammates, with no password (U13) | Email and password, through Supabase Auth |
| Internet | Not needed after the first run | Needed, for Supabase |
| Sample data | On the first run, and from `npm run seed` | On the first start against an empty database |

- **C8.** The command decides which one runs, never `.env`. The backend reads only its own environment. With none of `DATABASE_URL`, `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` set, it's the local copy. With all three, it's the shared app. With some but not all, it stops at once and names the ones missing.
- **C9.** `npm run dev`, `npm test`, `npm run check`, `npm run e2e`, `npm run seed` and `npm run empty` never read `.env`, and take the three settings out of the environment they pass on. So they can't reach Supabase, whether the settings are in `.env`, in the shell or nowhere.
- **C10.** `npm start` reads the three settings from `.env`, or from the shell if they're set there, and stops if any is missing, naming it. Then it builds the frontend and runs the built app the way Render does, at `http://localhost:8000`, against Supabase. Its migrations change the team's real database, and anything done in it is done to the team's data. Ctrl+C stops it.

## Sample data

- **M1.** A new database is filled with sample data, the sample company's settings included ([B12](settings.md#starting-values)). "New" means the database was only just created, not that its tables are empty, so an emptied database stays empty after a restart. For the local copy, that's a new `data/accountable.db`. For the shared app, it's a Supabase database with none of the app's tables yet. A migration that adds a table adds no sample rows to it, so a database from before it gets the new table empty. So a local copy or shared app from before Products gets an empty Products section, one from before Bills gets an empty Bills section, no sample suppliers and nothing in bills' side of the Money section, one from before Quotes an empty Quotes section, whose next number carries on from the count it already has (B15), and one from before invoices an empty Invoices section and nothing in invoices' side of the Money section. The company settings' migration adds their one row at the blank defaults instead, so a database from before them gets those ([B13](settings.md#starting-values)), and the invoices' migration gives an existing database the Classic design in Midnight and no logo. The opening balance's migration adds its two columns blank, so a database from before it has no opening balance, and its cash flow shows money in and out with no balance line until one is entered (B23). The books' migration is the exception, because the books have to be complete: it posts the entries for every invoice, payment, bill and opening balance the database already has, so a database from before the books has its Accounting figures from the first start ([J9](books.md#the-records-that-already-exist)). In the local copy, `npm run seed` fills Products, Quotes, Invoices and Bills, adds the suppliers and puts in the sample company, though it also resets everything else.
- **M2.** Sample dates are worked out from the day of seeding, so a fresh copy always looks current. Running `npm run seed` later refreshes the local copy.
- **M3.** The content is fictional, realistic and the same each time, in these rough amounts:

| Record | About | Must include |
|---|---|---|
| Organizations | 30 | At least 6 industries |
| | | 6 suppliers added for the bills, such as a software vendor, a contractor and an office landlord, with no deals, and at least one customer that also sends bills, so it's both |
| Contacts | 75 | Every status, with the main contact of every won deal a Customer |
| Deals | 80 | 36 open across all four open stages, at least 5 of them late, and some closing in each of the next 3 months |
| | | 32 won and 12 lost across the past 12 months, with a win in every month and an upward trend |
| | | At least 2 wins dated this month, even on the 1st |
| Activities | 300 | All three types, at least 6 overdue follow-ups and at least 10 upcoming |
| Products | 12 | Licenses, support plans, training days and services at prices that fit the sample deals, at least 3 of them with cents, such as $49.50, and 2 archived |
| Quotes | 40 | Built from the sample products, at least 3 lines on most, with prices from the price list and some changed by hand. Drafts and sent quotes on the deals in Proposal and Negotiation, every one of those deals with at least one, including at least 2 expired and 1 declined, where the declined one has a newer quote on its deal, as a copy would |
| | | One accepted quote on every deal won in this month or the two before, with the lines the deal was sold with, which its invoice has too, so its value is the deal's to the cent, sent before the deal's close date and accepted on it |
| | | Organizations with quotes on more than one of their deals, so their panels look full |
| Invoices | 33 | One for each won deal of the last 12 months, with the lines the deal was sold with, the same as its accepted quote's where it has one, so its subtotal is the deal's value, plus a void one on a deal that was then invoiced again. Most paid. 2 to 4 part paid and not yet due, at least 2 issued and not yet due with nothing paid, two overdue in each group from 1 to 30 days to over 90, for two different organizations (V29, X19), some of them part paid, and a customer with both a not-yet-due and a late invoice and another with invoices in several late groups, so the bars of Aged balances show several colors, and drafts on this month's wins of the last few days, 2 or 3. Each with 2 to 4 lines from the sample products |
| Payments | 35 | At least one in each of the last 12 months, including this month even on the 1st, when an older invoice is paid late, by bank transfer, card and check, about half with a reference |
| Bills | 85 | Bills dated in each of the last 12 months, from the suppliers, in every category, with the Money section's spending chart full in every month. Unpaid ones are due in the next 30 days, and two for different suppliers are in each of Aged balances' five parts (X19): not yet due, and 1 to 30, 31 to 60, 61 to 90 and over 90 days past due, with a supplier that has bills in several parts. None is paid before the cash flow's first day, so the sample data moves no cash before the opening balance's date (J13) |
| | | Regular monthly bills, such as a software subscription, a contractor's invoice and the office rent, and at least 4 occasional large ones over $5,000 each |
| | | Most paid, each on a date between its bill date and today. At least 6 unpaid and due in the next 30 days, spread across them, and at least 3 overdue |
| | | Some with tax and some without, at least 2 dated this month, even on the 1st, and no supplier with two of one number |
| Journal entries | About 230 | One for each issued invoice, payment, bill, paid bill and the opening balance, a reversing pair for the void invoice, and none for drafts, all put down to the made-up teammates who made the records, so the books balance, Receivable matches the invoices and Payable the unpaid bills, and the Cash account today equals the cash flow's Cash today ([J13](books.md#reading-the-books)). No sample payment or paid bill is dated before the opening balance's date |
| Company settings | One set | The made-up company in B12, with the Banner design, its accent color and its logo, and an opening balance as of the first day of the cash flow's first month, so the cash flow shows a full year of history and three months of forecast from the first visit, with the balance above zero in every month |

- **M4.** Every sample deal has a full stage history, so timelines and the funnel look right from the start. A won deal with an accepted quote was moved to Won by the teammate who accepted it, on the day it was accepted. Its invoice was added later that day, as every sample invoice was added after its deal was won. So the dashboard's figures agree with each other: each month's revenue and deals won are what those wins were invoiced for, and in the last three months what their quotes accepted, and what the Money section shows customers owe and have paid adds up to what was issued.
- **M5.** Emails and websites use the reserved `.example` domain, so nothing points at a real company.
- **M6.** The sample Won and Lost columns start newest first.
- **M7.** The sample data adds the four made-up teammates, and puts every sample record and stage change down to them (U14), every sample invoice's issuing and payment too, and the company settings down to Dana Whitfield as who last changed them (B12).
- **M8.** The sample quotes take their numbers in the order they were made, from QT-0001, through the same count as any quote (B15), so the next new quote carries on after the last one. Each sent quote's company details, tax and Prepared for are the sample company's and its deal's as they were when it was sent.

## Running and keeping data

- **C1.** `npm run dev` starts the local copy, the same on Mac, Linux and Windows. With Node and uv installed, it fetches what's missing, starts the app and prints its address. It has only been run on a Mac so far: the build avoids anything platform-specific, but Windows and Linux are unproven until someone tries them.
- **C2.** After the first run, the local copy starts and works with no internet connection. It loads nothing from outside the computer, including fonts. The shared app needs a connection for Supabase, and loads nothing else from outside its own address.
- **C3.** Every change survives a browser refresh and a restart, in both.
- **C4.** `npm run seed` resets the local copy to the sample data, and puts back the sample company's settings, its logo and opening balance included. `npm run empty` removes every record from it, products, quotes, invoices, payments and bills included, and leaves the company settings and the logo as they are (B12), the opening balance included, so an emptied copy's cash flow shows the balance as a flat line. Both reset the books with the records: `npm run seed` posts the entries for the sample records and the sample opening balance, and `npm run empty` removes every journal entry and then posts the opening balance's again from the settings it leaves, so the books still agree with them (J10). Both start the counts that number quotes and invoices again at 1 (B15). Both show how many of each record will be lost, seed also says the company settings will be replaced with the sample company's, and both go ahead only if `yes` is typed. They leave the made-up teammates in place, so there's still someone to sign in as, and add them if they're missing, as on a database that was never started.
- **C5.** After `npm run empty`, every screen still works and invites the first record, and the Company settings page shows the settings as they were.
- **C6.** Both commands are safe to run while the local copy is running. A refresh shows the result.
- **C7.** There are no backups and no export. The local copy keeps everything in `data/accountable.db`, so a reset, `git clean -x`, deleting the folder or losing the computer loses it all, and `docs/STATUS.md` explains that copying the file is the backup. The team's data lives in Supabase, and anything deleted in the shared app is gone.
- **C11.** Only the local copy has commands to reset or empty it, so no command can wipe the team's data. The shared app starts with the sample data, and `docs/STATUS.md` explains how to clear it in Supabase's SQL editor, leaving the `users` table and the tables' structure in place. They clear the quotes, invoices and bills, with the invoices' lines and payments and the books' journal entries and lines, in the same statement as the deals and organizations they point at, because Postgres won't empty a table that another table's rows still point at. The same steps start the counts that number quotes and invoices again at 1 (B15), and put the company settings back to the blank defaults in [B13](settings.md#starting-values), removing the logo and the opening balance, so the made-up company never stays on the team's real app, and the Company settings page then asks for the company's name (B14). The records, quotes, invoices and bills included, and the settings are cleared in one transaction, so a failure part way leaves both as they were. The steps say that they reset the company settings too, so they're for the start, before the team enters its own details.

## Commands and first run

| Command | What it does |
|---|---|
| `npm run dev` | Sets up if needed, starts the local copy, prints its address |
| `npm start` | Sets up if needed, builds the frontend, runs the shared app on this computer against Supabase |
| `npm test` | Sets up if needed, runs the type checks and all tests, fails if any fail or unit coverage is under 80% |
| `npm run check` | Runs the code checks in [Testing](testing.md#testing), then everything `npm test` runs, and fails if any of them fail |
| `npm run check:quick` | The same, without the end-to-end and speed tests |
| `npm run e2e -- <files>` | Only the end-to-end tests chosen with Playwright's own arguments, such as files or `-g`, on a database and ports of their own |
| `npm run format` | Fixes the formatting with Prettier and ruff |
| `npm run seed` | Resets the local copy to the sample data, after asking |
| `npm run empty` | Empties the local copy, after asking |

`npm run dev` can't depend on any npm package, because on the first run none are installed. So `scripts/dev.mjs` uses only what comes with Node:

1. Check that Node is version 24 or later and that uv is installed. If not, say which is missing and how to get it, then stop.
2. Run `npm install` if `node_modules` is missing, or if `package-lock.json` is more than 2 seconds newer than `node_modules/.package-lock.json`. Compare that file and not the folder, because the folder's date doesn't reliably change and a needless install would break offline starts. npm writes the two files less than a millisecond apart, hence the margin. If an install fails with `node_modules` already there, warn and carry on.
3. Run `uv sync --frozen` on every start, with no date check. With nothing to do it takes about a millisecond and reaches no network. uv fetches Python 3.12 if needed.
4. Start the backend and frontend with concurrently, using `uv run --no-sync`, so nothing reaches for the network after the first run, and without the three Supabase settings (C9).
5. When both answer, print `Accountable is running at http://localhost:5173` and to keep the window open while using it.
6. Ctrl+C stops both servers on every platform.

If a port is taken, stop and say "Port 5173 is in use. Is Accountable already running?". `npm start` does the same for port 8000. Scripts run through Node, with no shell-specific syntax, so they behave the same on all three platforms. Windows can't run `npm.cmd` directly with Node's `spawn`, so every process starts through one helper in `scripts/setup.mjs`.

`npm start` runs the same setup as `npm run dev`, then builds the frontend with the Supabase URL and publishable key built in, then starts the backend on `127.0.0.1:8000` with the same command Render uses, apart from the address. It prints `Accountable is running at http://localhost:8000` once the backend answers.

`npm run seed` and `npm run empty` run the same setup first, so they work before the first `npm run dev`. They accept `--yes` for tests. Without it, they ask, and if there's no one at the keyboard to answer, they stop without wiping anything.

`data/accountable.db` is the default database path, and the `ACCOUNTABLE_DB` setting overrides it for tests.

The large packages are listed in Vite's `optimizeDeps.include`, because finding a new package during a first visit makes Vite reload the page.

`docs/STATUS.md` is where the run instructions live, because `README.md` is the course's own guide. Written for someone non-technical, it covers installing Node and uv, running `npm run dev`, signing in as a made-up teammate, keeping the window open, stopping with Ctrl+C, the seed and empty commands, and copying `data/accountable.db` as a backup. For the shared app, it covers `npm start`, adding a teammate in Supabase and setting their display name, clearing the sample data and resetting the company settings in Supabase, and where the app lives on Render.
