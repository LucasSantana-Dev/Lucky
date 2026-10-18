const WEB_PROTOCOLS = ['http:', 'https:']

/**
 * Returns a normalized URL for an <img src> only when it parses and uses an
 * allowed protocol, so user-typed text never reaches the DOM unchecked.
 */
export function safeImageSrc(
    raw: string,
    allowedProtocols: readonly string[] = WEB_PROTOCOLS,
): string | null {
    const trimmed = raw.trim()
    if (!trimmed) return null
    try {
        const url = new URL(trimmed)
        return allowedProtocols.includes(url.protocol) ? url.href : null
    } catch {
        return null
    }
}
