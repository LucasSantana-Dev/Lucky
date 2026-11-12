import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const controlRow = { kind: 'controls' }
const actionRow = { kind: 'actions' }
const paginationRowMock = jest.fn<(...args: unknown[]) => unknown>()
const createMusicActionButtonsMock = jest.fn(() => actionRow)

jest.mock('../../../../utils/music/buttonComponents', () => ({
    createQueuePaginationButtons: (...args: unknown[]) =>
        paginationRowMock(...args),
    createMusicControlButtons: jest.fn(() => controlRow),
    createMusicActionButtons: () => createMusicActionButtonsMock(),
}))

import { createQueueEmbed, createQueueErrorEmbed } from './queueEmbed'
import { translatorFor } from '../../../../i18n'
import type { QueueDisplayOptions } from './types'

// The real English translator, not a stub. These assertions then double as a
// check that every key the embed asks for actually exists in en.json.
const t = translatorFor('en')

const setDescriptionMock = jest.fn().mockReturnThis()
const setFooterMock = jest.fn().mockReturnThis()
const addFieldsMock = jest.fn().mockReturnThis()
const setThumbnailMock = jest.fn().mockReturnThis()
const mockEmbed = {
    setDescription: setDescriptionMock,
    setFooter: setFooterMock,
    addFields: addFieldsMock,
    setThumbnail: setThumbnailMock,
}

const createEmbedMock = jest.fn(() => mockEmbed)
const calculateQueueStatsMock = jest.fn()
const createTrackListDisplayMock = jest.fn()

jest.mock('../../../../utils/general/embeds', () => ({
    createEmbed: (...args: unknown[]) => createEmbedMock(...args),
    EMBED_COLORS: { QUEUE: '#00b0f4', ERROR: '#ed4245' },
    EMOJIS: { QUEUE: '📄', ERROR: '❌' },
}))

jest.mock('./queueStats', () => ({
    calculateQueueStats: (...args: unknown[]) =>
        calculateQueueStatsMock(...args),
}))

jest.mock('./queueDisplay', () => ({
    createTrackListDisplay: (...args: unknown[]) =>
        createTrackListDisplayMock(...args),
}))

const defaultOptions: QueueDisplayOptions = {
    showCurrentTrack: true,
    showUpcomingTracks: true,
    maxTracksToShow: 10,
    showTotalDuration: true,
    showQueueStats: true,
}

function createQueue(overrides: Record<string, unknown> = {}): unknown {
    const tracks = (overrides.trackList as unknown[]) ?? []
    return {
        currentTrack: null,
        tracks: { toArray: () => tracks, size: tracks.length },
        ...overrides,
    }
}

function createTrack(overrides: Record<string, unknown> = {}): unknown {
    return {
        title: 'Test Track',
        author: 'Test Artist',
        url: 'https://example.com/track',
        duration: '3:40',
        thumbnail: 'https://example.com/thumb.jpg',
        requestedBy: { username: 'PitaDure' },
        metadata: {},
        ...overrides,
    }
}

function description(): string {
    expect(setDescriptionMock).toHaveBeenCalledTimes(1)
    return setDescriptionMock.mock.calls[0][0] as string
}

describe('queueEmbed', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        createEmbedMock.mockReturnValue(mockEmbed as any)
        paginationRowMock.mockReturnValue(null)
        calculateQueueStatsMock.mockResolvedValue({
            totalTracks: 2,
            totalDuration: '9:37',
            currentPosition: 0,
        })
        createTrackListDisplayMock.mockResolvedValue(
            '1. Track One\n2. Track Two',
        )
    })

    describe('createQueueEmbed', () => {
        it('renders one card: now playing, then the numbered list', async () => {
            const queue = createQueue({
                currentTrack: createTrack(),
                trackList: [{}, {}],
            })

            await createQueueEmbed(queue as any, defaultOptions, 0, t)

            expect(description()).toBe(
                '**🎵 Now Playing**\n' +
                    '[Test Track](https://example.com/track) · Test Artist · 3:40 · PitaDure\n\n' +
                    '1. Track One\n2. Track Two',
            )
            expect(createTrackListDisplayMock).toHaveBeenCalledWith(
                [{}, {}],
                defaultOptions,
                0,
                t,
            )
        })

        it('uses no fields, thumbnail or timestamp', async () => {
            const queue = createQueue({ currentTrack: createTrack() })

            await createQueueEmbed(queue as any, defaultOptions, 0, t)

            expect(addFieldsMock).not.toHaveBeenCalled()
            expect(setThumbnailMock).not.toHaveBeenCalled()
            const [options] = createEmbedMock.mock.calls[0] as [object]
            expect(options).not.toHaveProperty('timestamp')
        })

        it('tags an autoplay track playing now instead of the requester and drops the reason', async () => {
            const queue = createQueue({
                currentTrack: createTrack({
                    requestedBy: { username: 'Lucky' },
                    metadata: {
                        isAutoplay: true,
                        recommendationReason: 'fresh artist rotation',
                    },
                }),
            })

            await createQueueEmbed(queue as any, defaultOptions, 0, t)

            const text = description()
            expect(text).toContain('· 3:40 · autoplay')
            expect(text).not.toContain('Lucky')
            expect(text).not.toContain('fresh artist rotation')
        })

        it('leaves out an unknown duration and escapes the title brackets', async () => {
            const queue = createQueue({
                currentTrack: createTrack({
                    title: 'Song [Live]',
                    duration: '0:00',
                }),
            })

            await createQueueEmbed(queue as any, defaultOptions, 0, t)

            expect(description()).toContain(
                '[Song \\[Live\\]](https://example.com/track) · Test Artist · PitaDure',
            )
        })

        it('says the queue is empty when nothing is up next', async () => {
            const queue = createQueue()

            await createQueueEmbed(queue as any, defaultOptions, 0, t)

            expect(description()).toBe('No tracks in queue')
            expect(createTrackListDisplayMock).not.toHaveBeenCalled()
        })

        it('uses the localized fallback when the page has nothing to render', async () => {
            // Tracks exist, but this page is past the end, so the list comes
            // back empty. It must not fall back to the "queue is empty" text.
            const queue = createQueue({
                trackList: [{ title: 'a' }, { title: 'b' }],
            })
            createTrackListDisplayMock.mockResolvedValueOnce('')

            await createQueueEmbed(queue as any, defaultOptions, 9, t)

            expect(description()).toBe('No displayable tracks')
        })

        it('puts the count and total duration in the footer', async () => {
            const queue = createQueue()

            await createQueueEmbed(queue as any, defaultOptions, 0, t)

            expect(setFooterMock).toHaveBeenCalledWith({
                text: '2 songs in queue • Total duration 9:37',
            })
        })

        it('uses the singular footer for one song', async () => {
            calculateQueueStatsMock.mockResolvedValueOnce({
                totalTracks: 1,
                totalDuration: '2:53',
                currentPosition: 0,
            })

            await createQueueEmbed(createQueue() as any, defaultOptions, 0, t)

            expect(setFooterMock).toHaveBeenCalledWith({
                text: '1 song in queue • Total duration 2:53',
            })
        })

        it('skips the footer when showQueueStats is false', async () => {
            const options = { ...defaultOptions, showQueueStats: false }

            await createQueueEmbed(createQueue() as any, options, 0, t)

            expect(setFooterMock).not.toHaveBeenCalled()
            expect(calculateQueueStatsMock).not.toHaveBeenCalled()
        })

        it('skips the now-playing section when showCurrentTrack is false', async () => {
            const queue = createQueue({ currentTrack: createTrack() })
            const options = { ...defaultOptions, showCurrentTrack: false }

            await createQueueEmbed(queue as any, options, 0, t)

            expect(description()).not.toContain('Now Playing')
        })

        it('skips the list when showUpcomingTracks is false', async () => {
            const queue = createQueue({
                currentTrack: createTrack(),
                trackList: [{}],
            })
            const options = { ...defaultOptions, showUpcomingTracks: false }

            await createQueueEmbed(queue as any, options, 0, t)

            expect(createTrackListDisplayMock).not.toHaveBeenCalled()
            expect(description()).not.toContain('Track One')
        })

        it('sets no description when every section is off', async () => {
            const options = {
                ...defaultOptions,
                showCurrentTrack: false,
                showUpcomingTracks: false,
            }

            await createQueueEmbed(createQueue() as any, options, 0, t)

            expect(setDescriptionMock).not.toHaveBeenCalled()
        })

        it('truncates the description to the 4096-char embed limit', async () => {
            createTrackListDisplayMock.mockResolvedValue('x'.repeat(5000))
            const queue = createQueue({ trackList: [{}] })

            await createQueueEmbed(queue as any, defaultOptions, 0, t)

            const text = description()
            expect(text.length).toBe(4096)
            expect(text.endsWith('…')).toBe(true)
        })

        it('has one control row and no action row', async () => {
            const { components } = await createQueueEmbed(
                createQueue() as any,
                defaultOptions,
                0,
                t,
            )

            expect(components).toEqual([controlRow])
            expect(createMusicActionButtonsMock).not.toHaveBeenCalled()
        })

        it('adds the page row after the controls when there is more than one page', async () => {
            const pageRow = { kind: 'pages' }
            paginationRowMock.mockReturnValueOnce(pageRow)
            const queue = createQueue({
                trackList: Array.from({ length: 25 }, () => ({})),
            })

            const { components } = await createQueueEmbed(
                queue as any,
                defaultOptions,
                1,
                t,
            )

            expect(paginationRowMock).toHaveBeenCalledWith(1, 3)
            expect(components).toEqual([controlRow, pageRow])
        })

        it('returns the embed instance', async () => {
            const { embed: result } = await createQueueEmbed(
                createQueue() as any,
                defaultOptions,
                0,
                t,
            )

            expect(result).toBe(mockEmbed)
        })
    })

    describe('createQueueErrorEmbed', () => {
        it('calls createEmbed with the provided error message', () => {
            createQueueErrorEmbed('Something went wrong', t)

            expect(createEmbedMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: 'Something went wrong',
                }),
            )
        })
    })
})
