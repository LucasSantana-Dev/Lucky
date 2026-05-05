import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'

const errorLogMock = jest.fn()
const replenishQueueMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('./autoplay/replenisher', () => ({
    replenishQueue: (...args: unknown[]) => replenishQueueMock(...args),
}))

import { rescueQueue, getHistoryTracks, buildVcContributionWeights } from './queueRescue'

function createTrack(overrides: Partial<{ url: string; title: string; author: string; requestedBy: { id: string } | null }>): Track {
    return {
        url: 'https://example.com/track',
        title: 'Track Title',
        author: 'Artist',
        requestedBy: null,
        ...overrides,
    } as unknown as Track
}

function createQueue(tracks: Track[], opts: { currentTrack?: Track | null; historyTracks?: Track[] } = {}): GuildQueue {
    let queueTracks = [...tracks]
    const historyData = opts.historyTracks ?? []
    const toArrayMock = jest.fn(() => [...queueTracks])
    return {
        tracks: {
            toArray: toArrayMock,
            get size() { return queueTracks.length },
        },
        clear: jest.fn(() => { queueTracks = [] }),
        addTrack: jest.fn((t: Track) => queueTracks.push(t)),
        node: {
            remove: jest.fn(),
        },
        currentTrack: opts.currentTrack ?? null,
        history: {
            tracks: {
                toArray: jest.fn(() => [...historyData]),
            },
        },
        player: {
            search: jest.fn(),
        },
        guild: { id: 'guild-1' },
    } as unknown as GuildQueue
}

describe('rescueQueue', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        replenishQueueMock.mockResolvedValue(undefined)
    })

    it('removes tracks with missing url', async () => {
        const bad = createTrack({ url: '' })
        const good = createTrack({ url: 'https://example.com/t', title: 'T', author: 'A' })
        const queue = createQueue([bad, good], { currentTrack: good })
        const result = await rescueQueue(queue)
        expect(result.removedTracks).toBe(1)
        expect(result.keptTracks).toBe(1)
    })

    it('removes tracks with missing title', async () => {
        const bad = createTrack({ title: '' })
        const queue = createQueue([bad])
        const result = await rescueQueue(queue)
        expect(result.removedTracks).toBe(1)
        expect(result.keptTracks).toBe(0)
    })

    it('removes tracks with missing author', async () => {
        const bad = createTrack({ author: '' })
        const queue = createQueue([bad])
        const result = await rescueQueue(queue)
        expect(result.removedTracks).toBe(1)
    })

    it('keeps valid tracks', async () => {
        const good = createTrack({})
        const queue = createQueue([good])
        const result = await rescueQueue(queue)
        expect(result.keptTracks).toBe(1)
        expect(result.removedTracks).toBe(0)
    })

    it('calls replenishQueue when tracks below threshold and currentTrack present', async () => {
        const good = createTrack({})
        const queue = createQueue([good], { currentTrack: good })
        await rescueQueue(queue, { refillThreshold: 5 })
        expect(replenishQueueMock).toHaveBeenCalledWith(queue)
    })

    it('does not call replenishQueue when no currentTrack', async () => {
        const tracks = [createTrack({}), createTrack({}), createTrack({}), createTrack({})]
        const queue = createQueue(tracks, { currentTrack: null })
        await rescueQueue(queue, { refillThreshold: 10 })
        expect(replenishQueueMock).not.toHaveBeenCalled()
    })

    it('returns error fallback when exception thrown', async () => {
        const queue = createQueue([createTrack({})])
        ;(queue.tracks.toArray as jest.Mock).mockImplementation(() => { throw new Error('fail') })
        errorLogMock.mockReturnValue(undefined)
        const result = await rescueQueue(queue)
        expect(result.removedTracks).toBe(0)
        expect(result.addedTracks).toBe(0)
    })

    it('probes track resolvability and keeps track when search succeeds', async () => {
        const track = createTrack({ title: 'Song', author: 'Artist' })
        const queue = createQueue([track], { currentTrack: track })
        ;(queue.player.search as jest.Mock).mockResolvedValue({ tracks: [track] })
        const result = await rescueQueue(queue, { probeResolvable: true, probeTimeoutMs: 100 })
        expect(result.keptTracks).toBe(1)
        expect(result.removedTracks).toBe(0)
    })

    it('probes track resolvability and removes track when search returns empty', async () => {
        const track = createTrack({ title: 'Song', author: 'Artist' })
        const queue = createQueue([track], { currentTrack: track })
        ;(queue.player.search as jest.Mock).mockResolvedValue({ tracks: [] })
        const result = await rescueQueue(queue, { probeResolvable: true, probeTimeoutMs: 100 })
        expect(result.removedTracks).toBe(1)
        expect(result.keptTracks).toBe(0)
    })

    it('probes track resolvability and removes track when search rejects', async () => {
        const track = createTrack({ title: 'Song', author: 'Artist' })
        const queue = createQueue([track], { currentTrack: track })
        ;(queue.player.search as jest.Mock).mockRejectedValue(new Error('search failed'))
        errorLogMock.mockReturnValue(undefined)
        const result = await rescueQueue(queue, { probeResolvable: true, probeTimeoutMs: 100 })
        expect(result.removedTracks).toBe(1)
        expect(result.keptTracks).toBe(0)
    })
})

describe('getHistoryTracks', () => {
    it('returns up to 3 history tracks', () => {
        const tracks = [
            createTrack({ title: 'T1' }),
            createTrack({ title: 'T2' }),
            createTrack({ title: 'T3' }),
            createTrack({ title: 'T4' }),
        ]
        const queue = createQueue([], { historyTracks: tracks })
        const result = getHistoryTracks(queue)
        expect(result).toHaveLength(3)
        expect(result[0].title).toBe('T1')
    })

    it('returns all history tracks when fewer than 3', () => {
        const tracks = [createTrack({ title: 'T1' })]
        const queue = createQueue([], { historyTracks: tracks })
        const result = getHistoryTracks(queue)
        expect(result).toHaveLength(1)
    })

    it('returns empty array when no history', () => {
        const queue = createQueue([], { historyTracks: [] })
        const result = getHistoryTracks(queue)
        expect(result).toHaveLength(0)
    })

    it('handles queue without history object', () => {
        const queue = createQueue([])
        ;(queue as unknown as { history: undefined }).history = undefined
        const result = getHistoryTracks(queue)
        expect(result).toHaveLength(0)
    })
})

describe('buildVcContributionWeights', () => {
    it('gives weight proportional to track contributions', () => {
        const tracks = [
            createTrack({ requestedBy: { id: 'user1' } }),
            createTrack({ requestedBy: { id: 'user1' } }),
            createTrack({ requestedBy: { id: 'user2' } }),
        ]
        const weights = buildVcContributionWeights(tracks, ['user1', 'user2'])
        expect(weights.has('user1')).toBe(true)
        expect(weights.has('user2')).toBe(true)
        // user1 contributed 2, user2 contributed 1
        const w1 = weights.get('user1')!
        const w2 = weights.get('user2')!
        expect(w1).toBeGreaterThan(w2)
    })

    it('gives weight 1 to members with no contributions', () => {
        const tracks = [createTrack({ requestedBy: { id: 'user1' } })]
        const weights = buildVcContributionWeights(tracks, ['user1', 'user2'])
        // user2 has 0 contributions → gets base count of 1
        expect(weights.has('user2')).toBe(true)
        expect(weights.get('user2')).toBeGreaterThan(0)
    })

    it('returns empty map for empty vcMemberIds', () => {
        const tracks = [createTrack({ requestedBy: { id: 'user1' } })]
        const weights = buildVcContributionWeights(tracks, [])
        expect(weights.size).toBe(0)
    })
})
