import { redisClient } from '../../config/redis'
import { debugLog, errorLog } from '../../utils/general/log'
import { TrackHistoryKeys } from './redisKeys'
import type { TrackHistoryEntry, TrackHistoryStats } from './types'

export class TrackAnalytics {
    async generateStats(guildId: string): Promise<TrackHistoryStats> {
        try {
            const historyKey = TrackHistoryKeys.getHistoryKey(guildId)
            const historyData = await redisClient.lrange(historyKey, 0, -1)

            const tracks: TrackHistoryEntry[] = historyData.map((entry) =>
                JSON.parse(entry) as TrackHistoryEntry,
            )
            const totalTracks = tracks.length

            // Count unique artists
            const uniqueArtists = new Set(tracks.map((track) => track.author))
            const uniqueArtistsCount = uniqueArtists.size

            // Find most played artist
            const artistCounts = new Map<string, number>()
            tracks.forEach((track) => {
                const count = artistCounts.get(track.author) || 0
                artistCounts.set(track.author, count + 1)
            })

            const mostPlayedArtist =
                Array.from(artistCounts.entries()).sort(
                    ([, a], [, b]) => b - a,
                )[0]?.[0] || 'Unknown'

            // Calculate average plays per day (last 7 days)
            const now = Date.now()
            const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
            const recentTracks = tracks.filter(
                (track) => track.timestamp > sevenDaysAgo,
            )
            const averagePlaysPerDay = recentTracks.length / 7

            const stats: TrackHistoryStats = {
                totalTracks,
                uniqueArtists: uniqueArtistsCount,
                mostPlayedArtist,
                averagePlaysPerDay: Math.round(averagePlaysPerDay * 100) / 100,
            }

            // Store stats for quick access
            const statsKey = TrackHistoryKeys.getStatsKey(guildId)
            await redisClient.setex(statsKey, 3600, JSON.stringify(stats)) // 1 hour TTL

            debugLog({ message: `Generated stats for guild ${guildId}` })
            return stats
        } catch (error) {
            errorLog({ message: 'Failed to generate stats', error })
            return {
                totalTracks: 0,
                uniqueArtists: 0,
                mostPlayedArtist: 'Unknown',
                averagePlaysPerDay: 0,
            }
        }
    }

    async getCachedStats(guildId: string): Promise<TrackHistoryStats | null> {
        try {
            const statsKey = TrackHistoryKeys.getStatsKey(guildId)
            const statsData = await redisClient.get(statsKey)

            return statsData ? JSON.parse(statsData) as TrackHistoryStats : null
        } catch (error) {
            errorLog({ message: 'Failed to get cached stats', error })
            return null
        }
    }

    async getTopArtists(
        guildId: string,
        limit = 10,
    ): Promise<{ artist: string; plays: number }[]> {
        try {
            const historyKey = TrackHistoryKeys.getHistoryKey(guildId)
            const historyData = await redisClient.lrange(historyKey, 0, -1)

            const tracks: TrackHistoryEntry[] = historyData.map((entry) =>
                JSON.parse(entry) as TrackHistoryEntry,
            )
            const artistCounts = new Map<string, number>()

            tracks.forEach((track) => {
                const count = artistCounts.get(track.author) || 0
                artistCounts.set(track.author, count + 1)
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

    async clearGuildCache(guildId: string): Promise<void> {
        try {
            const statsKey = TrackHistoryKeys.getStatsKey(guildId)
            await redisClient.del(statsKey)
        } catch (error) {
            errorLog({ message: 'Failed to clear guild cache', error })
        }
    }
}
