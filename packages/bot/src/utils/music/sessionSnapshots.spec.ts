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
                            metadata: {},
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
                search: jest.fn().mockImplementation(async (query: unknown) => ({
                    tracks: [
                        {
                            title: String(query).split(' ')[0],
                            author: 'resolved',
                            url: query,
                            metadata: {},
                        },
                    ],
                })),
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
                    tracks: [{ title: 'Fresh Song', author: 'Fresh Artist', url: 'https://example.com/fresh', metadata: {} }],
                }),
            },
        } as unknown as GuildQueue

        const result = await service.restoreSnapshot(queue, undefined, {
            maxAgeMs: 30 * 60 * 1_000,
        })

        expect(result.restoredCount).toBe(1)
        expect(delMock).toHaveBeenCalledWith('music:session:guild-fresh')
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
