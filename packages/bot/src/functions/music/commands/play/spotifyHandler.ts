/**
 * Spotify track and playlist handlers
 */

import type { PlayCommandResult, PlayCommandOptions } from './types'
import { debugLog, errorLog } from '@lukbot/shared/utils'

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

export async function handleSpotifyTrack(
    query: string,
    user: PlayCommandOptions['user'],
    guildId: string,
    _channelId: string,
    player: PlayCommandOptions['player'],
): Promise<PlayCommandResult> {
    try {
        debugLog({
            message: `Handling Spotify track: ${query}`,
            data: { guildId, userId: user.id },
        })

        const searchQuery = buildSearchQueryFromSpotifyUrl(query)
        const searchResult = await player.search(searchQuery, {
            requestedBy: user,
        })

        if (!searchResult.hasTracks()) {
            return {
                success: false,
                error: 'No tracks found for this Spotify link. Try searching by song name instead.',
            }
        }

        const tracks = searchResult.tracks
        const firstTrack = tracks[0]

        debugLog({
            message: `Found track: ${firstTrack.title}`,
            data: { guildId },
        })

        return {
            success: true,
            tracks: [firstTrack],
            isPlaylist: false,
        }
    } catch (error) {
        errorLog({
            message: 'Error handling Spotify track:',
            error,
            data: { query, guildId, userId: user.id },
        })
        return {
            success: false,
            error: 'Failed to process Spotify track',
        }
    }
}

export async function handleSpotifyPlaylist(
    query: string,
    user: PlayCommandOptions['user'],
    guildId: string,
    _channelId: string,
    player: PlayCommandOptions['player'],
): Promise<PlayCommandResult> {
    try {
        debugLog({
            message: `Handling Spotify playlist: ${query}`,
            data: { guildId, userId: user.id },
        })

        const searchQuery = buildSearchQueryFromSpotifyUrl(query)
        const searchResult = await player.search(searchQuery, {
            requestedBy: user,
        })

        if (!searchResult.hasTracks()) {
            return {
                success: false,
                error: 'No tracks found for this Spotify playlist. Try searching by playlist name instead.',
            }
        }

        const tracks = searchResult.tracks
        const isPlaylist = searchResult.playlist !== null

        debugLog({
            message: `Found ${tracks.length} tracks from Spotify playlist`,
            data: { guildId, isPlaylist },
        })

        return {
            success: true,
            tracks,
            isPlaylist: isPlaylist || tracks.length > 1,
        }
    } catch (error) {
        errorLog({
            message: 'Error handling Spotify playlist:',
            error,
            data: { query, guildId, userId: user.id },
        })
        return {
            success: false,
            error: 'Failed to process Spotify playlist',
        }
    }
}
