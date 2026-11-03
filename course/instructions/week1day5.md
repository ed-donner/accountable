# Week 1 Day 5 instructions

All the prompts to create your subagents and build today's change, then deploy it to Render.

## Part 1: Subagents

### Start the branch

From your own `main`:

```
git checkout main
git checkout -b subagents
```

Or to carry on from my Day 4 version. This keeps your own work on a branch called `my-day4` and moves your `main` onto my branch:

```
git branch my-day4
git checkout --no-track -B main origin/week1day4-end
git checkout -b subagents
```

### Create two subagents

The reviewer runs on Sonnet, so that a different model from your session's checks the work. If your session already runs Sonnet, change "Sonnet" to "Haiku" in the prompt.

```
Create two project subagents for this coding agent:
- reviewer: reviews the changes on a branch with docs/REVIEW.md and reports its findings by severity. It reads files and runs commands that only read, such as git diff, git log, git show and grep, and it never changes anything. It runs on Sonnet.
- ui-check: checks the running app in the browser with the Playwright MCP server. It opens each page, takes a screenshot, checks it against the brand skill and docs/spec.md, and reports anything off-brand or broken. It saves its screenshots in .playwright-mcp/, which git ignores, and it doesn't change any code.
Leave the commits to me.
```

Your coding agent loads new subagents when it starts, so restart it (in Claude Code, type `/exit`, then `claude`). Then try them:

```
Start the app, ask ui-check to look at the dashboard and the pipeline, and ask reviewer to review the last commit on main. Then stop the app.
```

```
git add .
git commit -m "Subagents: reviewer and ui-check"
```

### Quicker CI

The end-to-end tests take up most of the 15 minutes of each CI run. From today, CI leaves them out. They still run on your computer in `npm run check`:

```
Change .github/workflows/ci.yml to run npm run check:quick instead of npm run check, so that CI leaves out the end-to-end tests. Take out any step that only the end-to-end tests need, and update the docs that describe CI. Leave the commits to me.
```

```
git add .
git commit -m "CI: leave out the end-to-end tests"
git checkout main
git merge subagents
git branch -d subagents
```

## Part 2: Sign-in, search and a user menu

```
git checkout -b multi-user
```

### Set up Supabase

Supabase holds the database and the sign-in. Its free plan is enough.

1. Sign up at https://supabase.com and create a new project. Save the database password it shows you.
2. Click **Connect** at the top of the project, choose **Session pooler** and copy the connection string. Put your database password in place of `[YOUR-PASSWORD]`.
3. In the same **Connect** dialog, choose your framework under **App Frameworks** to see the **Project URL** and the **publishable key**, starting `sb_publishable_`, and copy both. The key is also in **Settings**, under **API Keys**.
4. In **Authentication**, open **Users**, click **Add user** and then **Create new user**. Enter your email and a password, leave **Auto confirm user?** ticked and click **Create user**.
5. Turn off sign-ups, so that nobody else can make an account: in **Authentication**, open **Sign In / Providers** and turn off **Allow new users to sign up**. Click **Save changes**.
6. Create a file called `.env` in the `accountable` folder with these three lines, using your own values. Your agent's hook stops it from touching `.env`, so you write this file yourself. Git ignores it.

```
DATABASE_URL=postgresql://postgres.abcdefghijklmnopqrst:your-database-password@aws-1-us-east-1.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
```

### Connect your agent to Supabase, read-only

Supabase's MCP server lets your agent look at your project. Connect it read-only and to this one project, so your agent can read the database but can't change it. Changes to the database go through the app's migrations, which are in git.

1. Find your project's ref, the part of `SUPABASE_URL` before `.supabase.co`.
2. In the terminal, in the `accountable` folder, run this with your own ref in place of `abcdefghijklmnopqrst`. Claude Code keeps the server for this folder on your computer only, so your project ref stays out of git.

```
claude mcp add --transport http supabase "https://mcp.supabase.com/mcp?project_ref=abcdefghijklmnopqrst&read_only=true"
```

3. Restart Claude Code (`/exit`, then `claude`). Type `/mcp`, choose **supabase**, then **Authenticate**, and sign in to Supabase in the browser.

With another coding agent, use the same address. Supabase's guide shows how to add it to each one: https://supabase.com/docs/guides/getting-started/mcp

### Plan

Start a fresh session (`/clear` in Claude Code), then:

````
Create docs/changes/multi-user/intent.md with the text below. Then read it with docs/spec.md and ask me about anything unclear, at most three questions. Update the intent with my answers.

# Intent: sign-in, search and a user menu

## Problem

Accountable runs on one computer for one person. A team can't share it, nobody signs in, and there's no quick way to find a record.

## Proposed outcome

A small team shares one Accountable on the web. Everyone signs in and works on the same organizations, contacts and deals, and each record shows who added it. A search box in the top bar finds any organization, contact or deal. A menu under your initials holds the theme, light, dark or system, and signing out.

## Constraints

- The data lives in Postgres on Supabase, still through SQLAlchemy Core. The tests keep their own SQLite databases.
- Sign-in uses Supabase Auth with an email and password. The browser holds only the publishable key. The backend checks the token on every request and takes the user from it, never from the request.
- There's no sign-up page. People are added in Supabase's dashboard.
- The settings live in .env as DATABASE_URL, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.
- Each organization, contact, deal and activity records who added it and who last changed it.
- The end-to-end tests and ui-check sign in without anyone's real password and never touch Supabase. CI needs no secrets.
- Search ignores case and works the same on SQLite and Postgres.
- The theme moves from the dark mode button into the menu. System follows the device's setting.
- Accountable now needs an internet connection, for Supabase. The tests still run without one.
- The app deploys to Render's free plan as one web service: FastAPI serves the built frontend and the API, migrations run when it starts, and it answers at its onrender.com address. A render.yaml describes it, with the Supabase settings entered in Render, not written in the file.
- Every unit test, old and new, runs in under a second on this computer, because CI runs on a much slower machine.
- No new dependencies unless the plan makes the case for one.

## Not in this change

- Roles and permissions: everyone can do everything.
- Moving the data in the local SQLite file to Supabase. Supabase starts with the sample data.
- Signing in with Google, magic links or a password reset.

## Success criteria

1. npm run check passes and never touches Supabase, with or without the settings in .env.
2. Signed out, every page shows the sign-in screen and every API route refuses. Signed in, everything works as before.
3. Every record and activity shows who added it.
4. Search finds an organization, a contact and a deal by part of a name, in any case.
5. The menu's theme choice is remembered, and System follows the device's setting.
6. The built app runs on this computer the way Render runs it, signed in against Supabase.
````

```
git add .
git commit -m "Plan: intent.md agreed"
```

### Design

The spec has grown to over 800 lines, so first split it by product area. Your agent then reads only the parts each change needs.

```
Split docs/spec.md by product area. Keep docs/spec.md at the same path as a short summary of the whole product with an index, and move the detail into one file per area in docs/specs/, such as docs/specs/deals.md. Don't change what the spec says, only where it lives. Update AGENTS.md: read docs/spec.md first, then only the area files the current change touches, and keep the files that a change affects up to date in the same change. Update docs/REVIEW.md so its spec checks cover the area files. Don't change any code.
```

```
git add .
git commit -m "Design: split the spec"
```

Now the design for the change:

```
Read docs/changes/multi-user/intent.md and update docs/spec.md and the area files in docs/specs/ so they describe the product with this change, as it will be once it's merged. Add an area file if the change needs one. Use the brand skill. List any concerns at the top of your reply.
```

Resolve the concerns, then read the changes in VS Code's Source Control view. That diff is your design.

```
git add .
git commit -m "Design: the spec"
```

### Build

```
Read docs/changes/multi-user/intent.md and docs/spec.md and write docs/changes/multi-user/plan.md with four sections: Files that change, Order of work, Risks and Proof. Order the work in phases: sign-in and the database first, then search, then the user menu. In Files that change, group the files by part, so that each part could be built by a different agent without two of them editing the same file. Proof lists the unit and end-to-end tests. Don't write any code yet.
```

```
git add .
git commit -m "Build: plan.md"
```

Start a fresh session (`/clear` in Claude Code), then:

```
Implement docs/changes/multi-user/plan.md, following its order of work. Write the tests in its Proof section and run them as you go. Leave the commits to me.
```

```
git add .
git commit -m "Build: sign-in, search and the user menu"
```

### Test

```
Run npm run check and fix failures until it passes. Then use the ui-check subagent to check every page signed in, and show me its report and the screenshots.
```

If ui-check found problems that this change caused, have your agent fix them:

```
Fix the problems ui-check found that this change caused, then run npm run check.
```

Run `npm run check` yourself. Then try the app two ways:

- `npm run dev` runs it on this computer with the sample data, and you sign in as one of the made-up teammates.
- `npm start` runs it the way Render will, against your Supabase project. Sign in as the user you added and go through the success criteria in the intent. Press Ctrl+C to stop it.

Once `npm start` has run, your tables are in Supabase. Have your agent check them:

```
Use the Supabase MCP server to check the live database: list its tables, confirm that row-level security is on for every table, and run Supabase's security advisors. Report only.
```

```
git add .
git commit -m "Test: checks and ui-check"
```

If git says there's nothing to commit, carry on.

### Deploy

Start a fresh session, then:

```
Use the reviewer subagent to review this branch against main. Report only, skip style.
```

If you have Codex as well, a second review from a different company's model can catch what the first missed. Run this in the terminal, when nothing else is running the tests. It takes several minutes:

```
codex exec -s read-only "Review this branch against main with docs/REVIEW.md. Report only, skip style."
```

Then, in the same session as the review, have your agent fix the Important findings. If you ran Codex, paste its report where the brackets are, or leave that sentence out:

```
Fix the Important findings from the review. Codex found these too: [paste Codex's report]. Run npm run check when you're done. Leave the commits to me.
```

Then open `render.yaml` and check that its `region` is the Render region nearest your Supabase project: `oregon`, `ohio`, `virginia`, `frankfurt` or `singapore`. Render can't change it later.

```
git add .
git commit -m "Deploy: review fixes"
```

In the same session:

```
Follow docs/IMPROVE.md for this change. Leave the commits to me.
```

```
git add .
git commit -m "Deploy: harness improved"
git push fork multi-user
```

Wait for the **Actions** tab. If the run fails, open it and copy the error:

```
The CI run failed with this error: [paste the error]. Find the root cause, fix it and run npm run check. Leave the commits to me.
```

```
git add .
git commit -m "Deploy: CI fix"
git push fork multi-user
```

When the run passes, merge into `main` and push it to your fork. Render deploys your fork's `main`, and CI runs on it first:

```
git checkout main
git merge multi-user
git branch -d multi-user
git push fork main
```

### Set up Render

1. Sign up at https://render.com with your GitHub account. The free plan is enough.
2. Click **New**, then **Blueprint**, and connect GitHub. When GitHub asks which repositories Render can see, choose **Only select repositories** and pick your fork of `accountable`.
3. Click **Connect** beside your fork, give the Blueprint a name and choose the `main` branch. Render reads `render.yaml` and asks for the three Supabase values: paste the same ones as in your `.env`.
4. Click **Deploy Blueprint**. Render builds the app and deploys it. From now on, each push to your fork's `main` deploys once CI passes.

### Live on Render

Open the address Render shows, ending in `onrender.com`, and sign in as your Supabase user. On the free plan the app goes to sleep after 15 minutes without visits, and the next visit takes about a minute to wake it.

### Maintain

Use the live app for a while. Then:

```
Here's what I noticed using the app: [your notes]. Add these to docs/STATUS.md under Ideas for later, one line each.
```

```
git add .
git commit -m "Maintain: ideas for later"
```
