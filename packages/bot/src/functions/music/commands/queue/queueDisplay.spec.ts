import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { createTrackListDisplay, formatTrackForDisplay } from './queueDisplay'
import type { QueueDisplayOptions } from './types'

const getTrackInfoMock = jest.fn()

jest.mock('../../../../utils/music/trackUtils', () => ({
    getTrackInfo: (...args: unknown[]) => getTrackInfoMock(...args),
}))

jest.mock('../../../../utils/music/titleComparison', () => ({
    isSimilarTitle: jest.fn(() => Promise.resolve(false)),
}))

const defaultOptions: QueueDisplayOptions = {
    showCurrentTrack: true,
    showUpcomingTracks: true,
    maxTracksToShow: 10,
    showTotalDuration: true,
    showQueueStats: true,
}

function createTrack(overrides: Record<string, unknown> = {}): unknown {
    return {
        title: 'Test Track',
        author: 'Test Artist',
        url: 'https://example.com/track',
        thumbnail: undefined,
        requestedBy: undefined,
        metadata: {},
        ...overrides,
    }
}

describe('queueDisplay', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        getTrackInfoMock.mockResolvedValue({ duration: '3:30' })
    })

    describe('formatTrackForDisplay', () => {
        it('returns basic display info without recommendation reason for normal tracks', async () => {
            const track = createTrack()

            const result = await formatTrackForDisplay(track as any, 1, defaultOptions)

            expect(result.title).toBe('Test Track')
            expect(result.author).toBe('Test Artist')
            expect(result.isAutoplay).toBeUndefined()
            expect(result.recommendationReason).toBeUndefined()
        })

        it('surfaces isAutoplay and recommendationReason from track metadata', async () => {
            const track = createTrack({
                metadata: { isAutoplay: true, recommendationReason: 'fresh artist rotation' },
            })

            const result = await formatTrackForDisplay(track as any, 1, defaultOptions)

            expect(result.isAutoplay).toBe(true)
            expect(result.recommendationReason).toBe('fresh artist rotation')
        })
    })

    describe('createTrackListDisplay', () => {
        it('renders plain track entry without reason tag for non-autoplay tracks', async () => {
            const track = createTrack()
            const result = await createTrackListDisplay([track as any], defaultOptions)

            expect(result).toContain('[Test Track]')
            expect(result).not.toContain('_')
        })

        it('appends recommendation reason tag for autoplay tracks', async () => {
            const track = createTrack({
                metadata: { isAutoplay: true, recommendationReason: 'fresh artist rotation' },
            })

            const result = await createTrackListDisplay([track as any], defaultOptions)

            expect(result).toContain('fresh artist rotation')
            expect(result).toContain('_fresh artist rotation_')
        })

        it('does not append reason tag when isAutoplay is true but reason is empty', async () => {
            const track = createTrack({
                metadata: { isAutoplay: true, recommendationReason: '' },
            })

            const result = await createTrackListDisplay([track as any], defaultOptions)

            expect(result).not.toContain('_')
        })

        it('shows overflow message when tracks exceed maxTracksToShow', async () => {
            const tracks = Array.from({ length: 15 }, (_, i) =>
                createTrack({ title: `Track ${i}` }),
            )
            const options = { ...defaultOptions, maxTracksToShow: 10 }
            const result = await createTrackListDisplay(tracks as any[], options)

            expect(result).toContain('5 more tracks')
        })
    })
})
