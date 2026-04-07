import { SlashCommandBuilder } from '@discordjs/builders'
import type { GuildMember, ChatInputCommandInteraction } from 'discord.js'
import { requireVoiceChannel } from '../../../../utils/command/commandValidations'
import type { CommandExecuteParams } from '../../../../types/CommandData'
import type { CustomClient } from '../../../../types'
import Command from '../../../../models/Command'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'
import { errorLog, debugLog, warnLog } from '@lucky/shared/utils'
import { guildSettingsService } from '@lucky/shared/services'
import { createErrorEmbed } from '../../../../utils/general/embeds'
import { createSuccessEmbed } from '../../../../utils/general/embeds'
import { interactionReply } from '../../../../utils/general/interactionReply'
import { collaborativePlaylistService } from '../../../../utils/music/collaborativePlaylist'
import { QueueRepeatMode, QueryType } from 'discord-player'
import { resolveGuildQueue } from '../../../../utils/music/queueResolver'
import {
    moveUserTrackToPriority,
    blendAutoplayTracks,
} from '../../../../utils/music/queueManipulation'

const DISCORD_UNKNOWN_INTERACTION_CODE = 10062

function isUnknownInteractionError(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: number }).code === DISCORD_UNKNOWN_INTERACTION_CODE
    )
}

function isUrl(query: string): boolean {
    return query.startsWith('http://') || query.startsWith('https://')
}

function resolveSearchEngine(query: string): QueryType {
    if (isUrl(query)) return QueryType.AUTO
    return QueryType.SPOTIFY_SEARCH
}

function isTrackAlreadyQueued(
    queue: { tracks: { toArray?: () => Array<{ id?: string; url?: string }> } },
    track: { id?: string; url?: string },
): boolean {
    const queuedTracks = queue.tracks.toArray?.() ?? []

    return queuedTracks.some((queuedTrack) => {
        if (track.id && queuedTrack.id === track.id) return true
        if (track.url && queuedTrack.url === track.url) return true
        return queuedTrack === track
    })
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription(
            'Play music from YouTube, Spotify, or search for tracks',
        )
        .addStringOption((option) =>
            option
                .setName('query')
                .setDescription(
                    'Song name, artist, YouTube URL, or Spotify URL',
                )
                .setRequired(true),
        ),
    category: 'music',
    execute: async ({
        client,
        interaction,
    }: CommandExecuteParams): Promise<void> => {
        if (!interaction.guildId) {
            await interaction.reply({
                embeds: [
                    createErrorEmbed(
                        'Error',
                        'This command can only be used in a server',
                    ),
                ],
                ephemeral: true,
            })
            return
        }

        const member = interaction.member as GuildMember
        if (!(await requireVoiceChannel(interaction))) return

        const voiceChannel = member.voice.channel!

        try {
            await interaction.deferReply()
        } catch (error) {
            if (isUnknownInteractionError(error)) return
            throw error
        }

        const query = interaction.options.getString('query', true)
        const collaborativeCheck = collaborativePlaylistService.canAddTracks(
            interaction.guildId,
            interaction.user.id,
            1,
        )
        if (!collaborativeCheck.allowed) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'Contribution limit reached',
                            `Collaborative mode limit reached (${collaborativeCheck.limit} track requests per user).`,
                        ),
                    ],
                },
            })
            return
        }

        try {
            const hadQueueBeforePlay = Boolean(
                resolveGuildQueue(client, interaction.guildId ?? '').queue,
            )

            const searchEngine = resolveSearchEngine(query)
            const playOptions = {
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
                searchEngine,
            }

            let result
            try {
                result = await client.player.play(
                    voiceChannel,
                    query,
                    playOptions,
                )
            } catch (spotifyError) {
                if (searchEngine !== QueryType.AUTO) {
                    debugLog({
                        message: 'Spotify search failed, falling back to auto',
                        data: { query },
                    })
                    result = await client.player.play(voiceChannel, query, {
                        ...playOptions,
                        searchEngine: QueryType.AUTO,
                    })
                } else {
                    throw spotifyError
                }
            }

            const track = result.track

            const isPlaylist = !!result.searchResult.playlist
            const { queue } = resolveGuildQueue(
                client,
                interaction.guildId ?? '',
            )

            if (!hadQueueBeforePlay && queue) {
                await applyStoredAutoplayPreference(queue, interaction.guildId)
            }

            if (!isPlaylist && queue) {
                if (!isTrackAlreadyQueued(queue, track)) {
                    moveUserTrackToPriority(queue, track)
                }
                if (queue.repeatMode === QueueRepeatMode.AUTOPLAY) {
                    await blendAutoplayTracks(queue, track)
                }
            }

            const embed = result.searchResult.playlist
                ? createSuccessEmbed(
                      'Playlist Enqueued',
                      `**${result.searchResult.playlist.title}** — ${result.searchResult.tracks.length} tracks`,
                  )
                : createSuccessEmbed(
                      'Now Playing',
                      `**${track.title}** by ${track.author}`,
                  )

            collaborativePlaylistService.recordContribution(
                interaction.guildId,
                interaction.user.id,
                1,
            )

            await interactionReply({
                interaction,
                content: { embeds: [embed] },
            })
        } catch (error) {
            if (isUnknownInteractionError(error)) {
                debugLog({
                    message: 'Play command interaction expired before reply',
                    data: { query, guildId: interaction.guildId },
                })
                return
            }

            errorLog({
                message: 'Play command error:',
                error,
                data: { query, guildId: interaction.guildId },
            })

            try {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                'Play Error',
                                'Could not find or play the requested track',
                            ),
                        ],
                    },
                })
            } catch (replyError) {
                warnLog({
                    message: 'Failed to send play command error reply',
                    error: replyError,
                    data: { guildId: interaction.guildId },
                })
            }
        }
    },
})

async function applyStoredAutoplayPreference(
    queue: {
        repeatMode: QueueRepeatMode
        setRepeatMode: (mode: QueueRepeatMode) => void
    },
    guildId: string,
): Promise<void> {
    try {
        const settings = await guildSettingsService.getGuildSettings(guildId)
        if (typeof settings?.autoPlayEnabled === 'boolean') {
            const repeatMode = settings.autoPlayEnabled
                ? QueueRepeatMode.AUTOPLAY
                : QueueRepeatMode.OFF

            if (queue.repeatMode !== repeatMode) {
                queue.setRepeatMode(repeatMode)
            }

            debugLog({
                message: 'Applied stored autoplay preference to queue',
                data: { guildId, autoPlayEnabled: settings.autoPlayEnabled },
            })
        }
    } catch (error) {
        warnLog({
            message: 'Failed to apply stored autoplay preference',
            error,
            data: { guildId },
        })
    }
}
