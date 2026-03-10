import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { RecommendationFeedbackService } from './feedbackService'

const getMock = jest.fn()
const setexMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    redisClient: {
        get: (...args: unknown[]) => getMock(...args),
        setex: (...args: unknown[]) => setexMock(...args),
    },
}))

describe('RecommendationFeedbackService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('stores dislike feedback and returns disliked keys', async () => {
        const now = 10_000
        const service = new RecommendationFeedbackService(24)
        const key = service.buildTrackKey('Song A', 'Artist A')

        getMock.mockResolvedValueOnce(null)
        setexMock.mockResolvedValueOnce(true)
        getMock.mockResolvedValueOnce(
            JSON.stringify({
                [key]: {
                    feedback: 'dislike',
                    updatedAt: now,
                    expiresAt: now + 24 * 60 * 60 * 1000,
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

    it('cleans expired feedback entries', async () => {
        const now = 50_000
        const service = new RecommendationFeedbackService(1)
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
})
