import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'

const debugLogMock = jest.fn()
const errorLogMock = jest.fn()
const replenishQueueMock = jest.fn()
const randomIntMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('./autoplay/replenisher', () => ({
    replenishQueue: (...args: unknown[]) => replenishQueueMock(...args),
}))

jest.mock('node:crypto', () => ({
    randomInt: (...args: unknown[]) => randomIntMock(...args),
}))

import {
    clearQueue,
    shuffleQueue,
    smartShuffleQueue,
    removeTrackFromQueue,
    moveTrackInQueue,
    extractSpotifyTrackId,
    markAsAutoplayTrack,
    moveUserTrackToPriority,
    blendAutoplayTracks,
} from './queueEditOps'

function createTrack(title: string, author: string, url = '', requestedById?: string): Track {
    return {
        title,
        author,
        url,
        requestedBy: requestedById ? { id: requestedById } : undefined,
        metadata: {},
    } as unknown as Track
}

function createQueue(tracks: Track[]): GuildQueue {
    let queueTracks = [...tracks]
    const addTrackMock = jest.fn((track: Track) => queueTracks.push(track))
    const clearMock = jest.fn(() => { queueTracks = [] })
    return {
        tracks: {
            toArray: () => [...queueTracks],
            get size() { return queueTracks.length },
        },
        clear: clearMock,
        addTrack: addTrackMock,
        insertTrack: jest.fn((track: Track, pos: number) => {
            queueTracks.splice(pos, 0, track)
        }),
        node: {
            remove: jest.fn((track: Track) => {
                const idx = queueTracks.findIndex((t) => t.url === track.url && t.title === track.title)
                if (idx >= 0) queueTracks.splice(idx, 1)
            }),
        },
        guild: { id: 'guild-1' },
        currentTrack: null,
    } as unknown as GuildQueue
}

describe('clearQueue', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('calls queue.clear() and returns true', async () => {
        const queue = createQueue([])
        const result = await clearQueue(queue)
        expect(result).toBe(true)
        expect(queue.clear).toHaveBeenCalled()
    })

    it('returns false and logs error when clear throws', async () => {
        const queue = createQueue([])
        ;(queue.clear as jest.Mock).mockImplementation(() => { throw new Error('fail') })
        errorLogMock.mockReturnValue(undefined)
        const result = await clearQueue(queue)
        expect(result).toBe(false)
        expect(errorLogMock).toHaveBeenCalled()
    })
})

describe('shuffleQueue', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        randomIntMock.mockReturnValue(0)
        replenishQueueMock.mockResolvedValue(undefined)
    })

    it('returns true for single-track queue without shuffling', async () => {
        const track = createTrack('T1', 'A1')
        const queue = createQueue([track])
        const result = await shuffleQueue(queue)
        expect(result).toBe(true)
    })

    it('clears and re-adds tracks after shuffle', async () => {
        const tracks = [createTrack('T1', 'A1', 'u1'), createTrack('T2', 'A2', 'u2'), createTrack('T3', 'A3', 'u3')]
        const queue = createQueue(tracks)
        const result = await shuffleQueue(queue)
        expect(result).toBe(true)
        expect(queue.clear).toHaveBeenCalled()
        expect(queue.addTrack).toHaveBeenCalledTimes(3)
    })

    it('returns false when queue operation throws', async () => {
        const tracks = [createTrack('T1', 'A1'), createTrack('T2', 'A2')]
        const queue = createQueue(tracks)
        ;(queue.clear as jest.Mock).mockImplementation(() => { throw new Error('fail') })
        errorLogMock.mockReturnValue(undefined)
        const result = await shuffleQueue(queue)
        expect(result).toBe(false)
    })
})

describe('smartShuffleQueue', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        randomIntMock.mockReturnValue(0)
    })

    it('shuffles queue and returns true on success', async () => {
        const tracks = [createTrack('T1', 'A1', 'u1'), createTrack('T2', 'A2', 'u2'), createTrack('T3', 'A3', 'u3')]
        const queue = createQueue(tracks)
        const result = await smartShuffleQueue(queue)
        expect(result).toBe(true)
        expect(queue.clear).toHaveBeenCalled()
    })

    it('returns false on error', async () => {
        const tracks = [createTrack('T1', 'A1'), createTrack('T2', 'A2')]
        const queue = createQueue(tracks)
        ;(queue.clear as jest.Mock).mockImplementation(() => { throw new Error('fail') })
        errorLogMock.mockReturnValue(undefined)
        const result = await smartShuffleQueue(queue)
        expect(result).toBe(false)
    })
})

describe('removeTrackFromQueue', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('removes track at valid position and returns it', async () => {
        const t1 = createTrack('T1', 'A1', 'u1')
        const queue = createQueue([t1, createTrack('T2', 'A2', 'u2')])
        const result = await removeTrackFromQueue(queue, 0)
        expect(result).toBe(t1)
        expect(queue.node.remove).toHaveBeenCalledWith(t1)
    })

    it('returns null for out-of-bounds position', async () => {
        const queue = createQueue([createTrack('T1', 'A1')])
        const result = await removeTrackFromQueue(queue, 5)
        expect(result).toBeNull()
    })

    it('returns null and logs error on exception', async () => {
        const queue = createQueue([createTrack('T1', 'A1', 'u1')])
        ;(queue.node.remove as jest.Mock).mockImplementation(() => { throw new Error('fail') })
        errorLogMock.mockReturnValue(undefined)
        const result = await removeTrackFromQueue(queue, 0)
        expect(result).toBeNull()
    })
})

describe('moveTrackInQueue', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('moves track to a valid position and returns it', async () => {
        const t1 = createTrack('T1', 'A1', 'u1')
        const t3 = createTrack('T3', 'A3', 'u3')
        const queue = createQueue([t1, createTrack('T2', 'A2', 'u2'), t3])
        const result = await moveTrackInQueue(queue, 2, 0)
        expect(result).toBe(t3)
        expect(queue.node.remove).toHaveBeenCalledWith(t3)
    })

    it('returns null for out-of-bounds position', async () => {
        const queue = createQueue([createTrack('T1', 'A1')])
        const result = await moveTrackInQueue(queue, -1, 0)
        expect(result).toBeNull()
    })

    it('returns null and logs error on exception', async () => {
        const queue = createQueue([createTrack('T1', 'A1', 'u1'), createTrack('T2', 'A2', 'u2')])
        ;(queue.node.remove as jest.Mock).mockImplementation(() => { throw new Error('fail') })
        errorLogMock.mockReturnValue(undefined)
        const result = await moveTrackInQueue(queue, 0, 1)
        expect(result).toBeNull()
    })
})

describe('extractSpotifyTrackId', () => {
    it('extracts ID from spotify URL', () => {
        const track = createTrack('T', 'A', 'https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh')
        expect(extractSpotifyTrackId(track)).toBe('4iV5W9uYEdYUVa79Axb7Rh')
    })

    it('returns null for non-spotify URL', () => {
        const track = createTrack('T', 'A', 'https://youtube.com/watch?v=abc')
        expect(extractSpotifyTrackId(track)).toBeNull()
    })
})

describe('markAsAutoplayTrack', () => {
    it('marks track as autoplay with metadata', () => {
        const track = createTrack('T', 'A')
        markAsAutoplayTrack(track, 'similar vibes', 'user123')
        const meta = (track as unknown as { metadata: Record<string, unknown> }).metadata
        expect(meta.isAutoplay).toBe(true)
        expect(meta.recommendationReason).toBe('similar vibes')
        expect(meta.requestedById).toBe('user123')
    })

    it('handles metadata mutation', () => {
        const track = createTrack('T', 'A')
        const metadata = { existing: 'value' }
        Object.defineProperty(track, 'metadata', {
            value: metadata,
            configurable: false,
            writable: false,
        })
        markAsAutoplayTrack(track, 'reason', 'user456')
        const meta = (track as unknown as { metadata: Record<string, unknown> }).metadata
        expect(meta.isAutoplay).toBe(true)
        expect(meta.existing).toBe('value')
    })
})

describe('moveUserTrackToPriority', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('moves user track before autoplay tracks', () => {
        const autoTrack = createTrack('Auto', 'Bot', 'u1')
        ;(autoTrack as unknown as { metadata: Record<string, unknown> }).metadata = { isAutoplay: true }
        const userTrack = createTrack('User', 'Human', 'u2')
        const queue = createQueue([autoTrack, userTrack])
        moveUserTrackToPriority(queue, userTrack)
        expect(queue.node.remove).toHaveBeenCalledWith(userTrack)
    })

    it('does nothing when track is not in queue', () => {
        const queue = createQueue([])
        moveUserTrackToPriority(queue, createTrack('T1', 'A1', 'u1'))
        expect(queue.node.remove).not.toHaveBeenCalled()
    })

    it('handles exception from queue.node.remove', () => {
        const autoTrack = createTrack('Auto', 'Bot', 'u1')
        ;(autoTrack as unknown as { metadata: Record<string, unknown> }).metadata = { isAutoplay: true }
        const userTrack = createTrack('User', 'Human', 'u2')
        const queue = createQueue([autoTrack, userTrack])
        ;(queue.node.remove as jest.Mock).mockImplementation(() => { throw new Error('fail') })
        debugLogMock.mockReturnValue(undefined)
        moveUserTrackToPriority(queue, userTrack)
        expect(queue.insertTrack).not.toHaveBeenCalled()
    })
})

describe('blendAutoplayTracks', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        replenishQueueMock.mockResolvedValue(undefined)
    })

    it('returns early without calling replenishQueue when there are no autoplay tracks', async () => {
        const t1 = createTrack('T1', 'A1', 'u1')
        const queue = createQueue([t1])
        await blendAutoplayTracks(queue, t1)
        expect(queue.node.remove).not.toHaveBeenCalled()
        expect(replenishQueueMock).not.toHaveBeenCalled()
    })

    it('removes excess autoplay tracks based on blend ratio', async () => {
        const seedTrack = createTrack('Seed', 'A', 'seed')
        const auto1 = createTrack('Auto1', 'Bot', 'u1')
        const auto2 = createTrack('Auto2', 'Bot', 'u2')
        const auto3 = createTrack('Auto3', 'Bot', 'u3')
        const auto4 = createTrack('Auto4', 'Bot', 'u4')
        for (const t of [auto1, auto2, auto3, auto4]) {
            ;(t as unknown as { metadata: Record<string, unknown> }).metadata = { isAutoplay: true }
        }
        const queue = createQueue([auto1, auto2, auto3, auto4])
        await blendAutoplayTracks(queue, seedTrack, 0.5)
        // keepCount = ceil(4 * 0.5) = 2, toRemove = 2
        expect(queue.node.remove).toHaveBeenCalledTimes(2)
        expect(replenishQueueMock).toHaveBeenCalledWith(queue)
    })
})
