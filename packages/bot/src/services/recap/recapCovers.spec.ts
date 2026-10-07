import { describe, expect, it, jest } from '@jest/globals'
import {
    COVER_MAX_BYTES,
    fetchCover,
    fetchCovers,
    resolveCoverUrl,
    sanitizeCardText,
} from './recapCovers'

type AnyFn = (...args: any[]) => any

function imageResponse(
    bytes: Uint8Array | number,
    headers: Record<string, string> = { 'content-type': 'image/jpeg' },
    status = 200,
): Response {
    const body =
        typeof bytes === 'number' ? new Uint8Array(bytes).fill(1) : bytes
    return new Response(body as BodyInit, { status, headers })
}

describe('sanitizeCardText', () => {
    it('strips invisible and control characters', () => {
        const dirty = 'a​b‏c⁠d⁤e﻿f؜g͏h\u0000i\u0085j\u007Fk\nl'
        expect(sanitizeCardText(dirty)).toBe('abcdefghijkl')
    })

    it('cuts to 200 code points without splitting a surrogate pair', () => {
        const out = sanitizeCardText('😀'.repeat(300))
        expect(Array.from(out)).toHaveLength(200)
        expect(out.endsWith('😀')).toBe(true)
    })
})

describe('resolveCoverUrl allowlist', () => {
    it.each([
        'https://i.scdn.co/image/abc',
        'https://mosaic.scdn.co/640/x',
        'https://image-cdn-ak.spotifycdn.com/image/x',
        'https://image-cdn-fa.spotifycdn.com/image/x',
        'https://i1.sndcdn.com/artworks-x.jpg',
        'https://is1-ssl.mzstatic.com/image/thumb/x.jpg',
        'https://I.SCDN.CO./image/abc',
    ])('accepts %s', (url) => {
        expect(resolveCoverUrl(url)).not.toBeNull()
    })

    it.each([
        ['http scheme', 'http://i.scdn.co/image/abc'],
        ['evil host', 'https://evil.example/x.jpg'],
        ['suffix trick', 'https://i.scdn.co.evil.example/x'],
        ['prefix trick', 'https://evil-i.scdn.co/x'],
        ['bare mzstatic', 'https://mzstatic.com/x'],
        ['credentials', 'https://user:pw@i.scdn.co/x'],
        ['userinfo host trick', 'https://i.scdn.co@evil.example/x'],
        ['custom port', 'https://i.scdn.co:8443/x'],
        ['IPv4 literal', 'https://127.0.0.1/x'],
        ['IPv4 integer form', 'https://2130706433/x'],
        ['IPv6 literal', 'https://[::1]/x'],
        ['file scheme', 'file:///etc/passwd'],
        ['garbage', 'not a url'],
        ['empty', ''],
    ])('rejects %s', (_, url) => {
        expect(resolveCoverUrl(url)).toBeNull()
    })

    it('rejects null and undefined', () => {
        expect(resolveCoverUrl(null)).toBeNull()
        expect(resolveCoverUrl(undefined)).toBeNull()
    })

    it.each([
        'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg?sqp=abc',
        'https://img.youtube.com/vi/dQw4w9WgXcQ/0.jpg',
    ])('rewrites YouTube %s to mqdefault', (url) => {
        const host = new URL(url).host
        expect(resolveCoverUrl(url)?.toString()).toBe(
            `https://${host}/vi/dQw4w9WgXcQ/mqdefault.jpg`,
        )
    })

    it('rejects a YouTube host path that is not a video thumbnail', () => {
        expect(resolveCoverUrl('https://i.ytimg.com/other/x.jpg')).toBeNull()
    })
})

describe('fetchCover', () => {
    const URL_OK = 'https://i.scdn.co/image/abc'

    it('returns base64 and fetches with redirect: error and a signal', async () => {
        const fetchFn = jest
            .fn<AnyFn>()
            .mockResolvedValue(imageResponse(Uint8Array.from([1, 2, 3])))
        const out = await fetchCover(URL_OK, { fetch: fetchFn as typeof fetch })

        expect(out).toBe(Buffer.from([1, 2, 3]).toString('base64'))
        const init = fetchFn.mock.calls[0][1]
        expect(init.redirect).toBe('error')
        expect(init.signal).toBeInstanceOf(AbortSignal)
    })

    it('accepts png', async () => {
        const fetchFn = jest
            .fn<AnyFn>()
            .mockResolvedValue(
                imageResponse(4, { 'content-type': 'image/png; charset=x' }),
            )
        expect(
            await fetchCover(URL_OK, { fetch: fetchFn as typeof fetch }),
        ).not.toBeNull()
    })

    it('does not fetch a disallowed URL', async () => {
        const fetchFn = jest.fn<AnyFn>()
        expect(
            await fetchCover('http://i.scdn.co/x', {
                fetch: fetchFn as typeof fetch,
            }),
        ).toBeNull()
        expect(
            await fetchCover('https://evil.example/x', {
                fetch: fetchFn as typeof fetch,
            }),
        ).toBeNull()
        expect(fetchFn).not.toHaveBeenCalled()
    })

    it('rewrites the YouTube URL it actually requests', async () => {
        const fetchFn = jest.fn<AnyFn>().mockResolvedValue(imageResponse(4))
        await fetchCover('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', {
            fetch: fetchFn as typeof fetch,
        })
        expect(fetchFn.mock.calls[0][0]).toBe(
            'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
        )
    })

    it('treats a redirect (fetch rejection) as no cover', async () => {
        const fetchFn = jest
            .fn<AnyFn>()
            .mockRejectedValue(new TypeError('redirect'))
        expect(
            await fetchCover(URL_OK, { fetch: fetchFn as typeof fetch }),
        ).toBeNull()
    })

    it.each([
        ['text/html', { 'content-type': 'text/html' }],
        ['image/svg+xml', { 'content-type': 'image/svg+xml' }],
        ['image/webp', { 'content-type': 'image/webp' }],
        ['missing type', {}],
    ])('rejects content-type %s', async (_, headers) => {
        const fetchFn = jest
            .fn<AnyFn>()
            .mockResolvedValue(imageResponse(4, headers))
        expect(
            await fetchCover(URL_OK, { fetch: fetchFn as typeof fetch }),
        ).toBeNull()
    })

    it('rejects a non-2xx response', async () => {
        const fetchFn = jest
            .fn<AnyFn>()
            .mockResolvedValue(
                imageResponse(4, { 'content-type': 'image/jpeg' }, 404),
            )
        expect(
            await fetchCover(URL_OK, { fetch: fetchFn as typeof fetch }),
        ).toBeNull()
    })

    it('accepts exactly 64 KB and rejects one byte more', async () => {
        const ok = jest
            .fn<AnyFn>()
            .mockResolvedValue(imageResponse(COVER_MAX_BYTES))
        expect(
            await fetchCover(URL_OK, { fetch: ok as typeof fetch }),
        ).not.toBeNull()
        const big = jest
            .fn<AnyFn>()
            .mockResolvedValue(imageResponse(COVER_MAX_BYTES + 1))
        expect(
            await fetchCover(URL_OK, { fetch: big as typeof fetch }),
        ).toBeNull()
    })

    it('aborts a stream that exceeds the cap without a content-length', async () => {
        let cancelled = false
        let sent = 0
        const stream = new ReadableStream<Uint8Array>({
            pull(controller) {
                sent += 16 * 1024
                controller.enqueue(new Uint8Array(16 * 1024))
            },
            cancel() {
                cancelled = true
            },
        })
        const fetchFn = jest
            .fn<AnyFn>()
            .mockResolvedValue(
                new Response(stream, {
                    headers: { 'content-type': 'image/jpeg' },
                }),
            )

        expect(
            await fetchCover(URL_OK, { fetch: fetchFn as typeof fetch }),
        ).toBeNull()
        expect(cancelled).toBe(true)
        expect(sent).toBeLessThan(COVER_MAX_BYTES * 3)
    })

    it('rejects an oversized declared content-length without reading', async () => {
        const fetchFn = jest.fn<AnyFn>().mockResolvedValue(
            imageResponse(8, {
                'content-type': 'image/jpeg',
                'content-length': String(COVER_MAX_BYTES + 1),
            }),
        )
        expect(
            await fetchCover(URL_OK, { fetch: fetchFn as typeof fetch }),
        ).toBeNull()
    })

    it('gives up on a hung request after the per-image timeout', async () => {
        jest.useFakeTimers()
        try {
            const fetchFn = jest.fn<AnyFn>(
                (_url: string, init: RequestInit) =>
                    new Promise((_, reject) => {
                        init.signal?.addEventListener('abort', () =>
                            reject(init.signal?.reason),
                        )
                    }),
            )
            const pending = fetchCover(URL_OK, {
                fetch: fetchFn as typeof fetch,
            })
            await jest.advanceTimersByTimeAsync(1600)
            expect(await pending).toBeNull()
        } finally {
            jest.useRealTimers()
        }
    })
})

describe('fetchCovers', () => {
    it('keeps order, nulls failures and caps concurrency at 5', async () => {
        let inFlight = 0
        let peak = 0
        const fetchFn = jest.fn<AnyFn>(async (url: string) => {
            inFlight++
            peak = Math.max(peak, inFlight)
            await new Promise((r) => setTimeout(r, 5))
            inFlight--
            return url.endsWith('/bad')
                ? imageResponse(4, { 'content-type': 'text/html' })
                : imageResponse(Uint8Array.from([url.length]))
        })
        const urls = Array.from({ length: 12 }, (_, i) =>
            i === 3
                ? 'https://i.scdn.co/image/bad'
                : `https://i.scdn.co/image/${i}`,
        )
        urls[7] = null as unknown as string

        const out = await fetchCovers(urls, { fetch: fetchFn as typeof fetch })

        expect(out).toHaveLength(12)
        expect(out[3]).toBeNull()
        expect(out[7]).toBeNull()
        expect(out[0]).toBe(Buffer.from([urls[0].length]).toString('base64'))
        expect(peak).toBeLessThanOrEqual(5)
        expect(peak).toBeGreaterThan(1)
    })

    it('stops when the whole phase runs out of time', async () => {
        const fetchFn = jest.fn<AnyFn>(
            (_url: string, init: RequestInit) =>
                new Promise((_, reject) => {
                    init.signal?.addEventListener('abort', () =>
                        reject(init.signal?.reason),
                    )
                }),
        )
        const urls = Array.from(
            { length: 20 },
            (_, i) => `https://i.scdn.co/image/${i}`,
        )

        const out = await fetchCovers(urls, {
            fetch: fetchFn as typeof fetch,
            phaseTimeoutMs: 30,
        })

        expect(out.every((c) => c === null)).toBe(true)
        expect(fetchFn.mock.calls.length).toBeLessThan(urls.length)
    })
})
