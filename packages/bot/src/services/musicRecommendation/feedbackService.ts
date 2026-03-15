import { redisClient } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'

export type RecommendationFeedback = 'like' | 'dislike'

type FeedbackEntry = {
    feedback: RecommendationFeedback
    updatedAt: number
    expiresAt: number
}

type FeedbackMap = Record<string, FeedbackEntry>

export type FeedbackStats = {
    likedCount: number
    dislikedCount: number
    activeSince: number | null
}

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
            })
        }
    }

    private pruneExpired(
        map: FeedbackMap,
        now: number,
    ): { map: FeedbackMap; changed: boolean } {
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

    async getDislikedTrackKeys(
        userId: string | undefined,
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
                .filter(([, entry]) => entry.feedback === 'dislike')
                .map(([trackKey]) => trackKey),
        )
    }

    async getLikedTrackKeys(
        userId: string | undefined,
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
                .filter(([, entry]) => entry.feedback === 'like')
                .map(([trackKey]) => trackKey),
        )
    }

    async getFeedbackStats(
        userId: string | undefined,
        now = Date.now(),
    ): Promise<FeedbackStats> {
        if (!userId) {
            return { likedCount: 0, dislikedCount: 0, activeSince: null }
        }
        const map = await this.getFeedbackMap(userId)
        const { map: validMap, changed } = this.pruneExpired(map, now)
        if (changed) {
            await this.saveFeedbackMap(userId, validMap)
        }
        const entries = Object.values(validMap)
        const likedCount = entries.filter((e) => e.feedback === 'like').length
        const dislikedCount = entries.filter(
            (e) => e.feedback === 'dislike',
        ).length
        const activeSince =
            entries.length > 0
                ? Math.min(...entries.map((e) => e.updatedAt))
                : null
        return { likedCount, dislikedCount, activeSince }
    }

    async clearAllFeedback(userId: string): Promise<void> {
        try {
            const key = this.getRedisKey(userId)
            await redisClient.del(key)
        } catch (error) {
            errorLog({
                message: 'Failed to clear recommendation feedback',
                error,
            })
        }
    }
}

export const recommendationFeedbackService = new RecommendationFeedbackService(
    parseInt(process.env.AUTOPLAY_FEEDBACK_TTL_DAYS ?? '30', 10),
)
