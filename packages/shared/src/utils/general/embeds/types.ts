import type { ColorResolvable } from 'discord.js'

export type CreateEmbedOptions = {
    title?: string
    description?: string
    color?: ColorResolvable
    emoji?: string
    footer?: string
    thumbnail?: string
    url?: string
    fields?: EmbedField[]
    timestamp?: boolean
    author?: { name: string; iconURL?: string; url?: string }
}

export type EmbedField = {
    name: string
    value: string
    inline?: boolean
}

export type TrackInfo = {
    title: string
    author: string
    url: string
    thumbnail?: string
    duration?: string
    requestedBy?: string
    source?: string
}

export type QueueInfo = {
    currentTrack?: TrackInfo
    tracks: TrackInfo[]
    totalDuration?: string
    isLooping?: boolean
    isShuffled?: boolean
    autoplayEnabled?: boolean
}
