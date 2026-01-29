/**
 * Play command types and interfaces
 */

import type { Track, Player, GuildQueue } from 'discord-player'
import type { GuildMember } from 'discord.js'

export type PlayCommandOptions = {
    query: string
    user: GuildMember
    guildId: string
    channelId: string
    player: Player
    queue: GuildQueue
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
