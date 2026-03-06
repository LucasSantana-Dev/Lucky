import type { Track, GuildQueue } from 'discord-player'
import { infoLog, debugLog, errorLog } from '@lukbot/shared/utils'
import { addTrackToHistory } from '../../utils/music/duplicateDetection'
import { replenishQueue } from '../../utils/music/trackManagement/queueOperations'
import { resetAutoplayCount } from '../../utils/music/autoplayManager'
import { featureToggleService } from "@lukbot/shared/services"
import { constants } from '@lukbot/shared/config'
import { sendNowPlayingEmbed, updateLastFmNowPlaying, scrobbleCurrentTrackIfLastFm } from './trackNowPlaying'

export const lastPlayedTracks = new Map<string, Track>()

export type TrackHistoryEntry = {
    url: string
    title: string
    author: string
    thumbnail?: string
    timestamp: number
}

export const recentlyPlayedTracks = new Map<string, TrackHistoryEntry[]>()

type PlayerEvents = { events: { on: (event: string, handler: Function) => void } }
type SetupTrackHandlersParams = { player: PlayerEvents; client: { user?: { id: string } | null } }

export const setupTrackHandlers = ({ player, client }: SetupTrackHandlersParams): void => {
    player.events.on('playerStart', async (queue: GuildQueue, track: Track) => {
        await handlePlayerStart(queue, track, client)
    })
    player.events.on('playerFinish', async (queue: GuildQueue) => { await handlePlayerFinish(queue) })
    player.events.on('playerSkip', async (queue: GuildQueue) => { await handlePlayerSkip(queue) })
    player.events.on('audioTracksAdd', (queue: GuildQueue, tracks: Track[]) => {
        if (Array.isArray(tracks) && tracks.length > 0) {
            infoLog({ message: `Added "${tracks[0].title}" to queue in ${queue.guild.name}` })
        }
    })
}

function handleAutoplayCounter(queue: GuildQueue, isAutoplay: boolean, isAutoplayEnabled: boolean): void {
    if (!isAutoplay && !isAutoplayEnabled) {
        resetAutoplayCount(queue.guild.id)
        debugLog({ message: `Reset autoplay counter for guild ${queue.guild.id} - manual track played and autoplay disabled` })
    } else if (!isAutoplay && isAutoplayEnabled) {
        debugLog({ message: `Manual track played but autoplay is enabled - keeping autoplay counter for radio experience` })
    }
}

async function handleQueueReplenishment(queue: GuildQueue, track: Track): Promise<void> {
    const autoplayEnabled = await featureToggleService.isEnabled('AUTOPLAY', {
        guildId: queue.guild.id, userId: track.requestedBy?.id,
    })
    if (autoplayEnabled) {
        try {
            await replenishQueue(queue)
            debugLog({ message: 'Queue replenished after track start', data: { trackTitle: track.title, guildId: queue.guild.id, queueSize: queue.tracks.size } })
        } catch (error) {
            errorLog({ message: 'Error replenishing queue after track start:', error })
        }
    } else {
        debugLog({ message: 'Autoplay feature disabled, skipping queue replenishment' })
    }
}

const handlePlayerStart = async (
    queue: GuildQueue, track: Track, client: { user?: { id: string } | null },
): Promise<void> => {
    try {
        infoLog({ message: `Started playing "${track.title}" in ${queue.guild.name}` })
        debugLog({ message: `Track URL: ${track.url}` })
        if (queue.node.volume !== constants.VOLUME) queue.node.setVolume(constants.VOLUME)

        const isAutoplay = track.requestedBy?.id === client.user?.id
        const isAutoplayEnabled = queue.repeatMode === 3
        handleAutoplayCounter(queue, isAutoplay, isAutoplayEnabled)
        await handleQueueReplenishment(queue, track)

        try {
            await sendNowPlayingEmbed(queue, track, isAutoplay)
            await updateLastFmNowPlaying(queue, track)
        } catch (error) {
            errorLog({ message: 'Error sending now playing message:', error })
        }
    } catch (error) {
        errorLog({ message: 'Error in player start handler:', error })
    }
}

async function replenishIfAutoplay(queue: GuildQueue): Promise<void> {
    const autoplayEnabled = await featureToggleService.isEnabled('AUTOPLAY', { guildId: queue.guild.id })
    if (autoplayEnabled) await replenishQueue(queue)
}

const handlePlayerFinish = async (queue: GuildQueue): Promise<void> => {
    try {
        if (queue.currentTrack) {
            await scrobbleCurrentTrackIfLastFm(queue)
            addTrackToHistory(queue.currentTrack, queue.guild.id)
        }
        await replenishIfAutoplay(queue)
    } catch (error) {
        errorLog({ message: 'Error in playerFinish event:', error })
    }
}

const handlePlayerSkip = async (queue: GuildQueue): Promise<void> => {
    try {
        debugLog({ message: 'Track skipped, checking queue...' })
        if (queue.currentTrack) {
            await scrobbleCurrentTrackIfLastFm(queue)
            addTrackToHistory(queue.currentTrack, queue.guild.id)
        }
        await replenishIfAutoplay(queue)
    } catch (error) {
        errorLog({ message: 'Error in playerSkip event:', error })
    }
}
