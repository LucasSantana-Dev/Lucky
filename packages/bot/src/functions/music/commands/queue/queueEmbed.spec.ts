import { beforeEach, describe, expect, it, jest } from '@jest/globals'
jest.mock('../../../../utils/music/buttonComponents', () => ({
    createQueuePaginationButtons: jest.fn().mockReturnValue(null),
    createMusicControlButtons: jest.fn().mockReturnValue({}),
    createMusicActionButtons: jest.fn().mockReturnValue({}),
}))

import {
    createQueueEmbed,
    createEmptyQueueEmbed,
    createQueueErrorEmbed,
} from './queueEmbed'
import type { QueueDisplayOptions } from './types'

const addFieldsMock = jest.fn().mockReturnThis()
const setThumbnailMock = jest.fn().mockReturnThis()
const mockEmbed = { addFields: addFieldsMock, setThumbnail: setThumbnailMock }

const createEmbedMock = jest.fn(() => mockEmbed)
const calculateQueueStatsMock = jest.fn()
const getQueueStatusMock = jest.fn()
const createTrackListDisplayMock = jest.fn()
const createQueueSummaryMock = jest.fn()

jest.mock('../../../../utils/general/embeds', () => ({
    createEmbed: (...args: unknown[]) => createEmbedMock(...args),
    EMBED_COLORS: { QUEUE: '#00b0f4', ERROR: '#ed4245' },
    EMOJIS: { QUEUE: '📄', ERROR: '❌' },
}))

jest.mock('./queueStats', () => ({
    calculateQueueStats: (...args: unknown[]) =>
        calculateQueueStatsMock(...args),
    getQueueStatus: (...args: unknown[]) => getQueueStatusMock(...args),
}))

jest.mock('./queueDisplay', () => ({
    createTrackListDisplay: (...args: unknown[]) =>
        createTrackListDisplayMock(...args),
    createQueueSummary: (...args: unknown[]) => createQueueSummaryMock(...args),
}))

const defaultOptions: QueueDisplayOptions = {
    showCurrentTrack: true,
    showUpcomingTracks: true,
    maxTracksToShow: 10,
    showTotalDuration: true,
    showQueueStats: true,
}

function createQueue(overrides: Record<string, unknown> = {}): unknown {
    return {
        currentTrack: null,
        tracks: { toArray: () => [] },
        ...overrides,
    }
}

function createTrack(overrides: Record<string, unknown> = {}): unknown {
    return {
        title: 'Test Track',
        author: 'Test Artist',
        url: 'https://example.com/track',
        thumbnail: undefined,
        metadata: {},
        ...overrides,
    }
}

describe('queueEmbed', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        createEmbedMock.mockReturnValue(mockEmbed as any)
        calculateQueueStatsMock.mockResolvedValue({
            totalTracks: 2,
            totalDuration: '7:00',
            currentPosition: 0,
        })
        getQueueStatusMock.mockReturnValue('Playing')
        createTrackListDisplayMock.mockResolvedValue(
            '1. Track One\n2. Track Two',
        )
        createQueueSummaryMock.mockReturnValue('**Total Tracks:** 2')
    })

    describe('createQueueEmbed', () => {
        it('adds now-playing field without reason line for non-autoplay tracks', async () => {
            const track = createTrack()
            const queue = createQueue({ currentTrack: track })

            await createQueueEmbed(queue as any, defaultOptions)

            const nowPlayingCall = addFieldsMock.mock.calls.find(
                (call) => (call[0] as any).name === '\u{1f3b5} Now Playing',
            )
            expect(nowPlayingCall).toBeDefined()
            const field = nowPlayingCall![0] as { value: string }
            expect(field.value).toBe(
                '[Test Track](https://example.com/track) by **Test Artist**',
            )
            expect(field.value).not.toContain('Recommended because')
        })

        it('appends recommendation reason line for autoplay tracks with a reason', async () => {
            const track = createTrack({
                metadata: {
                    isAutoplay: true,
                    recommendationReason: 'fresh artist rotation',
                },
            })
            const queue = createQueue({ currentTrack: track })

            await createQueueEmbed(queue as any, defaultOptions)

            const nowPlayingCall = addFieldsMock.mock.calls.find(
                (call) => (call[0] as any).name === '\u{1f3b5} Now Playing',
            )
            expect(nowPlayingCall).toBeDefined()
            const field = nowPlayingCall![0] as { value: string }
            expect(field.value).toContain(
                '\nRecommended because: _fresh artist rotation_',
            )
        })

        it('does not append reason line when isAutoplay is true but reason is absent', async () => {
            const track = createTrack({ metadata: { isAutoplay: true } })
            const queue = createQueue({ currentTrack: track })

            await createQueueEmbed(queue as any, defaultOptions)

            const nowPlayingCall = addFieldsMock.mock.calls.find(
                (call) => (call[0] as any).name === '\u{1f3b5} Now Playing',
            )
            expect(nowPlayingCall).toBeDefined()
            const field = nowPlayingCall![0] as { value: string }
            expect(field.value).not.toContain('Recommended because')
        })

        it('does not append reason line when recommendationReason is set but isAutoplay is false', async () => {
            const track = createTrack({
                metadata: {
                    isAutoplay: false,
                    recommendationReason: 'some reason',
                },
            })
            const queue = createQueue({ currentTrack: track })

            await createQueueEmbed(queue as any, defaultOptions)

            const nowPlayingCall = addFieldsMock.mock.calls.find(
                (call) => (call[0] as any).name === '\u{1f3b5} Now Playing',
            )
            expect(nowPlayingCall).toBeDefined()
            const field = nowPlayingCall![0] as { value: string }
            expect(field.value).not.toContain('Recommended because')
        })

        it('sets thumbnail when track has one', async () => {
            const track = createTrack({
                thumbnail: 'https://example.com/thumb.jpg',
            })
            const queue = createQueue({ currentTrack: track })

            await createQueueEmbed(queue as any, defaultOptions)

            expect(setThumbnailMock).toHaveBeenCalledWith(
                'https://example.com/thumb.jpg',
            )
        })

        it('does not call setThumbnail when track has no thumbnail', async () => {
            const track = createTrack({ thumbnail: undefined })
            const queue = createQueue({ currentTrack: track })

            await createQueueEmbed(queue as any, defaultOptions)

            expect(setThumbnailMock).not.toHaveBeenCalled()
        })

        it('adds upcoming tracks field when tracks exist in queue', async () => {
            const track = createTrack()
            const queue = createQueue({
                currentTrack: null,
                tracks: { toArray: () => [track] },
            })

            await createQueueEmbed(queue as any, defaultOptions)

            const upcomingCall = addFieldsMock.mock.calls.find((call) =>
                String((call[0] as any).name).startsWith(
                    '📋 Upcoming Tracks (',
                ),
            )
            expect(upcomingCall).toBeDefined()
        })

        it('adds empty upcoming tracks field when queue is empty', async () => {
            const queue = createQueue({
                currentTrack: null,
                tracks: { toArray: () => [] },
            })

            await createQueueEmbed(queue as any, defaultOptions)

            const emptyCall = addFieldsMock.mock.calls.find(
                (call) => (call[0] as any).value === 'No tracks in queue',
            )
            expect(emptyCall).toBeDefined()
        })

        it('adds queue stats and status fields', async () => {
            const queue = createQueue()

            await createQueueEmbed(queue as any, defaultOptions)

            const statsCall = addFieldsMock.mock.calls.find(
                (call) => (call[0] as any).name === '📊 Queue Statistics',
            )
            const statusCall = addFieldsMock.mock.calls.find(
                (call) => (call[0] as any).name === '🎛️ Status',
            )
            expect(statsCall).toBeDefined()
            expect(statusCall).toBeDefined()
        })

        it('skips now-playing field when showCurrentTrack is false', async () => {
            const track = createTrack()
            const queue = createQueue({ currentTrack: track })
            const options = { ...defaultOptions, showCurrentTrack: false }

            await createQueueEmbed(queue as any, options)

            const nowPlayingCall = addFieldsMock.mock.calls.find(
                (call) => (call[0] as any).name === '\u{1f3b5} Now Playing',
            )
            expect(nowPlayingCall).toBeUndefined()
        })

        it('skips upcoming tracks field when showUpcomingTracks is false', async () => {
            const track = createTrack()
            const queue = createQueue({ tracks: { toArray: () => [track] } })
            const options = { ...defaultOptions, showUpcomingTracks: false }

            await createQueueEmbed(queue as any, options)

            const upcomingCall = addFieldsMock.mock.calls.find((call) =>
                String((call[0] as any).name ?? '').startsWith('📋 Upcoming'),
            )
            expect(upcomingCall).toBeUndefined()
        })

        it('truncates track list value to 1024 chars when it exceeds Discord embed limit', async () => {
            createTrackListDisplayMock.mockResolvedValue('x'.repeat(2000))
            const track = createTrack()
            const queue = createQueue({
                currentTrack: null,
                tracks: { toArray: () => [track] },
            })

            await createQueueEmbed(queue as any, defaultOptions)

            const upcomingCall = addFieldsMock.mock.calls.find((call) =>
                String((call[0] as any).name ?? '').startsWith(
                    '📋 Upcoming Tracks (',
                ),
            )
            expect(upcomingCall).toBeDefined()
            expect((upcomingCall![0] as any).value.length).toBeLessThanOrEqual(
                1024,
            )
        })

        it('returns the embed instance', async () => {
            const queue = createQueue()

            const { embed: result } = await createQueueEmbed(
                queue as any,
                defaultOptions,
            )

            expect(result).toBe(mockEmbed)
        })
    })

    describe('createEmptyQueueEmbed', () => {
        it('calls createEmbed with empty queue description', () => {
            createEmptyQueueEmbed()

            expect(createEmbedMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    description:
                        'The queue is empty. Add some tracks to get started!',
                }),
            )
        })
    })

    describe('createQueueErrorEmbed', () => {
        it('calls createEmbed with the provided error message', () => {
            createQueueErrorEmbed('Something went wrong')

            expect(createEmbedMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: 'Something went wrong',
                }),
            )
        })
    })
})
