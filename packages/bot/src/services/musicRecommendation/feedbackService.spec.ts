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

        await service.setFeedback('user-1', key, 'dislike', now)
        const disliked = await service.getDislikedTrackKeys('user-1', now + 100)

        expect(disliked.has(key)).toBe(true)
        expect(setexMock).toHaveBeenCalled()
    })

    it('stores like feedback and returns liked keys', async () => {
        const now = 10_000
        const service = new RecommendationFeedbackService(30)
        const key = service.buildTrackKey('Song C', 'Artist C')

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

        await service.setFeedback('user-1', key, 'like', now)
        const liked = await service.getLikedTrackKeys('user-1', now + 100)

        expect(liked.has(key)).toBe(true)
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

        const disliked = await service.getDislikedTrackKeys('user-2', now)

        expect(disliked.size).toBe(0)
        expect(setexMock).toHaveBeenCalled()
    })

    it('returns empty set for undefined userId', async () => {
        const service = new RecommendationFeedbackService(30)
        const disliked = await service.getDislikedTrackKeys(undefined)
        const liked = await service.getLikedTrackKeys(undefined)
        expect(disliked.size).toBe(0)
        expect(liked.size).toBe(0)
    })

    it('getFeedbackStats returns correct counts', async () => {
        const now = 10_000
        const service = new RecommendationFeedbackService(30)
        const key1 = service.buildTrackKey('Song D', 'Artist D')
        const key2 = service.buildTrackKey('Song E', 'Artist E')

        getMock.mockResolvedValueOnce(
            JSON.stringify({
                [key1]: {
                    feedback: 'like',
                    updatedAt: now - 1000,
                    expiresAt: now + 1000,
                },
                [key2]: {
                    feedback: 'dislike',
                    updatedAt: now - 500,
                    expiresAt: now + 1000,
                },
            }),
        )
        setexMock.mockResolvedValue(true)

        const stats = await service.getFeedbackStats('user-3', now)
        expect(stats.likedCount).toBe(1)
        expect(stats.dislikedCount).toBe(1)
        expect(stats.activeSince).toBe(now - 1000)
    })

    it('getFeedbackStats returns zeros for no feedback', async () => {
        const service = new RecommendationFeedbackService(30)
        getMock.mockResolvedValueOnce(null)
        const stats = await service.getFeedbackStats('user-4')
        expect(stats.likedCount).toBe(0)
        expect(stats.dislikedCount).toBe(0)
        expect(stats.activeSince).toBeNull()
    })

    it('getFeedbackStats returns null activeSince for undefined userId', async () => {
        const service = new RecommendationFeedbackService(30)
        const stats = await service.getFeedbackStats(undefined)
        expect(stats.likedCount).toBe(0)
        expect(stats.dislikedCount).toBe(0)
        expect(stats.activeSince).toBeNull()
    })

    it('clearAllFeedback calls del with correct key', async () => {
        const service = new RecommendationFeedbackService(30)
        delMock.mockResolvedValueOnce(1)
        await service.clearAllFeedback('user-5')
        expect(delMock).toHaveBeenCalledWith('music:feedback:user-5')
    })
})
