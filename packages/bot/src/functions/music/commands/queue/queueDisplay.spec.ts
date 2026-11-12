import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
    createTrackListDisplay,
    findSimilarTracksInQueue,
    formatTrackForDisplay,
} from './queueDisplay'
import type { QueueDisplayOptions } from './types'
import { translatorFor } from '../../../../i18n'

// The real English translator: the assertions double as a check that every
// key the list asks for exists in en.json.
const t = translatorFor('en')

const getTrackInfoMock = jest.fn()
const isSimilarTitleMock = jest.fn()

jest.mock('../../../../services/musicManagement/trackUtils', () => ({
    getTrackInfo: (...args: unknown[]) => getTrackInfoMock(...args),
}))

jest.mock('../../../../services/musicManagement/titleComparison', () => ({
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

        it('leaves the duration empty instead of an English placeholder', async () => {
            getTrackInfoMock.mockResolvedValueOnce({ duration: '' })

            const result = await formatTrackForDisplay(
                createTrack() as any,
                1,
                defaultOptions,
            )

            expect(result.duration).toBe('')
        })
    })

    describe('createTrackListDisplay', () => {
        it('returns empty rather than an English sentinel when nothing renders', async () => {
            // The caller supplies a localized fallback. Returning a truthy
            // English string here would always beat it.
            const result = await createTrackListDisplay(
                [],
                defaultOptions,
                0,
                t,
            )

            expect(result).toBe('')
        })

        it('renders "N. title · artist · duration · requester" on one line', async () => {
            const track = createTrack({
                requestedBy: { username: 'PitaDure' },
            })
            const result = await createTrackListDisplay(
                [track as any],
                defaultOptions,
                0,
                t,
            )

            expect(result).toBe(
                '1. [Test Track](https://example.com/track) · Test Artist · 3:30 · PitaDure',
            )
        })

        it('drops the parts it does not know', async () => {
            getTrackInfoMock.mockResolvedValueOnce({ duration: '' })
            const result = await createTrackListDisplay(
                [createTrack() as any],
                defaultOptions,
                0,
                t,
            )

            expect(result).toBe(
                '1. [Test Track](https://example.com/track) · Test Artist',
            )
        })

        it('truncates title longer than 40 chars to exactly 40 displayed chars', async () => {
            const track = createTrack({ title: 'A'.repeat(41) })
            const result = await createTrackListDisplay(
                [track as any],
                defaultOptions,
                0,
                t,
            )

            expect(result).toContain('A'.repeat(39) + '…')
            expect(result).not.toContain('A'.repeat(41))
        })

        it('does not truncate title of exactly 40 chars', async () => {
            const track = createTrack({ title: 'B'.repeat(40) })
            const result = await createTrackListDisplay(
                [track as any],
                defaultOptions,
                0,
                t,
            )

            expect(result).toContain('B'.repeat(40))
            expect(result).not.toContain('…')
        })

        it('escapes the brackets of a title so the link stays intact', async () => {
            const track = createTrack({ title: 'Song [Official Video]' })
            const result = await createTrackListDisplay(
                [track as any],
                defaultOptions,
                0,
                t,
            )

            expect(result).toContain(
                '[Song \\[Official Video\\]](https://example.com/track)',
            )
        })

        it('renders hyperlink for http URL', async () => {
            const track = createTrack({
                url: 'https://open.spotify.com/track/abc123',
            })
            const result = await createTrackListDisplay(
                [track as any],
                defaultOptions,
                0,
                t,
            )

            expect(result).toContain(
                '[Test Track](https://open.spotify.com/track/abc123)',
            )
        })

        it.each(['ytsearch:Test Track', 'scsearch:Test Track', ''])(
            'renders a plain title without hyperlink for url %p',
            async (url) => {
                const track = createTrack({ url })
                const result = await createTrackListDisplay(
                    [track as any],
                    defaultOptions,
                    0,
                    t,
                )

                expect(result).not.toContain('](')
                expect(result).toContain('1. Test Track · Test Artist')
            },
        )

        it('tags an autoplay pick instead of naming a requester, without the reason', async () => {
            const track = createTrack({
                requestedBy: { username: 'Lucky' },
                metadata: {
                    isAutoplay: true,
                    recommendationReason: 'fresh artist rotation',
                },
            })

            const result = await createTrackListDisplay(
                [track as any],
                defaultOptions,
                0,
                t,
            )

            expect(result).toMatch(/ · autoplay$/)
            expect(result).not.toContain('Lucky')
            expect(result).not.toContain('fresh artist rotation')
        })

        it('lists requested tracks first, then autoplay picks under a header', async () => {
            const auto = createTrack({
                title: 'Auto',
                metadata: { isAutoplay: true },
            })
            const mine = createTrack({
                title: 'Mine',
                requestedBy: { username: 'PitaDure' },
            })

            const result = await createTrackListDisplay(
                [auto as any, mine as any],
                defaultOptions,
                0,
                t,
            )

            const lines = result.split('\n')
            expect(lines[0]).toContain('2. [Mine]')
            expect(lines[1]).toBe('**✨ Autoplay**')
            expect(lines[2]).toContain('1. [Auto]')
        })

        it('omits the autoplay header when the page only has autoplay picks', async () => {
            const auto = createTrack({ metadata: { isAutoplay: true } })

            const result = await createTrackListDisplay(
                [auto as any],
                defaultOptions,
                0,
                t,
            )

            expect(result).not.toContain('✨ Autoplay')
        })

        it('shows overflow message when tracks exceed maxTracksToShow', async () => {
            const tracks = Array.from({ length: 15 }, (_, i) =>
                createTrack({ title: `Track ${i}` }),
            )
            const options = { ...defaultOptions, maxTracksToShow: 10 }
            const result = await createTrackListDisplay(
                tracks as any[],
                options,
                0,
                t,
            )

            expect(result.split('\n').pop()).toBe('…and 5 more tracks')
        })

        it('numbers the second page from where the first left off', async () => {
            const tracks = Array.from({ length: 12 }, (_, i) =>
                createTrack({ title: `Track ${i}` }),
            )
            const result = await createTrackListDisplay(
                tracks as any[],
                defaultOptions,
                1,
                t,
            )

            expect(result.split('\n')).toHaveLength(2)
            expect(result).toContain('11. [Track 10]')
            expect(result).not.toContain('more track')
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
})
