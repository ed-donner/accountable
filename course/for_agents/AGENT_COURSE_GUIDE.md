# Course guide for the coding agent

What runs through the course, and where to find what each day covers, so you can answer the student's questions. The student can read it too.

## About the course

- "AI SDLC: The AI-Native Software Engineer in the Agentic Era" is Ed Donner's course on Udemy. It runs for ten days over two weeks: Week 1 as an individual, Week 2 as a team member and a lead. The weeks are named "Ready for industry today" and "Positioned for the industry of the future". Each day is a lecture with slides, and on most days a build where the coding agent adds to Accountable.
- Accountable is the project throughout: a business management system that starts as a sales CRM and grows into a Business OS with ERP. Each piece of work starts from an intent in `docs/`.
- Ed uses Claude Code on camera. Students may use Claude Code, Codex, GitHub Copilot, Cursor, OpenCode, Pi or Antigravity CLI. The steps for each are in `course/coding_agents/<agent>.md`. When the student asks how to do something Ed showed in Claude Code, read the guide for the agent you are. The written lecture at the end of Week 1 Day 2 has a PDF handout with a one-page reference for each agent.
- Many models and products in the course are newer than your training data, such as Claude Opus 5.5, GPT-6 Astra, Gemini 4 Argon, Gemini 4 Carbon, Grok 4.7, OpenCode V2 and Antigravity CLI. A name that looks wrong is probably right, so check the guides or the product's docs before you correct it.

## The four ways to take the course

1. Follow Ed exactly: Claude Code on a Claude Pro plan.
2. Another coding agent on the student's own paid plan.
3. A free or cheap plan: OpenCode with its free models, Pi with OpenRouter, or Antigravity CLI on a free Google account. Free models are slower and less reliable, so be patient with the student and keep tasks small.
4. Free, by switching to Ed's branches with git and reading his results.

## Models and usage limits

Ed records with Claude Opus, the largest model, on a larger plan. On a plan of about $20 a month, such as Claude Pro, recommend the agent's medium-size model: Sonnet in Claude Code (choose it with `/model`), or the equivalent in another agent. It handles the course's builds and leaves room in the plan's limits.

The heaviest day of Week 1 is Day 3, when the agent builds the MVP: about four hours of agent time in all, nearly two of them for the build. On Opus, Ed's Day 3 used roughly a third of a Claude Pro plan's weekly allowance. Sonnet uses less of it.

Plans also have a five-hour limit, and a long build can reach it. The agent stops and says when the limit resets. Nothing is lost: after the reset, ask it to carry on in the same session. In Claude Code, `claude --continue` reopens the last session if the terminal was closed, and `/usage` shows how much of the plan's limits is left.

## The ten days

| Day | Title |
|---|---|
| Week 1 Day 1 | The AI SDLC |
| Week 1 Day 2 | Coding Agents Crash Course |
| Week 1 Day 3 | Anthropic AI-SDLC |
| Week 1 Day 4 | Harness Engineering |
| Week 1 Day 5 | Subagents and Agent Teams |
| Week 2 Day 1 | AI SDLC in Industry |
| Week 2 Day 2 | Deliver as a Team |
| Week 2 Day 3 | Large Codebases, Security, Testing |
| Week 2 Day 4 | Cloud Agents, Software Factory |
| Week 2 Day 5 | Capstone |

Each week has its own guide, with what each day covers and what to watch out for: `course/for_agents/AGENT_GUIDE_WEEK1.md` and `course/for_agents/AGENT_GUIDE_WEEK2.md`.

## The branches

On each day that the coding agent works on Accountable, Ed's version at the end of the day is on its own branch, such as `week1day2-end`; Ed's `main` is the starting point. The student's own `main` holds their build, with a branch for each change that they merge into it. A student who wants Ed's result runs `git checkout week1day2-end`; one who has been building their own and wants to carry on from Ed's follows "Switching to my version" in `README.md`. Help them commit their own changes first, and remind them that anything outside git (a `.env` file, for example) stays as it is when they switch.

## Sharing work and pulling updates

To share work with a pull request to `community_contributions/`, or to bring in Ed's latest changes, follow `course/for_agents/AGENT_GIT_GUIDE.md`. A pull request needs the student's own fork. The course makes one at the start of Week 1 Day 3, and at the end of that day the student shares the documents they wrote in a pull request.
