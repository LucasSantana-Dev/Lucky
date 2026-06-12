import { z } from 'zod'
import {
    type SpotifyArtist,
    debugLog,
    errorLog,
    getPrismaClient,
    searchSpotifyArtists,
    getSpotifyRelatedArtists,
    warnLog,
} from '@lucky/shared/utils'
import { withTimeout } from '@lucky/shared/utils/async'
import { TtlCache } from '@lucky/shared/utils/cache'
import { spotifyLinkService } from '@lucky/shared/services'
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
    // Per-tier deadline. A cache miss used to mean an unbounded synchronous
    // Spotify fetch with no timeout anywhere, so the Discover tab spun forever.
    // Each tier (including the Postgres read) is now bounded; on timeout the
    // tier is skipped and whatever was already collected is returned.
    private readonly tierTimeoutMs = 5000
    // Caches moved off Redis (being decommissioned; an unhealthy client meant a
    // miss on every load) into bounded in-memory TTL caches. Suggestions are
    // regenerable/ephemeral, so this is the right trade per the Redis-removal
    // ADRs (single-instance; revisit if Lucky scales out).
    private readonly userTopArtistsCache: TtlCache<SpotifyArtist[]>
    private readonly fallbackCache: TtlCache<SpotifyArtist[]>

    constructor(config: ArtistSuggestionServiceConfig = {}) {
        const merged = { ...DEFAULT_CONFIG, ...config }
        this.maxSuggestions = merged.maxSuggestions
        this.fallbackCacheTtlSeconds = merged.fallbackCacheTtlSeconds
        this.userTopArtistsCacheTtlSeconds =
            merged.userTopArtistsCacheTtlSeconds
        this.userTopArtistsCache = new TtlCache<SpotifyArtist[]>({
            ttlMs: this.userTopArtistsCacheTtlSeconds * 1000,
            maxEntries: 1000,
        })
        this.fallbackCache = new TtlCache<SpotifyArtist[]>({
            ttlMs: this.fallbackCacheTtlSeconds * 1000,
            maxEntries: 1,
        })
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
        await this.runTier('preferred', () =>
            this.loadPreferredArtists(discordUserId, guildId, suggestions),
        )
        if (suggestions.size >= this.maxSuggestions) {
            return Array.from(suggestions.values())
        }

        // Tier 2: User's Spotify top artists
        await this.runTier('spotify-top', () =>
            this.loadSpotifyTopArtists(discordUserId, suggestions),
        )
        if (suggestions.size >= this.maxSuggestions) {
            return Array.from(suggestions.values())
        }

        // Tier 3: Popular artists fallback
        await this.runTier('popular', () =>
            this.loadPopularArtistsFallback(suggestions),
        )

        return Array.from(suggestions.values()).slice(0, this.maxSuggestions)
    }

    /**
     * Run one suggestion tier under a hard deadline. Each `loadX` already
     * swallows its own errors (mutating the shared suggestions map), so this
     * wrapper only ever catches a {@link withTimeout} timeout — at which point
     * the tier is skipped and the request proceeds with whatever was collected,
     * guaranteeing the endpoint returns rather than hanging.
     */
    private async runTier(
        tier: string,
        run: () => Promise<void>,
    ): Promise<void> {
        const startedAt = Date.now()
        try {
            await withTimeout(run(), this.tierTimeoutMs, `suggestions:${tier}`)
            debugLog({
                message: 'Suggestion tier completed',
                data: { tier, ms: Date.now() - startedAt },
            })
        } catch (error) {
            warnLog({
                message: 'Suggestion tier timed out and was skipped',
                error,
                data: { tier, ms: Date.now() - startedAt },
            })
        }
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

            const cachedTop = this.userTopArtistsCache.get(discordUserId)

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

                if (topArtists.length > 0) {
                    this.userTopArtistsCache.set(discordUserId, topArtists)
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
            let fallback = this.fallbackCache.get(this.fallbackCacheKey) ?? []

            if (fallback.length === 0) {
                fallback = await this.fetchPopularArtists()
                if (fallback.length > 0) {
                    this.fallbackCache.set(this.fallbackCacheKey, fallback)
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
            } catch (error) {
                // continue to next query — but leave a trace (#1285)
                debugLog({
                    message: 'Spotify popular-artist search failed',
                    data: { query, error: String(error) },
                })
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
            if (!isSpotifyAuthConfigured()) {
                return
            }

            if (this.fallbackCache.get(this.fallbackCacheKey)) {
                return
            }

            // Populate the in-memory fallback cache at startup so the first
            // Discover request hits a warm cache instead of the ~20-call
            // Spotify search (which would otherwise blow the per-tier deadline).
            const artists = await this.fetchPopularArtists()
            if (artists.length === 0) {
                return
            }

            this.fallbackCache.set(this.fallbackCacheKey, artists)
        } catch (error) {
            errorLog({ message: 'Failed to prewarm suggestions cache', error })
        }
    }

    /** Clear the in-memory caches. Test-only — keeps suites isolated. */
    resetCachesForTests(): void {
        this.userTopArtistsCache.clear()
        this.fallbackCache.clear()
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
