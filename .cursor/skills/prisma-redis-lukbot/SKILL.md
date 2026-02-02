---
name: prisma-redis-lukbot
description: Use Prisma and Redis in LukBot. Use when changing schema, migrations, shared DB/Redis services, or key patterns.
---

# LukBot Prisma & Redis

## When to use

- Editing `prisma/schema.prisma` or adding migrations
- Changing DatabaseService, Redis client, or operations in `packages/shared`
- Adding or changing Redis key patterns or TTLs

## Prisma

- **Schema**: `prisma/schema.prisma` at repo root. Generator output: `../node_modules/.prisma/client`.
- **Client**: Single instance via `packages/shared/src/utils/database/prismaClient.ts`. Used by DatabaseService and other shared services.
- **Commands**: From repo root — `npm run db:generate`, `npm run db:migrate`, `npm run db:deploy`, `npm run db:studio`. Migrations live in `prisma/migrations/`.
- **Models**: User, Guild, GuildSettings, UserSession, GuildSession, TrackHistory, CommandUsage, RateLimit, Download, Recommendation, ReactionRole\*, RoleExclusion. Do not duplicate schema in code; use generated client types.

## Redis

- **Client**: `packages/shared/src/services/redis/` — client, config, eventHandlers, operations (base, key, string).
- **Usage**: Cache, sessions, rate limits, track history keys as defined in shared. Use operations modules; avoid ad-hoc key strings in bot/backend.
- **Keys**: Follow existing key builders and namespaces; document new keys in shared types or config.

## Conventions

- No raw Prisma/Redis usage in `packages/bot` or `packages/backend`; go through `@lukbot/shared` services.
- Migrations: additive changes preferred; avoid destructive changes without a clear migration path and backup.
