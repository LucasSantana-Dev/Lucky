# Nexus — Project Overview

## What It Is

A modular Discord bot with a web dashboard. Built with TypeScript + Node.js as a monorepo.

Primary features: Music playback (YouTube/Spotify), moderation commands, auto-moderation, embed builder, custom commands, auto-messages, server logging, Twitch notifications, Last.fm scrobbling, feature toggles.

## Monorepo Structure

```
packages/
├── shared/     # Services, Prisma client, utilities — imported by bot and backend
├── bot/        # Discord.js bot — slash commands, event handlers
├── backend/    # Express API — REST endpoints for the dashboard
└── frontend/   # React + Vite SPA — the web dashboard
prisma/
└── schema.prisma   # 24 models, PostgreSQL
```

## Stack

- **Runtime**: Node.js 22.x, ES modules (`"type": "module"`)
- **Language**: TypeScript 5.9.3 strict mode
- **Discord**: Discord.js 14.25.1, Discord Player 7.1.0
- **Database**: Prisma 6.19.2 (package.json) / 7.x (README) + PostgreSQL
- **Cache**: Redis (via shared services)
- **Frontend**: React 19, Vite, Tailwind CSS, Framer Motion
- **Backend**: Express, Discord OAuth
- **Testing**: Jest with ESM support
- **Build**: tsup (prod), tsx (dev)

## Key Environment Variables (no values — see .env.example)

- `DISCORD_TOKEN`, `CLIENT_ID` — required for bot
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection
- `BOT_NAME`, `BOT_COLOR`, `BOT_DESCRIPTION` — customization
- `SENTRY_DSN` — error tracking (optional)
- `WEBAPP_ENABLED=true` — enables the web dashboard

## Entry Points

- Bot: `packages/bot/src/index.ts`
- Backend: `packages/backend/src/index.ts`
- Frontend: `packages/frontend/src/main.tsx`
- Shared: `packages/shared/src/index.ts`

## Agent Tools

- Skills: `.agent-skills/` (skills.sh ecosystem) + `.cursor/skills/` (project-specific)
- Commands: `.cursor/COMMANDS.md` (verify, E2E, DB ops, deploy checklist)
- Subagent rules: `.cursor/rules/subagent-*.mdc`
- MCP guidance: `AGENTS.md`
