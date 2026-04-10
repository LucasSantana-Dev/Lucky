import { Player } from 'discord-player'
import type { Track } from 'discord-player'
import { DefaultExtractors } from '@discord-player/extractor'
import * as playdl from 'play-dl'
import type { Readable } from 'stream'
import type { CustomClient } from '../../types'
import { errorLog, infoLog, warnLog, debugLog } from '@lucky/shared/utils'
import {
    cleanTitle,
    cleanAuthor,
    cleanSearchQuery,
} from '../../utils/music/searchQueryCleaner'

type CreatePlayerParams = {
    client: CustomClient
}

export const createPlayer = ({ client }: CreatePlayerParams): Player => {
    try {
        infoLog({ message: 'Creating player...' })

        const player = new Player(client)
        registerExtractors(player)

        player.setMaxListeners(20)

        infoLog({ message: 'Player created successfully' })
        return player
    } catch (error) {
        errorLog({ message: 'Error creating player:', error })
        throw error
    }
}

const registerExtractors = (player: Player): void => {
    void player.extractors.loadMulti(DefaultExtractors)

    void initPlayDlAndRegisterYoutubei(player)

    infoLog({
        message:
            'Extractors: SoundCloud, Spotify, Apple Music, Vimeo, Attachments',
    })
}

const initPlayDlAndRegisterYoutubei = async (player: Player): Promise<void> => {
    await initPlayDlSoundCloud()
    await loadYoutubeExtractor(player)
}

const initPlayDlSoundCloud = async (): Promise<void> => {
    try {
        const clientId = await playdl.getFreeClientID()
        await playdl.setToken({ soundcloud: { client_id: clientId } })
        infoLog({ message: 'play-dl: SoundCloud client ID initialized' })
    } catch (error) {
        warnLog({
            message:
                'play-dl: SoundCloud client ID init failed — bridge may not stream',
            error,
        })
    }
}

const loadYoutubeExtractor = async (player: Player): Promise<void> => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod = (await import('discord-player-youtubei')) as any

        // v3 renamed YoutubeiExtractor → YoutubeExtractor
        const YoutubeExtractor = mod.YoutubeExtractor ?? mod.YoutubeiExtractor
        if (!YoutubeExtractor) {
            warnLog({
                message:
                    'discord-player-youtubei: no extractor export found — skipping YouTube extractor',
            })
            return
        }

        const registered = await player.extractors.register(YoutubeExtractor, {
            createStream: createResilientStream,
        })

        if (!registered) {
            warnLog({
                message:
                    'YoutubeExtractor registration returned null — activation may have failed',
            })
            return
        }

        infoLog({
            message:
                'Registered YoutubeExtractor (SoundCloud bridge + YouTube fallback)',
        })
    } catch (error) {
        warnLog({
            message: 'YouTube extractor unavailable. Using SoundCloud/Spotify.',
            error,
        })
    }
}

/**
 * Bridge fallback chain (discord-player-youtubei v3 createStream signature).
 *
 * Priority: YouTube direct → SoundCloud (full query) → SoundCloud (title only).
 *
 * YouTube direct is attempted first since the track always carries its source
 * URL and play-dl can stream it independently of the extractor. SoundCloud
 * search is the fallback for tracks blocked by YouTube bot-detection.
 */
export async function createResilientStream(
    track: Pick<Track, 'title' | 'author' | 'duration' | 'url'>,
    _ext?: unknown,
): Promise<Readable> {
    const cleanedTitle = cleanTitle(track.title)
    const cleanedAuthor = cleanAuthor(track.author)

    debugLog({
        message: 'Bridge: resolving stream',
        data: {
            title: track.title,
            author: track.author,
            cleanedTitle,
            cleanedAuthor,
            hasUrl: Boolean(track.url),
        },
    })

    if (track.url) {
        try {
            const direct = await playdl.stream(track.url)
            infoLog({
                message: 'Bridge: streamed directly from source URL',
                data: { url: track.url, title: cleanedTitle || track.title },
            })
            return direct.stream
        } catch (directError) {
            debugLog({
                message:
                    'Bridge: direct stream failed, falling back to SoundCloud',
                data: {
                    error: (directError as Error).message,
                    cleanedTitle,
                },
            })
        }
    }

    try {
        return await streamViaSoundCloud(
            cleanSearchQuery(cleanedTitle, cleanedAuthor),
            track.duration,
        )
    } catch (primaryError) {
        debugLog({
            message:
                'Bridge: SoundCloud primary search failed, retrying with title only',
            data: {
                error: (primaryError as Error).message,
                cleanedTitle,
            },
        })
    }

    try {
        return await streamViaSoundCloud(cleanedTitle, track.duration)
    } catch (titleOnlyError) {
        errorLog({
            message: 'Bridge: all stages exhausted',
            error: titleOnlyError,
            data: { title: track.title },
        })
    }

    throw new Error(`Bridge exhausted: no stream for "${track.title}"`)
}

/**
 * Search SoundCloud for the given query and return a streaming handle for the
 * first result whose title and duration validate. Exported for testing.
 */
export async function streamViaSoundCloud(
    query: string,
    trackDuration?: string,
): Promise<Readable> {
    if (!query.trim()) {
        throw new Error('SoundCloud: empty query')
    }

    const results = await playdl.search(query, {
        source: { soundcloud: 'tracks' },
        limit: 5,
    })

    if (!results.length) {
        throw new Error(`SoundCloud: no results for "${query}"`)
    }

    const match = findMatchingSoundCloudResult(query, trackDuration, results)
    if (!match) {
        throw new Error(
            `SoundCloud: no validated match for "${query}" (title/duration mismatch)`,
        )
    }

    const scStream = await playdl.stream(match.url)
    return scStream.stream
}

type SoundCloudSearchResult = {
    name: string
    url: string
    durationInSec?: number
}

/**
 * Pure match logic, exported so tests can cover it without spinning up play-dl.
 *
 * Matches a candidate result iff every non-empty token in the cleaned query
 * appears in the normalized result name. This is tighter than the previous
 * symmetric substring check, which allowed short candidate names (e.g. a
 * 4-character remix title) to match a long query because
 * `queryNorm.includes(resultNorm)` was true.
 */
export function findMatchingSoundCloudResult(
    query: string,
    trackDuration: string | undefined,
    results: readonly SoundCloudSearchResult[],
): SoundCloudSearchResult | undefined {
    const queryNorm = normalizeForMatch(query)
    if (!queryNorm) return undefined

    const tokens = queryNorm.split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return undefined

    const trackSec = parseDurationString(trackDuration)

    return results.find((result) => {
        const resultNorm = normalizeForMatch(result.name)
        if (!resultNorm) return false

        const titleMatch = tokens.every((token) => resultNorm.includes(token))
        if (!titleMatch) return false

        if (trackSec === null || !result.durationInSec) return true
        return Math.abs(result.durationInSec - trackSec) <= 15
    })
}

function normalizeForMatch(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
}

export function parseDurationString(duration?: string): number | null {
    if (!duration) return null
    const parts = duration.split(':').map(Number)
    if (parts.some(Number.isNaN)) return null
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return null
}
