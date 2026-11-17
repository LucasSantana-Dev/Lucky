import { searchSpotifyAlbums } from '@lucky/shared/utils'

const ALBUM_WORDS = new Set(['album'])
const FULL_WORDS = new Set([
    'completo',
    'completa',
    'inteiro',
    'full',
    'complete',
    'entire',
])

function fold(word: string): string {
    return (
        word
            .normalize('NFD')
            // Latin accents only: in other scripts a mark changes the word.
            .replaceAll(/(\p{Script=Latin})\p{M}+/gu, '$1')
            .toLowerCase()
            .replaceAll(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, '')
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
 * The Spotify album URL for an album request, or null so /play keeps its
 * normal track search. Only an album whose whole name is in the request
 * counts, preferring one by an artist the request also names.
 */
export async function resolveAlbumIntent(
    query: string,
): Promise<string | null> {
    const albumQuery = albumIntentQuery(query)
    if (!albumQuery) return null
    try {
        const queryWords = new Set(wordsOf(albumQuery))
        const within = (value: string) => {
            const words = wordsOf(value)
            return words.length > 0 && words.every((w) => queryWords.has(w))
        }
        const requested = wordsOf(albumQuery).join(' ')
        const matches = (await searchSpotifyAlbums(albumQuery, 20)).filter(
            (album) =>
                within(album.name) &&
                // A self-titled album only for the artist's name alone:
                // "album esquinas anavitória" is not "ANAVITÓRIA".
                (wordsOf(album.name).join(' ') !==
                    wordsOf(album.artist).join(' ') ||
                    wordsOf(album.name).join(' ') === requested),
        )
        const best = matches.find((album) => within(album.artist)) ?? matches[0]
        return best?.url ?? null
    } catch {
        return null
    }
}
