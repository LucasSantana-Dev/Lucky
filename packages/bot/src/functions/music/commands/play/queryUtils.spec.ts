const requireVoiceChannelMock = jest.fn()
const requireDJRoleMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
const buildPlayResponseEmbedMock = jest.fn()
const createMusicControlButtonsMock = jest.fn()
const createMusicActionButtonsMock = jest.fn()
const interactionReplyMock = jest.fn()
const createErrorEmbedMock = jest.fn()
const createWarningEmbedMock = jest.fn()
const createUserFriendlyErrorMock = jest.fn()
const warnLogMock = jest.fn()
const errorLogMock = jest.fn()
const debugLogMock = jest.fn()
const translatorForInteractionMock = jest.fn()

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
jest.mock('../../../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))
jest.mock('../../../../utils/music/nowPlayingEmbed', () => ({
    buildPlayResponseEmbed: (...args: unknown[]) =>
        buildPlayResponseEmbedMock(...args),
}))
jest.mock('../../../../utils/music/buttonComponents', () => ({
    createMusicControlButtons: (...args: unknown[]) =>
        createMusicControlButtonsMock(...args),
    createMusicActionButtons: (...args: unknown[]) =>
        createMusicActionButtonsMock(...args),
}))
jest.mock('../../../../utils/general/embeds', () => ({
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
    createWarningEmbed: (...args: unknown[]) => createWarningEmbedMock(...args),
}))
jest.mock('../../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))
jest.mock('../../../../i18n/translatorForInteraction', () => ({
    translatorForInteraction: (...args: unknown[]) =>
        translatorForInteractionMock(...args),
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

function redirectTo(location: string) {
    return {
        status: 301,
        headers: {
            get: (name: string) => (name === 'location' ? location : null),
        },
    }
}

// Don't mock withTimeout - let it work with the real implementation
// which will properly await and resolve promises

import {
    normalizeYouTubeUrl,
    normalizeSoundCloudUrl,
    isUrl,
    isHost,
    isYouTubeUrl,
    executePlayAtTop,
    expandSoundCloudShortUrl,
    expandSpotifyShortUrl,
    prepareQuery,
    resolveSearchEngine,
    moveTrackToTop,
    playWithFallbacks,
} from './queryUtils'
import { collaborativePlaylistService } from '../../../../services/musicRecommendation/collaborativePlaylist'

describe('host matching', () => {
    it('leaves a foreign URL that merely mentions youtube alone', () => {
        // The old guard tested the raw string, so any link carrying
        // "youtube.com" anywhere had its list/start_radio params stripped.
        const url =
            'https://example.com/watch?ref=youtube.com&list=RD123&start_radio=1'
        expect(normalizeYouTubeUrl(url)).toBe(url)
    })

    it('leaves a lookalike host alone', () => {
        const url = 'https://notyoutube.com/watch?v=abc&list=RDabc'
        expect(normalizeYouTubeUrl(url)).toBe(url)
    })

    it('leaves a foreign URL that merely mentions soundcloud alone', () => {
        const url =
            'https://example.com/track?from=soundcloud.com&in=sets%2Fmix'
        expect(normalizeSoundCloudUrl(url)).toBe(url)
    })

    it('still strips a mix on a fully qualified host with a trailing dot', () => {
        const result = normalizeYouTubeUrl(
            'https://www.youtube.com./watch?v=abc&list=RDabc&start_radio=1',
        )
        expect(result).toBe('https://www.youtube.com./watch?v=abc')
    })

    it('still strips a mix on a real youtube subdomain', () => {
        const result = normalizeYouTubeUrl(
            'https://music.youtube.com/watch?v=abc&list=RDabc&start_radio=1',
        )
        expect(result).toBe('https://music.youtube.com/watch?v=abc')
    })

    it('still strips playlist context on a real soundcloud host', () => {
        const result = normalizeSoundCloudUrl(
            'https://m.soundcloud.com/artist/track?in=artist%2Fsets%2Fmix',
        )
        expect(result).toBe('https://m.soundcloud.com/artist/track')
    })
})

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

describe('isHost', () => {
    it('rejects a lookalike host with the real domain as a suffix', () => {
        expect(
            isHost('https://evil-youtube.com.attacker.tld/x', 'youtube.com'),
        ).toBe(false)
    })

    it('accepts a real youtube subdomain', () => {
        expect(
            isHost('https://music.youtube.com/watch?v=1', 'youtube.com'),
        ).toBe(true)
    })

    it('returns false for non-URL strings', () => {
        expect(isHost('not a url', 'youtube.com')).toBe(false)
    })
})

describe('isYouTubeUrl', () => {
    it('recognizes youtube.com and youtu.be links', () => {
        expect(isYouTubeUrl('https://www.youtube.com/watch?v=abc')).toBe(true)
        expect(isYouTubeUrl('https://youtu.be/abc')).toBe(true)
    })

    it('rejects non-YouTube URLs and plain text', () => {
        expect(isYouTubeUrl('https://open.spotify.com/track/abc')).toBe(false)
        expect(isYouTubeUrl('some song name')).toBe(false)
        expect(isYouTubeUrl('https://evil-youtube.com.attacker.tld/x')).toBe(
            false,
        )
    })
})

describe('expandSoundCloudShortUrl', () => {
    beforeEach(() => {
        fetchMock.mockReset()
        debugLogMock.mockReset()
        warnLogMock.mockReset()
    })

    it('logs an expansion failure at warn, not debug', async () => {
        // debug is filtered out in production, so this failure used to leave
        // no trace: the user saw a generic "No results found" from the
        // resolver with nothing indicating expansion was the failing step
        // (#1994).
        fetchMock.mockRejectedValueOnce(new Error('network down'))

        const shortUrl = 'https://on.soundcloud.com/abc123'
        const result = await expandSoundCloudShortUrl(shortUrl)

        expect(result).toBe(shortUrl)
        expect(debugLogMock).not.toHaveBeenCalled()
        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining(
                    'SoundCloud short URL expansion failed',
                ),
                data: expect.objectContaining({ originalUrl: shortUrl }),
            }),
        )
    })

    it('expands on.soundcloud.com short links to full soundcloud.com URLs', async () => {
        const shortUrl = 'https://on.soundcloud.com/abc123'
        const fullUrl = 'https://soundcloud.com/artist/track'

        fetchMock.mockResolvedValueOnce(redirectTo(fullUrl))

        const result = await expandSoundCloudShortUrl(shortUrl)

        expect(result).toBe(fullUrl)
        expect(fetchMock).toHaveBeenCalledWith(shortUrl, {
            method: 'HEAD',
            redirect: 'manual',
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

        fetchMock.mockResolvedValueOnce(redirectTo(suspiciousUrl))

        const result = await expandSoundCloudShortUrl(shortUrl)

        expect(result).toBe(shortUrl)
        expect(warnLogMock).toHaveBeenCalledWith(
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

        fetchMock.mockResolvedValueOnce(redirectTo(bypassUrl))

        const result = await expandSoundCloudShortUrl(shortUrl)

        expect(result).toBe(shortUrl)
        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message:
                    'SoundCloud short URL expansion failed, using original URL',
            }),
        )
    })
})

describe('expandSpotifyShortUrl (#3274)', () => {
    beforeEach(() => {
        fetchMock.mockReset()
        warnLogMock.mockReset()
    })

    it.each(['https://spotify.link/AbC123', 'https://spotify.app.link/AbC123'])(
        'follows the redirect of %s to open.spotify.com',
        async (shortUrl) => {
            fetchMock.mockResolvedValueOnce(
                redirectTo(
                    'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x',
                ),
            )

            await expect(expandSpotifyShortUrl(shortUrl)).resolves.toBe(
                'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x',
            )
            expect(fetchMock).toHaveBeenCalledWith(
                shortUrl,
                expect.objectContaining({ redirect: 'manual' }),
            )
        },
    )

    it('reads the open.spotify.com link from the page when there is no redirect', async () => {
        fetchMock.mockResolvedValueOnce({
            status: 200,
            headers: { get: () => null },
            text: async () =>
                '<html><meta property="og:url" content="https://open.spotify.com/artist/0oSGxfWSnnOXhD2fKuz2Gy?si=a&amp;b=c"></html>',
        })

        await expect(
            expandSpotifyShortUrl('https://spotify.link/AbC123'),
        ).resolves.toBe(
            'https://open.spotify.com/artist/0oSGxfWSnnOXhD2fKuz2Gy?si=a&b=c',
        )
    })

    it('keeps the short link when the redirect leaves Spotify', async () => {
        fetchMock.mockResolvedValueOnce(
            redirectTo('https://open.spotify.com.attacker.example/track/1'),
        )

        await expect(
            expandSpotifyShortUrl('https://spotify.link/AbC123'),
        ).resolves.toBe('https://spotify.link/AbC123')
        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining(
                    'Spotify short URL expansion failed',
                ),
            }),
        )
    })

    it('never requests a redirect hop outside the short and target hosts', async () => {
        fetchMock.mockResolvedValueOnce(
            redirectTo('http://169.254.169.254/latest/meta-data'),
        )

        await expect(
            expandSpotifyShortUrl('https://spotify.link/AbC123'),
        ).resolves.toBe('https://spotify.link/AbC123')
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('follows a hop between Spotify short hosts', async () => {
        fetchMock
            .mockResolvedValueOnce(
                redirectTo('https://spotify.app.link/AbC123'),
            )
            .mockResolvedValueOnce(
                redirectTo('https://open.spotify.com/track/1?si=x'),
            )

        await expect(
            expandSpotifyShortUrl('https://spotify.link/AbC123'),
        ).resolves.toBe('https://open.spotify.com/track/1?si=x')
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('leaves other links alone without a request', async () => {
        await expect(
            expandSpotifyShortUrl('https://open.spotify.com/track/1'),
        ).resolves.toBe('https://open.spotify.com/track/1')
        await expect(
            expandSpotifyShortUrl('https://evil.example/spotify.link/x'),
        ).resolves.toBe('https://evil.example/spotify.link/x')
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('is part of the shared prepare step', async () => {
        fetchMock.mockResolvedValueOnce(
            redirectTo('https://open.spotify.com/album/1A2GTWGtFfWp7KSQTwWOyo'),
        )

        await expect(
            prepareQuery('https://spotify.link/AbC123', null),
        ).resolves.toBe('https://open.spotify.com/album/1A2GTWGtFfWp7KSQTwWOyo')
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
        createMusicActionButtonsMock.mockReturnValue([])
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

    it('blocks the attachment extractor on the YouTube fallback arm (#3226)', async () => {
        const play = jest.fn((_: unknown, __: unknown, opts: unknown) => {
            const o = opts as { searchEngine: string }
            return o.searchEngine === 'spotifySearch'
                ? Promise.reject(new Error('Spotify unavailable'))
                : Promise.resolve({ track: fakeTrack })
        })
        const client = {
            player: { play },
        } as unknown as Parameters<typeof executePlayAtTop>[0]['client']

        await executePlayAtTop({
            client,
            interaction: makeInteraction(),
            skipCurrent: false,
            commandName: 'playtop',
        })

        const youtubeCall = play.mock.calls.find(
            ([, , o]) =>
                (o as { searchEngine: string }).searchEngine ===
                'youtubeSearch',
        )
        const blocked = (youtubeCall?.[2] as { blockExtractors: string[] })
            .blockExtractors
        expect(blocked).toEqual(
            expect.arrayContaining([
                'com.discord-player.attachmentextractor',
                'com.discord-player.itsmaat.spotifyextractor',
            ]),
        )
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

    it('refuses an ASMR result from the YouTube fallback without trying SoundCloud', async () => {
        translatorForInteractionMock.mockResolvedValue(
            (key: string) => `t:${key}`,
        )
        const client = makeClient(async (_, __, opts: unknown) => {
            const o = opts as {
                searchEngine: string
                afterSearch: (r: unknown) => Promise<unknown>
            }
            if (o.searchEngine === 'spotifySearch') {
                throw new Error('Spotify unavailable')
            }
            await o.afterSearch({
                tracks: [
                    {
                        title: 'ASMR good boy',
                        author: 'x',
                        metadata: null,
                        setMetadata: jest.fn(),
                    },
                ],
                hasPlaylist: () => false,
                setTracks: jest.fn(),
            })
            return { track: fakeTrack }
        })

        await executePlayAtTop({
            client,
            interaction: makeInteraction(),
            skipCurrent: false,
            commandName: 'playtop',
        })

        const engines = (client.player.play as jest.Mock).mock.calls.map(
            (call) => (call[2] as { searchEngine: string }).searchEngine,
        )
        expect(engines).toEqual(['spotifySearch', 'youtubeSearch'])
        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Play Error',
            't:music.errors.asmrBlocked',
        )
    })

    describe('collaborative limit (#3269)', () => {
        afterEach(() => collaborativePlaylistService.clearGuildState('guild-1'))

        it('refuses the request when the user already used their requests', async () => {
            collaborativePlaylistService.setMode('guild-1', true, 1)
            collaborativePlaylistService.recordContribution(
                'guild-1',
                'user-1',
                1,
            )
            const client = makeClient(() =>
                Promise.resolve({ track: fakeTrack }),
            )

            await executePlayAtTop({
                client,
                interaction: makeInteraction(),
                skipCurrent: true,
                commandName: 'playskip',
            })

            expect(client.player.play).not.toHaveBeenCalled()
            expect(createErrorEmbedMock).toHaveBeenCalledWith(
                'Contribution limit reached',
                expect.stringContaining('1'),
            )
        })

        it('lets only one of two racing requests through a limit of one', async () => {
            collaborativePlaylistService.setMode('guild-1', true, 1)
            const client = makeClient(() =>
                Promise.resolve({ track: fakeTrack }),
            )

            await Promise.all([
                executePlayAtTop({
                    client,
                    interaction: makeInteraction(),
                    skipCurrent: false,
                    commandName: 'playtop',
                }),
                executePlayAtTop({
                    client,
                    interaction: makeInteraction(),
                    skipCurrent: false,
                    commandName: 'playtop',
                }),
            ])

            expect(client.player.play).toHaveBeenCalledTimes(1)
            expect(
                collaborativePlaylistService.getState('guild-1').contributions,
            ).toEqual({ 'user-1': 1 })
        })

        it('gives the request back when nothing was queued', async () => {
            collaborativePlaylistService.setMode('guild-1', true, 1)
            const client = makeClient(() =>
                Promise.reject(new Error('nothing found')),
            )

            await executePlayAtTop({
                client,
                interaction: makeInteraction(),
                skipCurrent: false,
                commandName: 'playtop',
            })

            expect(
                collaborativePlaylistService.getState('guild-1').contributions,
            ).toEqual({})
        })

        it('checks the limit before preparing the query', async () => {
            collaborativePlaylistService.setMode('guild-1', true, 1)
            collaborativePlaylistService.recordContribution(
                'guild-1',
                'user-1',
                1,
            )
            fetchMock.mockReset()

            await executePlayAtTop({
                client: makeClient(() => Promise.resolve({ track: fakeTrack })),
                interaction: makeInteraction('https://on.soundcloud.com/abc'),
                skipCurrent: false,
                commandName: 'playtop',
            })

            expect(fetchMock).not.toHaveBeenCalled()
        })

        it('records the request once it is queued', async () => {
            collaborativePlaylistService.setMode('guild-1', true, 3)
            const client = makeClient(() =>
                Promise.resolve({ track: fakeTrack }),
            )

            await executePlayAtTop({
                client,
                interaction: makeInteraction(),
                skipCurrent: false,
                commandName: 'playtop',
            })

            expect(
                collaborativePlaylistService.getState('guild-1').contributions,
            ).toEqual({ 'user-1': 1 })
        })
    })

    describe('link normalisation shared with /play (#3270)', () => {
        function playedQuery(client: { player: { play: unknown } }): string {
            return (client.player.play as jest.Mock).mock.calls[0][1] as string
        }

        it('strips YouTube Mix context before searching', async () => {
            const client = makeClient(() =>
                Promise.resolve({ track: fakeTrack }),
            )

            await executePlayAtTop({
                client,
                interaction: makeInteraction(
                    'https://www.youtube.com/watch?v=abc123&list=RDabc123&start_radio=1',
                ),
                skipCurrent: false,
                commandName: 'playtop',
            })

            expect(playedQuery(client)).toBe(
                'https://www.youtube.com/watch?v=abc123',
            )
        })

        it('normalises a link pasted with surrounding spaces', async () => {
            const client = makeClient(() =>
                Promise.resolve({ track: fakeTrack }),
            )

            await executePlayAtTop({
                client,
                interaction: makeInteraction(
                    '  https://www.youtube.com/watch?v=abc123&list=RDabc123 ',
                ),
                skipCurrent: false,
                commandName: 'playtop',
            })

            expect(playedQuery(client)).toBe(
                'https://www.youtube.com/watch?v=abc123',
            )
        })

        it('expands a SoundCloud short link and drops ?in=', async () => {
            fetchMock.mockResolvedValueOnce(
                redirectTo(
                    'https://soundcloud.com/artist/track?in=artist/sets/x',
                ),
            )
            const client = makeClient(() =>
                Promise.resolve({ track: fakeTrack }),
            )

            await executePlayAtTop({
                client,
                interaction: makeInteraction('https://on.soundcloud.com/abc'),
                skipCurrent: true,
                commandName: 'playskip',
            })

            expect(playedQuery(client)).toBe(
                'https://soundcloud.com/artist/track',
            )
        })
    })

    describe('HOSTED_YOUTUBE_ENABLED = false (#2475)', () => {
        const originalEnv = process.env.HOSTED_YOUTUBE_ENABLED

        beforeEach(() => {
            process.env.HOSTED_YOUTUBE_ENABLED = 'false'
            translatorForInteractionMock.mockResolvedValue((key: string) => key)
            createWarningEmbedMock.mockReturnValue({ title: 'warning' })
        })

        afterEach(() => {
            if (originalEnv === undefined) {
                delete process.env.HOSTED_YOUTUBE_ENABLED
            } else {
                process.env.HOSTED_YOUTUBE_ENABLED = originalEnv
            }
        })

        it('skips the YouTube fallback arm and goes straight to SoundCloud', async () => {
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

            expect(warnLogMock).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Primary search failed, falling back to YouTube',
                }),
            )
            const playCalls = (client.player.play as jest.Mock).mock.calls.map(
                (call) => (call[2] as { searchEngine: string }).searchEngine,
            )
            expect(playCalls).not.toContain('youtubeSearch')
            expect(playCalls).toEqual(['spotifySearch', 'soundcloudSearch'])
            expect(interactionReplyMock).toHaveBeenCalled()
        })

        it('replies with a friendly notice for a pasted YouTube URL instead of searching', async () => {
            const client = makeClient(() =>
                Promise.reject(new Error('should not be called')),
            )

            await executePlayAtTop({
                client,
                interaction: makeInteraction(
                    'https://www.youtube.com/watch?v=abc123',
                ),
                skipCurrent: false,
                commandName: 'playtop',
            })

            expect(client.player.play).not.toHaveBeenCalled()
            expect(createWarningEmbedMock).toHaveBeenCalled()
            expect(interactionReplyMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({ ephemeral: true }),
                }),
            )
        })
    })
})

describe('executePlayAtTop: playlist analytics flag (#2811)', () => {
    function makeTrack(id: string, metadata?: Record<string, unknown>) {
        const track = {
            id,
            title: `Song ${id}`,
            author: 'Artist',
            metadata,
            setMetadata: jest.fn((next: Record<string, unknown>) => {
                track.metadata = next
            }),
        }
        return track
    }

    function run(result: unknown) {
        const queue = {
            tracks: { toArray: () => [] },
            node: { remove: jest.fn(), skip: jest.fn() },
            insertTrack: jest.fn(),
        }
        resolveGuildQueueMock.mockReturnValue({ queue })
        return executePlayAtTop({
            client: {
                player: { play: jest.fn(() => Promise.resolve(result)) },
            } as unknown as Parameters<typeof executePlayAtTop>[0]['client'],
            interaction: {
                guildId: 'guild-1',
                user: { id: 'user-1' },
                member: { voice: { channel: { id: 'vc-1' } } },
                options: {
                    getString: jest.fn(
                        () => 'https://open.spotify.com/playlist/abc',
                    ),
                },
                deferReply: jest.fn(),
                reply: jest.fn(),
            } as unknown as Parameters<
                typeof executePlayAtTop
            >[0]['interaction'],
            skipCurrent: false,
            commandName: 'playtop',
        })
    }

    beforeEach(() => {
        jest.clearAllMocks()
        requireVoiceChannelMock.mockResolvedValue(true)
        requireDJRoleMock.mockResolvedValue(true)
        interactionReplyMock.mockResolvedValue(undefined)
    })

    it('stamps isPlaylist on every track of a playlist result, keeping other metadata', async () => {
        const first = makeTrack('1', { requestedById: 'user-1' })
        const second = makeTrack('2')

        await run({
            track: first,
            searchResult: { playlist: { id: 'pl' }, tracks: [first, second] },
        })

        expect(first.metadata).toEqual({
            requestedById: 'user-1',
            isPlaylist: true,
        })
        expect(second.metadata).toEqual({ isPlaylist: true })
    })

    it('leaves a single-track result unstamped', async () => {
        const only = makeTrack('1')

        await run({
            track: only,
            searchResult: { playlist: null, tracks: [only] },
        })

        expect(only.setMetadata).not.toHaveBeenCalled()
    })
})

describe('normalizeYouTubeUrl', () => {
    it('strips the Mix context that broke the production request', () => {
        // The exact URL from the 2026-08-26 16:09:07 NoResultError.
        expect(
            normalizeYouTubeUrl(
                'https://www.youtube.com/watch?v=Gx9xqXlU9gE&list=RDGx9xqXlU9gE&start_radio=1',
            ),
        ).toBe('https://www.youtube.com/watch?v=Gx9xqXlU9gE')
    })

    it('strips index alongside the mix, since it indexes a list that is gone', () => {
        expect(
            normalizeYouTubeUrl(
                'https://www.youtube.com/watch?v=abc123&list=RDMMabc123&index=4&start_radio=1',
            ),
        ).toBe('https://www.youtube.com/watch?v=abc123')
    })

    it('keeps a real playlist, which the user probably meant to queue', () => {
        const url =
            'https://www.youtube.com/watch?v=abc123&list=PLrAbCdEfGh&index=2'
        expect(normalizeYouTubeUrl(url)).toBe(url)
    })

    it.each([['UUabc'], ['OLabc'], ['PLabc']])(
        'keeps non-radio list id %s',
        (list) => {
            const url = `https://www.youtube.com/watch?v=x&list=${list}`
            expect(normalizeYouTubeUrl(url)).toBe(url)
        },
    )

    it('handles youtu.be short links', () => {
        expect(
            normalizeYouTubeUrl('https://youtu.be/abc123?list=RDabc123'),
        ).toBe('https://youtu.be/abc123')
    })

    it('leaves a plain watch URL untouched', () => {
        const url = 'https://www.youtube.com/watch?v=abc123'
        expect(normalizeYouTubeUrl(url)).toBe(url)
    })

    it('leaves non-YouTube URLs alone', () => {
        const url = 'https://soundcloud.com/artist/track?in=user/sets/playlist'
        expect(normalizeYouTubeUrl(url)).toBe(url)
    })

    it('returns malformed input unchanged rather than throwing', () => {
        expect(() => normalizeYouTubeUrl('youtube.com not a url')).not.toThrow()
        expect(normalizeYouTubeUrl('youtube.com not a url')).toBe(
            'youtube.com not a url',
        )
    })

    it('is case-insensitive on the RD prefix', () => {
        expect(
            normalizeYouTubeUrl('https://www.youtube.com/watch?v=x&list=rdXYZ'),
        ).toBe('https://www.youtube.com/watch?v=x')
    })
})

describe('normalization logging behavior', () => {
    beforeEach(() => {
        warnLogMock.mockReset()
    })

    describe('normalizeSoundCloudUrl', () => {
        it('produces no warnLog for plain text queries', () => {
            normalizeSoundCloudUrl('bohemian rhapsody queen')
            expect(warnLogMock).not.toHaveBeenCalled()
        })

        it('produces no warnLog for non-URL strings', () => {
            normalizeSoundCloudUrl('not a url at all')
            expect(warnLogMock).not.toHaveBeenCalled()
        })

        it('still warns for malformed http URLs', () => {
            // soundcloud.com/... without protocol looks like a URL (could be
            // user pasting), so attempting to parse it should warn when it fails
            normalizeSoundCloudUrl('http://invalid[url')
            expect(warnLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message:
                        'SoundCloud URL normalization failed, using original URL',
                }),
            )
        })
    })

    describe('normalizeYouTubeUrl', () => {
        it('produces no warnLog for plain text queries', () => {
            normalizeYouTubeUrl('never gonna give you up')
            expect(warnLogMock).not.toHaveBeenCalled()
        })

        it('produces no warnLog for non-URL strings', () => {
            normalizeYouTubeUrl('youtube not a url here')
            expect(warnLogMock).not.toHaveBeenCalled()
        })

        it('still warns for malformed http URLs', () => {
            normalizeYouTubeUrl('https://[invalid-url')
            expect(warnLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message:
                        'YouTube URL normalization failed, using original URL',
                }),
            )
        })
    })
})

describe('uppercase scheme', () => {
    it('isUrl accepts an uppercase scheme', () => {
        expect(isUrl('HTTPS://SOUNDCLOUD.COM/artist/track')).toBe(true)
    })

    it('normalizeSoundCloudUrl still strips playlist context', () => {
        expect(
            normalizeSoundCloudUrl(
                'HTTPS://SOUNDCLOUD.COM/artist/track?in=artist/sets/mix',
            ),
        ).not.toContain('in=')
    })
})

describe('resolveSearchEngine', () => {
    it('treats a link with surrounding spaces as a link', () => {
        expect(resolveSearchEngine('  https://youtu.be/dQw4w9WgXcQ ')).toBe(
            'auto',
        )
    })

    it('searches plain text on Spotify by default', () => {
        expect(resolveSearchEngine('some song')).toBe('spotifySearch')
    })
})

describe('moveTrackToTop', () => {
    function makeQueue(trackCount: number) {
        return {
            tracks: { toArray: () => new Array(trackCount).fill({}) },
            node: { remove: jest.fn(), skip: jest.fn() },
            insertTrack: jest.fn(),
        }
    }
    const track = { id: 't1' }

    it('leaves an empty queue alone', () => {
        const queue = makeQueue(0)
        moveTrackToTop(queue as never, track as never, true)
        expect(queue.node.remove).not.toHaveBeenCalled()
        expect(queue.insertTrack).not.toHaveBeenCalled()
        expect(queue.node.skip).not.toHaveBeenCalled()
    })

    it('moves the track to the head without skipping', () => {
        const queue = makeQueue(2)
        moveTrackToTop(queue as never, track as never, false)
        expect(queue.node.remove).toHaveBeenCalledWith(track)
        expect(queue.insertTrack).toHaveBeenCalledWith(track, 0)
        expect(queue.node.skip).not.toHaveBeenCalled()
    })

    it('skips the current track when asked', () => {
        const queue = makeQueue(1)
        moveTrackToTop(queue as never, track as never, true)
        expect(queue.node.remove).toHaveBeenCalledWith(track)
        expect(queue.insertTrack).toHaveBeenCalledWith(track, 0)
        expect(queue.node.skip).toHaveBeenCalledTimes(1)
    })
})

describe('playWithFallbacks', () => {
    it('rethrows the primary error for AUTO without any fallback', async () => {
        const boom = new Error('no result')
        const play = jest.fn().mockRejectedValue(boom)
        await expect(
            playWithFallbacks({
                client: { player: { play } } as never,
                voiceChannel: {} as never,
                query: 'q',
                searchEngine: 'auto' as never,
                afterSearch: jest.fn(),
            }),
        ).rejects.toBe(boom)
        expect(play).toHaveBeenCalledTimes(1)
    })
})
