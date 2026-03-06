# LukBot — Database and Services

## Database

- **ORM**: Prisma 6.x, PostgreSQL
- **Schema**: `prisma/schema.prisma` — 24 models
- **Generated client**: `packages/shared/src/generated/prisma/`
- **Commands**: `npm run db:migrate`, `npm run db:generate`, `npm run db:deploy`, `npm run db:studio`

## 24 Prisma Models

Core: `User`, `UserPreferences`, `Guild`, `GuildSettings`, `UserSession`, `GuildSession`
Music: `TrackHistory`, `CommandUsage`, `RateLimit`, `Download`, `Recommendation`, `LastFmLink`
Moderation: `ModerationCase`, `ModerationSettings`, `AutoModSettings`
Management: `EmbedTemplate` (missing `useCount`), `AutoMessage`, `CustomCommand`, `ServerLog`
Features: `ReactionRoleMessage`, `ReactionRoleMapping`, `RoleExclusion`, `TwitchNotification`

## Service Layer

All services live in `packages/shared/src/services/` and are exported from `index.ts`. Services are imported by both `packages/bot` and `packages/backend` via `@lukbot/shared/services`.

## Service Inventory

| Service                   | File                                          | Status     | Notes                   |
| ------------------------- | --------------------------------------------- | ---------- | ----------------------- |
| ModerationService         | ModerationService.ts + moderationSettings.ts  | ✅ Working | as any workaround       |
| AutoModService            | AutoModService.ts                             | ⚠️ Broken  | Wrong method signatures |
| EmbedBuilderService       | (missing)                                     | ❌ Missing | Top priority            |
| AutoMessageService        | AutoMessageService.ts                         | ✅ Working | as any workaround       |
| CustomCommandService      | CustomCommandService.ts                       | ✅ Working | as any workaround       |
| ServerLogService          | ServerLogService.ts + serverLogHelpers.ts     | ✅ Working | as any workaround       |
| FeatureToggleService      | FeatureToggleService.ts                       | ✅ Working |                         |
| LyricsService             | LyricsService.ts                              | ✅ Working |                         |
| TrackHistoryService       | TrackHistoryService.ts + trackHistoryStats.ts | ✅ Working |                         |
| GuildSettingsService      | GuildSettingsService.ts + guildCounters.ts    | ✅ Working |                         |
| TwitchNotificationService | TwitchNotificationService/                    | ✅ Working |                         |
| LastFmLinkService         | LastFmLinkService/                            | ✅ Working |                         |

## How to Add a New Service

1. Create `packages/shared/src/services/MyService.ts`
2. Use the pattern:

```typescript
import { getPrismaClient } from '../utils/database/prismaClient.js'
const prisma = getPrismaClient() as any // workaround until Prisma types fixed

export class MyService {
    async doThing(guildId: string): Promise<SomeType> {
        return await prisma.myModel.findMany({ where: { guildId } })
    }
}
export const myService = new MyService()
```

3. Export from `packages/shared/src/services/index.ts`
4. Keep under 250 lines — extract helpers if needed

## Redis

Used for: rate limiting, session caching, feature toggle cache. Accessed via `packages/shared/src/services/redis/`.
