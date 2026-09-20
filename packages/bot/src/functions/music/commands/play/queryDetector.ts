import { isHost } from '../../../../utils/general/urlHost'

/**
 * Query type detection utilities
 */

export function detectQueryType(
    query: string,
): 'youtube' | 'spotify' | 'search' | 'url' {
    const isRealUrl =
        query.startsWith('http://') || query.startsWith('https://')

    // Match by host only, so a spoofed lookalike (evil-youtube.com.attacker.tld)
    // or a path/query segment that merely mentions the host is not misdetected.
    // Bare text without a protocol (a user pasting "youtube.com/..." without
    // https://) is parsed the same way after prefixing https://, so it gets
    // the host check instead of a substring match.
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
