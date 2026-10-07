import { isIP } from 'node:net'

/** Hard cap per cover, matching the renderer's own limit (64 KB decoded). */
export const COVER_MAX_BYTES = 64 * 1024
const COVER_TIMEOUT_MS = 1500
const COVER_PHASE_TIMEOUT_MS = 5000
const COVER_CONCURRENCY = 5
const TEXT_MAX_CODE_POINTS = 200

const COVER_HOSTS = new Set([
    'i.ytimg.com',
    'img.youtube.com',
    'i.scdn.co',
    'mosaic.scdn.co',
    'image-cdn-ak.spotifycdn.com',
    'image-cdn-fa.spotifycdn.com',
    'i1.sndcdn.com',
])
const COVER_HOST_SUFFIXES = ['.mzstatic.com']
const YOUTUBE_HOSTS = new Set(['i.ytimg.com', 'img.youtube.com'])
const YOUTUBE_THUMB_PATH = /^\/vi(?:_webp)?\/([\w-]{6,20})\/[^/]+$/

// Zero-width, bidi marks, word joiner and invisible operators, BOM, Arabic
// letter mark, combining grapheme joiner, then C0/C1 controls.
// eslint-disable-next-line no-control-regex
const INVISIBLE = /[​-‏⁠-⁤﻿؜͏\u0000-\u001F\u007F-\u009F]/g

/**
 * Track metadata is untrusted and goes into an image. The renderer sanitizes
 * too; this strips invisible and control characters and bounds the length in
 * code points so a huge title cannot bloat the request.
 */
export function sanitizeCardText(
    text: string,
    max = TEXT_MAX_CODE_POINTS,
): string {
    return Array.from(text.replace(INVISIBLE, '')).slice(0, max).join('')
}

/**
 * The URL to fetch for a stored thumbnail, or null when it is not an https
 * URL on the explicit CDN allowlist. No ports, credentials or IP literals.
 */
export function resolveCoverUrl(raw: string | null | undefined): URL | null {
    if (!raw) return null
    let url: URL
    try {
        url = new URL(raw)
    } catch {
        return null
    }
    if (url.protocol !== 'https:') return null
    if (url.port !== '' || url.username !== '' || url.password !== '') {
        return null
    }
    const host = url.hostname.toLowerCase().replace(/\.$/, '')
    if (isIP(host.replace(/^\[|\]$/g, '')) !== 0) return null
    const allowed =
        COVER_HOSTS.has(host) ||
        COVER_HOST_SUFFIXES.some(
            (suffix) => host.endsWith(suffix) && host.length > suffix.length,
        )
    if (!allowed) return null

    if (YOUTUBE_HOSTS.has(host)) {
        // hqdefault/maxresdefault carry letterbox bars; mqdefault is 16:9 clean.
        const match = YOUTUBE_THUMB_PATH.exec(url.pathname)
        if (!match) return null
        return new URL(`https://${host}/vi/${match[1]}/mqdefault.jpg`)
    }
    return url
}

async function readCapped(
    response: Response,
    maxBytes: number,
): Promise<Buffer | null> {
    const declared = Number(response.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > maxBytes) {
        await response.body?.cancel().catch(() => undefined)
        return null
    }
    const reader = response.body?.getReader()
    if (!reader) return null
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > maxBytes) {
            await reader.cancel().catch(() => undefined)
            return null
        }
        chunks.push(value)
    }
    return Buffer.concat(chunks)
}

type FetchCoverOptions = {
    fetch?: typeof fetch
    /** Aborts the fetch when the whole cover phase runs out of time. */
    signal?: AbortSignal
}

/** Base64 bytes of the cover, or null on any failure (the tile has no cover). */
export async function fetchCover(
    raw: string | null | undefined,
    options: FetchCoverOptions = {},
): Promise<string | null> {
    const url = resolveCoverUrl(raw)
    if (!url) return null
    const timeout = AbortSignal.timeout(COVER_TIMEOUT_MS)
    const signal = options.signal
        ? AbortSignal.any([timeout, options.signal])
        : timeout
    try {
        const response = await (options.fetch ?? fetch)(url.toString(), {
            redirect: 'error',
            signal,
        })
        if (!response.ok) return null
        const type = (response.headers.get('content-type') ?? '')
            .split(';')[0]
            .trim()
            .toLowerCase()
        if (type !== 'image/jpeg' && type !== 'image/png') return null
        const bytes = await readCapped(response, COVER_MAX_BYTES)
        return bytes && bytes.length > 0 ? bytes.toString('base64') : null
    } catch {
        return null
    }
}

type FetchCoversOptions = FetchCoverOptions & {
    concurrency?: number
    phaseTimeoutMs?: number
}

/** Covers for each URL in order (null where missing or failed), at most 5 in flight. */
export async function fetchCovers(
    urls: Array<string | null | undefined>,
    options: FetchCoversOptions = {},
): Promise<Array<string | null>> {
    const phase = AbortSignal.timeout(
        options.phaseTimeoutMs ?? COVER_PHASE_TIMEOUT_MS,
    )
    const signal = options.signal
        ? AbortSignal.any([phase, options.signal])
        : phase
    const results: Array<string | null> = urls.map(() => null)
    let next = 0
    const worker = async () => {
        while (next < urls.length && !signal.aborted) {
            const index = next++
            results[index] = await fetchCover(urls[index], {
                fetch: options.fetch,
                signal,
            })
        }
    }
    await Promise.all(
        Array.from(
            {
                length: Math.min(
                    options.concurrency ?? COVER_CONCURRENCY,
                    urls.length,
                ),
            },
            worker,
        ),
    )
    return results
}
