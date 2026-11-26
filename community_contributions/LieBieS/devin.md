# Week 1 Day 2 with Devin

Devin is Cognition's coding agent, and Devin CLI is the version that runs in your terminal. The course lessons use Claude Code; this guide covers the same day in Devin CLI, run in the VS Code terminal, with the same steps in the same order.

Devin CLI and cloud Devin are separate products: this guide is about the CLI on your own machine. Cloud Devin's Knowledge, Playbooks and Secrets features are not available in the CLI.

Run the commands in the VS Code terminal, in your `accountable` folder. On Windows that terminal is PowerShell. `~` means your home folder; in PowerShell the same folder is `$HOME`.

## The commands in each agent

These are the Claude Code commands used in the lessons, with the closest match in each of the other agents. Type them in the agent's prompt; the `devin` commands run in the terminal.

| What it does | Claude Code | Codex | Copilot CLI | Cursor CLI | OpenCode | Pi | Antigravity | Devin |
|---|---|---|---|---|---|---|---|---|
| Pick the model | `/model` | `/model` | `/model` | `/model` | `/models` | `/model` | `/model` | `/model` |
| Set the reasoning effort | `/effort` | in `/model` | in `/model` | in `/model` | `/variants` | `/thinking` | `/effort` | `Alt+T` |
| See your usage | `/usage` | `/usage` | `/usage` | `/usage` | `/usage` | `/session` | `/usage` | `/usage` |
| See what fills the context window | `/context` | `/status` | `/context` | `/context` | the sidebar | the footer | `/context` | `/context` |
| Summarise the conversation to free up context | `/compact` | `/compact` | `/compact` | `/compact` | `/compact` | `/compact` | `/compact` | `/compact` |
| List your skills | `/skills` | `/skills` | `/skills` | `/skills` | `/skills` | `/skill:` | `/skills` | `devin skills list` |
| Manage MCP servers | `/mcp` | `/mcp` | `/mcp` | `/mcp` | `/mcps` | `/mcp` | `/mcp` | `/mcp` |
| Manage plugins | `/plugin` | `/plugins` | `/plugin` | `/plugin` | `/plugins` | `pi install` | `/plugin` | `devin plugins` |

- Devin has no `/effort` command: `Alt+T` (Option+T on a Mac) cycles the thinking level during a session. On a Mac the terminal must send Option as Meta for it to reach Devin; Terminal.app does not by default (Settings, Profiles, Keyboard, "Use Option as Meta key"), and iTerm2, Ghostty, WezTerm and the rest have their own equivalent.
- `/usage` shows the session's credit use; `/stats` (also `/session-stats`) gives the full breakdown.
- Skills are invoked as `/<skill-name>` in a prompt. Typing `/` shows the ones available; `devin skills list` in the terminal lists them all.
- `/mcp` lists servers in a session; `devin mcp add|list|remove` manages them from the terminal.
- Plugins are managed from the terminal with `devin plugins install|list|info|remove`, and the plugin system is in closed beta.

## 1. Install and sign in

You need a Devin account. The plans and their prices are at [devin.ai](https://devin.ai).

Mac:

```bash
brew install --cask devin-cli
```

or on Mac, Linux and WSL:

```bash
curl -fsSL https://cli.devin.ai/install.sh | bash
```

Windows (PowerShell):

```powershell
irm https://static.devin.ai/cli/setup.ps1 | iex
```

Once you've cloned the repo ([../SETUP.md](../SETUP.md)), start Devin in your `accountable` folder:

```bash
devin
```

Run `/login` to sign in through your browser, or `devin auth login` in the terminal (`devin setup` runs a wizard for sign-in and MCP together). When Devin asks whether you trust the folder, say yes: an untrusted folder prompts for every action, and `devin -p` refuses to run in one.

## 2. Markdown and AGENTS.md

Open `AGENTS.md` and `docs/intent.md` in VS Code and read them. This is what Devin reads before it starts work. `AGENTS.md` is short and points to the files in `docs/`, which the agent opens when it needs them.

Devin reads `AGENTS.md` natively, and it's the file the Devin docs recommend, so nothing extra is needed at the repo root. It also reads `AGENTS.local.md`, `CLAUDE.md`, `.windsurfrules`, and rules in `.devin/`, `.cursor/`, `.windsurf/` and `.claude/` if you have config from other tools. `devin rules list` in the terminal shows everything it loaded.

## 3. Your own instructions file

Your personal instructions for every project go in `~/.config/devin/AGENTS.md` (`%APPDATA%\devin\AGENTS.md` on Windows).

Mac:

```bash
code ~/.config/devin/AGENTS.md
```

Windows:

```powershell
code $HOME\AppData\Roaming\devin\AGENTS.md
```

Add one preference of your own, for example:

```markdown
- Use uv for Python: `uv run` and `uv add`, never `pip install`.
```

Start a new Devin session to load it.

## 4. Config folders and scopes

**In the project:** the `.devin/` folder. Commit all of it except the `*.local.json` files.

- `config.json`: shared settings, such as permissions
- `config.local.json`: your own settings for this project, kept out of git
- `mcp_config.json`: the project's shared MCP servers (commit it)
- `mcp_config.local.json`: your own MCP servers and any keys, kept out of git
- `skills/`, `rules/` and `hooks.v1.json`

**In your home folder:** `~/.config/devin/` holds your `config.json`, `AGENTS.md`, `mcp_config.json`, your own skills and session transcripts. On Windows that's `%APPDATA%\devin\`.

**The scopes,** highest precedence first: organisation-level settings if you're on an enterprise plan, then approvals you save during a session, then `.devin/config.local.json`, then `.devin/config.json`, then `~/.config/devin/config.json`. Organisation deny and ask rules can't be overridden further down.

## 5. Settings

Devin's settings are JSON files: `.devin/config.json` in the project, shared by everyone working in the repo, and `~/.config/devin/config.json`, your own settings for every project. `/config` in a session opens an interactive editor for them.

When a permission prompt offers "always allow", Devin asks where to save it: the project file, `config.local.json`, or your user file. Steps 6 and 7 add the first project settings.

The repo's `.gitignore` doesn't know about the local files yet, so add them to it:

```gitignore
.devin/config.local.json
.devin/mcp_config.local.json
```

## 6. Permissions

Write the rules into `.devin/config.json` so they're shared with the repo, or save them from a permission prompt when one comes up. Devin's matcher names differ from Claude Code's: shell commands are `Exec(...)` matched on a complete-word prefix, file access is `Read(...)`/`Write(...)` with globs, and fetches are `Fetch(...)`. Deny rules are checked first, then ask, then allow.

Create `.devin/config.json` with the same three rules as the lesson:

```json
{
  "permissions": {
    "allow": ["Exec(npm test)"],
    "ask": ["Exec(git push)"],
    "deny": ["Read(/**/.env*)"]
  }
}
```

`Exec(npm test)` matches `npm test` and `npm test -- --watch` but not `npm testfoo`. `Read(/**/.env*)` blocks reads of `.env` files anywhere: the agent reads files by their absolute path, so a relative pattern like `Read(.env*)` never matches anything.

Tested on 3000.6.7 and 3000.14.30821: the project's `.devin/config.json` permission rules did not take effect at all, and the agent read `.env` in both `-p` and interactive sessions. The deny fires exactly as written from `~/.config/devin/config.json`, so put `Read(/**/.env*)` in your user config's `permissions.deny` to enforce it today. Keep the project file anyway: it's the documented shared location, harmless, and presumably fixed in a later release. One more caveat: a `Read()` deny covers the read tool only, and `cat` via a shell command still shows the file, so secret paths need an `Exec` deny as well.

**Permission modes.** Press Shift+Tab to cycle through them, or use `/mode`:

- **Normal:** the starting mode. Reads run freely; writes and shell commands ask.
- **Accept edits:** file edits in the workspace go ahead; commands still ask.
- **Smart:** a fast model auto-runs actions it judges safe and asks otherwise. Rolling out gradually, so it may not be on your account yet.
- **Plan:** read-only; Devin plans and makes no changes until you approve.
- **Bypass:** everything auto-approves. Meant for automation and containers.
- **Autonomous:** only with `devin --sandbox`; commands run inside an OS-level sandbox on macOS and Linux.

## 7. MCP: the Playwright server

In a terminal in the repo (outside Devin), run:

```bash
devin mcp add -s project playwright -- npx @playwright/mcp@latest
```

This writes `.devin/mcp_config.json` at the repo root. Without `-s project`, the server lands in `.devin/mcp_config.local.json` for you alone, and there'd be nothing to commit. `-s user` saves it to `~/.config/devin/mcp_config.json` for every project instead.

Start `devin` again and run `/mcp` to check that `playwright` is connected.

## 8. Code Mode

Devin has no Code Mode switch. It saves context the same way the other lazy-loading agents do: only each skill's name and description load at the start, and the full skill loads when Devin invokes it or you call it with `/<skill-name>`.

## 9. A skill: the brand skill

Devin reads project skills from `.devin/skills/` (and `.agents/skills/`, the shared folder other agents use too). Ask Devin:

```text
Please move docs/BRAND.md into a project skill called brand in .devin/skills/brand/SKILL.md. Give it a name and a description that says to use it for any UI work, and move all the brand content into it. Then delete docs/BRAND.md and remove its line from AGENTS.md.
```

The new file starts like this, with the brand guidelines below:

```markdown
---
name: brand
description: Accountable's brand guidelines for fonts, colours, surfaces and tone. Use for any UI work.
---
```

Run `devin skills list` in the terminal to see it. Until UI work comes up, only the name and description are in Devin's context. The full content loads when Devin needs it.

To install a skill someone else has published, Vercel's skills tool knows `devin` as a target and installs into `.devin/skills/` (it needs Node 22.20 or later), for example:

```bash
npx skills add vercel-labs/agent-skills --skill web-design-guidelines -a devin
```

You don't need to install one today.

## 10. A plugin

Devin's plugin system installs bundles of skills, rules, hooks and MCP servers with `devin plugins install <owner/repo>`, but it's in closed beta and there's no public directory to browse yet.

The plugin installed in the lesson, Anthropic's `frontend-design`, is a Claude Code plugin with a single skill inside. Anthropic publishes the same skill in its skills repo. Install it with Vercel's skills tool:

```bash
npx skills add anthropics/skills --skill frontend-design -a devin
```

It installs into `.devin/skills/frontend-design/` and records the install in `skills-lock.json`. Commit both with the rest of today's setup.

## 11. Check and commit your setup

Your repo should now look like this:

```text
accountable/
├── .devin/
│   ├── config.json              added today
│   ├── config.local.json        ignored by git, once it exists
│   ├── mcp_config.json          added today
│   ├── mcp_config.local.json    ignored by git, once it exists
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
├── .gitignore                   changed today
├── AGENTS.md                    changed today
├── README.md
└── skills-lock.json             added today (if you installed a skill)
```

Check each piece:

- [ ] `.devin/config.json` has the three permission rules
- [ ] `.devin/mcp_config.json` has the `playwright` server, and `/mcp` shows it connected
- [ ] `devin skills list` shows `brand` (and `frontend-design` if you installed it)
- [ ] `docs/BRAND.md` is gone, and `AGENTS.md` no longer lists it
- [ ] `.gitignore` lists `.devin/config.local.json` and `.devin/mcp_config.local.json`

Then commit today's changes:

```bash
git add .
git commit -m "Day 2 setup"
```

`.gitignore` keeps `.env`, `.devin/config.local.json` and `.devin/mcp_config.local.json` out of the commit.

To jump to Ed's ending point instead, commit or stash your own changes and run:

```bash
git checkout week1day2-end
```

That branch has Claude Code's setup, not Devin's. After switching:

- If you did today's steps and committed them, bring your files across from `main` with `git checkout main -- .devin skills-lock.json`.
- If you didn't, redo steps 5, 6, 7 and 10 of this guide. For the brand skill, copy `.claude/skills/brand/` to `.devin/skills/brand/`, since `docs/BRAND.md` is gone on that branch. The skills tool's `-a devin` flag installs into `.devin/skills/`; `.agents/skills/` works too if you'd rather keep skills shared with other agents.
