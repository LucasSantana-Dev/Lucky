/**
 * Track utilities types and interfaces
 */

import type { Track } from 'discord-player'

export type TrackInfo = {
    title: string
    duration: string
    requester: string
    isAutoplay: boolean
}

export type TrackCacheKey = {
    id: string
    title: string
    duration: string | number
    requesterId?: string
}

export type TrackCategories = {
    manualTracks: Track[]
    autoplayTracks: Track[]
}

export type TrackCacheOptions = {
    maxSize: number
    ttl: number
}

export type TrackSearchOptions = {
    query: string
    limit: number
    includeAutoplay: boolean
}
