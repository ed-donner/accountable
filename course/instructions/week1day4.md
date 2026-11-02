# Week 1 Day 4 instructions

Copy each prompt into your coding agent, in order, and read what it does before you commit. The slides explain why each step matters.

## Part 1: The harness

### Start the branch

From your own `main`:

```
git checkout main
git checkout -b harness
```

Or to carry on from my Day 3 version. This keeps your own work on a branch called `my-version` and moves your `main` onto my branch:

```
git branch my-version
git checkout --no-track -B main origin/week1day3-end
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

This is the longest step of the day. The prompt asks for 80% unit test coverage, which is what I use, and reaching it can mean writing a lot of new tests. You can change 80% to a lower number, or delete `, with unit test coverage of at least 80%` to leave coverage out.

Optional, in Claude Code only: start the prompt with "Use a dynamic workflow to" and lowercase the "Add" that follows. Claude Code then splits the work across several agents at once, which can be faster but uses more of your plan's limits.

```
Add npm run check, which runs all of these and fails if any of them fails:
- Prettier and ESLint for the frontend, using the recommended TypeScript, React Hooks and accessibility rules
- ruff format and ruff check for the backend
- A maximum cyclomatic complexity of 15 per function, using ESLint's complexity rule and ruff's C901 rule
- tsc for the frontend and ty for the backend
- gitleaks across the repo
- npm test, with unit test coverage of at least 80%
Add npm run check:quick, which runs the same checks without the end-to-end tests. Add npm run format to fix the formatting. Fix what the checks find, without weakening any rule. If a rule doesn't suit this project, ask me first. Add npm run check to AGENTS.md, run it and show me the output.
```

```
git add .
git commit -m "Harness: npm run check"
```

### Feedback in the loop: add the hooks

```
Add three hooks:
- A lefthook pre-commit hook that formats the staged files, then runs lint, types and gitleaks. Skip the tests, so that it stays quick.
- A hook for this coding agent that runs npm run check:quick when you finish a turn and sends any failure back to you to fix. It should block once and then let you stop, so it can't loop forever.
- A hook for this coding agent that blocks any edit to .env.
Test each one and tell me how you tested it. If this coding agent doesn't support one of these hooks, tell me.
```

```
git add .
git commit -m "Harness: hooks"
```

### Feedback in the loop: add CI

Open your fork on GitHub and click the **Actions** tab. If GitHub asks, enable workflows. Then:

```
Add .github/workflows/ci.yml with one job named check that runs on every push to any branch. It installs gitleaks and runs it across the repo first, so a leaked secret fails the run straight away. Then it installs Node, uv and Playwright's Chromium, and runs npm run check. If it fails, upload the Playwright report. Add no secrets. astral-sh/setup-uv has no major version tags like v10, so use the full version number of its latest release, and let it install the latest uv.
```

```
git add .
git commit -m "Harness: CI"
git push fork harness
```

Watch the run in the **Actions** tab until it passes. Mine took about 15 minutes. If it fails, open the run, copy the error and ask your agent to find the root cause and fix it. Then commit and push again.

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

A dark mode with a toggle on every page, across every section.

## Constraints

- Light mode stays the default, and the app remembers the choice.
- Light mode looks exactly as it does today, apart from the toggle.
- Colors stay in one place, as tokens, with no scattered overrides.
- Text in dark mode meets the same contrast rules as spec.md.
- Charts, dialogs and messages follow the mode too.
- No new dependencies unless the plan makes the case for one.

## Not in this change

- Following the device's own dark mode setting.
- A layout for phones.

## Success criteria

1. npm run check passes.
2. A new end-to-end test proves that the toggle works and is remembered after a reload.
3. Screenshots of the dashboard and the pipeline in both modes are saved in docs/changes/dark-mode/.
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
Read docs/changes/dark-mode/intent.md and docs/spec.md and write docs/changes/dark-mode/plan.md with four sections: Files that change, Order of work, Risks and Proof. Order the work in phases. Proof lists the unit and end-to-end tests. Don't write any code yet.
```

```
git add .
git commit -m "Build: plan.md"
```

Start a fresh session (`/clear` in Claude Code), then:

```
Implement docs/changes/dark-mode/plan.md, following its order of work. Write the tests in its Proof section and run them as you go. Leave the commits to me.
```

```
git add .
git commit -m "Build: dark mode"
```

### Test

```
Run npm run check and fix failures until it passes. Then take the screenshots in the intent's success criteria with Playwright, and show me the output and the screenshots.
```

Run `npm run check` yourself, open the app and go through the success criteria in the intent.

```
git add .
git commit -m "Test: checks and screenshots"
```

If git says there's nothing to commit, your agent took the screenshots during Build, so carry on.

### Deploy

Start a fresh session, then:

```
Review this branch against main with docs/REVIEW.md. Report only, skip style.
```

Fix the Important findings, then:

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

Wait for the **Actions** tab. This run takes about 20 minutes. GitHub runs Linux, so it can fail on something your own machine doesn't show. If it fails, open the run and copy the error:

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
