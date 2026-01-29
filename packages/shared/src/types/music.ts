/**
 * Music and track type definitions
 */

import type { DiscordChannel } from './discord'

export interface TrackMetadata {
    isAutoplay?: boolean
    source?: string
    engine?: string
}

export interface TrackTimestamp {
    current: number | { value: number }
}

export interface TrackNode {
    isPlaying: () => boolean
    isPaused: () => boolean
    getTimestamp: () => { current: number | { value: number } } | null
    volume: number
}

export interface TrackQueue {
    tracks: {
        size: number
    }
    currentTrack?: {
        title: string
        author: string
        duration: string
        thumbnail?: string
        url: string
        requestedBy?: {
            id: string
            username: string
            toString: () => string
        }
    }
    node: TrackNode
    guild: {
        id: string
        name: string
    }
    metadata: {
        channel?: DiscordChannel
    }
}

export interface TrackSearchResult {
    tracks: unknown[]
    playlist?: unknown
}

export interface TrackSearchOptions {
    type?: string
    maxRetries?: number
    enableFallbacks?: boolean
    preferredEngine?: string
}

export interface TrackLike {
    title: string
    author: string
    duration: string
    url: string
}
