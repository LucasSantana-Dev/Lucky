# LukBot — Current State

Last updated: 2026-03-06

## Build Status

| Package           | Status     | Notes                                                |
| ----------------- | ---------- | ---------------------------------------------------- |
| shared            | ✅ Builds  | All services enabled with `as any` Prisma workaround |
| bot               | ✅ Builds  | All commands functional                              |
| frontend          | ✅ Builds  | Music API types fixed                                |
| backend (runtime) | ✅ Works   | Services functional at runtime                       |
| backend (tests)   | ⚠️ Partial | 92 passed, 25 failed (pre-existing Jest ESM issues)  |

## What Works

- Music: play, queue, skip, volume, lyrics, autoplay, shuffle, repeat, seek, history, songinfo
- Moderation: `/warn`, `/mute`, `/unmute`, `/kick`, `/ban`, `/unban`, `/case`, `/cases`, `/history`
- Auto-mod: `/automod` with 7 subcommands (spam, caps, links, invites, words, raid, status)
- Management: `/customcommand`, `/automessage`, `/embed`
- EmbedBuilderService: CRUD implemented, validated, integrated
- Frontend dashboard: all pages responsive, dark theme, Framer Motion animations
- Discord OAuth, Twitch notifications, Last.fm scrobbling, feature toggles

## What Is Broken / Missing

### 1. AutoModService signature mismatch (PRIORITY)

- Test file expects: `checkSpam(userId, guildId, timestamp): {type,reason}|null`
- Implementation has: `checkSpam(guildId, userId, timestamps[]): boolean`
- Tests failing due to Jest ESM mock pattern
- Fix: align service signatures to match tests (tests define the contract)

### 2. No messageCreate event handler

- AutoModService is fully implemented but never invoked
- No `messageCreate` event in `packages/bot/src/events/` or `packages/bot/src/handlers/eventHandler.ts`
- CustomCommandService auto-responders also need messageCreate for triggers

### 3. Jest ESM test failures (25 tests)

- Tests using `jest.unstable_mockModule` with `@lukbot/shared/services` fail
- Pattern issue: TypeScript sees class as undefined at compile time
- Works: GuildService, DiscordOAuthService, SessionService (relative imports + jest.mock)
- Failing: ModerationService, ServerLogService, AutoModService, CustomCommandService, AutoMessageService

### 4. roleManagementService missing export

- `packages/bot/src/events/guildMemberUpdate.ts` imports `roleManagementService` from @lukbot/shared/services
- Export doesn't exist - needs to be added

## Overall Completion

~70% — EmbedBuilderService now implemented. Key gaps: AutoModService signature, messageCreate event wiring, Jest test fixes.
