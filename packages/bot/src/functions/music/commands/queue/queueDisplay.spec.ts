import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
    createQueueSummary,
    createTrackListDisplay,
    findSimilarTracksInQueue,
    formatTrackForDisplay,
} from './queueDisplay'
import type { QueueDisplayOptions } from './types'

const getTrackInfoMock = jest.fn()
const isSimilarTitleMock = jest.fn()

jest.mock('../../../../utils/music/trackUtils', () => ({
    getTrackInfo: (...args: unknown[]) => getTrackInfoMock(...args),
}))

jest.mock('../../../../utils/music/titleComparison', () => ({
    isSimilarTitle: (...args: unknown[]) => isSimilarTitleMock(...args),
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
        isSimilarTitleMock.mockResolvedValue(false)
    })

    describe('formatTrackForDisplay', () => {
        it('returns basic display info without recommendation reason for normal tracks', async () => {
            const track = createTrack()

            const result = await formatTrackForDisplay(
                track as any,
                1,
                defaultOptions,
            )

            expect(result.title).toBe('Test Track')
            expect(result.author).toBe('Test Artist')
            expect(result.isAutoplay).toBeUndefined()
            expect(result.recommendationReason).toBeUndefined()
        })

        it('surfaces isAutoplay and recommendationReason from track metadata', async () => {
            const track = createTrack({
                metadata: {
                    isAutoplay: true,
                    recommendationReason: 'fresh artist rotation',
                },
            })

            const result = await formatTrackForDisplay(
                track as any,
                1,
                defaultOptions,
            )

            expect(result.isAutoplay).toBe(true)
            expect(result.recommendationReason).toBe('fresh artist rotation')
        })
    })

    describe('createTrackListDisplay', () => {
        it('renders plain track entry without reason tag for non-autoplay tracks', async () => {
            const track = createTrack()
            const result = await createTrackListDisplay(
                [track as any],
                defaultOptions,
            )

            expect(result).toContain('[Test Track]')
            expect(result).not.toContain('_')
        })

        it('truncates title longer than 40 chars to exactly 40 displayed chars', async () => {
            const track = createTrack({ title: 'A'.repeat(41) })
            const result = await createTrackListDisplay(
                [track as any],
                defaultOptions,
            )

            expect(result).toContain('A'.repeat(39) + '\u2026')
            expect(result).not.toContain('A'.repeat(41))
        })

        it('does not truncate title of exactly 40 chars', async () => {
            const track = createTrack({ title: 'B'.repeat(40) })
            const result = await createTrackListDisplay(
                [track as any],
                defaultOptions,
            )

            expect(result).toContain('B'.repeat(40))
            expect(result).not.toContain('\u2026')
        })

        it('renders hyperlink for http URL', async () => {
            const track = createTrack({
                url: 'https://open.spotify.com/track/abc123',
            })
            const result = await createTrackListDisplay(
                [track as any],
                defaultOptions,
            )

            expect(result).toContain(
                '[Test Track](https://open.spotify.com/track/abc123)',
            )
        })

        it('renders plain title without hyperlink for ytsearch internal URL', async () => {
            const track = createTrack({ url: 'ytsearch:Test Track' })
            const result = await createTrackListDisplay(
                [track as any],
                defaultOptions,
            )

            expect(result).not.toContain('](ytsearch:')
            expect(result).toContain('Test Track')
        })

        it('renders plain title without hyperlink for scsearch internal URL', async () => {
            const track = createTrack({ url: 'scsearch:Test Track' })
            const result = await createTrackListDisplay(
                [track as any],
                defaultOptions,
            )

            expect(result).not.toContain('](scsearch:')
            expect(result).toContain('Test Track')
        })

        it('renders plain title without hyperlink when url is empty', async () => {
            const track = createTrack({ url: '' })
            const result = await createTrackListDisplay(
                [track as any],
                defaultOptions,
            )

            expect(result).not.toContain('](')
            expect(result).toContain('Test Track')
        })

        it('appends recommendation reason tag for autoplay tracks', async () => {
            const track = createTrack({
                metadata: {
                    isAutoplay: true,
                    recommendationReason: 'fresh artist rotation',
                },
            })

            const result = await createTrackListDisplay(
                [track as any],
                defaultOptions,
            )

            expect(result).toContain('fresh artist rotation')
            expect(result).toContain('_fresh artist rotation_')
        })

        it('does not append reason tag when isAutoplay is true but reason is empty', async () => {
            const track = createTrack({
                metadata: { isAutoplay: true, recommendationReason: '' },
            })

            const result = await createTrackListDisplay(
                [track as any],
                defaultOptions,
            )

            expect(result).not.toContain('_')
        })

        it('shows overflow message when tracks exceed maxTracksToShow', async () => {
            const tracks = Array.from({ length: 15 }, (_, i) =>
                createTrack({ title: `Track ${i}` }),
            )
            const options = { ...defaultOptions, maxTracksToShow: 10 }
            const result = await createTrackListDisplay(
                tracks as any[],
                options,
            )

            expect(result).toContain('5 more tracks')
        })
    })

    describe('findSimilarTracksInQueue', () => {
        it('returns tracks whose titles are similar to the current track', async () => {
            const current = createTrack({ title: 'Amazing Song' })
            const similar = createTrack({ title: 'Amazing Song (Remix)' })
            const different = createTrack({ title: 'Something Else' })

            isSimilarTitleMock
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(false)

            const result = await findSimilarTracksInQueue(current as any, [
                similar as any,
                different as any,
            ])

            expect(result).toHaveLength(1)
            expect(result[0]).toBe(similar)
        })

        it('returns empty array when no tracks are similar', async () => {
            const current = createTrack({ title: 'Amazing Song' })
            const unrelated = createTrack({ title: 'Completely Different' })

            isSimilarTitleMock.mockResolvedValue(false)

            const result = await findSimilarTracksInQueue(current as any, [
                unrelated as any,
            ])

            expect(result).toHaveLength(0)
        })
    })

    describe('createQueueSummary', () => {
        it('returns total tracks and duration without position when currentPosition is 0', () => {
            const result = createQueueSummary(10, '45:00', 0)

            expect(result).toContain('**Total Tracks:** 10')
            expect(result).toContain('**Total Duration:** 45:00')
            expect(result).not.toContain('Current Position')
        })

        it('includes current position formatted as M:SS when currentPosition is greater than 0', () => {
            const result = createQueueSummary(5, '20:00', 90)

            expect(result).toContain('**Total Tracks:** 5')
            expect(result).toContain('**Total Duration:** 20:00')
            expect(result).toContain('**Current Position:** 1:30')
        })
    })
})
