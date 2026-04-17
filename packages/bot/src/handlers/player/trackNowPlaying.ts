import type { Track, GuildQueue } from 'discord-player'
import type { ColorResolvable } from 'discord.js'
import { LRUCache } from 'lru-cache'
import { debugLog, errorLog, warnLog } from '@lucky/shared/utils'
import { createEmbed, EMBED_COLORS } from '../../utils/general/embeds'
import { getAutoplayCount } from '../../utils/music/autoplayManager'
import { constants } from '@lucky/shared/config'
import {
    createMusicControlButtons,
    createMusicActionButtons,
} from '../../utils/music/buttonComponents'
import type { QueueMetadata } from '../../types/QueueMetadata'
import {
    isLastFmConfigured,
    getSessionKeyForUser,
    updateNowPlaying as lastFmUpdateNowPlaying,
    scrobble as lastFmScrobble,
} from '../../lastfm'

/**
 * Manages per-guild now-playing state with automatic TTL + explicit cleanup
 * on guild lifecycle events (guildDelete, channelDelete).
 */
class TrackNowPlayingState {
    private songInfoMessages = new LRUCache<
        string,
        { messageId: string; channelId: string }
    >({
        max: 500,
        ttl: 4 * 60 * 60 * 1000,
    })

    private lastFmTrackStartTime = new LRUCache<string, number>({
        max: 500,
        ttl: 4 * 60 * 60 * 1000,
    })

    registerNowPlayingMessage(
        guildId: string,
        messageId: string,
        channelId: string,
    ): void {
        this.songInfoMessages.set(guildId, { messageId, channelId })
    }

    getSongInfoMessage(
        guildId: string,
    ): { messageId: string; channelId: string } | undefined {
        return this.songInfoMessages.get(guildId)
    }

    deleteSongInfoMessage(guildId: string): void {
        this.songInfoMessages.delete(guildId)
    }

    getLastFmTrackStartTime(guildId: string): number | undefined {
        return this.lastFmTrackStartTime.get(guildId)
    }

    setLastFmTrackStartTime(guildId: string, timestamp: number): void {
        this.lastFmTrackStartTime.set(guildId, timestamp)
    }

    deleteLastFmTrackStartTime(guildId: string): void {
        this.lastFmTrackStartTime.delete(guildId)
    }

    cleanupGuild(guildId: string): void {
        this.songInfoMessages.delete(guildId)
        this.lastFmTrackStartTime.delete(guildId)
        debugLog({
            message: 'Cleaned up now-playing state for guild',
            data: { guildId },
        })
    }
}

const trackNowPlayingState = new TrackNowPlayingState()

/**
 * Register an existing message as the "now playing" display for a guild.
 * Used by the /play command to pre-register its interaction reply so that
 * the playerStart handler edits it (with buttons) instead of sending a
 * duplicate "Now Playing" message.
 */
export function registerNowPlayingMessage(
    guildId: string,
    messageId: string,
    channelId: string,
): void {
    trackNowPlayingState.registerNowPlayingMessage(guildId, messageId, channelId)
}

export function getSongInfoMessage(
    guildId: string,
): { messageId: string; channelId: string } | undefined {
    return trackNowPlayingState.getSongInfoMessage(guildId)
}

export function deleteSongInfoMessage(guildId: string): void {
    trackNowPlayingState.deleteSongInfoMessage(guildId)
}

export function cleanupGuildState(guildId: string): void {
    trackNowPlayingState.cleanupGuild(guildId)
}

function getLastFmRequesterId(
    queue: GuildQueue,
    track: Track,
): string | undefined {
    const metadataRequester = (
        track.metadata as { requestedById?: unknown } | undefined
    )?.requestedById
    const queueRequester = (queue.metadata as QueueMetadata | undefined)
        ?.requestedBy?.id
    const fallbackRequester =
        typeof metadataRequester === 'string' ? metadataRequester : undefined
    return track.requestedBy?.id ?? fallbackRequester ?? queueRequester
}

function formatDuration(duration: string) {
    if (!duration || duration === '0:00') return 'Unknown duration'
    return duration
}

function getSource(url: string) {
    if (url.includes('youtube.com') || url.includes('youtu.be'))
        return 'YouTube'
    if (url.includes('spotify.com')) return 'Spotify'
    if (url.includes('soundcloud.com')) return 'SoundCloud'
    return 'Unknown'
}

export async function sendNowPlayingEmbed(
    queue: GuildQueue,
    track: Track,
    isAutoplay: boolean,
): Promise<void> {
    const metadata = queue.metadata as QueueMetadata | undefined
    if (!metadata?.channel) return

    const requester = track.requestedBy
    const requesterInfo = requester
        ? `Added by ${requester.username}`
        : 'Added automatically'
    const requestedByInfo = requester ? requester.username : 'Autoplay'
    const trackMetadata = (track.metadata ?? {}) as {
        recommendationReason?: string
    }
    const autoplayCount = isAutoplay
        ? await getAutoplayCount(queue.guild.id)
        : null
    const footer = isAutoplay
        ? `Autoplay • ${autoplayCount ?? 0}/${constants.MAX_AUTOPLAY_TRACKS ?? 50} songs`
        : requesterInfo

    const fields = [
        {
            name: '⏱️ Duration',
            value: formatDuration(track.duration),
            inline: true,
        },
        { name: '🌐 Source', value: getSource(track.url), inline: true },
        { name: '👤 Requested', value: requestedByInfo, inline: true },
    ]
    if (isAutoplay && trackMetadata.recommendationReason) {
        fields.push({
            name: '🤖 Why this track',
            value: trackMetadata.recommendationReason,
            inline: false,
        })
    }

    const embed = createEmbed({
        title: '🎵 Now Playing',
        description: `[**${track.title}**](${track.url}) by **${track.author}**`,
        color: EMBED_COLORS.MUSIC as ColorResolvable,
        thumbnail: track.thumbnail,
        timestamp: true,
        fields,
        footer,
    })

    const previousMessage = getSongInfoMessage(queue.guild.id)
    if (previousMessage && previousMessage.channelId === metadata.channel.id) {
        try {
            const message = await metadata.channel.messages.fetch(
                previousMessage.messageId,
            )
            await message.edit({
                content: null,
                embeds: [embed],
                components: [
                    createMusicControlButtons(queue),
                    createMusicActionButtons(queue),
                ],
            })
            debugLog({
                message: 'Updated now playing message in channel',
                data: {
                    guildId: queue.guild.id,
                    trackTitle: track.title,
                    isAutoplay,
                },
            })
            return
        } catch (error) {
            debugLog({
                message: 'Failed to update existing now playing message',
                error,
                data: {
                    guildId: queue.guild.id,
                    messageId: previousMessage.messageId,
                },
            })
            deleteSongInfoMessage(queue.guild.id)
        }
    }

    const message = await metadata.channel.send({
        embeds: [embed],
        components: [
            createMusicControlButtons(queue),
            createMusicActionButtons(queue),
        ],
    })

    registerNowPlayingMessage(queue.guild.id, message.id, metadata.channel.id)

    debugLog({
        message: 'Sent now playing message to channel',
        data: { guildId: queue.guild.id, trackTitle: track.title, isAutoplay },
    })
}

export async function updateLastFmNowPlaying(
    queue: GuildQueue,
    track: Track,
): Promise<void> {
    if (!isLastFmConfigured()) return
    const requesterId = getLastFmRequesterId(queue, track)
    const sessionKey = await getSessionKeyForUser(requesterId)
    if (!sessionKey) return
    const durationSec =
        track.durationMS > 0 ? Math.round(track.durationMS / 1000) : undefined
    try {
        await lastFmUpdateNowPlaying(
            track.author,
            track.title,
            durationSec,
            sessionKey,
        )
        trackNowPlayingState.setLastFmTrackStartTime(
            queue.guild.id,
            Math.floor(Date.now() / 1000),
        )
    } catch (err) {
        const is403 = err instanceof Error && err.message.includes('403')
        if (is403) {
            warnLog({
                message:
                    'Last.fm updateNowPlaying: session expired, re-auth needed',
                error: err,
            })
        } else {
            errorLog({ message: 'Last.fm updateNowPlaying failed', error: err })
        }
    }
}

export async function scrobbleCurrentTrackIfLastFm(
    queue: GuildQueue,
    track?: Track,
): Promise<void> {
    const trackToScrobble = track ?? queue.currentTrack
    if (!trackToScrobble || !isLastFmConfigured()) return
    const requesterId = getLastFmRequesterId(queue, trackToScrobble)
    const sessionKey = await getSessionKeyForUser(requesterId)
    if (!sessionKey) return
    const startedAt = trackNowPlayingState.getLastFmTrackStartTime(
        queue.guild.id,
    )
    trackNowPlayingState.deleteLastFmTrackStartTime(queue.guild.id)
    const timestamp = startedAt ?? Math.floor(Date.now() / 1000)
    const durationSec =
        trackToScrobble.durationMS > 0
            ? Math.round(trackToScrobble.durationMS / 1000)
            : undefined
    try {
        await lastFmScrobble(
            trackToScrobble.author,
            trackToScrobble.title,
            timestamp,
            durationSec,
            sessionKey,
        )
    } catch (err) {
        const is403 = err instanceof Error && err.message.includes('403')
        if (is403) {
            warnLog({
                message: 'Last.fm scrobble: session expired, re-auth needed',
                error: err,
            })
        } else {
            errorLog({ message: 'Last.fm scrobble failed', error: err })
        }
    }
}
