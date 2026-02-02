---
name: discord-commands
description: Add or change LukBot slash commands. Use when adding a new Discord command, changing command options, or fixing command execution in packages/bot.
---

# LukBot Discord Commands

## When to use

- Adding a new slash command
- Changing command name, description, or options
- Fixing command execution or reply flow

## Command shape

Each command is a default export of a `Command` instance:

```ts
import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('commandname')
        .setDescription('Short description.'),
    category: 'general' | 'music' | 'download',
    execute: async ({ interaction, client }) => {
        /* ... */
    },
})
```

## Placement

- **General**: `packages/bot/src/functions/general/commands/` — e.g. `ping.ts`, `help.ts`
- **Music**: `packages/bot/src/functions/music/commands/` — e.g. `play.ts`, `queue.ts`, `skip.ts`
- **Download**: `packages/bot/src/functions/download/commands/` — e.g. `download.ts`

Category must match `CommandCategory` in `packages/bot/src/config/constants.ts`. Add new prefixes there if you add a new command name.

## Execution

- Use `interactionReply({ interaction, content: { content: '...' } })` or embeds from bot/utils or shared.
- On errors, use `createUserFriendlyError(error)` and reply ephemeral; log with `errorLog` from `@lukbot/shared/utils`.
- Validators: use `commandValidations` and validators under `packages/bot/src/utils/command/` (voice channel, queue, guild) before using player or queue.

## Subcommands / options

Use `SlashCommandSubcommandBuilder` or `.addStringOption()` etc. from `@discordjs/builders`. Keep option names lowercase and short.
