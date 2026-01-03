import {
    Events,
    type ChatInputCommandInteraction,
    type CommandInteractionOptionResolver,
    type Interaction,
} from 'discord.js'
import { errorLog, debugLog } from '../utils/general/log'
import { executeCommand } from './commandsHandler'
import type { CustomClient } from '../types'
import { errorEmbed } from '../utils/general/embeds'
import { interactionReply } from '../utils/general/interactionReply'
import { monitorInteractionHandling } from '../utils/monitoring'
import { createUserFriendlyError } from '../utils/general/errorSanitizer'

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
        }
    } catch (error) {
        errorLog({ message: 'Error handling interaction:', error })

        try {
            if (
                interaction.isChatInputCommand() &&
                !interaction.replied &&
                !interaction.deferred
            ) {
                const userFriendlyError = createUserFriendlyError(error)
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [errorEmbed('Error', userFriendlyError)],
                        ephemeral: true,
                    },
                })
            }
        } catch (error) {
            errorLog({ message: 'Error sending error message:', error })
        }
    }
}
