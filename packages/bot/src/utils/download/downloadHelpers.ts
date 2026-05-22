/**
 * Download helper utilities
 */

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

export function formatDuration(seconds: number): string {
	if (seconds <= 0) return '0:00'
	const minutes = Math.floor(seconds / 60)
	const secs = seconds % 60
	return `${minutes}:${secs.toString().padStart(2, '0')}`
}
