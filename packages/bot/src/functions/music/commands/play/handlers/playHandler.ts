import type { GuildMember } from 'discord.js'
import type { CommandExecuteParams } from '../../../../../types/CommandData'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'
import { errorLog, debugLog, warnLog } from '@lucky/shared/utils'
import { createErrorEmbed } from '../../../../../utils/general/embeds'
import { interactionReply } from '../../../../../utils/general/interactionReply'
import { createUserFriendlyError } from '@lucky/shared/utils/general/errorSanitizer'
import { collaborativePlaylistService } from '../../../../../utils/music/collaborativePlaylist'
import { moveUserTrackToPriority } from '../../../../../utils/music/queueManipulation'
import { buildPlayResponseEmbed } from '../../../../../utils/music/nowPlayingEmbed'
import { registerNowPlayingMessage } from '../../../../../handlers/player/trackNowPlaying'
import { resolveGuildQueue } from '../../../../../utils/music/queueResolver'
import {
    isUnknownInteractionError,
    resolveSearchEngine,
    normalizeSoundCloudUrl,
    expandSoundCloudShortUrl,
} from '../queryUtils'
import {
    resolveQueryWithFallbacks,
    emitPlayResolutionTelemetry,
} from './resolveProvider'
import { runPostPlayBackgroundOps } from './postPlayBackgroundOps'

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
    // Expand SoundCloud short links first (on.soundcloud.com → full URL)
    const expandedQuery = await expandSoundCloudShortUrl(rawQuery)
    // Then normalize (strip ?in= params)
    const query = normalizeSoundCloudUrl(expandedQuery)
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

        let result: any
        let resolutionTelemetry
        try {
            const resolution = await resolveQueryWithFallbacks(
                client.player,
                voiceChannel,
                query,
                provider ?? 'default',
                searchEngine,
                playOptions,
            )
            result = resolution.result
            resolutionTelemetry = resolution.telemetry
            emitPlayResolutionTelemetry(resolutionTelemetry)
        } catch (error) {
            // Emit failure telemetry
            resolutionTelemetry = {
                resolvedVia: 'failed' as const,
                latencyMs: 0,
                requestedProvider: provider ?? 'default',
                errorClass: (error as Error).constructor.name,
            }
            try {
                emitPlayResolutionTelemetry(resolutionTelemetry)
            } catch {
                // Telemetry failure must not break play error handling
            }
            throw error
        }

        const track = (result as any).track

        const isPlaylist = !!(result as any).searchResult.playlist
        if (!isPlaylist && !track.title) {
            throw new Error('YouTube: track metadata unavailable')
        }
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

        const embed = (result as any).searchResult.playlist
            ? buildPlayResponseEmbed({
                  kind: 'playlistQueued',
                  track,
                  requestedBy: interaction.user,
                  playlist: {
                      title: (result as any).searchResult.playlist.title,
                      trackCount: (result as any).searchResult.tracks.length,
                      url: (result as any).searchResult.playlist.url,
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

        // Fire-and-forget: each op is isolated inside runPostPlayBackgroundOps so a
        // single failure never silently skips the others (#1085).
        void runPostPlayBackgroundOps({
            queue,
            guildId: interaction.guildId!,
            track,
            hadQueueBeforePlay,
            isPlaylist,
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
