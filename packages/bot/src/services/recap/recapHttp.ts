/** Lowercased media type of a response, without parameters. */
export function mediaType(response: Response): string {
    return (response.headers.get('content-type') ?? '')
        .split(';')[0]
        .trim()
        .toLowerCase()
}

/**
 * Reads a body, giving up (and cancelling the stream) as soon as it passes
 * `maxBytes`, whether or not a content-length was declared. Null when too big
 * or bodyless.
 */
export async function readCappedBody(
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
        const { done, value } = (await reader.read()) as {
            done: boolean
            value: Uint8Array
        }
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
