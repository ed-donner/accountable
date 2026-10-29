# Week 1 Day 2 with OpenCode

OpenCode is an open source coding agent that works with many model providers, including free models through OpenCode's own service, OpenCode Zen (its docs now call it the OpenCode Console). In the lesson I use Claude Code; this guide covers the same day in OpenCode V2, run in the VS Code terminal. With its free models, OpenCode is one of the free routes for the course. Expect to need patience: free models are slower and less capable than paid ones.

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

- OpenCode uses plurals: `/models`, `/mcps` and `/plugins`.
- `/variants` sets the reasoning effort (`/thinking` and `/effort` open it too), and Ctrl+T cycles through the variants.
- OpenCode has no `/context` command: the session sidebar shows tokens, the share of the context window used and the cost.

## 1. Install and sign in

Mac:

```bash
curl -fsSL https://opencode.ai/v2/install | bash
```

You can also use `brew install anomalyco/tap/opencode-v2` or `npm install -g @opencode/cli`.

Windows (OpenCode doesn't support Windows package managers; npm works):

```powershell
npm install -g @opencode/cli
```

There's also a standalone Windows binary on [opencode.ai](https://opencode.ai/v2/docs/).

Be careful with older instructions: `curl https://opencode.ai/install`, without `v2`, installs OpenCode 1, which uses different config keys. If you installed OpenCode 1 with a package manager, remove it first. Both versions use the `opencode` command.

Once you've cloned the repo ([../SETUP.md](../SETUP.md)), start OpenCode in your `accountable` folder:

```bash
opencode
```

**Free models:** run `/models` and choose one marked Free. These are free for a limited time and the list changes, so keep a second choice in mind. Some of the free models' providers use your prompts to improve their models; OpenCode's model list says which.

**Paid options:** OpenCode Go is $10 a month, and the OpenCode Console also sells pay-as-you-go credit. You can also use your own provider account. Connect any of these with `/connect`.

## 2. Markdown and AGENTS.md

Open `AGENTS.md` and `docs/intent.md` in VS Code and read them. This is what OpenCode reads before it starts work. `AGENTS.md` is short and points to the files in `docs/`, which the agent opens when it needs them.

OpenCode V2 reads only `AGENTS.md`: your own global file first, then each `AGENTS.md` from the folder you started in up to the project root. It doesn't read `CLAUDE.md` (OpenCode 1 did).

## 3. Your own instructions file

Your personal instructions for every project go in `~/.config/opencode/AGENTS.md`. Create the folder if it isn't there.

Mac:

```bash
mkdir -p ~/.config/opencode
code ~/.config/opencode/AGENTS.md
```

Windows:

```powershell
mkdir $HOME\.config\opencode
code $HOME\.config\opencode\AGENTS.md
```

Add one preference of your own, for example:

```markdown
- Use uv for Python: `uv run` and `uv add`, never `pip install`.
```

## 4. Config folders and scopes

**In the project:** `opencode.jsonc` (or `opencode.json`) at the repo root holds the settings. The `.opencode/` folder holds `agents/`, `commands/`, `skills/` and `plugins/`, and can hold its own `opencode.jsonc`.

**In your home folder:** `~/.config/opencode/` has the same layout, for all your projects.

**The scopes,** lowest first: your global config, then project configs (a config closer to the folder you started in wins, and a config inside `.opencode/` wins over one beside it), then the system folder and managed settings, which an organization can use to lock values. Settings that don't conflict are kept. OpenCode also reads skills from Claude Code's `.claude/skills/` and the shared `.agents/skills/`.

## 5. Settings

OpenCode's settings live in `opencode.jsonc`. The one at the repo root is shared with everyone working in the repo, and the one in `~/.config/opencode/` is yours, for every project. Step 6 creates the project file.

## 6. Permissions

OpenCode's default is permissive. Its `build` agent edits files and runs commands without asking; it asks only before reading `.env` files.

Create `opencode.jsonc` at the repo root with these rules:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "permissions": [
    { "action": "shell", "resource": "*", "effect": "ask" },
    { "action": "shell", "resource": "uv *", "effect": "allow" },
    { "action": "shell", "resource": "npm *", "effect": "allow" },
    { "action": "read", "resource": "*.env", "effect": "deny" }
  ]
}
```

The last rule that matches wins, so the broad rule goes first. The first rule makes OpenCode ask before shell commands other than `uv` and `npm`; leave it out if you'd rather it ran them without asking. OpenCode 1 used `permission` and `bash`; V2 uses `permissions` and `shell`.

When OpenCode asks, you can allow once, allow always (saved as a rule for this project) or reject.

**Modes.** Press Shift+Tab to switch between the two main agents: `build`, the default, which makes changes, and `plan`, which explores and plans without editing your project files.

## 7. MCP: the Playwright server

Run:

```bash
opencode mcp add playwright -- npx @playwright/mcp@latest
opencode mcp list
```

`opencode mcp add` writes to the project config by default (`--global` would add it for every project). The entry looks like this; note that the command is a list:

```jsonc
"mcp": {
  "servers": {
    "playwright": {
      "type": "local",
      "command": ["npx", "@playwright/mcp@latest"]
    }
  }
}
```

Inside OpenCode, `/mcps` shows the servers. Playwright's own README shows the OpenCode 1 format, so don't copy its example into a V2 config.

## 8. Code Mode

OpenCode V2 has Code Mode, and it's on by default for MCP servers. The model reaches Playwright's tools through OpenCode's `execute` tool, which runs a short JavaScript program in a sandbox; only what the program returns comes back into the context. To have a server's tools called directly instead, add `"codemode": false` to that server's entry.

## 9. A skill: the brand skill

OpenCode reads project skills from `.opencode/skills/`, `.claude/skills/` and `.agents/skills/`. Use `.agents/skills/`, which the other agents in this course read too. Ask OpenCode:

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

Run `/skills` to see it. OpenCode tells the model which skills exist, and the model loads one when the task calls for it. You can also ask for the skill by name.

To install a skill someone else has published, use Vercel's skills tool (Node 22.20 or later), for example:

```bash
npx skills add vercel-labs/agent-skills --skill web-design-guidelines -a opencode
```

You don't need to install one today.

## 10. A plugin

OpenCode's plugins are JavaScript or TypeScript code: npm packages listed under `plugins` in the config, or files in `.opencode/plugins/`. The plugin I install in Claude Code, Anthropic's `frontend-design`, is a Claude Code plugin with a single skill inside. Anthropic publishes the same skill in its skills repo. Install it with Vercel's skills tool:

```bash
npx skills add anthropics/skills --skill frontend-design -a opencode
```

It installs into `.agents/skills/frontend-design/`. Commit it with the rest of today's setup.

## 11. Check and commit your setup

Your repo should now look like this:

```text
accountable/
├── .agents/skills/
│   ├── brand/SKILL.md           added today
│   └── frontend-design/         added today
├── assets/
├── course/
├── docs/
│   ├── intent.md
│   ├── STATUS.md
│   └── TECH_STACK.md
├── .gitignore
├── AGENTS.md                    changed today
├── opencode.jsonc               added today
└── README.md
```

Check each piece:

- [ ] `opencode.jsonc` has the four permission rules and the `playwright` server
- [ ] `/mcps` lists `playwright` (or run `opencode mcp list` in the terminal)
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

- If you did today's steps and committed them, bring your files across from `main` with `git checkout main -- .agents opencode.jsonc`.
- If you didn't, redo steps 6, 7 and 10 of this guide. The brand skill works as it is, since OpenCode reads `.claude/skills/`.
