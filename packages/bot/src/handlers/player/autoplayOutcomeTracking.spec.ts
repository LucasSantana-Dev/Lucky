import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import {
    getRecentSkipCount,
    guildRecentSkipCounts,
} from './autoplayOutcomeTracking'

const recordImplicitFeedbackMock = jest.fn()

jest.mock('../../services/musicRecommendation/feedbackService', () => ({
    recommendationFeedbackService: {
        recordImplicitFeedback: (...args: unknown[]) =>
            recordImplicitFeedbackMock(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
}))

describe('autoplayOutcomeTracking', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        guildRecentSkipCounts.clear()
    })

    describe('getRecentSkipCount', () => {
        it('returns 0 for a guild with no recorded skips', () => {
            expect(getRecentSkipCount('guild-1')).toBe(0)
        })

        it('returns the recorded skip count for a guild', () => {
            guildRecentSkipCounts.set('guild-1', 3)
            expect(getRecentSkipCount('guild-1')).toBe(3)
        })
    })
})
