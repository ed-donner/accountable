# Setup

The setup steps from Week 1 Day 2. On a PC, the terminal in VS Code is PowerShell, and the PC commands below are for PowerShell.

## Install the tools

1. **VS Code**: download it from https://code.visualstudio.com, install it and open it. Open a terminal from the **Terminal** menu with **New Terminal**.
   - Mac: open the Command Palette (Cmd+Shift+P) and run **Shell Command: Install 'code' command in PATH**, so that `code` opens files from the terminal. On a PC the installer does this for you.

2. **Git**: check whether you have it with `git --version`. If not:
   - PC: `winget install --id Git.Git -e --source winget`
   - Mac: `git --version` offers to install the Command Line Tools, which include Git. Click **Install**.

3. **Node**: check with `node --version`. You need v24 or later. If not:
   - PC: `winget install OpenJS.NodeJS.LTS`
   - Mac: download the LTS installer from https://nodejs.org and run it

4. **uv**:
   - PC: `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`
   - Mac: `curl -LsSf https://astral.sh/uv/install.sh | sh`

5. **Google Chrome**: the Playwright MCP server and the project's browser tests use it. If you don't have it, install it from https://www.google.com/chrome

Quit VS Code and open it again so the terminal finds the new tools. Then check each one:

```
git --version
node --version
npm --version
uv --version
```

On a PC, if `npm --version` says running scripts is disabled on this system, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` and try again.

## Install your coding agent

Follow step 1 of the guide for your agent in [coding_agents/](coding_agents/) to install it and sign in. I use Claude Code: [coding_agents/claude_code.md](coding_agents/claude_code.md).

## Clone the repo

In the VS Code terminal:

```
mkdir ~/projects
cd ~/projects
git clone https://github.com/ed-donner/accountable
```

Skip the `mkdir` if you already have a projects folder. Keep it out of folders that OneDrive or iCloud sync.

Then choose **File**, **Open Folder** and pick the `accountable` folder. If VS Code asks whether you trust the authors, choose yes.

## Start your coding agent

Opening the folder reloads VS Code and closes the terminal, so open a new one from the **Terminal** menu with **New Terminal**. It opens in the `accountable` folder. Start your agent (`claude` for Claude Code) and accept its prompt to trust the folder. Claude Code ignores the project's settings until you do. Then carry on with the rest of your agent's guide.
