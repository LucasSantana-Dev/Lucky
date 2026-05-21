/**
 * Download helper utilities
 */

export function isSupportedPlatformUrl(url: string): boolean {
	const supportedDomains = [
		'youtube.com',
		'youtu.be',
		'soundcloud.com',
		'bandcamp.com',
		'spotify.com',
	]
	return supportedDomains.some((domain) => url.toLowerCase().includes(domain))
}

export function getPlatformFromUrl(url: string): string {
	if (url.includes('youtube.com') || url.includes('youtu.be')) {
		return 'youtube'
	}
	if (url.includes('soundcloud.com')) {
		return 'soundcloud'
	}
	if (url.includes('bandcamp.com')) {
		return 'bandcamp'
	}
	if (url.includes('spotify.com')) {
		return 'spotify'
	}
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
