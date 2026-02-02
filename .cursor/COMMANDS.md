# LukBot Agent Commands (Workflows)

Standard workflows the agent can run when asked. Use scripts and npm scripts; prefer Docker when the project provides it.

## Verify (full check)

Run before considering a task complete or before PR:

1. Lint: `npm run lint`
2. Typecheck: `npm run type:check`
3. Build: `npm run build` (and `npm run build:frontend` if frontend changed)
4. Tests: `npm run test`

Use a single command when available (e.g. `npm run test`); otherwise run in order. Report failures with a brief CI-like summary.

## Test E2E

1. Start frontend (or full stack): `npm run dev:frontend` or Docker per `docker-compose.dev.yml`
2. Run Playwright: `npx playwright test` (from package or root per config)
3. Use MCP **user-playwright** or **cursor-ide-browser** when verifying UI in chat

## DB operations

- Generate client: `npm run db:generate`
- Migrate: `npm run db:migrate` (local) or `npm run db:deploy` (deploy)
- Studio: `npm run db:studio`

Use **prisma-redis-lukbot** skill when changing schema or migrations.

## Deploy checklist

1. Verify (lint, typecheck, build, test)
2. Ensure no hardcoded secrets; env documented in `.env.example` and `docs/`
3. CHANGELOG.md and relevant docs updated
4. Follow project CI (see `.github/workflows/`)

## Specialist (subagent)

When the user asks to "act as frontend/backend/Discord/data specialist", apply the matching subagent rule:

- Frontend: `.cursor/rules/subagent-frontend.mdc` + **frontend-react-vite** skill
- Backend: `.cursor/rules/subagent-backend.mdc` + **backend-express** skill
- Discord: `.cursor/rules/subagent-discord.mdc` + **discord-commands** + **music-queue-player** skills
- Data: `.cursor/rules/subagent-data.mdc` + **prisma-redis-lukbot** skill
