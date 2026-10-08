import { describe, expect, it } from '@jest/globals'
import { BATCH_JOB_TYPES, isBatchJobType } from './types.js'

describe('isBatchJobType', () => {
    it('accepts every supported type', () => {
        for (const type of BATCH_JOB_TYPES) {
            expect(isBatchJobType(type)).toBe(true)
        }
    })

    it('rejects removed and unknown types', () => {
        expect(isBatchJobType('channel_move_batch')).toBe(false)
        expect(isBatchJobType('')).toBe(false)
    })
})
