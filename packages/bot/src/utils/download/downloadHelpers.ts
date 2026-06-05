/**
 * Download helper utilities
 */
import { formatDurationClock } from '../general/formatDuration'

const SUPPORTED_HOSTS: ReadonlyArray<string> = [
    'youtube.com',
    'youtu.be',
    'soundcloud.com',
    'bandcamp.com',
    'spotify.com',
]

function parseHostname(url: string): string | null {
    try {
        return new URL(url).hostname.toLowerCase()
    } catch {
        return null
    }
}

function hostMatches(host: string, domain: string): boolean {
    return host === domain || host.endsWith(`.${domain}`)
}

export function isSupportedPlatformUrl(url: string): boolean {
    const host = parseHostname(url)
    if (!host) return false
    return SUPPORTED_HOSTS.some((domain) => hostMatches(host, domain))
}

export function getPlatformFromUrl(url: string): string {
    const host = parseHostname(url)
    if (!host) return 'unknown'
    if (hostMatches(host, 'youtube.com') || hostMatches(host, 'youtu.be')) {
        return 'youtube'
    }
    if (hostMatches(host, 'soundcloud.com')) return 'soundcloud'
    if (hostMatches(host, 'bandcamp.com')) return 'bandcamp'
    if (hostMatches(host, 'spotify.com')) return 'spotify'
    return 'unknown'
}

export function createErrorEmbed(title: string, description: string): unknown {
    return {
        title,
        description,
        color: 0xff0000, // Red
    }
}

/**
 * Exported wrapper for formatDurationClock to maintain backward compatibility.
 * Handles <=0 case explicitly before delegating.
 */
export function formatDuration(seconds: number): string {
    if (seconds <= 0) return '0:00'
    return formatDurationClock(seconds)
}
