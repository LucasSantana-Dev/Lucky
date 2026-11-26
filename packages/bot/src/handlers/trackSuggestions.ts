import { getSpotifyClientToken, searchSpotifyTracks } from '@lucky/shared/utils'

type TrackMatches = Awaited<ReturnType<typeof searchSpotifyTracks>>
export type TrackChoice = { name: string; value: string }

const CACHE_TTL_MS = 60_000
const CACHE_MAX = 200
// Discord drops an autocomplete answer after 3 seconds.
const LOOKUP_TIMEOUT_MS = 2500
const MIN_TYPED = 3
const MAX_CHOICES = 10
const CHOICE_NAME_LIMIT = 100

const cache = new Map<string, { tracks: TrackMatches; expiresAt: number }>()

/** Test helper: forget cached suggestions. */
export function resetTrackSuggestions(): void {
    cache.clear()
}

async function lookup(search: string): Promise<TrackMatches> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const matches = async (): Promise<TrackMatches> => {
        const accessToken = await getSpotifyClientToken()
        if (!accessToken) return []
        return searchSpotifyTracks(accessToken, search, MAX_CHOICES)
    }
    return Promise.race([
        matches(),
        new Promise<[]>((resolve) => {
            timer = setTimeout(() => resolve([]), LOOKUP_TIMEOUT_MS)
        }),
    ]).finally(() => clearTimeout(timer))
}

/**
 * Choices for the `/search` query option: Spotify tracks matching what was
 * typed, each valued with its track URL so the command plays exactly the one
 * picked. A pasted link or fewer than three letters gets no choices, and so
 * does a slow or failed lookup, which leaves the typed text usable as is.
 */
export async function suggestTracks(typed: string): Promise<TrackChoice[]> {
    const search = typed.trim()
    if (search.length < MIN_TYPED || /^https?:\/\//i.test(search)) return []

    const key = search.toLowerCase().replace(/\s+/g, ' ')
    const cached = cache.get(key)
    let tracks: TrackMatches
    if (cached && cached.expiresAt > Date.now()) {
        tracks = cached.tracks
    } else {
        tracks = await lookup(search)
        // An empty answer may be a timeout or a failed lookup, so it is
        // asked again next time.
        if (tracks.length > 0) {
            cache.delete(key)
            if (cache.size >= CACHE_MAX) {
                const oldest = cache.keys().next().value
                if (oldest !== undefined) cache.delete(oldest)
            }
            cache.set(key, { tracks, expiresAt: Date.now() + CACHE_TTL_MS })
        }
    }

    const seen = new Set<string>()
    const choices: TrackChoice[] = []
    for (const track of tracks) {
        if (seen.has(track.url)) continue
        seen.add(track.url)
        choices.push({
            name: `${track.name}, ${track.artist}`.slice(0, CHOICE_NAME_LIMIT),
            value: track.url,
        })
    }
    return choices
}
