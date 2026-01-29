# MCP (Model Context Protocol) setup

Cursor uses MCP servers defined in **`~/.cursor/mcp.json`** (global config). This project’s MCP setup avoids hardcoded secrets by using wrapper scripts and an env file.

## Secrets

1. Copy the example env file:
   ```bash
   cp ~/.cursor/.env.mcp.example ~/.cursor/.env.mcp
   ```
2. Edit `~/.cursor/.env.mcp` and set the variables for the MCP servers you use (GitHub, Tavily, v0, Apify, Browserstack, Infisical, etc.).
3. Do not commit `~/.cursor/.env.mcp`. It is not in the repo; keep it only on your machine.

## Wrapper scripts

Servers that need API keys or tokens are started via **`~/.cursor/scripts/run-mcp-with-env.sh`**, which:

- Sources `~/.cursor/.env.mcp` if it exists
- Expands `$VAR` in arguments (e.g. for `--header "Authorization:$V0_AUTH_HEADER"`)
- Runs the real MCP command

Infisical uses project-specific scripts so two projects can use different credentials:

- **infisical-craftvaria**: `run-mcp-infisical-craftvaria.sh` (uses `INFISICAL_CRAFTVARIA_*`)
- **infisical-lukbot**: `run-mcp-infisical-lukbot.sh` (uses `INFISICAL_LUKBOT_*`)

Scripts live under `~/.cursor/scripts/` and must be executable (`chmod +x`).

## Filesystem server

The filesystem MCP server is configured with the LukBot workspace path so it can read this repo. To point it at another directory, edit the `filesystem` entry in `~/.cursor/mcp.json` and change the path in `args`.

**GitHub** uses `run-mcp-github.sh` and reads `GITHUB_PERSONAL_ACCESS_TOKEN` from `.env.mcp` (no Docker required).

**BrowserStack** uses `run-mcp-browserstack.sh` and reads `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY` from `.env.mcp`. If either is unset, the server is skipped (no error).

**Infisical** wrappers skip cleanly when their env vars are unset. For LukBot, set `INFISICAL_LUKBOT_CLIENT_ID` and `INFISICAL_LUKBOT_CLIENT_SECRET` in one of: `~/.cursor/.env.mcp`, the project `.cursor/.env.mcp`, or the project root `.env`. The LukBot wrapper sources them in that order when the script runs with LukBot as the current directory. The `.cursor/` directory is gitignored.

## Troubleshooting

- **GitHub**: Set `GITHUB_PERSONAL_ACCESS_TOKEN` in `.env.mcp`.
- **BrowserStack**: Set `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY` in `.env.mcp`; if unset, the server exits without error.
- **fetch**: Removed from the default `mcp.json` (requires Docker). To use it, add a `fetch` entry with `"command": "docker"` and `"args": ["run", "-i", "--rm", "mcp/fetch"]` and ensure Docker is running.
- **cloudflare-observability / cloudflare-bindings**: Each uses a distinct OAuth callback port (3335 and 3336) to avoid port conflicts.
- **infisical-craftvaria / infisical-lukbot**: Set the corresponding vars in `.env.mcp` to enable; when unset, the wrapper exits without error.

## After changes

Restart Cursor (or reload the window) after changing `~/.cursor/mcp.json` or `~/.cursor/.env.mcp` so MCP servers pick up the new config.

## AI agents and MCP usage

For guidance on when to use which MCP tools and how AI agents should work on this repo, see [AGENTS.md](../AGENTS.md) at the project root. It maps MCPs (filesystem, GitHub, Context7, Tavily, Playwright, etc.) to tasks and references Cursor rules and skills.
