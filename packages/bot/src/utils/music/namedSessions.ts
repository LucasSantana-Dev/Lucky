import type { GuildQueue, Track } from 'discord-player'
import { QueryType } from 'discord-player'
import type { User } from 'discord.js'
import { redisClient } from '@lucky/shared/services'
import { debugLog, errorLog } from '@lucky/shared/utils'
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
    private getSessionKey(guildId: string, name: string): string {
        return `music:named-session:${guildId}:${name}`
    }

    private getIndexKey(guildId: string): string {
        return `music:named-sessions:${guildId}`
    }

    private validateName(name: string): boolean {
        return NAME_REGEX.test(name)
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
            const indexKey = this.getIndexKey(guildId)
            const sessionCount = await redisClient.scard(indexKey)

            if (sessionCount >= MAX_NAMED_SESSIONS) {
                errorLog({
                    message: 'Max named sessions reached',
                    data: { guildId, maxCount: MAX_NAMED_SESSIONS },
                })
                return null
            }

            const exists = await redisClient.exists(
                this.getSessionKey(guildId, name),
            )
            if (exists) {
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

            const session: NamedSession = {
                name,
                guildId,
                savedBy: userId,
                savedAt: Date.now(),
                trackCount: (currentTrack ? 1 : 0) + upcomingTracks.length,
                currentTrack: currentTrack
                    ? toSnapshotTrack(currentTrack as Track)
                    : null,
                upcomingTracks,
                voiceChannelId: queue.channel?.id,
            }

            const sessionKey = this.getSessionKey(guildId, name)
            await Promise.all([
                redisClient.setex(
                    sessionKey,
                    NAMED_SESSION_TTL_SECONDS,
                    JSON.stringify(session),
                ),
                redisClient.sadd(indexKey, name),
            ])

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
            const indexKey = this.getIndexKey(guildId)
            const names = await redisClient.smembers(indexKey)

            if (names.length === 0) {
                return []
            }

            const summaries: NamedSessionSummary[] = []
            for (const name of names) {
                const session = await this.get(guildId, name)
                if (session) {
                    summaries.push({
                        name: session.name,
                        savedBy: session.savedBy,
                        savedAt: session.savedAt,
                        trackCount: session.trackCount,
                    })
                }
            }

            return summaries.sort(
                (a, b) => b.savedAt - a.savedAt,
            )
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
            const sessionKey = this.getSessionKey(guildId, name)
            const indexKey = this.getIndexKey(guildId)

            const deleted = await redisClient.del(sessionKey)
            await redisClient.srem(indexKey, name)

            return deleted > 0
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
            const sessionKey = this.getSessionKey(guildId, name)
            const raw = await redisClient.get(sessionKey)

            if (!raw) return null
            const parsed = JSON.parse(raw) as NamedSession
            return parsed
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
