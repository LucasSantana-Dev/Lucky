import type { Track } from 'discord-player'
import type { User } from 'discord.js'

export type TrackManagementOptions = {
    maxQueueSize?: number
    allowDuplicates?: boolean
    duplicateThreshold?: number
    autoShuffle?: boolean
    priorityWeight?: number
}

export type TrackManagementResult = {
    success: boolean
    tracksAdded: number
    tracksSkipped: number
    message?: string
    error?: string
}

export type QueueState = {
    isPlaying: boolean
    isPaused: boolean
    currentTrack?: Track
    queueSize: number
    repeatMode: string
    volume: number
    position: number
    duration: number
}

export type TrackValidationResult = {
    isValid: boolean
    reason?: string
    score?: number
}

export type QueueOperationResult = {
    success: boolean
    tracksProcessed: number
    tracksAdded: number
    tracksSkipped: number
    message?: string
    error?: string
}

export type TrackPriority = {
    track: Track
    priority: number
    reason: string
}

export type QueueManagementOptions = {
    playNext: boolean
    requester: User
    maxTracks?: number
    skipDuplicates?: boolean
    autoShuffle?: boolean
}
