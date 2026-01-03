// Removed unused imports

export type QueueDisplayOptions = {
    showCurrentTrack: boolean
    showUpcomingTracks: boolean
    maxTracksToShow: number
    showTotalDuration: boolean
    showQueueStats: boolean
}

export const defaultQueueOptions: QueueDisplayOptions = {
    showCurrentTrack: true,
    showUpcomingTracks: true,
    maxTracksToShow: 10,
    showTotalDuration: true,
    showQueueStats: true,
}

export type QueueStats = {
    totalTracks: number
    totalDuration: string
    currentPosition: number
    isLooping: boolean
    isShuffled: boolean
    autoplayEnabled: boolean
}

export type TrackDisplayInfo = {
    title: string
    author: string
    url: string
    duration: string
    thumbnail?: string
    requestedBy?: string
    position: number
}
