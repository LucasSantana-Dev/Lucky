import type { Track, GuildQueue } from 'discord-player'
import type { SessionMood } from './sessionMood'
import type { ArtistTagFetcher } from './artistTagCache'

/**
 * Universal context for autoplay candidate collection.
 * Groups 15+ parameters shared across all collector functions to reduce
 * function signature complexity and improve maintainability.
 */
export interface AutoplayContext {
    queue: GuildQueue
    excludedUrls: Set<string>
    excludedKeys: Set<string>
    dislikedWeights: Map<string, number>
    likedWeights: Map<string, number>
    preferredArtistKeys: Set<string>
    blockedArtistKeys: Set<string>
    currentTrack: Track
    recentArtists: Set<string>
    autoplayMode: 'similar' | 'discover' | 'popular'
    artistFrequency: Map<string, number>
    implicitDislikeKeys: Set<string>
    implicitLikeKeys: Set<string>
    sessionMood: SessionMood | null
    genreContext: {
        getArtistTags?: ArtistTagFetcher
        currentTrackTags?: string[]
        sessionGenreFamilies?: Set<string>
    }
}
