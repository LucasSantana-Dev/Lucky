export type TrackHistoryEntry = {
    url: string
    title: string
    author: string
    thumbnail?: string
    timestamp: number
    id?: string
}

export type TrackMetadata = {
    artist: string
    genre?: string
    tags: string[]
    views: number
}

export type TrackHistoryConfig = {
    maxHistorySize: number
    trackHistoryTtl: number
    metadataTtl: number
}

export type TrackHistoryStats = {
    totalTracks: number
    uniqueArtists: number
    mostPlayedArtist: string
    averagePlaysPerDay: number
}
