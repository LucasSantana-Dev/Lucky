# Lucky – AI agents and MCP usage

This file helps AI coding agents work effectively on Lucky: project layout, when to use which tools, and how to stay within project rules.

## Project at a glance

- **Monorepo**: `packages/shared`, `packages/bot`, `packages/backend`, `packages/frontend`
- **Stack**: Discord.js + Discord Player, Express, React, Prisma (PostgreSQL), Redis
- **Docs**: `docs/` (ARCHITECTURE, MCP_SETUP, FRONTEND, WEBAPP_SETUP, etc.)

## Session Start

At the start of every session:

1. Load Serena memories: `activate_project` → `list_memories` (files in `.serena/memories/`)
2. Check `git status` and `git log --oneline -5`
3. Read `.serena/memories/current-state.md` for build status and `.serena/memories/next-priorities.md` for what to work on

## Skills (when to use)

### Project skills (`.cursor/skills/`)

| Task                                              | Skill                    |
| ------------------------------------------------- | ------------------------ |
| Add/change slash command                          | `discord-commands`       |
| Play/queue/skip/volume, player lifecycle          | `music-queue-player`     |
| Schema, migrations, DB/Redis in shared            | `prisma-redis-lucky`     |
| Docker, compose, local run                        | `lucky-docker-dev`       |
| Frontend (React, Vite, Tailwind)                  | `frontend-react-vite`    |
| Backend (Express API, routes, services)           | `backend-express`        |
| E2E tests, Playwright, browser verification       | `e2e-playwright`         |
| Docs lookup, web search, MCP usage                | `mcp-docs-search`        |
| Moderation commands + AutoModService              | `moderation-automod`     |
| Bot event wiring (messageCreate, memberAdd, etc.) | `event-handlers`         |
| Embed builder, custom commands, auto-messages     | `management-features`    |
| Unit tests, Jest ESM mocks, fixing disabled tests | `testing-lucky`          |
| CI gate triage and required-check recovery        | `lucky-ci-gate-recovery` |
| Recover GitHub MCP transport/auth failures        | `mcp-github-recovery`    |
| OpenCode config, plugins, attach, verification    | `opencode-lucky-workflows` |

### Ecosystem skills (`.agent-skills/` — from skills.sh)

| Task                                          | Skill                            |
| --------------------------------------------- | -------------------------------- |
| Any bug, test failure, unexpected behavior    | `systematic-debugging`           |
| Implementing any feature or bugfix            | `test-driven-development`        |
| Before claiming work complete / before commit | `verification-before-completion` |
| Before implementing a new feature             | `brainstorming`                  |
| Before merging / after major feature          | `requesting-code-review`         |
| React components, performance, bundle size    | `vercel-react-best-practices`    |
| UI review, accessibility, design audit        | `web-design-guidelines`          |
| Express routes, middleware, backend API       | `nodejs-backend-patterns`        |
| TypeScript types, removing `as any`           | `typescript-advanced-types`      |
| Prisma schema changes, migrations             | `database-migration`             |

## Commands (workflows)

Standard workflows: verify (full check), test E2E, DB ops, deploy checklist, specialist modes. When the user asks to "run verify", "full check", "test E2E", or to "act as frontend/backend/Discord/data specialist", follow the appropriate workflow.

To install skills from the ecosystem, use: `npx skills add <owner/repo> --skill <name>`. See [skills.sh](https://skills.sh/) for the skill directory.

## Superpowers (Codex) – use in chat and prompts

Superpowers are installed at **`~/.codex/superpowers`**. To use a skill in chat or in a prompt, the agent must run the CLI with a **real skill name** (not the literal `<skill-name>`).

**Load a skill** (replace `<skill-name>` with one of the names below):

```bash
~/.codex/superpowers/.codex/superpowers-codex use-skill <skill-name>
```

**List all skills:**

```bash
~/.codex/superpowers/.codex/superpowers-codex find-skills
```

**Available superpowers skills** (use these exact names when calling the CLI):

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

| MCP                                                              | Use for                                                              |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| **user-filesystem**                                              | Read/write repo files, list dirs, stay in workspace                  |
| **user-GitHub**                                                  | Issues, PRs, repo metadata, branch/commit info                       |
| **user-Context7**                                                | Up-to-date docs (Discord.js, Prisma, Node, React, Tailwind, etc.)    |
| **user-tavily**                                                  | Web search for APIs, errors, best practices                          |
| **user-sequential-thinking**                                     | Multi-step reasoning, architecture, refactors                        |
| **user-playwright** / **user-puppeteer**                         | E2E/browser tests for frontend; verify web UI                        |
| **user-chrome-devtools**                                         | Inspect frontend runtime, network, console                           |
| **user-browser-tools**                                           | Browser automation, console/network logs, audits when testing webapp |
| **user-v0**                                                      | UI component or page ideas (reference only; adapt to repo patterns)  |
| **user-@magicuidesign/mcp**                                      | UI/design system reference if aligned with stack                     |
| **user-cloudflare-observability** / **user-cloudflare-bindings** | Only if Lucky is deployed on Cloudflare Workers                      |
| **user-prisma-remote**                                           | Remote Prisma/DB introspection if configured                         |
| **user-apify-dribbble**                                          | Scraping/data extraction when task clearly needs it                  |
| **radar_search** (Cloudflare Radar)                              | Internet insights, threat intel when task needs it                   |
| **mcp-gateway**                                                  | When using a gateway that aggregates MCP servers                     |
| **user-desktop-commander**                                       | Desktop automation when task clearly needs it                        |
| **MCP_DOCKER**                                                   | Docker API when task needs container/registry operations             |
| **curl** / **fetch**                                             | HTTP from agent when no MCP covers the endpoint                      |

**Use when task needs them:** radar_search, mcp-gateway, desktop-commander, MCP_DOCKER, curl. Not used by default: minecraft, composio — use only when explicitly required.

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


- Repo-local OpenCode behavior lives in `opencode.jsonc`, `.opencode/plugins`, and `.opencode/skills`.
- Host-local OpenCode auth, provider state, and MCP credentials stay in `~/.config/opencode`.
- Use `scripts/opencode-sync-project-skills.sh` after changing project skills or OpenCode skill bridges.
- Use `scripts/opencode-install-community-plugins.sh` to prime approved OpenCode community add-ons locally or on `server-do-luk`.
- Use `scripts/opencode-verify.sh` after OpenCode config/plugin changes.
- `scripts/opencode-attach-server-do-luk.sh` supports `OPENCODE_REMOTE_DIR` when the remote session should target a remote worktree instead of `/home/luk-server/Lucky`.
