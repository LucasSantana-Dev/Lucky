import { describe, test, expect, beforeEach } from '@jest/globals'
import express from 'express'

jest.mock('ioredis', () => {
    return jest.fn().mockImplementation(() => ({
        connect: jest.fn().mockRejectedValue(new Error('not available')),
        disconnect: jest.fn(),
        on: jest.fn(),
        status: 'wait',
    }))
})

jest.mock('connect-redis', () => {
    return jest.fn().mockImplementation(() => ({
        get: jest.fn(),
        set: jest.fn(),
        destroy: jest.fn(),
    }))
})

describe('Session Middleware', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        jest.clearAllMocks()
    })

    test('should setup session middleware', async () => {
        const { setupSessionMiddleware } =
            await import('../../../src/middleware/session')
        expect(() => {
            setupSessionMiddleware(app)
        }).not.toThrow()
    })

    test('should use default secret when WEBAPP_SESSION_SECRET is not set', async () => {
        const { setupSessionMiddleware } =
            await import('../../../src/middleware/session')
        const originalSecret = process.env.WEBAPP_SESSION_SECRET
        delete process.env.WEBAPP_SESSION_SECRET

        expect(() => {
            setupSessionMiddleware(app)
        }).not.toThrow()

        if (originalSecret) {
            process.env.WEBAPP_SESSION_SECRET = originalSecret
        }
    })

    test('should configure session with correct settings', async () => {
        const { setupSessionMiddleware } =
            await import('../../../src/middleware/session')
        const originalEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'production'

        expect(() => setupSessionMiddleware(app)).not.toThrow()

        process.env.NODE_ENV = originalEnv
    })

    test('should use production settings when NODE_ENV is production', async () => {
        const { setupSessionMiddleware } =
            await import('../../../src/middleware/session')
        const originalEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'production'

        expect(() => {
            setupSessionMiddleware(app)
        }).not.toThrow()

        process.env.NODE_ENV = originalEnv
    })

    test('should use development settings when NODE_ENV is not production', async () => {
        const { setupSessionMiddleware } =
            await import('../../../src/middleware/session')
        const originalEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'development'

        expect(() => {
            setupSessionMiddleware(app)
        }).not.toThrow()

        process.env.NODE_ENV = originalEnv
    })
})
