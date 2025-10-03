import type { Track, GuildQueue, SearchQueryType } from "discord-player"
import { QueryType } from "discord-player"
import type { User } from "discord.js"
import { debugLog, errorLog } from "../general/log"
import type { TrackMetadata } from "./duplicateDetection"
import { isDuplicateTrack, getArtistInfo } from "./duplicateDetection"
import { youtubePatterns, spotifyPatterns } from "../../config/titlePatterns"
import { enhancedSearch } from "./enhancedSearch"
import {
    logYouTubeError,
    isRecoverableYouTubeError,
} from "./youtubeErrorHandler"

/**
 * Build a search query based on track metadata
 */
function buildRelatedQuery(metadata: TrackMetadata): string {
    const queryParts: string[] = []

    // Always include up to 2 genre tags if available
    const genreTags = metadata.tags.filter((tag) =>
        [
            "rock",
            "pop",
            "jazz",
            "blues",
            "country",
            "folk",
            "rap",
            "hip hop",
            "metal",
            "classical",
            "electronic",
            "dance",
            "reggae",
            "samba",
            "forro",
            "sertanejo",
            "mpb",
            "pagode",
            "funk",
            "axé",
            "gospel",
        ].includes(tag),
    )
    if (genreTags.length > 0) {
        queryParts.push(...genreTags.slice(0, 2))
    }

    // 55% chance to include artist if present
    if (metadata.artist && Math.random() < 0.55) {
        queryParts.unshift(metadata.artist) // put artist at the start
    }

    // Add "ao vivo" or "acustico" if present in tags
    if (metadata.tags.includes("ao vivo")) {
        queryParts.push("ao vivo")
    } else if (metadata.tags.includes("acustico")) {
        queryParts.push("acustico")
    }

    // Build the final query
    return queryParts.join(" ")
}

/**
 * Search for tracks based on a query
 */
export async function searchTracks(
    queue: GuildQueue,
    query: string,
    searchEngine: SearchQueryType = QueryType.YOUTUBE_SEARCH,
    requestedBy?: User,
): Promise<Track[]> {
    try {
        debugLog({ message: `Searching for tracks with query: ${query}` })

        // Use enhanced search for better error handling
        const requestedByUser =
            requestedBy ??
            (queue.metadata as { requestedBy?: User }).requestedBy
        if (!requestedByUser) {
            debugLog({ message: "No requestedBy user available for search" })
            return []
        }

        const enhancedResult = await enhancedSearch(queue.player, {
            query,
            requestedBy: requestedByUser,
            preferredEngine: searchEngine as QueryType,
            maxRetries: 2,
            enableFallbacks: true,
        })

        if (enhancedResult.success && enhancedResult.result) {
            debugLog({
                message: `Found ${enhancedResult.result.tracks.length} tracks`,
                data: { usedFallback: enhancedResult.usedFallback },
            })
            return enhancedResult.result.tracks
        }

        debugLog({ message: "No tracks found" })
        return []
    } catch (error) {
        const errorObj = error as Error

        // Log YouTube-specific errors with enhanced logging
        if (isRecoverableYouTubeError(errorObj)) {
            logYouTubeError(errorObj, "searchTracks")
        } else {
            errorLog({
                message: "Error searching for tracks:",
                error: errorObj,
            })
        }

        return []
    }
}

/**
 * Filter tracks to remove duplicates
 */
export async function filterDuplicateTracks(
    tracks: Track[],
    guildId: string,
    currentTrackIds: Set<string>,
): Promise<Track[]> {
    try {
        debugLog({
            message: `Filtering ${tracks.length} tracks for duplicates`,
        })

        // Filter out duplicates using async function
        const filteredTracks: Track[] = []
        for (const track of tracks) {
            const isDuplicate = await isDuplicateTrack(
                track,
                guildId,
                currentTrackIds,
            )
            if (!isDuplicate) {
                filteredTracks.push(track)
            }
        }

        debugLog({
            message: `Filtered to ${filteredTracks.length} non-duplicate tracks`,
        })
        return filteredTracks
    } catch (error) {
        errorLog({ message: "Error filtering duplicate tracks:", error })
        return []
    }
}

/**
 * Sort tracks by view count
 */
export function sortTracksByViews(tracks: Track[]): Track[] {
    try {
        debugLog({ message: `Sorting ${tracks.length} tracks by view count` })

        // Sort by view count (if available)
        return tracks.sort((a, b) => {
            const aViews = a.views || 0
            const bViews = b.views || 0
            return bViews - aViews
        })
    } catch (error) {
        errorLog({ message: "Error sorting tracks by views:", error })
        return tracks
    }
}

/**
 * Search for related tracks based on metadata
 */
export async function searchRelatedTracks(
    queue: GuildQueue,
    trackId: string,
    requestedBy?: unknown,
): Promise<Track[]> {
    try {
        // Get track metadata
        const metadata = await getArtistInfo(trackId)

        let searchQuery: string

        if (!metadata) {
            debugLog({
                message: "No metadata found for track, using fallback search",
            })
            // Fallback: use the current track's title and author for search
            const currentTrack = queue.currentTrack
            if (!currentTrack) {
                debugLog({
                    message: "No current track available for fallback search",
                })
                return []
            }

            // Create a simple search query from the current track
            const titleWords = currentTrack.title
                .toLowerCase()
                .replace(/[^\w\s]/g, " ")
                .split(/\s+/)
                .filter((word) => word.length > 3)
                .slice(0, 3) // Take first 3 meaningful words

            const author = currentTrack.author
                ? currentTrack.author.split(" ")[0]
                : ""

            searchQuery = [...titleWords, author].filter(Boolean).join(" ")
            debugLog({
                message: "Using fallback search query",
                data: { searchQuery },
            })
        } else {
            debugLog({
                message: "Searching for related tracks",
                data: { metadata },
            })

            // Build search query from metadata
            searchQuery = buildRelatedQuery(metadata)
        }

        // Search for related tracks using enhanced search
        const enhancedResult = await enhancedSearch(queue.player, {
            query: searchQuery,
            requestedBy: (requestedBy ??
                (queue.metadata as { requestedBy?: User }).requestedBy) as User,
            preferredEngine: QueryType.YOUTUBE_SEARCH,
            maxRetries: 2,
            enableFallbacks: true,
        })

        if (!enhancedResult.success || !enhancedResult.result?.tracks.length) {
            debugLog({
                message: "No related tracks found",
                data: { searchQuery },
            })
            return []
        }

        const searchResult = enhancedResult.result

        // Sort tracks by relevance and views (simplified for now)
        const sortedTracks = searchResult.tracks.sort((a, b) => {
            // Sort by views for now (can be enhanced later with metadata)
            return (b.views || 0) - (a.views || 0)
        })

        // Filter out tracks that match any YouTube or Spotify variant pattern in the title
        const filteredTracks = sortedTracks.filter((track) => {
            const title = track.title.toLowerCase()
            // Exclude if matches any YouTube or Spotify variant pattern
            const isVariant =
                youtubePatterns.some((pattern) => pattern.test(title)) ||
                spotifyPatterns.some((pattern) => pattern.test(title))
            return !isVariant
        })

        return filteredTracks
    } catch (error) {
        errorLog({ message: "Error searching for related tracks:", error })
        return []
    }
}

/**
 * Get current track IDs from a queue
 */
export function getCurrentTrackIds(queue: GuildQueue): Set<string> {
    const currentTrackIds = new Set<string>()

    // Add current track ID
    if (queue.currentTrack?.id) {
        currentTrackIds.add(queue.currentTrack.id)
    }

    // Add IDs of tracks in the queue
    const queueTracks = queue.tracks.toArray()
    queueTracks.forEach((track) => {
        if (track.id) {
            currentTrackIds.add(track.id)
        }
    })

    return currentTrackIds
}
