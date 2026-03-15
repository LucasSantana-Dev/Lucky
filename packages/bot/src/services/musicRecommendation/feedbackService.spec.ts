import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { RecommendationFeedbackService } from './feedbackService'

const getMock = jest.fn()
const setexMock = jest.fn()
const delMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    redisClient: {
        get: (...args: unknown[]) => getMock(...args),
        setex: (...args: unknown[]) => setexMock(...args),
        del: (...args: unknown[]) => delMock(...args),
    },
}))

describe('RecommendationFeedbackService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('uses user-scoped redis key (no guildId in key)', async () => {
        const service = new RecommendationFeedbackService(30)
        getMock.mockResolvedValue(null)
        setexMock.mockResolvedValue(true)

        const key = service.buildTrackKey('Song A', 'Artist A')
        await service.setFeedback('guild-1', 'user-1', key, 'dislike')

        expect(setexMock).toHaveBeenCalledWith(
            'music:feedback:user-1',
            expect.any(Number),
            expect.any(String),
        )
        expect(setexMock).not.toHaveBeenCalledWith(
            expect.stringContaining('guild-1'),
            expect.anything(),
            expect.anything(),
        )
    })

    it('uses 30-day TTL in seconds', async () => {
        const service = new RecommendationFeedbackService(30)
        getMock.mockResolvedValue(null)
        setexMock.mockResolvedValue(true)

        const key = service.buildTrackKey('Song A', 'Artist A')
        await service.setFeedback('guild-1', 'user-1', key, 'dislike')

        expect(setexMock).toHaveBeenCalledWith(
            expect.any(String),
            30 * 24 * 60 * 60,
            expect.any(String),
        )
    })

    it('stores dislike feedback and returns disliked keys', async () => {
        const now = 10_000
        const service = new RecommendationFeedbackService(30)
        const key = service.buildTrackKey('Song A', 'Artist A')

        getMock.mockResolvedValueOnce(null)
        setexMock.mockResolvedValueOnce(true)
        getMock.mockResolvedValueOnce(
            JSON.stringify({
                [key]: {
                    feedback: 'dislike',
                    updatedAt: now,
                    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
                },
            }),
        )

        await service.setFeedback('guild-1', 'user-1', key, 'dislike', now)
        const disliked = await service.getDislikedTrackKeys(
            'guild-1',
            'user-1',
            now + 100,
        )

        expect(disliked.has(key)).toBe(true)
        expect(setexMock).toHaveBeenCalled()
    })

    it('stores like feedback and returns liked keys', async () => {
        const now = 10_000
        const service = new RecommendationFeedbackService(30)
        const key = service.buildTrackKey('Song Like', 'Artist Like')

        getMock.mockResolvedValueOnce(null)
        setexMock.mockResolvedValueOnce(true)
        getMock.mockResolvedValueOnce(
            JSON.stringify({
                [key]: {
                    feedback: 'like',
                    updatedAt: now,
                    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
                },
            }),
        )

        await service.setFeedback('guild-1', 'user-1', key, 'like', now)
        const liked = await service.getLikedTrackKeys(
            'guild-1',
            'user-1',
            now + 100,
        )

        expect(liked.has(key)).toBe(true)
    })

    it('getFeedbackCounts returns correct liked/disliked counts', async () => {
        const now = 10_000
        const service = new RecommendationFeedbackService(30)
        const keyA = service.buildTrackKey('Song A', 'Artist A')
        const keyB = service.buildTrackKey('Song B', 'Artist B')
        const keyC = service.buildTrackKey('Song C', 'Artist C')

        getMock.mockResolvedValue(
            JSON.stringify({
                [keyA]: { feedback: 'like', updatedAt: now, expiresAt: now + 1_000_000 },
                [keyB]: { feedback: 'dislike', updatedAt: now, expiresAt: now + 1_000_000 },
                [keyC]: { feedback: 'like', updatedAt: now, expiresAt: now + 1_000_000 },
            }),
        )

        const counts = await service.getFeedbackCounts('user-1', now)

        expect(counts.liked).toBe(2)
        expect(counts.disliked).toBe(1)
    })

    it('clearFeedback deletes the user redis key', async () => {
        delMock.mockResolvedValue(1)
        const service = new RecommendationFeedbackService(30)

        await service.clearFeedback('user-1')

        expect(delMock).toHaveBeenCalledWith('music:feedback:user-1')
    })

    it('cleans expired feedback entries', async () => {
        const now = 50_000
        const service = new RecommendationFeedbackService(30)
        const key = service.buildTrackKey('Song B', 'Artist B')

        getMock.mockResolvedValue(
            JSON.stringify({
                [key]: {
                    feedback: 'dislike',
                    updatedAt: now - 10_000,
                    expiresAt: now - 1,
                },
            }),
        )
        setexMock.mockResolvedValue(true)

        const disliked = await service.getDislikedTrackKeys(
            'guild-2',
            'user-2',
            now,
        )

        expect(disliked.size).toBe(0)
        expect(setexMock).toHaveBeenCalled()
    })

    it('getDislikedTrackKeys returns empty set for undefined userId', async () => {
        const service = new RecommendationFeedbackService(30)

        const result = await service.getDislikedTrackKeys('guild-1', undefined)
        expect(result.size).toBe(0)
        expect(getMock).not.toHaveBeenCalled()
    })

    it('getLikedTrackKeys returns empty set for undefined userId', async () => {
        const service = new RecommendationFeedbackService(30)

        const result = await service.getLikedTrackKeys('guild-1', undefined)
        expect(result.size).toBe(0)
        expect(getMock).not.toHaveBeenCalled()
    })
})
