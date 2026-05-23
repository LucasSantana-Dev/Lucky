import { z } from 'zod'
import {
    type SpotifyArtist,
    errorLog,
    getPrismaClient,
    searchSpotifyArtists,
    getSpotifyRelatedArtists,
} from '@lucky/shared/utils'
import { spotifyLinkService, redisClient } from '@lucky/shared/services'
import { POPULAR_ARTISTS } from '../constants/popularArtists'
import {
    getSpotifyClientToken,
    isSpotifyAuthConfigured,
} from './SpotifyAuthService'

export interface ArtistSuggestion extends SpotifyArtist {}

/**
 * Configuration for ArtistSuggestionService caching behavior.
 */
export interface ArtistSuggestionServiceConfig {
    maxSuggestions?: number
    fallbackCacheTtlSeconds?: number
    userTopArtistsCacheTtlSeconds?: number
}

const DEFAULT_CONFIG: Required<ArtistSuggestionServiceConfig> = {
    maxSuggestions: 150,
    fallbackCacheTtlSeconds: 60 * 60, // 1 hour
    userTopArtistsCacheTtlSeconds: 15 * 60, // 15 minutes
}

/**
 * Service to fetch artist suggestions through a three-tier lookup strategy:
 * 1. User's saved preferred artists (from database)
 * 2. User's Spotify top artists (if Spotify is linked)
 * 3. Popular artists fallback (static list)
 *
 * Handles Redis caching to minimize Spotify API calls.
 */
export class ArtistSuggestionService {
    private maxSuggestions: number
    private fallbackCacheTtlSeconds: number
    private userTopArtistsCacheTtlSeconds: number
    private fallbackCacheKey = 'artist:suggestions:fallback:v2'
    private userTopArtistsCachePrefix = 'artist:user:top:v1:'

    constructor(config: ArtistSuggestionServiceConfig = {}) {
        const merged = { ...DEFAULT_CONFIG, ...config }
        this.maxSuggestions = merged.maxSuggestions
        this.fallbackCacheTtlSeconds = merged.fallbackCacheTtlSeconds
        this.userTopArtistsCacheTtlSeconds =
            merged.userTopArtistsCacheTtlSeconds
    }

    /**
     * Fetch artist suggestions through the three-tier lookup strategy.
     * Returns up to maxSuggestions artists in priority order.
     */
    async getSuggestions(
        discordUserId: string,
        guildId?: string,
    ): Promise<ArtistSuggestion[]> {
        if (!isSpotifyAuthConfigured()) {
            throw new Error('Spotify not configured')
        }

        const suggestions = new Map<string, ArtistSuggestion>()

        // Tier 1: User's saved preferred artists
        await this.loadPreferredArtists(discordUserId, guildId, suggestions)
        if (suggestions.size >= this.maxSuggestions) {
            return Array.from(suggestions.values())
        }

        // Tier 2: User's Spotify top artists
        await this.loadSpotifyTopArtists(discordUserId, suggestions)
        if (suggestions.size >= this.maxSuggestions) {
            return Array.from(suggestions.values())
        }

        // Tier 3: Popular artists fallback
        await this.loadPopularArtistsFallback(suggestions)

        return Array.from(suggestions.values()).slice(0, this.maxSuggestions)
    }

    /**
     * Load user's saved preferred artists from database.
     */
    private async loadPreferredArtists(
        discordUserId: string,
        guildId: string | undefined,
        suggestions: Map<string, ArtistSuggestion>,
    ): Promise<void> {
        try {
            const db = getPrismaClient()
            const preferred = await db.userArtistPreference.findMany({
                where: {
                    discordUserId,
                    preference: 'prefer',
                    ...(guildId ? { guildId } : {}),
                },
                orderBy: { createdAt: 'desc' },
            })
            for (const pref of preferred) {
                if (suggestions.size >= this.maxSuggestions) break
                const id = pref.spotifyId ?? `pref:${pref.artistKey}`
                if (suggestions.has(id)) continue
                suggestions.set(id, {
                    id,
                    name: pref.artistName,
                    imageUrl: pref.imageUrl,
                    popularity: 0,
                    genres: [],
                })
            }
        } catch (error) {
            errorLog({
                message: 'Failed to load preferred artists for suggestions',
                error,
            })
        }
    }

    /**
     * Load user's Spotify top artists if they have linked their account.
     */
    private async loadSpotifyTopArtists(
        discordUserId: string,
        suggestions: Map<string, ArtistSuggestion>,
    ): Promise<void> {
        try {
            const link =
                await spotifyLinkService.getValidAccessToken(discordUserId)
            if (!link) return

            const userCacheKey = `${this.userTopArtistsCachePrefix}${discordUserId}`
            let cachedTop: SpotifyArtist[] | null = null

            // Try to load from cache
            try {
                const cached = await redisClient.get(userCacheKey)
                if (cached) {
                    cachedTop = JSON.parse(cached) as SpotifyArtist[]
                }
            } catch {
                // Redis miss/error — fall through to Spotify
            }

            if (cachedTop && cachedTop.length > 0) {
                for (const artist of cachedTop) {
                    if (suggestions.size >= this.maxSuggestions) break
                    suggestions.set(artist.id, artist)
                }
            } else {
                // Fetch from Spotify
                const topArtists = await this.fetchSpotifyTopArtists(link)
                for (const artist of topArtists) {
                    if (suggestions.size >= this.maxSuggestions) break
                    if (!suggestions.has(artist.id)) {
                        suggestions.set(artist.id, artist)
                    }
                }

                // Cache the fetched artists
                if (topArtists.length > 0) {
                    try {
                        await redisClient.setex(
                            userCacheKey,
                            this.userTopArtistsCacheTtlSeconds,
                            JSON.stringify(topArtists),
                        )
                    } catch {
                        // Cache write failure is non-fatal
                    }
                }
            }
        } catch (error) {
            errorLog({ message: 'Failed to load Spotify top artists', error })
        }
    }

    /**
     * Fetch user's top artists from Spotify API across multiple time ranges.
     */
    private async fetchSpotifyTopArtists(
        accessToken: string,
    ): Promise<SpotifyArtist[]> {
        const collected: SpotifyArtist[] = []
        const seen = new Set<string>()
        const timeRanges = ['short_term', 'medium_term', 'long_term'] as const

        try {
            const promises = timeRanges.map((range) =>
                fetch(
                    `https://api.spotify.com/v1/me/top/artists?limit=50&time_range=${range}`,
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                        },
                    },
                ),
            )
            const responses = await Promise.all(promises)

            for (const res of responses) {
                if (!res.ok) continue

                const data = (await res.json()) as {
                    items?: unknown[]
                }
                if (!Array.isArray(data.items)) continue

                for (const item of data.items) {
                    const artist = item as {
                        id?: string
                        name?: string
                        images?: { url: string }[]
                        popularity?: number
                        genres?: string[]
                    }
                    if (artist.id && artist.name) {
                        const entry: SpotifyArtist = {
                            id: artist.id,
                            name: artist.name,
                            imageUrl: artist.images?.[0]?.url ?? null,
                            popularity: artist.popularity ?? 0,
                            genres: artist.genres ?? [],
                        }
                        if (!seen.has(artist.id)) {
                            seen.add(artist.id)
                            collected.push(entry)
                        }
                    }
                }
            }
        } catch (error) {
            errorLog({ message: 'Failed to fetch Spotify top artists', error })
        }

        return collected
    }

    /**
     * Load popular artists fallback list, with caching to minimize Spotify API calls.
     */
    private async loadPopularArtistsFallback(
        suggestions: Map<string, ArtistSuggestion>,
    ): Promise<void> {
        try {
            let fallback: SpotifyArtist[] = []

            // Try to load from cache
            try {
                const cached = await redisClient.get(this.fallbackCacheKey)
                if (cached) {
                    fallback = JSON.parse(cached) as SpotifyArtist[]
                }
            } catch {
                // Redis miss/error — fall through to fetch
            }

            if (fallback.length === 0) {
                fallback = await this.fetchPopularArtists()
                if (fallback.length > 0) {
                    try {
                        await redisClient.setex(
                            this.fallbackCacheKey,
                            this.fallbackCacheTtlSeconds,
                            JSON.stringify(fallback),
                        )
                    } catch {
                        // Cache write failure is non-fatal
                    }
                }
            }

            for (const artist of fallback) {
                if (suggestions.size >= this.maxSuggestions) break
                if (!suggestions.has(artist.id)) {
                    suggestions.set(artist.id, artist)
                }
            }
        } catch (error) {
            errorLog({
                message: 'Failed to load popular artists fallback',
                error,
            })
        }
    }

    /**
     * Fetch popular artists from Spotify by searching for each popular artist name.
     * Returns up to maxSuggestions unique artists.
     */
    private async fetchPopularArtists(): Promise<SpotifyArtist[]> {
        const clientToken = await getSpotifyClientToken()
        if (!clientToken) {
            throw new Error('Failed to get Spotify client token')
        }

        const out: SpotifyArtist[] = []
        const seen = new Set<string>()

        for (const query of POPULAR_ARTISTS) {
            if (out.length >= this.maxSuggestions) break
            try {
                const artists = await searchSpotifyArtists(
                    clientToken,
                    query,
                    6,
                )
                for (const artist of artists) {
                    if (out.length >= this.maxSuggestions) break
                    if (!seen.has(artist.id)) {
                        seen.add(artist.id)
                        out.push(artist)
                    }
                }
            } catch {
                // continue to next query
            }
        }

        return out
    }

    /**
     * Prewarm the popular artists cache at startup.
     * This prevents the first user request from hitting rate limits.
     */
    async prewarmCache(): Promise<void> {
        try {
            // Wait up to 30s for Redis to become healthy
            const start = Date.now()
            while (!redisClient.isHealthy() && Date.now() - start < 30_000) {
                await new Promise((r) => setTimeout(r, 500))
            }

            if (!redisClient.isHealthy()) {
                return
            }

            if (!isSpotifyAuthConfigured()) {
                return
            }

            const cached = await redisClient
                .get(this.fallbackCacheKey)
                .catch(() => null)
            if (cached) {
                return
            }

            const artists = await this.fetchPopularArtists()
            if (artists.length === 0) {
                return
            }

            await redisClient.setex(
                this.fallbackCacheKey,
                this.fallbackCacheTtlSeconds,
                JSON.stringify(artists),
            )
        } catch (error) {
            errorLog({ message: 'Failed to prewarm suggestions cache', error })
        }
    }

    // Route handlers — handle validation and return responses or throw errors

    private normalizeArtistKey(name: string): string {
        return name.toLowerCase().replace(/[^a-z0-9]/g, '')
    }

    async handleGetSuggestions(
        discordUserId: string | undefined,
    ): Promise<ArtistSuggestion[]> {
        if (!discordUserId) {
            throw { status: 401, error: 'Not authenticated' }
        }
        if (!isSpotifyAuthConfigured()) {
            throw { status: 503, error: 'Spotify not configured' }
        }

        const suggestions = await this.getSuggestions(discordUserId)
        if (suggestions.length === 0) {
            throw {
                status: 503,
                error: 'Artist suggestions temporarily unavailable',
            }
        }
        return suggestions
    }

    async handleSearchArtists(query: unknown): Promise<SpotifyArtist[]> {
        const q = typeof query === 'string' ? query.trim() : ''
        if (!q) {
            throw { status: 400, error: 'Missing query parameter q' }
        }
        if (!isSpotifyAuthConfigured()) {
            throw { status: 503, error: 'Spotify not configured' }
        }
        const token = await getSpotifyClientToken()
        if (!token) {
            throw { status: 503, error: 'Failed to get Spotify token' }
        }
        return searchSpotifyArtists(token, q, 12)
    }

    async handleGetRelatedArtists(
        artistId: string | undefined,
    ): Promise<SpotifyArtist[]> {
        if (!artistId) {
            throw { status: 400, error: 'Missing artistId parameter' }
        }
        if (!isSpotifyAuthConfigured()) {
            throw { status: 503, error: 'Spotify not configured' }
        }
        const token = await getSpotifyClientToken()
        if (!token) {
            throw { status: 503, error: 'Failed to get Spotify token' }
        }
        return getSpotifyRelatedArtists(token, artistId)
    }

    async handleGetPreferredArtists(
        discordUserId: string | undefined,
        guildId: unknown,
    ): Promise<unknown[]> {
        if (!discordUserId) {
            throw { status: 401, error: 'Not authenticated' }
        }
        const db = getPrismaClient()
        const guild = typeof guildId === 'string' ? guildId : undefined
        return db.userArtistPreference.findMany({
            where: { discordUserId, ...(guild ? { guildId: guild } : {}) },
            orderBy: { createdAt: 'desc' },
        })
    }

    async handleSavePreferredArtist(
        discordUserId: string | undefined,
        body: unknown,
    ): Promise<unknown> {
        if (!discordUserId) {
            throw { status: 401, error: 'Not authenticated' }
        }

        const schema = z.object({
            guildId: z.string().min(1),
            artistKey: z.string().min(1),
            artistName: z.string().min(1),
            spotifyId: z.string().nullable().optional(),
            imageUrl: z.string().nullable().optional(),
            preference: z.enum(['prefer', 'block']).default('prefer'),
        })

        const parsed = schema.safeParse(body)
        if (!parsed.success) {
            throw { status: 400, error: parsed.error.message }
        }

        const { guildId, artistName, spotifyId, imageUrl, preference } =
            parsed.data
        const artistKey = this.normalizeArtistKey(
            parsed.data.artistKey || artistName,
        )
        const db = getPrismaClient()
        return db.userArtistPreference.upsert({
            where: {
                discordUserId_guildId_artistKey: {
                    discordUserId,
                    guildId,
                    artistKey,
                },
            },
            update: { artistName, spotifyId, imageUrl, preference },
            create: {
                discordUserId,
                guildId,
                artistKey,
                artistName,
                spotifyId,
                imageUrl,
                preference,
            },
        })
    }

    async handleBatchSavePreferences(
        discordUserId: string | undefined,
        body: unknown,
    ): Promise<unknown[]> {
        if (!discordUserId) {
            throw { status: 401, error: 'Not authenticated' }
        }

        const schema = z.object({
            guildId: z.string().min(1),
            items: z.array(
                z.object({
                    artistId: z.string().min(1),
                    artistKey: z.string().min(1),
                    artistName: z.string().min(1),
                    imageUrl: z.string().nullable(),
                    preference: z.enum(['prefer', 'block']),
                }),
            ),
        })

        const parsed = schema.safeParse(body)
        if (!parsed.success) {
            throw { status: 400, error: parsed.error.message }
        }

        const { guildId, items } = parsed.data
        const db = getPrismaClient()
        const results: unknown[] = []
        for (const item of items) {
            const artistKey = this.normalizeArtistKey(
                item.artistKey || item.artistName,
            )
            const pref = await db.userArtistPreference.upsert({
                where: {
                    discordUserId_guildId_artistKey: {
                        discordUserId,
                        guildId,
                        artistKey,
                    },
                },
                update: {
                    artistName: item.artistName,
                    spotifyId: item.artistId,
                    imageUrl: item.imageUrl,
                    preference: item.preference,
                },
                create: {
                    discordUserId,
                    guildId,
                    artistKey,
                    artistName: item.artistName,
                    spotifyId: item.artistId,
                    imageUrl: item.imageUrl,
                    preference: item.preference,
                },
            })
            results.push(pref)
        }
        return results
    }

    async handleDeletePreferredArtist(
        discordUserId: string | undefined,
        artistKey: string | undefined,
        guildId: unknown,
    ): Promise<void> {
        if (!discordUserId) {
            throw { status: 401, error: 'Not authenticated' }
        }
        if (!artistKey) {
            throw { status: 400, error: 'Missing artistKey parameter' }
        }
        const guild = typeof guildId === 'string' ? guildId : undefined
        if (!guild) {
            throw { status: 400, error: 'Missing guildId query param' }
        }
        const db = getPrismaClient()
        await db.userArtistPreference.delete({
            where: {
                discordUserId_guildId_artistKey: {
                    discordUserId,
                    guildId: guild,
                    artistKey,
                },
            },
        })
    }
}
