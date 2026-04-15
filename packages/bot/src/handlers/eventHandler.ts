import {
    Events,
    type Client,
    type Interaction,
    type ChatInputCommandInteraction,
} from 'discord.js'
import type { CustomClient } from '../types'
import {
    errorLog,
    infoLog,
    debugLog,
    captureException,
} from '@lucky/shared/utils'
import { interactionReply } from '../utils/general/interactionReply'
import { createUserFriendlyError } from '/shared/utils/general/errorSanitizer'
import { handleMessageCreate } from './messageHandler'
import { handleMemberEvents } from './memberHandler'
import { handleAuditEvents } from './auditHandler'
import { handleExternalScrobbler } from './externalScrobbler'
import { handleReactionEvents } from './reactionHandler'
import { handleMusicButtonInteraction } from './musicButtonHandler'
import { reactionRolesService } from '@lucky/shared/services'
import { aiDevToolkitService } from '../services/AiDevToolkitService'
import { namedSessionService } from '../utils/music/namedSessions'

function handleClientReady(client: Client): void {
    client.once('clientReady', () => {
        infoLog({ message: `Logged in as ${client.user?.tag}!` })
        debugLog({
            message: `Bot is ready with ${(client as CustomClient).commands.size} commands loaded`,
        })
        if (process.env.AI_DEV_TOOLKIT_BOARD_ENABLED === 'true') {
            aiDevToolkitService.start(client).catch((error) => {
                errorLog({
                    message: 'AiDevToolkitService: failed to start',
                    error,
                })
            })
        }
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
    if (error instanceof Error) {
        captureException(error, {
            command: interaction.commandName,
            guildId: interaction.guildId ?? undefined,
            userId: interaction.user?.id,
        })
    }
    try {
        const userFriendlyError = createUserFriendlyError(error)
        await interactionReply({
            interaction,
            content: {
                content: userFriendlyError,
                ephemeral: true,
            },
        })
    } catch (followUpError) {
        errorLog({
            message: 'Error sending error message:',
            error: followUpError,
        })
    }
}

async function handleAutocomplete(interaction: Interaction): Promise<void> {
    try {
        if (!interaction.isAutocomplete()) return
        if (!interaction.guildId) {
            await interaction.respond([])
            return
        }

        const command = interaction.commandName
        const subcommand = interaction.options.getSubcommand(false)
        const focusedOption = interaction.options.getFocused(true)

        if (
            command === 'session' &&
            (subcommand === 'restore' || subcommand === 'delete') &&
            focusedOption.name === 'name'
        ) {
            const sessions = await namedSessionService.list(interaction.guildId)
            const choices = sessions
                .map((s) => ({ name: s.name, value: s.name }))
                .slice(0, 25)

            await interaction.respond(choices)
            return
        }

        await interaction.respond([])
    } catch (error) {
        errorLog({ message: 'Error handling autocomplete:', error })
    }
}

async function handleInteractionCreate(
    client: Client,
    interaction: Interaction,
): Promise<void> {
    try {
        if (interaction.isAutocomplete()) {
            await handleAutocomplete(interaction)
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
            return
        }

        if (!interaction.isChatInputCommand()) return
        await handleCommandExecution(
            client,
            interaction as ChatInputCommandInteraction,
        )
    } catch (error) {
        if (!interaction.isAutocomplete()) {
            await handleInteractionError(
                error,
                interaction as ChatInputCommandInteraction,
            )
        }
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
            const duplicateDetection =
                (await import('../utils/music/duplicateDetection/index.js')) as {
                    clearHistory: (guildId: string) => void
                    clearAllGuildCaches: (guildId: string) => void
                }
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
    handleMessageCreate(client)
    handleMemberEvents(client)
    handleAuditEvents(client)
    handleExternalScrobbler(client)
    handleReactionEvents(client)
    handleError(client)
    handleWarn(client)
    handleDebug(client)
    handleGuildDelete(client)
}
