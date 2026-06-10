import {
    describe,
    expect,
    it,
    beforeEach,
    afterEach,
    jest,
} from '@jest/globals'

// Mock dotenv so loadEnvironmentFiles() cannot re-populate process.env from
// the repo's real .env — without this, deleting a required var in a test is
// undone by the loader and the missing-vars branch never executes (#1262).
jest.mock('dotenv', () => ({
    config: jest.fn(() => ({ parsed: {} })),
}))

import {
    validateBackendEnvironment,
    ensureEnvironment,
} from '../../config/environment'

// These tests verify the cubic findings applied to environment.ts:
// P2 #1: isMissingVariable treats whitespace-only strings as missing
// P2 #2: ensureEnvironment calls assertions before marking loaded
// P3 #3: shared helper for assertion logic

describe('environment.ts - cubic findings verification', () => {
    const originalEnv = process.env

    beforeEach(() => {
        // Minimal fixture env, never a copy of the real one: keeps the
        // missing-vars branch deterministic regardless of ambient env, and
        // guarantees a failing assertion can only ever print fixture values,
        // not real secrets (#1262).
        process.env = { NODE_ENV: 'test' } as NodeJS.ProcessEnv
    })

    afterEach(() => {
        process.env = originalEnv
    })

    describe('P2 #1: whitespace-only env values treated as missing', () => {
        it('should reject whitespace-only REDIS_HOST in validateBackendEnvironment', () => {
            process.env.REDIS_HOST = '   '
            process.env.SPOTIFY_CLIENT_ID = 'id'
            process.env.SPOTIFY_CLIENT_SECRET = 'secret'
            process.env.WEBAPP_SESSION_SECRET = 'secret'

            expect(() => {
                validateBackendEnvironment()
            }).toThrow(
                'Missing required backend environment variables: REDIS_HOST',
            )
        })

        it('should reject tab-only REDIS_HOST', () => {
            process.env.REDIS_HOST = '\t\t'
            process.env.SPOTIFY_CLIENT_ID = 'id'
            process.env.SPOTIFY_CLIENT_SECRET = 'secret'
            process.env.WEBAPP_SESSION_SECRET = 'secret'

            expect(() => {
                validateBackendEnvironment()
            }).toThrow(/REDIS_HOST/)
        })

        it('should reject newline-only REDIS_HOST', () => {
            process.env.REDIS_HOST = '\n'
            process.env.SPOTIFY_CLIENT_ID = 'id'
            process.env.SPOTIFY_CLIENT_SECRET = 'secret'
            process.env.WEBAPP_SESSION_SECRET = 'secret'

            expect(() => {
                validateBackendEnvironment()
            }).toThrow(/REDIS_HOST/)
        })

        it('should accept non-whitespace values', () => {
            process.env.REDIS_HOST = 'localhost'
            process.env.SPOTIFY_CLIENT_ID = 'id'
            process.env.SPOTIFY_CLIENT_SECRET = 'secret'
            process.env.WEBAPP_SESSION_SECRET = 'secret'

            expect(() => {
                validateBackendEnvironment()
            }).not.toThrow()
        })

        it('should accept values with whitespace around valid content', () => {
            process.env.REDIS_HOST = '  localhost  '
            process.env.SPOTIFY_CLIENT_ID = '\tid\t'
            process.env.SPOTIFY_CLIENT_SECRET = 'secret'
            process.env.WEBAPP_SESSION_SECRET = 'secret'

            expect(() => {
                validateBackendEnvironment()
            }).not.toThrow()
        })
    })

    describe('P2 #2: assertion runs before marking environment loaded', () => {
        it('should throw when ensureEnvironment finds missing required vars', async () => {
            process.env.DISCORD_TOKEN = 'token'
            process.env.CLIENT_ID = 'id'
            delete process.env.DATABASE_URL

            await expect(ensureEnvironment()).rejects.toThrow(
                'Missing required environment variables: DATABASE_URL',
            )
        })

        it('should throw when ensureEnvironment finds whitespace-only required vars', async () => {
            process.env.DISCORD_TOKEN = '   '
            process.env.CLIENT_ID = 'id'
            process.env.DATABASE_URL = 'url'

            await expect(ensureEnvironment()).rejects.toThrow(
                'Missing required environment variables: DISCORD_TOKEN',
            )
        })

        it('should list all missing required variables in error', async () => {
            delete process.env.DISCORD_TOKEN
            delete process.env.CLIENT_ID
            delete process.env.DATABASE_URL

            const error = await ensureEnvironment().catch((e: any) => e)
            expect(error).toBeInstanceOf(Error)
            expect(error.message).toContain('DISCORD_TOKEN')
            expect(error.message).toContain('CLIENT_ID')
            expect(error.message).toContain('DATABASE_URL')
        })

        it('should not throw when all required environment variables are present', async () => {
            process.env.DISCORD_TOKEN = 'token'
            process.env.CLIENT_ID = 'id'
            process.env.DATABASE_URL = 'url'

            await expect(ensureEnvironment()).resolves.toBeDefined()
        })
    })

    describe('P3 #3: shared helper for assertion logic', () => {
        it('should use consistent error message format for required vars', async () => {
            process.env.DISCORD_TOKEN = undefined
            process.env.CLIENT_ID = 'id'
            process.env.DATABASE_URL = 'url'

            await expect(ensureEnvironment()).rejects.toThrow(
                'Missing required environment variables',
            )
        })

        it('should use consistent error message format for backend vars', () => {
            process.env.REDIS_HOST = undefined
            process.env.SPOTIFY_CLIENT_ID = 'id'
            process.env.SPOTIFY_CLIENT_SECRET = 'secret'
            process.env.WEBAPP_SESSION_SECRET = 'secret'

            expect(() => {
                validateBackendEnvironment()
            }).toThrow('Missing required backend environment variables')
        })

        it('should include variable names in both assertion types', () => {
            delete process.env.DISCORD_TOKEN
            process.env.CLIENT_ID = 'id'
            process.env.DATABASE_URL = 'url'

            delete process.env.REDIS_HOST
            process.env.SPOTIFY_CLIENT_ID = 'id'
            process.env.SPOTIFY_CLIENT_SECRET = 'secret'
            process.env.WEBAPP_SESSION_SECRET = 'secret'

            expect(() => {
                validateBackendEnvironment()
            }).toThrow('REDIS_HOST')
        })

        it('should handle multiple missing backend variables', () => {
            delete process.env.REDIS_HOST
            delete process.env.SPOTIFY_CLIENT_ID
            process.env.SPOTIFY_CLIENT_SECRET = 'secret'
            process.env.WEBAPP_SESSION_SECRET = 'secret'

            expect(() => {
                validateBackendEnvironment()
            }).toThrow(/REDIS_HOST/)
            expect(() => {
                validateBackendEnvironment()
            }).toThrow(/SPOTIFY_CLIENT_ID/)
        })
    })
})
