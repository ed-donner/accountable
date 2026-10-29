# Week 1 guide for the coding agent: Ready for industry today

## Day 1: The AI SDLC

No repo work. The slides cover the course, how coding agents are changing the job (job postings, the five levels of adoption), the AI SDLC lifecycles from Anthropic, AWS, OpenAI, Google and Atlassian, and the human role: intent, judgment, taste and accountability. The instant win is a small app built from one paragraph in Claude's free plan.

## Day 2: Coding agents crash course

**Part 1, scene setting.** How LLMs work, tokens and the context window, intelligence, speed and cost on Artificial Analysis, and what an agent is: an LLM calling tools in a loop inside a harness. Students who know this already can watch it at double speed.

**Part 2, the agents.** A coding agent is a harness (Claude Code, Copilot, Codex, Cursor, OpenCode, Pi) plus an LLM. The slides cover the surfaces each agent comes in, a timeline from 2024 to 2026 with November 2025 as the turning point, the four ways to take the course, the installs (VS Code, Git, Node, uv and a coding agent), cloning this repo, and the commands in each agent (the table at the top of each guide).

**Part 3, the crash course,** in Claude Code. The student sets up their agent one step at a time while the slides explain each piece. Each agent's guide, `course/coding_agents/<agent>.md`, has the same eleven sections. After "Install and sign in" they are:

- **Markdown and AGENTS.md:** read `AGENTS.md` and `docs/intent.md`.
- **Your own instructions file:** add a personal preference to the user-level file.
- **Config folders and scopes:** look around the agent's config folders.
- **Settings:** the shared and personal settings files; nothing to change.
- **Permissions:** in Claude Code, allow `Bash(npm test)`, ask before `git push`, deny reading `.env`. Auto mode sets aside broad allow rules such as `Bash(npm run *)`.
- **MCP:** add the Playwright server at project scope.
- **Code Mode:** an explanation, nothing to do.
- **A skill:** move `docs/BRAND.md` into a `brand` skill.
- **A plugin:** in Claude Code, `frontend-design`.
- **Check and commit your setup:** check the repo against the tree and checklist in the guide, then commit with `git add .` and `git commit -m "Day 2 setup"`. The prototype is built on Day 3.

The slides also cover the context window: what fills it, `/context`, and what `/compact` does.

**Watch out for:**

- Claude Code ignores the project's settings until the folder has been trusted, and asks the student to approve a new server in `.mcp.json` the first time it starts. Accept both.
- After the skill step, `docs/BRAND.md` is gone and the brand guidelines live in the skill. Use the skill for any UI work.
- If the student skipped the setup, `git checkout week1day2-end` gets Ed's setup. Ed's branch has Claude Code's files; a student on another agent redoes the steps in their guide that add files for it, as section 11 of the guide lists. `docs/BRAND.md` is gone on Ed's branch, so for the brand skill copy `.claude/skills/brand/` to `.agents/skills/brand/` (Copilot and OpenCode read `.claude/skills/` as it is).
