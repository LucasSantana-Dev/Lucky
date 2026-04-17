import { describe, test, expect, jest } from '@jest/globals'
import { z } from 'zod'
import {
    validateBody,
    validateQuery,
    validateParams,
} from '../../../src/middleware/validate'

function setup(
    data: Record<string, unknown>,
    target: 'body' | 'query' | 'params',
) {
    const req = { body: {}, query: {}, params: {}, [target]: data } as any
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
    } as any
    const next = jest.fn()
    return { req, res, next }
}

describe('validateBody', () => {
    const schema = z.object({ name: z.string().min(1) })

    test('should call next on valid body', () => {
        const { req, res, next } = setup({ name: 'test' }, 'body')
        validateBody(schema)(req, res, next)
        expect(next).toHaveBeenCalled()
        expect(req.body).toEqual({ name: 'test' })
    })

    test('should return 400 on invalid body', () => {
        const { req, res, next } = setup({ name: '' }, 'body')
        validateBody(schema)(req, res, next)
        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'Validation failed' }),
        )
        expect(next).not.toHaveBeenCalled()
    })

    test('should strip unknown fields', () => {
        const { req, res, next } = setup({ name: 'ok', extra: true }, 'body')
        validateBody(schema)(req, res, next)
        expect(next).toHaveBeenCalled()
        expect(req.body).toEqual({ name: 'ok' })
    })
})

describe('validateQuery', () => {
    const schema = z.object({
        limit: z.string().regex(/^\d+$/).optional(),
    })

    test('should call next on valid query', () => {
        const { req, res, next } = setup({ limit: '10' }, 'query')
        validateQuery(schema)(req, res, next)
        expect(next).toHaveBeenCalled()
    })

    test('should return 400 on invalid query', () => {
        const { req, res, next } = setup({ limit: 'abc' }, 'query')
        validateQuery(schema)(req, res, next)
        expect(res.status).toHaveBeenCalledWith(400)
        expect(next).not.toHaveBeenCalled()
    })

    test('should assign validated query to req.query', () => {
        const { req, res, next } = setup({ limit: '10' }, 'query')
        validateQuery(schema)(req, res, next)
        expect(req.query).toEqual({ limit: '10' })
    })

    test('should strip unknown query fields', () => {
        const { req, res, next } = setup({ limit: '20', extra: 'ignored' }, 'query')
        validateQuery(schema)(req, res, next)
        expect(next).toHaveBeenCalled()
        expect(req.query).toEqual({ limit: '20', extra: 'ignored' })
    })

    test('should handle optional query fields correctly', () => {
        const { req, res, next } = setup({}, 'query')
        validateQuery(schema)(req, res, next)
        expect(next).toHaveBeenCalled()
        expect(req.query).toEqual({})
    })
})

describe('validateParams', () => {
    const schema = z.object({
        guildId: z.string().regex(/^\d{17,20}$/),
    })

    test('should call next on valid params', () => {
        const { req, res, next } = setup(
            { guildId: '123456789012345678' },
            'params',
        )
        validateParams(schema)(req, res, next)
        expect(next).toHaveBeenCalled()
    })

    test('should return 400 on invalid params', () => {
        const { req, res, next } = setup({ guildId: 'bad' }, 'params')
        validateParams(schema)(req, res, next)
        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                error: 'Validation failed',
                errors: expect.any(Array),
            }),
        )
        expect(next).not.toHaveBeenCalled()
    })

    test('should include field path in error details', () => {
        const { req, res, next } = setup({}, 'params')
        validateParams(schema)(req, res, next)
        const response = res.json.mock.calls[0][0]
        expect(response.errors[0]).toHaveProperty('field')
        expect(response.errors[0]).toHaveProperty('message')
    })

    test('should assign validated params to req.params', () => {
        const { req, res, next } = setup(
            { guildId: '123456789012345678' },
            'params',
        )
        validateParams(schema)(req, res, next)
        expect(req.params).toEqual({ guildId: '123456789012345678' })
    })

    test('should strip unknown params fields', () => {
        const { req, res, next } = setup(
            { guildId: '123456789012345678', extra: 'ignored' },
            'params',
        )
        validateParams(schema)(req, res, next)
        expect(next).toHaveBeenCalled()
        expect(req.params).toEqual({ guildId: '123456789012345678', extra: 'ignored' })
    })
})
