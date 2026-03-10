import { QueueRepeatMode } from 'discord-player'
import type {
    MusicTrackInfo as TrackInfo,
    QueueState,
} from '@lucky/shared/services'
import type { CustomClient } from '../../types'

interface RawTrack {
    id: string
    title: string
    author: string
    url: string
    thumbnail?: string
    duration: { toString: () => string }
    durationMS: number
    requestedBy?: { username?: string } | null
    source?: string
}

const KNOWN_SOURCES = ['youtube', 'spotify', 'soundcloud', 'deezer']

export function mapTrack(track: RawTrack): TrackInfo {
    return {
        id: track.id,
        title: track.title,
        author: track.author,
        url: track.url,
        thumbnail: track.thumbnail,
        duration: track.durationMS,
        durationFormatted: track.duration.toString(),
        requestedBy: track.requestedBy?.username,
        source: (KNOWN_SOURCES.includes(track.source ?? '')
            ? track.source
            : 'unknown') as TrackInfo['source'],
    }
}

export function repeatModeToString(
    mode: QueueRepeatMode,
): 'off' | 'track' | 'queue' | 'autoplay' {
    switch (mode) {
        case QueueRepeatMode.TRACK:
            return 'track'
        case QueueRepeatMode.QUEUE:
            return 'queue'
        case QueueRepeatMode.AUTOPLAY:
            return 'autoplay'
        default:
            return 'off'
    }
}

export function repeatModeToEnum(mode: string): QueueRepeatMode {
    switch (mode) {
        case 'track':
            return QueueRepeatMode.TRACK
        case 'queue':
            return QueueRepeatMode.QUEUE
        case 'autoplay':
            return QueueRepeatMode.AUTOPLAY
        default:
            return QueueRepeatMode.OFF
    }
}

export async function buildQueueState(
    client: CustomClient,
    guildId: string,
): Promise<QueueState> {
    const queue = client.player.queues.get(guildId)

    if (!queue) {
        return emptyQueueState(guildId)
    }

    return {
        guildId,
        currentTrack: queue.currentTrack
            ? mapTrack(queue.currentTrack as unknown as RawTrack)
            : null,
        tracks: queue.tracks
            .toArray()
            .map((t: unknown) => mapTrack(t as RawTrack)),
        isPlaying: queue.node.isPlaying(),
        isPaused: queue.node.isPaused(),
        volume: queue.node.volume,
        repeatMode: repeatModeToString(queue.repeatMode),
        shuffled: false,
        position: queue.node.streamTime ?? 0,
        voiceChannelId: queue.channel?.id ?? null,
        voiceChannelName: queue.channel?.name ?? null,
        timestamp: Date.now(),
    }
}

function emptyQueueState(guildId: string): QueueState {
    return {
        guildId,
        currentTrack: null,
        tracks: [],
        isPlaying: false,
        isPaused: false,
        volume: 50,
        repeatMode: 'off',
        shuffled: false,
        position: 0,
        voiceChannelId: null,
        voiceChannelName: null,
        timestamp: Date.now(),
    }
}
