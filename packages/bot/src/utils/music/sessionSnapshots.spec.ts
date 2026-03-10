import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { GuildQueue } from 'discord-player'
import { MusicSessionSnapshotService } from './sessionSnapshots'

const getMock = jest.fn()
const setexMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    redisClient: {
        get: (...args: unknown[]) => getMock(...args),
        setex: (...args: unknown[]) => setexMock(...args),
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
    })
})
