import {
    QueryType,
    type Track,
    type GuildQueue,
} from 'discord-player'
import type { User } from 'discord.js'
import { debugLog, warnLog } from '@lucky/shared/utils'
import {
    cleanTitle,
    cleanAuthor,
    extractSongCore,
    cleanSearchQuery,
} from '../searchQueryCleaner'
import {
    normalizeText,
} from '../queueManipulation'

const MAX_AUTOPLAY_DURATION_MS = 7 * 60 * 1000
const SEARCH_RESULTS_LIMIT = 8
const QUERY_MODIFIERS = ['', 'similar', 'like', 'playlist', 'mix']

export async function searchSeedCandidates(
    queue: GuildQueue,
    seed: Track,
    requestedBy: User | null,
    replenishCount = 0,
): Promise<Track[]> {
    const baseQuery = cleanSearchQuery(seed.title, seed.author)
    const modifier = QUERY_MODIFIERS[replenishCount % QUERY_MODIFIERS.length]
    const query = modifier ? `${baseQuery} ${modifier}` : baseQuery

    const cleanedTitle = cleanTitle(seed.title)
    const cleanedAuthor = cleanAuthor(seed.author)
    const authorNorm = normalizeText(cleanedAuthor)
    const authorInTitle =
        authorNorm.length >= 3 &&
        normalizeText(cleanedTitle).includes(
            authorNorm.slice(0, Math.min(5, authorNorm.length)),
        )

    let spotifyBase: string
    if (authorInTitle) {
        spotifyBase = cleanedTitle
    } else {
        const songCore = extractSongCore(seed.title, seed.author)
        if (songCore) {
            const titleArtist = extractTitleArtistFromSong(
                cleanedTitle,
                songCore,
            )
            spotifyBase = `${songCore} ${titleArtist ?? cleanedAuthor}`.trim()
        } else {
            spotifyBase = baseQuery
        }
    }
    const spotifyQuery = spotifyBase

    const engines: QueryType[] = [
        QueryType.SPOTIFY_SEARCH,
        QueryType.YOUTUBE_SEARCH,
        QueryType.AUTO,
    ]

    for (const [idx, engine] of engines.entries()) {
        const engineQuery =
            engine === QueryType.SPOTIFY_SEARCH ? spotifyQuery : query
        try {
            const searchResult = await queue.player.search(engineQuery, {
                requestedBy: requestedBy ?? undefined,
                searchEngine: engine,
            })

            const tracks = searchResult.tracks
                .filter(
                    (t) =>
                        !t.durationMS ||
                        t.durationMS <= MAX_AUTOPLAY_DURATION_MS,
                )
                .slice(0, SEARCH_RESULTS_LIMIT)

            if (tracks.length > 0) {
                if (idx > 0) {
                    warnLog({
                        message:
                            'Autoplay: Spotify returned 0 results, using fallback',
                        data: {
                            fallbackEngine: engine,
                            spotifyQuery,
                            fallbackQuery: engineQuery,
                        },
                    })
                }
                return tracks
            }
            if (engine === QueryType.SPOTIFY_SEARCH) {
                debugLog({
                    message: 'Autoplay: Spotify search returned 0 results',
                    data: { spotifyQuery },
                })
            }
        } catch (error) {
            debugLog({
                message: 'Search failed for seed, trying next engine',
                data: { query: engineQuery, engine, error: String(error) },
            })
        }
    }

    return []
}

function extractTitleArtistFromSong(
    cleanedTitle: string,
    songCore: string,
): string | null {
    const normCore = normalizeText(songCore)
    const corePrefix = normCore.slice(0, Math.min(6, normCore.length))
    for (const sep of [' - ', ' – ', ' — ']) {
        const idx = cleanedTitle.indexOf(sep)
        if (idx < 2 || idx > 60) continue
        const left = cleanedTitle.slice(0, idx).trim()
        if (/[()[\]]/.test(left) || left.length < 2) continue
        const right = cleanedTitle.slice(idx + sep.length).trim()
        if (
            corePrefix.length >= 3 &&
            normalizeText(left).startsWith(corePrefix)
        ) {
            return right
        }
        return left
    }
    return null
}
