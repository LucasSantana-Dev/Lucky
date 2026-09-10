import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { type Track } from 'discord-player'
import {
    getRecentSkipCount,
    guildRecentSkipCounts,
    trackStartTimes,
    trackPlayStartTime,
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

    describe('track start time keyed by track object identity', () => {
        it('distinguishes repeated plays of the same track by object identity', () => {
            // Simulate two overlapping plays of the same track.
            // discord-player creates a new Track object for each play instance.
            const track1 = {
                id: 'track-a',
                title: 'Song A',
            } as unknown as Track
            const track2 = {
                id: 'track-a',
                title: 'Song A',
            } as unknown as Track

            const t1 = 100
            const t2 = 200

            // Play 1 starts
            trackPlayStartTime.set(track1, t1)

            // Play 2 starts (same trackId, different object)
            trackPlayStartTime.set(track2, t2)

            // Each play should have its own start time via WeakMap keying on object identity
            expect(trackPlayStartTime.get(track1)).toBe(t1)
            expect(trackPlayStartTime.get(track2)).toBe(t2)
        })
    })
})
