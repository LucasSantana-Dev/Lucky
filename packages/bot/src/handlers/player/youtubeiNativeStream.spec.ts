import { jest } from '@jest/globals'
import { EventEmitter } from 'events'

const mockSearch = jest.fn()
const mockGetInnertube = jest.fn()
const mockCreateAdaptiveStream = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
    errorLog: jest.fn(),
}))
jest.mock('discord-player-youtubei', () => ({
    getInnertube: (...args: unknown[]) => mockGetInnertube(...args),
}))
jest.mock('simple-ytdl-core', () => ({
    createAdaptiveStreamMultiStep: (...args: unknown[]) =>
        mockCreateAdaptiveStream(...args),
}))

import {
    searchYoutubeiCandidates,
    streamViaYoutubei,
    YOUTUBEI_STREAM_TIMEOUT_MS,
} from './youtubeiNativeStream'

const tube = { search: (...args: unknown[]) => mockSearch(...args) }
const text = (value: string) => ({ toString: () => value })

describe('youtubeiNativeStream', () => {
    const originalEnv = process.env.HOSTED_YOUTUBE_ENABLED

    beforeEach(() => {
        jest.clearAllMocks()
        delete process.env.HOSTED_YOUTUBE_ENABLED
        mockGetInnertube.mockResolvedValue(tube)
    })

    afterEach(() => {
        jest.useRealTimers()
        if (originalEnv === undefined) delete process.env.HOSTED_YOUTUBE_ENABLED
        else process.env.HOSTED_YOUTUBE_ENABLED = originalEnv
    })

    it('streams a video through the shared Innertube instance', async () => {
        const stream = new EventEmitter()
        mockCreateAdaptiveStream.mockResolvedValue(stream)

        await expect(streamViaYoutubei('abc')).resolves.toBe(stream)

        expect(mockGetInnertube).toHaveBeenCalledWith({})
        expect(mockCreateAdaptiveStream).toHaveBeenCalledWith(tube, 'abc')
    })

    it('rejects on timeout and destroys a stream that arrives late', async () => {
        jest.useFakeTimers()
        const late = { destroy: jest.fn() }
        let resolveStream: (value: unknown) => void = () => undefined
        mockCreateAdaptiveStream.mockReturnValue(
            new Promise((resolve) => {
                resolveStream = resolve
            }),
        )

        const pending = streamViaYoutubei('abc')
        const assertion = expect(pending).rejects.toThrow(
            `youtubei stream timed out after ${YOUTUBEI_STREAM_TIMEOUT_MS}ms`,
        )
        await jest.advanceTimersByTimeAsync(YOUTUBEI_STREAM_TIMEOUT_MS)
        await assertion

        resolveStream(late)
        await Promise.resolve()
        await Promise.resolve()
        expect(late.destroy).toHaveBeenCalled()
    })

    it('maps search results to candidates, skipping non-video nodes', async () => {
        mockSearch.mockResolvedValue({
            videos: [
                { type: 'ShortsLockupView' },
                {
                    video_id: 'v1',
                    title: text('Song (Official Audio)'),
                    author: { name: 'Artist - Topic' },
                    duration: { seconds: 201 },
                },
                { video_id: 'v2', title: text('Live') },
            ],
        })

        await expect(searchYoutubeiCandidates('song artist')).resolves.toEqual([
            {
                id: 'v1',
                title: 'Song (Official Audio)',
                channel: 'Artist - Topic',
                durationSec: 201,
            },
            { id: 'v2', title: 'Live', channel: '', durationSec: null },
        ])
        expect(mockSearch).toHaveBeenCalledWith('song artist', {
            type: 'video',
        })
    })

    it('caps the candidate list at the limit', async () => {
        mockSearch.mockResolvedValue({
            videos: ['a', 'b', 'c'].map((id) => ({
                video_id: id,
                title: text(id),
            })),
        })

        const result = await searchYoutubeiCandidates('q', 2)
        expect(result.map((c) => c.id)).toEqual(['a', 'b'])
    })

    it('rejects an empty query', async () => {
        await expect(searchYoutubeiCandidates('  ')).rejects.toThrow(
            'empty query',
        )
    })

    it('never loads youtubei with HOSTED_YOUTUBE_ENABLED off', async () => {
        process.env.HOSTED_YOUTUBE_ENABLED = 'false'

        await expect(streamViaYoutubei('abc')).rejects.toThrow(
            'HOSTED_YOUTUBE_ENABLED',
        )
        await expect(searchYoutubeiCandidates('q')).rejects.toThrow(
            'HOSTED_YOUTUBE_ENABLED',
        )
        expect(mockGetInnertube).not.toHaveBeenCalled()
        expect(mockCreateAdaptiveStream).not.toHaveBeenCalled()
    })
})
