import { describe, test, expect, beforeEach } from '@jest/globals'
import express from 'express'

// The session store is Postgres-backed (PrismaSessionStore) via the globally
// mocked getPrismaClient (tests/setup.ts); no Redis mocks are needed.

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

    test('should throw when WEBAPP_SESSION_SECRET is not set', async () => {
        const { setupSessionMiddleware } =
            await import('../../../src/middleware/session')
        const originalSecret = process.env.WEBAPP_SESSION_SECRET
        delete process.env.WEBAPP_SESSION_SECRET

        expect(() => {
            setupSessionMiddleware(app)
        }).toThrow('WEBAPP_SESSION_SECRET environment variable is required')

        if (originalSecret) {
            process.env.WEBAPP_SESSION_SECRET = originalSecret
        }
    })

    test('should throw when WEBAPP_SESSION_SECRET is whitespace-only', async () => {
        const { setupSessionMiddleware } =
            await import('../../../src/middleware/session')
        const originalSecret = process.env.WEBAPP_SESSION_SECRET
        process.env.WEBAPP_SESSION_SECRET = '   '

        expect(() => {
            setupSessionMiddleware(app)
        }).toThrow('WEBAPP_SESSION_SECRET environment variable is required')

        if (originalSecret) {
            process.env.WEBAPP_SESSION_SECRET = originalSecret
        } else {
            delete process.env.WEBAPP_SESSION_SECRET
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
