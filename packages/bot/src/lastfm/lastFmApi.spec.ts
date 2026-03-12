import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { getSessionKeyForUser, updateNowPlaying } from './lastFmApi'

const getSessionKeyMock = jest.fn()
const fetchMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    lastFmLinkService: {
        getSessionKey: (...args: unknown[]) => getSessionKeyMock(...args),
    },
}))

describe('lastFmApi', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        process.env.LASTFM_API_KEY = 'api-key'
        process.env.LASTFM_API_SECRET = 'api-secret'
        process.env.LASTFM_SESSION_KEY = 'env-session'
        ;(globalThis as { fetch: typeof fetch }).fetch =
            fetchMock as unknown as typeof fetch
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({}),
        })
    })

    afterEach(() => {
        delete process.env.LASTFM_API_KEY
        delete process.env.LASTFM_API_SECRET
        delete process.env.LASTFM_SESSION_KEY
    })

    it('uses database session key when available', async () => {
        getSessionKeyMock.mockResolvedValue('db-session')

        const sessionKey = await getSessionKeyForUser('user-1')

        expect(sessionKey).toBe('db-session')
        expect(getSessionKeyMock).toHaveBeenCalledWith('user-1')
    })

    it('falls back to LASTFM_SESSION_KEY when database has no session', async () => {
        getSessionKeyMock.mockResolvedValue(null)

        const sessionKey = await getSessionKeyForUser('user-2')

        expect(sessionKey).toBe('env-session')
    })

    it('sends signed updateNowPlaying payload', async () => {
        await updateNowPlaying('Artist Name', 'Track Name', 187, 'session-123')

        const [, request] = fetchMock.mock.calls.at(-1) as [string, { body: string }]
        expect(request.body).toContain('method=track.updateNowPlaying')
        expect(request.body).toContain('artist=Artist+Name')
        expect(request.body).toContain('track=Track+Name')
        expect(request.body).toContain('duration=187')
        expect(request.body).toContain('api_sig=')
    })
})
