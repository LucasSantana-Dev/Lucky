/**
 * Query type detection utilities
 */

export function detectQueryType(
    query: string,
): 'youtube' | 'spotify' | 'search' | 'url' {
    if (query.includes('youtube.com') || query.includes('youtu.be')) {
        return 'youtube'
    }

    if (query.includes('spotify.com')) {
        return 'spotify'
    }

    if (query.startsWith('http://') || query.startsWith('https://')) {
        return 'url'
    }

    return 'search'
}
