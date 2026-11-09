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

export type YoutubeLink =
    { kind: 'video'; videoId: string } | { kind: 'playlist' }

const YOUTUBE_VIDEO_ID = /^[\w-]{6,}$/

/**
 * Classifies a pasted YouTube link (youtube.com, music.youtube.com, m.,
 * youtu.be) as a single video or a playlist-only link. A watch link that
 * also carries `&list=` counts as the video: that is the song the user was
 * looking at. Anything else (channel, search page, text) returns null.
 */
export function parseYoutubeLink(query: string): YoutubeLink | null {
    const trimmed = query.trim()
    if (!/^https?:\/\//i.test(trimmed)) return null
    if (!isHost(trimmed, 'youtube.com', 'youtu.be')) return null

    let parsed: URL
    try {
        parsed = new URL(trimmed)
    } catch {
        return null
    }

    const video = (id: string | null | undefined): YoutubeLink | null =>
        id && YOUTUBE_VIDEO_ID.test(id) ? { kind: 'video', videoId: id } : null

    if (isHost(trimmed, 'youtu.be')) {
        return video(parsed.pathname.split('/')[1])
    }

    const path = parsed.pathname.replace(/\/+$/, '')
    if (path === '/watch') return video(parsed.searchParams.get('v'))
    if (path.startsWith('/shorts/') || path.startsWith('/live/')) {
        return video(path.split('/')[2])
    }
    if (path === '/playlist' && parsed.searchParams.get('list')) {
        return { kind: 'playlist' }
    }
    return null
}
