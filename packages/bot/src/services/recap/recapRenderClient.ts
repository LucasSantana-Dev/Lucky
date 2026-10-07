import { mediaType, readCappedBody } from './recapHttp'

// Plain http is intended: the sidecar is reached only over the compose-internal
// lucky-network, with no TLS hop between containers.
const DEFAULT_RENDER_URL = 'http://render:8080' // NOSONAR S5332
const RENDER_TIMEOUT_MS = 2000
/** A 1200x1440 JPEG is well under this; anything larger is not our card. */
export const RENDER_MAX_RESPONSE_BYTES = 3 * 1024 * 1024

export type RenderFailureReason =
    'timeout' | 'http_error' | 'bad_response' | 'network'

export type RenderResult =
    { ok: true; jpeg: Buffer } | { ok: false; reason: RenderFailureReason }

type RenderOptions = {
    fetch?: typeof fetch
    baseUrl?: string
    timeoutMs?: number
}

function withoutTrailingSlashes(url: string): string {
    let end = url.length
    while (end > 0 && url[end - 1] === '/') end--
    return url.slice(0, end)
}

function renderBaseUrl(): string {
    const raw = process.env.RENDER_URL?.trim()
    return withoutTrailingSlashes(raw || DEFAULT_RENDER_URL)
}

function hasJpegSoi(bytes: Buffer): boolean {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

function isTimeout(error: unknown): boolean {
    const name = (error as { name?: unknown } | null)?.name
    return name === 'TimeoutError' || name === 'AbortError'
}

/** POSTs a recap card payload to the lucky-render sidecar; never throws. */
export async function requestRecapCard(
    payload: unknown,
    options: RenderOptions = {},
): Promise<RenderResult> {
    const base = withoutTrailingSlashes(options.baseUrl ?? renderBaseUrl())
    try {
        const response = await (options.fetch ?? fetch)(
            `${base}/render/recap`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
                redirect: 'error',
                signal: AbortSignal.timeout(
                    options.timeoutMs ?? RENDER_TIMEOUT_MS,
                ),
            },
        )
        if (response.status !== 200) {
            await response.body?.cancel().catch(() => undefined)
            return { ok: false, reason: 'http_error' }
        }
        const type = mediaType(response)
        if (type !== 'image/jpeg') {
            await response.body?.cancel().catch(() => undefined)
            return { ok: false, reason: 'bad_response' }
        }
        const jpeg = await readCappedBody(response, RENDER_MAX_RESPONSE_BYTES)
        // JPEG files start with the SOI marker FF D8 FF.
        if (!jpeg || !hasJpegSoi(jpeg)) {
            return { ok: false, reason: 'bad_response' }
        }
        return { ok: true, jpeg }
    } catch (error) {
        return { ok: false, reason: isTimeout(error) ? 'timeout' : 'network' }
    }
}
