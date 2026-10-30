# Week 1 Day 2 with GitHub Copilot

GitHub Copilot is GitHub's coding agent. It runs in VS Code's chat and as a command-line tool, Copilot CLI. In the lesson I use Claude Code; this guide covers the same day in Copilot CLI, run in the VS Code terminal, which is the closest match to the lesson.

Copilot Chat in VS Code reads most of the same project files (`AGENTS.md`, `.agents/skills/` and a root `.mcp.json`). Where it differs, there's a note.

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

- These are Copilot CLI commands. `/model` also sets the reasoning effort, or start Copilot with `copilot --effort high` (or `low`, `medium`, `xhigh`, `max`).
- `/usage` shows the session's token totals and credits, not your plan's limits.

## 1. Install and sign in

Every Copilot plan includes Copilot CLI. Copilot Free has limited use; Copilot Pro is $10 a month.

Mac:

```bash
brew install --cask copilot-cli
```

You can also use `curl -fsSL https://gh.io/copilot-install | bash`, or `npm install -g @github/copilot` (Node 22 or later).

Windows (Copilot CLI needs PowerShell 6 or later, and VS Code's default terminal is Windows PowerShell 5.1, so install PowerShell 7 first):

```powershell
winget install --id Microsoft.PowerShell
winget install GitHub.Copilot
```

Then pick **PowerShell** (version 7) from the terminal's profile list in VS Code, the drop-down beside the **+**.

Once you've cloned the repo ([../SETUP.md](../SETUP.md)), start Copilot in your `accountable` folder:

```bash
copilot
```

Trust the folder when asked; choose "this and future sessions" so it doesn't ask again. If you aren't signed in, run `/login` and follow the steps.

**In VS Code:** Copilot is built in. Click "Sign in to use Copilot" in the Status Bar. Signing in without a plan gives you Copilot Free.

## 2. Markdown and AGENTS.md

Open `AGENTS.md` and `docs/intent.md` in VS Code and read them. This is what Copilot reads before it starts work. `AGENTS.md` is short and points to the files in `docs/`, which the agent opens when it needs them.

Copilot CLI reads `AGENTS.md` at the repo root and in the folder you started in. It also reads `CLAUDE.md`, `.github/copilot-instructions.md` and a few others, and combines them all. To see which files it found, run this in the terminal:

```bash
copilot instruction list
```

VS Code's chat reads `AGENTS.md` too.

## 3. Your own instructions file

Your personal instructions for every project go in `~/.copilot/copilot-instructions.md`.

Mac:

```bash
code ~/.copilot/copilot-instructions.md
```

Windows:

```powershell
code $HOME\.copilot\copilot-instructions.md
```

Add one preference of your own, for example:

```markdown
- Use uv for Python: `uv run` and `uv add`, never `pip install`.
```

## 4. Config folders and scopes

**In the project:** the `.github/` folder.

- `copilot-instructions.md`: project instructions (this repo uses `AGENTS.md` instead)
- `agents/` and `skills/`
- `copilot/settings.json`: shared settings for the repo; `copilot/settings.local.json` is your own

The project's MCP servers go in `.mcp.json` at the repo root. Copilot CLI also reads several Claude Code project files: skills and agents in `.claude/`, `CLAUDE.md`, and some of `.claude/settings.json`.

**In your home folder:** `~/.copilot/` holds your `settings.json`, `mcp-config.json` (your own MCP servers), `copilot-instructions.md`, your own agents and skills, and `config.json`, which records the folders you trust.

**The scopes:** settings from your organization win. The repository's `.github/copilot/settings.json` can set only a short list of keys, such as the model and plugins, and each key has its own rule for how it combines with your user settings. Everything else is a user setting in `~/.copilot/settings.json`.

## 5. Settings

Copilot CLI has the same two kinds of settings file as Claude Code, in `.github/copilot/`: `settings.json`, which everyone working in the repo shares, and `settings.local.json`, your own settings for this project. As step 4 says, these repo files can set only a few keys, such as the model and plugins; most settings go in `~/.copilot/settings.json`. There's nothing to set today.

## 6. Permissions

Copilot CLI doesn't read allow and deny rules from a project file. You give them as options when you start it:

```bash
copilot --allow-tool='shell(uv:*)' --allow-tool='shell(npm:*)' --deny-tool='read(.env)'
```

The same command works in PowerShell. `shell(uv:*)` matches `uv` followed by anything. A deny always wins over an allow. When Copilot asks for approval during a session, it offers Once, This location or Always.

**Modes.** Switch with `/permissions`:

- `/permissions default`: asks before any tool that isn't already allowed
- `/permissions assisted`: a model approves requests it judges safe and passes the rest to you
- `/permissions allow-all` (or `/yolo`): approves everything

To choose the mode new sessions start in, set `defaultPermissionMode` in `~/.copilot/settings.json`. Shift+Tab switches between the standard, plan and autopilot modes.

**In VS Code:** choose the permission level (Manual, Assisted or Allow all) from the dropdown in the chat input. To let terminal commands run without asking, add this to `.vscode/settings.json` (this repo's `.gitignore` lets that file be committed):

```json
{
  "chat.tools.terminal.autoApprove": {
    "uv": true,
    "npm": true
  }
}
```

## 7. MCP: the Playwright server

`copilot mcp add` writes to your own `~/.copilot/mcp-config.json`. For the project, create `.mcp.json` at the repo root:

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

Copilot loads project MCP servers only in a trusted folder. Restart Copilot and run `/mcp` to check that `playwright` is listed.

This is the same file Claude Code uses, and VS Code's chat reads it too. VS Code's own `.vscode/mcp.json` uses `servers` instead of `mcpServers`, so don't copy entries between the two without changing that key.

## 8. Code Mode

Copilot doesn't have Code Mode, in the CLI or in VS Code. Copilot CLI saves context with tool search instead: once there are about 30 or more tools, it loads MCP tool definitions only when it needs them. It's on by default.

## 9. A skill: the brand skill

Copilot reads project skills from `.github/skills/`, `.agents/skills/` and `.claude/skills/`. Use `.agents/skills/`, which the other agents in this course read too. Ask Copilot:

```text
Please turn docs/BRAND.md into a project skill called brand in .agents/skills/brand/SKILL.md. Give it a name and a description that says to use it for any UI work, and move all the brand content into it. Then delete docs/BRAND.md and remove its line from AGENTS.md.
```

The new file starts like this, with the brand guidelines below:

```markdown
---
name: brand
description: Accountable's brand guidelines for fonts, colors, surfaces and tone. Use for any UI work.
---
```

Run `/skills list` to see it. Until UI work comes up, only the name and description are in Copilot's context.

To install a skill someone else has published, use Vercel's skills tool (Node 22.20 or later), for example:

```bash
npx skills add vercel-labs/agent-skills --skill web-design-guidelines -a github-copilot
```

You don't need to install one today.

## 10. A plugin

Copilot CLI can install Claude Code plugins from a marketplace. Add Anthropic's marketplace and install the same plugin I use:

```bash
copilot plugin marketplace add anthropics/claude-plugins-official
copilot plugin install frontend-design@claude-plugins-official
```

This installs it for you on this machine. A repo can turn plugins on for everyone with `enabledPlugins` in `.github/copilot/settings.json`. If the install fails, install the plugin's skill on its own:

```bash
npx skills add anthropics/skills --skill frontend-design -a github-copilot
```

**In VS Code:** agent plugins are off until you turn on the `chat.plugins.enabled` setting.

## 11. Check and commit your setup

Your repo should now look like this:

```text
accountable/
├── .agents/skills/
│   └── brand/SKILL.md           added today
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

If you use Copilot in VS Code, `.vscode/settings.json` is there too. The `frontend-design` plugin is installed on your machine rather than in the repo; if you used the skills tool instead, it's in `.agents/skills/frontend-design/`.

Check each piece:

- [ ] `/mcp` lists `playwright`
- [ ] `/skills list` shows `brand`
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

My branch has Claude Code's setup. Copilot reads its `.mcp.json` and the brand skill in `.claude/skills/`, so both work as they are. Plugins are installed on your machine, so if you skipped step 10, do it now.
