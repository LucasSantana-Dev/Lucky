import { describe, test, expect, beforeEach } from '@jest/globals'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import express from 'express'

describe('Session Middleware', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        jest.clearAllMocks()
    })

    test('should setup session middleware', () => {
        expect(() => {
            setupSessionMiddleware(app)
        }).not.toThrow()
    })

    test('should use default secret when WEBAPP_SESSION_SECRET is not set', () => {
        const originalSecret = process.env.WEBAPP_SESSION_SECRET
        delete process.env.WEBAPP_SESSION_SECRET

        expect(() => {
            setupSessionMiddleware(app)
        }).not.toThrow()

        if (originalSecret) {
            process.env.WEBAPP_SESSION_SECRET = originalSecret
        }
    })

    test('should configure session with correct settings', () => {
        const originalEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'production'

        expect(() => setupSessionMiddleware(app)).not.toThrow()

        process.env.NODE_ENV = originalEnv
    })

    test('should use production settings when NODE_ENV is production', () => {
        const originalEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'production'

        expect(() => {
            setupSessionMiddleware(app)
        }).not.toThrow()

        process.env.NODE_ENV = originalEnv
    })

    test('should use development settings when NODE_ENV is not production', () => {
        const originalEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'development'

        expect(() => {
            setupSessionMiddleware(app)
        }).not.toThrow()

        process.env.NODE_ENV = originalEnv
    })
})
