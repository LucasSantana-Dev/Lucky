import type { Track, GuildQueue } from 'discord-player'
import { QueueRepeatMode } from 'discord-player'
import { infoLog, debugLog, errorLog, warnLog } from '@lucky/shared/utils'
import { addTrackToHistory } from '../../utils/music/duplicateDetection'
import { replenishQueue } from '../../utils/music/queueOperations'
import { resetAutoplayCount } from '../../utils/music/autoplayManager'
import { featureToggleService } from '@lucky/shared/services'
import { constants } from '@lucky/shared/config'
import {
    sendNowPlayingEmbed,
    updateLastFmNowPlaying,
    scrobbleCurrentTrackIfLastFm,
} from './trackNowPlaying'
import { musicWatchdogService } from '../../utils/music/watchdog'
import { musicSessionSnapshotService } from '../../utils/music/sessionSnapshots'
import * as voiceStatus from '../../services/VoiceChannelStatusService'
import {
    scheduleIdleDisconnect,
    clearIdleTimer,
} from '../../utils/music/idleDisconnect'
import { clearVotes } from '../../utils/music/voteSkipStore'
import { recommendationFeedbackService } from '../../services/musicRecommendation/feedbackService'
import { cleanTitle, cleanAuthor } from '../../utils/music/searchQueryCleaner'
import {
    isReplenishSuppressed,
    setReplenishSuppressed,
} from '../../utils/music/replenishSuppressionStore'

const MAX_GUILD_ENTRIES = 500

export const lastPlayedTracks = new Map<string, Track>()

const guildTrackStartTimes = new Map<string, number>()

export type TrackHistoryEntry = {
    url: string
    title: string
    author: string
    thumbnail?: string
    timestamp: number
}

export const recentlyPlayedTracks = new Map<string, TrackHistoryEntry[]>()

function getTrackRequesterId(track: Track): string | undefined {
    const metadata = track.metadata as { requestedById?: string } | undefined
    return track.requestedBy?.id ?? metadata?.requestedById
}

function isAutoplayTrack(track: Track, clientUserId?: string): boolean {
    const metadata = track.metadata as { isAutoplay?: boolean } | undefined
    return (
        metadata?.isAutoplay === true || track.requestedBy?.id === clientUserId
    )
}

function normalizeTrackKeyForFeedback(title: string, author: string): string {
    const normalizedTitle = cleanTitle(title)
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '')
        .trim()
    const normalizedAuthor = cleanAuthor(author)
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '')
        .trim()
    return `${normalizedTitle}::${normalizedAuthor}`
}

async function recordImplicitTrackFeedback(
    track: Track,
    type: 'implicit_like' | 'implicit_dislike',
): Promise<void> {
    const requesterId =
        track.requestedBy?.id ??
        (track.metadata as { requestedById?: string } | undefined)?.requestedById
    if (!requesterId) return
    const trackKey = normalizeTrackKeyForFeedback(track.title, track.author)
    await recommendationFeedbackService.recordImplicitFeedback(requesterId, trackKey, type)
}

function evictOldEntries(): void {
    if (lastPlayedTracks.size > MAX_GUILD_ENTRIES) {
        const oldest = lastPlayedTracks.keys().next().value
        if (oldest) lastPlayedTracks.delete(oldest)
    }
    for (const [guildId, entries] of recentlyPlayedTracks) {
        if (entries.length > MAX_GUILD_ENTRIES) {
            recentlyPlayedTracks.set(guildId, entries.slice(-MAX_GUILD_ENTRIES))
        }
    }
}

type PlayerEvents = {
    events: { on: (event: string, handler: Function) => void }
}
type SetupTrackHandlersParams = {
    player: PlayerEvents
    client: { user?: { id: string } | null }
}

export const setupTrackHandlers = ({
    player,
    client,
}: SetupTrackHandlersParams): void => {
    player.events.on('playerStart', async (queue: GuildQueue, track: Track) => {
        clearIdleTimer(queue.guild.id)
        clearVotes(queue.guild.id)
        await handlePlayerStart(queue, track, client)
    })
    player.events.on(
        'playerFinish',
        async (queue: GuildQueue, track: Track) => {
            await handlePlayerFinish(queue, track)
        },
    )
    player.events.on('playerSkip', async (queue: GuildQueue, track: Track) => {
        await handlePlayerSkip(queue, track)
    })
    player.events.on('audioTracksAdd', (queue: GuildQueue, tracks: Track[]) => {
        if (Array.isArray(tracks) && tracks.length > 0) {
            infoLog({
                message: `Added "${tracks[0].title}" to queue in ${queue.guild.name}`,
            })
        }
    })
    player.events.on('emptyQueue', (queue: GuildQueue) => {
        scheduleIdleDisconnect(queue)
    })
}

function handleAutoplayCounter(
    queue: GuildQueue,
    isAutoplay: boolean,
    isAutoplayEnabled: boolean,
): void {
    if (!isAutoplay && !isAutoplayEnabled) {
        resetAutoplayCount(queue.guild.id)
        debugLog({
            message: `Reset autoplay counter for guild ${queue.guild.id} - manual track played and autoplay disabled`,
        })
    } else if (!isAutoplay && isAutoplayEnabled) {
        debugLog({
            message: `Manual track played but autoplay is enabled - keeping autoplay counter for radio experience`,
        })
    }
}

async function handleQueueReplenishment(
    queue: GuildQueue,
    track: Track,
): Promise<void> {
    const autoplayEnabled = await isAutoplayReplenishmentEnabled(
        queue,
        getTrackRequesterId(track),
    )
    if (autoplayEnabled && queue.repeatMode === QueueRepeatMode.AUTOPLAY) {
        try {
            await replenishQueue(queue)
            debugLog({
                message: 'Queue replenished after track start',
                data: {
                    trackTitle: track.title,
                    guildId: queue.guild.id,
                    queueSize: queue.tracks.size,
                },
            })
        } catch (error) {
            errorLog({
                message: 'Replenish failed, retrying in 5s',
                error: String(error),
            })
            setTimeout(() => {
                replenishQueue(queue).catch((retryErr) => {
                    warnLog({
                        message: 'Replenish retry failed',
                        error: retryErr,
                        data: { guildId: queue.guild.id },
                    })
                })
            }, 5000)
        }
    } else {
        debugLog({
            message: 'Autoplay feature disabled, skipping queue replenishment',
        })
    }
}

const handlePlayerStart = async (
    queue: GuildQueue,
    track: Track,
    client: { user?: { id: string } | null },
): Promise<void> => {
    try {
        evictOldEntries()
        guildTrackStartTimes.set(queue.guild.id, Date.now())
        infoLog({
            message: `Started playing "${track.title}" in ${queue.guild.name}`,
        })
        debugLog({ message: `Track URL: ${track.url}` })
        if (queue.node.volume !== constants.VOLUME)
            queue.node.setVolume(constants.VOLUME)

        const isAutoplay = isAutoplayTrack(track, client.user?.id)
        const isAutoplayEnabled = queue.repeatMode === QueueRepeatMode.AUTOPLAY
        handleAutoplayCounter(queue, isAutoplay, isAutoplayEnabled)
        await handleQueueReplenishment(queue, track)

        try {
            await sendNowPlayingEmbed(queue, track, isAutoplay)
            await updateLastFmNowPlaying(queue, track)
            await voiceStatus.setTrackStatus(queue)
        } catch (error) {
            errorLog({ message: 'Error sending now playing message:', error })
        }

        await musicSessionSnapshotService.saveSnapshot(queue)
        musicWatchdogService.arm(queue)
    } catch (error) {
        errorLog({ message: 'Error in player start handler:', error })
    }
}

async function replenishIfAutoplay(
    queue: GuildQueue,
    finishedTrack?: Track,
): Promise<void> {
    if (isReplenishSuppressed(queue.guild.id)) {
        debugLog({
            message: 'Autoplay replenish suppressed after explicit stop/clear',
            data: { guildId: queue.guild.id },
        })
        return
    }
    const autoplayEnabled = await isAutoplayReplenishmentEnabled(queue)
    if (autoplayEnabled && queue.repeatMode === QueueRepeatMode.AUTOPLAY) {
        await replenishQueue(queue, finishedTrack)
    }
}

async function scrobbleAndRecord(
    queue: GuildQueue,
    track?: Track,
): Promise<void> {
    const trackToRecord = track ?? queue.currentTrack
    if (!trackToRecord) return
    await scrobbleCurrentTrackIfLastFm(queue, trackToRecord)
    await addTrackToHistory(trackToRecord, queue.guild.id)
}

const handlePlayerFinish = async (
    queue: GuildQueue,
    track?: Track,
): Promise<void> => {
    try {
        await scrobbleAndRecord(queue, track)

        if (track) {
            const startTime = guildTrackStartTimes.get(queue.guild.id)
            if (startTime && track.durationMS) {
                const completionRatio = (Date.now() - startTime) / track.durationMS
                if (completionRatio > 0.8) {
                    await recordImplicitTrackFeedback(track, 'implicit_like')
                }
            }
            guildTrackStartTimes.delete(queue.guild.id)
        }

        if (musicWatchdogService.isIntentionalStop(queue.guild.id)) return
        await replenishIfAutoplay(queue, track)
        await musicSessionSnapshotService.saveSnapshot(queue)

        if (queue.currentTrack || queue.tracks.size > 0) {
            musicWatchdogService.arm(queue)
        } else {
            await voiceStatus.clearStatus(queue)
            musicWatchdogService.clear(queue.guild.id)
        }
    } catch (error) {
        errorLog({ message: 'Error in playerFinish event:', error })
    }
}

const handlePlayerSkip = async (
    queue: GuildQueue,
    track?: Track,
): Promise<void> => {
    try {
        infoLog({
            message: 'Track skipped',
            data: {
                guildId: queue.guild.id,
                skippedTrack: track?.title ?? 'unknown',
                skippedUrl: track?.url ?? '',
                queueSizeAfter: queue.tracks.size,
                currentTrack: queue.currentTrack?.title ?? 'none',
            },
        })
        if (track) {
            await addTrackToHistory(track, queue.guild.id)
        }
        await scrobbleCurrentTrackIfLastFm(queue, track)

        if (track) {
            const startTime = guildTrackStartTimes.get(queue.guild.id)
            if (startTime && track.durationMS && track.durationMS > 20_000) {
                const skipRatio = (Date.now() - startTime) / track.durationMS
                if (skipRatio < 0.3) {
                    await recordImplicitTrackFeedback(track, 'implicit_dislike')
                }
            }
            guildTrackStartTimes.delete(queue.guild.id)
        }

        if (musicWatchdogService.isIntentionalStop(queue.guild.id)) return
        await replenishIfAutoplay(queue, track)
        await musicSessionSnapshotService.saveSnapshot(queue)

        if (queue.currentTrack || queue.tracks.size > 0) {
            musicWatchdogService.arm(queue)
        } else {
            await voiceStatus.clearStatus(queue)
            musicWatchdogService.clear(queue.guild.id)
        }
    } catch (error) {
        errorLog({ message: 'Error in playerSkip event:', error })
    }
}

async function isAutoplayReplenishmentEnabled(
    queue: GuildQueue,
    userId?: string,
): Promise<boolean> {
    return featureToggleService.isEnabled('AUTOPLAY', {
        guildId: queue.guild.id,
        userId,
    })
}
