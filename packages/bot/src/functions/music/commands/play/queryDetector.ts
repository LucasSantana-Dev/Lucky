import { isHost } from '../../../../utils/general/urlHost'

/**
 * Query type detection utilities
 */

export function detectQueryType(
    query: string,
): 'youtube' | 'spotify' | 'search' | 'url' {
    const isRealUrl =
        query.startsWith('http://') || query.startsWith('https://')

    const candidate = isRealUrl ? query : `https://${query}`

    if (isHost(candidate, 'youtube.com', 'youtu.be')) {
        return 'youtube'
    }

    if (isHost(candidate, 'spotify.com')) {
        return 'spotify'
    }

    if (isRealUrl) {
        return 'url'
    }

    return 'search'
}
