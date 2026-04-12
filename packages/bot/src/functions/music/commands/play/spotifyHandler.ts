/**
 * Spotify track and playlist handlers
 */

import type { PlayCommandResult, PlayCommandOptions } from './types'
import { debugLog, errorLog } from '@lucky/shared/utils'

function extractSpotifyTrackId(url: string): string | null {
    const trackMatch = url.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/)
    return trackMatch ? trackMatch[1] : null
}

function extractSpotifyPlaylistId(url: string): string | null {
    const playlistMatch = url.match(/spotify\.com\/playlist\/([a-zA-Z0-9]+)/)
    return playlistMatch ? playlistMatch[1] : null
}

function buildSearchQueryFromSpotifyUrl(url: string): string {
    const trackId = extractSpotifyTrackId(url)
    const playlistId = extractSpotifyPlaylistId(url)

    if (trackId || playlistId) {
        return url
    }

    const pathMatch = url.match(/spotify\.com\/([^?]+)/)
    if (pathMatch) {
        return url
    }

    return url
}

async function handleSpotifyUrl(
    query: string,
    user: PlayCommandOptions['user'],
    guildId: string,
    player: PlayCommandOptions['player'],
    isPlaylistQuery: boolean,
): Promise<PlayCommandResult> {
    try {
        const logType = isPlaylistQuery ? 'playlist' : 'track'
        debugLog({
            message: `Handling Spotify ${logType}: ${query}`,
            data: { guildId, userId: user.id },
        })

        const searchQuery = buildSearchQueryFromSpotifyUrl(query)
        const searchResult = await player.search(searchQuery, {
            requestedBy: user,
        })

        if (!searchResult.hasTracks()) {
            const errorMsg = isPlaylistQuery
                ? 'No tracks found for this Spotify playlist. Try searching by playlist name instead.'
                : 'No tracks found for this Spotify link. Try searching by song name instead.'
            return {
                success: false,
                error: errorMsg,
            }
        }

        const tracks = searchResult.tracks
        const trackInfo = isPlaylistQuery
            ? `Found ${tracks.length} tracks from Spotify playlist`
            : `Found track: ${tracks[0].title}`
        const isPlaylist = isPlaylistQuery
            ? searchResult.playlist !== null || tracks.length > 1
            : false

        debugLog({
            message: trackInfo,
            data: { guildId, isPlaylist },
        })

        return {
            success: true,
            tracks: isPlaylistQuery ? tracks : [tracks[0]],
            isPlaylist,
        }
    } catch (error) {
        const logType = isPlaylistQuery ? 'playlist' : 'track'
        errorLog({
            message: `Error handling Spotify ${logType}:`,
            error,
            data: { query, guildId, userId: user.id },
        })
        return {
            success: false,
            error: `Failed to process Spotify ${logType}`,
        }
    }
}

export async function handleSpotifyTrack(
    query: string,
    user: PlayCommandOptions['user'],
    guildId: string,
    _channelId: string,
    player: PlayCommandOptions['player'],
): Promise<PlayCommandResult> {
    return handleSpotifyUrl(query, user, guildId, player, false)
}

export async function handleSpotifyPlaylist(
    query: string,
    user: PlayCommandOptions['user'],
    guildId: string,
    _channelId: string,
    player: PlayCommandOptions['player'],
): Promise<PlayCommandResult> {
    return handleSpotifyUrl(query, user, guildId, player, true)
}
