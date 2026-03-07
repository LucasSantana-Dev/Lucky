import { describe, test, expect, jest } from '@jest/globals'
import { asyncHandler } from '../../../src/middleware/asyncHandler'

describe('asyncHandler', () => {
    test('should call the handler function', async () => {
        const handler = jest.fn()
        const wrapped = asyncHandler(handler as any)
        const req = {} as any
        const res = {} as any
        const next = jest.fn()

        await wrapped(req, res, next)

        expect(handler).toHaveBeenCalledWith(req, res, next)
    })

    test('should forward rejected promise to next', async () => {
        const error = new Error('async failure')
        const handler = jest.fn().mockRejectedValue(error)
        const wrapped = asyncHandler(handler as any)
        const next = jest.fn()

        await wrapped({} as any, {} as any, next)

        await new Promise((r) => setTimeout(r, 0))
        expect(next).toHaveBeenCalledWith(error)
    })

    test('should forward synchronous throw to next', () => {
        const error = new Error('sync throw')
        const handler = jest.fn().mockImplementation(() => {
            throw error
        })
        const wrapped = asyncHandler(handler as any)
        const next = jest.fn()

        wrapped({} as any, {} as any, next)

        expect(next).toHaveBeenCalledWith(error)
    })

    test('should not call next on success', async () => {
        const handler = jest.fn().mockResolvedValue(undefined)
        const wrapped = asyncHandler(handler as any)
        const next = jest.fn()

        await wrapped({} as any, {} as any, next)

        await new Promise((r) => setTimeout(r, 0))
        expect(next).not.toHaveBeenCalled()
    })
})
