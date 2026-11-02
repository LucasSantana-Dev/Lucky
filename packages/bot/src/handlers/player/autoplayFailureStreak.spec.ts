import { describe, expect, it } from '@jest/globals'
import {
    recordAutoplayStreamFailure,
    resumeAutoplay,
} from './autoplayFailureStreak'
import {
    isReplenishSuppressed,
    setReplenishSuppressed,
} from '../../services/musicManagement/replenishSuppressionStore'

describe('resumeAutoplay', () => {
    it('starts the failure streak over and lifts the refill suppression', () => {
        recordAutoplayStreamFailure('guild-r')
        recordAutoplayStreamFailure('guild-r')
        setReplenishSuppressed('guild-r', 60_000)

        resumeAutoplay('guild-r')

        expect(isReplenishSuppressed('guild-r')).toBe(false)
        expect(recordAutoplayStreamFailure('guild-r')).toBe(1)
    })
})
