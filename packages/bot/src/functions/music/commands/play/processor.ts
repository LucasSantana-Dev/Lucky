import { debugLog, errorLog } from '@lukbot/shared/utils'
import { detectQueryType } from './queryDetector'
import { handleSpotifyTrack, handleSpotifyPlaylist } from './spotifyHandler'
import { handleYouTubePlaylist, handleYouTubeSearch } from './youtubeHandler'
import { manageQueue } from './queueManager'
import type { PlayCommandOptions, PlayCommandResult } from './types'

/**
 * Play command processor for handling different query types
 */
export class PlayCommandProcessor {
    async processPlayCommand(
        options: PlayCommandOptions,
    ): Promise<PlayCommandResult> {
        try {
            debugLog({ message: `Processing play command: ${options.query}` })

            const queryType = detectQueryType(options.query)
            let result: PlayCommandResult

            switch (queryType) {
                case 'spotify':
                    result = await this.handleSpotifyQuery(options)
                    break
                case 'youtube':
                    result = await this.handleYouTubeQuery(options)
                    break
                case 'search':
                    result = await this.handleSearchQuery(options)
                    break
                case 'url':
                    result = await this.handleUrlQuery(options)
                    break
                default:
                    result = {
                        success: false,
                        error: 'Unsupported query type',
                    }
            }

            if (result.success && result.tracks) {
                await manageQueue(options, result.tracks, result.isPlaylist)
            }

            return result
        } catch (error) {
            errorLog({ message: 'Play command processing error:', error })
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    private async handleSpotifyQuery(
        options: PlayCommandOptions,
    ): Promise<PlayCommandResult> {
        const { query, user, guildId, channelId } = options

        if (query.includes('playlist')) {
            return handleSpotifyPlaylist(query, user, guildId, channelId)
        } else {
            return handleSpotifyTrack(query, user, guildId, channelId)
        }
    }

    private async handleYouTubeQuery(
        options: PlayCommandOptions,
    ): Promise<PlayCommandResult> {
        const { query, user, guildId, channelId } = options

        if (query.includes('playlist')) {
            return handleYouTubePlaylist(query, user, guildId, channelId)
        } else {
            return handleYouTubeSearch(query, user, guildId, channelId)
        }
    }

    private async handleSearchQuery(
        options: PlayCommandOptions,
    ): Promise<PlayCommandResult> {
        const { query, user, guildId, channelId } = options

        // Default to YouTube search for general queries
        return handleYouTubeSearch(query, user, guildId, channelId)
    }

    private async handleUrlQuery(
        options: PlayCommandOptions,
    ): Promise<PlayCommandResult> {
        const { query, user, guildId, channelId } = options

        // Try to determine the platform from the URL
        if (query.includes('youtube.com') || query.includes('youtu.be')) {
            return handleYouTubeSearch(query, user, guildId, channelId)
        } else if (query.includes('spotify.com')) {
            return handleSpotifyTrack(query, user, guildId, channelId)
        } else {
            // Default to YouTube search for unknown URLs
            return handleYouTubeSearch(query, user, guildId, channelId)
        }
    }
}
