# LukBot — Next Priorities

Last updated: 2026-03-06

## Immediate (Unblock Bot to Fully Working)

### Priority 1: Fix AutoModService Signatures

**Why**: Tests failing. Service has wrong method signatures vs test contracts.

**Fixes needed**:

- `checkSpam(userId, guildId, timestamp)` → return `{type: string, reason: string} | null`
- `checkCaps(guildId, content)` → return `{type: string, reason: string} | null`
- `checkLinks(guildId, content)` → return `{type: string, reason: string} | null`
- `checkInvites(guildId, content)` → return `{type: string, reason: string} | null`
- `checkBadWords(guildId, content)` → return `{type: string, reason: string} | null`
- `shouldIgnore(guildId, channelId, roleIds)` → return `boolean`

### Priority 2: Add messageCreate Event Handler

**Why**: AutoModService and CustomCommandService auto-responders are never triggered. No `messageCreate` handler exists.

**Create**: `packages/bot/src/handlers/messageHandler.ts`
**Register in**: `packages/bot/src/handlers/eventHandler.ts` (add `Events.MessageCreate` listener)

Logic:

1. Check `autoModService.shouldIgnore(guildId, channelId, memberRoles)`
2. Run all automod checks in parallel
3. Apply action (warn/mute/kick/delete) based on result
4. Check `customCommandService` for matching triggers

### Priority 3: Add missing roleManagementService export

**Why**: `packages/bot/src/events/guildMemberUpdate.ts` imports non-existent export

**Fix**: Add `roleManagementService` export to `packages/shared/src/services/index.ts` or remove the import

### Priority 4: Fix Jest ESM test failures (25 tests)

**Why**: Tests using `jest.unstable_mockModule` with `@lukbot/shared/services` fail at TypeScript compile time

**Pattern to follow** (from GuildService.test.ts):

- Use relative imports: `import { guildService } from '../../../src/services/GuildService'`
- Use `jest.mock()` with relative paths instead of `jest.unstable_mockModule()`

Failing test suites:

- ModerationService.test.ts
- ServerLogService.test.ts
- AutoModService.test.ts
- CustomCommandService.test.ts
- AutoMessageService.test.ts

## Short Term (Phases 6-9)

These services and bot commands already exist. Need event handlers and any missing wiring:

- **Custom Commands** — `CustomCommandService` ✅, `/customcommand` ✅, needs `messageCreate` integration (Priority 2)
- **Auto-Messages** — `AutoMessageService` ✅, `/automessage` ✅, needs `guildMemberAdd`/`guildMemberRemove` event handlers
- **Server Logging** — `ServerLogService` ✅, needs event handler for guild events

## Quality Backlog

- Fix Prisma type resolution properly (remove all `as any` workarounds)
- Add TanStack Query to frontend (recommended in docs/FRONTEND.md, reduces Zustand boilerplate)
- Add React Suspense boundaries + error boundaries to frontend pages
- Increase backend test coverage
