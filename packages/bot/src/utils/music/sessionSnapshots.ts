import type { GuildQueue, Track } from 'discord-player'
import { QueryType } from 'discord-player'
import type { User } from 'discord.js'
import { randomUUID } from 'crypto'
import { getPrismaClient } from '@lucky/shared/utils'
import type { Prisma } from '@lucky/shared/utils'
import { debugLog, errorLog } from '@lucky/shared/utils'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'

export type SnapshotTrack = {
    title: string
    author: string
    url: string
    duration: string
    source: string
    recommendationReason?: string
    isAutoplay?: boolean
    requestedById?: string
}

export type QueueSessionSnapshot = {
    sessionSnapshotId: string
    guildId: string
    savedAt: number
    currentTrack: SnapshotTrack | null
    upcomingTracks: SnapshotTrack[]
    voiceChannelId?: string
}

export type SnapshotRestoreResult = {
    restoredCount: number
    sessionSnapshotId: string | null
}

const MAX_SNAPSHOT_TRACKS = 25

/** Maximum age in ms for a snapshot to be automatically restored (30 minutes). */
const DEFAULT_MAX_SNAPSHOT_AGE_MS = 30 * 60 * 1_000

type SearchOptions = {
    requestedBy?: User
    searchEngine: QueryType
}

/** Row shape this service reads from the `music_session_snapshots` table. */
interface SnapshotRow {
    sessionSnapshotId: string
    guildId: string
    savedAt: Date
    currentTrack: unknown
    upcomingTracks: unknown
    voiceChannelId: string | null
}

function toDurationString(duration: unknown): string {
    if (typeof duration === 'string') return duration
    if (typeof duration === 'number') return String(duration)
    return '0:00'
}

export function toSnapshotTrack(track: Track): SnapshotTrack {
    const metadata = (track.metadata ?? {}) as {
        recommendationReason?: string
        isAutoplay?: boolean
        requestedById?: string
    }

    return {
        title: track.title,
        author: track.author,
        url: track.url,
        duration: toDurationString(track.duration),
        source: track.source ?? 'unknown',
        recommendationReason: metadata.recommendationReason,
        isAutoplay: metadata.isAutoplay,
        requestedById: metadata.requestedById,
    }
}

function applySnapshotMetadata(
    track: Track,
    snapshotId: string,
    recommendationReason?: string,
    isAutoplay?: boolean,
    requestedById?: string,
): void {
    const existing = (track.metadata ?? {}) as Record<string, unknown>
    track.setMetadata({
        ...existing,
        sessionSnapshotId: snapshotId,
        recommendationReason:
            recommendationReason ?? existing.recommendationReason,
        isAutoplay: isAutoplay ?? existing.isAutoplay,
        requestedById: requestedById ?? existing.requestedById,
    })
}

/**
 * Persists the live queue state per guild (one snapshot each) in Postgres, so a
 * session can be restored after a bot restart. A snapshot is overwritten on each
 * save and deleted after a successful restore. Two independent staleness bounds
 * apply: `ttlSeconds` (storage TTL, lazy-expired on read) and `maxSnapshotAgeMs`
 * (the stricter restore guard — older snapshots are not auto-restored).
 */
export class MusicSessionSnapshotService {
    constructor(
        private readonly ttlSeconds = ENVIRONMENT_CONFIG.SESSIONS
            .QUEUE_SESSION_TTL,
        private readonly maxSnapshotAgeMs = DEFAULT_MAX_SNAPSHOT_AGE_MS,
    ) {}

    /** Maps a `music_session_snapshots` row to the public snapshot shape. */
    private rowToSnapshot(row: SnapshotRow): QueueSessionSnapshot {
        return {
            sessionSnapshotId: row.sessionSnapshotId,
            guildId: row.guildId,
            savedAt: row.savedAt.getTime(),
            currentTrack: (row.currentTrack ?? null) as SnapshotTrack | null,
            upcomingTracks: (row.upcomingTracks ?? []) as SnapshotTrack[],
            voiceChannelId: row.voiceChannelId ?? undefined,
        }
    }

    async saveSnapshot(
        queue: GuildQueue,
    ): Promise<QueueSessionSnapshot | null> {
        try {
            const guildId = queue.guild.id
            const currentTrack = queue.currentTrack
            const upcomingTracks = queue.tracks
                .toArray()
                .slice(0, MAX_SNAPSHOT_TRACKS)
                .map((track) => toSnapshotTrack(track as Track))

            if (!currentTrack && upcomingTracks.length === 0) {
                return null
            }

            const currentSnapshot = currentTrack
                ? toSnapshotTrack(currentTrack as Track)
                : null
            const sessionSnapshotId = randomUUID()
            const prisma = getPrismaClient()

            // One snapshot per guild: overwrite by replacing the row. (delete +
            // create avoids the Json-null footgun of clearing currentTrack on update.)
            await prisma.musicSessionSnapshot.deleteMany({ where: { guildId } })
            await prisma.musicSessionSnapshot.create({
                data: {
                    guildId,
                    sessionSnapshotId,
                    voiceChannelId: queue.channel?.id ?? null,
                    upcomingTracks:
                        upcomingTracks as unknown as Prisma.InputJsonValue,
                    ...(currentSnapshot
                        ? {
                              currentTrack:
                                  currentSnapshot as unknown as Prisma.InputJsonValue,
                          }
                        : {}),
                },
            })

            return {
                sessionSnapshotId,
                guildId,
                savedAt: Date.now(),
                currentTrack: currentSnapshot,
                upcomingTracks,
                voiceChannelId: queue.channel?.id,
            }
        } catch (error) {
            errorLog({
                message: 'Failed to save music session snapshot',
                error,
            })
            return null
        }
    }

    /**
     * Clears the snapshot for a guild when only the current track exists.
     * Used to prevent watchdog from re-enqueuing the same song on orphan recovery.
     */
    async clearSnapshotIfStale(queue: GuildQueue): Promise<void> {
        if (!queue.currentTrack || queue.tracks.size > 0) {
            return
        }

        const snapshot = await this.getSnapshot(queue.guild.id)
        if (!snapshot || snapshot.upcomingTracks.length > 0) {
            return
        }

        await this.deleteSnapshot(queue.guild.id)
        debugLog({
            message: 'Cleared stale snapshot (only current track)',
            data: { guildId: queue.guild.id },
        })
    }

    async getSnapshot(guildId: string): Promise<QueueSessionSnapshot | null> {
        try {
            const prisma = getPrismaClient()
            const row = await prisma.musicSessionSnapshot.findUnique({
                where: { guildId },
            })
            if (!row) return null

            // Lazy storage-TTL expiry: prune snapshots older than ttlSeconds.
            if (row.savedAt.getTime() < Date.now() - this.ttlSeconds * 1000) {
                await this.deleteSnapshot(guildId)
                return null
            }

            return this.rowToSnapshot(row)
        } catch (error) {
            errorLog({
                message: 'Failed to read music session snapshot',
                error,
            })
            return null
        }
    }

    /**
     * Lists guild IDs that currently have a non-expired snapshot. Replaces the
     * watchdog's old Redis `keys('music:session:*')` scan now that snapshots live
     * in Postgres. Filters by the storage TTL so callers don't act on stale rows.
     */
    async listGuildIds(): Promise<string[]> {
        try {
            const prisma = getPrismaClient()
            const cutoff = new Date(Date.now() - this.ttlSeconds * 1000)
            const rows = await prisma.musicSessionSnapshot.findMany({
                where: { savedAt: { gte: cutoff } },
                select: { guildId: true },
            })
            return rows.map((r) => r.guildId)
        } catch (error) {
            errorLog({
                message: 'Failed to list music session snapshot guilds',
                error,
            })
            return []
        }
    }

    /**
     * Delete the snapshot for a guild.
     * Called after a successful restore so the same snapshot is not re-applied
     * on subsequent connections.
     */
    async deleteSnapshot(guildId: string): Promise<void> {
        try {
            const prisma = getPrismaClient()
            await prisma.musicSessionSnapshot.deleteMany({ where: { guildId } })
        } catch (error) {
            errorLog({
                message: 'Failed to delete music session snapshot',
                error,
            })
        }
    }

    async restoreSnapshot(
        queue: GuildQueue,
        requestedBy?: User,
        options: { maxAgeMs?: number; skipCurrentTrack?: boolean } = {},
    ): Promise<SnapshotRestoreResult> {
        try {
            if (queue.currentTrack || queue.tracks.size > 0) {
                return { restoredCount: 0, sessionSnapshotId: null }
            }

            const snapshot = await this.getSnapshot(queue.guild.id)
            if (!snapshot) {
                return { restoredCount: 0, sessionSnapshotId: null }
            }

            // Staleness guard: reject snapshots older than maxAgeMs.
            const maxAge = options.maxAgeMs ?? this.maxSnapshotAgeMs
            if (Date.now() - snapshot.savedAt > maxAge) {
                debugLog({
                    message:
                        'Music session snapshot is too old; skipping restore',
                    data: {
                        guildId: queue.guild.id,
                        savedAt: snapshot.savedAt,
                        ageMs: Date.now() - snapshot.savedAt,
                        maxAgeMs: maxAge,
                    },
                })
                return { restoredCount: 0, sessionSnapshotId: null }
            }

            const searchOptions: SearchOptions = {
                searchEngine: QueryType.AUTO,
                ...(requestedBy ? { requestedBy } : {}),
            }

            // Build ordered track list: currentTrack first so it replays from the top.
            // Unless skipCurrentTrack is true (used during orphan session recovery to avoid replaying the same song).
            const tracksToRestore: SnapshotTrack[] = [
                ...(snapshot.currentTrack && !options.skipCurrentTrack
                    ? [snapshot.currentTrack]
                    : []),
                ...snapshot.upcomingTracks,
            ]

            let restoredCount = 0
            try {
                for (const entry of tracksToRestore) {
                    const query =
                        entry.url || `${entry.title} ${entry.author}`.trim()
                    const result = await queue.player.search(
                        query,
                        searchOptions,
                    )
                    const track = result.tracks[0]
                    if (!track) continue

                    applySnapshotMetadata(
                        track as Track,
                        snapshot.sessionSnapshotId,
                        entry.recommendationReason,
                        entry.isAutoplay,
                        entry.requestedById,
                    )
                    queue.addTrack(track)
                    restoredCount += 1
                }
            } catch (loopError) {
                // Rollback: clear partial queue state on any search/add failure
                queue.clear()
                errorLog({
                    message:
                        'Failed to restore track during restore loop; rolling back queue',
                    error: loopError,
                })
                return { restoredCount: 0, sessionSnapshotId: null }
            }

            if (restoredCount > 0) {
                // Clear the snapshot after a successful restore so it cannot
                // be applied again on the next connection event.
                await this.deleteSnapshot(queue.guild.id)

                if (!queue.node.isPlaying()) {
                    await queue.node.play()
                }
            }

            debugLog({
                message: 'Music session snapshot restored',
                data: {
                    guildId: queue.guild.id,
                    restoredCount,
                    sessionSnapshotId: snapshot.sessionSnapshotId,
                },
            })

            return {
                restoredCount,
                sessionSnapshotId:
                    restoredCount > 0 ? snapshot.sessionSnapshotId : null,
            }
        } catch (error) {
            errorLog({
                message: 'Failed to restore music session snapshot',
                error,
            })
            return { restoredCount: 0, sessionSnapshotId: null }
        }
    }
}

export const musicSessionSnapshotService = new MusicSessionSnapshotService()
