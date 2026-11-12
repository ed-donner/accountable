# Alternative instructions for cheap or free LLMs

These instructions are based on the prompts on my Week 1 Day 3 slides and the main instructions in [course/instructions/week1day3.md](../instructions/week1day3.md). They're more suitable if you're working with cheap or free models. You follow the same six stages as the lecture with a much smaller build.

**The route through the course.** You build a simpler CRM: the MVP today, a harness and dark mode on Day 4, sign-in and a deploy to Render on Day 5, and a pipeline board on Week 2 Day 5. Week 2 Days 2 to 4 are lectures only. My branches hold my full build, which is much bigger than this one, so stay on your own build throughout.

**What's different from the main instructions:**

- A smaller MVP with four pages and three kinds of record. The pages are a dashboard with two charts, and tables with an Add form. There's no editing, deleting, search, pipeline board or activities.
- At the start of Plan, you replace `docs/intent.md` with the smaller intent below.
- Your agent makes one mockup of the dashboard, and you check it by eye. There are no Playwright screenshots.
- Your agent builds one phase per session, and you commit after each phase.
- A few tests at each level is enough.
- You compare the app with the mockup yourself.

# Week 1 Day 3 instructions

## Working with a cheap or free model

- **One step at a time.** Start a fresh session whenever a step says so, and whenever the agent starts going in circles. A fresh session has a clean context, and `docs/plan.md` tells it what's done.
- **Commit after each step that works.** To throw away a bad attempt and go back to your last commit:

  ```
  git restore .
  git clean -fd
  ```

- **Ask a smaller question when a step fails twice.** Describe one thing that's wrong, such as "The dashboard's bar chart is empty. Find the root cause and fix it."
- **Usage limits.** Free models and free plans limit how much you can use them each day or week, and the guide for your agent in [course/coding_agents/](../coding_agents/) says what they are. If you reach a limit, carry on once it resets, in a fresh session.

## Fork the repo

You share today's documents in a pull request at the end of the day, and that needs your own fork:

1. Open https://github.com/ed-donner/accountable and click **Fork**, then **Create fork**.
2. Add your fork as a second remote, with your GitHub username in place of `<username>`:

```
git remote add fork https://github.com/<username>/accountable.git
```

Your coding agent can explain each step.

## Start the branch

From your own `main`, with yesterday's setup committed:

```
git checkout main
git checkout -b mvp
```

## Stage 1: Plan

````
Replace everything in docs/intent.md with the text below. Then read it with docs/TECH_STACK.md and ask me about anything unclear, at most three questions. Update docs/intent.md with my answers.

# Intent: the Accountable MVP

## Problem

A small business keeps track of its customers and sales in spreadsheets, inboxes and people's heads. Nobody can see at a glance which companies we deal with, who our contacts are or what's in the sales pipeline.

## Proposed outcome

Accountable is a business management system that starts as a sales CRM. This first version, the MVP, is a simple sales CRM for one person, running on their own computer. It should look clean and professional.

### Four pages

A navigation bar at the top links to four pages:

- **Dashboard**, the landing page: three figures (the number of open deals, the value of the open pipeline and the revenue won this month), a bar chart of the open pipeline's value by stage, and a bar chart of the revenue won in each of the last six months.
- **Organizations**: a table of the companies we do business with.
- **Contacts**: a table of the people we deal with.
- **Deals**: a table of the potential sales.

Each table lists its records, newest first, with an Add button that opens a short form for a new record.

### Three kinds of record

- **Organization**: name, industry and website.
- **Contact**: name, email, the organization they belong to, and a status (lead, qualified or customer).
- **Deal**: name, the organization it's with, its stage (New, Qualified, Proposal, Negotiation, Won or Lost), its value in US dollars, and its expected or actual close date.

### Sample data

Accountable comes with sample data, so every page has something on it the first time it starts: about ten organizations, twenty contacts and twenty deals across every stage, including deals won in each of the last six months.

### Look and feel

The look follows Accountable's brand guidelines. The MVP is light mode, designed for a laptop or desktop screen.

## Affected users and systems

- One salesperson, using Accountable on their own computer.
- No other systems are involved yet.

## Constraints

- The technology in docs/TECH_STACK.md, kept as simple as possible.
- It runs locally with npm run dev and needs no internet connection to use.
- Every record added is still there after a refresh and after a restart.
- npm run seed resets the data to the sample data.
- The tests are a few backend unit tests, a few frontend unit tests and one end-to-end test that opens each page.
- Not in the MVP: editing or deleting records, a page for each record, search, sorting or filters, a pipeline board, activities or follow-ups, sign-in, dark mode or a layout for phones.

## Success criteria

1. npm run dev starts Accountable, and the browser shows the dashboard with sample data on every page.
2. An organization, a contact and a deal can each be added from their page, and each one is still there after a refresh and a restart.
3. The dashboard's figures and charts match the data, and they change when a deal is added.
4. npm test passes.
5. Every page looks clean and follows the brand.

## Open questions

- Editing records, a pipeline board, sign-in and sharing Accountable with the team come later.
````

Read the changes in VS Code's Source Control view and fix anything the agent got wrong.

```
git add .
git commit -m "Plan: intent.md agreed"
```

## Stage 2: Design

### The spec

```
Read docs/intent.md and write docs/spec.md with the requirements and the design for the MVP. Keep it short. Use the brand skill. List any concerns at the top.
```

Check it against the problem and the open questions in `docs/intent.md`, and answer the concerns.

```
git add .
git commit -m "Design: spec.md"
```

### The mockup

```
Make one mockup of the MVP's dashboard as an HTML file in docs/mockups/, following docs/spec.md and the brand skill.
```

Open it in your browser: in VS Code's Explorer, right-click the HTML file, choose **Reveal in Finder** (**Reveal in File Explorer** on a PC) and double-click it. If you'd like changes:

```
Change the mockup: [your notes]
```

When you're happy with it:

```
Add a line to docs/spec.md that the dashboard follows the mockup in docs/mockups/.
```

```
git add .
git commit -m "Design: mockup"
```

## Stage 3: Build

### Write the plan

```
Read docs/intent.md and docs/spec.md and write docs/plan.md with four sections: Files that change, Order of work, Risks and Proof. Order the work in at most four phases, each small enough to build in one session. Proof lists the unit and end-to-end tests. Don't write any code yet.
```

Read the plan and ask about anything you don't follow.

```
git add .
git commit -m "Build: plan.md"
```

### Build one phase at a time

Start a fresh session (`/clear` in Claude Code), then:

```
Read docs/plan.md and implement the first phase that isn't marked done, and only that phase. Write its tests and run them. Then mark the phase done in docs/plan.md. Leave the commits to me.
```

```
git add .
git commit -m "Build: phase 1"
```

Repeat for each phase, in a fresh session each time, with the phase's number in the commit message. When every phase is marked done, carry on to Test.

## Stage 4: Test

```
Make sure npm test runs all the unit and end-to-end tests and fails if any fail. Add it to AGENTS.md, run it, fix failures until it passes, and show me the output.
```

Then start the app the way `docs/STATUS.md` says, open it in your browser and compare the dashboard with your mockup. Go through the success criteria in `docs/intent.md`. If something's off:

```
Here's what's wrong: [your notes]. Fix it, then run npm test.
```

```
git add .
git commit -m "Test: check command"
```

## Stage 5: Deploy

### Write the review policy

A review policy is your judgment about what matters in this project, so you write this file yourself. Add a new file, `docs/REVIEW.md`, with the contents below. Change anything you'd judge differently.

```markdown
# Review policy

Every change is reviewed against this policy before it merges. The reviewer reports its findings and doesn't change any code.

## Passes

Make a separate pass over every change for each of these:

- **Bugs:** the code does what it's meant to, including when something goes wrong.
- **Security:** no secrets or personal data are exposed, and nobody can do what they shouldn't.
- **Matches spec.md and plan.md:** the change does what those documents say, with nothing missing and nothing extra.

## Important

An Important finding must be fixed before the change merges. A finding is Important if the change breaks behavior that should work, leaks data or breaks a rule in AGENTS.md.

## Nits

A nit is a small point, such as style or naming, that doesn't block the merge. Report at most five per review.
```

### Review the branch

Start a fresh session, then:

```
Review this branch against main with docs/REVIEW.md. Report only, skip style.
```

Then, in the same session:

```
Fix the Important findings. Run npm test when you're done. Leave the commits to me.
```

```
git add .
git commit -m "Deploy: review fixes"
```

### Merge it

Run `npm test` yourself. If it passes:

```
git checkout main
git merge mvp
git branch -d mvp
```

## Stage 6: Maintain

Start the app and use it like a salesperson would: add an organization, a contact and a deal, and watch the dashboard change. Then:

```
Here's what I noticed using the app: [your notes]. Add these to docs/STATUS.md under Ideas for later, one line each.
```

```
git add .
git commit -m "Maintain: ideas for later"
```

## Share your documents

```
Share today's documents in a pull request to community_contributions, following course/for_agents/AGENT_GIT_GUIDE.md.
```

Approve the push when your agent asks, then check the pull request on GitHub.
