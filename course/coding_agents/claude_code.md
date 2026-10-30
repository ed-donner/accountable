# Week 1 Day 2 with Claude Code

Claude Code is Anthropic's coding agent, and it's the one I use on camera, in the VS Code terminal. This guide is the written version of what I do in the Week 1 Day 2 lesson, with one section per step.

The other guides in this folder cover the same steps in Codex, GitHub Copilot, Cursor, OpenCode and Pi, with the same headings.

Run the commands in the VS Code terminal, in your `accountable` folder. On Windows that terminal is PowerShell. `~` means your home folder; in PowerShell the same folder is `$HOME`.

## The commands in each agent

These are the Claude Code commands I use in the lessons, with the closest match in each of the other agents. Type them in the agent's prompt; `pi install` runs in the terminal.

| What it does | Claude Code | Codex | Copilot CLI | Cursor CLI | OpenCode | Pi |
|---|---|---|---|---|---|---|
| Pick the model | `/model` | `/model` | `/model` | `/model` | `/models` | `/model` |
| Set the reasoning effort | `/effort` | in `/model` | in `/model` | in `/model` | `/variants` | `/thinking` |
| See your usage | `/usage` | `/usage` | `/usage` | `/usage` | `/usage` | `/session` |
| See what fills the context window | `/context` | `/status` | `/context` | `/context` | the sidebar | the footer |
| Summarize the conversation to free up context | `/compact` | `/compact` | `/compact` | `/compact` | `/compact` | `/compact` |
| List your skills | `/skills` | `/skills` | `/skills` | `/skills` | `/skills` | `/skill:` |
| Manage MCP servers | `/mcp` | `/mcp` | `/mcp` | `/mcp` | `/mcps` | `/mcp` |
| Manage plugins | `/plugin` | `/plugins` | `/plugin` | `/plugin` | `/plugins` | `pi install` |

- In the `/model` picker, the left and right arrow keys set the effort too.
- `/usage` shows the session's cost and your plan's usage limits. `/cost` and `/stats` open it as well.
- `/compact` takes optional instructions for what the summary should focus on.

## 1. Install and sign in

You need a Claude Pro plan or higher. The plans and their prices are at [claude.com/pricing](https://claude.com/pricing). A Claude Console account with prepaid API credits also works. Claude Code has no free route; if you want to spend nothing, use the OpenCode or Pi guide.

Mac:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Windows (PowerShell):

```powershell
irm https://claude.ai/install.ps1 | iex
```

Start it once with `claude` to sign in. Then, once you've cloned the repo ([../SETUP.md](../SETUP.md)), start Claude Code in your `accountable` folder:

```bash
claude
```

The first run opens your browser to sign in; `/login` does the same if you're not signed in, or to switch accounts. Claude Code also asks whether you trust the folder. Say yes: until you do, it ignores the project's settings.

Then run `/memory` and turn off auto memory. When it's on, Claude Code saves its own notes as you work and loads them into later sessions. The switch in `/memory` turns it off for every project.

## 2. Markdown and AGENTS.md

Open `AGENTS.md` and `docs/intent.md` in VS Code and read them. This is what Claude Code reads before it starts work. `AGENTS.md` is short and points to the files in `docs/`, which the agent opens when it needs them.

Claude Code reads `AGENTS.md` only when the repo has no `CLAUDE.md` (or `.claude/CLAUDE.md` or `CLAUDE.local.md`). This repo has no `CLAUDE.md` on purpose, so every coding agent reads the same file. When a session starts, you'll see a line saying that no `CLAUDE.md` was found and `AGENTS.md` was loaded.

Claude Code reads `AGENTS.md` from version 2.1.277 (2.1.281 on Amazon Bedrock). If your company pins an older version, add a `CLAUDE.md` at the repo root that contains this one line:

```text
@AGENTS.md
```

## 3. Your own instructions file

Your personal instructions for every project go in `~/.claude/CLAUDE.md`. Claude Code loads it alongside the project's `AGENTS.md`.

Run `/memory` and choose your user file, or open it in VS Code.

Mac:

```bash
code ~/.claude/CLAUDE.md
```

Windows:

```powershell
code $HOME\.claude\CLAUDE.md
```

Add one preference of your own, for example:

```markdown
- Use uv for Python: `uv run` and `uv add`, never `pip install`.
```

## 4. Config folders and scopes

**In the project:** the `.claude/` folder. Commit all of it except `settings.local.json`.

- `settings.json`: shared settings, such as permissions and plugins
- `settings.local.json`: your own settings for this project, kept out of git
- `skills/`, `agents/`, `rules/` and `commands/`

At the repo root, `.mcp.json` holds the project's MCP servers.

To look around your home folder's copy, run `ls ~/.claude` in the terminal (Finder hides folders whose names start with a dot).

**In your home folder:** `~/.claude/` holds your `settings.json`, `CLAUDE.md`, your own skills and agents, installed plugins, and session transcripts. A separate file, `~/.claude.json`, holds your account, the folders you've trusted, and MCP servers you added for yourself. You don't need to edit it.

**The four scopes:**

| Scope | File | Who it affects |
|---|---|---|
| Managed | Set by your organization's IT | Everyone it's deployed to |
| Local | `.claude/settings.local.json` | You, in this project only (not committed) |
| Project | `.claude/settings.json` | Everyone working in the repo (commit it) |
| User | `~/.claude/settings.json` | You, in every project |

A higher row wins when two set the same thing (and any `--settings` you pass on the command line comes just below managed). Lists such as permission rules are merged across the files rather than replaced.

## 5. Settings

Claude Code keeps the project's settings in two files in `.claude/`:

- `settings.json`: shared settings for everyone working in the repo. Commit it.
- `settings.local.json`: your own settings for this project. It stays out of git, and this repo's `.gitignore` already lists it.

Both files hold the same kinds of settings, such as permissions. You rarely need to edit them by hand: commands such as `/permissions` and `/plugin` ask which scope to use and write the file for you. When you answer "Yes, and don't ask again" to a prompt, Claude Code saves that rule in `settings.local.json`.

Step 6 adds the first rules to `settings.json`.

## 6. Permissions

Run `/permissions` and add these three rules, saving each one to the project settings:

- Allow `Bash(npm test)`
- Ask `Bash(git push *)`
- Deny `Read(./.env)`

`.claude/settings.json` now looks like this:

```json
{
  "permissions": {
    "allow": ["Bash(npm test)"],
    "ask": ["Bash(git push *)"],
    "deny": ["Read(./.env)"]
  }
}
```

Claude Code checks deny rules first, then ask rules, then allow rules. Deny rules apply in every mode, and ask rules still prompt in Auto. In Auto mode, Claude Code sets aside broad allow rules that would let the agent run any code, such as `Bash(npm run *)` or `Bash(uv run *)`, and keeps narrow ones such as `Bash(npm test)`.

**Permission modes.** Press Shift+Tab to cycle through them.

- **Auto:** the starting mode. Claude works without asking, and a background model reviews actions such as shell commands and network requests.
- **Manual:** asks before edits and commands. Older material calls this "default mode".
- **Accept edits:** file edits and simple file commands go ahead; other commands ask.
- **Plan:** Claude reads and plans, and makes no edits until you approve the plan.

Two more modes, Don't ask and Bypass permissions, are meant for automation and for containers. Neither is in the Shift+Tab cycle by default: Bypass joins it, after Plan, only when you start Claude Code with a flag such as `--allow-dangerously-skip-permissions`.

## 7. MCP: the Playwright server

In a terminal in the repo (outside Claude Code), run:

```bash
claude mcp add -s project playwright -- npx @playwright/mcp@latest
```

This writes `.mcp.json` at the repo root. `-s` is short for `--scope`. Without `-s project`, the server would be stored privately in `~/.claude.json` for you alone, and there would be nothing to commit.

Start `claude` again. When it says it found a new MCP server in this project, choose "Use this MCP server" (pressing Enter straight away picks "Continue without using this MCP server"). Your answer is saved in `.claude/settings.local.json`, so everyone who clones the repo is asked once. Then run `/mcp` to check that `playwright` is connected. If you turned it down by mistake, run `claude mcp reset-project-choices` in the terminal and start `claude` again.

## 8. Code Mode

Claude Code doesn't have Code Mode. It saves context in a different way: MCP tool search is on by default, so only the names of MCP tools load at the start and their full definitions load when Claude needs them.

## 9. A skill: the brand skill

Ask Claude:

```text
Please move docs/BRAND.md into a project skill called brand in .claude/skills/brand/SKILL.md. Give it a name and a description that says to use it for any UI work, and move all the brand content into it. Then delete docs/BRAND.md and remove its line from AGENTS.md.
```

The new file starts like this, with the brand guidelines below:

```markdown
---
name: brand
description: Accountable's brand guidelines for fonts, colors, surfaces and tone. Use for any UI work.
---
```

Run `/skills` to see it. Until UI work comes up, only the name and description are in Claude's context. The full content loads when Claude needs it.

To install a skill someone else has published, Vercel's skills tool works with every agent in this course (it needs Node 22.20 or later), for example:

```bash
npx skills add vercel-labs/agent-skills --skill web-design-guidelines -a claude-code
```

`npx skills find` searches for skills. You don't need to install one today.

## 10. A plugin

In Claude Code, run `/plugin`. On the Discover tab, type `frontend-design`, press Enter on it, and choose "Install for all collaborators on this repository (project scope)". The plugin is recorded in `.claude/settings.json` as `frontend-design@anthropic-plugin-directory`; anyone else working in the repo installs it once on their own machine. It contains one skill, `frontend-design`, which Claude uses for front-end work. If Claude Code asks you to, run `/reload-plugins`.

## 11. Check and commit your setup

Your repo should now look like this:

```text
accountable/
├── .claude/
│   ├── skills/brand/SKILL.md    added today
│   ├── settings.json            added today
│   └── settings.local.json      ignored by git
├── assets/
├── community_contributions/
├── course/
├── docs/
│   ├── intent.md
│   ├── STATUS.md
│   └── TECH_STACK.md
├── .gitignore
├── .mcp.json                    added today
├── AGENTS.md                    changed today
└── README.md
```

Check each piece:

- [ ] `/permissions` shows the three rules
- [ ] `/mcp` shows `playwright` connected
- [ ] `/skills` lists `brand`
- [ ] `/plugin` lists `frontend-design` on its Installed tab
- [ ] `docs/BRAND.md` is gone, and `AGENTS.md` no longer lists it

Then commit today's changes:

```bash
git add .
git commit -m "Day 2 setup"
```

`.gitignore` keeps `.claude/settings.local.json` and `.env` out of the commit.

To jump to my ending point instead, commit or stash your own changes and run:

```bash
git checkout week1day2-end
```
