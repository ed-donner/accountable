# Devin CLI agent guide

`devin.md` is a Week 1 Day 2 guide for Cognition's Devin CLI, which the course doesn't cover. It follows the same steps as the other agent guides in `course/coding_agents/`: install and sign in, AGENTS.md, personal instructions, config and scopes, permissions, the Playwright MCP server, the brand skill, and a plugin equivalent.

The Devin specifics: permissions use `Exec`/`Read`/`Write` matchers in `.devin/config.json`, MCP servers land in `.devin/mcp_config.json` (with `-s project` to keep them shared), and skills go in `.devin/skills/` or the shared `.agents/skills/`. Written against devin-cli 3000.6.7 on macOS.

My fork: https://github.com/LieBieS/accountable
