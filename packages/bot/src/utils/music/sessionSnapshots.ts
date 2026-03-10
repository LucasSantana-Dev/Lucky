import type { GuildQueue, Track } from 'discord-player'
import { QueryType } from 'discord-player'
import type { User } from 'discord.js'
import { randomUUID } from 'crypto'
import { redisClient } from '@lucky/shared/services'
import { debugLog, errorLog } from '@lucky/shared/utils'

export type SnapshotTrack = {
    title: string
    author: string
    url: string
    duration: string
    source: string
    recommendationReason?: string
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

type SearchOptions = {
    requestedBy?: User
    searchEngine: QueryType
}

function toDurationString(duration: unknown): string {
    if (typeof duration === 'string') return duration
    if (typeof duration === 'number') return String(duration)
    return '0:00'
}

function toSnapshotTrack(track: Track): SnapshotTrack {
    const metadata = (track.metadata ?? {}) as {
        recommendationReason?: string
    }

    return {
        title: track.title,
        author: track.author,
        url: track.url,
        duration: toDurationString(track.duration),
        source: track.source ?? 'unknown',
        recommendationReason: metadata.recommendationReason,
    }
}

function applySnapshotMetadata(
    track: Track,
    snapshotId: string,
    recommendationReason?: string,
): void {
    const mutableTrack = track as unknown as {
        metadata?: Record<string, unknown>
    }
    const metadata = mutableTrack.metadata ?? {}
    mutableTrack.metadata = {
        ...metadata,
        sessionSnapshotId: snapshotId,
        recommendationReason:
            recommendationReason ?? metadata.recommendationReason,
    }
}

export class MusicSessionSnapshotService {
    constructor(private readonly ttlSeconds = 7_200) {}

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

    async restoreSnapshot(
        queue: GuildQueue,
        requestedBy?: User,
    ): Promise<SnapshotRestoreResult> {
        try {
            if (queue.currentTrack || queue.tracks.size > 0) {
                return { restoredCount: 0, sessionSnapshotId: null }
            }

            const snapshot = await this.getSnapshot(queue.guild.id)
            if (!snapshot) {
                return { restoredCount: 0, sessionSnapshotId: null }
            }

            const searchOptions: SearchOptions = {
                searchEngine: QueryType.AUTO,
                ...(requestedBy ? { requestedBy } : {}),
            }

            let restoredCount = 0
            for (const entry of snapshot.upcomingTracks) {
                const query =
                    entry.url || `${entry.title} ${entry.author}`.trim()
                const result = await queue.player.search(query, searchOptions)
                const track = result.tracks[0]
                if (!track) continue

                applySnapshotMetadata(
                    track as Track,
                    snapshot.sessionSnapshotId,
                    entry.recommendationReason,
                )
                queue.addTrack(track)
                restoredCount += 1
            }

            if (restoredCount > 0 && !queue.node.isPlaying()) {
                await queue.node.play()
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
                sessionSnapshotId: snapshot.sessionSnapshotId,
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
