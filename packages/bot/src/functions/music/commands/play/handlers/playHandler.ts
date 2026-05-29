import type { GuildMember, ChatInputCommandInteraction } from 'discord.js'
import { QueueRepeatMode, QueryType } from 'discord-player'
import type { CommandExecuteParams } from '../../../../../types/CommandData'
import type { CustomClient } from '../../../../../types'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'
import { errorLog, debugLog, warnLog } from '@lucky/shared/utils'
import { guildSettingsService } from '@lucky/shared/services'
import { createErrorEmbed } from '../../../../../utils/general/embeds'
import { interactionReply } from '../../../../../utils/general/interactionReply'
import { createUserFriendlyError } from '@lucky/shared/utils/general/errorSanitizer'
import { collaborativePlaylistService } from '../../../../../utils/music/collaborativePlaylist'
import {
    moveUserTrackToPriority,
    blendAutoplayTracks,
} from '../../../../../utils/music/queueManipulation'
import { buildPlayResponseEmbed } from '../../../../../utils/music/nowPlayingEmbed'
import { registerNowPlayingMessage } from '../../../../../handlers/player/trackNowPlaying'
import { resolveGuildQueue } from '../../../../../utils/music/queueResolver'
import {
    isUnknownInteractionError,
    resolveSearchEngine,
    normalizeSoundCloudUrl,
} from '../queryUtils'
import { applyStoredAutoplayPreference } from './autoplayPreference'
import { clearAutoplayPause } from '../../../../../utils/music/autoplay/skipCircuitBreaker'

export async function executePlayHandler({
    client,
    interaction,
}: CommandExecuteParams): Promise<void> {
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

    const member = interaction.member as GuildMember
    const voiceChannel = member.voice.channel!

    try {
        await interaction.deferReply()
    } catch (error) {
        if (isUnknownInteractionError(error)) return
        throw error
    }

    const rawQuery = interaction.options.getString('query', true)
    const query = normalizeSoundCloudUrl(rawQuery)
    const provider = interaction.options.getString('provider')
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

        if (!hadQueueBeforePlay && interaction.channelId) {
            try {
                const deferredMsg = await interaction.fetchReply()
                registerNowPlayingMessage(
                    interaction.guildId!,
                    deferredMsg.id,
                    interaction.channelId,
                )
            } catch {
                // Non-fatal — playerStart will send a new message instead
            }
        }

        const searchEngine = resolveSearchEngine(query, provider)
        const vcMemberIds = voiceChannel.members
            ? Array.from(voiceChannel.members.values())
                  .filter((m) => m.id !== client.user?.id)
                  .map((m) => m.id)
            : []
        const playOptions = {
            nodeOptions: {
                metadata: {
                    channel: interaction.channel,
                    requestedBy: interaction.user,
                    vcMemberIds,
                },
                connectionTimeout: ENVIRONMENT_CONFIG.PLAYER.CONNECTION_TIMEOUT,
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
            result = await client.player.play(voiceChannel, query, playOptions)
        } catch (primaryError) {
            if (searchEngine !== QueryType.AUTO) {
                warnLog({
                    message: 'Primary search failed, falling back to YouTube',
                    data: {
                        query,
                        requestedProvider: provider ?? 'default',
                        searchEngine: String(searchEngine),
                        error: String(primaryError),
                    },
                })
                try {
                    result = await client.player.play(voiceChannel, query, {
                        ...playOptions,
                        searchEngine: QueryType.YOUTUBE_SEARCH,
                    })
                } catch (youtubeError) {
                    warnLog({
                        message:
                            'YouTube search failed, falling back to SoundCloud',
                        data: { query },
                    })
                    result = await client.player.play(voiceChannel, query, {
                        ...playOptions,
                        searchEngine: QueryType.SOUNDCLOUD_SEARCH,
                    })
                }
            } else {
                throw primaryError
            }
        }

        const track = result.track

        const isPlaylist = !!result.searchResult.playlist
        const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')

        if (!isPlaylist && queue) {
            moveUserTrackToPriority(queue, track)
        }

        const queuedTracks = queue ? (queue.tracks.toArray?.() ?? []) : []
        const trackIndex = queuedTracks.findIndex(
            (t) => t === track || (track.id && t.id === track.id),
        )
        const queuePosition =
            hadQueueBeforePlay && queue
                ? trackIndex >= 0
                    ? trackIndex + 1
                    : queuedTracks.length
                : 0

        const embed = result.searchResult.playlist
            ? buildPlayResponseEmbed({
                  kind: 'playlistQueued',
                  track,
                  requestedBy: interaction.user,
                  playlist: {
                      title: result.searchResult.playlist.title,
                      trackCount: result.searchResult.tracks.length,
                      url: result.searchResult.playlist.url,
                  },
              })
            : buildPlayResponseEmbed({
                  kind: 'addedToQueue',
                  track,
                  requestedBy: interaction.user,
                  queuePosition,
              })

        try {
            collaborativePlaylistService.recordContribution(
                interaction.guildId,
                interaction.user.id,
                1,
            )
        } catch (err) {
            errorLog({
                message: 'Failed to record contribution',
                error: err,
            })
        }

        await interactionReply({
            interaction,
            content: { embeds: [embed] },
        })

        const bgOps = (async () => {
            try {
                // Clear any autoplay pause state when a manual play succeeds
                clearAutoplayPause(interaction.guildId!)
                if (!hadQueueBeforePlay && queue) {
                    await applyStoredAutoplayPreference(
                        queue,
                        interaction.guildId!,
                    )
                }
                if (
                    !isPlaylist &&
                    queue &&
                    queue.repeatMode === QueueRepeatMode.AUTOPLAY
                ) {
                    await blendAutoplayTracks(queue, track)
                }
            } catch (bgError) {
                errorLog({
                    message: 'Post-play background ops failed',
                    error: bgError,
                    data: { guildId: interaction.guildId },
                })
            }
        })()
        void bgOps
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
                            createUserFriendlyError(error),
                        ),
                    ],
                    ephemeral: true,
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
}
