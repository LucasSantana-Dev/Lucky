import type { Track, GuildQueue } from 'discord-player'
import type { ColorResolvable } from 'discord.js'
import { infoLog, debugLog } from '../../utils/general/log'
import { addTrackToHistory } from '../../utils/music/duplicateDetection'
import { replenishQueue } from '../../utils/music/trackManagement/queueOperations'
import { createEmbed, EMBED_COLORS } from '../../utils/general/embeds'
import {
    getAutoplayCount,
    resetAutoplayCount,
} from '../../utils/music/autoplayManager'

export const lastPlayedTracks = new Map<string, Track>()

export type TrackHistoryEntry = {
    url: string
    title: string
    author: string
    thumbnail?: string
    timestamp: number
}

export const recentlyPlayedTracks = new Map<string, TrackHistoryEntry[]>()

const songInfoMessages = new Map<
    string,
    { messageId: string; channelId: string }
>()

type PlayerEvents = {
    events: {
        on: (event: string, handler: Function) => void
    }
}

export const setupTrackHandlers = (player: PlayerEvents): void => {
    player.events.on('playerStart', async (queue: GuildQueue, track: Track) => {
        await handlePlayerStart(queue, track)
    })

    player.events.on('playerFinish', async (queue: GuildQueue) => {
        await handlePlayerFinish(queue)
    })

    player.events.on('playerSkip', async (queue: GuildQueue) => {
        await handlePlayerSkip(queue)
    })

    player.events.on('audioTracksAdd', (queue: GuildQueue, tracks: Track[]) => {
        handleAudioTracksAdd(queue, tracks)
    })
}

const handlePlayerStart = async (
    queue: GuildQueue,
    track: Track,
): Promise<void> => {
    try {
        infoLog({
            message: `Started playing "${track.title}" in ${queue.guild.name}`,
        })

        if ((queue.metadata as { channel?: { send: (options: { embeds: unknown[] }) => Promise<{ id: string }>; id: string } })?.channel) {
            const { channel } = queue.metadata as { channel: { send: (options: { embeds: unknown[] }) => Promise<{ id: string }>; id: string } }
            const embed = createEmbed({
                title: '🎵 Now Playing',
                description: `**${track.title}**\nby ${track.author}`,
                color: EMBED_COLORS.SUCCESS as ColorResolvable,
                thumbnail: track.thumbnail,
                fields: [
                    {
                        name: 'Duration',
                        value: track.duration,
                        inline: true,
                    },
                    {
                        name: 'Requested by',
                        value: track.requestedBy?.toString() ?? 'Unknown',
                        inline: true,
                    },
                ],
            })

            const message = await channel.send({ embeds: [embed] })

            songInfoMessages.set(queue.guild.id, {
                messageId: message.id,
                channelId: channel.id,
            })
        }
    } catch (error) {
        debugLog({ message: 'Error in player start handler:', error })
    }
}

const handlePlayerFinish = async (queue: GuildQueue): Promise<void> => {
    try {
        if (queue.currentTrack) {
            lastPlayedTracks.set(queue.guild.id, queue.currentTrack)

            const trackEntry: TrackHistoryEntry = {
                url: queue.currentTrack.url,
                title: queue.currentTrack.title,
                author: queue.currentTrack.author,
                thumbnail: queue.currentTrack.thumbnail,
                timestamp: Date.now(),
            }

            const guildHistory = recentlyPlayedTracks.get(queue.guild.id) ?? []
            guildHistory.push(trackEntry)

            if (guildHistory.length > 50) {
                guildHistory.shift()
            }

            recentlyPlayedTracks.set(queue.guild.id, guildHistory)

            // Add track to history with error handling to prevent recursion
            try {
                await addTrackToHistory(queue.currentTrack, queue.guild.id)
            } catch (historyError) {
                debugLog({ message: 'Error adding track to history:', error: historyError })
            }
        }

        // Replenish queue with error handling to prevent recursion
        try {
            await replenishQueue(queue)
        } catch (replenishError) {
            debugLog({ message: 'Error replenishing queue:', error: replenishError })
        }
    } catch (error) {
        debugLog({ message: 'Error in player finish handler:', error })
    }
}

const handlePlayerSkip = async (queue: GuildQueue): Promise<void> => {
    try {
        debugLog({ message: 'Track skipped, checking queue...' })

        if (queue.tracks.size === 0) {
            const autoplayCount = await getAutoplayCount(queue.guild.id)
            if (autoplayCount > 0) {
                await resetAutoplayCount(queue.guild.id)
            }
        }
    } catch (error) {
        debugLog({ message: 'Error in player skip handler:', error })
    }
}

const handleAudioTracksAdd = (queue: GuildQueue, tracks: Track[]): void => {
    if (Array.isArray(tracks) && tracks.length > 0) {
        debugLog({
            message: `Added ${tracks.length} tracks to queue in ${queue.guild.name}`,
        })
    }
}
