# Week 1 Day 2 with Antigravity CLI

Antigravity CLI (`agy`) is Google's coding agent for the terminal. It replaced Gemini CLI for personal Google accounts in June 2026, and it works on a free Google account, which makes it one of the free routes for the course. In the lesson I use Claude Code; this guide covers the same day in Antigravity CLI, run in the VS Code terminal.

Run the commands in the VS Code terminal, in your `accountable` folder. On Windows that terminal is PowerShell. `~` means your home folder; in PowerShell the same folder is `$HOME`.

## The commands in each agent

These are the Claude Code commands I use in the lessons, with the closest match in each of the other agents. Type them in the agent's prompt; `pi install` runs in the terminal.

| What it does | Claude Code | Codex | Copilot CLI | Cursor CLI | OpenCode | Pi | Antigravity |
|---|---|---|---|---|---|---|---|
| Pick the model | `/model` | `/model` | `/model` | `/model` | `/models` | `/model` | `/model` |
| Set the reasoning effort | `/effort` | in `/model` | in `/model` | in `/model` | `/variants` | `/thinking` | `/effort` |
| See your usage | `/usage` | `/usage` | `/usage` | `/usage` | `/usage` | `/session` | `/usage` |
| See what fills the context window | `/context` | `/status` | `/context` | `/context` | the sidebar | the footer | `/context` |
| Summarize the conversation to free up context | `/compact` | `/compact` | `/compact` | `/compact` | `/compact` | `/compact` | `/compact` |
| List your skills | `/skills` | `/skills` | `/skills` | `/skills` | `/skills` | `/skill:` | `/skills` |
| Manage MCP servers | `/mcp` | `/mcp` | `/mcp` | `/mcp` | `/mcps` | `/mcp` | `/mcp` |
| Manage plugins | `/plugin` | `/plugins` | `/plugin` | `/plugin` | `/plugins` | `pi install` | `/plugin` |

- `/usage` shows how much of your plan's limits is left. `/quota` opens it too.
- Shift+Tab cycles Antigravity's modes, much as it cycles the permission modes in Claude Code (step 6).

## 1. Install and sign in

A personal Google account works on any plan, including the free one, which has a weekly quota. Google AI Pro and Ultra add more quota and more models. The plans are at [antigravity.google/pricing](https://antigravity.google/pricing).

Mac:

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

Windows (PowerShell):

```powershell
irm https://antigravity.google/cli/install.ps1 | iex
```

The installer may print lines that start with `ERROR: logging before google.Init`. They're harmless: each one reports a step that worked. If `agy` isn't found afterward, open a new terminal. `agy --version` checks the install.

Once you've cloned the repo ([../SETUP.md](../SETUP.md)), start Antigravity CLI in your `accountable` folder:

```bash
agy
```

The first run asks you to choose a color scheme and how to draw the screen, asks whether you trust the folder (say yes), and opens your browser to sign in with your Google account. If you already use the Antigravity app, it may sign you in without asking. `/logout` signs you out.

## 2. Markdown and AGENTS.md

Open `AGENTS.md` and `docs/intent.md` in VS Code and read them. This is what Antigravity reads before it starts work. `AGENTS.md` is short and points to the files in `docs/`, which the agent opens when it needs them.

Antigravity reads `AGENTS.md` natively. It also reads `GEMINI.md` and any rules in `.agents/rules/`, in the folder you started in and each folder above it up to the repo root. It loads all of them; none replaces another. This repo has only `AGENTS.md`. `/context` shows which instruction files are loaded.

## 3. Your own instructions file

Your personal instructions for every project go in `~/.gemini/AGENTS.md`. The Antigravity app and IDE read it too.

Mac:

```bash
mkdir -p ~/.gemini
code ~/.gemini/AGENTS.md
```

Windows:

```powershell
mkdir $HOME\.gemini
code $HOME\.gemini\AGENTS.md
```

Add one preference of your own, for example:

```markdown
- Use uv for Python: `uv run` and `uv add`, never `pip install`.
```

If you used Gemini CLI before, your `~/.gemini/GEMINI.md` still loads as well.

## 4. Config folders and scopes

**In the project:** the `.agents/` folder, which you commit. It holds `skills/`, `rules/`, `agents/` and `plugins/`, and `mcp_config.json` for the project's MCP servers.

**In your home folder:** `~/.gemini/config/` has the same layout, for all your projects, and the Antigravity app and IDE share it. The CLI's own settings are in `~/.gemini/antigravity-cli/settings.json`.

**The scopes:** Antigravity has no settings file in the repo. Settings and permission rules live in your home folder, and the project's `.agents/` folder adds skills, rules and MCP servers on top. Instruction files and rules add up rather than replace each other.

## 5. Settings

Antigravity CLI keeps its settings in one file, `~/.gemini/antigravity-cli/settings.json`, which applies to every project. `/config` changes settings and saves them straight away, and so do `/model`, `/effort` and `/permissions`. There's nothing to set today.

## 6. Permissions

Run `/permissions`. It offers three scopes: **Project**, **Shared** (shared with the Antigravity app and IDE) and **Global** (your `settings.json`). All three live in your home folder, so these rules aren't committed with the repo. Choose **Global** and add these three rules (press A to add one):

- Allow `command(npm test)`
- Ask `command(git push)`
- Deny `read_file(.env)`

Your `settings.json` now includes this:

```json
"permissions": {
  "allow": ["command(npm test)"],
  "ask": ["command(git push)"],
  "deny": ["read_file(.env)"]
}
```

Deny beats ask, and ask beats allow. Deny rules apply in every mode. `command(git push)` matches any command that starts with those words, such as `git push origin main`.

**Modes.** Press Shift+Tab to cycle through them.

- **default:** shows each file change as a diff for you to review, and asks before running commands.
- **accept-edits:** makes file changes without asking, and still asks before commands.
- **auto:** makes file changes, runs commands in a sandbox, and checks commands that need to leave it. It's the closest match to Claude Code's Auto mode, which I use in the lessons. It needs a personal Google account, and on Windows, Windows 11 24H2 or later; where it isn't available, Shift+Tab skips it.
- **plan:** works out the steps before it writes code.

## 7. MCP: the Playwright server

`agy mcp add` saves servers for you alone, in `~/.gemini/config/mcp_config.json`. For the project, create `.agents/mcp_config.json`:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

Start `agy` again and run `/mcp` to check that `playwright` is connected. Antigravity asks before each MCP tool call; an allow rule, `mcp(playwright/*)`, stops it asking.

## 8. Code Mode

Antigravity doesn't have Code Mode. It saves context in a different way: at the start the model sees only the names of MCP tools, and it reads a tool's full definition when it needs it. Setting `"eager": true` on a tool loads its definition up front.

## 9. A skill: the brand skill

Antigravity reads project skills from `.agents/skills/`, which the other agents in this course read too. Ask Antigravity:

```text
Please turn docs/BRAND.md into a project skill called brand in .agents/skills/brand/SKILL.md. Give it a name and a description that says to use it for any UI work, and move all the brand content into it. Then delete docs/BRAND.md and remove its line from AGENTS.md.
```

It asks before running the command that deletes `docs/BRAND.md`; approve it. The new file starts like this, with the brand guidelines below:

```markdown
---
name: brand
description: Accountable's brand guidelines for fonts, colors, surfaces and tone. Use for any UI work.
---
```

Run `/skills` to see it alongside Antigravity's built-in skills. Until UI work comes up, only the name and description are in the model's context. Each skill also becomes a slash command, such as `/brand`. If you add a skill during a session, run `/skills reload`.

To install a skill someone else has published, use Vercel's skills tool (Node 22.20 or later), for example:

```bash
npx skills add vercel-labs/agent-skills --skill web-design-guidelines -a antigravity-cli
```

You don't need to install one today.

## 10. A plugin

Antigravity has its own plugin marketplace, `antigravity-plugins-official`. Run `/plugin` and open the Discover tab to browse it, or install from the terminal with `agy plugin install <name>`. `agy plugin import claude` brings across the plugins you've installed in Claude Code.

The plugin I install in Claude Code, Anthropic's `frontend-design`, is a Claude Code plugin with a single skill inside. Anthropic publishes the same skill in its skills repo. Install it with Vercel's skills tool:

```bash
npx skills add anthropics/skills --skill frontend-design -a antigravity-cli
```

It installs into `.agents/skills/frontend-design/` and records the install in `skills-lock.json`. Commit both with the rest of today's setup.

## 11. Check and commit your setup

Your repo should now look like this:

```text
accountable/
├── .agents/
│   ├── mcp_config.json          added today
│   └── skills/
│       ├── brand/SKILL.md       added today
│       └── frontend-design/     added today
├── assets/
├── community_contributions/
├── course/
├── docs/
│   ├── intent.md
│   ├── STATUS.md
│   └── TECH_STACK.md
├── .gitignore
├── AGENTS.md                    changed today
├── README.md
└── skills-lock.json             added today
```

Check each piece:

- [ ] `/permissions` shows the three rules in the Global scope
- [ ] `/mcp` shows `playwright` connected
- [ ] `/skills` lists `brand` and `frontend-design`
- [ ] `docs/BRAND.md` is gone, and `AGENTS.md` no longer lists it

Then commit today's changes:

```bash
git add .
git commit -m "Day 2 setup"
```

`.gitignore` keeps `.env` out of the commit.

To jump to my ending point instead, commit or stash your own changes and run:

```bash
git checkout week1day2-end
```

My branch has Claude Code's setup, not yours. Your permission rules live in your home folder, so they still apply. After switching:

- If you did today's steps and committed them, bring your files across from `main` with `git checkout main -- .agents skills-lock.json`.
- If you didn't, redo steps 7 and 10 of this guide. For the brand skill, copy my `.claude/skills/brand/` folder to `.agents/skills/brand/`, since `docs/BRAND.md` is gone on my branch.
