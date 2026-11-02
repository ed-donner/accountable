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
- **Check and commit your setup:** check the repo against the tree and checklist in the guide, then commit with `git add .` and `git commit -m "Day 2 setup"`. The MVP is built on Day 3.

The slides also cover the context window: what fills it, `/context`, and what `/compact` does.

**Watch out for:**

- Claude Code ignores the project's settings until the folder has been trusted, and asks the student to approve a new server in `.mcp.json` the first time it starts. Accept both.
- After the skill step, `docs/BRAND.md` is gone and the brand guidelines live in the skill. Use the skill for any UI work.
- If the student skipped the setup, `git checkout week1day2-end` gets Ed's setup. Ed's branch has Claude Code's files; a student on another agent redoes the steps in their guide that add files for it, as section 11 of the guide lists. `docs/BRAND.md` is gone on Ed's branch, so for the brand skill copy `.claude/skills/brand/` to `.agents/skills/brand/` (Copilot and OpenCode read `.claude/skills/` as it is).

## Day 3: Anthropic AI-SDLC

The student builds the MVP of Accountable, a sales CRM for one person, from the business-level intent in `docs/intent.md`. First the student forks the repo on GitHub and adds the fork as a second remote, `fork` (step 1 of "Sharing work in a pull request" in `course/for_agents/AGENT_GIT_GUIDE.md`). The MVP then goes through each stage of Anthropic's AI-native SDLC on a branch called `mvp`:

- **Plan:** the agent interviews the student and updates `docs/intent.md` with their answers.
- **Design:** the agent writes `docs/spec.md` and makes three mockups in `docs/mockups/`, and the student chooses one.
- **Build:** the agent writes `docs/plan.md` in phases, the student questions it, and a fresh session builds the MVP from it.
- **Test:** `npm test` runs every unit and end-to-end test, and the agent compares the app with the chosen mockup using Playwright. Then the student runs the checks and uses the app themselves. Once `npm test` works, Ed suggests an optional step: ask the agent to make it faster by running tests in parallel where possible. If the student wants this, give each end-to-end worker its own servers and database, and choose the number of workers from the machine's cores and memory, as `scripts/test-plan.mjs` and `scripts/test-servers.mjs` do on `week1day3-end`.
- **Deploy:** the student creates `docs/REVIEW.md` by hand from the policy in `course/instructions/week1day3.md`, a fresh session reviews the branch against it, the agent fixes the Important findings, and the student merges `mvp` into `main`.
- **Maintain:** the student uses the app and adds ideas to `docs/STATUS.md`.
- **Share:** the student copies the day's documents into a folder of their own in `community_contributions/` and opens a PR ("The day's documents" in `course/for_agents/AGENT_GIT_GUIDE.md`).

The student commits at the end of each stage with `git add .` and `git commit -m` and the message on the slide, such as `"Design: spec.md"`. At the end of the day, `git log --oneline` shows a commit for each stage.

**Watch out for:**

- **Usage limits:** Day 3 is the heaviest day of the week. On a plan of about $20 a month, use Sonnet or the equivalent, and if a limit stops the build, wait for the reset and carry on in the same session ("Models and usage limits" in `course/for_agents/AGENT_COURSE_GUIDE.md`).
- **The agent may commit its own work,** for example after each phase when `plan.md` calls each phase a commit point. That's fine. "If the agent has committed" in `course/for_agents/AGENT_GIT_GUIDE.md` explains what to do.
- **The review can find Important bugs that every test missed.** That's what the stage is for, and it doesn't mean the build failed. The agent fixes them before the merge.

## Day 4: Harness engineering

The student adds a harness to Accountable, then makes one change through all six stages with the harness in place. The prompts are in `course/instructions/week1day4.md`. Each part has its own branch, and the student merges each one into their own `main`.

**Part 1, the harness,** on a branch called `harness`, with a step for each practice:

- **Shared capabilities:** the student starts the branch and installs gitleaks.
- **The repo as memory:** the agent moves `intent.md` and `plan.md` into `docs/changes/mvp/`, and `docs/spec.md` becomes the description of the whole product.
- **Enforced standards:** the student writes `docs/STANDARDS.md` by hand. The agent then adds `npm run check`, `npm run check:quick` and `npm run format`.
- **Feedback in the loop:** the agent adds a lefthook pre-commit hook, a hook that runs `npm run check:quick` when it finishes a turn, a hook that blocks edits to `.env`, and a GitHub Actions workflow. The student pushes the branch to their fork and watches the run.
- **Security:** the student tries to commit a fake key and sees the hook stop it, then skips the hook and sees CI fail.
- **Harness discipline:** the agent adds `docs/IMPROVE.md`, and the student merges `harness` into `main`.

**Part 2, dark mode,** on a branch called `dark-mode`. The stages are the same as Day 3. The intent has its own folder, `docs/spec.md` is edited on the branch, `npm run check` replaces `npm test`, and `docs/IMPROVE.md` runs at Deploy. The student pushes the branch to their fork, waits for CI and merges into `main`.

**Watch out for:**

- **Coverage:** Ed uses 80%, and reaching it is the longest step of the day. The student can lower the number in the prompt or leave coverage out. On a smaller plan, suggest a lower number.
- **gitleaks:** the pre-commit hook refuses every commit if gitleaks isn't installed, and its message says how to install it.
- **CI is slow:** 15 to 20 minutes on Ed's build, because the end-to-end tests run one at a time on GitHub's small machine. A leaked secret fails sooner, because gitleaks runs as its own step before anything else is installed.
- **CI fails at "Set up job":** GitHub couldn't find an action at the version the workflow names. `astral-sh/setup-uv` has published only exact versions since v8, so `@v10` fails. The CI prompt says so, but an agent can still miss it. Use the full version of its latest release, such as `@v10.3.3`. Leave out its `version` setting, so it installs the latest uv.
- **CI fails but the student's machine passes:** GitHub runs Linux on a small machine, so some failures only show there. Read the error in the run, find the root cause, fix it on the branch and push again, without skipping or weakening the test.
- **The fake key:** `npm run check` stays red until `make-it-fail` is deleted on both the student's machine and their fork, because gitleaks scans every branch.
- **Hooks in other agents:** if the student's agent doesn't support a hook, it says so. The pre-commit hook and CI work with any agent.
- **Starting from Ed's Day 3 version:** the student moves their `main` onto `week1day3-end` first, using the commands in the instructions. Branching from `week1day3-end` without moving `main` leads to conflicts at the merge.
