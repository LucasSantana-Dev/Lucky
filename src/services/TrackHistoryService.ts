import type { Track } from "discord-player"
import { redisClient } from "../config/redis"
import { debugLog, errorLog } from "../utils/general/log"

export type TrackHistoryEntry = {
    url: string
    title: string
    author: string
    thumbnail?: string
    timestamp: number
    id?: string
}

export type TrackMetadata = {
    artist: string
    genre?: string
    tags: string[]
    views: number
}

class TrackHistoryService {
    private readonly MAX_HISTORY_SIZE = 50
    private readonly TRACK_HISTORY_TTL = 7 * 24 * 60 * 60 // 7 days in seconds
    private readonly METADATA_TTL = 30 * 24 * 60 * 60 // 30 days in seconds

    private getHistoryKey(guildId: string): string {
        return `track_history:${guildId}`
    }

    private getTrackIdsKey(guildId: string): string {
        return `track_ids:${guildId}`
    }

    private getLastTrackKey(guildId: string): string {
        return `last_track:${guildId}`
    }

    private getMetadataKey(trackId: string): string {
        return `track_metadata:${trackId}`
    }

    async addTrackToHistory(track: Track, guildId: string): Promise<void> {
        try {
            const historyKey = this.getHistoryKey(guildId)
            const trackIdsKey = this.getTrackIdsKey(guildId)
            const lastTrackKey = this.getLastTrackKey(guildId)

            // Create history entry
            const historyEntry: TrackHistoryEntry = {
                url: track.url,
                title: track.title,
                author: track.author,
                thumbnail: track.thumbnail,
                timestamp: Date.now(),
                id: track.id,
            }

            // Get current history
            const currentHistory = await this.getGuildHistory(guildId)

            // Add new track to beginning of history
            const updatedHistory = [historyEntry, ...currentHistory].slice(
                0,
                this.MAX_HISTORY_SIZE,
            )

            // Store updated history
            await redisClient.set(
                historyKey,
                JSON.stringify(updatedHistory),
                this.TRACK_HISTORY_TTL,
            )

            // Add track ID to set for fast duplicate checking
            if (track.id) {
                const trackIds = await this.getTrackIds(guildId)
                trackIds.add(track.id)
                await redisClient.set(
                    trackIdsKey,
                    JSON.stringify(Array.from(trackIds)),
                    this.TRACK_HISTORY_TTL,
                )

                // Store track metadata for autoplay
                const metadata: TrackMetadata = {
                    artist: track.author,
                    tags: this.extractTags(track),
                    views: track.views || 0,
                }
                await redisClient.set(
                    this.getMetadataKey(track.id),
                    JSON.stringify(metadata),
                    this.METADATA_TTL,
                )
            }

            // Store last played track
            await redisClient.set(
                lastTrackKey,
                JSON.stringify(historyEntry),
                this.TRACK_HISTORY_TTL,
            )

            debugLog({
                message: `Added track "${track.title}" to Redis history for guild ${guildId}`,
            })
        } catch (error) {
            errorLog({ message: "Error adding track to Redis history:", error })
        }
    }

    async getGuildHistory(guildId: string): Promise<TrackHistoryEntry[]> {
        try {
            const historyKey = this.getHistoryKey(guildId)
            const historyData = await redisClient.get(historyKey)

            if (!historyData) {
                return []
            }

            return JSON.parse(historyData) as TrackHistoryEntry[]
        } catch (error) {
            errorLog({
                message: "Error getting guild history from Redis:",
                error,
            })
            return []
        }
    }

    /**
     * Get track IDs for a guild (for duplicate checking)
     */
    async getTrackIds(guildId: string): Promise<Set<string>> {
        try {
            const trackIdsKey = this.getTrackIdsKey(guildId)
            const trackIdsData = await redisClient.get(trackIdsKey)

            if (!trackIdsData) {
                return new Set()
            }

            const trackIdsArray = JSON.parse(trackIdsData) as string[]
            return new Set(trackIdsArray)
        } catch (error) {
            errorLog({ message: "Error getting track IDs from Redis:", error })
            return new Set()
        }
    }

    /**
     * Get last played track for a guild
     */
    async getLastPlayedTrack(
        guildId: string,
    ): Promise<TrackHistoryEntry | null> {
        try {
            const lastTrackKey = this.getLastTrackKey(guildId)
            const lastTrackData = await redisClient.get(lastTrackKey)

            if (!lastTrackData) {
                return null
            }

            return JSON.parse(lastTrackData) as TrackHistoryEntry
        } catch (error) {
            errorLog({
                message: "Error getting last played track from Redis:",
                error,
            })
            return null
        }
    }

    /**
     * Get track metadata
     */
    async getTrackMetadata(trackId: string): Promise<TrackMetadata | null> {
        try {
            const metadataKey = this.getMetadataKey(trackId)
            const metadataData = await redisClient.get(metadataKey)

            if (!metadataData) {
                return null
            }

            return JSON.parse(metadataData) as TrackMetadata
        } catch (error) {
            errorLog({
                message: "Error getting track metadata from Redis:",
                error,
            })
            return null
        }
    }

    /**
     * Check if a track is a duplicate
     */
    async isDuplicateTrack(
        track: Track,
        guildId: string,
        currentTrackIds: Set<string>,
    ): Promise<boolean> {
        try {
            // Skip tracks without IDs
            if (!track.id) return true

            // Check if track ID is in the current queue
            if (currentTrackIds.has(track.id)) return true

            // Check if track ID is in the history
            const trackIds = await this.getTrackIds(guildId)
            if (trackIds.has(track.id)) return true

            // Check if track URL is in the recently played tracks
            const history = await this.getGuildHistory(guildId)
            if (history.some((t) => t.url === track.url)) return true

            // Check title similarity
            const cleanedNewTitle = this.cleanTitle(track.title)
            const isTitleSimilar = history.some((t) => {
                const cleanedHistoryTitle = this.cleanTitle(t.title)

                // Skip very short titles
                if (
                    cleanedNewTitle.length < 5 ||
                    cleanedHistoryTitle.length < 5
                )
                    return false

                // Calculate similarity
                const similarity = this.calculateSimilarity(
                    cleanedNewTitle,
                    cleanedHistoryTitle,
                )
                return similarity > 0.8 // 80% similarity threshold
            })

            if (isTitleSimilar) {
                debugLog({ message: `Skipping similar track: ${track.title}` })
                return true
            }

            // Check if artist is the same as the last played track
            const lastTrack = await this.getLastPlayedTrack(guildId)
            if (lastTrack?.author && track.author) {
                const normalizedLastArtist = lastTrack.author
                    .toLowerCase()
                    .trim()
                const normalizedCurrentArtist = track.author
                    .toLowerCase()
                    .trim()

                if (normalizedLastArtist === normalizedCurrentArtist) {
                    // Check if we've played this artist recently
                    const recentTracks = history.filter(
                        (t) =>
                            t.author.toLowerCase().trim() ===
                            normalizedLastArtist,
                    )

                    if (recentTracks.length > 0) {
                        debugLog({
                            message: `Skipping track from recently played artist: ${track.author}`,
                        })
                        return true
                    }
                }
            }

            return false
        } catch (error) {
            errorLog({
                message: "Error checking if track is duplicate:",
                error,
            })
            return true // Assume it's a duplicate if there's an error
        }
    }

    /**
     * Clear history for a guild
     */
    async clearGuildHistory(guildId: string): Promise<void> {
        try {
            const historyKey = this.getHistoryKey(guildId)
            const trackIdsKey = this.getTrackIdsKey(guildId)
            const lastTrackKey = this.getLastTrackKey(guildId)

            await Promise.all([
                redisClient.del(historyKey),
                redisClient.del(trackIdsKey),
                redisClient.del(lastTrackKey),
            ])

            debugLog({ message: `Cleared Redis history for guild ${guildId}` })
        } catch (error) {
            errorLog({ message: "Error clearing guild history:", error })
        }
    }

    /**
     * Extract tags from track title and description
     */
    private extractTags(track: Track): string[] {
        const tags: Set<string> = new Set()

        try {
            // Extract genre-related words from title
            const titleWords = track.title
                .toLowerCase()
                .replace(/[^\w\s]/g, " ")
                .split(/\s+/)
                .filter((word: string) => word.length > 3) // Filter out short words

            // Common music genres and styles
            const genreKeywords = [
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
            ]

            // Add genre tags
            titleWords.forEach((word: string) => {
                if (genreKeywords.some((genre) => word.includes(genre))) {
                    tags.add(word)
                }
            })

            // Add artist name as tag
            if (track.author) {
                tags.add(track.author.toLowerCase())
            }

            // Add year if present in title
            const yearMatch = track.title.match(/\b(19|20)\d{2}\b/)
            if (yearMatch) {
                tags.add(yearMatch[0])
            }

            // Add live/acoustic tags if applicable
            if (
                track.title.toLowerCase().includes("ao vivo") ||
                track.title.toLowerCase().includes("live")
            ) {
                tags.add("ao vivo")
            }
            if (track.title.toLowerCase().includes("acustic")) {
                tags.add("acustico")
            }
        } catch (error) {
            debugLog({ message: "Error extracting tags:", error })
        }

        return Array.from(tags)
    }

    /**
     * Calculate similarity between two strings (0-1)
     */
    private calculateSimilarity(str1: string, str2: string): number {
        const longer = str1.length > str2.length ? str1 : str2
        const shorter = str1.length > str2.length ? str2 : str1

        if (longer.length === 0) return 1.0

        const editDistance = (s1: string, s2: string): number => {
            const costs: number[] = []
            for (let i = 0; i <= s1.length; i++) {
                let lastValue = i
                for (let j = 0; j <= s2.length; j++) {
                    if (i === 0) {
                        costs[j] = j
                    } else if (j > 0) {
                        let newValue = costs[j - 1]
                        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                            newValue =
                                Math.min(
                                    Math.min(newValue, lastValue),
                                    costs[j],
                                ) + 1
                        }
                        costs[j - 1] = lastValue
                        lastValue = newValue
                    }
                }
                if (i > 0) costs[s2.length] = lastValue
            }
            return costs[s2.length]
        }

        const longerLength = longer.length
        const distance = editDistance(longer, shorter)
        return (longerLength - distance) / longerLength
    }

    /**
     * Clean title for comparison
     */
    private cleanTitle(title: string): string {
        return (
            title
                .toLowerCase()
                .trim()
                // Remove common suffixes and prefixes
                .replace(
                    /(official|video|audio|music|lyric|lyrics|visualizer|hq|hd|\(.*?\)|\[.*?\])/g,
                    "",
                )
                // Remove special characters
                .replace(/[^\w\s]/g, "")
                .trim()
        )
    }
}

// Export singleton instance
export const trackHistoryService = new TrackHistoryService()
