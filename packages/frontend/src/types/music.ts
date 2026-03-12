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
}

export interface QueueState {
    guildId: string
    currentTrack: TrackInfo | null
    tracks: TrackInfo[]
    isPlaying: boolean
    isPaused: boolean
    volume: number
    repeatMode: 'off' | 'track' | 'queue' | 'autoplay'
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
