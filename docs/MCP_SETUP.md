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
- **infisical-lucky**: `run-mcp-infisical-lucky.sh` (uses `INFISICAL_LUCKY_*`)

Scripts live under `~/.cursor/scripts/` and must be executable (`chmod +x`).

## Filesystem server

The filesystem MCP server is configured with the Lucky workspace path so it can read this repo. To point it at another directory, edit the `filesystem` entry in `~/.cursor/mcp.json` and change the path in `args`.

**GitHub** uses `run-mcp-github.sh` and reads `GITHUB_PERSONAL_ACCESS_TOKEN` from `.env.mcp` (no Docker required).

**BrowserStack** uses `run-mcp-browserstack.sh` and reads `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY` from `.env.mcp`. If either is unset, the server is skipped (no error).

**Infisical** wrappers skip cleanly when their env vars are unset. For Lucky, set `INFISICAL_LUCKY_CLIENT_ID` and `INFISICAL_LUCKY_CLIENT_SECRET` in one of: `~/.cursor/.env.mcp`, the project `.cursor/.env.mcp`, or the project root `.env`. The Lucky wrapper sources them in that order when the script runs with Lucky as the current directory. The `.cursor/` directory is gitignored.

## MCP Gateway (Context Forge)

The MCP gateway runs in a **separate project** (e.g. `~/Desenvolvimento/mcp-gateway` or your own clone), using **Docker**. It aggregates multiple MCP servers behind one endpoint; Cursor connects to that single gateway instead of configuring each server in `mcp.json`.

1. **Run the gateway** in its project with Docker: see that project’s README (`./start.sh` or `docker run ... ghcr.io/ibm/mcp-context-forge:latest`).
2. **Register upstream MCP servers** in the gateway (Admin UI or API) and create a **virtual server** that bundles the tools you want.
3. **Generate a JWT** (see gateway project README: `docker exec mcpgateway python3 -m mcpgateway.utils.create_jwt_token ...`) and note the virtual server URL. From Cursor you use the **Docker wrapper**, so the URL must be reachable from inside a container: use `http://host.docker.internal:4444/servers/<UUID>/mcp` (on Linux the wrapper needs `--add-host=host.docker.internal:host-gateway`).
4. **Add one entry in `~/.cursor/mcp.json`** that runs the stdio wrapper via **Docker** (no local Python). Copy [docs/mcp.json.example](mcp.json.example) to `~/.cursor/mcp.json` (or merge the entry into your existing config) and replace `YOUR_SERVER_UUID` and `YOUR_JWT_TOKEN` with real values. The example uses `docker run` with the Context Forge image and the wrapper command.

When the Context Forge gateway is enabled, many MCPs (GitHub, Tavily, Context7, etc.) are reached through it; no need to list each server separately in `mcp.json`.

## MCPMarket servers

Additional MCP servers you can add to `~/.cursor/mcp.json` or register in the Context Forge gateway (in the gateway project):

| Server             | Purpose                    | Install (stdio)                                                                                           |
| ------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------- |
| **task-master**    | Task and plan management   | Check [mcpmarket.com/server/task-master](https://mcpmarket.com/server/task-master) for `npx`/command.     |
| **gpt-researcher** | Research and summarization | Check [mcpmarket.com/server/gpt-researcher-1](https://mcpmarket.com/server/gpt-researcher-1) for install. |
| **beads**          | MCP/agent workflows        | Check [mcpmarket.com/server/beads](https://mcpmarket.com/server/beads) for install.                       |
| **chrome**         | Browser automation         | Check [mcpmarket.com/server/chrome-browser](https://mcpmarket.com/server/chrome-browser) for install.     |

If using Context Forge: register each server as an upstream in the gateway project (gateway API or `mcpgateway.translate` for stdio servers), then use the single gateway entry in Cursor.

**Superpowers** is not an MCP server in Cursor; it is used via the CLI at `~/.codex/superpowers` (see AGENTS.md).

## Adding skills from MCPMarket

MCPMarket lists both **skills** (Cursor-style or prompt packs) and **MCP servers**. How to add them:

- **Cursor skill (markdown):** If the MCPMarket page describes a Cursor skill (e.g. a `.md` file), add `.cursor/skills/<name>/SKILL.md` with the content and reference it in AGENTS.md under “Skills (when to use)”.
- **MCP server:** If it is an MCP server, add it to `~/.cursor/mcp.json` (command/args or URL) or register it in the Context Forge gateway project; then use the server’s tools from Cursor.

For each [mcpmarket.com/tools/skills/...](https://mcpmarket.com/tools/skills/) or server page, follow the “Install” or “Cursor” instructions there. Example: “context-driven-development” may be a skill (add to `.cursor/skills/`) or an MCP (add to `mcp.json` or gateway).

## Troubleshooting

- **GitHub**: Set `GITHUB_PERSONAL_ACCESS_TOKEN` in `.env.mcp`.
- **BrowserStack**: Set `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY` in `.env.mcp`; if unset, the server exits without error.
- **fetch**: Removed from the default `mcp.json` (requires Docker). To use it, add a `fetch` entry with `"command": "docker"` and `"args": ["run", "-i", "--rm", "mcp/fetch"]` and ensure Docker is running.
- **cloudflare-observability / cloudflare-bindings**: Each uses a distinct OAuth callback port (3335 and 3336) to avoid port conflicts.
- **infisical-craftvaria / infisical-lucky**: Set the corresponding vars in `.env.mcp` to enable; when unset, the wrapper exits without error.

## After changes

Restart Cursor (or reload the window) after changing `~/.cursor/mcp.json` or `~/.cursor/.env.mcp` so MCP servers pick up the new config.

## Cursor Hooks

Project-level Cursor Hooks are in **`.cursor/hooks.json`** (and scripts in `.cursor/hooks/*.sh`). They run from the **project root**. Events in use:

- **sessionStart**: Injects one-line context pointing to AGENTS.md, skills, and npm scripts.
- **afterFileEdit**: Runs Prettier on the edited file; for `.ts`/`.tsx` also runs ESLint with `--fix` (root `eslint.config.js`).
- **beforeShellExecution**: Blocks obviously dangerous commands (e.g. `rm -rf /`, fork bomb, `mkfs`, `dd` to `/dev/`). Returns `permission: deny` and exit 2 for blocked commands.
- **stop**: Appends timestamp, status, and loop count to `.cursor/hooks.log` (fire-and-forget). `.cursor/hooks.log` is gitignored.

**How to test**: Restart Cursor, start an Agent session (session context should mention AGENTS.md), ask the agent to edit a file (Prettier/ESLint should run on that file), ask it to run a blocked command (e.g. `rm -rf /`) and confirm permission denied. End the session and check `.cursor/hooks.log` for a new line. Use Cursor Settings → Hooks or the Hooks output channel to see hook execution and errors.

## AI agents and MCP usage

For guidance on when to use which MCP tools and how AI agents should work on this repo, see [AGENTS.md](../AGENTS.md) at the project root. It maps MCPs (filesystem, GitHub, Context7, Tavily, Playwright, etc.) to tasks and references Cursor rules, **subagents** (`.cursor/rules/subagent-*.mdc`), **skills** (`.cursor/skills/`), and **commands** (`.cursor/COMMANDS.md` for verify, E2E, DB, deploy, specialist workflows).

**Superpowers (Codex):** Superpowers are installed at `~/.codex/superpowers`. To use a skill in Cursor chat or in a prompt, run `~/.codex/superpowers/.codex/superpowers-codex use-skill <skill-name>` with a real skill name (e.g. `superpowers:brainstorming`, `superpowers:test-driven-development`). See the “Superpowers (Codex)” section in AGENTS.md for the full skill list and agent behavior.

## OpenCode

Lucky now uses repo-local OpenCode config in `opencode.jsonc`.

### Config split

- Repo-local:
  - `opencode.jsonc`
  - `.opencode/plugins`
  - `.opencode/skills`
  - `scripts/opencode-*`
- Host-local:
  - `~/.config/opencode/opencode.jsonc`
  - provider auth
  - MCP credentials
  - host-only package cache and helper scripts

Never commit host-local auth, tokens, or MCP headers.

### Plugin posture

Default Lucky OpenCode stack:

- local Lucky plugins:
  - `./.opencode/plugins/lucky-policy.mjs`
  - `./.opencode/plugins/lucky-context.mjs`
  - `./.opencode/plugins/lucky-doc-reminders.mjs`
- approved community add-ons:
  - `opencode-shell-strategy`
  - `@tarquinen/opencode-dcp@latest`

`opencode-shell-strategy` is runtime-resolved through OpenCode’s plugin
resolver. `@tarquinen/opencode-dcp@latest` is the installable DCP package
behind dynamic context pruning.

These remain documented-only in v1 and are not enabled by default:

- `opencode-vibeguard`
- `opencode-helicone-session`
- `opencode-sentry-monitor`
- `opencode-type-inject`

Heavy orchestration plugins are intentionally excluded in v1:

- `Oh My OpenCode`
- `opencode-workspace`
- `opencode-background-agents`
- `opencode-worktree`

### Guardrails

Lucky OpenCode sessions hard-block:

- direct push to `main`
- `git reset --hard`
- `git checkout --`
- `git clean -fd` and `git clean -fdx`
- access to `.env`, `.env.*`, `.cursor/.env.mcp`, `~/.ssh/**`, `~/.aws/**`,
  `~/.config/fish/config.fish`, and OpenCode auth stores
- mutating work from the primary Lucky checkout unless
  `LUCKY_ALLOW_ROOT_MUTATION=1`

The plugins also inject:

- `OPENCODE_GIT_REPOSITORY`
- `OPENCODE_SERENA_PROJECT`
- `LUCKY_WORKTREE_ROOT`

### Commands

Repo-local OpenCode commands mirror `.cursor/COMMANDS.md`:

- `/verify`
- `/e2e`
- `/db`

### Project and global skills

Rebuild the project skill bridge:

```bash
./scripts/opencode-sync-project-skills.sh
```

Rebuild the global host-local skill bridge:

```bash
./scripts/opencode-sync-global-skills.sh
```

Sync global skills to `server-do-luk`:

```bash
./scripts/opencode-sync-server-do-luk-skills.sh
```

### Community plugin install

Prime the approved community add-ons locally:

```bash
./scripts/opencode-install-community-plugins.sh
```

Prime them on `server-do-luk`:

```bash
./scripts/opencode-install-community-plugins.sh --remote server-do-luk
```

### Verification

Local verification:

```bash
./scripts/opencode-verify.sh
```

Remote verification:

```bash
./scripts/opencode-verify.sh --remote server-do-luk
```

Useful direct checks:

```bash
opencode debug config
opencode debug skill
opencode mcp list
opencode run --format json "Say only OK"
```

### `server-do-luk` attach

Attach a local OpenCode client to the remote Lucky workspace:

```bash
./scripts/opencode-attach-server-do-luk.sh
```

To target a remote worktree instead of `/home/luk-server/Lucky`:

```bash
OPENCODE_REMOTE_DIR=/home/luk-server/Lucky/.worktrees/<branch> \
  ./scripts/opencode-attach-server-do-luk.sh
```

The remote helper remains:

```bash
~/.local/bin/opencode-lucky-serve
```

It starts OpenCode on `127.0.0.1:4096` and respects `OPENCODE_REMOTE_DIR` when
present.

### Remote auth recovery

If `server-do-luk` loses OpenAI auth:

```bash
ssh server-do-luk 'cd /home/luk-server/Lucky && ~/.opencode/bin/opencode providers login -p openai'
```
