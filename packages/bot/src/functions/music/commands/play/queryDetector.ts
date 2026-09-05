import { isHost } from '../../../../utils/general/urlHost'

/**
 * Query type detection utilities
 */

export function detectQueryType(
    query: string,
): 'youtube' | 'spotify' | 'search' | 'url' {
    const isRealUrl =
        query.startsWith('http://') || query.startsWith('https://')

    // Real URLs are matched by host only, so a spoofed lookalike
    // (evil-youtube.com.attacker.tld) is not misdetected as youtube/spotify.
    // Bare text without a protocol (a user pasting "youtube.com/..." without
    // https://) keeps the old substring check, since it is not a URL at all
    // and there is no host to parse.
    if (
        isHost(query, 'youtube.com', 'youtu.be') ||
        (!isRealUrl &&
            (query.includes('youtube.com') || query.includes('youtu.be')))
    ) {
        return 'youtube'
    }

    if (
        isHost(query, 'spotify.com') ||
        (!isRealUrl && query.includes('spotify.com'))
    ) {
        return 'spotify'
    }

    if (isRealUrl) {
        return 'url'
    }

    return 'search'
}
