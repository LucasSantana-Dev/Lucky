---
name: management-features
description: Work with Nexus management features: embed builder, custom commands, and auto-messages. Use when implementing or editing /embed, /customcommand, /automessage commands or their shared services.
---

# Nexus Management Features

## When to use

- Implementing or editing the **embed builder** (`/embed` command + `EmbedBuilderService`)
- Implementing or editing **custom commands** (`/customcommand` + `CustomCommandService`)
- Implementing or editing **auto-messages** (`/automessage` + `AutoMessageService`)
- Enabling backend routes for these features (`managementEmbeds.ts`, etc.)

## Feature status (as of 2026-03-06)

| Feature         | Bot command | Service                   | Backend routes          | Status                |
| --------------- | ----------- | ------------------------- | ----------------------- | --------------------- |
| Embed builder   | ✅ exists   | ✅ `EmbedBuilderService`  | ⚠️ routes commented out | Needs route enable    |
| Custom commands | ✅ exists   | ✅ `CustomCommandService` | ✅                      | Needs `messageCreate` |
| Auto-messages   | ✅ exists   | ✅ `AutoMessageService`   | ✅                      | Needs member events   |

## Embed Builder

### Bot command

`packages/bot/src/functions/management/commands/embed.ts` — subcommands: `create`, `edit`, `send`, `list`, `delete`, `preview`

When sending an embed, construct `EmbedBuilder` from individual fields (not `template.embedData as any`):

```typescript
import { EmbedBuilder } from 'discord.js'
const embed = new EmbedBuilder()
if (template.title) embed.setTitle(template.title)
if (template.description) embed.setDescription(template.description)
if (template.color)
    embed.setColor(embedBuilderService.hexToDecimal(template.color))
if (template.footer) embed.setFooter({ text: template.footer })
if (template.thumbnail) embed.setThumbnail(template.thumbnail)
if (template.image) embed.setImage(template.image)
if (template.fields) embed.addFields(template.fields as EmbedField[])
```

### Service

`packages/shared/src/services/EmbedBuilderService.ts` — methods: `createTemplate`, `getTemplate`, `listTemplates`, `updateTemplate`, `deleteTemplate`, `incrementUsage`, `validateEmbedData`, `hexToDecimal`, `decimalToHex`

Helper: `packages/shared/src/services/embedValidation.ts` — `validateEmbedData()`, `hexToDecimal()`, `decimalToHex()`, `EmbedData` type, `EmbedField` type

### Backend routes

`packages/backend/src/routes/managementEmbeds.ts` — uncomment routes once service is confirmed working.

### Prisma schema

`EmbedTemplate` model — ensure `useCount Int @default(0)` is present. Run `npm run db:migrate` if adding the field.

## Custom Commands

### Bot command

`packages/bot/src/functions/management/commands/customcommand.ts` — subcommands: `create`, `edit`, `delete`, `list`

Custom command responses are triggered via `messageCreate` (not slash commands). The trigger check belongs in `packages/bot/src/handlers/messageHandler.ts`. Use the **event-handlers** skill when wiring this.

### Service

`packages/shared/src/services/CustomCommandService.ts` — methods include `getTriggers(guildId)` and `getResponse(guildId, trigger)` (verify actual API before calling).

## Auto-Messages

### Bot command

`packages/bot/src/functions/management/commands/automessage.ts` + `automessageHandlers.ts` — subcommands: configure join/leave messages, set channels.

Auto-messages fire on `guildMemberAdd` / `guildMemberRemove` Discord events — not slash commands. Use the **event-handlers** skill when wiring these event handlers.

### Service

`packages/shared/src/services/AutoMessageService.ts` — retrieves configured messages for a guild and event type.

## Conventions

- All service imports come from `@nexus/shared/services` — no direct Prisma in bot or backend.
- Validate embed data with `embedBuilderService.validateEmbedData()` before saving.
- Template names are stored lowercase (`name.toLowerCase()`).
- Command replies: defer for any DB operation; edit reply with result embed or error message.
- Backend routes: authenticate via session middleware; scope by `guildId` from path params.
