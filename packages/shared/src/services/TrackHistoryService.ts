import { getPrismaClient } from '../utils/database/prismaClient'
import { infoLog, errorLog } from '../utils/general/log'

/** A track entry in guild playback history. */
export interface TrackHistoryEntry {
    trackId: string
    title: string
    author: string
    duration: string
    url: string
    timestamp: number
    guildId: string
    playedBy?: string
    isAutoplay?: boolean
}

/** Input data for adding a track to history. */
export interface TrackHistoryInput {
    id: string
    title: string
    author: string
    duration: string
    url: string
    /** Original search query, when known — logged alongside the resolved
     * title so requested-vs-delivered mismatches (e.g. remix substitution)
     * can be queried instead of guessed from the title alone. */
    requestedQuery?: string
    metadata?: { isAutoplay?: boolean }
    /** True when the play ended by a skip rather than playing out. */
    skipped?: boolean
    /** Cover art URL from the extractor; feeds the recap card (#2700). */
    thumbnail?: string
    /** Seconds actually played, when the play start time is known. */
    playDuration?: number
    /** True when the track was added as part of a playlist, not a single search. */
    isPlaylist?: boolean
}

/** Statistics for guild track playback history. */
export interface TrackHistoryStats {
    totalTracks: number
    totalPlayTime: number
    topArtists: Array<{ artist: string; plays: number }>
    topTracks: Array<{ trackId: string; title: string; plays: number }>
    lastUpdated: Date
}

/** Shape of the Prisma row fields this service reads. */
interface TrackHistoryRow {
    trackId: string
    title: string
    author: string
    duration: string
    url: string
    playedAt: Date
    guildId: string
    playedBy: string | null
    isAutoplay: boolean
}

/** Infers a coarse source label from a track URL. */
function inferSource(url: string): string {
    const u = url.toLowerCase()
    if (u.includes('youtube') || u.includes('youtu.be')) return 'youtube'
    if (u.includes('spotify')) return 'spotify'
    if (u.includes('soundcloud')) return 'soundcloud'
    return 'unknown'
}

/**
 * Manages guild track playback history in Postgres (via Prisma).
 *
 * Most reads expire after `ttl` seconds, applied lazily (rows older than the
 * cutoff are filtered out), and read helpers take their own row limits; the
 * exception is `getReplayFrequentTracks`, which counts a fixed 30-day window.
 * Rows are not trimmed per guild: retention is the scheduled 30-day
 * `DatabaseService.cleanupOldData` sweep, so a whole week stays readable for
 * the weekly recap (`weeklyRecap.ts`, #2678). The short-lived "recently
 * played" marker used for duplicate detection is kept in-memory (ephemeral,
 * rebuilt after a restart by design).
 */
export class TrackHistoryService {
    private readonly ttlSeconds: number
    /** Ephemeral per-(guild,url) recently-played markers → expiry epoch ms. */
    private readonly recentlyPlayed = new Map<string, number>()

    constructor(ttl = 7 * 24 * 60 * 60) {
        this.ttlSeconds = ttl
    }

    /** Cutoff `Date` for TTL-based lazy expiry. */
    private cutoff(): Date {
        return new Date(Date.now() - this.ttlSeconds * 1000)
    }

    /** Maps a Prisma row to the public `TrackHistoryEntry` shape. */
    private rowToEntry(row: TrackHistoryRow): TrackHistoryEntry {
        return {
            trackId: row.trackId,
            title: row.title,
            author: row.author,
            duration: row.duration,
            url: row.url,
            timestamp: row.playedAt.getTime(),
            guildId: row.guildId,
            playedBy: row.playedBy ?? undefined,
            isAutoplay: row.isAutoplay,
        }
    }

    /** Adds a track to a guild's playback history. */
    async addTrackToHistory(
        track: TrackHistoryInput,
        guildId: string,
        playedBy?: string,
    ): Promise<boolean> {
        try {
            const prisma = getPrismaClient()
            await prisma.trackHistory.create({
                data: {
                    guildId,
                    trackId: track.id,
                    title: track.title,
                    author: track.author,
                    duration: track.duration,
                    url: track.url,
                    thumbnail: track.thumbnail || null,
                    source: inferSource(track.url),
                    playedBy,
                    playDuration: track.playDuration,
                    skipped: track.skipped ?? false,
                    isAutoplay: Boolean(track.metadata?.isAutoplay ?? false),
                    isPlaylist: Boolean(track.isPlaylist ?? false),
                },
            })

            infoLog({
                message: `Added track to history: ${track.title} in guild ${guildId}`,
                data: track.requestedQuery
                    ? { requestedQuery: track.requestedQuery }
                    : undefined,
            })
            return true
        } catch (error) {
            errorLog({ message: 'Failed to add track to history', error })
            return false
        }
    }

    /** Retrieves track history for a guild with pagination (most-recent first). */
    async getTrackHistory(
        guildId: string,
        limit = 10,
        offset = 0,
    ): Promise<TrackHistoryEntry[]> {
        try {
            const prisma = getPrismaClient()
            const rows = await prisma.trackHistory.findMany({
                where: { guildId, playedAt: { gte: this.cutoff() } },
                orderBy: { playedAt: 'desc' },
                take: limit,
                skip: offset,
            })
            return rows.map((row) => this.rowToEntry(row))
        } catch (error) {
            errorLog({ message: 'Failed to get track history', error })
            return []
        }
    }

    /** Retrieves the most recently played track for a guild. */
    async getLastTrack(guildId: string): Promise<TrackHistoryEntry | null> {
        try {
            const prisma = getPrismaClient()
            const row = await prisma.trackHistory.findFirst({
                where: { guildId, playedAt: { gte: this.cutoff() } },
                orderBy: { playedAt: 'desc' },
            })
            return row ? this.rowToEntry(row) : null
        } catch (error) {
            errorLog({ message: 'Failed to get last track', error })
            return null
        }
    }

    /** Gets the total count of (non-expired) tracks in a guild's history. */
    async getTrackHistoryCount(guildId: string): Promise<number> {
        try {
            const prisma = getPrismaClient()
            return await prisma.trackHistory.count({
                where: { guildId, playedAt: { gte: this.cutoff() } },
            })
        } catch (error) {
            errorLog({ message: 'Failed to get track history count', error })
            return 0
        }
    }

    /** Clears all track history for a guild. */
    async clearHistory(guildId: string): Promise<boolean> {
        try {
            const prisma = getPrismaClient()
            await prisma.trackHistory.deleteMany({ where: { guildId } })
            this.clearRecentlyPlayed(guildId)
            infoLog({ message: `Cleared track history for guild ${guildId}` })
            return true
        } catch (error) {
            errorLog({ message: 'Failed to clear track history', error })
            return false
        }
    }

    /** Checks if a track was recently played within a time window. */
    async isDuplicateTrack(
        guildId: string,
        trackUrl: string,
        _timeWindow = 300000,
    ): Promise<boolean> {
        try {
            const history = await this.getTrackHistory(guildId, 20)
            const cutoffTime = Date.now() - _timeWindow

            return history.some(
                (entry) =>
                    entry.url === trackUrl && entry.timestamp > cutoffTime,
            )
        } catch (error) {
            errorLog({ message: 'Failed to check for duplicate track', error })
            return false
        }
    }

    /** Retrieves top played tracks for a guild. */
    async getTopTracks(
        guildId: string,
        limit = 10,
    ): Promise<Array<{ trackId: string; title: string; plays: number }>> {
        try {
            const history = await this.getTrackHistory(guildId, 100)
            const trackCounts = new Map<
                string,
                { title: string; count: number }
            >()

            history.forEach((entry) => {
                const current = trackCounts.get(entry.trackId) || {
                    title: entry.title,
                    count: 0,
                }
                trackCounts.set(entry.trackId, {
                    ...current,
                    count: current.count + 1,
                })
            })

            return Array.from(trackCounts.entries())
                .map(([trackId, data]) => ({
                    trackId,
                    title: data.title,
                    plays: data.count,
                }))
                .sort((a, b) => b.plays - a.plays)
                .slice(0, limit)
        } catch (error) {
            errorLog({ message: 'Failed to get top tracks', error })
            return []
        }
    }

    /** Retrieves top artists by play count for a guild. */
    async getTopArtists(
        guildId: string,
        limit = 10,
    ): Promise<Array<{ artist: string; plays: number }>> {
        try {
            const history = await this.getTrackHistory(guildId, 100)
            const artistCounts = new Map<string, number>()

            history.forEach((entry) => {
                const current = artistCounts.get(entry.author) || 0
                artistCounts.set(entry.author, current + 1)
            })

            return Array.from(artistCounts.entries())
                .map(([artist, plays]) => ({ artist, plays }))
                .sort((a, b) => b.plays - a.plays)
                .slice(0, limit)
        } catch (error) {
            errorLog({ message: 'Failed to get top artists', error })
            return []
        }
    }

    /** Generates comprehensive playback statistics for a guild. */
    async generateStats(guildId: string): Promise<TrackHistoryStats | null> {
        try {
            const history = await this.getTrackHistory(guildId, 100)

            if (history.length === 0) {
                return null
            }

            const totalTracks = history.length
            const totalPlayTime = history.reduce((total, entry) => {
                const duration = this.parseDuration(entry.duration)
                return total + duration
            }, 0)

            const topArtists = await this.getTopArtists(guildId, 5)
            const topTracks = await this.getTopTracks(guildId, 5)

            return {
                totalTracks,
                totalPlayTime,
                topArtists,
                topTracks,
                lastUpdated: new Date(),
            }
        } catch (error) {
            errorLog({ message: 'Failed to generate stats', error })
            return null
        }
    }

    /** Parses duration string (MM:SS format) to seconds. */
    private parseDuration(duration: string): number {
        const parts = duration.split(':')
        if (parts.length === 2) {
            return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
        }
        return 0
    }

    /** Marks a track as recently played (ephemeral, in-memory) for dedup. */
    markTrackAsPlayed(guildId: string, trackUrl: string): Promise<void> {
        const now = Date.now()
        this.recentlyPlayed.set(`${guildId}:${trackUrl}`, now + 300_000)
        // Opportunistically prune expired markers to bound the map.
        for (const [key, expiry] of this.recentlyPlayed) {
            if (expiry <= now) this.recentlyPlayed.delete(key)
        }
        return Promise.resolve()
    }

    /** Clears all track data (history rows + ephemeral markers) for a guild. */
    async clearAllGuildCaches(guildId: string): Promise<void> {
        try {
            const prisma = getPrismaClient()
            await prisma.trackHistory.deleteMany({ where: { guildId } })
            this.clearRecentlyPlayed(guildId)
        } catch (error) {
            errorLog({ message: 'Failed to clear guild caches', error })
        }
    }

    /** Removes ephemeral recently-played markers for a guild. */
    private clearRecentlyPlayed(guildId: string): void {
        const prefix = `${guildId}:`
        for (const key of this.recentlyPlayed.keys()) {
            if (key.startsWith(prefix)) this.recentlyPlayed.delete(key)
        }
    }

    /**
     * Retrieves tracks and artists that have been replayed frequently (replayCount > 2)
     * within the last 30 days, for autoplay replay-boost candidate filtering.
     *
     * Returns two sets: track IDs and artist names for efficient matching in scoring.
     * Fails open (returns empty sets) on error to prevent pool starvation.
     */
    async getReplayFrequentTracks(
        guildId: string,
    ): Promise<{ trackIds: Set<string>; artists: Set<string> }> {
        try {
            const prisma = getPrismaClient()
            const thirtyDaysAgo = new Date(
                Date.now() - 30 * 24 * 60 * 60 * 1000,
            )

            // Skipped plays are not replays: they must not earn a boost.
            const where = {
                guildId,
                playedAt: { gte: thirtyDaysAgo },
                skipped: false,
            }

            // Counted in SQL: history is no longer trimmed per guild (#2678),
            // so a row cap here would silently drop older plays.
            const [trackGroups, artistGroups] = await Promise.all([
                prisma.trackHistory.groupBy({
                    by: ['trackId'],
                    where,
                    _count: { _all: true },
                }),
                prisma.trackHistory.groupBy({
                    by: ['author'],
                    where,
                    _count: { _all: true },
                }),
            ])

            // Keep only replayCount > 2.
            const trackIds = new Set(
                trackGroups
                    .filter((g) => g._count._all > 2)
                    .map((g) => g.trackId),
            )

            // Artist spellings are normalized after grouping, so sum them here.
            const artistCounts = new Map<string, number>()
            for (const g of artistGroups) {
                const normalizedArtist = g.author.toLowerCase().trim()
                artistCounts.set(
                    normalizedArtist,
                    (artistCounts.get(normalizedArtist) ?? 0) + g._count._all,
                )
            }
            const artists = new Set<string>()
            for (const [artist, count] of artistCounts.entries()) {
                if (count > 2) artists.add(artist)
            }

            return { trackIds, artists }
        } catch (error) {
            errorLog({
                message: 'Failed to get replay-frequent tracks',
                error,
            })
            // Fail open: return empty sets so autoplay continues without boost.
            return { trackIds: new Set(), artists: new Set() }
        }
    }

    /** Generates statistics on autoplay recommendations for a guild. */
    async getAutoplayStats(
        guildId: string,
        limit = 200,
    ): Promise<{
        total: number
        autoplayCount: number
        autoplayPercent: number
        topAutoplayArtists: Array<{ artist: string; count: number }>
    }> {
        try {
            const history = await this.getTrackHistory(guildId, limit)
            const autoplayEntries = history.filter((e) => e.isAutoplay === true)
            const artistCounts = new Map<string, number>()

            for (const entry of autoplayEntries) {
                if (entry.author) {
                    const key = entry.author.toLowerCase()
                    artistCounts.set(key, (artistCounts.get(key) ?? 0) + 1)
                }
            }

            const topAutoplayArtists = Array.from(artistCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([artist, count]) => ({ artist, count }))

            return {
                total: history.length,
                autoplayCount: autoplayEntries.length,
                autoplayPercent:
                    history.length > 0
                        ? Math.round(
                              (autoplayEntries.length / history.length) * 100,
                          )
                        : 0,
                topAutoplayArtists,
            }
        } catch (error) {
            errorLog({ message: 'Failed to get autoplay stats', error })
            return {
                total: 0,
                autoplayCount: 0,
                autoplayPercent: 0,
                topAutoplayArtists: [],
            }
        }
    }
}

/** Singleton instance of TrackHistoryService. */
export const trackHistoryService = new TrackHistoryService()
