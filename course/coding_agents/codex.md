# Week 1 Day 2 with Codex

Codex is OpenAI's coding agent. In the lesson I use Claude Code; this guide covers the same day in the Codex CLI, run in the VS Code terminal, with the same steps in the same order.

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

- Codex has no `/effort` command: `/model` asks for the model and then the reasoning effort.
- Codex has no `/context` command. After your first message, `/status` shows how much of the context window is left as one figure, below your settings and above your usage limits. To keep it in view, add `context-used` to the footer with `/statusline`.
- `/plugins` is plural in Codex. To add a plugin from the terminal, use `codex plugin add`.

## 1. Install and sign in

You need ChatGPT Plus or higher, or an OpenAI API key billed by use. OpenAI's [pricing page](https://learn.chatgpt.com/docs/pricing) lists the Codex CLI from Plus up; the Free and Go plans list Codex in the desktop app only.

Mac:

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

You can also use `brew install --cask codex` or `npm install -g @openai/codex`.

Windows (open a new PowerShell window):

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
```

Once you've cloned the repo ([../SETUP.md](../SETUP.md)), start Codex in your `accountable` folder:

```bash
codex
```

Choose "Sign in with ChatGPT" and finish in the browser. When Codex asks whether you trust the folder, say yes. Codex loads the project's `.codex/` folder only for trusted projects, and later steps put config there.

## 2. Markdown and AGENTS.md

Open `AGENTS.md` and `docs/intent.md` in VS Code and read them. This is what Codex reads before it starts work. `AGENTS.md` is short and points to the files in `docs/`, which the agent opens when it needs them.

Codex reads `AGENTS.md` natively. It starts with your own `~/.codex/AGENTS.md`, then reads `AGENTS.md` from the repo root down to the folder you started in. It ignores `CLAUDE.md` unless you add it to `project_doc_fallback_filenames` in the config. To check what it loaded, ask Codex what its instructions say about this project.

## 3. Your own instructions file

Your personal instructions for every project go in `~/.codex/AGENTS.md`.

Mac:

```bash
code ~/.codex/AGENTS.md
```

Windows:

```powershell
code $HOME\.codex\AGENTS.md
```

Add one preference of your own, for example:

```markdown
- Use uv for Python: `uv run` and `uv add`, never `pip install`.
```

Start a new Codex session to load it.

## 4. Config folders and scopes

**In the project:** the `.codex/` folder, which loads only when you trust the project.

- `config.toml`: project settings, including MCP servers
- `rules/`: rules for commands that run outside the sandbox
- `agents/`: custom agents, one TOML file each

Project skills go in `.agents/skills/`, not in `.codex/`.

**In your home folder:** `~/.codex/` holds your `config.toml`, your `AGENTS.md`, your sign-in, your own rules in `rules/default.rules`, custom agents and session history. Your own skills go in `~/.agents/skills/`.

**The scopes,** highest first: options on the command line (including `-c key=value`), then the project's `.codex/config.toml`, then a profile you pick with `--profile`, then `~/.codex/config.toml`, then system-wide settings. An organization can also enforce settings. There's no personal file for one project, like Claude Code's `settings.local.json`; your own settings go in `~/.codex/config.toml`.

## 5. Settings

Codex's settings are TOML files rather than JSON: `.codex/config.toml` in the project, which everyone working in the repo shares, and `~/.codex/config.toml`, your own settings for every project. Steps 6 and 7 add the first project settings.

## 6. Permissions

Codex has two layers. The **sandbox** limits what commands can touch, and the **approval policy** decides when Codex asks you.

**Modes.** Run `/permissions` to switch between the two presets:

- **Auto:** the default in a git repo. Codex reads, edits and runs commands inside the project, and asks before it works outside the project or uses the network.
- **Read Only:** for chatting and planning without changes.

Starting Codex with `--approve-for-me` sends approval requests to a reviewer model instead of you. `--dangerously-bypass-approvals-and-sandbox` turns both layers off and is meant only for environments that are already isolated.

**Allow uv and npm.** Commands such as `npm install` and `uv sync` need the network, so Codex asks before running them outside the sandbox. Rules let them through. Create `.codex/rules/default.rules`:

```python
prefix_rule(pattern = ["uv"], decision = "allow")
prefix_rule(pattern = ["npm"], decision = "allow")
```

Rules are marked experimental in the Codex docs. Restart Codex after adding them.

**Deny reading `.env`.** Codex blocks file reads with a permission profile, a beta feature. Add this to `.codex/config.toml`:

```toml
default_permissions = "accountable"

[permissions.accountable]
extends = ":workspace"

[permissions.accountable.filesystem]
glob_scan_max_depth = 3

[permissions.accountable.filesystem.":workspace_roots"]
"**/*.env" = "deny"
```

On Windows, WSL and Linux, Codex needs `glob_scan_max_depth` to apply a `**` pattern like this one.

`:workspace` is the same boundary the Auto preset uses. Permission profiles replace the older `sandbox_mode` setting; if `sandbox_mode` is set in any config file, or you start Codex with `--sandbox`, Codex uses the older setting and ignores the profile.

Codex's sandbox keeps `.codex/`, `.agents/` and `.git/` read-only once they exist, so Codex may ask for approval before writing there. You can also create these files yourself in VS Code.

## 7. MCP: the Playwright server

`codex mcp add` has no scope option and always writes to your own `~/.codex/config.toml`. For the project, add the server to `.codex/config.toml` yourself:

```toml
[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp@latest"]
```

Restart Codex and run `/mcp` to check that `playwright` is listed.

## 8. Code Mode

Codex has Code Mode, but it's still under development and off by default. `codex features list` shows `code_mode` as "under development" and `false`. Leave it off for this course.

## 9. A skill: the brand skill

Codex reads project skills from `.agents/skills/`. Ask Codex:

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

Run `/skills` to see it, or type `$` to mention a skill in a prompt. Until UI work comes up, only the name and description are in Codex's context.

To install a skill someone else has published, use Vercel's skills tool (Node 22.20 or later), for example:

```bash
npx skills add vercel-labs/agent-skills --skill web-design-guidelines -a codex
```

It installs into `.agents/skills/`. You don't need to install one today.

## 10. A plugin

Codex's plugin directory, which it shares with ChatGPT, is separate from Claude Code's: run `/plugins` to browse it, and start a new session after installing one.

The plugin I install in Claude Code, Anthropic's `frontend-design`, is a Claude Code plugin with a single skill inside. Anthropic publishes the same skill in its skills repo. Install it with Vercel's skills tool:

```bash
npx skills add anthropics/skills --skill frontend-design -a codex
```

It installs into `.agents/skills/frontend-design/` and records the install in `skills-lock.json`. Commit both with the rest of today's setup.

## 11. Check and commit your setup

Your repo should now look like this:

```text
accountable/
├── .agents/skills/
│   ├── brand/SKILL.md           added today
│   └── frontend-design/         added today
├── .codex/
│   ├── rules/default.rules      added today
│   └── config.toml              added today
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

- [ ] `.codex/config.toml` has the `accountable` permission profile and the `playwright` server
- [ ] `/mcp` lists `playwright`
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

My branch has Claude Code's setup, not yours. After switching:

- If you did today's steps and committed them, bring your files across from `main` with `git checkout main -- .agents .codex skills-lock.json`.
- If you didn't, redo steps 6, 7 and 10 of this guide. For the brand skill, copy my `.claude/skills/brand/` folder to `.agents/skills/brand/`, since `docs/BRAND.md` is gone on my branch.
