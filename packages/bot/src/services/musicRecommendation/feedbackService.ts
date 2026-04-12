import { redisClient } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'
import { cleanAuthor } from '../../utils/music/searchQueryCleaner'

export type RecommendationFeedback = 'like' | 'dislike'
export type ArtistFeedback = 'prefer' | 'block'

type FeedbackEntry = {
    feedback: RecommendationFeedback
    updatedAt: number
    expiresAt: number
}

type FeedbackMap = Record<string, FeedbackEntry>

export class RecommendationFeedbackService {
    constructor(private readonly ttlDays = 30) {}

    private getRedisKey(userId: string): string {
        return `music:feedback:${userId}`
    }

    private async getFeedbackMap(userId: string): Promise<FeedbackMap> {
        const key = this.getRedisKey(userId)
        try {
            const value = await redisClient.get(key)
            if (!value) return {}
            const parsed = JSON.parse(value) as FeedbackMap
            return parsed && typeof parsed === 'object' ? parsed : {}
        } catch (error) {
            errorLog({
                message: 'Failed to load recommendation feedback map',
                error,
            })
            return {}
        }
    }

    private async saveFeedbackMap(
        userId: string,
        map: FeedbackMap,
    ): Promise<void> {
        const key = this.getRedisKey(userId)
        const ttlSeconds = this.ttlDays * 24 * 60 * 60

        await redisClient.setex(key, ttlSeconds, JSON.stringify(map))
    }

    buildTrackKey(title: string, author: string): string {
        const normalizedTitle = title
            .toLowerCase()
            .replaceAll(/[^a-z0-9]+/g, '')
            .trim()
        const normalizedAuthor = author
            .toLowerCase()
            .replaceAll(/[^a-z0-9]+/g, '')
            .trim()

        return `${normalizedTitle}::${normalizedAuthor}`
    }

    async setFeedback(
        guildId: string,
        userId: string,
        trackKey: string,
        feedback: RecommendationFeedback,
        now = Date.now(),
    ): Promise<void> {
        try {
            const map = await this.getFeedbackMap(userId)
            map[trackKey] = {
                feedback,
                updatedAt: now,
                expiresAt: now + this.ttlDays * 24 * 60 * 60 * 1000,
            }
            await this.saveFeedbackMap(userId, map)
        } catch (error) {
            errorLog({
                message: 'Failed to store recommendation feedback',
                error,
                data: { guildId },
            })
        }
    }

    async clearFeedback(userId: string): Promise<void> {
        try {
            const key = this.getRedisKey(userId)
            await redisClient.del(key)
        } catch (error) {
            errorLog({
                message: 'Failed to clear recommendation feedback',
                error,
                data: { userId },
            })
        }
    }

    private pruneExpired(
        map: FeedbackMap,
        now: number,
    ): {
        map: FeedbackMap
        changed: boolean
    } {
        const next: FeedbackMap = {}
        let changed = false

        for (const [trackKey, entry] of Object.entries(map)) {
            if (entry.expiresAt <= now) {
                changed = true
                continue
            }
            next[trackKey] = entry
        }

        return { map: next, changed }
    }

    private async getTrackKeysByFeedback(
        userId: string | undefined,
        type: RecommendationFeedback,
        now = Date.now(),
    ): Promise<Set<string>> {
        if (!userId) return new Set<string>()

        const map = await this.getFeedbackMap(userId)
        const { map: validMap, changed } = this.pruneExpired(map, now)

        if (changed) {
            await this.saveFeedbackMap(userId, validMap)
        }

        return new Set(
            Object.entries(validMap)
                .filter(([, entry]) => entry.feedback === type)
                .map(([trackKey]) => trackKey),
        )
    }

    async getDislikedTrackKeys(
        guildId: string,
        userId: string | undefined,
        now = Date.now(),
    ): Promise<Set<string>> {
        return this.getTrackKeysByFeedback(userId, 'dislike', now)
    }

    async getLikedTrackKeys(
        guildId: string,
        userId: string | undefined,
        now = Date.now(),
    ): Promise<Set<string>> {
        return this.getTrackKeysByFeedback(userId, 'like', now)
    }

    async getFeedbackCounts(
        userId: string | undefined,
        now = Date.now(),
    ): Promise<{ liked: number; disliked: number }> {
        if (!userId) return { liked: 0, disliked: 0 }

        const map = await this.getFeedbackMap(userId)
        const { map: validMap } = this.pruneExpired(map, now)

        let liked = 0
        let disliked = 0
        for (const entry of Object.values(validMap)) {
            if (entry.feedback === 'like') liked++
            else if (entry.feedback === 'dislike') disliked++
        }

        return { liked, disliked }
    }

    private getArtistFeedbackRedisKey(userId: string): string {
        return `music:artist_feedback:${userId}`
    }

    private async getArtistFeedbackMap(userId: string): Promise<Record<string, ArtistFeedback>> {
        const key = this.getArtistFeedbackRedisKey(userId)
        try {
            const value = await redisClient.get(key)
            if (!value) return {}
            const parsed = JSON.parse(value) as Record<string, ArtistFeedback>
            return parsed && typeof parsed === 'object' ? parsed : {}
        } catch (error) {
            errorLog({
                message: 'Failed to load artist feedback map',
                error,
            })
            return {}
        }
    }

    private async saveArtistFeedbackMap(
        userId: string,
        map: Record<string, ArtistFeedback>,
    ): Promise<void> {
        const key = this.getArtistFeedbackRedisKey(userId)
        const ttlSeconds = this.ttlDays * 24 * 60 * 60

        await redisClient.setex(key, ttlSeconds, JSON.stringify(map))
    }

    private normalizeArtistKey(artistName: string): string {
        const cleaned = cleanAuthor(artistName)
        return cleaned
            .toLowerCase()
            .replaceAll(/[^a-z0-9]+/g, '')
            .trim()
    }

    async setArtistFeedback(
        guildId: string,
        userId: string,
        artistName: string,
        feedback: ArtistFeedback,
    ): Promise<void> {
        try {
            const artistKey = this.normalizeArtistKey(artistName)
            if (!artistKey) return

            const map = await this.getArtistFeedbackMap(userId)
            map[artistKey] = feedback
            await this.saveArtistFeedbackMap(userId, map)
        } catch (error) {
            errorLog({
                message: 'Failed to store artist feedback',
                error,
                data: { guildId },
            })
        }
    }

    async removeArtistFeedback(
        guildId: string,
        userId: string,
        artistName: string,
    ): Promise<void> {
        try {
            const artistKey = this.normalizeArtistKey(artistName)
            if (!artistKey) return

            const map = await this.getArtistFeedbackMap(userId)
            delete map[artistKey]
            await this.saveArtistFeedbackMap(userId, map)
        } catch (error) {
            errorLog({
                message: 'Failed to remove artist feedback',
                error,
                data: { guildId },
            })
        }
    }

    async getPreferredArtistKeys(
        guildId: string,
        userId: string | undefined,
    ): Promise<Set<string>> {
        if (!userId) return new Set<string>()

        const map = await this.getArtistFeedbackMap(userId)
        return new Set(
            Object.entries(map)
                .filter(([, feedback]) => feedback === 'prefer')
                .map(([artistKey]) => artistKey),
        )
    }

    async getBlockedArtistKeys(
        guildId: string,
        userId: string | undefined,
    ): Promise<Set<string>> {
        if (!userId) return new Set<string>()

        const map = await this.getArtistFeedbackMap(userId)
        return new Set(
            Object.entries(map)
                .filter(([, feedback]) => feedback === 'block')
                .map(([artistKey]) => artistKey),
        )
    }

    async getArtistFeedbackSummary(
        userId: string | undefined,
    ): Promise<{ preferred: string[]; blocked: string[] }> {
        if (!userId) return { preferred: [], blocked: [] }

        const map = await this.getArtistFeedbackMap(userId)
        const preferred: string[] = []
        const blocked: string[] = []

        for (const [artistKey, feedback] of Object.entries(map)) {
            if (feedback === 'prefer') preferred.push(artistKey)
            else if (feedback === 'block') blocked.push(artistKey)
        }

        return { preferred, blocked }
    }
}

export const recommendationFeedbackService = new RecommendationFeedbackService(
    parseInt(process.env.AUTOPLAY_FEEDBACK_TTL_DAYS ?? '30', 10),
)
