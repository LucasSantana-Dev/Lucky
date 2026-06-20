import {
    Collection,
    type ChatInputCommandInteraction,
    PermissionsBitField,
} from 'discord.js'
import { errorLog, debugLog, captureException } from '@lucky/shared/utils'
import { recordWithCooldown, emitAlert } from '@lucky/shared/utils/alerts'
import { featureToggleService } from '@lucky/shared/services'
import type { FeatureToggleName } from '@lucky/shared/types'
import type { CustomClient } from '../types'
import type Command from '../models/Command'
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

type GroupCommandsParams = {
    commands: Command[]
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

        const categoryFlag = CATEGORY_FLAG_MAP[command.category]
        if (categoryFlag) {
            const isEnabled = await featureToggleService.isEnabled(
                categoryFlag,
                {
                    guildId: interaction.guild?.id ?? undefined,
                    userId: interaction.user.id,
                },
            )
            if (!isEnabled) {
                await interactionReply({
                    interaction,
                    content: {
                        content: 'This feature is currently disabled.',
                        ephemeral: true,
                    },
                })
                return
            }
        }

        if (command.botPermissions?.length) {
            const appPermissions = interaction.appPermissions
            const missingPerms: bigint[] = []

            for (const perm of command.botPermissions) {
                if (!appPermissions?.has(perm)) {
                    missingPerms.push(perm)
                }
            }

            if (missingPerms.length > 0) {
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
                return
            }
        }

        debugLog({ message: `Executing command: ${interaction.commandName}` })
        await command.execute({ interaction, client })
    } catch (error) {
        errorLog({
            message: `Error executing command ${interaction.commandName}:`,
            error,
        })
        captureException(
            error instanceof Error ? error : new Error(String(error)),
            {
                context: 'command-execution-failure',
                command: interaction.commandName,
                guildId: interaction.guild?.id ?? undefined,
                userId: interaction.user.id,
            },
        )
        try {
            const userFriendlyError = createUserFriendlyError(error)
            await interactionReply({
                interaction,
                content: {
                    content: userFriendlyError,
                    ephemeral: true,
                },
            })
        } catch (error) {
            errorLog({ message: 'Error sending error message:', error })
        }
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
