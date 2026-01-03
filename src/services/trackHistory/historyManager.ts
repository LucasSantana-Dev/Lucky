import type { Track } from 'discord-player'
import { redisClient } from '../../config/redis'
import { debugLog, errorLog } from '../../utils/general/log'
import { TrackHistoryKeys } from './redisKeys'
import type { TrackHistoryEntry, TrackHistoryConfig } from './types'

export class HistoryManager {
    constructor(private readonly config: TrackHistoryConfig) {}

    async addTrackToHistory(track: Track, guildId: string): Promise<void> {
        try {
            const historyKey = TrackHistoryKeys.getHistoryKey(guildId)
            const trackIdsKey = TrackHistoryKeys.getTrackIdsKey(guildId)
            const lastTrackKey = TrackHistoryKeys.getLastTrackKey(guildId)

            // Create history entry
            const historyEntry: TrackHistoryEntry = {
                url: track.url,
                title: track.title,
                author: track.author,
                thumbnail: track.thumbnail,
                timestamp: Date.now(),
                id: track.id,
            }

            // Add to history list (most recent first)
            await redisClient.lpush(historyKey, JSON.stringify(historyEntry))
            await redisClient.expire(historyKey, this.config.trackHistoryTtl)

            // Add track ID to set for quick lookup
            if (track.id) {
                await redisClient.sadd(trackIdsKey, track.id)
                await redisClient.expire(
                    trackIdsKey,
                    this.config.trackHistoryTtl,
                )
            }

            // Update last track
            await redisClient.setex(
                lastTrackKey,
                this.config.trackHistoryTtl,
                JSON.stringify(historyEntry),
            )

            // Trim history to max size
            await this.trimHistory(historyKey)

            debugLog({
                message: `Added track to history: ${track.title} in guild ${guildId}`,
            })
        } catch (error) {
            errorLog({ message: 'Failed to add track to history', error })
            throw error
        }
    }

    async getTrackHistory(
        guildId: string,
        limit = 10,
    ): Promise<TrackHistoryEntry[]> {
        try {
            const historyKey = TrackHistoryKeys.getHistoryKey(guildId)
            const historyData = await redisClient.lrange(
                historyKey,
                0,
                limit - 1,
            )

            return historyData.map((entry) => JSON.parse(entry) as TrackHistoryEntry)
        } catch (error) {
            errorLog({ message: 'Failed to get track history', error })
            return []
        }
    }

    async getLastTrack(guildId: string): Promise<TrackHistoryEntry | null> {
        try {
            const lastTrackKey = TrackHistoryKeys.getLastTrackKey(guildId)
            const lastTrackData = await redisClient.get(lastTrackKey)

            return lastTrackData ? JSON.parse(lastTrackData) as TrackHistoryEntry : null
        } catch (error) {
            errorLog({ message: 'Failed to get last track', error })
            return null
        }
    }

    async clearHistory(guildId: string): Promise<void> {
        try {
            const historyKey = TrackHistoryKeys.getHistoryKey(guildId)
            const trackIdsKey = TrackHistoryKeys.getTrackIdsKey(guildId)
            const lastTrackKey = TrackHistoryKeys.getLastTrackKey(guildId)

            await Promise.all([
                redisClient.del(historyKey),
                redisClient.del(trackIdsKey),
                redisClient.del(lastTrackKey),
            ])

            debugLog({ message: `Cleared track history for guild ${guildId}` })
        } catch (error) {
            errorLog({ message: 'Failed to clear track history', error })
            throw error
        }
    }

    private async trimHistory(historyKey: string): Promise<void> {
        try {
            const currentLength = await redisClient.llen(historyKey)
            if (currentLength > this.config.maxHistorySize) {
                await redisClient.ltrim(
                    historyKey,
                    0,
                    this.config.maxHistorySize - 1,
                )
            }
        } catch (error) {
            errorLog({ message: 'Failed to trim history', error })
        }
    }
}
