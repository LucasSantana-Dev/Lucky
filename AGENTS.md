# LukBot – AI agents and MCP usage

This file helps AI coding agents work effectively on LukBot: project layout, when to use which tools, and how to stay within project rules.

## Project at a glance

- **Monorepo**: `packages/shared`, `packages/bot`, `packages/backend`, `packages/frontend`
- **Stack**: Discord.js + Discord Player, Express, React, Prisma (PostgreSQL), Redis
- **Docs**: `docs/` (ARCHITECTURE, MCP_SETUP, FRONTEND, WEBAPP_SETUP, etc.)

## Cursor rules

- **Always on**: `.cursor/rules/lukbot-project.mdc` — structure, stack, conventions
- **By area**: `lukbot-discord-bot.mdc`, `lukbot-backend-api.mdc`, `lukbot-frontend.mdc`, `lukbot-shared.mdc` (apply when editing that package)
- **Subagents**: `subagent-frontend.mdc`, `subagent-backend.mdc`, `subagent-discord.mdc`, `subagent-data.mdc` — apply when acting as that specialist or when the task is primarily that area (see [Commands](#commands-workflows) for when to use which)
- **Existing**: ts-js-rules, error-handling, testing-quality, security-secrets, commit-pr-release, db-migrations, etc. — follow them for TS, errors, tests, secrets, commits, migrations

## Skills (when to use)

| Task                                        | Skill                 |
| ------------------------------------------- | --------------------- |
| Add/change slash command                    | `discord-commands`    |
| Play/queue/skip/volume, player lifecycle    | `music-queue-player`  |
| Schema, migrations, DB/Redis in shared      | `prisma-redis-lukbot` |
| Docker, compose, local run                  | `lukbot-docker-dev`   |
| Frontend (React, Vite, Tailwind)            | `frontend-react-vite` |
| Backend (Express API, routes, services)     | `backend-express`     |
| E2E tests, Playwright, browser verification | `e2e-playwright`      |
| Docs lookup, web search, MCP usage          | `mcp-docs-search`     |

Skills live in `.cursor/skills/`. Use the matching skill when doing the task.

## Commands (workflows)

Standard workflows (verify, test E2E, DB ops, deploy checklist, specialist) are in **`.cursor/COMMANDS.md`**. When the user asks to “run verify”, “full check”, “test E2E”, or to “act as frontend/backend/Discord/data specialist”, follow that doc.

## Superpowers (Codex) – use in chat and prompts

Superpowers are installed at **`~/.codex/superpowers`**. To use a skill in chat or in a Cursor prompt, the agent must run the CLI with a **real skill name** (not the literal `<skill-name>`).

**Load a skill** (replace `<skill-name>` with one of the names below):

```bash
~/.codex/superpowers/.codex/superpowers-codex use-skill <skill-name>
```

**List all skills:**

```bash
~/.codex/superpowers/.codex/superpowers-codex find-skills
```

**Available superpowers skills** (use these exact names in chat/prompts or when calling the CLI):

| Skill name                                   | Use when                                                             |
| -------------------------------------------- | -------------------------------------------------------------------- |
| `superpowers:brainstorming`                  | Before creative work: features, components, behavior changes         |
| `superpowers:dispatching-parallel-agents`    | Multiple independent tasks, no shared state                          |
| `superpowers:executing-plans`                | You have a written plan to execute with review checkpoints           |
| `superpowers:finishing-a-development-branch` | Implementation done, tests pass; decide merge/PR/cleanup             |
| `superpowers:receiving-code-review`          | Before implementing review feedback; verify technically              |
| `superpowers:requesting-code-review`         | Before merging or when completing major features                     |
| `superpowers:subagent-driven-development`    | Executing a plan with independent tasks in this session              |
| `superpowers:systematic-debugging`           | Any bug, test failure, or unexpected behavior before proposing fixes |
| `superpowers:test-driven-development`        | Before writing implementation for a feature or bugfix                |
| `superpowers:using-git-worktrees`            | Feature work isolated from current workspace                         |
| `superpowers:using-superpowers`              | How to find and use skills (invoke skill tool before responding)     |
| `superpowers:verification-before-completion` | Before claiming work complete; run verification and confirm output   |
| `superpowers:writing-plans`                  | You have a spec or requirements for a multi-step task                |
| `superpowers:writing-skills`                 | Creating, editing, or verifying skills                               |

**Agent behavior:** When the user asks in chat or in a prompt to use a superpowers skill (e.g. “use brainstorming”, “follow TDD”, “run systematic debugging”), run `~/.codex/superpowers/.codex/superpowers-codex use-skill <skill-name>` with the matching name above, then follow the skill’s instructions. Use MCP tools (Context7, filesystem, GitHub, etc.) as needed while applying the skill.

## MCP tools – when to use

Use these MCPs when they fit the task; don’t force them.

| MCP                                                               | Use for                                                              |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| **user-filesystem**                                               | Read/write repo files, list dirs, stay in workspace                  |
| **user-GitHub**                                                   | Issues, PRs, repo metadata, branch/commit info                       |
| **user-Context7**                                                 | Up-to-date docs (Discord.js, Prisma, Node, React, Tailwind, etc.)    |
| **user-tavily**                                                   | Web search for APIs, errors, best practices                          |
| **user-sequential-thinking**                                      | Multi-step reasoning, architecture, refactors                        |
| **user-playwright** / **user-puppeteer** / **cursor-ide-browser** | E2E/browser tests for frontend; verify web UI                        |
| **user-chrome-devtools**                                          | Inspect frontend runtime, network, console                           |
| **user-browser-tools**                                            | Browser automation, console/network logs, audits when testing webapp |
| **user-v0**                                                       | UI component or page ideas (reference only; adapt to repo patterns)  |
| **user-@magicuidesign/mcp**                                       | UI/design system reference if aligned with stack                     |
| **user-cloudflare-observability** / **user-cloudflare-bindings**  | Only if LukBot is deployed on Cloudflare Workers                     |
| **user-prisma-remote**                                            | Remote Prisma/DB introspection if configured                         |
| **user-apify-dribbble**                                           | Scraping/data extraction when task clearly needs it                  |
| **radar_search** (Cloudflare Radar)                               | Internet insights, threat intel when task needs it                   |
| **mcp-gateway**                                                   | When using a gateway that aggregates MCP servers                     |
| **user-desktop-commander**                                        | Desktop automation when task clearly needs it                        |
| **MCP_DOCKER**                                                    | Docker API when task needs container/registry operations             |
| **curl** / **fetch**                                              | HTTP from agent when no MCP covers the endpoint                      |

**Context Forge gateway:** When the Context Forge gateway is enabled in Cursor, many MCPs (GitHub, Tavily, Context7, Playwright, etc.) are reached through it; use the gateway’s tools as needed. See [docs/MCP_SETUP.md](docs/MCP_SETUP.md) for connection.

**Use when task needs them:** radar_search, mcp-gateway, desktop-commander, MCP_DOCKER, curl. Not used by default: minecraft, composio — use only when explicitly required.

## Cursor Hooks

Project-level hooks live in `.cursor/hooks.json` and run at agent lifecycle events: **sessionStart** (inject context: AGENTS.md, subagents, skills, `.cursor/COMMANDS.md`, MCP usage), **afterFileEdit** (Prettier + ESLint on the edited file), **beforeShellExecution** (block dangerous commands), **stop** (append to `.cursor/hooks.log` for debugging). Scripts are in `.cursor/hooks/*.sh`. To debug, use Cursor Settings → Hooks or the Hooks output channel.

## Agent behavior

Use the **specific specialist and skills** for the task; use **MCP tools** to fix or implement when applicable.

1. **Scope**: Prefer the smallest change that solves the problem. Don’t refactor unrelated code or add abstractions “for the future.”
2. **Comments**: No redundant or decorative AI comments. Code should be clear from names and structure; comment only when logic is non-obvious.
3. **Boilerplate**: Avoid extra layers, base classes, or indirection unless the codebase already uses them for that case.
4. **Secrets / env**: No hardcoded secrets, IPs, or ports. Use `.env` and `docs/` for required vars.
5. **Docs and changelog**: Update `CHANGELOG.md` and relevant `docs/` when behavior or setup changes.
6. **Tests**: Add or adjust unit/integration tests when changing behavior; follow patterns in `packages/*/tests` and root `tests/`.
7. **Commits**: Angular-style commits; multiple small commits by scope when possible.

## Commands reference

- Build: `npm run build` (shared → bot → backend); `npm run build:frontend`
- Dev: `npm run dev:bot`, `npm run dev:backend`, `npm run dev:frontend`
- DB: `npm run db:generate`, `npm run db:migrate`, `npm run db:deploy`, `npm run db:studio`
- Quality: `npm run lint`, `npm run type:check`, `npm run test`

Use Docker for local when available (`docker-compose.dev.yml`). Prefer scripts in `scripts/` for documented operations.
