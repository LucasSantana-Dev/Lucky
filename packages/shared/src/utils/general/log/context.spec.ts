import { describe, it, expect } from '@jest/globals'
import { runWithLogContext, getLogContext } from './context'

describe('runWithLogContext', () => {
    it('returns undefined outside a context', () => {
        expect(getLogContext()).toBeUndefined()
    })

    it('provides context within the run callback', () => {
        runWithLogContext({ correlationId: 'abc', guildId: 'g1' }, () => {
            const ctx = getLogContext()
            expect(ctx?.correlationId).toBe('abc')
            expect(ctx?.guildId).toBe('g1')
        })
    })

    it('restores no-context after the callback completes', async () => {
        await runWithLogContext({ correlationId: 'xyz' }, async () => {
            expect(getLogContext()?.correlationId).toBe('xyz')
        })
        expect(getLogContext()).toBeUndefined()
    })

    it('propagates context through async continuations', async () => {
        const result = await runWithLogContext(
            { correlationId: 'async-id' },
            async () => {
                await Promise.resolve()
                return getLogContext()?.correlationId
            },
        )
        expect(result).toBe('async-id')
    })
})
