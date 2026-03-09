# Lucky — Database and Services

## Database

- **ORM**: Prisma 7.4.2, PostgreSQL, @prisma/adapter-pg driver adapter
- **Schema**: `prisma/schema.prisma` — 24 models, `prisma-client` provider, `engineType = "client"`
- **Config**: `prisma/prisma.config.ts` — CLI datasource URL
- **Generated client**: `packages/shared/src/generated/prisma/`
- **Client init**: `packages/shared/src/utils/database/prismaClient.ts` — PrismaPg adapter
- **Commands**: `npm run db:migrate`, `npm run db:generate`, `npm run db:deploy`, `npm run db:studio`

## 24 Prisma Models

Core: `User`, `UserPreferences`, `Guild`, `GuildSettings`, `UserSession`, `GuildSession`
Music: `TrackHistory`, `CommandUsage`, `RateLimit`, `Download`, `Recommendation`, `LastFmLink`
Moderation: `ModerationCase`, `ModerationSettings`, `AutoModSettings`
Management: `EmbedTemplate`, `AutoMessage`, `CustomCommand`, `ServerLog`
Features: `ReactionRoleMessage`, `ReactionRoleMapping`, `RoleExclusion`, `TwitchNotification`

## Service Layer

All services in `packages/shared/src/services/`, exported from `index.ts`.

| Service                   | Status     | Notes                   |
| ------------------------- | ---------- | ----------------------- |
| ModerationService         | ✅ Working | as any workaround       |
| AutoModService            | ✅ Fixed   | Aligned to Prisma schema |
| EmbedBuilderService       | ✅ Working | 132 lines, fully impl   |
| AutoMessageService        | ✅ Working | as any workaround       |
| CustomCommandService      | ✅ Working | as any workaround       |
| ServerLogService          | ✅ Working | as any workaround       |
| FeatureToggleService      | ✅ Working |                         |
| LyricsService             | ✅ Working |                         |
| TrackHistoryService       | ✅ Working |                         |
| GuildSettingsService      | ✅ Working |                         |
| TwitchNotificationService | ✅ Working |                         |
| LastFmLinkService         | ✅ Working |                         |

## Redis

Used for: rate limiting, session caching, feature toggle cache.
Accessed via `packages/shared/src/services/redis/`.
