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
    // Korean/CJK parenthetical duplicates: "(뱅뱅뱅)" when title already has English equivalent
    /\([^\x00-\x7F]+\)/g,
    /\[[^\x00-\x7F]+\]/g,

    // Parenthetical / bracketed decorators. Order matters: longer phrases
    // like "(Official Music Video)" must be tried before the bare "(Official)"
    // fallback so they're stripped atomically rather than leaving "(Music Video)".
    /\(official\s{0,3}music\s{0,3}video\)/gi,
    /\(official\s{0,3}video\)/gi,
    /\(official\s{0,3}audio\)/gi,
    /\(official\s{0,3}lyric[s]?\s{0,3}video\)/gi,
    /\(official\)/gi,
    /\(lyrics?\s{0,3}video\)/gi,
    /\(lyrics?\)/gi,
    /\(audio\)/gi,
    /\(music\s{0,3}video\)/gi,
    /\(visualizer\)/gi,
    /\(hd\)/gi,
    /\(4k\)/gi,
    /\(remaster(?:ed)?\s{0,3}\d{0,4}\)/gi,
    /\(remaster(?:ed)?\)/gi,
    /\(extended(?:\s{0,3}mix)?\)/gi,
    /\(radio\s{0,3}edit\)/gi,
    /\[official\s{0,3}music\s{0,3}video\]/gi,
    /\[official\s{0,3}video\]/gi,
    /\[official\s{0,3}audio\]/gi,
    /\[official\]/gi,
    /\[lyrics?\s{0,3}video\]/gi,
    /\[lyrics?\]/gi,
    /\[audio\]/gi,
    /\[music\s{0,3}video\]/gi,
    /\[visualizer\]/gi,
    /\[hd\]/gi,
    /\[4k\]/gi,
    /\[remaster(?:ed)?\s{0,3}\d{0,4}\]/gi,
    /\[remaster(?:ed)?\]/gi,
    /\[download\]/gi,
    /\[free\s{0,3}download\]/gi,

    // Version variants: live, acoustic, cover, remix, etc.
    /\(live(?:\s{0,3}(?:version|session|performance|at\s[^)]+))?\)/gi,
    /\[live(?:\s{0,3}(?:version|session|performance|at\s[^\]]+))?\]/gi,
    /\(acoustic(?:\s{0,3}version)?\)/gi,
    /\[acoustic(?:\s{0,3}version)?\]/gi,
    /\(cover(?:\s{0,3}version)?\)/gi,
    /\[cover(?:\s{0,3}version)?\]/gi,
    /\(remix(?:\s{0,3}(?:version|edit))?\)/gi,
    /\[remix(?:\s{0,3}(?:version|edit))?\]/gi,
    /\(instrumental(?:\s{0,3}version)?\)/gi,
    /\[instrumental(?:\s{0,3}version)?\]/gi,
    /\(karaoke(?:\s{0,3}version)?\)/gi,
    /\(explicit(?:\s{0,3}version)?\)/gi,
    /\(clean(?:\s{0,3}version)?\)/gi,
    /\(single(?:\s{0,3}version)?\)/gi,
    /\(album\s{0,3}version\)/gi,
    /\(deluxe(?:\s{0,3}(?:version|edition))?\)/gi,
    /\(bonus\s{0,3}track\)/gi,

    // Bare decorators that weren't wrapped in brackets
    /\bofficial\s{0,3}music\s{0,3}video\b/gi,
    /\bofficial\s{0,3}video\b/gi,
    /\bofficial\s{0,3}audio\b/gi,
    /\bofficial\s{0,3}lyric[s]?\s{0,3}video\b/gi,
    /\blyrics?\s{0,3}video\b/gi,
    /\bmusic\s{0,3}video\b/gi,
    /\bvisualizer\b/gi,

    // Featuring prefixes (leave the featured artist name in place; only strip the noise word)
    /\bft\.?\s+/gi,
    /\bfeat\.?\s+/gi,

    // Fan-upload / concert / public-cover prefixes (bracket-wrapped context tags)
    /\[k-?pop\s+in\s+public[^\]]*\]/gi,
    /\[kpop\s+in\s+public[^\]]*\]/gi,
    /\[dance\s+cover[^\]]*\]/gi,
    /\[fancam[^\]]*\]/gi,
    /\[mpd[^\]]*\]/gi,
    /\[color\s+coded[^\]]*\]/gi,
    /\[color-coded[^\]]*\]/gi,
    /\[(?:4k|hd|uhd)[\s\d+fps[^\]]*\]/gi,
    /\[(?:full\s+)?(?:perf|performance)[^\]]*\]/gi,
    /\[stage\s+mix[^\]]*\]/gi,
    /\[multi[^\]]*\]/gi,
    /\bm\.?v\.?\b/gi,

    // YouTube auto-generated "Topic" channel suffix
    /\s{0,3}-\s{0,3}topic\b/gi,

    // Brazilian/Portuguese YouTube title noise
    /#\S+/g,
    /\(tradu[çc][aã]o[^)]*\)/gi,
    /\[tradu[çc][aã]o[^\]]*\]/gi,
    /\blegendado\b/gi,
    /\(clipe\s+oficial[^)]*\)/gi,
    /\[clipe\s+oficial[^\]]*\]/gi,
    /\blyrics\b/gi,
]

const HYPHENATED_VERSION_SUFFIXES: RegExp[] = [
    /^(?:\d{4}\s+)?remaster(?:ed)?(?:\s+(?:version|\d{4}))?(?:\s+\d{4})?$/i,
    /^official\s+(?:audio|video|music\s+video)$/i,
    /^(?:live|acoustic|demo|extended|instrumental|karaoke)(?:\s+(?:version|edit|session|mix))?$/i,
    /^(?:radio\s+edit|album\s+version|single\s+version|bonus\s+track)$/i,
    /^(?:original\s+(?:mix|version)|original)$/i,
    /^(?:deluxe|deluxe\s+(?:version|edition))$/i,
    /^(?:explicit|clean|explicit\s+version|clean\s+version)$/i,
    /^(?:19|20)\d{2}$/,
]

const VERSION_KEYWORD_RE =
    /\b(?:remaster(?:ed)?|remix|acoustic|live|demo|extended|instrumental|deluxe|explicit|clean|bonus\s+track|radio\s+edit|single\s+version|album\s+version)\b/i

function isVersionSuffix(suffix: string): boolean {
    if (HYPHENATED_VERSION_SUFFIXES.some((re) => re.test(suffix))) return true
    return suffix.length <= 40 && VERSION_KEYWORD_RE.test(suffix)
}

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
    // Strip hyphenated version suffixes: "Song – 2011 Remaster", "Song - Live", etc.
    // indexOf avoids regex quantifier nesting (S5852).
    for (const sep of [' – ', ' - ', ' — ']) {
        const idx = cleaned.indexOf(sep)
        if (idx > 0) {
            const suffix = cleaned.slice(idx + sep.length).trim()
            if (isVersionSuffix(suffix)) {
                cleaned = cleaned.slice(0, idx)
                break
            }
        }
    }

    // Drop empty parenthesis/bracket pairs left behind by the strips above.
    cleaned = cleaned
        .replaceAll(/\(\s{0,3}\)/g, ' ')
        .replaceAll(/\[\s{0,3}\]/g, ' ')
        // Collapse bar/pipe separators — they rarely hold meaningful info
        // post-cleanup ("Song | Movie OST" → "Song OST").
        .replaceAll(/\s{0,3}\|\s{0,3}/g, ' ')
        // Collapse repeated dashes introduced by earlier strips.
        .replaceAll(/\s{0,3}-\s{0,3}-\s{0,3}/g, ' - ')
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
            .replaceAll(/\s{0,3}-\s{0,3}topic\b/gi, '')
            // Strip VEVO suffix whether or not it's separated by whitespace.
            // "QueenVEVO" → "Queen", "Queen VEVO" → "Queen", "VEVO Queen" → "Queen".
            .replaceAll(/\s{0,3}vevo\b/gi, '')
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
 * Extract the song-title core from a YouTube-style "Artist - Song" title.
 * Uses the author field to determine which side of the separator is the artist
 * (handles both "Artist - Song" and inverted "Song - Artist" formats).
 * Strips secondary separators from the core (e.g. "Halo - VERSÃO FORROZINHO" → "Halo").
 * Returns null when no separator is found in the cleaned title.
 */
export function extractSongCore(title: string, author?: string): string | null {
    const cleaned = cleanTitle(title)
    for (const sep of [' - ', ' – ', ' — ']) {
        const idx = cleaned.indexOf(sep)
        if (idx < 2 || idx > 60) continue
        const left = cleaned.slice(0, idx).trim()
        if (/[()[\]]/.test(left)) continue
        const right = cleaned.slice(idx + sep.length).trim()
        if (left.length < 2 || right.length < 2) continue

        let songPart: string
        if (author) {
            const norm = (s: string) =>
                s.toLowerCase().replaceAll(/[^a-z0-9]+/g, '')
            const authNorm = norm(cleanAuthor(author))
            const overlaps = (a: string, b: string) =>
                a.length >= 3 &&
                b.length >= 3 &&
                (a.includes(b.slice(0, 4)) || b.includes(a.slice(0, 4)))
            if (overlaps(authNorm, norm(left))) {
                songPart = right
            } else if (overlaps(authNorm, norm(right))) {
                songPart = left
            } else {
                songPart = right
            }
        } else {
            songPart = right
        }

        for (const innerSep of [' - ', ' – ', ' — ']) {
            const innerIdx = songPart.indexOf(innerSep)
            if (innerIdx > 0) {
                songPart = songPart.slice(0, innerIdx).trim()
                break
            }
        }

        return songPart.length >= 2 ? songPart : null
    }
    return null
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
