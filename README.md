# AI SDLC: The AI-Native Software Engineer with Coding Agents

## Accountable: the course project

![An alien holds a model ship by Tower Bridge at sunrise](assets/accountable.jpg)

This is the repo that accompanies the course. Accountable is a business management system: a sales CRM that grows into a full Business OS, including ERP. Over the two weeks you and your coding agent build it together, using the practices the course teaches.

_If you're looking at this in VS Code or Cursor, right-click `README.md` in the Explorer on the left and choose **Open Preview** to see it formatted._

## What's in this repo

- `docs/`: the documents for Accountable. `intent.md` says what we build first.
- `course/`: your guides. [course/SETUP.md](course/SETUP.md) installs the tools, and [course/coding_agents/](course/coding_agents/) has the steps for each coding agent.
- `course/for_agents/`: guides for your coding agent, so it can help you with the course.
- `AGENTS.md`: the instructions your coding agent reads at the start of each session.

## Key links

- My curriculum of courses on Udemy: [edwarddonner.com/curriculum](https://edwarddonner.com/curriculum)
- My digital avatar, which answers common questions about my courses: [edwarddonner.com/avatar](https://edwarddonner.com/avatar)

And in case you haven't heard it from me enough, I'd be delighted if you'd consider connecting or following on [LinkedIn](https://www.linkedin.com/in/eddonner/) or subscribing on [YouTube](https://youtube.com/@edward.donner).

## Four ways to take the course

1. **Follow me exactly.** I use Claude Code in the terminal in VS Code, on a Claude Pro plan ($20 a month).
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
| `git checkout main` | The starting point: the documents in `docs/` and nothing set up yet |
| `git checkout week1day2-end` | My setup from Week 1 Day 2 in Claude Code: permissions, the Playwright MCP server, the brand skill and the frontend-design plugin |

Commit your own changes before you switch branches.

## The journey

### Week 1: Ready for industry today

**Day 1: The AI SDLC.** No code yet: the course, the job market and the lifecycle we follow.

**Day 2: Coding agents crash course.** Install the tools and your coding agent ([course/SETUP.md](course/SETUP.md)), set it up one piece at a time (instructions, settings, permissions, an MCP server, a skill, a plugin), then check your repo and commit it. The steps for your agent are in [course/coding_agents/](course/coding_agents/). My setup: `git checkout week1day2-end`.
