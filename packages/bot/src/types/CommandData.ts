import type {
    SlashCommandBuilder,
    SlashCommandSubcommandsOnlyBuilder,
    SlashCommandOptionsOnlyBuilder,
    ContextMenuCommandBuilder,
} from '@discordjs/builders'
import type {
    ChatInputCommandInteraction,
    Client,
    Collection,
    MessageContextMenuCommandInteraction,
} from 'discord.js'
import type { Player } from 'discord-player'
import type { CommandCategory } from '../config/constants'

// Command/CommandData/CustomClient are mutually recursive by design:
// Command's execute signature is parameterized by CustomClient, and
// CustomClient's `commands`/`contextMenus` fields are keyed collections
// of Command/ContextMenuCommand. Splitting that knot across files
// always leaves one file importing back into another (madge flagged
// `types/CustomClient.ts > models/Command.ts > types/CommandData.ts`
// as a circular dependency). Living in one file removes the file-level
// cycle without changing any type's shape. `models/Command.ts`,
// `models/ContextMenuCommand.ts`, and `types/CustomClient.ts` re-export
// from here so existing import paths keep working.
// See decisions/2026-05-16-next-refactor-target-bot-circular-deps.md.

export type TCommandData =
    | SlashCommandBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder

export type TContextMenuData = ContextMenuCommandBuilder

export type CustomClient = Client & {
    commands: Collection<string, Command>
    contextMenus: Collection<string, ContextMenuCommand>
    player: Player
    cooldowns: Collection<string, number>
    redis?: unknown
    metrics?: unknown
    tracer?: unknown
    token?: string
    clientId?: string
}

export type CommandType = {
    data: unknown
    execute: (_interaction: ChatInputCommandInteraction) => Promise<void>
}

export type CommandExecuteParams = {
    readonly client: CustomClient
    readonly interaction: ChatInputCommandInteraction
}

export type TCommandExecute = (_options: CommandExecuteParams) => Promise<void>

export type ContextMenuExecuteParams = {
    readonly client: CustomClient
    readonly interaction: MessageContextMenuCommandInteraction
}

export type TContextMenuExecute = (
    _options: ContextMenuExecuteParams,
) => Promise<void>

type CommandOptions = {
    data: TCommandData
    execute: TCommandExecute
    category: CommandCategory
    botPermissions?: bigint[]
}

export class Command {
    data: TCommandData
    execute: TCommandExecute
    category: CommandCategory
    botPermissions?: bigint[]

    constructor(options: CommandOptions) {
        this.data = options.data
        this.execute = options.execute
        this.category = options.category
        this.botPermissions = options.botPermissions
    }
}

type ContextMenuCommandOptions = {
    data: TContextMenuData
    execute: TContextMenuExecute
    category: CommandCategory
    botPermissions?: bigint[]
}

export class ContextMenuCommand {
    data: TContextMenuData
    execute: TContextMenuExecute
    category: CommandCategory
    botPermissions?: bigint[]

    constructor(options: ContextMenuCommandOptions) {
        this.data = options.data
        this.execute = options.execute
        this.category = options.category
        this.botPermissions = options.botPermissions
    }
}
