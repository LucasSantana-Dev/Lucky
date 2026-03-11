import { QueryType, type GuildQueue, type Track } from 'discord-player'
import {
    replenishQueue,
    shuffleQueue,
    smartShuffleQueue,
    removeTrackFromQueue,
    moveTrackInQueue,
    rescueQueue,
} from './queueManipulation'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
}))

const dislikedTrackKeysMock = jest.fn()

jest.mock('../../services/musicRecommendation/feedbackService', () => ({
    recommendationFeedbackService: {
        getDislikedTrackKeys: (...args: unknown[]) =>
            dislikedTrackKeysMock(...args),
    },
}))

type QueueMock = Partial<GuildQueue> & {
    player: { search: jest.Mock }
    addTrack: jest.Mock
    tracks: { size: number; toArray: jest.Mock }
    guild: { id: string }
}

function createQueueMock(overrides: Partial<QueueMock> = {}): QueueMock {
    const currentTrack = {
        title: 'Song A',
        author: 'Artist A',
        url: 'https://example.com/a',
        requestedBy: { id: 'user-1' },
    } as unknown as Track

    return {
        guild: { id: 'guild-1' },
        tracks: { size: 0, toArray: jest.fn().mockReturnValue([]) },
        currentTrack,
        metadata: {},
        player: {
            search: jest.fn().mockResolvedValue({
                tracks: [
                    {
                        title: 'Song B',
                        author: 'Artist B',
                        url: 'https://example.com/b',
                    },
                ],
            }),
        },
        addTrack: jest.fn(),
        ...overrides,
    }
}

describe('queueManipulation.replenishQueue', () => {
    beforeEach(() => {
        dislikedTrackKeysMock.mockResolvedValue(new Set())
    })

    it('tops up autoplay queue with multiple tracks when below buffer', async () => {
        const queue = createQueueMock({
            tracks: {
                size: 1,
                toArray: jest.fn().mockReturnValue([
                    {
                        title: 'Queued Song',
                        author: 'Queued Artist',
                        url: 'https://example.com/q',
                    },
                ]),
            },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Song B',
                            author: 'Artist B',
                            url: 'https://example.com/b',
                        },
                        {
                            title: 'Song C',
                            author: 'Artist C',
                            url: 'https://example.com/c',
                        },
                        {
                            title: 'Song D',
                            author: 'Artist D',
                            url: 'https://example.com/d',
                        },
                        {
                            title: 'Song E',
                            author: 'Artist E',
                            url: 'https://example.com/e',
                        },
                    ],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(queue.player.search).toHaveBeenCalled()
        expect(queue.addTrack).toHaveBeenCalledTimes(3)
        expect(queue.addTrack).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    isAutoplay: true,
                    recommendationReason: expect.any(String),
                    requestedById: 'user-1',
                }),
            }),
        )
    })

    it('does not search when queue already has buffer size', async () => {
        const queue = createQueueMock({
            tracks: { size: 4, toArray: jest.fn().mockReturnValue([]) },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(queue.player.search).not.toHaveBeenCalled()
        expect(queue.addTrack).not.toHaveBeenCalled()
    })

    it('skips duplicate url and normalized title+artist candidates', async () => {
        const queue = createQueueMock({
            tracks: {
                size: 0,
                toArray: jest.fn().mockReturnValue([
                    {
                        title: 'Queue Song',
                        author: 'Queue Artist',
                        url: 'https://example.com/q',
                    },
                ]),
            },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Song A copy',
                            author: 'Artist A',
                            url: 'https://example.com/a',
                        },
                        {
                            title: 'queue-song',
                            author: 'QUEUE ARTIST',
                            url: 'https://example.com/other',
                        },
                        {
                            title: 'Fresh Song',
                            author: 'Fresh Artist',
                            url: 'https://example.com/fresh',
                        },
                    ],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(queue.player.search).toHaveBeenCalledWith(
            'Song A Artist A',
            expect.objectContaining({
                searchEngine: QueryType.AUTO,
            }),
        )
        expect(queue.addTrack).toHaveBeenCalledTimes(1)
        expect(queue.addTrack).toHaveBeenCalledWith(
            expect.objectContaining({
                url: 'https://example.com/fresh',
                metadata: expect.objectContaining({
                    isAutoplay: true,
                    recommendationReason: expect.any(String),
                }),
            }),
        )
    })

    it('skips tracks disliked by the requester feedback profile', async () => {
        dislikedTrackKeysMock.mockResolvedValue(
            new Set(['dislikedtrack::artistb']),
        )

        const queue = createQueueMock({
            tracks: {
                size: 0,
                toArray: jest.fn().mockReturnValue([]),
            },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Disliked Track',
                            author: 'Artist B',
                            url: 'https://example.com/disliked',
                        },
                        {
                            title: 'Allowed Track',
                            author: 'Artist C',
                            url: 'https://example.com/allowed',
                        },
                    ],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(queue.addTrack).toHaveBeenCalledTimes(1)
        expect(queue.addTrack).toHaveBeenCalledWith(
            expect.objectContaining({
                url: 'https://example.com/allowed',
            }),
        )
    })

    it('stores queue metadata requester on autoplay recommendations', async () => {
        const queue = createQueueMock({
            currentTrack: {
                title: 'Song A',
                author: 'Artist A',
                url: 'https://example.com/a',
            } as unknown as Track,
            metadata: { requestedBy: { id: 'queue-user' } },
            tracks: {
                size: 0,
                toArray: jest.fn().mockReturnValue([]),
            },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Song B',
                            author: 'Artist B',
                            url: 'https://example.com/b',
                        },
                    ],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(queue.addTrack).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    requestedById: 'queue-user',
                }),
            }),
        )
    })

    it('keeps existing candidate requester metadata when no queue requester is present', async () => {
        const queue = createQueueMock({
            currentTrack: {
                title: 'Song A',
                author: 'Artist A',
                url: 'https://example.com/a',
            } as unknown as Track,
            metadata: {},
            tracks: {
                size: 0,
                toArray: jest.fn().mockReturnValue([]),
            },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Song B',
                            author: 'Artist B',
                            url: 'https://example.com/b',
                            metadata: { requestedById: 'seed-user' },
                        },
                    ],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(queue.addTrack).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    requestedById: 'seed-user',
                }),
            }),
        )
    })

    it('keeps requester metadata undefined when no requester context exists', async () => {
        const queue = createQueueMock({
            currentTrack: {
                title: 'Song A',
                author: 'Artist A',
                url: 'https://example.com/a',
            } as unknown as Track,
            metadata: {},
            tracks: {
                size: 0,
                toArray: jest.fn().mockReturnValue([]),
            },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Song B',
                            author: 'Artist B',
                            url: 'https://example.com/b',
                            metadata: {},
                        },
                    ],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(queue.addTrack).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    requestedById: undefined,
                }),
            }),
        )
    })

    it('returns without adding tracks when candidate set is exhausted', async () => {
        const queue = createQueueMock({
            tracks: {
                size: 0,
                toArray: jest.fn().mockReturnValue([]),
            },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Song A clone',
                            author: 'Artist A',
                            url: 'https://example.com/a',
                        },
                    ],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(queue.addTrack).not.toHaveBeenCalled()
    })
})

describe('queueManipulation.queueOperations', () => {
    it('shuffles queue tracks and keeps all items', async () => {
        const trackA = { id: '1', title: 'A', author: 'Artist A' } as Track
        const trackB = { id: '2', title: 'B', author: 'Artist B' } as Track
        const trackC = { id: '3', title: 'C', author: 'Artist C' } as Track
        const queue = {
            tracks: {
                toArray: jest.fn().mockReturnValue([trackA, trackB, trackC]),
            },
            clear: jest.fn(),
            addTrack: jest.fn(),
        } as unknown as GuildQueue

        const result = await shuffleQueue(queue)

        expect(result).toBe(true)
        expect((queue as any).clear).toHaveBeenCalled()
        expect((queue as any).addTrack).toHaveBeenCalledTimes(3)
        expect((queue as any).addTrack).toHaveBeenCalledWith(
            expect.objectContaining({ id: expect.any(String) }),
        )
    })

    it('smart-shuffles tracks with requester fairness metadata', async () => {
        const tracks = [
            {
                id: '1',
                title: 'A',
                author: 'Artist A',
                requestedBy: { id: 'u1' },
            },
            {
                id: '2',
                title: 'B',
                author: 'Artist B',
                requestedBy: { id: 'u2' },
            },
            {
                id: '3',
                title: 'C',
                author: 'Artist C',
                requestedBy: { id: 'u1' },
            },
        ] as unknown as Track[]
        const queue = {
            guild: { id: 'guild-1' },
            tracks: { toArray: jest.fn().mockReturnValue(tracks), size: 3 },
            clear: jest.fn(),
            addTrack: jest.fn(),
        } as unknown as GuildQueue

        const result = await smartShuffleQueue(queue)

        expect(result).toBe(true)
        expect((queue as any).clear).toHaveBeenCalled()
        expect((queue as any).addTrack).toHaveBeenCalledTimes(3)
    })

    it('removes track by position and returns removed track', async () => {
        const trackA = { title: 'A' } as Track
        const trackB = { title: 'B' } as Track
        const removeMock = jest.fn()
        const queue = {
            tracks: { toArray: jest.fn().mockReturnValue([trackA, trackB]) },
            node: { remove: removeMock },
        } as unknown as GuildQueue

        const removed = await removeTrackFromQueue(queue, 1)

        expect(removed).toBe(trackB)
        expect(removeMock).toHaveBeenCalledWith(trackB)
    })

    it('returns null when remove position is out of range', async () => {
        const queue = {
            tracks: { toArray: jest.fn().mockReturnValue([]) },
            node: { remove: jest.fn() },
        } as unknown as GuildQueue

        const removed = await removeTrackFromQueue(queue, 3)

        expect(removed).toBeNull()
    })

    it('moves track in queue and inserts at requested position', async () => {
        const trackA = { title: 'A' } as Track
        const trackB = { title: 'B' } as Track
        const trackC = { title: 'C' } as Track
        const removeMock = jest.fn()
        const insertTrackMock = jest.fn()
        const queue = {
            tracks: {
                toArray: jest
                    .fn()
                    .mockReturnValueOnce([trackA, trackB, trackC])
                    .mockReturnValueOnce([trackA, trackC]),
            },
            node: { remove: removeMock },
            addTrack: jest.fn(),
            insertTrack: insertTrackMock,
        } as unknown as GuildQueue

        const moved = await moveTrackInQueue(queue, 1, 0)

        expect(moved).toBe(trackB)
        expect(removeMock).toHaveBeenCalledWith(trackB)
        expect(insertTrackMock).toHaveBeenCalledWith(trackB, 0)
    })

    it('rescues queue by removing unplayable tracks', async () => {
        const playableTrack = {
            title: 'Playable',
            author: 'Artist',
            url: 'https://example.com/playable',
        } as Track
        const brokenTrack = {
            title: 'Broken',
            author: '',
            url: '',
        } as Track
        const queue = {
            tracks: {
                toArray: jest
                    .fn()
                    .mockReturnValue([playableTrack, brokenTrack]),
                size: 2,
            },
            clear: jest.fn(),
            addTrack: jest.fn(),
            repeatMode: 0,
            currentTrack: playableTrack,
        } as unknown as GuildQueue

        const result = await rescueQueue(queue)

        expect(result).toEqual({
            removedTracks: 1,
            keptTracks: 1,
            addedTracks: 0,
        })
        expect((queue as any).clear).toHaveBeenCalled()
        expect((queue as any).addTrack).toHaveBeenCalledWith(playableTrack)
    })
})
