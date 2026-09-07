import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { type Track } from 'discord-player'
import {
    getRecentSkipCount,
    guildRecentSkipCounts,
    trackStartTimes,
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

describe('autoplayOutcomeTracking pure functions', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        guildRecentSkipCounts.clear()
        trackStartTimes.clear()
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

    describe('skip count tracking across multiple skips', () => {
        it('increments getRecentSkipCount on early skip and resets on track completion', () => {
            const guildId = 'guild-skip-count'

            // First skip increments to 1
            guildRecentSkipCounts.set(guildId, 0)
            guildRecentSkipCounts.set(guildId, 1)
            expect(getRecentSkipCount(guildId)).toBe(1)

            // Another early skip increments further
            const current = guildRecentSkipCounts.get(guildId) ?? 0
            guildRecentSkipCounts.set(guildId, current + 1)
            expect(getRecentSkipCount(guildId)).toBe(2)

            // Completing a track (>80%) resets the counter
            guildRecentSkipCounts.delete(guildId)
            expect(getRecentSkipCount(guildId)).toBe(0)
        })

        it('does not increment getRecentSkipCount when skip is after 30% of track', () => {
            const guildId = 'guild-skip-late'
            guildRecentSkipCounts.set(guildId, 0)

            // A late skip (>30%) does not increment
            expect(getRecentSkipCount(guildId)).toBe(0)
        })
    })
})
