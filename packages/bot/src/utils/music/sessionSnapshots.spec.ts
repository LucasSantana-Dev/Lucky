import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { GuildQueue } from 'discord-player'
import { getPrismaClient } from '@lucky/shared/utils'
import { MusicSessionSnapshotService } from './sessionSnapshots'

jest.mock('@lucky/shared/utils', () => ({
    getPrismaClient: jest.fn(),
    debugLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('@lucky/shared/config', () => ({
    ENVIRONMENT_CONFIG: {
        SESSIONS: { QUEUE_SESSION_TTL: 7200 },
    },
}))

jest.mock('discord-player', () => ({
    QueryType: { AUTO: 'auto' },
}))

const mockGetPrismaClient = jest.mocked(getPrismaClient)
const mockFindUnique = jest.fn<any>()
const mockFindMany = jest.fn<any>()
const mockDeleteMany = jest.fn<any>()
const mockCreate = jest.fn<any>()

/** Builds a `music_session_snapshots` row for mock returns. */
function snapshotRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 'row-1',
        guildId: 'guild-1',
        sessionSnapshotId: 'snap-1',
        savedAt: new Date(),
        currentTrack: null,
        upcomingTracks: [
            {
                title: 'Recovered Song',
                author: 'Recovered Artist',
                url: 'https://example.com/recovered',
                duration: '3:00',
                source: 'youtube',
            },
        ],
        voiceChannelId: null,
        ...overrides,
    }
}

function restoringQueue(guildId: string, searchResult?: unknown) {
    const addTrack = jest.fn()
    return {
        guild: { id: guildId },
        currentTrack: null,
        tracks: { size: 0 },
        addTrack,
        clear: jest.fn(),
        node: {
            isPlaying: () => false,
            play: jest.fn(async () => undefined),
        },
        player: {
            search: jest.fn(
                async () =>
                    searchResult ?? {
                        tracks: [
                            {
                                title: 'Recovered Song',
                                author: 'Recovered Artist',
                                url: 'https://example.com/recovered',
                                metadata: null,
                                setMetadata: jest.fn(function (
                                    this: { metadata: unknown },
                                    m: unknown,
                                ) {
                                    this.metadata = m
                                }),
                            },
                        ],
                    },
            ),
        },
    } as unknown as GuildQueue
}

describe('MusicSessionSnapshotService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockGetPrismaClient.mockReturnValue({
            musicSessionSnapshot: {
                findUnique: mockFindUnique,
                findMany: mockFindMany,
                deleteMany: mockDeleteMany,
                create: mockCreate,
            },
        } as any)
        mockFindUnique.mockResolvedValue(null)
        mockFindMany.mockResolvedValue([])
        mockDeleteMany.mockResolvedValue({ count: 1 })
        mockCreate.mockResolvedValue(snapshotRow())
    })

    describe('saveSnapshot', () => {
        it('overwrites the guild snapshot (delete + create) and returns it', async () => {
            const service = new MusicSessionSnapshotService()
            const queue = {
                guild: { id: 'guild-1' },
                currentTrack: {
                    title: 'Now Song',
                    author: 'Now Artist',
                    url: 'https://example.com/now',
                    duration: '3:10',
                    source: 'youtube',
                },
                tracks: {
                    toArray: () => [
                        {
                            title: 'Next Song',
                            author: 'Next Artist',
                            url: 'https://example.com/next',
                            duration: '2:40',
                            source: 'youtube',
                        },
                    ],
                },
                channel: { id: 'channel-1' },
            } as unknown as GuildQueue

            const result = await service.saveSnapshot(queue)

            expect(result).not.toBeNull()
            expect(mockDeleteMany).toHaveBeenCalledWith({
                where: { guildId: 'guild-1' },
            })
            expect(mockCreate).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    guildId: 'guild-1',
                    voiceChannelId: 'channel-1',
                    sessionSnapshotId: expect.any(String),
                    upcomingTracks: expect.any(Array),
                }),
            })
        })

        it('returns null when queue is empty and does not write', async () => {
            const service = new MusicSessionSnapshotService()
            const queue = {
                guild: { id: 'guild-empty' },
                currentTrack: null,
                tracks: { toArray: () => [] },
            } as unknown as GuildQueue

            const result = await service.saveSnapshot(queue)

            expect(result).toBeNull()
            expect(mockCreate).not.toHaveBeenCalled()
        })

        it('returns null on create error', async () => {
            mockCreate.mockRejectedValueOnce(new Error('db down'))
            const service = new MusicSessionSnapshotService()
            const queue = {
                guild: { id: 'guild-err' },
                currentTrack: {
                    title: 't',
                    author: 'a',
                    url: 'u',
                    duration: '1',
                    source: 'youtube',
                },
                tracks: { toArray: () => [] },
            } as unknown as GuildQueue

            expect(await service.saveSnapshot(queue)).toBeNull()
        })
    })

    describe('getSnapshot', () => {
        it('maps a fresh row to a snapshot', async () => {
            mockFindUnique.mockResolvedValueOnce(snapshotRow())
            const service = new MusicSessionSnapshotService()
            const snap = await service.getSnapshot('guild-1')
            expect(snap).toMatchObject({
                sessionSnapshotId: 'snap-1',
                guildId: 'guild-1',
                currentTrack: null,
            })
            expect(snap?.upcomingTracks).toHaveLength(1)
        })

        it('returns null and prunes a row older than the storage TTL', async () => {
            mockFindUnique.mockResolvedValueOnce(
                snapshotRow({ savedAt: new Date(Date.now() - 60 * 60 * 1000) }),
            )
            const service = new MusicSessionSnapshotService(1) // 1s TTL
            const snap = await service.getSnapshot('guild-1')
            expect(snap).toBeNull()
            expect(mockDeleteMany).toHaveBeenCalledWith({
                where: { guildId: 'guild-1' },
            })
        })

        it('returns null on read error', async () => {
            mockFindUnique.mockRejectedValueOnce(new Error('db down'))
            const service = new MusicSessionSnapshotService()
            expect(await service.getSnapshot('g')).toBeNull()
        })

        it('returns null when no row exists', async () => {
            mockFindUnique.mockResolvedValueOnce(null)
            const service = new MusicSessionSnapshotService()
            expect(await service.getSnapshot('g')).toBeNull()
        })
    })

    describe('listGuildIds', () => {
        it('returns guild ids for non-expired snapshots (TTL-filtered query)', async () => {
            mockFindMany.mockResolvedValueOnce([
                { guildId: 'g1' },
                { guildId: 'g2' },
            ])
            const service = new MusicSessionSnapshotService()
            expect(await service.listGuildIds()).toEqual(['g1', 'g2'])
            expect(mockFindMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { savedAt: { gte: expect.any(Date) } },
                    select: { guildId: true },
                }),
            )
        })

        it('returns an empty array on query error', async () => {
            mockFindMany.mockRejectedValueOnce(new Error('db down'))
            const service = new MusicSessionSnapshotService()
            expect(await service.listGuildIds()).toEqual([])
        })
    })

    describe('restoreSnapshot', () => {
        it('restores upcoming tracks and clears the snapshot afterward', async () => {
            mockFindUnique.mockResolvedValueOnce(snapshotRow())
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-2')

            const result = await service.restoreSnapshot(queue)

            expect(result.restoredCount).toBe(1)
            expect(queue.addTrack).toHaveBeenCalledTimes(1)
            expect(mockDeleteMany).toHaveBeenCalledWith({
                where: { guildId: 'guild-2' },
            })
        })

        it('prepends the current track to the restore list', async () => {
            mockFindUnique.mockResolvedValueOnce(
                snapshotRow({
                    currentTrack: {
                        title: 'Was Playing',
                        author: 'Artist A',
                        url: 'https://example.com/current',
                        duration: '3:00',
                        source: 'youtube',
                    },
                }),
            )
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-ct', {
                tracks: [
                    {
                        title: 'resolved',
                        author: 'resolved',
                        url: 'x',
                        metadata: null,
                        setMetadata: jest.fn(),
                    },
                ],
            })

            const result = await service.restoreSnapshot(queue)
            expect(result.restoredCount).toBe(2)
            expect(queue.addTrack).toHaveBeenCalledTimes(2)
        })

        it('rejects a snapshot older than maxAgeMs WITHOUT deleting it', async () => {
            mockFindUnique.mockResolvedValueOnce(
                snapshotRow({ savedAt: new Date(Date.now() - 60 * 60 * 1000) }),
            )
            const service = new MusicSessionSnapshotService(7200) // within storage TTL
            const queue = restoringQueue('guild-stale')

            const result = await service.restoreSnapshot(queue, undefined, {
                maxAgeMs: 30 * 60 * 1000,
            })

            expect(result.restoredCount).toBe(0)
            expect(result.sessionSnapshotId).toBeNull()
            expect(queue.addTrack).not.toHaveBeenCalled()
            expect(mockDeleteMany).not.toHaveBeenCalled()
        })

        it('preserves autoplay metadata on restored tracks', async () => {
            mockFindUnique.mockResolvedValueOnce(
                snapshotRow({
                    upcomingTracks: [
                        {
                            title: 'Recommended Song',
                            author: 'Recommended Artist',
                            url: 'https://example.com/recommended',
                            duration: '3:00',
                            source: 'youtube',
                            recommendationReason: 'Because you listened',
                            isAutoplay: true,
                            requestedById: 'user-1',
                        },
                    ],
                }),
            )
            const restoredTrack = {
                title: 'Recommended Song',
                author: 'Recommended Artist',
                url: 'https://example.com/recommended',
                metadata: null as unknown,
                setMetadata(m: unknown) {
                    this.metadata = m
                },
            }
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-autoplay', {
                tracks: [restoredTrack],
            })

            await service.restoreSnapshot(queue)

            expect(queue.addTrack).toHaveBeenCalledWith(
                expect.objectContaining({
                    metadata: expect.objectContaining({
                        isAutoplay: true,
                        requestedById: 'user-1',
                        recommendationReason: 'Because you listened',
                    }),
                }),
            )
        })

        it('returns early when the queue already has tracks (no read)', async () => {
            const service = new MusicSessionSnapshotService()
            const queue = {
                guild: { id: 'guild-busy' },
                currentTrack: { title: 'Playing Now' },
                tracks: { size: 2 },
            } as unknown as GuildQueue

            const result = await service.restoreSnapshot(queue)
            expect(result.restoredCount).toBe(0)
            expect(mockFindUnique).not.toHaveBeenCalled()
        })

        it('does not clear the snapshot when nothing is restored', async () => {
            mockFindUnique.mockResolvedValueOnce(snapshotRow())
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-noresult', { tracks: [] })

            const result = await service.restoreSnapshot(queue)
            expect(result.restoredCount).toBe(0)
            expect(mockDeleteMany).not.toHaveBeenCalled()
        })

        it('skips the current track when skipCurrentTrack is true', async () => {
            mockFindUnique.mockResolvedValueOnce(
                snapshotRow({
                    currentTrack: {
                        title: 'Same Song',
                        author: 'Artist',
                        url: 'https://example.com/same',
                        duration: '3:00',
                        source: 'youtube',
                    },
                }),
            )
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-skip')

            await service.restoreSnapshot(queue, undefined, {
                skipCurrentTrack: true,
            })
            expect(queue.addTrack).toHaveBeenCalledTimes(1)
        })

        it('rolls back the queue when search throws mid-restore', async () => {
            mockFindUnique.mockResolvedValueOnce(
                snapshotRow({
                    currentTrack: {
                        title: 'Current Song',
                        author: 'Artist 1',
                        url: 'https://example.com/cur',
                        duration: '3:45',
                        source: 'youtube',
                    },
                }),
            )
            const clear = jest.fn()
            const search = jest
                .fn<any>()
                .mockResolvedValueOnce({ tracks: [{ title: 'Current Song' }] })
                .mockRejectedValueOnce(new Error('search unavailable'))
            const queue = {
                guild: { id: 'g' },
                currentTrack: null,
                tracks: { size: 0 },
                player: { search },
                clear,
                addTrack: jest.fn(),
            } as unknown as GuildQueue

            const service = new MusicSessionSnapshotService()
            const result = await service.restoreSnapshot(queue)

            expect(clear).toHaveBeenCalledTimes(1)
            expect(result.restoredCount).toBe(0)
            expect(result.sessionSnapshotId).toBeNull()
        })
    })

    describe('deleteSnapshot / clearSnapshotIfStale', () => {
        it('swallows delete errors', async () => {
            mockDeleteMany.mockRejectedValueOnce(new Error('db down'))
            const service = new MusicSessionSnapshotService()
            await expect(service.deleteSnapshot('g')).resolves.toBeUndefined()
        })

        it('clearSnapshotIfStale is a no-op when the queue has upcoming tracks', async () => {
            const service = new MusicSessionSnapshotService()
            const queue = {
                guild: { id: 'g' },
                currentTrack: { title: 't' },
                tracks: { size: 3 },
            } as unknown as GuildQueue
            await service.clearSnapshotIfStale(queue)
            expect(mockFindUnique).not.toHaveBeenCalled()
        })

        it('clearSnapshotIfStale skips when the snapshot has upcoming tracks', async () => {
            mockFindUnique.mockResolvedValueOnce(snapshotRow())
            const service = new MusicSessionSnapshotService()
            const queue = {
                guild: { id: 'guild-1' },
                currentTrack: { title: 't' },
                tracks: { size: 0 },
            } as unknown as GuildQueue
            await service.clearSnapshotIfStale(queue)
            expect(mockDeleteMany).not.toHaveBeenCalled()
        })
    })
})
