import type { Track } from 'discord-player'
import { BaseService } from '../../types/services/BaseService'
import { Result } from '../../types/common/BaseResult'
import { HistoryManager } from './historyManager'
import { MetadataManager } from './metadataManager'
import { DuplicateDetector } from './duplicateDetector'
import { TrackAnalytics } from './analytics'
import type {
    TrackHistoryEntry,
    TrackMetadata,
    TrackHistoryStats,
} from './types'

export interface TrackHistoryConfig {
    ttl: number
    maxHistorySize: number
    trackHistoryTtl: number
    metadataTtl: number
}

export class TrackHistoryService extends BaseService<TrackHistoryConfig> {
    private readonly historyManager: HistoryManager
    private readonly metadataManager: MetadataManager
    private readonly duplicateDetector: DuplicateDetector
    private readonly analytics: TrackAnalytics

    constructor(config: TrackHistoryConfig, redisClient: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        super(config, redisClient as any)

        this.historyManager = new HistoryManager(config)
        this.metadataManager = new MetadataManager(config)
        this.duplicateDetector = new DuplicateDetector()
        this.analytics = new TrackAnalytics()
    }

    // History management
    async addTrackToHistory(track: Track, guildId: string): Promise<Result<void>> {
        return this.executeWithFallback(
            async () => {
                await this.historyManager.addTrackToHistory(track, guildId)
                return Result.success()
            },
            Result.failure('Failed to add track to history'),
            'addTrackToHistory',
        )
    }

    async getTrackHistory(
        guildId: string,
        limit = 10,
    ): Promise<Result<TrackHistoryEntry[]>> {
        return this.executeWithFallback(
            async () => {
                const history = await this.historyManager.getTrackHistory(guildId, limit)
                return Result.success(history)
            },
            Result.success([]),
            'getTrackHistory',
        )
    }

    async getLastTrack(guildId: string): Promise<Result<TrackHistoryEntry | null>> {
        return this.executeWithFallback(
            async () => {
                const lastTrack = await this.historyManager.getLastTrack(guildId)
                return Result.success(lastTrack)
            },
            Result.success(null),
            'getLastTrack',
        )
    }

    async clearHistory(guildId: string): Promise<Result<void>> {
        return this.executeWithFallback(
            async () => {
                await this.historyManager.clearHistory(guildId)
                return Result.success()
            },
            Result.failure('Failed to clear history'),
            'clearHistory',
        )
    }

    // Metadata management
    async storeTrackMetadata(
        trackId: string,
        metadata: TrackMetadata,
    ): Promise<Result<void>> {
        return this.executeWithFallback(
            async () => {
                await this.metadataManager.storeTrackMetadata(trackId, metadata)
                return Result.success()
            },
            Result.failure('Failed to store track metadata'),
            'storeTrackMetadata',
        )
    }

    async getTrackMetadata(trackId: string): Promise<Result<TrackMetadata | null>> {
        return this.executeWithFallback(
            async () => {
                const metadata = await this.metadataManager.getTrackMetadata(trackId)
                return Result.success(metadata)
            },
            Result.success(null),
            'getTrackMetadata',
        )
    }

    async updateTrackViews(trackId: string, increment = 1): Promise<Result<void>> {
        return this.executeWithFallback(
            async () => {
                await this.metadataManager.updateTrackViews(trackId, increment)
                return Result.success()
            },
            Result.failure('Failed to update track views'),
            'updateTrackViews',
        )
    }

    async getPopularTracks(
        guildId: string,
        limit = 10,
    ): Promise<Result<{ trackId: string; views: number }[]>> {
        return this.executeWithFallback(
            async () => {
                const tracks = await this.metadataManager.getPopularTracks(guildId, limit)
                return Result.success(tracks)
            },
            Result.success([]),
            'getPopularTracks',
        )
    }

    // Duplicate detection
    async isDuplicateTrack(
        guildId: string,
        trackUrl: string,
        timeWindow = 300000,
    ): Promise<Result<boolean>> {
        return this.executeWithFallback(
            async () => {
                const isDuplicate = await this.duplicateDetector.isDuplicateTrack(
                    guildId,
                    trackUrl,
                    timeWindow,
                )
                return Result.success(isDuplicate)
            },
            Result.success(false),
            'isDuplicateTrack',
        )
    }

    async markTrackAsPlayed(guildId: string, trackUrl: string): Promise<Result<void>> {
        return this.executeWithFallback(
            async () => {
                await this.duplicateDetector.markTrackAsPlayed(guildId, trackUrl)
                return Result.success()
            },
            Result.failure('Failed to mark track as played'),
            'markTrackAsPlayed',
        )
    }

    async findSimilarTracks(
        guildId: string,
        trackTitle: string,
        limit = 5,
    ): Promise<Result<TrackHistoryEntry[]>> {
        return this.executeWithFallback(
            async () => {
                const tracks = await this.duplicateDetector.findSimilarTracks(
                    guildId,
                    trackTitle,
                    limit,
                )
                return Result.success(tracks)
            },
            Result.success([]),
            'findSimilarTracks',
        )
    }

    // Analytics
    async generateStats(guildId: string): Promise<Result<TrackHistoryStats>> {
        return this.executeWithFallback(
            async () => {
                const stats = await this.analytics.generateStats(guildId)
                return Result.success(stats)
            },
            Result.failure('Failed to generate stats'),
            'generateStats',
        )
    }

    async getCachedStats(guildId: string): Promise<Result<TrackHistoryStats | null>> {
        return this.executeWithFallback(
            async () => {
                const stats = await this.analytics.getCachedStats(guildId)
                return Result.success(stats)
            },
            Result.success(null),
            'getCachedStats',
        )
    }

    async getTopArtists(
        guildId: string,
        limit = 10,
    ): Promise<Result<{ artist: string; plays: number }[]>> {
        return this.executeWithFallback(
            async () => {
                const artists = await this.analytics.getTopArtists(guildId, limit)
                return Result.success(artists)
            },
            Result.success([]),
            'getTopArtists',
        )
    }

    async clearAllGuildCaches(guildId: string): Promise<Result<void>> {
        return this.executeWithFallback(
            async () => {
                await this.historyManager.clearHistory(guildId)
                await this.metadataManager.clearGuildMetadata(guildId)
                await this.duplicateDetector.clearGuildCache(guildId)
                await this.analytics.clearGuildCache(guildId)
                return Result.success()
            },
            Result.failure('Failed to clear guild caches'),
            'clearAllGuildCaches',
        )
    }

    protected getRedisKey(identifier: string): string {
        return super.getRedisKey('track_history', identifier)
    }
}

export type { TrackHistoryEntry, TrackMetadata, TrackHistoryStats }
