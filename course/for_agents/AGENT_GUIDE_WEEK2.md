# Week 2 guide for the coding agent: Positioned for the industry of the future

## Day 1: AI SDLC in Industry

No repo work. A short theory day on how the AI SDLC lifecycles work for teams, with many people as well as many agents. The slides cover the problems teams run into with coding agents, the five lifecycles from Week 1 Day 1 (Anthropic, AWS, OpenAI, Google and Atlassian) compared stage by stage, and AWS's AI-DLC v2 in the most detail: its pieces of work (intents, Units and Bolts), the people and agents on a team, its phases, stages and approval gates, its scopes, how it runs in a coding agent, its team mode and the setup a whole team shares. AI-DLC v2 runs in the coding agent with AWS's `aidlc` tool and needs no AWS account. The day then covers what changes in the course as it moves from one person to a team: Anthropic's six stages stay, with several developers on different changes, teammates reviewing each pull request and shared cloud agents.

The day ends with git worktrees: one slide, then Ed's two-minute demo. The steps are in `course/instructions/week2day1.md` for students who want to follow along. It's optional.

**Watch out for:**

- **The demo runs in a throwaway repo** called `demo`, made beside `accountable`, not inside it. Don't run it in Accountable. The git hooks from Day 4 run in every worktree, but a new worktree has no `node_modules`, so its commits fail the checks.
- **`git checkout feature` fails on purpose:** a branch can be checked out in only one worktree at a time.
- **Removing the worktree:** close the `demo-feature` window in VS Code first. On Windows, a terminal still open in that folder can stop git from deleting it.
- **Worktrees, branches and clones:** worktrees are extra folders on one repository. They share its branches, history, config and hooks, so a commit in one shows in the others with no push or pull. A clone is a separate repository that meets the others only through a remote. Each worktree has its own branch checked out.
- **Claude Code's own worktrees** (`claude --worktree`, and subagents with `isolation: worktree`) go in `.claude/worktrees/<name>/` at the repo root, on a branch called `worktree-<name>`. Git ignores that folder. They start from the remote's default branch unless the `worktree.baseRef` setting is `"head"`.
