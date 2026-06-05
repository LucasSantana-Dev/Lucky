import {
    Events,
    type ChatInputCommandInteraction,
    type CommandInteractionOptionResolver,
    type Interaction,
} from 'discord.js'
import { errorLog, debugLog, captureException } from '@lucky/shared/utils'
import {
    mintCorrelationId,
    tagCorrelationIdToSentry,
} from '@lucky/shared/utils/support'
import { executeCommand } from './commandsHandler'
import type { CustomClient } from '../types'
import { interactionReply } from '../utils/general/interactionReply'
import { monitorInteractionHandling } from '../utils/monitoring'
import { buildCommandErrorEmbed } from '../utils/general/errorReportEmbed'
import { reactionRolesService } from '@lucky/shared/services'
import { handleMusicButtonInteraction } from './musicButtonHandler'

type HandleInteractionsParams = {
    client: CustomClient
}

type InteractionGetOptionParams = {
    interaction: ChatInputCommandInteraction
    optionName: string
}

type InteractionGetSubcommandParams = {
    interaction: ChatInputCommandInteraction
}

export const handleInteractions = async ({
    client,
}: HandleInteractionsParams): Promise<void> => {
    try {
        client.on(Events.InteractionCreate, (interaction: Interaction) => {
            handleInteraction(interaction, client).catch((error) => {
                errorLog({ message: 'Error handling interaction:', error })
            })
        })

        debugLog({ message: 'Interaction handler set up successfully' })
    } catch (error) {
        errorLog({ message: 'Error setting up interaction handler:', error })
    }
}

export const interactionGetAllOptions = async ({
    interaction,
}: {
    interaction: ChatInputCommandInteraction
}): Promise<
    Omit<CommandInteractionOptionResolver, 'getMessage' | 'getFocused'>
> => {
    try {
        return interaction.options
    } catch (error) {
        errorLog({ message: 'Error getting interaction options:', error })
        throw error
    }
}

export const interactionGetOption = async ({
    interaction,
    optionName,
}: InteractionGetOptionParams) => {
    try {
        return interaction.options.get(optionName)
    } catch (error) {
        errorLog({ message: 'Error getting interaction option:', error })
        throw error
    }
}

export const interactionGetSubcommand = async ({
    interaction,
}: InteractionGetSubcommandParams): Promise<string> => {
    try {
        return interaction.options.getSubcommand()
    } catch (error) {
        errorLog({ message: 'Error getting interaction subcommand:', error })
        throw error
    }
}

export async function handleInteraction(
    interaction: Interaction,
    client: CustomClient,
): Promise<void> {
    monitorInteractionHandling(
        interaction.type.toString(),
        interaction.user.id,
        interaction.guild?.id,
    )

    try {
        if (interaction.isChatInputCommand()) {
            await executeCommand({ interaction, client })
            return
        }

        if (interaction.isButton()) {
            const id = interaction.customId
            if (
                id.startsWith('music_') ||
                id.startsWith('queue_page') ||
                id.startsWith('leaderboard_page')
            ) {
                await handleMusicButtonInteraction(interaction)
                return
            }
            await reactionRolesService.handleButtonInteraction(interaction)
        }
    } catch (error) {
        const commandName = interaction.isChatInputCommand()
            ? interaction.commandName
            : interaction.isButton()
              ? interaction.customId
              : 'unknown'
        // Mint one correlation id for this failure and tag it to Sentry up
        // front, so it is recorded for every error path — including deferred
        // or already-replied commands where no user-facing embed is shown.
        const correlationId = mintCorrelationId()
        tagCorrelationIdToSentry(correlationId)

        errorLog({
            message: 'Error handling interaction:',
            error,
            data: {
                commandName,
                userId: interaction.user.id,
                guildId: interaction.guild?.id,
                correlationId,
            },
        })

        captureException(
            error instanceof Error ? error : new Error(String(error)),
            {
                context: 'interaction-handling-failure',
                commandName,
                userId: interaction.user.id,
                guildId: interaction.guild?.id ?? undefined,
                correlationId,
            },
        )

        try {
            if (
                interaction.isChatInputCommand() &&
                !interaction.replied &&
                !interaction.deferred
            ) {
                const errorEmbed = buildCommandErrorEmbed(
                    error,
                    correlationId,
                    {
                        guildId: interaction.guild?.id,
                        command: commandName,
                    },
                )
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [errorEmbed],
                        ephemeral: true,
                    },
                })
            }
        } catch (replyError) {
            errorLog({
                message: 'Error sending error message:',
                error: replyError,
            })
        }
    }
}
