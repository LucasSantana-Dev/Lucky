import { QueryType, type Track, type GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import { debugLog } from '@lucky/shared/utils'
import { logAndSwallow } from '@lucky/shared/utils/error'
import { spotifyLinkService } from '@lucky/shared/services'
import {
    searchSpotifyTrack,
    getArtistGenres,
} from '../../../spotify/spotifyApi'
import { getUserSpotifySeeds } from '../../../spotify/spotifyUserSeeds'
import {
    cleanTitle,
    cleanAuthor,
    extractSongCore,
    cleanSearchQuery,
} from '../../../utils/music/searchQueryCleaner'
import type { AutoplayContext } from './autoplayContext'
import {
    normalizeTrackKey,
    normalizeText,
    extractSpotifyTrackId,
} from './scoringUtils'
import {
    shouldIncludeCandidate,
    upsertScoredCandidate,
} from './candidateContracts'
import { calculateRecommendationScore } from './candidateScorer'
import { createArtistTagFetcher } from './artistTagCache'
import type { ScoredTrack } from './diversitySelector'
import type { AutoplayAuditCollector } from './autoplayAudit'

const MAX_AUTOPLAY_DURATION_MS = 7 * 60 * 1000
const SEARCH_RESULTS_LIMIT = 8

export async function searchSeedCandidates(
    queue: GuildQueue,
    seed: Track,
    requestedBy: User | null,
): Promise<Track[]> {
    const baseQuery = cleanSearchQuery(seed.title, seed.author)

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

    try {
        const searchResult = await queue.player.search(spotifyQuery, {
            requestedBy: requestedBy ?? undefined,
            searchEngine: QueryType.SPOTIFY_SEARCH,
        })

        const tracks = searchResult.tracks
            .filter(
                (t) =>
                    !t.durationMS || t.durationMS <= MAX_AUTOPLAY_DURATION_MS,
            )
            .slice(0, SEARCH_RESULTS_LIMIT)

        if (tracks.length === 0) {
            debugLog({
                message: 'Autoplay: seed search returned 0 results',
                data: { spotifyQuery },
            })
        }

        return tracks
    } catch (error) {
        debugLog({
            message: 'Autoplay: seed search failed',
            data: { spotifyQuery, error: String(error) },
        })
        return []
    }
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
