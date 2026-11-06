# AI SDLC: The AI-Native Software Engineer with Coding Agents

## Accountable: the course project

![An alien holds a model ship by Tower Bridge at sunrise](assets/accountable.jpg)

This is the repo that accompanies the course. Accountable is a business management system: a sales CRM that grows into a full Business OS, including ERP. Over the two weeks you and your coding agent build it together, using the practices the course teaches.

_If you're looking at this in VS Code or Cursor, right-click `README.md` in the Explorer on the left and choose **Open Preview** to see it formatted._

## What's in this repo

- `docs/`: the documents for Accountable, such as what we build and the tech stack it uses.
- `course/`: your guides. [course/SETUP.md](course/SETUP.md) installs the tools, and [course/coding_agents/](course/coding_agents/) has the steps for each coding agent.
- `course/for_agents/`: guides for your coding agent, so it can help you with the course.
- `course/instructions/`: extra instructions for some days, such as the review policy for Week 1 Day 3, every prompt for Week 1 Days 4 and 5, the worktree demo for Week 2 Day 1, my checkpoints for Week 2 Days 2 to 4, and every prompt for Week 2 Day 5.
- `AGENTS.md`: the instructions your coding agent reads at the start of each session.
- `community_contributions/`: work shared by students, added by pull request.

## Key links

- My curriculum of courses on Udemy: [edwarddonner.com/curriculum](https://edwarddonner.com/curriculum)
- My digital avatar, which answers common questions about my courses: [edwarddonner.com/avatar](https://edwarddonner.com/avatar)

And in case you haven't heard it from me enough, I'd be delighted if you'd consider connecting or following on [LinkedIn](https://www.linkedin.com/in/eddonner/) or subscribing on [YouTube](https://youtube.com/@edward.donner).

## Four ways to take the course

1. **Follow me exactly.** I use Claude Code in the terminal in VS Code, on a Claude Pro plan ([claude.com/pricing](https://claude.com/pricing)).
2. **Use your own paid plan** with another coding agent. The guide for your agent in [course/coding_agents/](course/coding_agents/) has every step.
3. **Use a free or cheap plan:** OpenCode with OpenCode Zen, or Pi with OpenRouter. Follow the guide for your agent, and expect free models to need a lot of patience.
4. **Go free and live vicariously through me.** Switch to my code with git each day (below) and get my results without spending tokens or time.

The guides for each agent:

- [Claude Code](course/coding_agents/claude_code.md)
- [Codex](course/coding_agents/codex.md)
- [GitHub Copilot](course/coding_agents/github_copilot.md)
- [Cursor](course/coding_agents/cursor.md)
- [OpenCode](course/coding_agents/opencode.md)
- [Pi](course/coding_agents/pi.md)

## For immediate help

Just ask your coding agent. It knows it's working on this course, and the guides in `course/for_agents/` tell it what each day covers.

## Switching to my version

You can follow the whole course with your own build. On each day that we work on Accountable with a coding agent, my version at the end of the day is on its own branch:

| Command | What it gets you |
|---|---|
| `git checkout main` | Your own build. When you first clone, it's the starting point: the documents in `docs/` and nothing set up yet |
| `git checkout week1day2-end` | My setup from Week 1 Day 2 in Claude Code: permissions, the Playwright MCP server, the brand skill and the frontend-design plugin |
| `git checkout week1day3-end` | My build from Week 1 Day 3 in Claude Code: the MVP of the sales CRM, with its documents and tests |
| `git checkout week1day4-end` | My build from Week 1 Day 4 in Claude Code: the harness (my coding standards, `npm run check`, hooks and CI) and dark mode. Install gitleaks first, as the Day 4 instructions show, because its commit hook needs it |
| `git checkout week1day5-end` | My build from Week 1 Day 5 in Claude Code: the reviewer and ui-check subagents, then sign-in with Supabase, search and the user menu, ready to deploy to Render. To run it against Supabase or deploy it, you need your own Supabase project and `.env`, as the Day 5 instructions show |
| `git checkout week2day2-end` | My build from Week 2 Day 2: products and company settings, built as two features at the same time |
| `git checkout week2day3-end` | My build from Week 2 Day 3: quotes, invoices and bills, the cash flow chart and one Money section |
| `git checkout week2day4-end` | My build from Week 2 Day 4, from a software factory on GitHub: the double-entry books, profit and loss, a balance sheet, the journal, aged balances, and an invoice made from an accepted quote |
| `git checkout week2day5-end` | My build from Week 2 Day 5: the AI Copilot. It needs an OpenRouter key in your `.env`, as the Day 5 instructions show |

Commit your own changes before you switch branches. From Week 2 Day 2 on, run `npm run seed` after you switch, then `npm run dev`. `npm run seed` brings your local database up to date and puts the sample data back, and it asks first: type `yes`.

Your `main` holds your own build for the whole course, and each change gets a branch of its own that you merge into `main` (Week 1 Day 3 explains this). If you've been building your own version and want to carry on from mine instead, keep yours on a branch, then move your `main` onto my branch for the day you want:

```bash
git branch my-version
git checkout --no-track -B main origin/week1day2-end
```

## Share your work

I'd love to see what you build! Please share it with a pull request to `community_contributions`. A pull request needs your own fork of the repo. We make one at the start of Week 1 Day 3, and at the end of that day you share the documents you wrote. The steps, and how to pull my latest changes, are in [course/for_agents/AGENT_GIT_GUIDE.md](course/for_agents/AGENT_GIT_GUIDE.md), and your coding agent can take you through them.

## The journey

### Week 1: Ready for industry today

**Day 1: The AI SDLC.** No code yet: the course, the job market and the lifecycle we follow.

**Day 2: Coding agents crash course.** Install the tools and your coding agent ([course/SETUP.md](course/SETUP.md)), set it up one piece at a time (instructions, settings, permissions, an MCP server, a skill, a plugin), then check your repo and commit it. The steps for your agent are in [course/coding_agents/](course/coding_agents/). My setup: `git checkout week1day2-end`.

**Day 3: Anthropic AI-SDLC.** Build the MVP of Accountable, a sales CRM for one person, and take it through each stage of Anthropic's AI-native SDLC on a branch: Plan, Design, Build, Test, Deploy and Maintain. Fork the repo at the start of the day and share the documents you wrote in a pull request at the end. My build: `git checkout week1day3-end`, then `npm run dev`.

**Day 4: Harness engineering.** Add a harness to Accountable: your coding standards, `npm run check`, hooks for git and your coding agent, and CI on GitHub. Then add dark mode through the six stages, with the harness in place. Every prompt is in [course/instructions/week1day4.md](course/instructions/week1day4.md). My build: install gitleaks as the instructions show, then `git checkout week1day4-end` and `npm run dev`.

**Day 5: Subagents and Agent Teams.** Add two subagents, a code reviewer and a UI checker. Then take one change through the six stages: sign-in and a shared database on Supabase, search, and a user menu, ending with the app live on Render. I build it with an agent team on camera, as a demo. Every prompt is in [course/instructions/week1day5.md](course/instructions/week1day5.md). My build: `git checkout week1day5-end` and `npm run dev`, which runs it on your computer with sample data and no Supabase. To run it against Supabase or deploy it, first set up your own Supabase project and write your `.env`, as the Day 5 instructions show.

### Week 2: Positioned for the industry of the future

**Day 1: AI SDLC in Industry.** No code today: how the AI SDLC lifecycles work for teams, with AWS's AI-DLC v2 in the most detail. At the end I demo git worktrees, and the steps are in [course/instructions/week2day1.md](course/instructions/week2day1.md) if you'd like to follow along.

**Day 2: Deliver as a Team.** A team builds two features at the same time: products and company settings. The lead prepares `main` first, then two developers each build one feature with their own coding agent in their own worktree, and the person who merges brings both together. Follow along with my checkpoints in [course/instructions/week2day2.md](course/instructions/week2day2.md). My build: `git checkout week2day2-end`, then `npm run seed` and `npm run dev`.

**Day 3: Large Codebases, Security, Testing.** A bigger team builds quotes, invoices and bills at the same time, and the integration lead merges them, tracking down a bug along the way. Then the lead makes one Money section while four developers work on the merged code: a review, a refactor, the sample data and a cash flow chart. Follow along with my checkpoints in [course/instructions/week2day3.md](course/instructions/week2day3.md). My build: `git checkout week2day3-end`, then `npm run seed` and `npm run dev`.

**Day 4: Cloud Agents, Software Factory.** A software factory builds the accounting side of Accountable. Each issue starts a coding agent on GitHub's own computers, which takes it through the six stages and opens a pull request. A second agent reviews each one, and the lead merges. The books come first, then profit and loss, a balance sheet, the journal, aged balances, and an invoice made from an accepted quote. Follow along with my checkpoints in [course/instructions/week2day4.md](course/instructions/week2day4.md). My build: `git checkout week2day4-end`, then `npm run seed` and `npm run dev`.

**Day 5: Capstone.** Build an AI Copilot into your own version of Accountable: a panel where you ask about your CRM and books in plain English and have it make changes for you. You take it through the six stages from one intent, then deploy it to Render. Its model comes from OpenRouter, which offers free models. Every prompt is in [course/instructions/week2day5.md](course/instructions/week2day5.md). Then your assignment: an import from Salesforce, Pipedrive or another CRM of your choice. My build: `git checkout week2day5-end`, then `npm run seed` and `npm run dev`.
