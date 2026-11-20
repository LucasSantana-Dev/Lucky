import {
    searchSpotifyAlbums,
    type SpotifyAlbumMatch,
} from '@lucky/shared/utils'

const ALBUM_WORDS = new Set(['album'])
const FULL_WORDS = new Set([
    'completo',
    'completa',
    'inteiro',
    'full',
    'complete',
    'entire',
])

const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u

// Drops punctuation around a word ("album:" -> "album") with a linear scan:
// an anchored `[^...]+$` regex backtracks on long punctuation runs.
function trimPunctuation(word: string): string {
    const chars = Array.from(word)
    let start = 0
    let end = chars.length
    while (start < end && !WORD_CHAR.test(chars[start])) start++
    while (end > start && !WORD_CHAR.test(chars[end - 1])) end--
    return chars.slice(start, end).join('')
}

function fold(word: string): string {
    return trimPunctuation(
        word
            .normalize('NFD')
            // Latin accents only: in other scripts a mark changes the word.
            .replaceAll(/(\p{Script=Latin})\p{M}+/gu, '$1')
            .toLowerCase(),
    )
}

function wordsOf(value: string): string[] {
    return fold(value)
        .split(/[^\p{L}\p{M}\p{N}]+/u)
        .filter(Boolean)
}

/**
 * "album esquinas anavitória completo" asks for the whole album, which a
 * track search cannot return. Returns the request without the album words,
 * or null when it does not ask for an album.
 */
export function albumIntentQuery(query: string): string | null {
    const trimmed = query.trim()
    if (/^https?:\/\//i.test(trimmed)) return null
    const tokens = trimmed.split(/\s+/)
    if (!tokens.some((token) => ALBUM_WORDS.has(fold(token)))) return null
    const rest = tokens
        .filter((token) => {
            const word = fold(token)
            return !ALBUM_WORDS.has(word) && !FULL_WORDS.has(word)
        })
        .join(' ')
    return rest || null
}

/**
 * The album a request names, or undefined. Only an album whose whole name is
 * in the request counts, preferring one by an artist the request also names.
 */
export function pickAlbum(
    albums: SpotifyAlbumMatch[],
    albumQuery: string,
): SpotifyAlbumMatch | undefined {
    const queryWords = new Set(wordsOf(albumQuery))
    const within = (value: string) => {
        const words = wordsOf(value)
        return words.length > 0 && words.every((w) => queryWords.has(w))
    }
    const requested = wordsOf(albumQuery).join(' ')
    const matches = albums.filter(
        (album) =>
            within(album.name) &&
            // A self-titled album only for the artist's name alone:
            // "album esquinas anavitória" is not "ANAVITÓRIA".
            (wordsOf(album.name).join(' ') !==
                wordsOf(album.artist).join(' ') ||
                wordsOf(album.name).join(' ') === requested),
    )
    return matches.find((album) => within(album.artist)) ?? matches[0]
}

/**
 * The Spotify album URL for an album request, or null so /play keeps its
 * normal track search.
 */
export async function resolveAlbumIntent(
    query: string,
): Promise<string | null> {
    const albumQuery = albumIntentQuery(query)
    if (!albumQuery) return null
    try {
        const albums = await searchSpotifyAlbums(albumQuery, 20)
        return pickAlbum(albums, albumQuery)?.url ?? null
    } catch {
        return null
    }
}
