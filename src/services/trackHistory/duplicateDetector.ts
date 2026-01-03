import { redisClient } from '../../config/redis'
import { debugLog, errorLog } from '../../utils/general/log'
import { TrackHistoryKeys } from './redisKeys'
import type { TrackHistoryEntry } from './types'

export class DuplicateDetector {
    async isDuplicateTrack(
        guildId: string,
        trackUrl: string,
        timeWindow = 300000,
    ): Promise<boolean> {
        try {
            const duplicateKey = TrackHistoryKeys.getDuplicateKey(
                guildId,
                trackUrl,
            )
            const lastPlayed = await redisClient.get(duplicateKey)

            if (lastPlayed) {
                const lastPlayedTime = parseInt(lastPlayed)
                const now = Date.now()
                return now - lastPlayedTime < timeWindow
            }

            return false
        } catch (error) {
            errorLog({ message: 'Failed to check duplicate track', error })
            return false
        }
    }

    async markTrackAsPlayed(guildId: string, trackUrl: string): Promise<void> {
        try {
            const duplicateKey = TrackHistoryKeys.getDuplicateKey(
                guildId,
                trackUrl,
            )
            await redisClient.setex(duplicateKey, 3600, Date.now().toString()) // 1 hour TTL

            debugLog({
                message: `Marked track as played: ${trackUrl} in guild ${guildId}`,
            })
        } catch (error) {
            errorLog({ message: 'Failed to mark track as played', error })
        }
    }

    async findSimilarTracks(
        guildId: string,
        trackTitle: string,
        limit = 5,
    ): Promise<TrackHistoryEntry[]> {
        try {
            const historyKey = TrackHistoryKeys.getHistoryKey(guildId)
            const historyData = await redisClient.lrange(historyKey, 0, 49) // Get last 50 tracks

            const similarTracks: TrackHistoryEntry[] = []
            const searchTerms = trackTitle.toLowerCase().split(' ')

            for (const entryData of historyData) {
                const entry: TrackHistoryEntry = JSON.parse(entryData) as TrackHistoryEntry
                const entryTitle = entry.title.toLowerCase()

                // Check if any search terms match
                const matches = searchTerms.filter((term) =>
                    entryTitle.includes(term),
                ).length
                if (matches > 0) {
                    similarTracks.push(entry)
                }
            }

            return similarTracks.slice(0, limit)
        } catch (error) {
            errorLog({ message: 'Failed to find similar tracks', error })
            return []
        }
    }

    async clearGuildCache(guildId: string): Promise<void> {
        try {
            // Clear all duplicate check keys for this guild
            const pattern = `duplicate_check:${guildId}:*`
            const keys = await redisClient.keys(pattern)
            for (const key of keys) {
                await redisClient.del(key)
            }
        } catch (error) {
            errorLog({ message: 'Failed to clear guild cache', error })
        }
    }
}
