import { describe, expect, it } from '@jest/globals'
import { Result } from './BaseResult'

describe('Result', () => {
    describe('Result.success', () => {
        it('creates successful result with data', () => {
            const r = Result.success(42)
            expect(r.isSuccess()).toBe(true)
            expect(r.isFailure()).toBe(false)
            expect(r.getData()).toBe(42)
            expect(r.getError()).toBeUndefined()
        })

        it('creates successful result with message', () => {
            const r = Result.success(undefined, 'done')
            expect(r.getMessage()).toBe('done')
        })

        it('creates successful result with no arguments', () => {
            const r = Result.success()
            expect(r.isSuccess()).toBe(true)
            expect(r.getData()).toBeUndefined()
        })
    })

    describe('Result.failure', () => {
        it('creates failure result from an Error', () => {
            const err = new Error('something went wrong')
            const r = Result.failure(err)
            expect(r.isSuccess()).toBe(false)
            expect(r.isFailure()).toBe(true)
            expect(r.getError()).toBe(err)
            expect(r.getData()).toBeUndefined()
        })

        it('converts string to Error', () => {
            const r = Result.failure<number>('string error')
            expect(r.getError()).toBeInstanceOf(Error)
            expect(r.getError()?.message).toBe('string error')
        })

        it('attaches message to failure', () => {
            const r = Result.failure(new Error('err'), 'context')
            expect(r.getMessage()).toBe('context')
        })
    })

    describe('map', () => {
        it('transforms data on success', () => {
            const r = Result.success(5).map((n) => n * 2)
            expect(r.isSuccess()).toBe(true)
            expect(r.getData()).toBe(10)
        })

        it('preserves message through map on success', () => {
            const r = Result.success(5, 'original').map((n) => n + 1)
            expect(r.getMessage()).toBe('original')
        })

        it('returns failure without calling fn when input is failure', () => {
            const original = Result.failure<number>(new Error('err'), 'msg')
            const mapped = original.map((n) => n + 1)
            expect(mapped.isFailure()).toBe(true)
            expect(mapped.getError()).toBe(original.getError())
            expect(mapped.getMessage()).toBe('msg')
        })

        it('catches errors thrown by fn and returns failure', () => {
            const r = Result.success(5).map(() => {
                throw new Error('fn threw')
            })
            expect(r.isFailure()).toBe(true)
            expect(r.getError()?.message).toBe('fn threw')
        })
    })

    describe('flatMap', () => {
        it('transforms to a new Result on success', () => {
            const r = Result.success(5).flatMap((n) => Result.success(n * 2))
            expect(r.isSuccess()).toBe(true)
            expect(r.getData()).toBe(10)
        })

        it('allows fn to return failure', () => {
            const r = Result.success(5).flatMap(() =>
                Result.failure<number>('inner error'),
            )
            expect(r.isFailure()).toBe(true)
        })

        it('returns failure without calling fn when input is failure', () => {
            const original = Result.failure<number>(
                new Error('outer'),
                'outer msg',
            )
            const flatMapped = original.flatMap(() => Result.success(99))
            expect(flatMapped.isFailure()).toBe(true)
            expect(flatMapped.getError()).toBe(original.getError())
        })
    })
})
