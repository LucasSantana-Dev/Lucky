import { errorLog, getPrismaClient } from '@lucky/shared/utils'
import { parseIntEnv } from '@lucky/shared/utils/env'
import { cleanAuthor } from '../../utils/music/searchQueryCleaner'

export type RecommendationFeedback = 'like' | 'dislike'
export type ArtistFeedback = 'prefer' | 'block'

function decayWeight(updatedAt: number): number {
    const daysSince = (Date.now() - updatedAt) / 86_400_000
    return Math.max(0.15, 1.0 - (daysSince / 30) * 0.85)
}

type ImplicitFeedbackEntry = {
    type: 'implicit_dislike' | 'implicit_like'
    updatedAt: number
}

type ImplicitFeedbackMap = Record<string, ImplicitFeedbackEntry>

export class RecommendationFeedbackService {
    // In-memory cache for implicit feedback (behavioral signals).
    // REVISIT: multi-instance deployments will lose entries on restart.
    // Consider moving to Postgres if signal persistence becomes critical.
    private implicitFeedbackCache = new Map<string, ImplicitFeedbackMap>()
    private implicitCacheTTL = 14 * 24 * 60 * 60 * 1000 // 14 days in ms

    constructor(private readonly ttlDays = 30) {}

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
            const db = getPrismaClient()
            const expiresAt = new Date(now + this.ttlDays * 24 * 60 * 60 * 1000)
            const updatedAt = new Date(now)

            await db.userTrackFeedback.upsert({
                where: {
                    discordUserId_guildId_trackKey: {
                        discordUserId: userId,
                        guildId,
                        trackKey,
                    },
                },
                update: {
                    feedback,
                    updatedAt,
                    expiresAt,
                },
                create: {
                    discordUserId: userId,
                    guildId,
                    trackKey,
                    feedback,
                    updatedAt,
                    expiresAt,
                },
            })
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
            const db = getPrismaClient()
            await db.userTrackFeedback.deleteMany({
                where: { discordUserId: userId },
            })
        } catch (error) {
            errorLog({
                message: 'Failed to clear recommendation feedback',
                error,
                data: { userId },
            })
        }
    }

    private async getTrackKeysByFeedback(
        userId: string | undefined,
        type: RecommendationFeedback,
        now = Date.now(),
    ): Promise<Set<string>> {
        if (!userId) return new Set<string>()

        try {
            const db = getPrismaClient()
            const nowDate = new Date(now)

            // Lazy prune: delete expired entries opportunistically on read
            await db.userTrackFeedback.deleteMany({
                where: {
                    discordUserId: userId,
                    expiresAt: { lte: nowDate },
                },
            })

            // Fetch non-expired feedback of the requested type
            const entries = await db.userTrackFeedback.findMany({
                where: {
                    discordUserId: userId,
                    feedback: type,
                    expiresAt: { gt: nowDate },
                },
                select: { trackKey: true },
            })

            return new Set(entries.map((e) => e.trackKey))
        } catch (error) {
            errorLog({
                message: 'Failed to load feedback track keys',
                error,
                data: { userId, type },
            })
            return new Set<string>()
        }
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
        const weights = new Map<string, number>()

        try {
            const db = getPrismaClient()
            const nowDate = new Date(now)

            // Lazy prune: delete expired entries opportunistically on read
            await db.userTrackFeedback.deleteMany({
                where: {
                    discordUserId: userId,
                    expiresAt: { lte: nowDate },
                },
            })

            // Fetch non-expired feedback with decay weights
            const entries = await db.userTrackFeedback.findMany({
                where: {
                    discordUserId: userId,
                    feedback: type,
                    expiresAt: { gt: nowDate },
                },
                select: { trackKey: true, updatedAt: true },
            })

            for (const entry of entries) {
                weights.set(entry.trackKey, decayWeight(entry.updatedAt.getTime()))
            }
        } catch (error) {
            errorLog({
                message: 'Failed to load feedback track weights',
                error,
                data: { userId, type },
            })
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

        try {
            const db = getPrismaClient()
            const nowDate = new Date(now)

            // Lazy prune: delete expired entries opportunistically on read
            await db.userTrackFeedback.deleteMany({
                where: {
                    discordUserId: userId,
                    expiresAt: { lte: nowDate },
                },
            })

            const [liked, disliked] = await Promise.all([
                db.userTrackFeedback.count({
                    where: {
                        discordUserId: userId,
                        feedback: 'like',
                        expiresAt: { gt: nowDate },
                    },
                }),
                db.userTrackFeedback.count({
                    where: {
                        discordUserId: userId,
                        feedback: 'dislike',
                        expiresAt: { gt: nowDate },
                    },
                }),
            ])

            return { liked, disliked }
        } catch (error) {
            errorLog({
                message: 'Failed to load feedback counts',
                error,
                data: { userId },
            })
            return { liked: 0, disliked: 0 }
        }
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

            const db = getPrismaClient()

            // Upsert into userArtistPreference (unified Postgres store)
            await db.userArtistPreference.upsert({
                where: {
                    discordUserId_guildId_artistKey: {
                        discordUserId: userId,
                        guildId,
                        artistKey,
                    },
                },
                update: { preference: feedback },
                create: {
                    discordUserId: userId,
                    guildId,
                    artistKey,
                    artistName,
                    preference: feedback,
                },
            })
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

            const db = getPrismaClient()

            await db.userArtistPreference.deleteMany({
                where: {
                    discordUserId: userId,
                    guildId,
                    artistKey,
                },
            })
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

        try {
            const db = getPrismaClient()
            // Cap at 5000 prefs per user/guild/type to prevent unbounded
            // query on power users. Typical users have <100 prefs.
            const prefs = await db.userArtistPreference.findMany({
                where: { discordUserId: userId, guildId, preference: 'prefer' },
                select: { artistKey: true },
                take: 5000,
            })
            return new Set(prefs.map((p) => p.artistKey))
        } catch (error) {
            errorLog({
                message: 'Failed to load preferred artist keys',
                error,
                data: { guildId, userId },
            })
            return new Set<string>()
        }
    }

    async getBlockedArtistKeys(
        guildId: string,
        userId: string | undefined,
    ): Promise<Set<string>> {
        if (!userId) return new Set<string>()

        try {
            const db = getPrismaClient()
            const prefs = await db.userArtistPreference.findMany({
                where: { discordUserId: userId, guildId, preference: 'block' },
                select: { artistKey: true },
                take: 5000,
            })
            return new Set(prefs.map((p) => p.artistKey))
        } catch (error) {
            errorLog({
                message: 'Failed to load blocked artist keys',
                error,
                data: { guildId, userId },
            })
            return new Set<string>()
        }
    }

    async getArtistFeedbackSummary(
        userId: string | undefined,
    ): Promise<{ preferred: string[]; blocked: string[] }> {
        if (!userId) return { preferred: [], blocked: [] }

        try {
            const db = getPrismaClient()
            const prefs = await db.userArtistPreference.findMany({
                where: { discordUserId: userId },
                select: { artistKey: true, preference: true },
            })

            const preferred: string[] = []
            const blocked: string[] = []

            for (const pref of prefs) {
                if (pref.preference === 'prefer') preferred.push(pref.artistKey)
                else if (pref.preference === 'block') blocked.push(pref.artistKey)
            }

            return { preferred, blocked }
        } catch (error) {
            errorLog({
                message: 'Failed to load artist feedback summary',
                error,
                data: { userId },
            })
            return { preferred: [], blocked: [] }
        }
    }

    private getImplicitFeedbackForUser(userId: string): ImplicitFeedbackMap {
        // Initialize empty map for this user if not present
        if (!this.implicitFeedbackCache.has(userId)) {
            this.implicitFeedbackCache.set(userId, {})
        }
        return this.implicitFeedbackCache.get(userId)!
    }

    async recordImplicitFeedback(
        userId: string,
        trackKey: string,
        type: 'implicit_dislike' | 'implicit_like',
    ): Promise<void> {
        try {
            const map = this.getImplicitFeedbackForUser(userId)
            const now = Date.now()

            map[trackKey] = { type, updatedAt: now }

            // Cap implicit feedback at 200 most recent entries per user
            const entries = Object.entries(map).sort(
                (a, b) => a[1].updatedAt - b[1].updatedAt,
            )

            if (entries.length > 200) {
                // Keep only the last 200 (most recent)
                const trimmed: ImplicitFeedbackMap = {}
                for (const [key, entry] of entries.slice(-200)) {
                    trimmed[key] = entry
                }
                this.implicitFeedbackCache.set(userId, trimmed)
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
        const map = this.getImplicitFeedbackForUser(userId)
        const now = Date.now()

        return new Set(
            Object.entries(map)
                .filter(([, entry]) => {
                    // Filter out expired entries (14-day TTL)
                    const age = now - entry.updatedAt
                    return age < this.implicitCacheTTL && entry.type === type
                })
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

export const recommendationFeedbackService = new RecommendationFeedbackService(
    parseIntEnv('AUTOPLAY_FEEDBACK_TTL_DAYS', 30),
)
