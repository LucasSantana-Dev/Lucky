import { redisClient } from './redis'
import { infoLog, errorLog } from '../utils/general/log'

/** A track entry in guild playback history. */
export interface TrackHistoryEntry {
    trackId: string
    title: string
    author: string
    duration: string
    url: string
    timestamp: number
    guildId: string
    playedBy?: string
    isAutoplay?: boolean
}

/** Input data for adding a track to history. */
export interface TrackHistoryInput {
    id: string
    title: string
    author: string
    duration: string
    url: string
    metadata?: { isAutoplay?: boolean }
}

/** Statistics for guild track playback history. */
export interface TrackHistoryStats {
    totalTracks: number
    totalPlayTime: number
    topArtists: Array<{ artist: string; plays: number }>
    topTracks: Array<{ trackId: string; title: string; plays: number }>
    lastUpdated: Date
}

/** Manages track playback history stored in Redis for guilds. */
export class TrackHistoryService {
    private readonly ttl: number
    private readonly maxHistorySize: number

    constructor(ttl = 7 * 24 * 60 * 60, maxHistorySize = 100) {
        this.ttl = ttl
        this.maxHistorySize = maxHistorySize
    }

    /** Generates Redis key for track history storage. */
    private getRedisKey(guildId: string, trackId?: string): string {
        return trackId
            ? `track_history:${guildId}:${trackId}`
            : `track_history:${guildId}`
    }

    /** Adds a track to a guild's playback history. */
    async addTrackToHistory(
        track: TrackHistoryInput,
        guildId: string,
        playedBy?: string,
    ): Promise<boolean> {
        try {
            const entry: TrackHistoryEntry = {
                trackId: track.id,
                title: track.title,
                author: track.author,
                duration: track.duration,
                url: track.url,
                timestamp: Date.now(),
                guildId,
                playedBy,
                isAutoplay: Boolean(track.metadata?.isAutoplay ?? false),
            }

            await redisClient.setex(
                this.getRedisKey(guildId, track.id),
                this.ttl,
                JSON.stringify(entry),
            )

            await redisClient.lpush(
                this.getRedisKey(guildId),
                JSON.stringify(entry),
            )
            await redisClient.ltrim(
                this.getRedisKey(guildId),
                0,
                this.maxHistorySize - 1,
            )
            await redisClient.expire(this.getRedisKey(guildId), this.ttl)

            infoLog({
                message: `Added track to history: ${track.title} in guild ${guildId}`,
            })
            return true
        } catch (error) {
            errorLog({ message: 'Failed to add track to history', error })
            return false
        }
    }

    /** Retrieves track history for a guild with pagination. */
    async getTrackHistory(
        guildId: string,
        limit = 10,
        offset = 0,
    ): Promise<TrackHistoryEntry[]> {
        try {
            const start = offset
            const end = offset + limit - 1
            const historyData = await redisClient.lrange(
                this.getRedisKey(guildId),
                start,
                end,
            )
            return historyData.map(
                (data) => JSON.parse(data) as TrackHistoryEntry,
            )
        } catch (error) {
            errorLog({ message: 'Failed to get track history', error })
            return []
        }
    }

    /** Retrieves the most recently played track for a guild. */
    async getLastTrack(guildId: string): Promise<TrackHistoryEntry | null> {
        try {
            const lastTrackData = await redisClient.lindex(
                this.getRedisKey(guildId),
                0,
            )
            return lastTrackData
                ? (JSON.parse(lastTrackData) as TrackHistoryEntry)
                : null
        } catch (error) {
            errorLog({ message: 'Failed to get last track', error })
            return null
        }
    }

    /** Gets the total count of tracks in a guild's history. */
    async getTrackHistoryCount(guildId: string): Promise<number> {
        try {
            return await redisClient.llen(this.getRedisKey(guildId))
        } catch (error) {
            errorLog({ message: 'Failed to get track history count', error })
            return 0
        }
    }

    /** Clears all track history for a guild. */
    async clearHistory(guildId: string): Promise<boolean> {
        try {
            await redisClient.del(this.getRedisKey(guildId))
            infoLog({ message: `Cleared track history for guild ${guildId}` })
            return true
        } catch (error) {
            errorLog({ message: 'Failed to clear track history', error })
            return false
        }
    }

    /** Checks if a track was recently played within a time window. */
    async isDuplicateTrack(
        guildId: string,
        trackUrl: string,
        _timeWindow = 300000,
    ): Promise<boolean> {
        try {
            const history = await this.getTrackHistory(guildId, 20)
            const cutoffTime = Date.now() - _timeWindow

            return history.some(
                (entry) =>
                    entry.url === trackUrl && entry.timestamp > cutoffTime,
            )
        } catch (error) {
            errorLog({ message: 'Failed to check for duplicate track', error })
            return false
        }
    }

    /** Retrieves top played tracks for a guild. */
    async getTopTracks(
        guildId: string,
        limit = 10,
    ): Promise<Array<{ trackId: string; title: string; plays: number }>> {
        try {
            const history = await this.getTrackHistory(guildId, 100)
            const trackCounts = new Map<
                string,
                { title: string; count: number }
            >()

            history.forEach((entry) => {
                const current = trackCounts.get(entry.trackId) || {
                    title: entry.title,
                    count: 0,
                }
                trackCounts.set(entry.trackId, {
                    ...current,
                    count: current.count + 1,
                })
            })

            return Array.from(trackCounts.entries())
                .map(([trackId, data]) => ({
                    trackId,
                    title: data.title,
                    plays: data.count,
                }))
                .sort((a, b) => b.plays - a.plays)
                .slice(0, limit)
        } catch (error) {
            errorLog({ message: 'Failed to get top tracks', error })
            return []
        }
    }

    /** Retrieves top artists by play count for a guild. */
    async getTopArtists(
        guildId: string,
        limit = 10,
    ): Promise<Array<{ artist: string; plays: number }>> {
        try {
            const history = await this.getTrackHistory(guildId, 100)
            const artistCounts = new Map<string, number>()

            history.forEach((entry) => {
                const current = artistCounts.get(entry.author) || 0
                artistCounts.set(entry.author, current + 1)
            })

            return Array.from(artistCounts.entries())
                .map(([artist, plays]) => ({ artist, plays }))
                .sort((a, b) => b.plays - a.plays)
                .slice(0, limit)
        } catch (error) {
            errorLog({ message: 'Failed to get top artists', error })
            return []
        }
    }

    /** Generates comprehensive playback statistics for a guild. */
    async generateStats(guildId: string): Promise<TrackHistoryStats | null> {
        try {
            const history = await this.getTrackHistory(guildId, 100)

            if (history.length === 0) {
                return null
            }

            const totalTracks = history.length
            const totalPlayTime = history.reduce((total, entry) => {
                const duration = this.parseDuration(entry.duration)
                return total + duration
            }, 0)

            const topArtists = await this.getTopArtists(guildId, 5)
            const topTracks = await this.getTopTracks(guildId, 5)

            return {
                totalTracks,
                totalPlayTime,
                topArtists,
                topTracks,
                lastUpdated: new Date(),
            }
        } catch (error) {
            errorLog({ message: 'Failed to generate stats', error })
            return null
        }
    }

    /** Parses duration string (MM:SS format) to seconds. */
    private parseDuration(duration: string): number {
        const parts = duration.split(':')
        if (parts.length === 2) {
            return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
        }
        return 0
    }

    /** Cleans up expired track history data. */
    async cleanupOldData(): Promise<number> {
        return 0
    }

    /** Marks a track as played for duplicate detection. */
    async markTrackAsPlayed(guildId: string, trackUrl: string): Promise<void> {
        try {
            const key = this.getRedisKey(guildId, `played:${trackUrl}`)
            await redisClient.setex(key, 300, Date.now().toString())
        } catch (error) {
            errorLog({ message: 'Failed to mark track as played', error })
        }
    }

    /** Clears all cached track data for a guild. */
    async clearAllGuildCaches(guildId: string): Promise<void> {
        try {
            const pattern = this.getRedisKey(guildId, '*')
            const keys = await redisClient.keys(pattern)
            if (keys.length > 0) {
                for (const key of keys) {
                    await redisClient.del(key)
                }
            }
        } catch (error) {
            errorLog({ message: 'Failed to clear guild caches', error })
        }
    }

    /** Generates statistics on autoplay recommendations for a guild. */
    async getAutoplayStats(
        guildId: string,
        limit = 200,
    ): Promise<{
        total: number
        autoplayCount: number
        autoplayPercent: number
        topAutoplayArtists: Array<{ artist: string; count: number }>
    }> {
        try {
            const history = await this.getTrackHistory(guildId, limit)
            const autoplayEntries = history.filter((e) => e.isAutoplay === true)
            const artistCounts = new Map<string, number>()

            for (const entry of autoplayEntries) {
                if (entry.author) {
                    const key = entry.author.toLowerCase()
                    artistCounts.set(key, (artistCounts.get(key) ?? 0) + 1)
                }
            }

            const topAutoplayArtists = Array.from(artistCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([artist, count]) => ({ artist, count }))

            return {
                total: history.length,
                autoplayCount: autoplayEntries.length,
                autoplayPercent:
                    history.length > 0
                        ? Math.round(
                              (autoplayEntries.length / history.length) * 100,
                          )
                        : 0,
                topAutoplayArtists,
            }
        } catch (error) {
            errorLog({ message: 'Failed to get autoplay stats', error })
            return {
                total: 0,
                autoplayCount: 0,
                autoplayPercent: 0,
                topAutoplayArtists: [],
            }
        }
    }
}

/** Singleton instance of TrackHistoryService. */
export const trackHistoryService = new TrackHistoryService()
