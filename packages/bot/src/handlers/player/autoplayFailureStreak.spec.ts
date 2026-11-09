import { describe, expect, it } from '@jest/globals'
import {
    recordAutoplayStreamFailure,
    resetAutoplayFailureStreak,
    resumeAutoplay,
    stopAutoplayAfterFailures,
} from './autoplayFailureStreak'
import {
    isReplenishSuppressed,
    setReplenishSuppressed,
} from '../../services/musicManagement/replenishSuppressionStore'

describe('resumeAutoplay', () => {
    it('starts the failure streak over and lifts the failure-stop suppression', () => {
        recordAutoplayStreamFailure('guild-r')
        recordAutoplayStreamFailure('guild-r')
        stopAutoplayAfterFailures('guild-r', 60_000)

        resumeAutoplay('guild-r')

        expect(isReplenishSuppressed('guild-r')).toBe(false)
        expect(recordAutoplayStreamFailure('guild-r')).toBe(1)
    })

    it('keeps a suppression it did not set, such as /clear', () => {
        setReplenishSuppressed('guild-c', 60_000)

        resumeAutoplay('guild-c')

        expect(isReplenishSuppressed('guild-c')).toBe(true)
    })

    it('does not lift a later suppression once playback moved on', () => {
        stopAutoplayAfterFailures('guild-p', 60_000)
        resetAutoplayFailureStreak('guild-p')
        setReplenishSuppressed('guild-p', 60_000)

        resumeAutoplay('guild-p')

        expect(isReplenishSuppressed('guild-p')).toBe(true)
    })
})
