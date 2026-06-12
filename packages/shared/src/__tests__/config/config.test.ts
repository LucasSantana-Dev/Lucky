import {
    describe,
    expect,
    it,
    beforeEach,
    afterEach,
    jest,
} from '@jest/globals'

const errorLogMock = jest.fn()
const debugLogMock = jest.fn()

jest.mock('../../utils/general/log', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    debugLog: (...args: unknown[]) => debugLogMock(...args),
}))

import {
    config,
    clearConfigCache,
    setEnvironmentLoaded,
    getSupportUrl,
} from '../../config/config'

describe('config.ts', () => {
    const originalEnv = process.env

    beforeEach(() => {
        jest.clearAllMocks()
        clearConfigCache()
        // Minimal fixture env, never a copy of the real one (#1262 pattern).
        process.env = { NODE_ENV: 'test' } as NodeJS.ProcessEnv
    })

    afterEach(() => {
        process.env = originalEnv
        clearConfigCache()
    })

    describe('config()', () => {
        it('returns undefined token/clientId and empty arrays when env is unset', () => {
            const result = config()

            expect(result.TOKEN).toBeUndefined()
            expect(result.CLIENT_ID).toBeUndefined()
            expect(result.COMMANDS_DISABLED).toEqual([])
            expect(result.COMMAND_CATEGORIES_DISABLED).toEqual([])
        })

        it('reads token, clientId, and comma-separated lists from env', () => {
            process.env.DISCORD_TOKEN = 'tok'
            process.env.CLIENT_ID = 'cid'
            process.env.COMMANDS_DISABLED = 'play, skip ,,stop'
            process.env.COMMAND_CATEGORIES_DISABLED = 'music'

            const result = config()

            expect(result.TOKEN).toBe('tok')
            expect(result.CLIENT_ID).toBe('cid')
            expect(result.COMMANDS_DISABLED).toEqual(['play', 'skip', 'stop'])
            expect(result.COMMAND_CATEGORIES_DISABLED).toEqual(['music'])
        })

        it('returns the cached object on subsequent calls', () => {
            const first = config()
            process.env.DISCORD_TOKEN = 'late'
            const second = config()

            expect(second).toBe(first)
            expect(second.TOKEN).toBeUndefined()
        })

        it('re-reads env after clearConfigCache()', () => {
            config()
            process.env.DISCORD_TOKEN = 'late'
            clearConfigCache()

            expect(config().TOKEN).toBe('late')
        })

        it('logs errors for missing critical vars once environment is loaded', () => {
            setEnvironmentLoaded()
            process.env.DISCORD_TOKEN = ''

            config()

            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('DISCORD_TOKEN'),
                }),
            )
            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('CLIENT_ID'),
                }),
            )
        })

        it('does not log errors when critical vars are present', () => {
            setEnvironmentLoaded()
            process.env.DISCORD_TOKEN = 'tok'
            process.env.CLIENT_ID = 'cid'

            config()

            expect(errorLogMock).not.toHaveBeenCalled()
            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('DISCORD_TOKEN=***'),
                }),
            )
        })
    })

    describe('getSupportUrl()', () => {
        it('returns the trimmed URL when set', () => {
            process.env.SUPPORT_URL = ' https://support.example '
            expect(getSupportUrl()).toBe('https://support.example')
        })

        it('returns undefined when unset', () => {
            delete process.env.SUPPORT_URL
            expect(getSupportUrl()).toBeUndefined()
        })

        it('returns undefined for whitespace-only values', () => {
            process.env.SUPPORT_URL = '   '
            expect(getSupportUrl()).toBeUndefined()
        })
    })
})
