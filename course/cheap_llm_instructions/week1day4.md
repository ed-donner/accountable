# Alternative instructions for cheap or free LLMs

These instructions are based on the main instructions in [course/instructions/week1day4.md](../instructions/week1day4.md). They're more suitable if you're working with cheap or free models. You build the same harness and add dark mode through the same six stages, with smaller steps and fewer checks.

**What's different from the main instructions:**

- The checks leave out test coverage, the complexity limit and ty, and you add them in two steps.
- CI leaves out the end-to-end tests from the start, so each run takes a few minutes.
- The git hook stays, and the hook for your coding agent is optional, since not every agent has hooks.
- Dark mode has a shorter intent, and your agent builds it one phase at a time.
- No screenshots.
- You carry on from your own Day 3 build. My branches hold my full build, so stay on your own.

The tips in [week1day3.md](week1day3.md) still apply.

# Week 1 Day 4 instructions

All the prompts to build your harness and implement today's feature.

## Part 1: The harness

### Start the branch

From your own `main`:

```
git checkout main
git checkout -b harness
```

Install gitleaks once.

Mac:

```
brew install gitleaks
```

Windows:

```
winget install -e --id Gitleaks.Gitleaks
```

### The repo as memory: reorganize the docs

```
Please reorganize the docs, ready for future changes. Move docs/intent.md and docs/plan.md into docs/changes/mvp/. Rewrite docs/spec.md so it describes the whole product as it stands today, bringing in the problem statement from the intent and removing anything that makes the intent the authority. Update AGENTS.md: spec.md is the first thing to read, each change has a folder docs/changes/<branch name>/ with its intent.md and plan.md, and only the current change's folder gets read. Add a line to docs/REVIEW.md to flag code that spec.md doesn't describe. Don't change any code.
```

```
git add .
git commit -m "Harness: reorganize the docs"
```

### Enforced standards: write your standards

Write `docs/STANDARDS.md` yourself. Say how you want code written in this repo: what you like, what you won't accept and what good looks like to you. A short file in your own words is fine.

Then:

```
Point to docs/STANDARDS.md from AGENTS.md, and add a line to docs/REVIEW.md to check changes against it. Don't change docs/STANDARDS.md.
```

```
git add .
git commit -m "Harness: coding standards"
```

### Enforced standards: add the checks

First the formatting, lint and types:

```
Add npm run check, which runs all of these and fails if any of them fails:
- Prettier and ESLint for the frontend, with ESLint's recommended rules for TypeScript and React Hooks
- ruff format and ruff check for the backend
- tsc for the frontend
Add npm run format to fix the formatting. Fix what the checks find, without weakening any rule. Run npm run check and show me the output.
```

Then the secret scan and the tests:

```
Add two more steps to the end of npm run check: gitleaks across the repo, allowing the git-ignored .env, and then npm test. Add npm run check:quick, which runs the same checks without the end-to-end tests. Add npm run check to AGENTS.md, run it and show me the output.
```

```
git add .
git commit -m "Harness: npm run check"
```

### Feedback in the loop: add the hooks

```
Add a lefthook pre-commit hook that formats the staged files, then runs lint, types and gitleaks. Skip the tests, so that it stays quick. Test it and tell me how you tested it.
```

Optional, if your coding agent has hooks:

```
Add a hook for this coding agent that blocks any edit to .env. Test it and tell me how you tested it. If this coding agent doesn't support hooks, tell me.
```

```
git add .
git commit -m "Harness: hooks"
```

### Feedback in the loop: add CI

Open your fork on GitHub and click the **Actions** tab. If GitHub asks, enable workflows. Then:

```
Add .github/workflows/ci.yml with one job named check that runs on every push to any branch. It installs gitleaks and runs it across the repo first, so a leaked secret fails the run straight away. Then it installs Node and uv, and runs npm run check:quick. Add no secrets. astral-sh/setup-uv has no major version tags like v10, so use the full version number of its latest release, and let it install the latest uv.
```

```
git add .
git commit -m "Harness: CI"
git push fork harness
```

Watch the run in the **Actions** tab until it passes. If it fails, open the run, copy the error and ask your agent to find the root cause and fix it. Then commit and push again.

### Security: make it fail

Start a branch you'll throw away:

```
git checkout -b make-it-fail
```

Add this line at the top of `frontend/src/main.tsx`, replacing the angle brackets with 32 random letters and digits that you make up:

```
// const apiKey = "<32 random letters and digits>";
```

Try to commit it. The pre-commit hook should stop you:

```
git add .
git commit -m "Fake key"
```

Now skip the hook, which anyone can do, and push:

```
git commit --no-verify -m "Fake key"
git push fork make-it-fail
```

The **Actions** tab shows the run failing within a minute, at the secret scan. Clean up:

```
git checkout harness
git branch -D make-it-fail
git push fork --delete make-it-fail
```

### Harness discipline: add the improvement step

````
Create docs/IMPROVE.md with exactly this text, and add a line to AGENTS.md to follow it at Deploy, after the review fixes and before the merge.

# Improve the harness

Run this at Deploy, after the review fixes and before the merge.

1. Look at what went wrong on this change: the review's findings, what the person corrected and what the checks caught.
2. For a mistake that has happened twice, add the correction to AGENTS.md or docs/REVIEW.md, or suggest a change to docs/STANDARDS.md for the person to make. If a tool can catch it, add it to the checks instead.
3. Remove anything out of date.
4. Improve this file, so that the next round makes a better change. Keep this as the last step.
````

```
git add .
git commit -m "Harness: improve"
```

Merge the harness into `main`:

```
git checkout main
git merge harness
git branch -d harness
```

## Part 2: Dark mode

```
git checkout -b dark-mode
```

### Plan

Start a fresh session (`/clear` in Claude Code), then:

````
Create docs/changes/dark-mode/intent.md with the text below. Then read it with docs/spec.md and ask me about anything unclear, at most three questions. Update the intent with my answers.

# Intent: dark mode

## Problem

Accountable only has a light mode, and some people prefer a dark screen.

## Proposed outcome

A toggle in the top bar switches every page between light and dark mode.

## Constraints

- Light mode stays the default, and the app remembers the choice after a reload.
- Light mode looks exactly as it does today, apart from the toggle.
- Colors stay in one place, as tokens, with no scattered overrides.
- The charts follow the mode too.
- No new dependencies.

## Not in this change

- Following the device's own dark mode setting.

## Success criteria

1. npm run check passes.
2. The toggle works on every page, and the choice is remembered after a reload.
3. A test checks that the choice is remembered.
4. Text is easy to read in both modes.
````

```
git add .
git commit -m "Plan: intent.md agreed"
```

### Design

```
Read docs/changes/dark-mode/intent.md and update docs/spec.md so it describes the product with dark mode, as it will be once this change is merged. Use the brand skill. List any concerns at the top of your reply.
```

Resolve the concerns, then read the changes to `docs/spec.md` in VS Code's Source Control view. That diff is your design.

```
git add .
git commit -m "Design: spec.md"
```

### Build

```
Read docs/changes/dark-mode/intent.md and docs/spec.md and write docs/changes/dark-mode/plan.md with four sections: Files that change, Order of work, Risks and Proof. Order the work in phases, each small enough to build in one session. Proof lists the tests. Don't write any code yet.
```

```
git add .
git commit -m "Build: plan.md"
```

Start a fresh session (`/clear` in Claude Code), then:

```
Read docs/changes/dark-mode/plan.md and implement the first phase that isn't marked done, and only that phase. Write its tests and run them. Then mark the phase done in the plan. Leave the commits to me.
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

Run `npm run check` yourself, open the app and go through the success criteria in the intent, on every page in both modes.

```
git add .
git commit -m "Test: checks"
```

If git says there's nothing to commit, carry on.

### Deploy

Start a fresh session, then:

```
Review this branch against main with docs/REVIEW.md. Report only, skip style.
```

Fix the Important findings:

```
Fix the Important findings from the review. Run npm run check when you're done. Leave the commits to me.
```

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
git push fork dark-mode
```

Wait for the **Actions** tab. If the run fails, open it and copy the error:

```
The CI run failed with this error: [paste the error]. Find the root cause, fix it and run npm run check. Leave the commits to me.
```

```
git add .
git commit -m "Deploy: CI fix"
git push fork dark-mode
```

When the run passes, read the slide "Would you merge it?", and if you would:

```
git checkout main
git merge dark-mode
git branch -d dark-mode
```

### Maintain

Start the app and try it in both modes. Then:

```
Here's what I noticed using the app: [your notes]. Add these to docs/STATUS.md under Ideas for later, one line each.
```

```
git add .
git commit -m "Maintain: ideas for later"
```
