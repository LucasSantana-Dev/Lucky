/**
 * YouTube and Spotify search handlers
 */

import { QueryType } from 'discord-player'
import type { PlayCommandResult, PlayCommandOptions } from './types'
import { debugLog, errorLog, warnLog } from '@lucky/shared/utils'

/**
 * Search Spotify first. Returns success=false (no error thrown) when no
 * results are found so the caller can silently fall through to YouTube.
 */
export async function handleSpotifySearch(
    query: string,
    user: PlayCommandOptions['user'],
    guildId: string,
    _channelId: string,
    player: PlayCommandOptions['player'],
): Promise<PlayCommandResult> {
    try {
        const searchResult = await player.search(query, {
            requestedBy: user,
            searchEngine: QueryType.SPOTIFY_SEARCH,
        })

        if (!searchResult.hasTracks()) {
            return { success: false, error: '' }
        }

        debugLog({
            message: `Spotify search found ${searchResult.tracks.length} tracks`,
            data: { guildId, query },
        })

        return { success: true, tracks: searchResult.tracks, isPlaylist: false }
    } catch (error) {
        warnLog({
            message: 'Spotify search failed, falling back to YouTube',
            data: { query, guildId, error: (error as Error).message },
        })
        return { success: false, error: '' }
    }
}

export async function handleYouTubeSearch(
    query: string,
    user: PlayCommandOptions['user'],
    guildId: string,
    _channelId: string,
    player: PlayCommandOptions['player'],
): Promise<PlayCommandResult> {
    try {
        debugLog({
            message: `Handling YouTube search: ${query}`,
            data: { guildId, userId: user.id },
        })

        const searchResult = await player.search(query, {
            requestedBy: user,
        })

        if (!searchResult.hasTracks()) {
            return {
                success: false,
                error: 'No tracks found for your search',
            }
        }

        const tracks = searchResult.tracks
        const isPlaylist = searchResult.playlist !== null

        debugLog({
            message: `Found ${tracks.length} tracks`,
            data: { guildId, isPlaylist },
        })

        return {
            success: true,
            tracks,
            isPlaylist,
        }
    } catch (error) {
        errorLog({
            message: 'Error handling YouTube search:',
            error,
            data: { query, guildId, userId: user.id },
        })
        return {
            success: false,
            error: 'Failed to process YouTube search',
        }
    }
}

export async function handleYouTubePlaylist(
    query: string,
    user: PlayCommandOptions['user'],
    guildId: string,
    _channelId: string,
    player: PlayCommandOptions['player'],
): Promise<PlayCommandResult> {
    try {
        debugLog({
            message: `Handling YouTube playlist: ${query}`,
            data: { guildId, userId: user.id },
        })

        const searchResult = await player.search(query, {
            requestedBy: user,
        })

        if (!searchResult.hasTracks()) {
            return {
                success: false,
                error: 'No tracks found in playlist',
            }
        }

        const tracks = searchResult.tracks
        const isPlaylist = searchResult.playlist !== null

        if (!isPlaylist) {
            return {
                success: false,
                error: 'The provided URL is not a playlist',
            }
        }

        debugLog({
            message: `Found playlist with ${tracks.length} tracks`,
            data: { guildId },
        })

        return {
            success: true,
            tracks,
            isPlaylist: true,
        }
    } catch (error) {
        errorLog({
            message: 'Error handling YouTube playlist:',
            error,
            data: { query, guildId, userId: user.id },
        })
        return {
            success: false,
            error: 'Failed to process YouTube playlist',
        }
    }
}
