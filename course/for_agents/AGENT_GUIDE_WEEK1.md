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
- **gitleaks:** the pre-commit hook refuses every commit if gitleaks isn't installed, and its message says how to install it. The check allows the git-ignored `.env`, where the student's own keys go from Day 5.
- **CI is slow:** 15 to 20 minutes on Ed's build, because the end-to-end tests run one at a time on GitHub's small machine. A leaked secret fails sooner, because gitleaks runs as its own step before anything else is installed.
- **The browser in CI:** the end-to-end tests use the Google Chrome that GitHub's Ubuntu runner already has, because Chrome is the browser Accountable supports. Don't install Playwright's Chromium for them.
- **CI fails at "Set up job":** GitHub couldn't find an action at the version the workflow names. `astral-sh/setup-uv` has published only exact versions since v8, so `@v10` fails. The CI prompt says so, but an agent can still miss it. Use the full version of its latest release, such as `@v10.3.3`. Leave out its `version` setting, so it installs the latest uv.
- **CI fails but the student's machine passes:** GitHub runs Linux on a small machine, so some failures only show there. Read the error in the run, find the root cause, fix it on the branch and push again, without skipping or weakening the test.
- **The fake key:** `npm run check` stays red until `make-it-fail` is deleted on both the student's machine and their fork, because gitleaks scans every branch.
- **Hooks in other agents:** if the student's agent doesn't support a hook, it says so. The pre-commit hook and CI work with any agent.
- **Starting from Ed's Day 3 version:** the student moves their `main` onto `week1day3-end` first, using the commands in the instructions. Branching from `week1day3-end` without moving `main` leads to conflicts at the merge.

## Day 5: Subagents and Agent Teams

The student adds two subagents to Accountable, then takes one change through all six stages and deploys the app to Render. The prompts are in `course/instructions/week1day5.md`. Each part has its own branch, and the student merges each one into their own `main`.

**Part 1, subagents,** on a branch called `subagents`. The agent creates two project subagents and tries each one:

- **reviewer:** reviews the changes on a branch with `docs/REVIEW.md`, reports findings by severity and changes nothing. It runs on a different model from the student's session: Sonnet, or Haiku if the session already runs Sonnet.
- **ui-check:** opens the running app with the Playwright MCP server, takes a screenshot of each page and checks it against the brand skill and the spec.

**Part 2, sign-in, search and a user menu,** on a branch called `multi-user`. The student sets up Supabase by hand first: a free project, the session pooler's connection string, the project URL and publishable key, one user, and sign-ups turned off. They write the three lines of `.env` themselves. Then the six stages, as on Day 4, with two differences: Design starts by splitting `docs/spec.md` into a short summary and one file per area in `docs/specs/`, and Deploy uses the reviewer subagent, merges into `main`, pushes `main` to the fork and sets up Render, which deploys each time CI passes on `main`.

Ed builds the change with an agent team on camera as a demo. Students build it in one session.

**Watch out for:**

- **Subagents in other coding agents:** use that agent's own kind of subagent, saved in the project, and say so if it has none.
- **New subagents need a restart:** Claude Code only loads a new `.claude/agents/` folder when a session starts, so after creating the first subagents the student exits and starts Claude Code again before trying them.
- **The reviewer's model:** if the student's session already runs Sonnet, the reviewer uses Haiku, so a different model checks the work.
- **The reviewer and hooks:** Claude Code can't limit a subagent's Bash to some commands through its tool list, so the agent may add a hook that lets the reviewer run only commands that read. The hook must still let it search (`grep`, `git show`, `git grep`), or its reviews miss things. Agent-file hooks only run once the folder is trusted.
- **ui-check's screenshots:** they belong in `.playwright-mcp/`, which git ignores. Screenshots in the project root would be committed by the next `git add .`.
- **ui-check is slow on the session's model:** it runs on the session's model unless its file sets one, and checking every page in both modes can take 10 to 40 minutes on Opus.
- **`.env`:** the hooks stop the agent from reading or editing `.env`, so the student writes it. Never ask them to paste its values into the chat.
- **`npm run check` fails at its gitleaks step once `.env` exists:** gitleaks reads the publishable key in `.env` as an API key. Day 4's checks prompt now asks for the git-ignored `.env` to be allowed, but a build from before that change may not allow it. The fix is in `.gitleaks.toml`: allow the git-ignored `.env` and nothing else. Ask the student before changing it, since AGENTS.md says not to loosen a setting without asking.
- **The database connection:** use the session pooler's connection string from Supabase's Connect dialog, port 5432. The direct connection is IPv6 only on the free plan, and Render can't reach it. Copy the host from the dialog, since the `aws-0` or `aws-1` part varies.
- **Sign-ups:** turning off "Allow new users to sign up" matters, because the publishable key is public by design. With sign-ups on, anyone could make an account on the student's live app.
- **Supabase's free plan:** two active free projects per person. A paused project doesn't count. The plan may suggest a second, throwaway project for checks by hand; that's optional.
- **Supabase's Data API:** Supabase serves the tables in the `public` schema to anyone holding the publishable key unless row-level security is on. Every table needs it, turned on in a migration, including any table a later change adds.
- **The region:** `render.yaml` sets Render's region, which can't change once the service exists. It should be the Render region nearest the Supabase project (`oregon`, `ohio`, `virginia`, `frankfurt` or `singapore`); every query crosses between the two.
- **Two ways to run it:** `npm run dev` runs on this computer with the sample data and made-up teammates, and never touches Supabase. `npm start` builds the app and runs it the way Render does, against Supabase, and its migrations change the real database.
- **Today's date on Render:** Render runs on UTC, so `render.yaml` should set `TZ` to the team's time zone, such as `America/New_York`.
- **The `.env` hook stops any shell command that names `.env`,** even a help message that mentions it. The agent can write such a file with its file tools instead.
- **Render's Python version:** Render's default Python is newer than the 3.12 that `pyproject.toml` requires, so `render.yaml` should set `PYTHON_VERSION` to a 3.12 release.
- **Render's free plan:** the app sleeps after 15 minutes without visits and takes about a minute to wake. The first deploy starts when the student clicks Deploy Blueprint. After that, each push to `main` deploys once CI passes on it, about 15 to 20 minutes after the push.
- **Render's button:** after New, then Blueprint, the student clicks Connect beside their fork, names the Blueprint, chooses `main` and pastes the three values. The last button is Deploy Blueprint.
- **Render doesn't deploy:** check the fork's Actions tab. Render deploys only after the CI run on `main` passes, and never if the repo has no CI run at all.
- **A second review with Codex:** `codex exec -s read-only "..."` takes several minutes and may run the tests itself, so it shouldn't run while another test run is going (the end-to-end tests use fixed ports). Paste its report into the fix prompt, as the instructions show. (`codex review --base main` won't take a prompt alongside `--base`.)
- **Deploying elsewhere:** if the student would rather deploy somewhere other than Render, such as Fly.io or AWS Lambda, work with them to set that up instead. Any host needs the same things: the built app served with the API, the Supabase settings as environment variables, and a deploy from `main` that waits for CI to pass.
- **Starting from Ed's Day 4 version:** the student moves their `main` onto `week1day4-end` first, using the commands in the instructions.
