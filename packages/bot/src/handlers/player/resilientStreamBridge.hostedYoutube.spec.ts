import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { jest } from '@jest/globals'

// #2475 follow-up: unlike resilientStreamBridge.spec.ts, this file does NOT
// mock ./ytdlpProcess. It lets the real streamViaYtDlp/streamViaYtDlpSearch
// run so the HOSTED_YOUTUBE_ENABLED guard inside them is actually exercised.
// Only the process spawn underneath is mocked, so a real yt-dlp spawn can be
// asserted against directly.
const mockSpawn = jest.fn()
const mockStreamViaSoundCloud = jest.fn()
const mockIsAvailable = jest.fn()

// The youtubei stage runs for real too; its packages are mocked so a load
// (the first thing it does once past the guard) can be asserted against.
const mockGetInnertube = jest.fn()
const mockCreateAdaptiveStream = jest.fn()
jest.mock('discord-player-youtubei', () => ({
    getInnertube: (...args: unknown[]) => mockGetInnertube(...args),
}))
jest.mock('simple-ytdl-core', () => ({
    createAdaptiveStreamMultiStep: (...args: unknown[]) =>
        mockCreateAdaptiveStream(...args),
}))
jest.mock('node:child_process', () => ({
    spawn: (...args: unknown[]) => mockSpawn(...args),
}))
// The bridge calls resolveViaSoundCloud; tests drive its stream through
// mockStreamViaSoundCloud and its match through mockSoundCloudMatch.
const mockSoundCloudMatch = jest.fn(() => ({
    id: 'https://soundcloud.com/test-artist/test-track',
    durationSec: 210,
}))
const mockStreamSoundCloudTrack = jest.fn()
jest.mock('./soundcloudMatcher', () => ({
    resolveViaSoundCloud: async (...args: unknown[]) => ({
        stream: await mockStreamViaSoundCloud(...args),
        match: mockSoundCloudMatch(),
    }),
    streamSoundCloudTrack: (...args: unknown[]) =>
        mockStreamSoundCloudTrack(...args),
}))
const mockEnsureSpotifyIsrc = jest.fn().mockResolvedValue(null)
jest.mock('./spotifyIsrc', () => ({
    ensureSpotifyIsrc: (...args: unknown[]) => mockEnsureSpotifyIsrc(...args),
    trackIsrc: (track: { metadata?: unknown }) =>
        (track.metadata as { isrc?: string } | null)?.isrc ?? null,
}))
jest.mock('../../services/musicManagement/search/providerHealth', () => ({
    providerHealthService: {
        isAvailable: (...args: unknown[]) => mockIsAvailable(...args),
    },
}))
jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
    errorLog: jest.fn(),
}))
jest.mock('../../utils/monitoring/sentry', () => ({
    addBreadcrumb: jest.fn(),
    captureMessage: jest.fn(),
    safeUrlOrigin: (url: unknown) => {
        if (typeof url !== 'string') return 'invalid-url'
        try {
            return new URL(url).origin
        } catch {
            return 'invalid-url'
        }
    },
    scrubUrls: (text: string) => text,
}))
jest.mock('./spotifySourceCache', () => ({
    getSpotifySource: jest.fn().mockResolvedValue(null),
    setSpotifySource: jest.fn().mockResolvedValue(undefined),
    setSpotifySourceNegative: jest.fn().mockResolvedValue(undefined),
    isNegativeEntry: jest.fn().mockReturnValue(false),
}))

import {
    createResilientStream,
    streamSpotifyTrackViaBridge,
} from './resilientStreamBridge'
import {
    getSpotifySource,
    setSpotifySource,
    setSpotifySourceNegative,
} from './spotifySourceCache'
import { isYtDlpBlocked, recordYtDlpSuccess } from './ytdlpBlockBreaker'

function makeTrack(url: string) {
    let metadata: unknown = null
    return {
        title: 'Test Track',
        author: 'Test Artist',
        duration: '3:30',
        url,
        get metadata() {
            return metadata
        },
        setMetadata(m: unknown) {
            metadata = m
        },
    }
}

describe('createResilientStream: HOSTED_YOUTUBE_ENABLED = false (#2475 follow-up)', () => {
    const originalEnv = process.env.HOSTED_YOUTUBE_ENABLED

    beforeEach(() => {
        jest.clearAllMocks()
        process.env.HOSTED_YOUTUBE_ENABLED = 'false'
        mockIsAvailable.mockReturnValue(true)
    })

    afterEach(() => {
        if (originalEnv === undefined) {
            delete process.env.HOSTED_YOUTUBE_ENABLED
        } else {
            process.env.HOSTED_YOUTUBE_ENABLED = originalEnv
        }
    })

    it('never spawns yt-dlp for a YouTube URL track, falls straight to SoundCloud', async () => {
        mockStreamViaSoundCloud.mockResolvedValue('soundcloud-stream')
        const track = makeTrack('https://www.youtube.com/watch?v=abc123')

        const result = await createResilientStream(track as never)

        expect(result).toBe('soundcloud-stream')
        expect(mockSpawn).not.toHaveBeenCalled()
        expect(mockGetInnertube).not.toHaveBeenCalled()
        expect(mockCreateAdaptiveStream).not.toHaveBeenCalled()
    })

    it('never spawns yt-dlp for a Spotify-sourced track, falls straight to SoundCloud', async () => {
        mockStreamViaSoundCloud.mockResolvedValue('soundcloud-stream')
        const track = makeTrack('https://open.spotify.com/track/123')

        const result = await createResilientStream(track as never)

        expect(result).toBe('soundcloud-stream')
        expect(mockSpawn).not.toHaveBeenCalled()
        expect(mockGetInnertube).not.toHaveBeenCalled()
        expect(mockCreateAdaptiveStream).not.toHaveBeenCalled()
    })
})

// Kill-switch guardrail. decisions/2026-09-27-music-first-positioning.md
// requires YouTube to be switchable off on the hosted bot within 24h, so with
// HOSTED_YOUTUBE_ENABLED off no bridge stage may reach YouTube: no yt-dlp
// spawn (the only way the bgutil po_token sidecar and the cookies file are
// ever used), no yt-dlp search, no youtubei. The controls at the end prove the
// spies here do catch those paths, so the "not called" checks are not vacuous.
type FakeProc = EventEmitter & {
    stdout: PassThrough
    stderr: PassThrough
    kill: jest.Mock
}

function makeFakeProc(): FakeProc {
    const proc = new EventEmitter() as FakeProc
    proc.stdout = new PassThrough()
    proc.stderr = new PassThrough()
    proc.kill = jest.fn()
    return proc
}

const SPOTIFY_URL = 'https://open.spotify.com/track/123'

describe('createResilientStream: kill-switch guardrail', () => {
    const savedEnv = {
        HOSTED_YOUTUBE_ENABLED: process.env.HOSTED_YOUTUBE_ENABLED,
        YTDLP_POT_PROVIDER_URL: process.env.YTDLP_POT_PROVIDER_URL,
        YTDLP_COOKIES_FILE: process.env.YTDLP_COOKIES_FILE,
    }
    let fetchSpy: jest.SpiedFunction<typeof fetch>

    beforeEach(() => {
        jest.clearAllMocks()
        recordYtDlpSuccess()
        process.env.HOSTED_YOUTUBE_ENABLED = 'false'
        // The sidecar and the cookies file are configured, as on the hosted
        // bot: the kill switch must win over both.
        process.env.YTDLP_POT_PROVIDER_URL = 'http://bgutil-provider:4416'
        process.env.YTDLP_COOKIES_FILE = '/app/cookies/youtube.txt'
        mockIsAvailable.mockReturnValue(true)
        mockStreamViaSoundCloud.mockResolvedValue('soundcloud-stream')
        jest.mocked(getSpotifySource).mockResolvedValue(null)
        fetchSpy = jest
            .spyOn(globalThis, 'fetch')
            .mockRejectedValue(new Error('no network in tests'))
    })

    afterEach(() => {
        fetchSpy.mockRestore()
        for (const [key, value] of Object.entries(savedEnv)) {
            if (value === undefined) delete process.env[key]
            else process.env[key] = value
        }
    })

    function expectNoYoutubeReached(): void {
        expect(mockSpawn).not.toHaveBeenCalled()
        expect(fetchSpy).not.toHaveBeenCalled()
        expect(mockGetInnertube).not.toHaveBeenCalled()
        expect(mockCreateAdaptiveStream).not.toHaveBeenCalled()
    }

    it.each(['false', '0', ' FALSE '])(
        'HOSTED_YOUTUBE_ENABLED=%p: a Spotify play never reaches YouTube',
        async (value) => {
            process.env.HOSTED_YOUTUBE_ENABLED = value

            const result = await createResilientStream(
                makeTrack(SPOTIFY_URL) as never,
            )

            expect(result).toBe('soundcloud-stream')
            expectNoYoutubeReached()
            expect(setSpotifySource).not.toHaveBeenCalled()
        },
    )

    it.each([
        'https://www.youtube.com/watch?v=abc123',
        'https://youtu.be/abc123',
        'https://music.youtube.com/watch?v=abc123',
    ])('a YouTube URL track (%s) never reaches YouTube', async (url) => {
        const result = await createResilientStream(makeTrack(url) as never)

        expect(result).toBe('soundcloud-stream')
        expectNoYoutubeReached()
    })

    it('a cached YouTube source for a Spotify track is not streamed and the cache is kept', async () => {
        jest.mocked(getSpotifySource).mockResolvedValue(
            'https://www.youtube.com/watch?v=cached1',
        )

        const result = await createResilientStream(
            makeTrack(SPOTIFY_URL) as never,
        )

        expect(result).toBe('soundcloud-stream')
        expectNoYoutubeReached()
        // A fresh search would be rejected the same way, and the entry is
        // still good once YouTube is back on.
        expect(setSpotifySourceNegative).not.toHaveBeenCalled()
        expect(setSpotifySource).not.toHaveBeenCalled()
    })

    it('the onBeforeCreateStream entry for Spotify never reaches YouTube', async () => {
        const track = { ...makeTrack(SPOTIFY_URL), source: 'spotify' }

        const result = await streamSpotifyTrackViaBridge(track as never)

        expect(result).toBe('soundcloud-stream')
        expectNoYoutubeReached()
    })

    it('kill-switch rejections never open the yt-dlp block breaker', async () => {
        for (let i = 0; i < 3; i++) {
            await createResilientStream(makeTrack(SPOTIFY_URL) as never)
            await createResilientStream(
                makeTrack('https://www.youtube.com/watch?v=abc123') as never,
            )
        }

        expect(isYtDlpBlocked()).toBe(false)
    })

    it('control: a SoundCloud URL still streams through yt-dlp, without the po_token provider', async () => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        setImmediate(() => proc.stdout.emit('data', Buffer.from('bytes')))

        const result = await createResilientStream(
            makeTrack('https://soundcloud.com/artist/track') as never,
        )

        expect(result).toBeDefined()
        expect(mockStreamViaSoundCloud).not.toHaveBeenCalled()
        expect(mockSpawn).toHaveBeenCalledTimes(1)
        const args = mockSpawn.mock.calls[0][1] as string[]
        expect(args).not.toContain('--plugin-dirs')
        expect(args).not.toContain('--cookies')
    })

    it('control: with YouTube on, the same Spotify play does reach yt-dlp and youtubei', async () => {
        process.env.HOSTED_YOUTUBE_ENABLED = 'true'
        mockSpawn.mockImplementation(() => {
            const proc = makeFakeProc()
            setImmediate(() => proc.emit('close', 1, null))
            return proc
        })
        mockGetInnertube.mockRejectedValue(new Error('innertube down'))

        const result = await createResilientStream(
            makeTrack(SPOTIFY_URL) as never,
        )

        expect(result).toBe('soundcloud-stream')
        expect(mockSpawn).toHaveBeenCalled()
        expect(mockGetInnertube).toHaveBeenCalled()
    })
})
