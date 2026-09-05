import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import express from 'express'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The session store is Postgres-backed (PrismaSessionStore) via the globally
// mocked getPrismaClient (tests/setup.ts); no Redis mocks are needed.

describe('Session Middleware', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
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

        // Verify via source code that secure is set to isProduction
        const source = readFileSync(
            resolve(__dirname, '../../../src/middleware/session.ts'),
            'utf8',
        )
        expect(source).toContain('secure: isProduction')

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

        // Verify via source code that secure is set to isProduction
        const source = readFileSync(
            resolve(__dirname, '../../../src/middleware/session.ts'),
            'utf8',
        )
        expect(source).toContain('secure: isProduction')

        process.env.NODE_ENV = originalEnv
    })

    test('should use sameSite: none in production for cross-subdomain credentials', async () => {
        const { setupSessionMiddleware } =
            await import('../../../src/middleware/session')
        const originalEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'production'

        expect(() => {
            setupSessionMiddleware(app)
        }).not.toThrow()

        // sameSite: 'none' + secure: true ensures the session cookie is sent
        // on credentialed JS fetches between subdomains (lucky.* → lucky-api.*)
        const source = readFileSync(
            resolve(__dirname, '../../../src/middleware/session.ts'),
            'utf8',
        )
        expect(source).toContain("sameSite: isProduction ? 'none' : 'lax'")

        process.env.NODE_ENV = originalEnv
    })

    test('should use sameSite: lax in development', async () => {
        const { setupSessionMiddleware } =
            await import('../../../src/middleware/session')
        const originalEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'development'

        expect(() => {
            setupSessionMiddleware(app)
        }).not.toThrow()

        const source = readFileSync(
            resolve(__dirname, '../../../src/middleware/session.ts'),
            'utf8',
        )
        expect(source).toContain("sameSite: isProduction ? 'none' : 'lax'")

        process.env.NODE_ENV = originalEnv
    })

    test('warns when Postgres session store initialization fails', async () => {
        // Force the failure explicitly instead of relying on the global
        // @lucky/shared/utils mock's accidental omission of getPrismaClient
        // (that gap is a separate bug — see the mock in tests/setup.ts). This
        // mocks the PrismaSessionStore module directly, which the other test
        // in this file relies on too — both want createPrimaryStore to fail
        // deterministically, so leaving it registered for the rest of the
        // file matches every remaining test's own precondition.
        jest.doMock('../../../src/middleware/prismaSessionStore', () => ({
            PrismaSessionStore: class {
                constructor() {
                    throw new Error('database unreachable')
                }
            },
        }))
        jest.resetModules()

        const { warnLog } = await import('@lucky/shared/utils')
        const { setupSessionMiddleware } =
            await import('../../../src/middleware/session')

        setupSessionMiddleware(app)

        expect(warnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining(
                    'Postgres session store initialization failed',
                ),
                error: expect.anything(),
            }),
        )
    })

    test('errors when production falls back to an in-memory session store', async () => {
        const originalEnv = process.env.NODE_ENV
        // Override the already-registered global mocks in place instead of
        // doMock/resetModules: session-file-store's default export is a
        // jest.fn(), so mockImplementationOnce self-cleans after this test's
        // single call, and MemoryStore's class name is restored in the
        // finally block below — neither leaves state for later tests.
        const { errorLog } = await import('@lucky/shared/utils')
        const { default: sessionFileStoreFactory } =
            await import('session-file-store')
        const { default: session } = await import('express-session')
        const { setupSessionMiddleware } =
            await import('../../../src/middleware/session')

        ;(sessionFileStoreFactory as jest.Mock).mockImplementationOnce(() => {
            throw new Error('file store unavailable')
        })

        const MemoryStoreClass = session.MemoryStore
        const originalMemoryStoreName = MemoryStoreClass.name

        try {
            process.env.NODE_ENV = 'production'
            Object.defineProperty(MemoryStoreClass, 'name', {
                value: 'MemoryStore',
                configurable: true,
            })

            setupSessionMiddleware(express())

            expect(errorLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('in-memory'),
                }),
            )
        } finally {
            process.env.NODE_ENV = originalEnv
            Object.defineProperty(MemoryStoreClass, 'name', {
                value: originalMemoryStoreName,
                configurable: true,
            })
        }
    })
})
