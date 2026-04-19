import { redisClient } from '@lucky/shared/services'
import { errorLog, getPrismaClient } from '@lucky/shared/utils'
import { cleanAuthor } from '../../utils/music/searchQueryCleaner'

export type RecommendationFeedback = 'like' | 'dislike'
export type ArtistFeedback = 'prefer' | 'block'

function decayWeight(updatedAt: number): number {
    const daysSince = (Date.now() - updatedAt) / 86_400_000
    return Math.max(0.15, 1.0 - (daysSince / 30) * 0.85)
}

type FeedbackEntry = {
    feedback: RecommendationFeedback
    updatedAt: number
    expiresAt: number
}

type FeedbackMap = Record<string, FeedbackEntry>

type ImplicitFeedbackEntry = {
    type: 'implicit_dislike' | 'implicit_like'
    updatedAt: number
}

type ImplicitFeedbackMap = Record<string, ImplicitFeedbackEntry>

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

    private async getValidFeedbackMap(
        userId: string,
        now: number,
    ): Promise<FeedbackMap> {
        const map = await this.getFeedbackMap(userId)
        const { map: validMap, changed } = this.pruneExpired(map, now)
        if (changed) {
            await this.saveFeedbackMap(userId, validMap)
        }
        return validMap
    }

    private async getTrackKeysByFeedback(
        userId: string | undefined,
        type: RecommendationFeedback,
        now = Date.now(),
    ): Promise<Set<string>> {
        if (!userId) return new Set<string>()
        const validMap = await this.getValidFeedbackMap(userId, now)
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

    private async getTrackWeightsByFeedback(
        userId: string,
        type: RecommendationFeedback,
        now: number,
    ): Promise<Map<string, number>> {
        const validMap = await this.getValidFeedbackMap(userId, now)
        const weights = new Map<string, number>()
        for (const [trackKey, entry] of Object.entries(validMap)) {
            if (entry.feedback === type) {
                weights.set(trackKey, decayWeight(entry.updatedAt))
            }
        }
        return weights
    }

    async getLikedTrackWeights(
        userId: string,
        now = Date.now(),
    ): Promise<Map<string, number>> {
        if (!userId) return new Map<string, number>()
        return this.getTrackWeightsByFeedback(userId, 'like', now)
    }

    async getDislikedTrackWeights(
        userId: string,
        now = Date.now(),
    ): Promise<Map<string, number>> {
        if (!userId) return new Map<string, number>()
        return this.getTrackWeightsByFeedback(userId, 'dislike', now)
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

    private async getArtistFeedbackMap(
        userId: string,
    ): Promise<Record<string, ArtistFeedback>> {
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

    private async getPreferredKeysFromRedis(
        userId: string,
    ): Promise<Set<string>> {
        const map = await this.getArtistFeedbackMap(userId)
        return new Set(
            Object.entries(map)
                .filter(([, feedback]) => feedback === 'prefer')
                .map(([artistKey]) => artistKey),
        )
    }

    private async getArtistKeysFromDb(
        guildId: string,
        userId: string,
        preference: 'prefer' | 'block',
    ): Promise<Set<string>> {
        try {
            const db = getPrismaClient()
            const prefs = await db.userArtistPreference.findMany({
                where: { discordUserId: userId, guildId, preference },
                select: { artistKey: true },
            })
            return new Set(prefs.map((p) => p.artistKey))
        } catch {
            return new Set<string>()
        }
    }

    async getPreferredArtistKeys(
        guildId: string,
        userId: string | undefined,
    ): Promise<Set<string>> {
        if (!userId) return new Set<string>()

        const [redisKeys, dbKeys] = await Promise.all([
            this.getPreferredKeysFromRedis(userId),
            this.getArtistKeysFromDb(guildId, userId, 'prefer'),
        ])
        return new Set([...redisKeys, ...dbKeys])
    }

    private async getBlockedKeysFromRedis(
        userId: string,
    ): Promise<Set<string>> {
        const map = await this.getArtistFeedbackMap(userId)
        return new Set(
            Object.entries(map)
                .filter(([, feedback]) => feedback === 'block')
                .map(([artistKey]) => artistKey),
        )
    }

    async getBlockedArtistKeys(
        guildId: string,
        userId: string | undefined,
    ): Promise<Set<string>> {
        if (!userId) return new Set<string>()

        const [redisKeys, dbKeys] = await Promise.all([
            this.getBlockedKeysFromRedis(userId),
            this.getArtistKeysFromDb(guildId, userId, 'block'),
        ])
        return new Set([...redisKeys, ...dbKeys])
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

    private getImplicitFeedbackRedisKey(userId: string): string {
        return `music:implicit_feedback:${userId}`
    }

    private async getImplicitFeedbackMap(
        userId: string,
    ): Promise<ImplicitFeedbackMap> {
        const key = this.getImplicitFeedbackRedisKey(userId)
        try {
            const value = await redisClient.get(key)
            if (!value) return {}
            const parsed = JSON.parse(value) as ImplicitFeedbackMap
            return parsed && typeof parsed === 'object' ? parsed : {}
        } catch (error) {
            errorLog({
                message: 'Failed to load implicit feedback map',
                error,
            })
            return {}
        }
    }

    private async saveImplicitFeedbackMap(
        userId: string,
        map: ImplicitFeedbackMap,
    ): Promise<void> {
        const key = this.getImplicitFeedbackRedisKey(userId)
        const ttlSeconds = 14 * 24 * 60 * 60

        await redisClient.setex(key, ttlSeconds, JSON.stringify(map))
    }

    async recordImplicitFeedback(
        userId: string,
        trackKey: string,
        type: 'implicit_dislike' | 'implicit_like',
    ): Promise<void> {
        try {
            const map = await this.getImplicitFeedbackMap(userId)
            const now = Date.now()

            map[trackKey] = { type, updatedAt: now }

            const entries = Object.entries(map).sort(
                (a, b) => a[1].updatedAt - b[1].updatedAt,
            )

            if (entries.length > 200) {
                const trimmed: ImplicitFeedbackMap = {}
                for (const [key, entry] of entries.slice(-200)) {
                    trimmed[key] = entry
                }
                await this.saveImplicitFeedbackMap(userId, trimmed)
            } else {
                await this.saveImplicitFeedbackMap(userId, map)
            }
        } catch (error) {
            errorLog({
                message: 'Failed to record implicit feedback',
                error,
                data: { userId, trackKey, type },
            })
        }
    }

    private async getImplicitKeysByType(
        userId: string,
        type: 'implicit_dislike' | 'implicit_like',
    ): Promise<Set<string>> {
        const map = await this.getImplicitFeedbackMap(userId)
        return new Set(
            Object.entries(map)
                .filter(([, entry]) => entry.type === type)
                .map(([trackKey]) => trackKey),
        )
    }

    async getImplicitDislikeKeys(userId: string): Promise<Set<string>> {
        return this.getImplicitKeysByType(userId, 'implicit_dislike')
    }

    async getImplicitLikeKeys(userId: string): Promise<Set<string>> {
        return this.getImplicitKeysByType(userId, 'implicit_like')
    }
}

    async getPreferredArtistNames(
        guildId: string,
        userId: string,
    ): Promise<Set<string>> {
        try {
            const db = getPrismaClient()
            const prefs = await db.userArtistPreference.findMany({
                where: { discordUserId: userId, guildId, preference: 'prefer' },
                select: { artistName: true },
            })
            return new Set(prefs.map((p) => p.artistName.trim()).filter(Boolean))
        } catch {
            return new Set<string>()
        }
    }

export const recommendationFeedbackService = new RecommendationFeedbackService(
    parseInt(process.env.AUTOPLAY_FEEDBACK_TTL_DAYS ?? '30', 10),
)
