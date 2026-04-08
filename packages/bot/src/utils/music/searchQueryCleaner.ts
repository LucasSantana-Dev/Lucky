/**
 * Shared noise-stripping + query-cleaning helpers for music search.
 *
 * Used by:
 * - autoplay / seed candidate search (queueManipulation.ts)
 * - SoundCloud bridge in the YoutubeiExtractor (playerFactory.ts)
 * - last.fm scrobble normalization (lastfm/*)
 *
 * The goal is to strip YouTube-style noise ("(Official Video)", "[Download]",
 * uploader-channel junk like "- Topic", feat./ft., trailing tags) so downstream
 * searches find the actual track, not the uploader's decorated listing.
 */

const NOISE_PATTERNS: readonly RegExp[] = [
    // Parenthetical / bracketed decorators. Order matters: longer phrases
    // like "(Official Music Video)" must be tried before the bare "(Official)"
    // fallback so they're stripped atomically rather than leaving "(Music Video)".
    /\(official\s*music\s*video\)/gi,
    /\(official\s*video\)/gi,
    /\(official\s*audio\)/gi,
    /\(official\s*lyric[s]?\s*video\)/gi,
    /\(official\)/gi,
    /\(lyrics?\s*video\)/gi,
    /\(lyrics?\)/gi,
    /\(audio\)/gi,
    /\(music\s*video\)/gi,
    /\(visualizer\)/gi,
    /\(hd\)/gi,
    /\(4k\)/gi,
    /\(remaster(?:ed)?\s*\d{0,4}\)/gi,
    /\(remaster(?:ed)?\)/gi,
    /\(extended(?:\s*mix)?\)/gi,
    /\(radio\s*edit\)/gi,
    /\[official\s*music\s*video\]/gi,
    /\[official\s*video\]/gi,
    /\[official\s*audio\]/gi,
    /\[official\]/gi,
    /\[lyrics?\s*video\]/gi,
    /\[lyrics?\]/gi,
    /\[audio\]/gi,
    /\[music\s*video\]/gi,
    /\[visualizer\]/gi,
    /\[hd\]/gi,
    /\[4k\]/gi,
    /\[remaster(?:ed)?\s*\d{0,4}\]/gi,
    /\[remaster(?:ed)?\]/gi,
    /\[download\]/gi,
    /\[free\s*download\]/gi,

    // Bare decorators that weren't wrapped in brackets
    /\bofficial\s*music\s*video\b/gi,
    /\bofficial\s*video\b/gi,
    /\bofficial\s*audio\b/gi,
    /\bofficial\s*lyric[s]?\s*video\b/gi,
    /\blyrics?\s*video\b/gi,
    /\bmusic\s*video\b/gi,
    /\bvisualizer\b/gi,

    // Featuring prefixes (leave the featured artist name in place; only strip the noise word)
    /\bft\.?\s+/gi,
    /\bfeat\.?\s+/gi,

    // YouTube auto-generated "Topic" channel suffix
    /\s*-\s*topic\b/gi,
]

/**
 * Channels whose uploads are almost always mislabeled or compilation garbage.
 * If a resolved YouTube track's author matches one of these exactly, the title
 * is probably a bad search result and the caller should treat it as noise.
 */
const SPAM_CHANNEL_AUTHORS: readonly string[] = [
    'best songs',
    'best music',
    'free music',
    'free download',
    'ncs',
    'no copyright sounds',
]

/**
 * Clean a raw title string. Used on its own for search-by-title flows and
 * composed via `cleanSearchQuery` for search-with-artist flows.
 */
export function cleanTitle(title: string): string {
    let cleaned = title
    for (const pattern of NOISE_PATTERNS) {
        cleaned = cleaned.replaceAll(pattern, ' ')
    }
    // Drop empty parenthesis/bracket pairs left behind by the strips above.
    cleaned = cleaned
        .replaceAll(/\(\s*\)/g, ' ')
        .replaceAll(/\[\s*\]/g, ' ')
        // Collapse bar/pipe separators — they rarely hold meaningful info
        // post-cleanup ("Song | Movie OST" → "Song OST").
        .replaceAll(/\s*\|\s*/g, ' ')
        // Collapse repeated dashes introduced by earlier strips.
        .replaceAll(/\s*-\s*-\s*/g, ' - ')
        .replaceAll(/\s{2,}/g, ' ')
        .trim()
    return cleaned
}

/**
 * Clean an author string. Mostly this trims whitespace and drops "- Topic" if
 * the cleaner missed it earlier, but it also drops `VEVO` corporate suffixes.
 */
export function cleanAuthor(author: string): string {
    return (
        author
            .replaceAll(/\s*-\s*topic\b/gi, '')
            // Strip VEVO suffix whether or not it's separated by whitespace.
            // "QueenVEVO" → "Queen", "Queen VEVO" → "Queen", "VEVO Queen" → "Queen".
            .replaceAll(/\s*vevo\b/gi, '')
            .replaceAll(/\s{2,}/g, ' ')
            .trim()
    )
}

/**
 * Build a cleaned `${title} ${author}` search query for downstream providers.
 * Empty-tolerant: if either field is blank after cleaning, returns the other
 * field alone rather than emitting a stray trailing/leading space.
 */
export function cleanSearchQuery(title: string, author: string): string {
    const cleanedTitle = cleanTitle(title)
    const cleanedAuthor = cleanAuthor(author)
    if (!cleanedTitle && !cleanedAuthor) return ''
    if (!cleanedAuthor) return cleanedTitle
    if (!cleanedTitle) return cleanedAuthor
    return `${cleanedTitle} ${cleanedAuthor}`.trim()
}

/**
 * True if the author is a known noise/compilation channel.
 * Callers can use this to invalidate a match and trigger a retry with a
 * cleaner query, or to skip the result entirely.
 */
export function isSpamChannel(author: string): boolean {
    const normalized = author.trim().toLowerCase()
    if (!normalized) return false
    return SPAM_CHANNEL_AUTHORS.some(
        (spam) => normalized === spam || normalized.includes(spam),
    )
}
