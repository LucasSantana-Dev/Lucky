/**
 * Origin of the backend from `WEBAPP_BACKEND_URL`, or null when unset or not
 * an http(s) URL.
 */
export function getBackendOrigin(): string | null {
    const raw = process.env.WEBAPP_BACKEND_URL?.trim()
    if (!raw) return null
    try {
        const url = new URL(raw)
        return url.protocol === 'https:' || url.protocol === 'http:'
            ? url.origin
            : null
    } catch {
        return null
    }
}

/**
 * Invite link through the backend `/invite` route, so the click and the join
 * are recorded with this source (#2750). Null for forks without a backend.
 */
export function buildTrackedInviteUrl(
    source: string,
    medium: string,
): string | null {
    const backend = getBackendOrigin()
    if (!backend) return null
    const params = new URLSearchParams({
        utm_source: source,
        utm_medium: medium,
    })
    return `${backend}/invite?${params.toString()}`
}
