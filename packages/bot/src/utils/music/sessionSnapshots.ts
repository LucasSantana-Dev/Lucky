import type { GuildQueue, Track } from 'discord-player'
import { QueryType } from 'discord-player'
import type { User } from 'discord.js'
import { randomUUID } from 'crypto'
import { redisClient } from '@lucky/shared/services'
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

export class MusicSessionSnapshotService {
    constructor(
        private readonly ttlSeconds = ENVIRONMENT_CONFIG.SESSIONS
            .QUEUE_SESSION_TTL,
        private readonly maxSnapshotAgeMs = DEFAULT_MAX_SNAPSHOT_AGE_MS,
    ) {}

    private getKey(guildId: string): string {
        return `music:session:${guildId}`
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

            const snapshot: QueueSessionSnapshot = {
                sessionSnapshotId: randomUUID(),
                guildId,
                savedAt: Date.now(),
                currentTrack: currentTrack
                    ? toSnapshotTrack(currentTrack as Track)
                    : null,
                upcomingTracks,
                voiceChannelId: queue.channel?.id,
            }

            await redisClient.setex(
                this.getKey(guildId),
                this.ttlSeconds,
                JSON.stringify(snapshot),
            )

            return snapshot
        } catch (error) {
            errorLog({
                message: 'Failed to save music session snapshot',
                error,
            })
            return null
        }
    }

    async getSnapshot(guildId: string): Promise<QueueSessionSnapshot | null> {
        try {
            const raw = await redisClient.get(this.getKey(guildId))
            if (!raw) return null
            const parsed = JSON.parse(raw) as QueueSessionSnapshot
            return parsed
        } catch (error) {
            errorLog({
                message: 'Failed to read music session snapshot',
                error,
            })
            return null
        }
    }

    /**
     * Delete the snapshot for a guild from Redis.
     * Called after a successful restore so the same snapshot is not re-applied
     * on subsequent connections.
     */
    async deleteSnapshot(guildId: string): Promise<void> {
        try {
            await redisClient.del(this.getKey(guildId))
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
        options: { maxAgeMs?: number } = {},
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
            const tracksToRestore: SnapshotTrack[] = [
                ...(snapshot.currentTrack ? [snapshot.currentTrack] : []),
                ...snapshot.upcomingTracks,
            ]

            let restoredCount = 0
            for (const entry of tracksToRestore) {
                const query =
                    entry.url || `${entry.title} ${entry.author}`.trim()
                const result = await queue.player.search(query, searchOptions)
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
