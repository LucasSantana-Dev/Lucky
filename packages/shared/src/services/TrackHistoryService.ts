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
    metadata?: { isAutoplay?: boolean }
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
 * History is capped per guild to the most-recent `maxHistorySize` rows (trimmed
 * on write) and expires after `ttl` seconds, applied lazily on read (rows older
 * than the cutoff are filtered out). A `cleanupOldData()` sweep is available for
 * housekeeping. The short-lived "recently played" marker used for duplicate
 * detection is kept in-memory (ephemeral — rebuilt after a restart by design).
 */
export class TrackHistoryService {
    private readonly ttlSeconds: number
    private readonly maxHistorySize: number
    /** Ephemeral per-(guild,url) recently-played markers → expiry epoch ms. */
    private readonly recentlyPlayed = new Map<string, number>()

    constructor(ttl = 7 * 24 * 60 * 60, maxHistorySize = 100) {
        this.ttlSeconds = ttl
        this.maxHistorySize = maxHistorySize
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
                    source: inferSource(track.url),
                    playedBy,
                    isAutoplay: Boolean(track.metadata?.isAutoplay ?? false),
                },
            })

            await this.trimToMaxSize(guildId)

            infoLog({
                message: `Added track to history: ${track.title} in guild ${guildId}`,
            })
            return true
        } catch (error) {
            errorLog({ message: 'Failed to add track to history', error })
            return false
        }
    }

    /** Trims a guild's history to the most-recent `maxHistorySize` rows. */
    private async trimToMaxSize(guildId: string): Promise<void> {
        const prisma = getPrismaClient()
        const overflow = await prisma.trackHistory.findMany({
            where: { guildId },
            orderBy: { playedAt: 'desc' },
            skip: this.maxHistorySize,
            select: { id: true },
        })
        if (overflow.length > 0) {
            await prisma.trackHistory.deleteMany({
                where: { id: { in: overflow.map((r) => r.id) } },
            })
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

    /** Deletes history rows older than the TTL across all guilds; returns count. */
    async cleanupOldData(): Promise<number> {
        try {
            const prisma = getPrismaClient()
            const result = await prisma.trackHistory.deleteMany({
                where: { playedAt: { lt: this.cutoff() } },
            })
            return result.count
        } catch (error) {
            errorLog({ message: 'Failed to clean up old track history', error })
            return 0
        }
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

            const rows = await prisma.trackHistory.findMany({
                where: {
                    guildId,
                    playedAt: { gte: thirtyDaysAgo },
                },
                select: { trackId: true, author: true },
            })

            // Count occurrences and filter to replayCount > 2.
            const trackCounts = new Map<string, number>()
            const artistCounts = new Map<string, number>()

            for (const row of rows) {
                trackCounts.set(
                    row.trackId,
                    (trackCounts.get(row.trackId) ?? 0) + 1,
                )
                artistCounts.set(row.author, (artistCounts.get(row.author) ?? 0) + 1)
            }

            const trackIds = new Set<string>()
            const artists = new Set<string>()

            for (const [trackId, count] of trackCounts.entries()) {
                if (count > 2) trackIds.add(trackId)
            }

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
