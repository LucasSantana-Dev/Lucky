/**
 * Play command types and interfaces
 */

import type { Track } from 'discord-player'
import type { GuildMember } from 'discord.js'

export type PlayCommandOptions = {
    query: string
    user: GuildMember
    guildId: string
    channelId: string
}

export type PlayCommandResult = {
    success: boolean
    tracks?: Track[]
    error?: string
    isPlaylist?: boolean
}

export type QueryType = 'youtube' | 'spotify' | 'search' | 'url'

export type PlayCommandState = {
    isProcessing: boolean
    currentQuery?: string
    startTime?: number
}
