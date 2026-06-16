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

    test('joins a nested error path with dots', () => {
        // A 2-segment path is the only way to tell `path.join('.')` apart
        // from `join('')`; it also pins the error-mapping callback (field +
        // message) against null-object / undefined-return mutants.
        const nested = z.object({ user: z.object({ name: z.string() }) })
        const { req, res, next } = setup({ user: {} }, 'body')
        validateBody(nested)(req, res, next)
        const body = res.json.mock.calls[0][0]
        expect(body.errors[0].field).toBe('user.name')
        expect(typeof body.errors[0].message).toBe('string')
        expect(next).not.toHaveBeenCalled()
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
        // Assert the error body, not just the status — pins the 400 JSON
        // payload (`{ error, errors }`) against empty-object / empty-string
        // mutants on the response and the error-mapping callback.
        const body = res.json.mock.calls[0][0]
        expect(body.error).toBe('Validation failed')
        expect(Array.isArray(body.errors)).toBe(true)
        expect(body.errors[0]).toHaveProperty('field')
        expect(body.errors[0]).toHaveProperty('message')
        expect(next).not.toHaveBeenCalled()
    })

    test('should assign validated query to req.query', () => {
        const { req, res, next } = setup({ limit: '10' }, 'query')
        validateQuery(schema)(req, res, next)
        expect(req.query).toEqual({ limit: '10' })
    })

    test('should strip unknown query fields', () => {
        const { req, res, next } = setup(
            { limit: '20', extra: 'ignored' },
            'query',
        )
        validateQuery(schema)(req, res, next)
        expect(next).toHaveBeenCalled()
        expect(req.query).toEqual({ limit: '20' })
    })

    test('should handle optional query fields correctly', () => {
        const { req, res, next } = setup({}, 'query')
        validateQuery(schema)(req, res, next)
        expect(next).toHaveBeenCalled()
        expect(req.query).toEqual({})
    })

    test('joins a nested error path with dots', () => {
        const nested = z.object({ page: z.object({ size: z.string() }) })
        const { req, res, next } = setup({ page: {} }, 'query')
        validateQuery(nested)(req, res, next)
        const body = res.json.mock.calls[0][0]
        expect(body.errors[0].field).toBe('page.size')
        expect(typeof body.errors[0].message).toBe('string')
        expect(next).not.toHaveBeenCalled()
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
        expect(req.params).toEqual({ guildId: '123456789012345678' })
    })

    test('joins a nested error path with dots', () => {
        const nested = z.object({ scope: z.object({ id: z.string() }) })
        const { req, res, next } = setup({ scope: {} }, 'params')
        validateParams(nested)(req, res, next)
        const body = res.json.mock.calls[0][0]
        expect(body.errors[0].field).toBe('scope.id')
        expect(typeof body.errors[0].message).toBe('string')
        expect(next).not.toHaveBeenCalled()
    })
})
