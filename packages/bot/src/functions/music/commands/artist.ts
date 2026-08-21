import { SlashCommandBuilder } from '@discordjs/builders'
import { QueryType } from 'discord-player'
import type { GuildMember } from 'discord.js'
import Command from '../../../models/Command'
import type { CommandExecuteParams } from '../../../types/CommandData'
import {
    requireVoiceChannel,
    requireDJRole,
} from '../../../utils/command/commandValidations'
import { resolveGuildQueue } from '../../../services/musicManagement/queueResolver'
import { moveUserTrackToPriority } from '../../../services/musicManagement/queueManipulation'
import {
    createErrorEmbed,
    createSuccessEmbed,
    createWarningEmbed,
} from '../../../utils/general/embeds'
import { interactionReply } from '../../../utils/general/interactionReply'
import { errorLog, warnLog } from '@lucky/shared/utils'
import { createUserFriendlyError } from '@lucky/shared/utils/general/errorSanitizer'
import { assertDefined } from '@lucky/shared/utils/guards'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'
import { featureToggleService } from '@lucky/shared/services'
import { isUnknownInteractionError } from './play/queryUtils'
import { TEXT_SEARCH_BLOCKED_EXTRACTORS } from './play/handlers/resolveProvider'

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 20

// Spotify first (richest artist metadata), then the same text-search fallback
// arms #play uses. SpotifyAPI.search() swallows every error and returns null,
// so a dead credential or a rotated anon-token flow surfaced here as
// "No tracks found for artist X" for *every* artist, with no telemetry (#2049).
const SEARCH_ARMS = [
    { engine: QueryType.SPOTIFY_SEARCH, blocked: undefined },
    {
        engine: QueryType.YOUTUBE_SEARCH,
        blocked: TEXT_SEARCH_BLOCKED_EXTRACTORS,
    },
    {
        engine: QueryType.SOUNDCLOUD_SEARCH,
        blocked: TEXT_SEARCH_BLOCKED_EXTRACTORS,
    },
] as const

export default new Command({
    data: new SlashCommandBuilder()
        .setName('artist')
        .setDescription('Queue top tracks from a specific artist')
        .addStringOption((option) =>
            option
                .setName('name')
                .setDescription('Artist name')
                .setRequired(true),
        )
        .addIntegerOption((option) =>
            option
                .setName('limit')
                .setDescription(
                    `Tracks to queue (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`,
                )
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(MAX_LIMIT),
        ),
    category: 'music',
    execute: async ({
        client,
        interaction,
    }: CommandExecuteParams): Promise<void> => {
        if (!interaction.guildId) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'Error',
                            'This command can only be used in a server',
                        ),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        const isEnabled = await featureToggleService.isEnabled(
            'ARTIST_COMMAND',
            {
                guildId: interaction.guildId,
            },
        )
        if (!isEnabled) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createWarningEmbed(
                            'Feature unavailable',
                            'The /artist command is currently disabled.',
                        ),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        const member = interaction.member as GuildMember
        if (!(await requireVoiceChannel(interaction))) return
        if (!(await requireDJRole(interaction, interaction.guildId))) return

        const voiceChannel = assertDefined(
            member.voice.channel,
            'voice channel present after requireVoiceChannel guard',
        )
        const artistName = interaction.options.getString('name', true)
        const limit = interaction.options.getInteger('limit') ?? DEFAULT_LIMIT

        try {
            await interaction.deferReply()
        } catch (error) {
            if (isUnknownInteractionError(error)) return
            throw error
        }

        try {
            type ArtistSearchResult = Awaited<
                ReturnType<typeof client.player.search>
            >
            let searchResult: ArtistSearchResult | null = null
            let resolvedEngine: QueryType = QueryType.SPOTIFY_SEARCH

            for (const arm of SEARCH_ARMS) {
                let armResult: ArtistSearchResult | null = null
                try {
                    armResult = await client.player.search(artistName, {
                        requestedBy: interaction.user,
                        searchEngine: arm.engine,
                        ...(arm.blocked
                            ? { blockExtractors: [...arm.blocked] }
                            : {}),
                    })
                } catch (error) {
                    warnLog({
                        message: 'Artist search arm threw',
                        data: {
                            artistName,
                            engine: String(arm.engine),
                            error: String(error),
                        },
                    })
                    continue
                }

                if (armResult?.tracks.length) {
                    searchResult = armResult
                    resolvedEngine = arm.engine
                    break
                }

                warnLog({
                    message: 'Artist search arm returned no tracks',
                    data: { artistName, engine: String(arm.engine) },
                })
            }

            if (!searchResult?.tracks.length) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                'No results',
                                `No tracks found for artist **${artistName}**.`,
                            ),
                        ],
                    },
                })
                return
            }

            const artistLower = artistName.toLowerCase()
            // Prefer exact match, then word-boundary match, then substring match.
            // This prevents "Prince" from routing to "Prince Royce".
            const exactMatch = searchResult.tracks.filter(
                (t) => t.author.toLowerCase() === artistLower,
            )
            const wordMatch = searchResult.tracks.filter((t) => {
                const words = t.author.toLowerCase().split(/[\s,&/]+/)
                return words.some((w) => w === artistLower)
            })
            const substringMatch = searchResult.tracks.filter((t) =>
                t.author.toLowerCase().includes(artistLower),
            )
            const byArtist =
                exactMatch.length >= 3
                    ? exactMatch
                    : wordMatch.length >= 3
                      ? wordMatch
                      : substringMatch
            const tracks = (
                byArtist.length >= 3 ? byArtist : searchResult.tracks
            ).slice(0, limit)

            const firstTrack = tracks[0]
            if (!firstTrack) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed('No results', 'No tracks found.'),
                        ],
                    },
                })
                return
            }

            const playResult = await client.player.play(
                voiceChannel,
                firstTrack.url,
                {
                    nodeOptions: {
                        metadata: {
                            channel: interaction.channel,
                            requestedBy: interaction.user,
                        },
                        connectionTimeout:
                            ENVIRONMENT_CONFIG.PLAYER.CONNECTION_TIMEOUT,
                        leaveOnEmpty: true,
                        leaveOnEmptyCooldown: 30_000,
                        leaveOnEnd: true,
                        leaveOnEndCooldown: 300_000,
                    },
                    requestedBy: interaction.user,
                    searchEngine:
                        resolvedEngine === QueryType.SPOTIFY_SEARCH
                            ? QueryType.SPOTIFY_SONG
                            : QueryType.AUTO,
                },
            )

            const { queue } = resolveGuildQueue(client, interaction.guildId)
            if (!queue) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                'Error',
                                'Could not create queue.',
                            ),
                        ],
                        ephemeral: true,
                    },
                })
                return
            }

            for (const track of tracks.slice(1)) {
                track.requestedBy = interaction.user
                queue.addTrack(track)
            }

            moveUserTrackToPriority(queue, playResult.track)

            const displayArtist =
                tracks.find((t) => t.author.toLowerCase().includes(artistLower))
                    ?.author ?? artistName

            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createSuccessEmbed(
                            `🎤 ${displayArtist}`,
                            `Queued **${tracks.length}** track${tracks.length === 1 ? '' : 's'} by **${displayArtist}**.`,
                        ),
                    ],
                },
            })
        } catch (error) {
            if (isUnknownInteractionError(error)) return
            errorLog({
                message: 'Artist command error:',
                error,
                data: { artistName, guildId: interaction.guildId },
            })
            try {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                'Error',
                                createUserFriendlyError(error),
                            ),
                        ],
                        ephemeral: true,
                    },
                })
            } catch {
                // interaction already replied
            }
        }
    },
})
