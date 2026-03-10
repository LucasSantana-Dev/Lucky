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

jest.mock('@lucky/shared/services', () => ({
    trackHistoryService: {
        addTrackToHistory: (...args: unknown[]) => addTrackToHistoryMock(...args),
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
    areTracksSimilar: jest.fn(() => false),
    calculateSimilarityScore: jest.fn(() => 0),
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
})
