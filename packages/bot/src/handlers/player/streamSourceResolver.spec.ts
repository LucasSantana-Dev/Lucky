import { describe, it, expect } from '@jest/globals'
import { resolveActualStreamSource } from './streamSourceResolver'
import { STREAM_BRIDGE_FALLBACK_METADATA_KEY } from './streamFallbackState'

// Real extractor identifiers, kept in sync with streamSourceResolver.ts's own
// hardcoded constants (not imported from the extractor packages themselves —
// see that file's comment on why: ts-jest can't load their TS/ESM sources).
const SPOTIFY_IDENTIFIER = 'com.discord-player.itsmaat.spotifyextractor'
const YOUTUBE_IDENTIFIER =
    'com.retrouser955.discord-player.discord-player-youtubei'
const SOUNDCLOUD_IDENTIFIER = 'com.discord-player.soundcloudextractor'

describe('resolveActualStreamSource', () => {
    it('returns soundcloud-bridge when the track was stamped by the fallback bridge', () => {
        const track = {
            metadata: {
                [STREAM_BRIDGE_FALLBACK_METADATA_KEY]: 'soundcloud-full',
            },
            extractor: { identifier: SPOTIFY_IDENTIFIER },
        }
        expect(resolveActualStreamSource(track)).toBe('soundcloud-bridge')
    })

    it('returns youtube when resolved by the YouTube extractor with no fallback stamp', () => {
        const track = {
            metadata: {},
            extractor: { identifier: YOUTUBE_IDENTIFIER },
        }
        expect(resolveActualStreamSource(track)).toBe('youtube')
    })

    it('returns youtube for a Spotify-sourced track bridged successfully via yt-dlp (no fallback stamp)', () => {
        const track = {
            metadata: {},
            extractor: { identifier: SPOTIFY_IDENTIFIER },
        }
        expect(resolveActualStreamSource(track)).toBe('youtube')
    })

    it('returns soundcloud for the dedicated SoundCloud extractor', () => {
        const track = {
            metadata: {},
            extractor: { identifier: SOUNDCLOUD_IDENTIFIER },
        }
        expect(resolveActualStreamSource(track)).toBe('soundcloud')
    })

    it('returns other for any other extractor (Apple Music, Vimeo, Attachments)', () => {
        const track = {
            metadata: {},
            extractor: { identifier: 'com.discord-player.applemusicextractor' },
        }
        expect(resolveActualStreamSource(track)).toBe('other')
    })

    it('returns other when there is no extractor at all', () => {
        expect(
            resolveActualStreamSource({ metadata: {}, extractor: null }),
        ).toBe('other')
    })
})
