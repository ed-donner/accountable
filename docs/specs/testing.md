# Spec: Testing

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Testing

`npm test` runs the type checks, tsc on the frontend, because Vite doesn't check types, and ty on the backend, then all three layers, and uses databases of its own. `scripts/checks.mjs` picks the database path once and passes it down. Pytest and Playwright refuse to start without it, or with a path inside `data/`, so a test can never wipe real data.

**Backend (pytest)**, on a fresh temporary database each test:

- Every row of the stage rules, with today's date fixed, including hand-set probabilities and blank main contacts
- Delete outcomes and the counts in `delete-impact`
- Required fields, and the rules on blank links
- Dashboard figures against a small dataset with known answers, including month boundaries, an edited close date and a reopened deal
- The funnel, including skipped stages, a deal moved backwards, a lost deal and a deal added at Won
- All three timelines, with no duplicates
- Sample data meets every line of M3, including when seeded on the 1st of a month
- An emptied database stays empty after a restart
- Migrations build the same tables as `tables.py`
- Every route the app has gets the security and bad-input checks, taken from the app's own list of routes

**Frontend (Vitest):** money and date formatting, including dates near midnight, expected revenue and board totals using the same cases as the backend, the deal form's stage behavior, the table's search and sort, and every page, chart and the pipeline board as a user sees them, with the API stood in for by `mockApi` in `src/test-utils.tsx`. The board's tests give jsdom a plain layout, because jsdom lays nothing out, and move cards with the keyboard and the pointer. The mode button and the saved choice are tested too, including a saved choice that can't be read.

**Colors in one place:** `frontend/src/colors.test.ts` fails if any file in `frontend/src` other than `styles.css` names a color value, such as `#fff` or `rgba(...)`, so every color comes from a token and has a dark value. It also fails if the dark block sets a token that `@theme` doesn't have, so a misspelled one can't go unnoticed.

**Unit coverage:** `npm test` fails if the unit tests cover less than 80% of the app code. For `frontend/src` that's lines, statements, functions and branches, leaving out the tests and their helpers, `test-setup.ts` and `test-utils.tsx`. For `backend/accountable` it's lines and branches together. The end-to-end tests don't count towards it.

**Code checks:** `npm run check` runs these alongside the type checks and unit tests, then the browser tests, and fails if any of them fail. Warnings fail it too.

- Prettier on the code, settings and styles, 120 characters wide, as the code was already written. It leaves out Markdown, `docs/`, `course/`, `package-lock.json`, `.claude/` and `.mcp.json`, because their authors or their tools write them.
- ESLint on all the JavaScript and TypeScript, with the recommended rules from ESLint, `typescript-eslint`, React Hooks and `jsx-a11y`, the last two on `frontend/src` only.
- ruff format and ruff check on the backend, with ruff's default rules, 120 characters wide. Ruff also formats Python inside Markdown, so Markdown is left out.
- A complexity of at most 15 per function, through ESLint's `complexity` rule and ruff's C901.
- gitleaks on every commit and on the files as they are now, with gitleaks' own rules. `.gitleaks.toml` allows only `.env`, which git ignores. gitleaks is a program of its own, not an npm or Python package, so it has to be installed, and the check says how if it's missing. It names the file and line of anything it finds, with the secret itself hidden.

`npm run check:quick -- --failures-only` shows only the output of the checks that fail, then the summary.

**Hooks:**

- Before each commit, lefthook formats the staged files with Prettier and ruff and adds the changes to the commit. Then it runs ESLint and ruff check on those files, tsc and ty on the whole project, and gitleaks on what's staged. It leaves out the tests, so a commit takes a few seconds. `npm install` sets it up. If a staged file also has unstaged changes on the lines formatting touches, lefthook stops the commit and leaves both as they were, rather than mix them.
- When the coding agent finishes a turn, a hook in `.claude/settings.json` runs `npm run check:quick -- --failures-only` and sends what failed back to the agent to fix. It does that once a turn: the next time the agent stops, the hook lets it, so it can't loop. The check takes about 30 seconds, so every turn ends with that wait.
- Another hook stops the agent's file tools from changing any file called `.env`, and stops any shell command that names `.env`, because a command can change a file in too many ways to tell a read from a write. It guards against mistakes. It isn't a sandbox: a command could still reach the file without naming it. If the hook itself fails, the edit or command is stopped too.

**Subagents:** the coding agent has two, in `.claude/agents/`. Claude Code loads that folder when a session starts. Each one ends with a report in a set layout, and the hook in its file runs only once the project folder is trusted in Claude Code. If the hook itself fails, the tool call is stopped.

- **reviewer** reviews a branch, a commit or a range against `docs/REVIEW.md`, reading the spec, `AGENTS.md`, `docs/STANDARDS.md` and the branch's `plan.md`, and reports Important findings and at most five nits. By default it reviews the current branch against `main` as it stands in the working tree, including work not yet committed. It runs on Sonnet, so that a different model from the session's checks the work. It has Read, Grep, Glob and Bash. Claude Code can't limit Bash to some commands through the tool list, so a hook lets it run only commands that read: `git blame`, `cat-file`, `describe`, `diff`, `grep`, `log`, `ls-files`, `ls-tree`, `merge-base`, `rev-list`, `rev-parse`, `shortlog`, `show` and `status`, `git branch` to list branches, and `cat`, `cd`, `cut`, `diff`, `echo`, `grep`, `head`, `ls`, `pwd`, `rg`, `sort`, `tail`, `tr` and `wc`. They can be joined with `|`, `&&` or `;`, and send output to `/dev/null`. It stops redirects into a file, `$( )`, backticks, subshells, and the flags that let those commands write a file or run another program, such as `git diff --output` and `rg --pre`. Like the `.env` hook, it guards against mistakes and isn't a sandbox.
- **ui-check** opens the running app at `http://localhost:5173` with the Playwright MCP server, and checks each page against the brand skill, which its file loads, and the spec. The pages are the routes in `frontend/src/App.tsx`, with the first record of each kind and an unknown address. By default it checks every page at 1440 by 900 in light mode and then dark mode, reading computed styles to confirm fonts and colors, and the console and network for Q2 and C2. It reports what's broken, what's off-brand and up to five nits. It runs on the session's model. It has Read, Grep, Glob and the browser tools that look rather than enter data: it can open pages and dialogs, but can't type, drag or upload, and never saves, deletes or ticks anything, because the running app holds real records. A hook stops any Playwright tool from saving a file outside `.playwright-mcp/`, which git ignores, because a bare file name would land in the project folder.

**CI:** `.github/workflows/ci.yml` runs on every push, to any branch, on GitHub's Ubuntu runner. It installs gitleaks and runs it on every commit first, so a leaked secret fails the run straight away. Then it installs Node 26 and the latest uv, and runs `npm run check:quick`. It leaves out the end-to-end and speed tests, which took most of each 15-minute run, so they run only in `npm run check` on the developer's computer. It uses no secrets, and its token can only read the repo.

**End to end (Playwright Test)**, with the installed Chrome, not in CI:

- The tests run on several workers, chosen from the machine's cores and memory, and `ACCOUNTABLE_TEST_WORKERS` sets the number by hand. Each worker has its own servers, on ports from 5200 and 8800, and its own temporary database, with `reuseExistingServer` off. If they reused a server, they could attach to a running copy of the app and change real data. Tests that stop and restart the app start their own copy, on ports from 5300 and 8900.
- Every test fails on any console error it didn't name in advance, and on any request to an address outside the computer. The second check proves the offline requirement. Tests that expect a failed request, such as the 404 behind N4, name the exact message.
- Drags use `page.mouse` with several small moves, because dnd-kit needs to see the pointer travel.
- A stress run fills a test database to the limits in Q1 and checks the timings, taking the median of five readings. It runs last and alone, because timings need a quiet machine.
- Tests reach the app at 127.0.0.1, so a slow lookup of the name `localhost` can't stall them, and Chrome runs with `--disable-gpu`, because browsers compiling shaders side by side can hang on macOS.
- Each run leaves an HTML report, with a screenshot of each failure, in `playwright-report/main` and `playwright-report/speed`.

| Area | Requirements | Tests |
|---|---|---|
| Start and land on the dashboard | C1, C2, N1 to N5, M1 to M5 | `e2e/start.spec.ts` |
| Tables, forms, delete, reset, empty | T1 to T9, F1 to F9, D1 to D3, C3 to C6 | `e2e/records.spec.ts`, `e2e/data.spec.ts` |
| Filter and record pages | T6, R1 to R5 | `e2e/records.spec.ts` |
| Pipeline | P1 to P9, S1 to S6 | `e2e/pipeline.spec.ts` |
| Activities and timelines | A1 to A5, S2, H6 | `e2e/activities.spec.ts` |
| Dashboard figures | H1 to H8, S1 | `e2e/dashboard.spec.ts` |
| Five answers, two clicks | H9 | `e2e/problem.spec.ts`, then by hand, below |
| Light and dark mode | L1 to L4 | `e2e/mode.spec.ts` |
| Look and brand | Visual design, L5 | By hand, against the design reference and the dark mode screenshots |
| Layout, console, keyboard, Chrome | N3, Q2, Q3, Q4 | `e2e/quality.spec.ts` |
| Speed at the limits | Q1 | `e2e/stress.spec.ts` |
| Keeping data on this computer | Security | `e2e/security.spec.ts`, `backend/tests/test_every_route.py`, `backend/tests/test_security.py` |
| When things go wrong | N4, N6, F10, F11, D1, P4 | `e2e/failures.spec.ts`, `frontend/src/crm/forms/forms.test.tsx`, `frontend/src/crm/queries.test.tsx` |
| Layout rules | Layout rules | `backend/tests/test_layout.py`, `frontend/src/layout.test.ts` |

**By hand:** tests can't settle everything. The app is also used in Chrome at 1440 by 900 and 1280 by 720 the way a salesperson would, including with an emptied database, after a restart and with the network off, and each screen is compared with the design reference, in light mode and dark mode. The project owner checks that someone with no instructions can answer the five questions from the dashboard (H9), and has the final say, including on how it looks. Passing tests is necessary, but it isn't enough.
