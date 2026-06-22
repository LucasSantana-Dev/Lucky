import {
    Collection,
    type ChatInputCommandInteraction,
    type MessageContextMenuCommandInteraction,
    PermissionsBitField,
} from 'discord.js'
import { errorLog, debugLog, captureException } from '@lucky/shared/utils'
import { recordWithCooldown, emitAlert } from '@lucky/shared/utils/alerts'
import { featureToggleService } from '@lucky/shared/services'
import type { FeatureToggleName } from '@lucky/shared/types'
import type { CustomClient } from '../types'
import type Command from '../models/Command'
import type ContextMenuCommand from '../models/ContextMenuCommand'
import type { CommandCategory } from '../config/constants'
import { interactionReply } from '../utils/general/interactionReply'
import { monitorCommandExecution } from '../utils/monitoring'
import { createUserFriendlyError } from '@lucky/shared/utils/general/errorSanitizer'

const CATEGORY_FLAG_MAP: Partial<Record<CommandCategory, FeatureToggleName>> = {
    moderation: 'MODERATION',
    automod: 'AUTOMOD',
    management: 'AUTO_MESSAGES',
}

type ExecuteCommandParams = {
    interaction: ChatInputCommandInteraction
    client: CustomClient
}

type SetCommandsParams = {
    client: CustomClient
    commands: Command[]
}

type SetContextMenusParams = {
    client: CustomClient
    contextMenus: ContextMenuCommand[]
}

type ExecuteContextMenuParams = {
    interaction: MessageContextMenuCommandInteraction
    client: CustomClient
}

type GroupCommandsParams = {
    commands: Command[]
}

/**
 * Verify the bot has every permission the command declares. Replies with an
 * ephemeral, human-readable error and returns false when any is missing.
 * Shared by slash commands and context-menu commands so both enforce the
 * permission contract identically.
 */
const enforceBotPermissions = async (
    interaction:
        | ChatInputCommandInteraction
        | MessageContextMenuCommandInteraction,
    botPermissions: bigint[] | undefined,
): Promise<boolean> => {
    if (!botPermissions?.length) return true

    const appPermissions = interaction.appPermissions
    const missingPerms = botPermissions.filter(
        (perm) => !appPermissions?.has(perm),
    )
    if (missingPerms.length === 0) return true

    const permissionNames = new PermissionsBitField(
        missingPerms.reduce((acc, perm) => acc | perm, 0n),
    ).toArray()
    const readablePerm = permissionNames.join(', ')
    const isPlural = permissionNames.length > 1
    const permNoun = isPlural ? 'permissions' : 'permission'
    const grantPronoun = isPlural ? 'them' : 'it'

    debugLog({
        message: `Command ${interaction.commandName} missing permissions: ${readablePerm}`,
    })

    await interactionReply({
        interaction,
        content: {
            content: `I'm missing the **${readablePerm}** ${permNoun} — ask an admin to grant ${grantPronoun} or re-invite me.`,
            ephemeral: true,
        },
    })
    return false
}

/**
 * Resolve the feature toggle for a command category. Replies with an ephemeral
 * "disabled" notice and returns false when the category is gated off; returns
 * true when enabled or ungated. Shared by slash + context-menu execution.
 */
const isFeatureEnabledOrReply = async (
    category: CommandCategory,
    interaction:
        | ChatInputCommandInteraction
        | MessageContextMenuCommandInteraction,
): Promise<boolean> => {
    const categoryFlag = CATEGORY_FLAG_MAP[category]
    if (!categoryFlag) return true

    const isEnabled = await featureToggleService.isEnabled(categoryFlag, {
        guildId: interaction.guild?.id ?? undefined,
        userId: interaction.user.id,
    })
    if (!isEnabled) {
        await interactionReply({
            interaction,
            content: {
                content: 'This feature is currently disabled.',
                ephemeral: true,
            },
        })
    }
    return isEnabled
}

/**
 * Uniform failure handling for an interaction execution: log, capture to
 * Sentry with context, and surface a user-friendly ephemeral error. Shared by
 * slash + context-menu execution.
 */
const replyExecutionError = async (
    error: unknown,
    interaction:
        | ChatInputCommandInteraction
        | MessageContextMenuCommandInteraction,
    context: string,
): Promise<void> => {
    errorLog({
        message: `Error executing ${interaction.commandName}:`,
        error,
    })
    captureException(
        error instanceof Error ? error : new Error(String(error)),
        {
            context,
            command: interaction.commandName,
            guildId: interaction.guild?.id ?? undefined,
            userId: interaction.user.id,
        },
    )
    try {
        await interactionReply({
            interaction,
            content: {
                content: createUserFriendlyError(error),
                ephemeral: true,
            },
        })
    } catch (replyError) {
        errorLog({ message: 'Error sending error message:', error: replyError })
    }
}

export const executeCommand = async ({
    interaction,
    client,
}: ExecuteCommandParams): Promise<void> => {
    const guildId = interaction.guild?.id ?? 'dm'
    const userId = interaction.user.id

    monitorCommandExecution(
        interaction.commandName,
        userId,
        interaction.guild?.id,
    )

    const spamKey = `cmd-spam:${guildId}:${userId}`
    if (recordWithCooldown(spamKey, 10_000, 10, 5 * 60_000)) {
        void emitAlert({
            title: '⚠️ Command spam detected',
            description: `User \`${userId}\` triggered 10+ commands in 10 seconds`,
            color: 'warning',
            fields: [
                { name: 'Guild', value: guildId },
                { name: 'User', value: userId },
                { name: 'Last command', value: interaction.commandName },
            ],
        })
    }

    try {
        const command = client.commands.get(interaction.commandName)
        if (!command) {
            debugLog({
                message: `Command not found: ${interaction.commandName}`,
            })
            return
        }

        if (!(await isFeatureEnabledOrReply(command.category, interaction))) {
            return
        }

        if (
            !(await enforceBotPermissions(interaction, command.botPermissions))
        ) {
            return
        }

        debugLog({ message: `Executing command: ${interaction.commandName}` })
        await command.execute({ interaction, client })
    } catch (error) {
        await replyExecutionError(
            error,
            interaction,
            'command-execution-failure',
        )
    }
}

export const executeContextMenu = async ({
    interaction,
    client,
}: ExecuteContextMenuParams): Promise<void> => {
    monitorCommandExecution(
        interaction.commandName,
        interaction.user.id,
        interaction.guild?.id,
    )

    try {
        const contextMenu = client.contextMenus.get(interaction.commandName)
        if (!contextMenu) {
            debugLog({
                message: `Context menu not found: ${interaction.commandName}`,
            })
            return
        }

        if (
            !(await isFeatureEnabledOrReply(contextMenu.category, interaction))
        ) {
            return
        }

        if (
            !(await enforceBotPermissions(
                interaction,
                contextMenu.botPermissions,
            ))
        ) {
            return
        }

        debugLog({
            message: `Executing context menu: ${interaction.commandName}`,
        })
        await contextMenu.execute({ interaction, client })
    } catch (error) {
        await replyExecutionError(
            error,
            interaction,
            'context-menu-execution-failure',
        )
    }
}

export async function setCommands({
    client,
    commands,
}: SetCommandsParams): Promise<void> {
    try {
        debugLog({ message: 'Setting commands in client collection...' })

        client.commands = new Collection()

        for (const command of commands) {
            if (command.data.name) {
                client.commands.set(command.data.name, command)
            }
        }

        debugLog({ message: `Loaded ${client.commands.size} commands` })
    } catch (error) {
        errorLog({ message: 'Error setting commands:', error })
        throw error
    }
}

export async function setContextMenus({
    client,
    contextMenus,
}: SetContextMenusParams): Promise<void> {
    try {
        debugLog({ message: 'Setting context menus in client collection...' })

        client.contextMenus = new Collection()

        for (const contextMenu of contextMenus) {
            if (contextMenu.data.name) {
                client.contextMenus.set(contextMenu.data.name, contextMenu)
            }
        }

        debugLog({
            message: `Loaded ${client.contextMenus.size} context menus`,
        })
    } catch (error) {
        errorLog({ message: 'Error setting context menus:', error })
        throw error
    }
}

export const groupCommands = ({ commands }: GroupCommandsParams): Command[] => {
    try {
        const validCommands = commands.filter((cmd) => {
            if (!cmd?.data?.name || !cmd?.execute) {
                errorLog({
                    message: `Invalid command found during grouping: ${cmd?.data?.name || 'unknown'}`,
                })
                return false
            }
            return true
        })

        return validCommands
    } catch (error) {
        errorLog({ message: 'Error grouping commands:', error })
        return []
    }
}
