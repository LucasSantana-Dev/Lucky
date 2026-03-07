---
name: moderation-automod
description: Work with Nexus moderation commands and AutoModService. Use when adding or editing /warn, /mute, /ban, /kick, /case commands, ModerationService, AutoModService, or moderation settings in packages/shared or packages/bot.
---

# Nexus Moderation & Auto-Mod

## When to use

- Adding or editing moderation slash commands (`/warn`, `/mute`, `/unmute`, `/ban`, `/unban`, `/kick`, `/case`, `/cases`, `/history`)
- Changing `ModerationService` or `AutoModService` in `packages/shared/src/services/`
- Adding or changing `/automod` subcommands (spam, caps, links, invites, words, raid, status)
- Fixing AutoModService method signatures or tests
- Backend moderation routes (`packages/backend/src/routes/moderation.ts`)

## File locations

### Bot commands

- **Moderation**: `packages/bot/src/functions/moderation/commands/` — `warn.ts`, `mute.ts`, `unmute.ts`, `ban.ts`, `unban.ts`, `kick.ts`, `case.ts`, `cases.ts`, `history.ts`, `caseHandlers.ts`, `index.ts`
- **Auto-mod**: `packages/bot/src/functions/automod/commands/` — `/automod` command with 7 subcommands

### Shared services

- `packages/shared/src/services/ModerationService.ts` + `moderationSettings.ts`
- `packages/shared/src/services/AutoModService.ts`

### Backend

- `packages/backend/src/routes/moderation.ts`

## ModerationService API

Key types:

```typescript
type CreateCaseInput = {
    guildId: string
    type: 'warn' | 'mute' | 'kick' | 'ban' | 'timeout' | 'unban' | 'unmute'
    userId: string
    username: string
    moderatorId: string
    moderatorName: string
    reason?: string
    duration?: number // seconds
}
```

Key methods: `createCase(input)`, `getCases(guildId, userId)`, `getCase(guildId, caseNumber)`, `getSettings(guildId)`, `updateSettings(guildId, settings)`

## AutoModService API (current implementation — NOT matching test contract)

Current signatures return `boolean`. Test contract expects `{type: string, reason: string} | null`.

**Before touching AutoModService**, read `packages/backend/tests/unit/services/AutoModService.test.ts` — tests define the contract. Fix signatures to align:

- `checkSpam(userId, guildId, timestamp: number)` → `{type, reason} | null`
- `checkCaps(guildId, content)` → `{type, reason} | null`
- `checkLinks(guildId, content)` → `{type, reason} | null`
- `checkInvites(guildId, content)` → `{type, reason} | null`
- `checkBadWords(guildId, content)` → `{type, reason} | null`
- `shouldIgnore(guildId, channelId, roleIds)` → `boolean`

The existing `isExempt(settings, channelId?, roleIds?)` can become the internal helper for `shouldIgnore`.

## Prisma model

`ModerationCase` and `AutoModSettings` are in `prisma/schema.prisma`. Due to the Prisma `as any` workaround, inline type definitions are required at the top of each service file (see known-gotchas).

## Conventions

- Moderation actions always go through `moderationService.createCase()` — do not write directly to `prisma.moderationCase`.
- Commands: defer the reply, perform the action, edit the reply with an embed. Never leave an interaction hanging.
- DM the target user if `settings.dmOnAction` is true; catch DM failures silently (user may have DMs off).
- Log to mod log channel via `ServerLogService` if `settings.modLogChannelId` is set.
- Reason is required if `settings.requireReason` is true — validate before executing.

## ESLint 250-line limit

`ModerationService.ts` uses `moderationSettings.ts` as a helper. If `AutoModService.ts` grows beyond 250 lines, extract an `autoModHelpers.ts`.
