import {
    Events,
    EmbedBuilder,
    ChannelType,
    PermissionFlagsBits,
    type Client,
    type Guild,
    type GuildBasedChannel,
    type Interaction,
    type ChatInputCommandInteraction,
    type RepliableInteraction,
} from 'discord.js'
import type { CustomClient } from '../types'
import {
    errorLog,
    infoLog,
    debugLog,
    captureException,
} from '@lucky/shared/utils'
import { interactionReply } from '../utils/general/interactionReply'
import { createUserFriendlyError } from '@lucky/shared/utils/general/errorSanitizer'
import { handleMessageCreate } from './messageHandler'
import { handleMemberEvents } from './memberHandler'
import { handleAuditEvents } from './auditHandler'
import { handleExternalScrobbler } from './externalScrobbler'
import { handleReactionEvents } from './reactionHandler'
import { handleMusicButtonInteraction } from './musicButtonHandler'
import { executeContextMenu } from './commandsHandler'
import {
    handleMoveMessageSelect,
    MOVE_MESSAGE_SELECT_PREFIX,
} from './moveMessageHandler'
import { reactionRolesService } from '@lucky/shared/services'
import { syncAllGuildFollowerRoles } from '../twitch/followerRoleSync'
import { aiDevToolkitService } from '../services/AiDevToolkitService'
import { namedSessionService } from '../utils/music/namedSessions'
import { cleanupGuildState } from './player/trackNowPlaying'
import {
    recordGuildJoin,
    recordGuildLeave,
    syncGuildsOnReady,
} from '../services/guildMembershipService'
import {
    guildJoinsTotal,
    guildLeavesTotal,
} from '../utils/monitoring/prometheus'
import { handleForumThreadCreate } from './forumThreadHandler'

function handleClientReady(client: Client): void {
    client.once('clientReady', () => {
        infoLog({ message: `Logged in as ${client.user?.tag}!` })
        debugLog({
            message: `Bot is ready with ${(client as CustomClient).commands.size} commands loaded`,
        })
        syncGuildsOnReady(client).catch((error) => {
            errorLog({
                message: 'guildMembershipService: on-ready sync failed',
                error,
            })
        })
        if (process.env.AI_DEV_TOOLKIT_BOARD_ENABLED === 'true') {
            aiDevToolkitService.start(client).catch((error) => {
                errorLog({
                    message: 'AiDevToolkitService: failed to start',
                    error,
                })
            })
        }
        setInterval(
            () => {
                syncAllGuildFollowerRoles(client).catch((error) => {
                    errorLog({
                        message: 'Periodic followerRoleSync failed',
                        error,
                    })
                })
            },
            60 * 60 * 1000,
        )
    })
}

// Pure-utility onboarding embed (no invite/vote CTA — see ADR
// 2026-06-18-in-bot-growth). Helps a new server start using the bot; keeping it
// utility-first avoids the Platform-Manipulation flags that jeopardize verification.
const ONBOARDING_EMBED = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎵 Thanks for adding Lucky!')
    .setDescription(
        [
            "Here's how to get started:",
            '',
            '`/play <song or url>` — play music in your voice channel',
            '`/queue` — see the current and upcoming tracks',
            '`/help` — browse every command',
        ].join('\n'),
    )
    .setFooter({ text: 'Lucky' })

// First text channel the bot can actually post to (system channel preferred).
function findOnboardingChannel(guild: Guild): GuildBasedChannel | null {
    const me = guild.members?.me
    if (!me) return null
    const canPost = (ch: GuildBasedChannel | null): boolean =>
        ch?.type === ChannelType.GuildText &&
        (ch
            .permissionsFor(me)
            ?.has([
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
            ]) ??
            false)
    if (canPost(guild.systemChannel)) return guild.systemChannel
    return guild.channels.cache.find((ch) => canPost(ch)) ?? null
}

async function sendOnboardingMessage(guild: Guild): Promise<void> {
    const channel = findOnboardingChannel(guild)
    if (!channel || channel.type !== ChannelType.GuildText) {
        // No channel the bot can post to — skip silently, never throw.
        return
    }
    await channel.send({ embeds: [ONBOARDING_EMBED] })
}

function handleGuildCreate(client: Client): void {
    client.on(Events.GuildCreate, (guild) => {
        const totalGuilds = client.guilds.cache.size
        infoLog({
            message: 'Guild joined',
            data: {
                guildId: guild.id,
                guildName: guild.name,
                memberCount: guild.memberCount,
                totalGuilds,
            },
        })
        guildJoinsTotal.inc()
        recordGuildJoin(guild).catch((error) => {
            errorLog({
                message: 'Error recording guild join',
                error,
            })
        })
        sendOnboardingMessage(guild).catch((error) => {
            errorLog({
                message: 'Error sending onboarding message',
                error,
            })
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
    interaction: RepliableInteraction,
): Promise<void> {
    errorLog({ message: 'Error handling interaction:', error })
    if (error instanceof Error) {
        // Command interactions carry commandName; components/modals (e.g. the
        // move-message channel select) carry customId instead — don't blindly
        // read commandName or telemetry logs undefined for those.
        const label =
            (interaction as { commandName?: string }).commandName ??
            (interaction as { customId?: string }).customId
        captureException(error, {
            command: label,
            guildId: interaction.guildId ?? undefined,
            userId: interaction.user?.id,
        })
    }

    // Safely create user-friendly error; fall back if transformation fails
    let userFriendlyError: string
    try {
        userFriendlyError = createUserFriendlyError(error)
    } catch (sanitizationError) {
        errorLog({
            message: 'Failed to create user-friendly error',
            error: sanitizationError,
        })
        userFriendlyError =
            'An unexpected error occurred. Please try again later.'
    }

    await interactionReply({
        interaction,
        content: {
            content: userFriendlyError,
            ephemeral: true,
        },
    })
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

        if (interaction.isMessageContextMenuCommand()) {
            await executeContextMenu({
                interaction,
                client: client as CustomClient,
            })
            return
        }

        if (
            interaction.isChannelSelectMenu() &&
            interaction.customId.startsWith(MOVE_MESSAGE_SELECT_PREFIX)
        ) {
            await handleMoveMessageSelect(interaction, client as CustomClient)
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
                interaction as RepliableInteraction,
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
        const totalGuilds = client.guilds.cache.size
        infoLog({
            message: 'Guild left',
            data: {
                guildId: guild.id,
                guildName: guild.name,
                memberCount: guild.memberCount,
                totalGuilds,
            },
        })
        guildLeavesTotal.inc()
        await recordGuildLeave(guild.id, guild.name).catch((error) => {
            errorLog({
                message: 'Error recording guild leave',
                error,
            })
        })
        try {
            const duplicateDetection =
                (await import('../utils/music/duplicateDetection/index.js')) as {
                    clearHistory: (guildId: string) => void
                    clearAllGuildCaches: (guildId: string) => void
                }
            duplicateDetection.clearHistory(guild.id)
            duplicateDetection.clearAllGuildCaches(guild.id)
            cleanupGuildState(guild.id)
        } catch (err) {
            errorLog({
                message: 'Error clearing history on guild delete:',
                error: err,
            })
        }
    })
}

function handleChannelDelete(client: Client): void {
    client.on(Events.ChannelDelete, (channel) => {
        try {
            if (channel.isDMBased()) return
            cleanupGuildState(channel.guildId)
        } catch (err) {
            errorLog({
                message: 'Error clearing state on channel delete:',
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
    handleGuildCreate(client)
    handleGuildDelete(client)
    handleChannelDelete(client)
    handleForumThreadCreate(client)
}
