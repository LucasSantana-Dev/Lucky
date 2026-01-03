import { youtubePatterns } from '../../../config/titlePatterns'
import type { QueryTypeDetection } from './types'

/**
 * Query type detection utilities
 */
export class QueryDetector {
    /**
     * Detects the type of query (YouTube, Spotify, search term)
     */
    static detectQueryType(query: string): QueryTypeDetection {
        if (youtubePatterns.some((pattern) => pattern.test(query))) {
            return { type: 'youtube', confidence: 0.8, patterns: [] }
        }
        // if (youtubePatterns.playlist.test(query)) {
        //   return { type: "youtube_playlist" }
        // }
        // if (spotifyPatterns.track.test(query)) {
        //   return { type: "spotify_track" }
        // }
        // if (spotifyPatterns.playlist.test(query)) {
        //   return { type: "spotify_playlist" }
        // }
        // if (spotifyPatterns.album.test(query)) {
        //   return { type: "spotify_album" }
        // }
        return { type: 'search', confidence: 0.5, patterns: [] }
    }

    /**
     * Checks if a query is a YouTube URL
     */
    static isYouTubeQuery(query: string): boolean {
        return youtubePatterns.some((pattern) => pattern.test(query))
    }

    /**
     * Checks if a query is a Spotify URL
     */
    static isSpotifyQuery(_query: string): boolean {
        // Spotify patterns not available, return false for now
        return false
    }

    /**
     * Checks if a query is a playlist URL
     */
    static isPlaylistQuery(query: string): boolean {
        // Only check YouTube patterns for now
        return youtubePatterns.some((pattern) => pattern.test(query))
    }

    /**
     * Extracts video ID from YouTube URL
     */
    static extractYouTubeVideoId(query: string): string | null {
        const match = query.match(
            /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
        )
        return match ? match[1] : null
    }

    /**
     * Extracts playlist ID from YouTube URL
     */
    static extractYouTubePlaylistId(query: string): string | null {
        const match = query.match(/[?&]list=([^&\n?#]+)/)
        return match ? match[1] : null
    }

    /**
     * Extracts track ID from Spotify URL
     */
    static extractSpotifyTrackId(query: string): string | null {
        const match = query.match(/spotify\.com\/track\/([^&\n?#]+)/)
        return match ? match[1] : null
    }

    /**
     * Extracts playlist ID from Spotify URL
     */
    static extractSpotifyPlaylistId(query: string): string | null {
        const match = query.match(/spotify\.com\/playlist\/([^&\n?#]+)/)
        return match ? match[1] : null
    }

    /**
     * Extracts album ID from Spotify URL
     */
    static extractSpotifyAlbumId(query: string): string | null {
        const match = query.match(/spotify\.com\/album\/([^&\n?#]+)/)
        return match ? match[1] : null
    }
}
