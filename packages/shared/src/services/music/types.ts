/** Music command types supported by the queue. */
export type MusicCommandType =
    | 'play'
    | 'pause'
    | 'resume'
    | 'skip'
    | 'previous'
    | 'stop'
    | 'volume'
    | 'shuffle'
    | 'repeat'
    | 'queue_move'
    | 'queue_remove'
    | 'queue_clear'
    | 'import_playlist'
    | 'seek'
    | 'get_state'

/** Repeat mode for playback. */
export type RepeatMode = 'off' | 'track' | 'queue' | 'autoplay'

/** Music command issued by a user. */
export interface MusicCommand {
    id: string
    guildId: string
    userId: string
    type: MusicCommandType
    data?: Record<string, unknown>
    timestamp: number
}

/** Information about a playable track. */
export interface TrackInfo {
    id: string
    title: string
    author: string
    url: string
    thumbnail?: string
    duration: number
    durationFormatted: string
    requestedBy?: string
    source: 'youtube' | 'spotify' | 'soundcloud' | 'unknown'
    recommendationReason?: string
    recommendationFeedback?: 'like' | 'dislike'
    sessionSnapshotId?: string
}

/** Health state of a music provider. */
export interface ProviderHealthState {
    provider: string
    score: number
    consecutiveFailures: number
    cooldownUntil: number | null
}

/** Current state of the music queue. */
export interface QueueState {
    guildId: string
    currentTrack: TrackInfo | null
    tracks: TrackInfo[]
    isPlaying: boolean
    isPaused: boolean
    volume: number
    repeatMode: RepeatMode
    shuffled: boolean
    position: number
    voiceChannelId: string | null
    voiceChannelName: string | null
    providerHealth?: ProviderHealthState[]
    lastRecoveryAction?: string
    sessionSnapshotId?: string
    timestamp: number
}

export interface MusicCommandResult {
    id: string
    guildId: string
    success: boolean
    error?: string
    data?: Record<string, unknown>
    timestamp: number
}

export interface ImportPlaylistResult {
    success: boolean
    tracksAdded: number
    playlistName?: string
    source: string
    error?: string
}

export interface PendingResult {
    resolve: (result: MusicCommandResult) => void
    timeout: ReturnType<typeof setTimeout>
}

export const CHANNEL_COMMAND = 'music:command'
export const CHANNEL_STATE = 'music:state'
export const CHANNEL_RESULT = 'music:result'
export const STATE_KEY_PREFIX = 'music:state:'
export const STATE_TTL = 300
