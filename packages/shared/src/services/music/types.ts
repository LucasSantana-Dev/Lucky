export type MusicCommandType =
    | 'play'
    | 'pause'
    | 'resume'
    | 'skip'
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

export type RepeatMode = 'off' | 'track' | 'queue' | 'autoplay'

export interface MusicCommand {
    id: string
    guildId: string
    userId: string
    type: MusicCommandType
    data?: Record<string, unknown>
    timestamp: number
}

export interface TrackInfo {
    id: string
    title: string
    author: string
    url: string
    thumbnail?: string
    duration: number
    durationFormatted: string
    requestedBy?: string
    source: 'youtube' | 'spotify' | 'soundcloud' | 'deezer' | 'unknown'
}

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
