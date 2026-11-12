# Alternative instructions for cheap or free LLMs

These instructions are based on the main instructions in [course/instructions/week1day5.md](../instructions/week1day5.md). They're more suitable if you're working with cheap or free models. You add a reviewer subagent, then sign-in and a shared database on Supabase, and deploy the app to Render, through the same six stages.

**What's different from the main instructions:**

- One subagent, the reviewer. There's no ui-check, since it relies on screenshots that many free models can't read.
- No Quicker CI step, because your CI already leaves out the end-to-end tests.
- The change is sign-in and a shared database only. There's no search, user menu or record of who added each record.
- The spec stays in one file.
- You check the live database in Supabase's own dashboard, with no Supabase MCP server.
- No second review with Codex.
- Your agent builds one phase per session.
- You carry on from your own Day 4 build. My branches hold my full build, so stay on your own.

The tips in [week1day3.md](week1day3.md) still apply.

# Week 1 Day 5 instructions

All the prompts to create your subagent and build today's change, then deploy it to Render.

## Part 1: A subagent

If your coding agent has no subagents, skip Part 1. At Deploy, you then review the branch in a fresh session with docs/REVIEW.md, as on Day 4.

### Start the branch

From your own `main`:

```
git checkout main
git checkout -b subagents
```

### Create the reviewer

```
Create a project subagent for this coding agent called reviewer. It reviews the changes on a branch with docs/REVIEW.md and reports its findings by severity. It reads files and runs commands that only read, such as git diff, git log, git show and grep, and it never changes anything. If this coding agent has no subagents, tell me. Leave the commits to me.
```

If your agent lets a subagent use a different model from your session's, choose another one for the reviewer. A second model can catch what the first missed.

Your coding agent loads new subagents when it starts, so restart it (in Claude Code, type `/exit`, then `claude`). Then try it:

```
Ask reviewer to review the commit "Deploy: harness improved".
```

```
git add .
git commit -m "Subagents: reviewer"
git checkout main
git merge subagents
git branch -d subagents
```

## Part 2: Sign-in and a shared database

```
git checkout -b multi-user
```

### Set up Supabase

Supabase holds the database and the sign-in. Its free plan is enough.

1. Sign up at https://supabase.com and create a new project. Use only letters and numbers in the database password, since symbols such as `@` and `#` break the connection string. Save the password. Pick the region nearest you. I chose East US (North Virginia). Leave the **Security options** as they are.
2. Click **Connect** at the top of the project, choose **Session pooler** and copy the connection string. Put your database password in place of `[YOUR-PASSWORD]`, square brackets included.
3. In the same **Connect** dialog, choose your framework under **App Frameworks** to see the **Project URL** and the **publishable key**, starting `sb_publishable_`, and copy both. The key is also in **Settings**, under **API Keys**. Copy only the values. The names the dialog puts in front of them, such as `VITE_SUPABASE_URL`, aren't the ones `.env` uses.
4. In **Authentication**, open **Users**, click **Add user** and then **Create new user**. Enter your email and a password, leave **Auto confirm user?** ticked and click **Create user**.
5. Turn off sign-ups, so that nobody else can make an account: in **Authentication**, open **Sign In / Providers** and turn off **Allow new users to sign up**. Click **Save changes**.
6. Create a file called `.env` in the `accountable` folder with these three lines, using your own values. You write this file yourself, and never paste its values into your agent's chat. Git ignores it.

```
DATABASE_URL=postgresql://postgres.abcdefghijklmnopqrst:your-database-password@aws-1-us-east-1.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
```

7. Check your `.env` with this script. It tests the three settings, connects to the database and makes sure sign-ups are off. It doesn't print your password or key.

```
uv run course/check_supabase.py
```

It ends with "All good. Your .env is ready." or lists what to fix.

### Plan

Start a fresh session (`/clear` in Claude Code), then:

````
Create docs/changes/multi-user/intent.md with the text below. Then read it with docs/spec.md and ask me about anything unclear, at most three questions. Update the intent with my answers.

# Intent: sign-in and a shared database

## Problem

Accountable runs on one computer for one person. A team can't share it, and nobody signs in.

## Proposed outcome

A small team shares one Accountable on the web. Everyone signs in with an email and password and works on the same organizations, contacts and deals. A Sign out button sits in the top bar.

## Constraints

- The data lives in Postgres on Supabase, still through SQLAlchemy Core.
- Sign-in uses Supabase Auth with an email and password. The browser holds only the publishable key. The backend checks the token on every request.
- There's no sign-up page. People are added in Supabase's dashboard.
- The settings live in .env as DATABASE_URL, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.
- Row-level security is on for every table.
- npm run dev and the tests keep running on this computer with SQLite and a made-up signed-in user, and never touch Supabase. The made-up user works only on this computer, never on Render. CI needs no secrets.
- npm start builds the frontend and runs the app the way Render does, against Supabase.
- The app deploys to Render's free plan as one web service: FastAPI serves the built frontend and the API, the tables are set up when it starts, and it answers at its onrender.com address. A render.yaml describes it, with the Supabase settings entered in Render, not written in the file. It sets PYTHON_VERSION to a 3.12 release, and Render deploys only once CI passes.
- No new dependencies unless the plan makes the case for one.

## Not in this change

- Roles and permissions: everyone can do everything.
- Moving the data in the local SQLite file to Supabase. Supabase starts with the sample data.
- Signing in with Google, magic links or a password reset.

## Success criteria

1. npm run check passes and never touches Supabase.
2. Signed out, every page shows the sign-in screen and every API route refuses. Signed in, everything works as before.
3. npm start runs the app on this computer the way Render runs it, signed in against Supabase.
````

```
git add .
git commit -m "Plan: intent.md agreed"
```

### Design

```
Read docs/changes/multi-user/intent.md and update docs/spec.md so it describes the product with this change, as it will be once it's merged. Use the brand skill. List any concerns at the top of your reply.
```

Resolve the concerns, then read the changes in VS Code's Source Control view. That diff is your design.

```
git add .
git commit -m "Design: the spec"
```

### Build

```
Read docs/changes/multi-user/intent.md and docs/spec.md and write docs/changes/multi-user/plan.md with four sections: Files that change, Order of work, Risks and Proof. Order the work in phases, each small enough to build in one session: the database first, then sign-in, then the deploy to Render. Proof lists the tests. Don't write any code yet.
```

```
git add .
git commit -m "Build: plan.md"
```

Start a fresh session (`/clear` in Claude Code), then:

```
Read docs/changes/multi-user/plan.md and implement the first phase that isn't marked done, and only that phase. Write its tests and run them. Then mark the phase done in the plan. Leave the commits to me.
```

```
git add .
git commit -m "Build: phase 1"
```

Repeat for each phase, in a fresh session each time, with the phase's number in the commit message.

### Test

```
Run npm run check and fix failures until it passes. Show me the output.
```

Run `npm run check` yourself. Then try the app two ways:

- `npm run dev` runs it on this computer with the sample data, signed in as the made-up user.
- `npm start` runs it the way Render will, against your Supabase project. Sign in as the user you added and go through the success criteria in the intent. Press Ctrl+C to stop it.

Once `npm start` has run, your tables are in Supabase. Check them in Supabase's dashboard: open **Advisors**, then **Security Advisor**, and check that it lists no table with row-level security turned off. If it lists a problem, copy it to your agent:

```
Supabase's Security Advisor reports this: [paste the finding]. Find the root cause and fix it in the app, so that it's fixed every time the app starts. Run npm run check. Leave the commits to me.
```

```
git add .
git commit -m "Test: checks"
```

If git says there's nothing to commit, carry on.

### Deploy

Start a fresh session, then:

```
Use the reviewer subagent to review this branch against main. Report only, skip style.
```

If your agent has no subagents, use this prompt instead: "Review this branch against main with docs/REVIEW.md. Report only, skip style."

Then, in the same session, have your agent fix the Important findings:

```
Fix the Important findings from the review. Run npm run check when you're done. Leave the commits to me.
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

When the run passes, merge into `main` and push it to your fork. Render deploys your fork's `main`:

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
