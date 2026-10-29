# Week 1 Day 2 with Cursor

Cursor is an AI code editor built on VS Code, with its own coding agent. In the lesson I use Claude Code in VS Code; this guide covers the same day in Cursor's agent, with the `accountable` folder open in Cursor instead of VS Code. Cursor also has a command-line agent, `agent`, and the guide notes where it differs.

Run the commands in Cursor's terminal, in your `accountable` folder. On Windows that terminal is PowerShell. `~` means your home folder; in PowerShell the same folder is `$HOME`.

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

- These are the commands in Cursor's command-line agent, `agent`. `/model` also sets the reasoning effort.
- Cursor's reference page lists the compact command as `/summarize`; `/compact` and `/compress` do the same.

## 1. Install and sign in

Download Cursor from [cursor.com/download](https://cursor.com/download), install it, and sign in to a Cursor account in the app.

The Free plan gives limited agent use with Cursor's own models. Plus ($8 a month) gives you Cursor's own models only (Grok and Composer). Claude, GPT and Gemini models start at Premium ($30 a month), billed at API list price from prepaid credit. You can follow the course with Cursor's own models, though your results will differ from mine.

The command-line agent is optional. Mac:

```bash
curl https://cursor.com/install -fsS | bash
```

Windows (PowerShell):

```powershell
irm 'https://cursor.com/install?win32=true' | iex
```

Sign in with `agent login`. Older guides call this command `cursor-agent`.

## 2. Markdown and AGENTS.md

Open `AGENTS.md` and `docs/intent.md` and read them. This is what Cursor's agent reads before it starts work. `AGENTS.md` is short and points to the files in `docs/`, which the agent opens when it needs them.

Cursor reads `AGENTS.md` at the project root and in subfolders. Cursor also has project rules in `.cursor/rules/`, written as `.mdc` files with their own frontmatter (plain `.md` files there are ignored). This course doesn't need them.

## 3. Your own instructions file

Cursor keeps your personal instructions in the app rather than in a file. Open **Customize** in the sidebar, go to **Rules**, and add a User Rule. Add one preference of your own, for example:

```markdown
- Use uv for Python: `uv run` and `uv add`, never `pip install`.
```

User Rules apply in every project. When rules conflict, team rules win over project rules, and project rules win over user rules.

## 4. Config folders and scopes

**In the project:** the `.cursor/` folder.

- `mcp.json`: the project's MCP servers
- `permissions.json`: guidance for Auto-review (step 6)
- `cli.json`: permissions for the command-line agent
- `sandbox.json`: what sandboxed commands can reach
- `rules/`, `skills/` and `agents/`

**In your home folder:** `~/.cursor/` has the same kinds of file for every project (`mcp.json`, `permissions.json`, `cli-config.json`, `sandbox.json`, `skills/`, `agents/`).

**The scopes:** project files apply to this repo, and files in `~/.cursor/` apply to all your projects. Where both exist, Cursor merges them. A team plan can add settings from Cursor's dashboard that take priority. Cursor also reads skills and agents from Claude Code's and Codex's folders (`.claude/` and `.codex/`).

## 5. Settings

Cursor has no single settings file for the project. Each kind of setting has its own file in `.cursor/` (step 4), and the editor's other settings are in **Cursor Settings**. There's nothing to set today; step 6 adds the permission files.

## 6. Permissions

**Modes.** In **Settings > Agents > Approvals & Execution**, choose a run mode:

- **Auto-review:** the default. Known-safe calls run, other shell commands run in a sandbox where possible, and a classifier model reviews the rest.
- **Allowlist:** only actions on your allowlist run without approval.
- **Run Everything:** every tool call runs automatically.

**Allow uv and npm.** Auto-review takes guidance in plain English. Create `.cursor/permissions.json` (or ask the agent to write it for you):

```json
{
  "autoRun": {
    "allow_instructions": [
      "Running uv and npm commands in this project is fine."
    ],
    "block_instructions": [
      "Any command that reads or prints the .env file should go through approval first."
    ]
  }
}
```

**Hide `.env`.** Create a `.cursorignore` file at the repo root with this line, which hides the file from the agent:

```text
.env
```

**The command-line agent** uses rules much like Claude Code's. Put them in `.cursor/cli.json`:

```json
{
  "permissions": {
    "allow": ["Shell(uv)", "Shell(npm)"],
    "deny": ["Read(.env*)"]
  }
}
```

A deny always wins. In the command-line agent, Shift+Tab cycles between the Agent, Plan and Ask modes.

## 7. MCP: the Playwright server

Cursor has no command for adding a server. Create `.cursor/mcp.json`:

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

Open **Customize** in the sidebar to check that `playwright` is listed and turned on. In the terminal, `agent mcp list` shows the same servers.

## 8. Code Mode

Cursor doesn't have Code Mode. It saves context another way: Cursor writes MCP tool descriptions to files and loads them only when they're needed, and the agent still calls the tools directly.

## 9. A skill: the brand skill

Cursor reads project skills from `.agents/skills/` and `.cursor/skills/`. Use `.agents/skills/`, which the other agents in this course read too. Ask the agent:

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

Open **Customize > Skills** to see it, or type `/` in the agent chat and search for `brand`. Until UI work comes up, only the name and description are in the agent's context.

To install a skill someone else has published, use Vercel's skills tool (Node 22.20 or later), for example:

```bash
npx skills add vercel-labs/agent-skills --skill web-design-guidelines -a cursor
```

You don't need to install one today.

## 10. A plugin

Cursor has plugins, installed from the Cursor Marketplace in **Customize**. The plugin I install in Claude Code, Anthropic's `frontend-design`, isn't listed there. It has a single skill inside, and Anthropic publishes the same skill in its skills repo. Install it with Vercel's skills tool:

```bash
npx skills add anthropics/skills --skill frontend-design -a cursor
```

It installs into `.agents/skills/frontend-design/`. Commit it with the rest of today's setup.

## 11. Check and commit your setup

Your repo should now look like this:

```text
accountable/
├── .agents/skills/
│   ├── brand/SKILL.md           added today
│   └── frontend-design/         added today
├── .cursor/
│   ├── cli.json                 added today
│   ├── mcp.json                 added today
│   └── permissions.json         added today
├── assets/
├── course/
├── docs/
│   ├── intent.md
│   ├── STATUS.md
│   └── TECH_STACK.md
├── .cursorignore                added today
├── .gitignore
├── AGENTS.md                    changed today
└── README.md
```

Check each piece:

- [ ] **Customize** lists `playwright`, turned on (or run `agent mcp list` in the terminal)
- [ ] **Customize > Skills** shows `brand` and `frontend-design`
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

- If you did today's steps and committed them, bring your files across from `main` with `git checkout main -- .agents .cursor .cursorignore`.
- If you didn't, redo steps 6, 7 and 10 of this guide. For the brand skill, copy my `.claude/skills/brand/` folder to `.agents/skills/brand/`, since `docs/BRAND.md` is gone on my branch.
