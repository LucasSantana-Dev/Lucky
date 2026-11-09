import { describe, expect, it } from '@jest/globals'
import { detectQueryType, parseYoutubeLink } from './queryDetector'

describe('detectQueryType', () => {
    describe('youtube detection', () => {
        it('detects youtube.com URL', () => {
            expect(
                detectQueryType('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
            ).toBe('youtube')
        })

        it('detects youtu.be short URL', () => {
            expect(detectQueryType('https://youtu.be/dQw4w9WgXcQ')).toBe(
                'youtube',
            )
        })

        it('detects youtube.com URL without protocol', () => {
            expect(detectQueryType('youtube.com/watch?v=abc')).toBe('youtube')
        })

        it('accepts a fully-qualified host with a trailing dot', () => {
            expect(
                detectQueryType('https://www.youtube.com./watch?v=abc'),
            ).toBe('youtube')
        })

        it('does not treat a bare lookalike host as youtube', () => {
            expect(
                detectQueryType('evil-youtube.com.attacker.tld/watch?v=abc'),
            ).toBe('search')
        })

        it('detects youtube URL even when query also contains spotify.com', () => {
            expect(
                detectQueryType(
                    'https://youtube.com/watch?redirect=spotify.com',
                ),
            ).toBe('youtube')
        })

        it('detects a real youtube subdomain', () => {
            expect(detectQueryType('https://music.youtube.com/watch?v=1')).toBe(
                'youtube',
            )
        })

        it('does not detect a lookalike host as youtube', () => {
            expect(
                detectQueryType('https://evil-youtube.com.attacker.tld/x'),
            ).not.toBe('youtube')
        })
    })

    describe('spotify detection', () => {
        it('detects spotify.com track URL', () => {
            expect(
                detectQueryType(
                    'https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh',
                ),
            ).toBe('spotify')
        })

        it('detects spotify.com playlist URL', () => {
            expect(
                detectQueryType(
                    'https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd',
                ),
            ).toBe('spotify')
        })

        it('detects spotify.com without protocol', () => {
            expect(detectQueryType('spotify.com/track/abc')).toBe('spotify')
        })
    })

    describe('url detection', () => {
        it('detects generic https URL', () => {
            expect(detectQueryType('https://example.com/audio.mp3')).toBe('url')
        })

        it('detects generic http URL', () => {
            expect(detectQueryType('http://example.com/stream')).toBe('url')
        })

        it('detects https:// with no domain as url', () => {
            expect(detectQueryType('https://')).toBe('url')
        })
    })

    describe('search fallback', () => {
        it('returns search for plain text query', () => {
            expect(detectQueryType('never gonna give you up')).toBe('search')
        })

        it('returns search for empty string', () => {
            expect(detectQueryType('')).toBe('search')
        })

        it('returns search for whitespace-only string', () => {
            expect(detectQueryType('   ')).toBe('search')
        })

        it('returns search when protocol is uppercase (case-sensitive check)', () => {
            expect(detectQueryType('HTTPS://example.com')).toBe('search')
        })

        it('returns search for artist name that contains url-like text', () => {
            expect(detectQueryType('https search something')).toBe('search')
        })
    })
})

describe('parseYoutubeLink', () => {
    it.each([
        ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
        ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
        [
            'https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share',
            'dQw4w9WgXcQ',
        ],
        [
            'https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc&index=2',
            'dQw4w9WgXcQ',
        ],
        ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ])('reads %s as video %s', (url, videoId) => {
        expect(parseYoutubeLink(url)).toEqual({ kind: 'video', videoId })
    })

    it.each([
        'https://www.youtube.com/playlist?list=PLabc',
        'https://music.youtube.com/playlist?list=OLAKabc',
    ])('reads %s as a playlist', (url) => {
        expect(parseYoutubeLink(url)).toEqual({ kind: 'playlist' })
    })

    it.each([
        'never gonna give you up',
        'youtube.com/watch?v=dQw4w9WgXcQ',
        'https://www.youtube.com/@somechannel',
        'https://www.youtube.com/playlist',
        'https://www.youtube.com/watch?v=',
        'https://evil-youtube.com.attacker.tld/watch?v=dQw4w9WgXcQ',
        'https://open.spotify.com/track/abc',
    ])('ignores %s', (query) => {
        expect(parseYoutubeLink(query)).toBeNull()
    })
})
