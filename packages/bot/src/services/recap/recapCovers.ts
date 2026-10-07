import { isIP } from 'node:net'
import { discardBody, mediaType, readCappedBody } from './recapHttp'

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
])
// SoundCloud artwork shards i1..i9, matched exactly (no i10, xi1 or suffix tricks).
const SOUNDCLOUD_SHARD = /^i[1-9]\.sndcdn\.com$/
const COVER_HOST_SUFFIXES = ['.mzstatic.com']
const YOUTUBE_HOSTS = new Set(['i.ytimg.com', 'img.youtube.com'])
const YOUTUBE_THUMB_PATH = /^\/vi(?:_webp)?\/([\w-]{6,20})\/[^/]+$/

// Stripped from card text: zero-width and bidi marks (200B-200F), bidi
// embeddings/overrides (202A-202E), word joiner and invisible operators
// (2060-2064), bidi isolates (2066-2069), BOM, Arabic letter mark, combining
// grapheme joiner, and C0/C1 controls. Written as \u escapes so no invisible
// character lives in the source.
/* eslint-disable no-control-regex, no-misleading-character-class */
const INVISIBLE =
    /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u061C\u034F\u0000-\u001F\u007F-\u009F]/g
/* eslint-enable no-control-regex, no-misleading-character-class */
const LONE_SURROGATE =
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/**
 * Track metadata is untrusted and goes into an image. The renderer sanitizes
 * too; this strips invisible and control characters and bounds the length in
 * code points so a huge title cannot bloat the request.
 */
export function sanitizeCardText(
    text: string,
    max = TEXT_MAX_CODE_POINTS,
): string {
    return Array.from(text.replace(LONE_SURROGATE, '').replace(INVISIBLE, ''))
        .slice(0, max)
        .join('')
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
        SOUNDCLOUD_SHARD.test(host) ||
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

const JPEG_MAGIC = [0xff, 0xd8, 0xff]
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function startsWith(bytes: Buffer, magic: number[]): boolean {
    return magic.every((b, i) => bytes[i] === b)
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
        if (!response.ok) {
            await discardBody(response)
            return null
        }
        const type = mediaType(response)
        if (type !== 'image/jpeg' && type !== 'image/png') {
            await discardBody(response)
            return null
        }
        const bytes = await readCappedBody(response, COVER_MAX_BYTES)
        // The content-type header is the CDN's word; the bytes must agree.
        if (
            !bytes ||
            !(startsWith(bytes, JPEG_MAGIC) || startsWith(bytes, PNG_MAGIC))
        ) {
            return null
        }
        return bytes.toString('base64')
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
