---
name: event-handlers
description: Add or modify Discord bot event handlers in LukBot. Use when wiring messageCreate, guildMemberAdd/Remove, guildMemberUpdate, or any new Discord.js event into packages/bot.
---

# LukBot Event Handlers

## When to use

- Adding a `messageCreate` handler (needed for AutoMod + CustomCommands)
- Adding `guildMemberAdd` / `guildMemberRemove` handlers (needed for AutoMessages)
- Adding guild-level event handlers for ServerLog (`channelCreate`, `roleCreate`, etc.)
- Registering any new Discord.js event in `eventHandler.ts`

## Registration point

All events are registered in:

```
packages/bot/src/handlers/eventHandler.ts
```

The exported default function `handleEvents(client)` is called once at startup. Add new event registrations there.

Existing events wired in `handleEvents`:

- `clientReady` — startup log
- `Events.InteractionCreate` — slash command dispatch
- `Events.Error`, `Events.Warn`, `Events.Debug` — client lifecycle
- `Events.GuildDelete` — music cache cleanup
- `Events.GuildMemberUpdate` — via `packages/bot/src/events/guildMemberUpdate.ts`

## Pattern: inline registration (simple)

For short handlers, register directly in `eventHandler.ts`:

```typescript
client.on(Events.GuildMemberAdd, async (member) => {
    try {
        await someService.handle(member)
    } catch (error) {
        errorLog({ message: 'Error on guildMemberAdd:', error })
    }
})
```

## Pattern: extracted handler module (preferred for non-trivial logic)

For logic with >~20 lines or multiple service calls, create a dedicated file:

```
packages/bot/src/handlers/messageHandler.ts
packages/bot/src/handlers/memberHandler.ts
```

Import and call from `eventHandler.ts`:

```typescript
import { handleMessageCreate } from './messageHandler.js'
// ...
client.on(Events.MessageCreate, (message) => {
    handleMessageCreate(message).catch((error) =>
        errorLog({ message: 'Error in messageCreate:', error }),
    )
})
```

## messageCreate — required logic (Priority 3)

When implementing `messageCreate`, the handler must:

1. Ignore bot messages: `if (message.author.bot) return`
2. Ignore DMs: `if (!message.guild) return`
3. Call `autoModService.shouldIgnore(guildId, channelId, memberRoleIds)`
4. If not ignored, run automod checks in parallel (`checkSpam`, `checkCaps`, `checkLinks`, `checkInvites`, `checkBadWords`)
5. Apply action (warn/mute/kick/delete message) for first non-null result
6. Check `customCommandService` for matching trigger regardless of automod result

Handler file to create: `packages/bot/src/handlers/messageHandler.ts`

## guildMemberAdd / guildMemberRemove (Phase 8)

- `guildMemberAdd` → `autoMessageService.getMessagesForEvent(guildId, 'join')` → send to configured channel
- `guildMemberRemove` → `autoMessageService.getMessagesForEvent(guildId, 'leave')` → send to configured channel

Services are in `@lukbot/shared/services`. No direct Prisma access from bot.

## Error handling

Always wrap event callbacks in try/catch and call `errorLog` from `@lukbot/shared/utils`. Never let an unhandled event crash the bot process.

## Imports

```typescript
import { Events } from 'discord.js'
import { errorLog } from '@lukbot/shared/utils'
import { someService } from '@lukbot/shared/services'
```
