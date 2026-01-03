import {
    Events,
    type Client,
    type Interaction,
    type ChatInputCommandInteraction,
} from 'discord.js'
import type { CustomClient } from '../types'
import { errorLog, infoLog, debugLog } from '../utils/general/log'
import { interactionReply } from '../utils/general/interactionReply'
import { createUserFriendlyError } from '../utils/general/errorSanitizer'

function handleClientReady(client: Client): void {
    client.once('clientReady', () => {
        infoLog({ message: `Logged in as ${client.user?.tag}!` })
        debugLog({
            message: `Bot is ready with ${(client as CustomClient).commands.size} commands loaded`,
        })
    })
}

async function handleCommandNotFound(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    infoLog({
        message: `Command ${interaction.commandName} not found`,
    })
    if (!interaction.replied && !interaction.deferred) {
        await interactionReply({
            interaction,
            content: {
                content: 'This command is not available.',
                ephemeral: true,
            },
        })
    }
}

async function handleCommandExecution(
    client: Client,
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    const command = (client as CustomClient).commands.get(
        interaction.commandName,
    )
    if (!command) {
        await handleCommandNotFound(interaction)
        return
    }

    await command.execute({
        client: client as CustomClient,
        interaction,
    })
}

async function handleInteractionError(
    error: unknown,
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    errorLog({ message: 'Error handling interaction:', error })
    try {
        if (!interaction.replied && !interaction.deferred) {
            const userFriendlyError = createUserFriendlyError(error)
            await interactionReply({
                interaction,
                content: {
                    content: userFriendlyError,
                    ephemeral: true,
                },
            })
        } else {
            const userFriendlyError = createUserFriendlyError(error)
            await interactionReply({
                interaction,
                content: {
                    content: userFriendlyError,
                    ephemeral: true,
                },
            })
        }
    } catch (followUpError) {
        errorLog({
            message: 'Error sending error message:',
            error: followUpError,
        })
    }
}

async function handleInteractionCreate(
    client: Client,
    interaction: Interaction,
): Promise<void> {
    try {
        if (!interaction.isChatInputCommand()) return
        await handleCommandExecution(
            client,
            interaction as ChatInputCommandInteraction,
        )
    } catch (error) {
        await handleInteractionError(
            error,
            interaction as ChatInputCommandInteraction,
        )
    }
}

function handleError(client: Client): void {
    client.on(Events.Error, (error) => {
        errorLog({ message: 'Discord client error:', error })
    })
}

function handleWarn(client: Client): void {
    client.on(Events.Warn, (warning) => {
        infoLog({ message: 'Discord client warning:', data: warning })
    })
}

function handleDebug(client: Client): void {
    client.on(Events.Debug, (debug) => {
        debugLog({ message: 'Discord client debug:', data: debug })
    })
}

function handleGuildDelete(client: Client): void {
    client.on(Events.GuildDelete, async (guild) => {
        try {
            const duplicateDetection = await import(
                '../utils/music/duplicateDetection'
            ) as { clearHistory: (guildId: string) => void; clearAllGuildCaches: (guildId: string) => void }
            duplicateDetection.clearHistory(guild.id)
            duplicateDetection.clearAllGuildCaches(guild.id)
        } catch (err) {
            errorLog({
                message: 'Error clearing history on guild delete:',
                error: err,
            })
        }
    })
}

export default function handleEvents(client: Client) {
    handleClientReady(client)
    client.on(Events.InteractionCreate, (interaction: Interaction) => {
        handleInteractionCreate(client, interaction).catch((error) => {
            errorLog({ message: 'Error handling interaction:', error })
        })
    })
    handleError(client)
    handleWarn(client)
    handleDebug(client)
    handleGuildDelete(client)
}
