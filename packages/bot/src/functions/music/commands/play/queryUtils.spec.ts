import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const requireVoiceChannelMock = jest.fn()
const requireDJRoleMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
const buildPlayResponseEmbedMock = jest.fn()
const createMusicControlButtonsMock = jest.fn()
const interactionReplyMock = jest.fn()
const createErrorEmbedMock = jest.fn()
const createUserFriendlyErrorMock = jest.fn()
const warnLogMock = jest.fn()
const errorLogMock = jest.fn()
const debugLogMock = jest.fn()

jest.mock('discord-player', () => ({
    QueryType: {
        AUTO: 'auto',
        AUTO_SEARCH: 'autoSearch',
        YOUTUBE_SEARCH: 'youtubeSearch',
        SOUNDCLOUD_SEARCH: 'soundcloudSearch',
        SPOTIFY_SEARCH: 'spotifySearch',
    },
}))
jest.mock('discord.js', () => ({}))
jest.mock('../../../../utils/command/commandValidations', () => ({
    requireVoiceChannel: (...args: unknown[]) =>
        requireVoiceChannelMock(...args),
    requireDJRole: (...args: unknown[]) => requireDJRoleMock(...args),
}))
jest.mock('../../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))
jest.mock('../../../../utils/music/nowPlayingEmbed', () => ({
    buildPlayResponseEmbed: (...args: unknown[]) =>
        buildPlayResponseEmbedMock(...args),
}))
jest.mock('../../../../utils/music/buttonComponents', () => ({
    createMusicControlButtons: (...args: unknown[]) =>
        createMusicControlButtonsMock(...args),
}))
jest.mock('../../../../utils/general/embeds', () => ({
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
}))
jest.mock('../../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))
jest.mock('@lucky/shared/utils/general/errorSanitizer', () => ({
    createUserFriendlyError: (...args: unknown[]) =>
        createUserFriendlyErrorMock(...args),
}))
jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    warnLog: (...args: unknown[]) => warnLogMock(...args),
}))

// Global fetch mock before any imports
const fetchMock = jest.fn() as jest.Mock

// Mock global.fetch before importing modules that use it
Object.defineProperty(global, 'fetch', {
    writable: true,
    value: fetchMock,
})

// Don't mock withTimeout - let it work with the real implementation
// which will properly await and resolve promises

import {
    normalizeSoundCloudUrl,
    isUrl,
    executePlayAtTop,
    expandSoundCloudShortUrl,
} from './queryUtils'

describe('normalizeSoundCloudUrl', () => {
    it('strips ?in= playlist context from SoundCloud track URLs', () => {
        const url =
            'https://soundcloud.com/akajuug/akajuug-inicio-remix?in=gabriel-mendesz/sets/plugzin'
        expect(normalizeSoundCloudUrl(url)).toBe(
            'https://soundcloud.com/akajuug/akajuug-inicio-remix',
        )
    })

    it('leaves SoundCloud URLs without ?in= unchanged', () => {
        const url = 'https://soundcloud.com/artist/track'
        expect(normalizeSoundCloudUrl(url)).toBe(url)
    })

    it('leaves non-SoundCloud URLs unchanged', () => {
        const url = 'https://www.youtube.com/watch?v=abc123&list=PLxxx'
        expect(normalizeSoundCloudUrl(url)).toBe(url)
    })

    it('leaves plain text queries unchanged', () => {
        const query = 'bohemian rhapsody queen'
        expect(normalizeSoundCloudUrl(query)).toBe(query)
    })

    it('handles non-URL strings gracefully', () => {
        const bad = 'not a url at all'
        expect(normalizeSoundCloudUrl(bad)).toBe(bad)
    })

    it('handles malformed soundcloud URLs (no protocol) gracefully', () => {
        // new URL('soundcloud.com/...') throws — catch block must return input
        const bad = 'soundcloud.com/artist/track-no-protocol'
        expect(normalizeSoundCloudUrl(bad)).toBe(bad)
    })

    it('preserves other SoundCloud query params while stripping ?in=', () => {
        const url =
            'https://soundcloud.com/artist/track?in=playlist&secret_token=abc'
        const result = normalizeSoundCloudUrl(url)
        expect(result).not.toContain('in=')
        expect(result).toContain('secret_token=abc')
    })
})

describe('isUrl', () => {
    it('returns true for https URLs', () => {
        expect(isUrl('https://example.com/path')).toBe(true)
    })

    it('returns true for http URLs', () => {
        expect(isUrl('http://example.com')).toBe(true)
    })

    it('returns false for plain text', () => {
        expect(isUrl('some song title')).toBe(false)
    })
})

describe('expandSoundCloudShortUrl', () => {
    beforeEach(() => {
        fetchMock.mockReset()
        debugLogMock.mockReset()
    })

    it('expands on.soundcloud.com short links to full soundcloud.com URLs', async () => {
        const shortUrl = 'https://on.soundcloud.com/abc123'
        const fullUrl = 'https://soundcloud.com/artist/track'

        fetchMock.mockResolvedValueOnce({
            url: fullUrl,
        })

        const result = await expandSoundCloudShortUrl(shortUrl)

        expect(result).toBe(fullUrl)
        expect(fetchMock).toHaveBeenCalledWith(shortUrl, {
            method: 'HEAD',
            redirect: 'follow',
        })
    })

    it('returns original URL if not a short link', async () => {
        const fullUrl = 'https://soundcloud.com/artist/track'
        const result = await expandSoundCloudShortUrl(fullUrl)
        expect(result).toBe(fullUrl)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('returns original URL if redirect goes to non-soundcloud domain', async () => {
        const shortUrl = 'https://on.soundcloud.com/abc123'
        const suspiciousUrl = 'https://attacker.com/malware'

        fetchMock.mockResolvedValueOnce({
            url: suspiciousUrl,
        })

        const result = await expandSoundCloudShortUrl(shortUrl)

        expect(result).toBe(shortUrl)
        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message:
                    'SoundCloud short URL expansion failed, using original URL',
            }),
        )
    })

    it('handles malformed on.soundcloud.com URLs gracefully', async () => {
        const malformed = 'on.soundcloud.com/abc123' // No protocol

        const result = await expandSoundCloudShortUrl(malformed)

        expect(result).toBe(malformed)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects domain-suffix bypass attempts (soundcloud.com.attacker.com)', async () => {
        const shortUrl = 'https://on.soundcloud.com/abc123'
        const bypassUrl = 'https://soundcloud.com.attacker.com/x'

        fetchMock.mockResolvedValueOnce({
            url: bypassUrl,
        })

        const result = await expandSoundCloudShortUrl(shortUrl)

        expect(result).toBe(shortUrl)
        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message:
                    'SoundCloud short URL expansion failed, using original URL',
            }),
        )
    })
})

describe('executePlayAtTop — fallback chain', () => {
    const fakeTrack = { id: 'track-1', title: 'Test Song', author: 'Artist' }
    const fakeQueue = {
        tracks: { toArray: () => [fakeTrack] },
        node: { remove: jest.fn(), skip: jest.fn() },
        insertTrack: jest.fn(),
    }

    function makeInteraction(query = 'test song') {
        return {
            guildId: 'guild-1',
            user: { id: 'user-1' },
            member: { voice: { channel: { id: 'vc-1' } } },
            options: { getString: jest.fn(() => query) },
            deferReply: jest.fn(),
            reply: jest.fn(),
        } as unknown as Parameters<typeof executePlayAtTop>[0]['interaction']
    }

    function makeClient(
        playImpl: (...args: unknown[]) => unknown,
    ): Parameters<typeof executePlayAtTop>[0]['client'] {
        return { player: { play: jest.fn(playImpl) } } as unknown as Parameters<
            typeof executePlayAtTop
        >[0]['client']
    }

    beforeEach(() => {
        jest.clearAllMocks()
        requireVoiceChannelMock.mockResolvedValue(true)
        requireDJRoleMock.mockResolvedValue(true)
        resolveGuildQueueMock.mockReturnValue({ queue: fakeQueue })
        buildPlayResponseEmbedMock.mockReturnValue({ title: 'Now Playing' })
        createMusicControlButtonsMock.mockReturnValue([])
        interactionReplyMock.mockResolvedValue(undefined)
        createUserFriendlyErrorMock.mockReturnValue('friendly error')
        createErrorEmbedMock.mockReturnValue({ title: 'error' })
    })

    it('falls back to YouTube when Spotify search throws', async () => {
        const successResult = { track: fakeTrack }
        const client = makeClient((_, __, opts: unknown) => {
            const o = opts as { searchEngine: string }
            if (o.searchEngine === 'spotifySearch') {
                return Promise.reject(new Error('Spotify unavailable'))
            }
            return Promise.resolve(successResult)
        })

        await executePlayAtTop({
            client,
            interaction: makeInteraction(),
            skipCurrent: false,
            commandName: 'playtop',
        })

        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Primary search failed, falling back to YouTube',
            }),
        )
        expect(interactionReplyMock).toHaveBeenCalled()
    })

    it('falls back to SoundCloud when both Spotify and YouTube throw', async () => {
        const successResult = { track: fakeTrack }
        const client = makeClient((_, __, opts: unknown) => {
            const o = opts as { searchEngine: string }
            if (
                o.searchEngine === 'spotifySearch' ||
                o.searchEngine === 'youtubeSearch'
            ) {
                return Promise.reject(new Error('unavailable'))
            }
            return Promise.resolve(successResult)
        })

        await executePlayAtTop({
            client,
            interaction: makeInteraction(),
            skipCurrent: false,
            commandName: 'playtop',
        })

        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'YouTube search failed, falling back to SoundCloud',
            }),
        )
        expect(interactionReplyMock).toHaveBeenCalled()
    })
})
