# LukBot – AI agents and MCP usage

This file helps AI coding agents work effectively on LukBot: project layout, when to use which tools, and how to stay within project rules.

## Project at a glance

- **Monorepo**: `packages/shared`, `packages/bot`, `packages/backend`, `packages/frontend`
- **Stack**: Discord.js + Discord Player, Express, React, Prisma (PostgreSQL), Redis
- **Docs**: `docs/` (ARCHITECTURE, MCP_SETUP, FRONTEND, WEBAPP_SETUP, etc.)

## Cursor rules

- **Always on**: `.cursor/rules/lukbot-project.mdc` — structure, stack, conventions
- **By area**: `lukbot-discord-bot.mdc`, `lukbot-backend-api.mdc`, `lukbot-frontend.mdc`, `lukbot-shared.mdc` (apply when editing that package)
- **Existing**: ts-js-rules, error-handling, testing-quality, security-secrets, commit-pr-release, db-migrations, etc. — follow them for TS, errors, tests, secrets, commits, migrations

## Skills (when to use)

| Task | Skill |
|------|--------|
| Add/change slash command | `discord-commands` |
| Play/queue/skip/volume, player lifecycle | `music-queue-player` |
| Schema, migrations, DB/Redis in shared | `prisma-redis-lukbot` |
| Docker, compose, local run | `lukbot-docker-dev` |

Skills live in `.cursor/skills/`. Use the matching skill when doing the task.

## MCP tools – when to use

Use these MCPs when they fit the task; don’t force them.

| MCP | Use for |
|-----|--------|
| **user-filesystem** | Read/write repo files, list dirs, stay in workspace |
| **user-GitHub** | Issues, PRs, repo metadata, branch/commit info |
| **user-Context7** | Up-to-date docs (Discord.js, Prisma, Node, React, etc.) |
| **user-tavily** | Web search for APIs, errors, best practices |
| **user-sequential-thinking** | Multi-step reasoning, architecture, refactors |
| **user-playwright** / **user-puppeteer** / **cursor-ide-browser** | E2E/browser tests for frontend; verify web UI |
| **user-chrome-devtools** | Inspect frontend runtime, network, console |
| **user-browser-tools** | Browser automation when testing webapp |
| **user-v0** | UI component or page ideas (reference only; adapt to repo patterns) |
| **user-@magicuidesign/mcp** | UI/design system reference if aligned with stack |
| **user-cloudflare-observability** / **cloudflare-bindings** | Only if LukBot is deployed on Cloudflare Workers |
| **user-prisma-remote** | Remote Prisma/DB introspection if configured |

**Not used by default**: radar_search, mcp-gateway, desktop-commander, minecraft, composio, MCP_DOCKER, curl — use only when the task clearly needs them (e.g. Docker API via MCP_DOCKER, desktop automation via desktop-commander).

## Agent behavior

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
