# Using Microsoft Edge with Playwright MCP

**Course:** AI SDLC: The AI-Native Software Engineer in the Agentic Era  
**Community contribution:** David (test automation background)

## Do I need Google Chrome?

Not necessarily. If you have Microsoft Edge installed, you can use it with the official Playwright MCP server instead of installing Google Chrome solely for Playwright MCP.

Microsoft Edge and Google Chrome both use the Chromium browser engine. Playwright MCP supports Edge directly via the `msedge` browser option. **Chrome is the default**, so you need to select Edge explicitly.

## Launch Playwright MCP with Edge

```bash
npx @playwright/mcp@latest --browser=msedge
```

This launches the MCP server configured to use Microsoft Edge. Ordinarily, your coding agent starts the server through its MCP configuration rather than you running this command in a separate terminal.

For an MCP client that uses an `mcpServers` JSON configuration, an example is:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--browser=msedge"]
    }
  }
}
```

Add the browser argument to your **existing** Playwright MCP configuration if you already have one; do not register a second server with the same name. The exact configuration file and format vary by coding agent.

## Quick check

1. Ensure Microsoft Edge is installed and that Node.js/npm can run `npx`.
2. Configure your coding agent's Playwright MCP server to use `--browser=msedge`.
3. Ask the agent to open a simple page with Playwright MCP and verify its title. Edge should launch instead of Chrome.

## Browser compatibility at a glance

The official Playwright MCP `--browser` options are:

| Option | Browser |
| --- | --- |
| `chrome` | Google Chrome (default) |
| `msedge` | Microsoft Edge |
| `firefox` | Mozilla Firefox |
| `webkit` | WebKit |

Brave, Opera, and Vivaldi are also Chromium-based, but they are **not** listed as direct choices for the standard `--browser` flag. Advanced executable-path or CDP configurations may be possible; they are outside the scope of this note.

**Scope:** This tip covers Playwright MCP's browser selection. A course exercise that specifically depends on Google Chrome, its extensions, or an existing Chrome profile may still need Chrome or additional configuration.

## References

- [Playwright MCP configuration: browser selection](https://playwright.dev/mcp/configuration/options)
- [Official Playwright MCP repository](https://github.com/microsoft/playwright-mcp)
