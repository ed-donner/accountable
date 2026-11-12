# Alternative instructions for cheap or free LLMs

These instructions are based on the main instructions in [course/instructions/week2day5.md](../instructions/week2day5.md). They're more suitable if you're working with cheap or free models. You take the capstone through the same six stages and deploy it to Render, as in the lecture.

**What's different from the main instructions:**

- The capstone is a pipeline board in place of the AI Copilot. A Copilot sends your records to a model and acts on its answers. That's too risky with a free model, and the model calls cost extra.
- You build on your own `main`, from the earlier days.
- No OpenRouter key.
- Your agent builds one phase per session.
- Your assignment is a small change of your own.

The tips in [week1day3.md](week1day3.md) still apply.

# Week 2 Day 5 instructions

Today you build the capstone yourself: a pipeline board for Accountable, with a column for each stage, where you drag a deal to another column to change its stage. You write its intent and take it through the same stages as before, then deploy it to Render.

## Start the branch

```
git checkout main
git checkout -b pipeline
```

## Plan

Write your intent in your own words. A few lines of notes are enough, and your agent turns them into the intent. Some things to think about:

- What does each card show?
- What happens when you drop a card in another column? Does a move to Won or Lost need anything more?
- What does each column show at the top?
- What order do the cards go in within a column?
- Which library handles the drag and drop? `docs/TECH_STACK.md` prefers popular libraries to custom code.
- What happens if a move fails to save?
- How do the tests check a drag?

Then give your agent your notes:

```
Create docs/changes/pipeline/intent.md from my notes below, with five sections: Problem, Proposed outcome, Constraints, Not in this change and Success criteria. Then read it with docs/spec.md and ask me about anything unclear, at most three questions. Update the intent with my answers.

My notes: (your notes here)
```

If you'd rather start from mine, it's in full at the end of these instructions, under "My intent in full", with the prompt that creates it.

Answer its questions, then:

```
git add .
git commit -m "Plan: intent.md agreed"
```

## Design

```
Read the intent for this branch, in docs/changes/, and update docs/spec.md so it describes the product with this change, as it will be once it's merged. Use the brand skill. List any concerns at the top of your reply.
```

Resolve the concerns, then read the changes in VS Code's Source Control view. That diff is your design.

```
git add .
git commit -m "Design: the spec"
```

## Build

```
Read the intent for this branch, in docs/changes/, with docs/spec.md, and write plan.md beside the intent with four sections: Files that change, Order of work, Risks and Proof. Order the work in phases, each small enough to build in one session. Proof lists the tests. Don't write any code yet.
```

```
git add .
git commit -m "Build: plan.md"
```

Start a fresh session (`/clear` in Claude Code), then:

```
Read the plan.md for this branch, in docs/changes/, and implement the first phase that isn't marked done, and only that phase. Write its tests and run them. Then mark the phase done in the plan. Leave the commits to me.
```

```
git add .
git commit -m "Build: phase 1"
```

Repeat for each phase, in a fresh session each time, with the phase's number in the commit message.

## Test

```
Run npm run check and fix failures until it passes. Show me the output.
```

If the end-to-end test of a drag keeps failing:

```
Drag-and-drop libraries often ignore a drag that jumps straight to its target. Make the end-to-end test move the mouse in small steps, then run npm run check.
```

Then try it yourself. Run `npm run dev`, open the board and drag a deal to another column. Refresh the page and check that it stayed there. Then check that the deals table and the dashboard show its new stage. Go through the success criteria in the intent, and press Ctrl+C to stop the app when you're done.

```
git add .
git commit -m "Test: checks"
```

If git says there's nothing to commit, carry on.

## Deploy

Start a fresh session, then:

```
Use the reviewer subagent to review this branch against main. Report only, skip style.
```

If your agent has no subagents, use this prompt instead: "Review this branch against main with docs/REVIEW.md. Report only, skip style."

```
Fix the Important findings from the review. Run npm run check when you're done. Leave the commits to me.
```

```
git add .
git commit -m "Deploy: review fixes"
```

```
Follow docs/IMPROVE.md for this change. Leave the commits to me.
```

```
git add .
git commit -m "Deploy: harness improved"
git push fork pipeline
```

Wait for the **Actions** tab. If the run fails, open it and copy the error:

```
The CI run failed with this error: [paste the error]. Find the root cause, fix it and run npm run check. Leave the commits to me.
```

```
git add .
git commit -m "Deploy: CI fix"
git push fork pipeline
```

When the run passes, merge into `main` and push it to your fork:

```
git checkout main
git merge pipeline
git branch -d pipeline
git push fork main
```

Render deploys `main` once its CI checks pass. Open your app on Render, sign in and try the board. On the free plan the app sleeps after 15 minutes without visits, and the next visit takes about a minute to wake it.

## Your assignment

Make one small change of your own and take it through the six stages on a branch of its own. Any small change is fine, such as one of your Ideas for later in `docs/STATUS.md`. As an example, translate the whole app into another language, and better still, add a language selector.

```
git checkout main
git checkout -b my-change
```

## My intent in full

Here's my intent, if you'd like to use it or compare it with yours. This prompt creates it, in place of the Plan prompt above.

````
Create docs/changes/pipeline/intent.md with the text below. Then read it with docs/spec.md and ask me about anything unclear, at most three questions. Update the intent with my answers.

# Intent: the pipeline board

## Problem

The deals table shows each deal's stage, but there's no quick way to see the whole pipeline or move a deal along it.

## Proposed outcome

A Pipeline page in the top navigation shows the deals as cards on a board, with one column for each stage: New, Qualified, Proposal, Negotiation, Won and Lost. Each card shows the deal's name, its organization, its value and its close date. Dragging a card to another column changes the deal's stage. Each column shows how many deals it has and their total value.

## Constraints

- The drag and drop uses a popular library rather than custom code.
- Within a column, cards are ordered by close date, soonest first.
- A move is saved straight away and is still there after a refresh.
- If a move fails to save, the card goes back to its column and a message says so.
- The board follows the brand, in light and dark mode.
- No other new dependencies unless the plan makes the case for one.

## Not in this change

- Changing the order of the cards within a column.
- Adding, editing or deleting deals from the board.
- Changing the stages.

## Success criteria

1. npm run check passes.
2. Dragging a deal to another column changes its stage, and it stays there after a refresh.
3. The column totals change as soon as a card moves.
4. The deals table and the dashboard show the deal's new stage.
````
