# Course guide for the coding agent

What runs through the course, and where to find what each day covers, so you can answer the student's questions. The student can read it too.

## About the course

- "AI SDLC: The AI-Native Software Engineer with Coding Agents" is Ed Donner's course on Udemy. It runs for ten days over two weeks: Week 1 as an individual, Week 2 as a team member and a lead. The weeks are named "Ready for industry today" and "Positioned for the industry of the future". Each day is a lecture with slides, and on most days a build where the coding agent adds to Accountable.
- Accountable is the project throughout: a business management system that starts as a sales CRM and grows into a Business OS with ERP. Each piece of work starts from an intent in `docs/`.
- Ed uses Claude Code on camera. Students may use Claude Code, Codex, GitHub Copilot, Cursor, OpenCode or Pi. The steps for each are in `course/coding_agents/<agent>.md`. When the student asks how to do something Ed showed in Claude Code, read the guide for the agent you are.
- Many models and products in the course are newer than your training data, such as Claude Opus 5.5, GPT-6 Astra, Gemini 4 Argon, Gemini 4 Carbon, Grok 4.7 and OpenCode V2. A name that looks wrong is probably right, so check the guides or the product's docs before you correct it.

## The four ways to take the course

1. Follow Ed exactly: Claude Code on a Claude Pro plan.
2. Another coding agent on the student's own paid plan.
3. A free or cheap plan: OpenCode with OpenCode Zen, or Pi with OpenRouter. Free models are slower and less reliable, so be patient with the student and keep tasks small.
4. Free, by switching to Ed's branches with git and reading his results.

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

Each week has its own guide, with what each day covers and what to watch out for: `course/for_agents/AGENT_GUIDE_WEEK1.md`.

## The branches

On each day that the coding agent works on Accountable, Ed's version at the end of the day is on its own branch, such as `week1day2-end`; `main` is the starting point. A student who wants Ed's result runs `git checkout week1day2-end`. Help them commit their own changes first, and remind them that anything outside git (a `.env` file, for example) stays as it is when they switch.
