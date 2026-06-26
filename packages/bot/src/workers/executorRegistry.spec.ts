import { describe, expect, it } from '@jest/globals'
import { registerExecutor, getExecutor, hasExecutor } from './executorRegistry'
import type {
    BatchJobExecutor,
    BatchJobType,
} from '@lucky/shared/services/batch'

function fakeExecutor(jobType: BatchJobType): BatchJobExecutor {
    return {
        jobType,
        estimateMinutes: () => 1,
        execute: async () => ({}),
    }
}

describe('executorRegistry', () => {
    it('returns null and hasExecutor=false for an unregistered type', () => {
        // 'purge_batch' is never registered in this file.
        expect(getExecutor('purge_batch')).toBeNull()
        expect(hasExecutor('purge_batch')).toBe(false)
    })

    it('registers and retrieves an executor by job type', () => {
        const exec = fakeExecutor('bulk_ban')
        registerExecutor(exec)
        expect(hasExecutor('bulk_ban')).toBe(true)
        expect(getExecutor('bulk_ban')).toBe(exec)
    })

    it('overwrites a previously-registered executor for the same type', () => {
        const first = fakeExecutor('bulk_kick')
        const second = fakeExecutor('bulk_kick')
        registerExecutor(first)
        registerExecutor(second)
        expect(getExecutor('bulk_kick')).toBe(second)
    })
})
