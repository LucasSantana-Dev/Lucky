import type { ChatInputCommandInteraction, GuildMember } from 'discord.js'
import type {
    PlayerNodeInitializationResult,
    SearchResult,
    Track,
} from 'discord-player'
import type { CommandExecuteParams } from '../../../../../types/CommandData'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'
import { errorLog, debugLog, warnLog } from '@lucky/shared/utils'
import { markCommandOutcome } from '../../../../../utils/monitoring/commandOutcome'
import { assertDefined } from '@lucky/shared/utils/guards'
import { createErrorEmbed } from '../../../../../utils/general/embeds'
import { interactionReply } from '../../../../../utils/general/interactionReply'
import { collaborativePlaylistService } from '../../../../../services/musicRecommendation/collaborativePlaylist'
import { moveUserTrackToPriority } from '../../../../../services/musicManagement/queueManipulation'
import { buildPlayResponseEmbed } from '../../../../../utils/music/nowPlayingEmbed'
import { registerNowPlayingMessage } from '../../../../../handlers/player/nowPlayingDisplay'
import { resolveGuildQueue } from '../../../../../services/musicManagement/queueResolver'
import {
    isUnknownInteractionError,
    resolveSearchEngine,
    normalizeSoundCloudUrl,
    normalizeYouTubeUrl,
    expandSoundCloudShortUrl,
    replyYoutubeDisabledIfNeeded,
} from '../queryUtils'
import {
    resolveQueryWithFallbacks,
    emitPlayResolutionTelemetry,
} from './resolveProvider'
import { runPostPlayBackgroundOps } from './postPlayBackgroundOps'
import {
    classifyPlayFailure,
    resolvePlayErrorMessage,
} from './playErrorMessage'
import { watchStreamStartFailures } from './streamStartWatcher'

type QueuedEmbedInput = {
    searchResult: SearchResult
    track: Track
    interaction: ChatInputCommandInteraction
    queuePosition: number
}

function buildQueuedEmbed({
    searchResult,
    track,
    interaction,
    queuePosition,
}: QueuedEmbedInput) {
    return searchResult.playlist
        ? buildPlayResponseEmbed({
              kind: 'playlistQueued',
              track,
              requestedBy: interaction.user,
              playlist: {
                  title: searchResult.playlist.title,
                  trackCount: searchResult.tracks.length,
                  url: searchResult.playlist.url,
              },
          })
        : buildPlayResponseEmbed({
              kind: 'addedToQueue',
              track,
              requestedBy: interaction.user,
              queuePosition,
          })
}

/** The reply sent as soon as the search resolved, before audio starts. */
type EarlyReply = {
    track: Track
    queuePosition: number
    sent: Promise<void>
}

function isSameResolvedTrack(a: Track, b: Track): boolean {
    return a === b || (Boolean(b.id) && a.id === b.id)
}

/**
 * Edits the original (deferred) reply in place. `interactionReply` cannot be
 * used for a second write: once the first edit landed `interaction.replied`
 * is true and it would post a follow-up message instead of editing.
 * Returns false when the edit failed (expired token, deleted message).
 */
async function editOriginalReply(
    interaction: ChatInputCommandInteraction,
    embed: unknown,
): Promise<boolean> {
    try {
        await interaction.editReply({ embeds: [embed as never] })
        return true
    } catch (error) {
        debugLog({
            message: 'Could not edit the original /play reply',
            data: { guildId: interaction.guildId, error: String(error) },
        })
        return false
    }
}

/**
 * Replaces the "added to queue" reply with an error. If the interaction can no
 * longer be edited (token expired after 15 minutes, message deleted), sends it
 * to the channel instead so the user is not left with a stale success.
 */
async function replaceReplyWithError(
    interaction: ChatInputCommandInteraction,
    embed: unknown,
): Promise<void> {
    if (await editOriginalReply(interaction, embed)) return
    const channel = interaction.channel
    try {
        if (channel && 'send' in channel) {
            await channel.send({ embeds: [embed as never] })
            return
        }
    } catch (error) {
        warnLog({
            message: 'Failed to send play failure follow-up to channel',
            error,
            data: { guildId: interaction.guildId },
        })
        return
    }
    warnLog({
        message: 'No way to report play failure to the user',
        data: { guildId: interaction.guildId },
    })
}

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

    const commandStartedAt = Date.now()
    const member = interaction.member as GuildMember
    const voiceChannel = assertDefined(
        member.voice.channel,
        'Voice channel guaranteed by requireVoiceChannel check',
    )

    const rawQuery = interaction.options.getString('query', true)
    const provider = interaction.options.getString('provider')

    // Checked on the raw query, before deferring, so the "YouTube is
    // unavailable" notice can still be its own ephemeral reply instead of
    // editing the public defer below, which would strip the ephemeral flag.
    // Safe on the raw query: SoundCloud expansion/normalization below never
    // changes a youtube.com/youtu.be host.
    if (await replyYoutubeDisabledIfNeeded(interaction, rawQuery, provider))
        return

    try {
        await interaction.deferReply()
    } catch (error) {
        if (isUnknownInteractionError(error)) return
        throw error
    }

    // Expand SoundCloud short links first (on.soundcloud.com → full URL)
    const expandedQuery = await expandSoundCloudShortUrl(rawQuery)
    // Then normalize: SoundCloud `?in=` playlist context, and YouTube Mix
    // (`list=RD...`) context that the youtubei extractor cannot resolve.
    const query = normalizeYouTubeUrl(normalizeSoundCloudUrl(expandedQuery))

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

    // Written by the onSearchResolved callback while play() is still awaiting
    // voice and stream; read by the final reconcile and by the catch below.
    const early: { reply: EarlyReply | null } = { reply: null }

    try {
        const hadQueueBeforePlay = Boolean(
            resolveGuildQueue(client, interaction.guildId ?? '').queue,
        )

        if (!hadQueueBeforePlay && interaction.channelId) {
            try {
                const deferredMsg = await interaction.fetchReply()
                registerNowPlayingMessage(
                    assertDefined(
                        interaction.guildId,
                        'Guild ID guaranteed by requireGuild check',
                    ),
                    deferredMsg.id,
                    interaction.channelId,
                )
            } catch (error) {
                // Non-fatal: playerStart sends its own message if this fails.
                // Logged because an empty catch made the double failure
                // (this AND playerStart) indistinguishable from success —
                // the user got no now-playing message and nothing was
                // recorded anywhere (#1993).
                warnLog({
                    message: 'Failed to register now-playing message',
                    data: {
                        guildId: interaction.guildId,
                        channelId: interaction.channelId,
                        error: String(error),
                    },
                })
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

        const guildId = interaction.guildId
        const startWatcher = watchStreamStartFailures(client.player, guildId)

        // Answers as soon as the search found something, so the user is not
        // waiting out the voice connect and the stream bridge (about 6 s on a
        // cold Spotify play). Not awaited: the edit runs while discord-player
        // connects. The now-playing message later overwrites the same message.
        const replyOnceSearched = (searchResult: SearchResult): void => {
            if (early.reply) return
            const found = searchResult.tracks[0]
            if (!found || (!searchResult.playlist && !found.title)) return
            const queueNow = resolveGuildQueue(client, guildId).queue
            const queuePosition =
                hadQueueBeforePlay && queueNow ? queueNow.tracks.size + 1 : 0
            const embed = buildQueuedEmbed({
                searchResult,
                track: found,
                interaction,
                queuePosition,
            })
            early.reply = {
                track: found,
                queuePosition,
                sent: interactionReply({
                    interaction,
                    content: { embeds: [embed] },
                }).catch(() => undefined),
            }
            debugLog({
                message: 'Play: early reply sent after search',
                data: { guildId, replyAfterMs: Date.now() - commandStartedAt },
            })
        }

        let result: PlayerNodeInitializationResult<unknown>
        let resolutionTelemetry
        const resolutionStartedAt = Date.now()
        try {
            const resolution = await resolveQueryWithFallbacks(
                client.player,
                voiceChannel,
                query,
                provider ?? 'default',
                searchEngine,
                playOptions,
                replyOnceSearched,
            )
            result = resolution.result
            resolutionTelemetry = resolution.telemetry
            emitPlayResolutionTelemetry(resolutionTelemetry)
        } catch (error) {
            // Emit failure telemetry
            resolutionTelemetry = {
                resolvedVia: 'failed' as const,
                latencyMs: Date.now() - resolutionStartedAt,
                requestedProvider: provider ?? 'default',
                errorClass: (error as Error).constructor.name,
            }
            try {
                emitPlayResolutionTelemetry(resolutionTelemetry)
            } catch {
                // Telemetry failure must not break play error handling
            }
            throw error
        } finally {
            startWatcher.dispose()
        }

        const track = result.track

        const isPlaylist = !!result.searchResult.playlist

        // discord-player does not throw to this caller when every stream
        // source fails: it skips the track and resolves play() as if it had
        // started. Say so instead of leaving "added to queue" on screen.
        if (!isPlaylist && startWatcher.hasFailed(track)) {
            await reportStartFailure(interaction, early.reply, track)
            return
        }

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

        const embed = buildQueuedEmbed({
            searchResult: result.searchResult,
            track,
            interaction,
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

        if (!early.reply) {
            await interactionReply({
                interaction,
                content: { embeds: [embed] },
            })
        } else {
            // The early embed was built before the track was added, so its
            // position is an estimate (and a fallback arm may have resolved a
            // different track). Correct it only when it differs.
            await early.reply.sent
            if (
                !isSameResolvedTrack(early.reply.track, track) ||
                early.reply.queuePosition !== queuePosition
            ) {
                await editOriginalReply(interaction, embed)
            }
        }

        // Fire-and-forget: each op is isolated inside runPostPlayBackgroundOps so a
        // single failure never silently skips the others (#1085).
        //
        // Not awaited: these are background ops by design and the user-facing
        // reply has already been sent, so awaiting would hold the command open
        // on work the user is not waiting for. The catch is what #1997 was
        // actually missing — anything escaping the internal isolation used to
        // vanish into an unhandled rejection.
        void runPostPlayBackgroundOps({
            queue,
            guildId: assertDefined(
                interaction.guildId,
                'Guild ID guaranteed by requireGuild check',
            ),
            track,
            hadQueueBeforePlay,
            isPlaylist,
        }).catch((error: unknown) => {
            errorLog({
                message: 'Post-play background ops failed',
                error,
                data: { guildId: interaction.guildId, track: track?.title },
            })
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
        markCommandOutcome(interaction, classifyPlayFailure(error))

        const errorEmbed = createErrorEmbed(
            'Play Error',
            resolvePlayErrorMessage(error, query),
        )

        if (early.reply) {
            // The user already has a success reply: replace it, do not stack
            // an ephemeral follow-up under it.
            await early.reply.sent
            await replaceReplyWithError(interaction, errorEmbed)
            return
        }

        try {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed],
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

async function reportStartFailure(
    interaction: ChatInputCommandInteraction,
    earlyReply: EarlyReply | null,
    track: Track,
): Promise<void> {
    warnLog({
        message: 'Play: track could not be started, replying with failure',
        data: { guildId: interaction.guildId, title: track.title },
    })
    markCommandOutcome(interaction, {
        outcome: 'error',
        errorClass: 'StreamStartFailed',
    })
    const embed = createErrorEmbed(
        'Play Error',
        `Could not start **${track.title || 'this track'}**: no audio source responded. It may be unavailable in your region. Try another version of the song.`,
    )
    if (earlyReply) {
        await earlyReply.sent
        await replaceReplyWithError(interaction, embed)
        return
    }
    await interactionReply({ interaction, content: { embeds: [embed] } })
}
