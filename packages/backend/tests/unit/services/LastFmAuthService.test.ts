import {
    describe,
    test,
    expect,
    jest,
    beforeEach,
    afterEach,
} from '@jest/globals'
import {
    exchangeTokenForSession,
    isLastFmAuthConfigured,
} from '../../../src/services/LastFmAuthService'

const originalEnv = process.env

beforeEach(() => {
    process.env = {
        ...originalEnv,
        LASTFM_API_KEY: 'test-api-key',
        LASTFM_API_SECRET: 'test-secret',
    }
})

afterEach(() => {
    process.env = originalEnv
    jest.restoreAllMocks()
})

describe('isLastFmAuthConfigured', () => {
    test('should return true when both env vars are set', () => {
        expect(isLastFmAuthConfigured()).toBe(true)
    })

    test('should return false when API key is missing', () => {
        delete process.env.LASTFM_API_KEY
        expect(isLastFmAuthConfigured()).toBe(false)
    })

    test('should return false when API secret is missing', () => {
        delete process.env.LASTFM_API_SECRET
        expect(isLastFmAuthConfigured()).toBe(false)
    })
})

describe('exchangeTokenForSession', () => {
    test('should return null when config is missing', async () => {
        delete process.env.LASTFM_API_KEY
        const result = await exchangeTokenForSession('some-token')
        expect(result).toBeNull()
    })

    test('should return session on successful exchange', async () => {
        const mockResponse = {
            ok: true,
            json: () =>
                Promise.resolve({
                    session: { key: 'sk_123', name: 'testuser' },
                }),
        }
        jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response)

        const result = await exchangeTokenForSession('valid-token')

        expect(result).toEqual({
            sessionKey: 'sk_123',
            username: 'testuser',
        })
        expect(fetch).toHaveBeenCalledWith(
            'https://ws.audioscrobbler.com/2.0/',
            expect.objectContaining({ method: 'POST' }),
        )
    })

    test('should return null on non-ok response', async () => {
        jest.spyOn(global, 'fetch').mockResolvedValue({
            ok: false,
        } as Response)

        const result = await exchangeTokenForSession('bad-token')
        expect(result).toBeNull()
    })

    test('should return null on API error response', async () => {
        jest.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ error: 14 }),
        } as Response)

        const result = await exchangeTokenForSession('expired-token')
        expect(result).toBeNull()
    })

    test('should return null when session key is missing', async () => {
        jest.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ session: {} }),
        } as Response)

        const result = await exchangeTokenForSession('token')
        expect(result).toBeNull()
    })

    test('should return empty username when name is missing', async () => {
        jest.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ session: { key: 'sk_456' } }),
        } as Response)

        const result = await exchangeTokenForSession('token')
        expect(result).toEqual({
            sessionKey: 'sk_456',
            username: '',
        })
    })

    test('should return null when json parsing fails', async () => {
        jest.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: () => Promise.reject(new Error('parse error')),
        } as Response)

        const result = await exchangeTokenForSession('token')
        expect(result).toBeNull()
    })

    test('should trim token whitespace', async () => {
        jest.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve({
                    session: { key: 'sk_789', name: 'user' },
                }),
        } as Response)

        await exchangeTokenForSession('  token-with-spaces  ')

        const callBody = (fetch as jest.Mock).mock.calls[0][1].body
        expect(callBody).toContain('token=token-with-spaces')
        expect(callBody).not.toContain('token=+')
    })
})
