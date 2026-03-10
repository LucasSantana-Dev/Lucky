import { redisClient } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'

export type RecommendationFeedback = 'like' | 'dislike'

type FeedbackEntry = {
    feedback: RecommendationFeedback
    updatedAt: number
    expiresAt: number
}

type FeedbackMap = Record<string, FeedbackEntry>

export class RecommendationFeedbackService {
    constructor(private readonly ttlHours = 24) {}

    private getRedisKey(guildId: string, userId: string): string {
        return `music:recommendation:feedback:${guildId}:${userId}`
    }

    private async getFeedbackMap(
        guildId: string,
        userId: string,
    ): Promise<FeedbackMap> {
        const key = this.getRedisKey(guildId, userId)
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
        guildId: string,
        userId: string,
        map: FeedbackMap,
    ): Promise<void> {
        const key = this.getRedisKey(guildId, userId)
        const ttlSeconds = this.ttlHours * 60 * 60

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
            const map = await this.getFeedbackMap(guildId, userId)
            map[trackKey] = {
                feedback,
                updatedAt: now,
                expiresAt: now + this.ttlHours * 60 * 60 * 1000,
            }
            await this.saveFeedbackMap(guildId, userId, map)
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

    async getDislikedTrackKeys(
        guildId: string,
        userId: string | undefined,
        now = Date.now(),
    ): Promise<Set<string>> {
        if (!userId) return new Set<string>()

        const map = await this.getFeedbackMap(guildId, userId)
        const { map: validMap, changed } = this.pruneExpired(map, now)

        if (changed) {
            await this.saveFeedbackMap(guildId, userId, validMap)
        }

        const disliked = Object.entries(validMap)
            .filter(([, entry]) => entry.feedback === 'dislike')
            .map(([trackKey]) => trackKey)

        return new Set(disliked)
    }
}

export const recommendationFeedbackService = new RecommendationFeedbackService(
    parseInt(process.env.AUTOPLAY_DISLIKE_TTL_HOURS ?? '24', 10),
)
