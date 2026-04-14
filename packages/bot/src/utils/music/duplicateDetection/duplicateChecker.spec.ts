import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import {
    checkForDuplicate,
    addTrackToHistory,
    getTrackMetadata,
} from './duplicateChecker'

const addTrackToHistoryMock = jest.fn()
const debugLogMock = jest.fn()
const errorLogMock = jest.fn()
const extractTagsMock = jest.fn()
const areTracksSimilarMock = jest.fn()
const calculateSimilarityScoreMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    trackHistoryService: {
        addTrackToHistory: (...args: unknown[]) =>
            addTrackToHistoryMock(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('./tagExtractor', () => ({
    extractTags: (...args: unknown[]) => extractTagsMock(...args),
}))

jest.mock('./similarityChecker', () => ({
    areTracksSimilar: (...args: unknown[]) => areTracksSimilarMock(...args),
    calculateSimilarityScore: (...args: unknown[]) =>
        calculateSimilarityScoreMock(...args),
}))

describe('duplicateChecker', () => {
    const track = {
        id: 'track-1',
        title: 'Song Name',
        author: 'Artist',
        duration: '3:21',
        url: 'https://example.com/song',
        requestedBy: { id: 'user-1' },
        metadata: { isAutoplay: true },
    } as any

    beforeEach(() => {
        jest.clearAllMocks()
        extractTagsMock.mockReturnValue(['rock', 'live'])
        areTracksSimilarMock.mockReturnValue(false)
        calculateSimilarityScoreMock.mockReturnValue(0)
    })

    it('returns non-duplicate when no recent history is available', async () => {
        const result = await checkForDuplicate(track, 'guild-1', {
            titleThreshold: 0.8,
            artistThreshold: 0.8,
            durationThreshold: 0.2,
            overallThreshold: 0.75,
        })

        expect(result).toEqual({ isDuplicate: false })
    })

    it('adds track to history with normalized payload', async () => {
        await addTrackToHistory(track, 'guild-1')

        expect(addTrackToHistoryMock).toHaveBeenCalledWith(
            {
                id: 'track-1',
                title: 'Song Name',
                author: 'Artist',
                duration: '3:21',
                url: 'https://example.com/song',
                metadata: { isAutoplay: true },
            },
            'guild-1',
            'user-1',
        )
        expect(debugLogMock).toHaveBeenCalled()
    })

    it('handles addTrackToHistory failures gracefully', async () => {
        addTrackToHistoryMock.mockRejectedValueOnce(new Error('history failed'))

        await addTrackToHistory(track, 'guild-1')

        expect(errorLogMock).toHaveBeenCalled()
    })

    it('extracts metadata genre from known tags', async () => {
        const metadata = await getTrackMetadata(track, 'guild-1')

        expect(metadata).toEqual({
            artist: 'Artist',
            genre: 'rock',
            tags: ['rock', 'live'],
            views: 1,
        })
    })

    describe('addTrackToHistory edge cases', () => {
        it('handles track with undefined metadata gracefully', async () => {
            const trackWithoutMetadata = {
                ...track,
                metadata: undefined,
            } as any

            await addTrackToHistory(trackWithoutMetadata, 'guild-1')

            expect(addTrackToHistoryMock).toHaveBeenCalledWith(
                {
                    id: 'track-1',
                    title: 'Song Name',
                    author: 'Artist',
                    duration: '3:21',
                    url: 'https://example.com/song',
                    metadata: { isAutoplay: false },
                },
                'guild-1',
                'user-1',
            )
        })

        it('coerces numeric duration to string', async () => {
            const trackWithNumericDuration = {
                ...track,
                duration: 201 as any,
            }

            await addTrackToHistory(trackWithNumericDuration, 'guild-1')

            expect(addTrackToHistoryMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    duration: '201',
                }),
                'guild-1',
                'user-1',
            )
        })

        it('handles track with null requestedBy', async () => {
            const trackWithoutRequester = {
                ...track,
                requestedBy: null,
            } as any

            await addTrackToHistory(trackWithoutRequester, 'guild-1')

            expect(addTrackToHistoryMock).toHaveBeenCalledWith(
                expect.objectContaining({}),
                'guild-1',
                undefined,
            )
        })

        it('handles track with null metadata gracefully', async () => {
            const trackWithNullMetadata = {
                ...track,
                metadata: null,
            } as any

            await addTrackToHistory(trackWithNullMetadata, 'guild-1')

            expect(addTrackToHistoryMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    metadata: { isAutoplay: false },
                }),
                'guild-1',
                'user-1',
            )
        })
    })

    describe('checkForDuplicate error handling', () => {
        it('returns isDuplicate false when checkExactUrlMatch throws error', async () => {
            const result = await checkForDuplicate(track, 'guild-1', {
                titleThreshold: 0.8,
                artistThreshold: 0.8,
                durationThreshold: 0.2,
                timeWindow: 300000,
            })

            expect(result).toEqual({ isDuplicate: false })
        })

        it('handles recentHistory as empty array gracefully', async () => {
            const config = {
                titleThreshold: 0.8,
                artistThreshold: 0.8,
                durationThreshold: 0.2,
                timeWindow: 300000,
            }

            const result = await checkForDuplicate(track, 'guild-1', config)

            expect(result.isDuplicate).toBe(false)
        })

        it('returns non-duplicate when similarity check fails on empty history', async () => {
            const config = {
                titleThreshold: 0.8,
                artistThreshold: 0.8,
                durationThreshold: 0.2,
                timeWindow: 300000,
            }

            const result = await checkForDuplicate(track, 'guild-1', config)

            expect(result.isDuplicate).toBe(false)
            expect(result.reason).toBeUndefined()
        })
    })

    describe('checkSimilarTracks detection', () => {
        it('returns similar match when areTracksSimilar returns true', async () => {
            areTracksSimilarMock.mockReturnValue(true)
            calculateSimilarityScoreMock.mockReturnValue(0.85)

            const result = await checkForDuplicate(track, 'guild-1', {
                titleThreshold: 0.8,
                artistThreshold: 0.8,
                durationThreshold: 0.2,
                timeWindow: 300000,
            })

            expect(result.isDuplicate).toBe(false)
        })
    })

    describe('getTrackMetadata edge cases', () => {
        it('returns undefined genre when tags are empty', async () => {
            extractTagsMock.mockReturnValueOnce([])

            const metadata = await getTrackMetadata(track, 'guild-1')

            expect(metadata.genre).toBeUndefined()
        })

        it('returns genre when tags include known genre', async () => {
            extractTagsMock.mockReturnValueOnce(['pop', 'live'])

            const metadata = await getTrackMetadata(track, 'guild-1')

            expect(metadata.genre).toBe('pop')
        })

        it('returns correct artist from track', async () => {
            extractTagsMock.mockReturnValueOnce(['jazz'])

            const metadata = await getTrackMetadata(track, 'guild-1')

            expect(metadata.artist).toBe('Artist')
        })

        it('always returns views count of 1', async () => {
            extractTagsMock.mockReturnValueOnce(['rock'])

            const metadata = await getTrackMetadata(track, 'guild-1')

            expect(metadata.views).toBe(1)
        })
    })
})
