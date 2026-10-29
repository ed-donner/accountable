# Week 1 Day 2 with Pi

Pi is a small, open source coding agent that you extend yourself. It works with many model providers, including free models on OpenRouter, which makes it one of the free routes for the course. In the lesson I use Claude Code; this guide covers the same day in Pi, run in the VS Code terminal.

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

- `/thinking` sets the thinking level, and Shift+Tab cycles through the levels. (In Claude Code, Shift+Tab switches permission modes.)
- Pi shows context use and cost in the footer, and `/session` shows the session's token use.
- Pi has no `/skills` or `/plugin` command. It lists your skills when it starts, typing `/skill:` shows them in the command menu, `/skill:name` runs one, and `pi install` adds a package from the terminal.

## 1. Install and sign in

Pi is free. You pay only for the models you use, and the free route below costs nothing.

Mac:

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

Windows:

```powershell
powershell -c "irm https://pi.dev/install.ps1 | iex"
```

You can also install with npm (Node 22.19 or later): `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`. The old package name, `@mariozechner/pi-coding-agent`, is deprecated.

Once you've cloned the repo ([../SETUP.md](../SETUP.md)), start Pi in your `accountable` folder:

```bash
pi
```

**The free route: OpenRouter.**

1. Create an account at [openrouter.ai](https://openrouter.ai) and create an API key.
2. In Pi, run `/login openrouter` and paste the key. (Setting `OPENROUTER_API_KEY` also works.)
3. Run `/model` and choose a model whose ID ends in `:free`.

OpenRouter allows 20 requests a minute on free models and 50 a day on an account that has never bought credit, with a higher daily limit once you have. Free models may use your prompts for training. They are also slower and less capable than paid ones, so expect to need patience.

**Paid options:** `/login` lists the other providers Pi supports, by subscription or API key.

## 2. Markdown and AGENTS.md

Open `AGENTS.md` and `docs/intent.md` in VS Code and read them. This is what Pi reads before it starts work. `AGENTS.md` is short and points to the files in `docs/`, which the agent opens when it needs them.

Pi reads `AGENTS.md` (or `CLAUDE.md`) in the folder you started in and in each folder above it, along with your own file from step 3. These files load whether or not you trust the project.

## 3. Your own instructions file

Your personal instructions for every project go in `~/.pi/agent/AGENTS.md`.

Mac:

```bash
code ~/.pi/agent/AGENTS.md
```

Windows:

```powershell
code $HOME\.pi\agent\AGENTS.md
```

Add one preference of your own, for example:

```markdown
- Use uv for Python: `uv run` and `uv add`, never `pip install`.
```

Run `/reload` in Pi to pick it up.

## 4. Config folders and scopes

**In the project:** the `.pi/` folder, which loads only after you trust the project. Pi asks when it finds one; you can also run `/trust`.

- `settings.json`: project settings and Pi packages
- `mcp.json`: the project's MCP servers
- `skills/`, `extensions/` and `prompts/`
- `SYSTEM.md` replaces Pi's system prompt; `APPEND_SYSTEM.md` adds to it

**In your home folder:** `~/.pi/agent/` holds your `settings.json`, `mcp.json`, `AGENTS.md`, your sign-ins (`auth.json`), and your own skills, extensions and prompts.

**The scopes:** project settings override your user settings, and lists of resources from both are combined. Run `/settings` to change common preferences, and `/reload` after editing any of these files by hand.

## 5. Settings

Pi's settings live in `.pi/settings.json` for the project and `~/.pi/agent/settings.json` for you in every project, and `/settings` changes the common ones. There's nothing to set today.

## 6. Permissions

Pi has no permission rules and no permission modes. It doesn't ask for approval before running a tool, and it has no sandbox: commands run with your user account's access. Pi's docs recommend running it in a container if you want it isolated.

So there are no allow rules for `uv` and `npm` to add, and no deny rule for `.env`. What you can do:

- **Limit its tools** for a session. The defaults are `read`, `bash`, `edit` and `write`; starting Pi with `--tools` sets which ones it gets, and `--exclude-tools` removes some.
- **Add approval prompts with an extension.** Pi's repo has example extensions you can copy into `.pi/extensions/`: `permission-gate.ts` asks before commands such as `rm -rf` and `sudo`, and `protected-paths.ts` blocks edits to `.env`, `.git/` and `node_modules/`. Neither stops Pi reading `.env`.

Pi's own advice is to ask Pi to build the extension you need.

## 7. MCP: the Playwright server

Run:

```bash
pi mcp add -l playwright -- npx @playwright/mcp@latest
pi mcp list
```

`-l` (short for `--local`) writes the server to the project's `.pi/mcp.json`; without it, Pi adds the server for you in every project. Pi reads the project file only after you trust the project.

Inside Pi, `/mcp` shows the servers. Run `/reload` if Pi was already open.

## 8. Code Mode

Pi has Code Mode, as its `codemode` tool: the model writes a short JavaScript program that calls Pi's tools in a sandbox, and only the program's output comes back into the context. It switches on by itself when an MCP server connects, so after step 7 Pi reaches Playwright's tools this way. To stop that, set `"autoEnableCodemode": false` beside `mcpServers` in `.pi/mcp.json`.

## 9. A skill: the brand skill

Pi reads project skills from `.pi/skills/` and `.agents/skills/`, but not from Claude Code's `.claude/skills/`. Use `.agents/skills/`, which the other agents in this course read too. Ask Pi:

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

Run `/reload`. Pi tells the model the name and description of each skill and loads the full content only when the task calls for it. To load it yourself, type `/skill:brand`.

To install a skill someone else has published, use Vercel's skills tool (Node 22.20 or later), for example:

```bash
npx skills add vercel-labs/agent-skills --skill web-design-guidelines -a pi
```

You don't need to install one today.

## 10. A plugin

Pi's version of plugins is packages: bundles of extensions, skills, prompts and themes, installed with `pi install` from npm or git (for example `pi install npm:<package>`) and listed at [pi.dev/packages](https://pi.dev/packages).

The plugin I install in Claude Code, Anthropic's `frontend-design`, is a Claude Code plugin with a single skill inside. Anthropic publishes the same skill in its skills repo. Install it with Vercel's skills tool:

```bash
npx skills add anthropics/skills --skill frontend-design -a pi
```

It installs into `.agents/skills/frontend-design/`. Commit it with the rest of today's setup.

## 11. Check and commit your setup

Your repo should now look like this:

```text
accountable/
├── .agents/skills/
│   ├── brand/SKILL.md           added today
│   └── frontend-design/         added today
├── .pi/
│   └── mcp.json                 added today
├── assets/
├── course/
├── docs/
│   ├── intent.md
│   ├── STATUS.md
│   └── TECH_STACK.md
├── .gitignore
├── AGENTS.md                    changed today
└── README.md
```

Check each piece:

- [ ] `/mcp` lists `playwright`
- [ ] Typing `/skill:` shows `brand` and `frontend-design`
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

- If you did today's steps and committed them, bring your files across from `main` with `git checkout main -- .agents .pi`.
- If you didn't, redo steps 7 and 10 of this guide. For the brand skill, copy my `.claude/skills/brand/` folder to `.agents/skills/brand/`, since `docs/BRAND.md` is gone on my branch.
