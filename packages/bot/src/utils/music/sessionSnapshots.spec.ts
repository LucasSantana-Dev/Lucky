import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { GuildQueue } from 'discord-player'
import { MusicSessionSnapshotService } from './sessionSnapshots'

const getMock = jest.fn()
const setexMock = jest.fn()
const delMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    redisClient: {
        get: (...args: unknown[]) => getMock(...args),
        setex: (...args: unknown[]) => setexMock(...args),
        del: (...args: unknown[]) => delMock(...args),
    },
}))

jest.mock('@lucky/shared/config', () => ({
    ENVIRONMENT_CONFIG: {
        SESSIONS: { QUEUE_SESSION_TTL: 7200 },
    },
}))

jest.mock('discord-player', () => ({
    QueryType: { AUTO: 'auto' },
}))

describe('MusicSessionSnapshotService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('saves queue snapshot to redis', async () => {
        const service = new MusicSessionSnapshotService(300)
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
            metadata: { channel: { id: 'channel-1' } },
        } as unknown as GuildQueue

        await service.saveSnapshot(queue)

        expect(setexMock).toHaveBeenCalledTimes(1)
        expect(setexMock.mock.calls[0]?.[0]).toContain('music:session:guild-1')
    })

    it('returns null when queue is empty and does not write to redis', async () => {
        const service = new MusicSessionSnapshotService(300)
        const queue = {
            guild: { id: 'guild-empty' },
            currentTrack: null,
            tracks: { toArray: () => [] },
        } as unknown as GuildQueue

        const result = await service.saveSnapshot(queue)

        expect(result).toBeNull()
        expect(setexMock).not.toHaveBeenCalled()
    })

    it('restores tracks from snapshot by searching and adding to queue', async () => {
        const service = new MusicSessionSnapshotService(300)
        const snapshot = {
            sessionSnapshotId: 'snap-1',
            guildId: 'guild-2',
            savedAt: Date.now(),
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
        }
        getMock.mockResolvedValue(JSON.stringify(snapshot))
        delMock.mockResolvedValue(1)

        const addTrack = jest.fn()
        const queue = {
            guild: { id: 'guild-2' },
            currentTrack: null,
            tracks: { size: 0 },
            addTrack,
            node: {
                isPlaying: () => false,
                play: jest.fn().mockResolvedValue(undefined),
            },
            player: {
                search: jest.fn().mockResolvedValue({
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
                }),
            },
        } as unknown as GuildQueue

        const result = await service.restoreSnapshot(queue)

        expect(result.restoredCount).toBe(1)
        expect(addTrack).toHaveBeenCalledTimes(1)
        // Snapshot must be cleared after restore (Gap 3 fix)
        expect(delMock).toHaveBeenCalledWith('music:session:guild-2')
    })

    it('also restores currentTrack prepended to the queue (Gap 4 fix)', async () => {
        const service = new MusicSessionSnapshotService(300)
        const snapshot = {
            sessionSnapshotId: 'snap-ct',
            guildId: 'guild-ct',
            savedAt: Date.now(),
            currentTrack: {
                title: 'Was Playing',
                author: 'Artist A',
                url: 'https://example.com/current',
                duration: '3:00',
                source: 'youtube',
            },
            upcomingTracks: [
                {
                    title: 'Next Up',
                    author: 'Artist B',
                    url: 'https://example.com/next',
                    duration: '2:30',
                    source: 'youtube',
                },
            ],
        }
        getMock.mockResolvedValue(JSON.stringify(snapshot))
        delMock.mockResolvedValue(1)

        const addTrack = jest.fn()
        const queue = {
            guild: { id: 'guild-ct' },
            currentTrack: null,
            tracks: { size: 0 },
            addTrack,
            node: {
                isPlaying: () => false,
                play: jest.fn().mockResolvedValue(undefined),
            },
            player: {
                search: jest.fn().mockImplementation(async (query: unknown) => {
                    const t: {
                        title: string
                        author: string
                        url: unknown
                        metadata: unknown
                        setMetadata: (m: unknown) => void
                    } = {
                        title: String(query).split(' ')[0],
                        author: 'resolved',
                        url: query,
                        metadata: null,
                        setMetadata(m) {
                            this.metadata = m
                        },
                    }
                    return { tracks: [t] }
                }),
            },
        } as unknown as GuildQueue

        const result = await service.restoreSnapshot(queue)

        // currentTrack + 1 upcoming = 2 tracks
        expect(result.restoredCount).toBe(2)
        expect(addTrack).toHaveBeenCalledTimes(2)
    })

    it('rejects snapshot older than maxAgeMs (Gap 2 staleness guard)', async () => {
        const service = new MusicSessionSnapshotService(300)
        const staleSnapshot = {
            sessionSnapshotId: 'snap-stale',
            guildId: 'guild-stale',
            savedAt: Date.now() - 60 * 60 * 1_000, // 1 hour ago
            currentTrack: null,
            upcomingTracks: [
                {
                    title: 'Old Song',
                    author: 'Old Artist',
                    url: 'https://example.com/old',
                    duration: '3:00',
                    source: 'youtube',
                },
            ],
        }
        getMock.mockResolvedValue(JSON.stringify(staleSnapshot))

        const addTrack = jest.fn()
        const queue = {
            guild: { id: 'guild-stale' },
            currentTrack: null,
            tracks: { size: 0 },
            addTrack,
            node: { isPlaying: () => false, play: jest.fn() },
            player: { search: jest.fn() },
        } as unknown as GuildQueue

        // Use 30-min maxAge (default)
        const result = await service.restoreSnapshot(queue, undefined, {
            maxAgeMs: 30 * 60 * 1_000,
        })

        expect(result.restoredCount).toBe(0)
        expect(result.sessionSnapshotId).toBeNull()
        expect(addTrack).not.toHaveBeenCalled()
        // Should NOT delete the stale snapshot (so TTL can still expire it naturally)
        expect(delMock).not.toHaveBeenCalled()
    })

    it('accepts snapshot within maxAgeMs window', async () => {
        const service = new MusicSessionSnapshotService(300)
        const freshSnapshot = {
            sessionSnapshotId: 'snap-fresh',
            guildId: 'guild-fresh',
            savedAt: Date.now() - 5 * 60 * 1_000, // 5 min ago
            currentTrack: null,
            upcomingTracks: [
                {
                    title: 'Fresh Song',
                    author: 'Fresh Artist',
                    url: 'https://example.com/fresh',
                    duration: '3:00',
                    source: 'youtube',
                },
            ],
        }
        getMock.mockResolvedValue(JSON.stringify(freshSnapshot))
        delMock.mockResolvedValue(1)

        const addTrack = jest.fn()
        const queue = {
            guild: { id: 'guild-fresh' },
            currentTrack: null,
            tracks: { size: 0 },
            addTrack,
            node: {
                isPlaying: () => false,
                play: jest.fn().mockResolvedValue(undefined),
            },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Fresh Song',
                            author: 'Fresh Artist',
                            url: 'https://example.com/fresh',
                            metadata: null,
                            setMetadata: jest.fn(function (
                                this: { metadata: unknown },
                                m: unknown,
                            ) {
                                this.metadata = m
                            }),
                        },
                    ],
                }),
            },
        } as unknown as GuildQueue

        const result = await service.restoreSnapshot(queue, undefined, {
            maxAgeMs: 30 * 60 * 1_000,
        })

        expect(result.restoredCount).toBe(1)
        expect(delMock).toHaveBeenCalledWith('music:session:guild-fresh')
    })

    it('preserves autoplay metadata when restoring snapshot tracks', async () => {
        const service = new MusicSessionSnapshotService(300)
        const snapshot = {
            sessionSnapshotId: 'snap-autoplay',
            guildId: 'guild-autoplay',
            savedAt: Date.now(),
            currentTrack: null,
            upcomingTracks: [
                {
                    title: 'Recommended Song',
                    author: 'Recommended Artist',
                    url: 'https://example.com/recommended',
                    duration: '3:00',
                    source: 'youtube',
                    recommendationReason: 'Because you listened to Test Song',
                    isAutoplay: true,
                    requestedById: 'user-1',
                },
            ],
        }
        getMock.mockResolvedValue(JSON.stringify(snapshot))
        delMock.mockResolvedValue(1)

        const addTrack = jest.fn()
        const restoredTrack: {
            title: string
            author: string
            url: string
            metadata: unknown
            setMetadata: (m: unknown) => void
        } = {
            title: 'Recommended Song',
            author: 'Recommended Artist',
            url: 'https://example.com/recommended',
            metadata: null,
            setMetadata(m) {
                this.metadata = m
            },
        }

        const queue = {
            guild: { id: 'guild-autoplay' },
            currentTrack: null,
            tracks: { size: 0 },
            addTrack,
            node: {
                isPlaying: () => false,
                play: jest.fn().mockResolvedValue(undefined),
            },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [restoredTrack],
                }),
            },
        } as unknown as GuildQueue

        await service.restoreSnapshot(queue)

        expect(addTrack).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    isAutoplay: true,
                    requestedById: 'user-1',
                    recommendationReason: 'Because you listened to Test Song',
                }),
            }),
        )
    })

    it('returns early when queue already has tracks', async () => {
        const service = new MusicSessionSnapshotService(300)
        const queue = {
            guild: { id: 'guild-busy' },
            currentTrack: { title: 'Playing Now' },
            tracks: { size: 2 },
        } as unknown as GuildQueue

        const result = await service.restoreSnapshot(queue)

        expect(result.restoredCount).toBe(0)
        expect(getMock).not.toHaveBeenCalled()
    })

    it('does not delete snapshot when no tracks are restored', async () => {
        const service = new MusicSessionSnapshotService(300)
        const snapshot = {
            sessionSnapshotId: 'snap-noresult',
            guildId: 'guild-noresult',
            savedAt: Date.now(),
            currentTrack: null,
            upcomingTracks: [
                {
                    title: 'Ghost Track',
                    author: 'Ghost',
                    url: 'https://example.com/ghost',
                    duration: '3:00',
                    source: 'youtube',
                },
            ],
        }
        getMock.mockResolvedValue(JSON.stringify(snapshot))

        const addTrack = jest.fn()
        const queue = {
            guild: { id: 'guild-noresult' },
            currentTrack: null,
            tracks: { size: 0 },
            addTrack,
            node: { isPlaying: () => false, play: jest.fn() },
            player: {
                search: jest.fn().mockResolvedValue({ tracks: [] }), // no results
            },
        } as unknown as GuildQueue

        const result = await service.restoreSnapshot(queue)

        expect(result.restoredCount).toBe(0)
        expect(delMock).not.toHaveBeenCalled()
    })
})

    it('skips current track when skipCurrentTrack option is true', async () => {
        const service = new MusicSessionSnapshotService(300)
        const snapshot = {
            sessionSnapshotId: 'snap-skip-current',
            guildId: 'guild-skip',
            savedAt: Date.now(),
            currentTrack: {
                title: 'Same Song',
                author: 'Artist',
                url: 'https://example.com/same',
                duration: '3:00',
                source: 'youtube',
            },
            upcomingTracks: [
                {
                    title: 'Next Song',
                    author: 'Next Artist',
                    url: 'https://example.com/next',
                    duration: '3:00',
                    source: 'youtube',
                },
            ],
        }
        getMock.mockResolvedValue(JSON.stringify(snapshot))
        delMock.mockResolvedValue(1)

        const addTrack = jest.fn()
        const queue = {
            guild: { id: 'guild-skip' },
            currentTrack: null,
            tracks: { size: 0 },
            addTrack,
            node: {
                isPlaying: () => false,
                play: jest.fn().mockResolvedValue(undefined),
            },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Next Song',
                            author: 'Next Artist',
                            url: 'https://example.com/next',
                            metadata: null,
                            setMetadata: jest.fn(),
                        },
                    ],
                }),
            },
        } as unknown as GuildQueue

        await service.restoreSnapshot(queue, undefined, { skipCurrentTrack: true })

        expect(addTrack).toHaveBeenCalledTimes(1)
        expect(addTrack.mock.calls[0]?.[0]).toMatchObject({
            title: 'Next Song',
        })
    })

    it('returns null on save error and logs', async () => {
        setexMock.mockRejectedValue(new Error('redis down'))
        const service = new MusicSessionSnapshotService(300)
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

        const result = await service.saveSnapshot(queue)
        expect(result).toBeNull()
    })

    it('returns null on getSnapshot redis read error', async () => {
        getMock.mockRejectedValue(new Error('redis down'))
        const service = new MusicSessionSnapshotService(300)
        const result = await service.getSnapshot('g')
        expect(result).toBeNull()
    })

    it('returns null on getSnapshot when key missing', async () => {
        getMock.mockResolvedValue(null)
        const service = new MusicSessionSnapshotService(300)
        const result = await service.getSnapshot('g')
        expect(result).toBeNull()
    })

    it('swallows deleteSnapshot redis errors', async () => {
        delMock.mockRejectedValue(new Error('redis down'))
        const service = new MusicSessionSnapshotService(300)
        await expect(service.deleteSnapshot('g')).resolves.toBeUndefined()
    })

    it('clearSnapshotIfStale is no-op when queue has upcoming tracks', async () => {
        const service = new MusicSessionSnapshotService(300)
        const queue = {
            guild: { id: 'g' },
            currentTrack: { title: 't' },
            tracks: { size: 3 },
        } as unknown as GuildQueue
        await service.clearSnapshotIfStale(queue)
        expect(getMock).not.toHaveBeenCalled()
    })

    it('clearSnapshotIfStale is no-op when no current track', async () => {
        const service = new MusicSessionSnapshotService(300)
        const queue = {
            guild: { id: 'g' },
            currentTrack: null,
            tracks: { size: 0 },
        } as unknown as GuildQueue
        await service.clearSnapshotIfStale(queue)
        expect(getMock).not.toHaveBeenCalled()
    })

    it('clearSnapshotIfStale skips when snapshot has upcoming tracks', async () => {
        getMock.mockResolvedValue(
            JSON.stringify({
                sessionSnapshotId: 's',
                guildId: 'g',
                savedAt: Date.now(),
                currentTrack: null,
                upcomingTracks: [{ title: 'x', author: 'y', url: 'z', duration: '1', source: 's' }],
            }),
        )
        const service = new MusicSessionSnapshotService(300)
        const queue = {
            guild: { id: 'g' },
            currentTrack: { title: 't' },
            tracks: { size: 0 },
        } as unknown as GuildQueue
        await service.clearSnapshotIfStale(queue)
        expect(delMock).not.toHaveBeenCalled()
    })

    it('restoreSnapshot returns 0 when queue already has tracks', async () => {
        const service = new MusicSessionSnapshotService(300)
        const queue = {
            guild: { id: 'g' },
            currentTrack: { title: 't' },
            tracks: { size: 5 },
        } as unknown as GuildQueue
        const result = await service.restoreSnapshot(queue)
        expect(result.restoredCount).toBe(0)
        expect(result.sessionSnapshotId).toBeNull()
    })
})
