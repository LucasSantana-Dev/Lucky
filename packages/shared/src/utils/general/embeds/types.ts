import type { ColorResolvable } from 'discord.js'

/** Options for creating a Discord embed. */
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

/** Embed field (name-value pair). */
export type EmbedField = {
    name: string
    value: string
    inline?: boolean
}

/** Track information for display. */
export type TrackInfo = {
    title: string
    author: string
    url: string
    thumbnail?: string
    duration?: string
    requestedBy?: string
    source?: string
}

/** Queue information for display. */
export type QueueInfo = {
    currentTrack?: TrackInfo
    tracks: TrackInfo[]
    totalDuration?: string
    isLooping?: boolean
    isShuffled?: boolean
    autoplayEnabled?: boolean
}
