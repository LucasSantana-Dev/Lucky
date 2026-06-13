import type { GuildQueue, Track } from 'discord-player'
import { QueryType } from 'discord-player'
import type { User } from 'discord.js'
import { getPrismaClient, debugLog, errorLog } from '@lucky/shared/utils'
import type { Prisma } from '@lucky/shared/utils'
import { toSnapshotTrack, type SnapshotTrack } from './sessionSnapshots'

export type NamedSession = {
    name: string
    guildId: string
    savedBy: string
    savedAt: number
    trackCount: number
    currentTrack: SnapshotTrack | null
    upcomingTracks: SnapshotTrack[]
    voiceChannelId?: string
}

export type NamedSessionSummary = {
    name: string
    savedBy: string
    savedAt: number
    trackCount: number
}

const MAX_NAMED_SESSIONS = 10
const NAMED_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60
const MAX_SNAPSHOT_TRACKS = 25
const NAME_REGEX = /^[a-z0-9-]{1,32}$/i

type SearchOptions = {
    requestedBy?: User
    searchEngine: QueryType
}

/** Row shape this service reads from the `named_queues` table. */
interface NamedQueueRow {
    name: string
    guildId: string
    savedBy: string
    savedAt: Date
    trackCount: number
    voiceChannelId: string | null
    currentTrack: unknown
    upcomingTracks: unknown
}

function applySnapshotMetadata(
    track: Track,
    sessionName: string,
    recommendationReason?: string,
    isAutoplay?: boolean,
    requestedById?: string,
): void {
    const existing = (track.metadata ?? {}) as Record<string, unknown>
    track.setMetadata({
        ...existing,
        namedSessionName: sessionName,
        recommendationReason:
            recommendationReason ?? existing.recommendationReason,
        isAutoplay: isAutoplay ?? existing.isAutoplay,
        requestedById: requestedById ?? existing.requestedById,
    })
}

export class NamedSessionService {
    private validateName(name: string): boolean {
        return NAME_REGEX.test(name)
    }

    /** Cutoff `Date` for TTL-based lazy expiry. */
    private cutoff(): Date {
        return new Date(Date.now() - NAMED_SESSION_TTL_SECONDS * 1000)
    }

    /** Maps a `named_queues` row to the public `NamedSession` shape. */
    private rowToSession(row: NamedQueueRow): NamedSession {
        return {
            name: row.name,
            guildId: row.guildId,
            savedBy: row.savedBy,
            savedAt: row.savedAt.getTime(),
            trackCount: row.trackCount,
            currentTrack: (row.currentTrack ?? null) as SnapshotTrack | null,
            upcomingTracks: (row.upcomingTracks ?? []) as SnapshotTrack[],
            voiceChannelId: row.voiceChannelId ?? undefined,
        }
    }

    async save(
        queue: GuildQueue,
        name: string,
        userId: string,
    ): Promise<NamedSession | null> {
        try {
            if (!this.validateName(name)) {
                errorLog({
                    message: 'Invalid session name format',
                    data: { name },
                })
                return null
            }

            const guildId = queue.guild.id
            const prisma = getPrismaClient()

            const existingCount = await prisma.namedQueue.count({
                where: { guildId },
            })
            if (existingCount >= MAX_NAMED_SESSIONS) {
                errorLog({
                    message: 'Max named sessions reached',
                    data: { guildId, maxCount: MAX_NAMED_SESSIONS },
                })
                return null
            }

            const existing = await prisma.namedQueue.findUnique({
                where: { guildId_name: { guildId, name } },
            })
            if (existing) {
                return null
            }

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
            const trackCount = (currentTrack ? 1 : 0) + upcomingTracks.length

            await prisma.namedQueue.create({
                data: {
                    guildId,
                    name,
                    savedBy: userId,
                    trackCount,
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

            const session: NamedSession = {
                name,
                guildId,
                savedBy: userId,
                savedAt: Date.now(),
                trackCount,
                currentTrack: currentSnapshot,
                upcomingTracks,
                voiceChannelId: queue.channel?.id,
            }

            debugLog({
                message: 'Named session saved',
                data: { guildId, name, trackCount: session.trackCount },
            })

            return session
        } catch (error) {
            errorLog({
                message: 'Failed to save named music session',
                error,
            })
            return null
        }
    }

    async restore(
        queue: GuildQueue,
        name: string,
        requestedBy?: User,
    ): Promise<{ restoredCount: number }> {
        try {
            const guildId = queue.guild.id
            const session = await this.get(guildId, name)

            if (!session) {
                return { restoredCount: 0 }
            }

            const searchOptions: SearchOptions = {
                searchEngine: QueryType.AUTO,
                ...(requestedBy ? { requestedBy } : {}),
            }

            const tracksToRestore: SnapshotTrack[] = [
                ...(session.currentTrack ? [session.currentTrack] : []),
                ...session.upcomingTracks,
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
                    name,
                    entry.recommendationReason,
                    entry.isAutoplay,
                    entry.requestedById,
                )
                queue.addTrack(track)
                restoredCount += 1
            }

            if (restoredCount > 0 && !queue.node.isPlaying()) {
                await queue.node.play()
            }

            debugLog({
                message: 'Named session restored',
                data: { guildId, name, restoredCount },
            })

            return { restoredCount }
        } catch (error) {
            errorLog({
                message: 'Failed to restore named music session',
                error,
            })
            return { restoredCount: 0 }
        }
    }

    async list(guildId: string): Promise<NamedSessionSummary[]> {
        try {
            const prisma = getPrismaClient()
            const rows = await prisma.namedQueue.findMany({
                where: { guildId, savedAt: { gte: this.cutoff() } },
                orderBy: { savedAt: 'desc' },
            })

            return rows.map((row) => ({
                name: row.name,
                savedBy: row.savedBy,
                savedAt: row.savedAt.getTime(),
                trackCount: row.trackCount,
            }))
        } catch (error) {
            errorLog({
                message: 'Failed to list named sessions',
                error,
            })
            return []
        }
    }

    async delete(guildId: string, name: string): Promise<boolean> {
        try {
            const prisma = getPrismaClient()
            const result = await prisma.namedQueue.deleteMany({
                where: { guildId, name },
            })
            return result.count > 0
        } catch (error) {
            errorLog({
                message: 'Failed to delete named session',
                error,
            })
            return false
        }
    }

    async get(guildId: string, name: string): Promise<NamedSession | null> {
        try {
            const prisma = getPrismaClient()
            const row = await prisma.namedQueue.findUnique({
                where: { guildId_name: { guildId, name } },
            })

            if (!row) return null

            // Lazy TTL expiry: treat stale rows as absent and prune them.
            if (row.savedAt.getTime() < this.cutoff().getTime()) {
                await prisma.namedQueue
                    .deleteMany({ where: { guildId, name } })
                    .catch(() => undefined)
                return null
            }

            return this.rowToSession(row)
        } catch (error) {
            errorLog({
                message: 'Failed to get named session',
                error,
            })
            return null
        }
    }
}

export const namedSessionService = new NamedSessionService()
