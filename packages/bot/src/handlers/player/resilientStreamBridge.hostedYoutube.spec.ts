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

import { createResilientStream } from './resilientStreamBridge'

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
