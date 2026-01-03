import { redisClient } from '../../config/redis'
import { debugLog, errorLog } from '../../utils/general/log'
import { TrackHistoryKeys } from './redisKeys'
import type { TrackMetadata, TrackHistoryConfig } from './types'

export class MetadataManager {
    constructor(private readonly config: TrackHistoryConfig) {}

    async storeTrackMetadata(
        trackId: string,
        metadata: TrackMetadata,
    ): Promise<void> {
        try {
            const metadataKey = TrackHistoryKeys.getMetadataKey(trackId)
            await redisClient.setex(
                metadataKey,
                this.config.metadataTtl,
                JSON.stringify(metadata),
            )

            debugLog({ message: `Stored metadata for track ${trackId}` })
        } catch (error) {
            errorLog({ message: 'Failed to store track metadata', error })
            throw error
        }
    }

    async getTrackMetadata(trackId: string): Promise<TrackMetadata | null> {
        try {
            const metadataKey = TrackHistoryKeys.getMetadataKey(trackId)
            const metadataData = await redisClient.get(metadataKey)

            return metadataData ? JSON.parse(metadataData) as TrackMetadata : null
        } catch (error) {
            errorLog({ message: 'Failed to get track metadata', error })
            return null
        }
    }

    async updateTrackViews(trackId: string, increment = 1): Promise<void> {
        try {
            const metadata = await this.getTrackMetadata(trackId)
            if (metadata) {
                metadata.views += increment
                await this.storeTrackMetadata(trackId, metadata)
            }
        } catch (error) {
            errorLog({ message: 'Failed to update track views', error })
        }
    }

    async getPopularTracks(
        guildId: string,
        limit = 10,
    ): Promise<{ trackId: string; views: number }[]> {
        try {
            const trackIdsKey = TrackHistoryKeys.getTrackIdsKey(guildId)
            const trackIds = await redisClient.smembers(trackIdsKey)

            const popularTracks = []
            for (const trackId of trackIds) {
                const metadata = await this.getTrackMetadata(trackId)
                if (metadata) {
                    popularTracks.push({ trackId, views: metadata.views })
                }
            }

            return popularTracks
                .sort((a, b) => b.views - a.views)
                .slice(0, limit)
        } catch (error) {
            errorLog({ message: 'Failed to get popular tracks', error })
            return []
        }
    }

    async clearGuildMetadata(guildId: string): Promise<void> {
        try {
            const trackIdsKey = TrackHistoryKeys.getTrackIdsKey(guildId)
            const trackIds = await redisClient.smembers(trackIdsKey)

            for (const trackId of trackIds) {
                const metadataKey =
                    TrackHistoryKeys.getTrackMetadataKey(trackId)
                await redisClient.del(metadataKey)
            }

            await redisClient.del(trackIdsKey)
        } catch (error) {
            errorLog({ message: 'Failed to clear guild metadata', error })
        }
    }
}
