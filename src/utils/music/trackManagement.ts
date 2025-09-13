import type { Track, GuildQueue } from "discord-player"
import type { User } from "discord.js"
import { debugLog, errorLog, infoLog } from "../general/log"
import type { TrackHistoryEntry } from "./duplicateDetection"
import {
    isDuplicateTrack,
    clearHistory,
    recentlyPlayedTracks,
    addTrackToHistory,
} from "./duplicateDetection"
import {
    searchRelatedTracks,
    filterDuplicateTracks,
    getCurrentTrackIds,
} from "./trackSearch"
import { getAutoplayCount, incrementAutoplayCount } from "./autoplayManager"

interface IQueueMetadata {
    channel: unknown
    client: { user: User } | undefined
    requestedBy: User | undefined
}

/**
 * Add a track to the queue with duplicate checking
 */
export function addTrackToQueue(queue: GuildQueue, track: Track): void {
    try {
        // Check if track is a duplicate
        const guildId = queue.guild.id
        const currentTrackIds = getCurrentTrackIds(queue)

        // Check if track is a duplicate
        if (isDuplicateTrack(track, guildId, currentTrackIds)) {
            debugLog({ message: `Skipping duplicate track: ${track.title}` })
            return
        }

        // Add track to queue
        queue.addTrack(track)
        infoLog({
            message: `Added "${track.title}" to queue in ${queue.guild.name}`,
        })
    } catch (error) {
        errorLog({ message: "Error adding track to queue:", error })
    }
}

/**
 * Add multiple tracks to the queue with duplicate checking
 */
export function addTracksToQueue(queue: GuildQueue, tracks: Track[]): void {
    try {
        // Check if tracks are duplicates
        const guildId = queue.guild.id
        const currentTrackIds = getCurrentTrackIds(queue)

        // Filter out duplicates
        const filteredTracks = filterDuplicateTracks(
            tracks,
            guildId,
            currentTrackIds,
        )

        if (filteredTracks.length > 0) {
            queue.addTrack(filteredTracks)
            infoLog({
                message: `Added ${filteredTracks.length} tracks to queue in ${queue.guild.name}`,
            })
        } else {
            debugLog({ message: "No non-duplicate tracks to add to queue" })
        }
    } catch (error) {
        errorLog({ message: "Error adding tracks to queue:", error })
    }
}

/**
 * Replenish the queue with related tracks
 */
export async function replenishQueue(
    queue: GuildQueue,
    forceReplenish: boolean = false,
): Promise<void> {
    try {
        debugLog({
            message: "replenishQueue called",
            data: {
                guildId: queue.guild.id,
                repeatMode: queue.repeatMode,
                queueSize: queue.tracks.size,
                forceReplenish,
            },
        })

        // Check if autoplay is enabled
        const isAutoplayEnabled = queue.repeatMode === 3 // QueueRepeatMode.AUTOPLAY

        if (!isAutoplayEnabled) {
            debugLog({
                message:
                    "Autoplay is not enabled, skipping queue replenishment",
                data: { repeatMode: queue.repeatMode },
            })
            return
        }

        // Get the autoplay counter for this guild
        const guildId = queue.guild.id
        const currentAutoplayCount = getAutoplayCount(guildId)
        const maxAutoplayTracks = 50 // This should come from constants, but importing here would create circular dependency

        // For radio-like experience, we want to maintain a larger buffer
        // If we're close to the limit, we should be more conservative
        const isNearLimit = currentAutoplayCount >= maxAutoplayTracks * 0.8 // 80% of limit

        if (currentAutoplayCount >= maxAutoplayTracks) {
            debugLog({
                message: `Autoplay limit reached (${currentAutoplayCount}/${maxAutoplayTracks}), stopping autoplay`,
            })
            queue.setRepeatMode(0) // QueueRepeatMode.OFF
            return
        }

        // Determine target queue size based on whether we're near the autoplay limit
        const targetQueueSize = isNearLimit ? 3 : 8 // More aggressive when not near limit

        // If queue has less than target tracks OR force replenish is true, try to add more
        // This ensures we maintain a larger buffer for continuous radio-like experience
        if (queue.tracks.size < targetQueueSize || forceReplenish) {
            debugLog({
                message: forceReplenish
                    ? "Force replenishing queue with related tracks..."
                    : `Queue has less than ${targetQueueSize} tracks, replenishing...`,
            })

            // Get the last played track to use for related search
            const lastTrack = queue.currentTrack
            if (!lastTrack) {
                debugLog({
                    message: "No last track found, cannot replenish queue",
                })
                return
            }

            // Ensure the track is added to history first so we can get metadata
            addTrackToHistory(lastTrack, guildId)

            if (!lastTrack.id) {
                debugLog({
                    message:
                        "Last track has no ID, cannot search for related tracks",
                    data: {
                        trackTitle: lastTrack.title,
                        trackUrl: lastTrack.url,
                    },
                })
                return
            }

            // Search for related tracks using metadata
            debugLog({
                message: "Searching for related tracks",
                data: {
                    trackId: lastTrack.id,
                    trackTitle: lastTrack.title,
                    trackAuthor: lastTrack.author,
                },
            })

            const relatedTracks = await searchRelatedTracks(
                queue,
                lastTrack.id,
                lastTrack.requestedBy ??
                    (queue.metadata as { requestedBy?: unknown })?.requestedBy,
            )

            debugLog({
                message: "Related tracks search completed",
                data: {
                    foundTracks: relatedTracks?.length || 0,
                    trackTitles: relatedTracks?.map((t) => t.title) || [],
                },
            })

            if (!relatedTracks?.length) {
                debugLog({ message: "No related tracks found" })
                return
            }

            // Get the guild's track ID set
            const currentTrackIds = getCurrentTrackIds(queue)

            // Filter out recently played tracks
            const filteredTracks = filterDuplicateTracks(
                relatedTracks,
                guildId,
                currentTrackIds,
            )

            debugLog({
                message: "Filtered tracks for autoplay",
                data: {
                    originalTracks: relatedTracks.length,
                    filteredTracks: filteredTracks.length,
                    currentQueueSize: queue.tracks.size,
                    currentAutoplayCount,
                },
            })

            // Add tracks to queue until we reach target size, but respect autoplay limit
            // This creates a better radio-like experience with more tracks in queue
            const remainingSlots = Math.min(
                targetQueueSize - queue.tracks.size,
                maxAutoplayTracks - currentAutoplayCount,
            )
            const tracksToAdd = filteredTracks.slice(0, remainingSlots)

            debugLog({
                message: "Calculated tracks to add",
                data: {
                    remainingSlots,
                    tracksToAdd: tracksToAdd.length,
                    trackTitles: tracksToAdd.map((t) => t.title),
                },
            })

            if (tracksToAdd.length > 0) {
                // Mark tracks as requested by the bot for autoplay
                const botUser = (queue.metadata as IQueueMetadata)?.client?.user
                tracksToAdd.forEach((track) => {
                    if (botUser) {
                        track.requestedBy = botUser
                    }
                })

                queue.addTrack(tracksToAdd)

                // Update autoplay counter
                incrementAutoplayCount(guildId, tracksToAdd.length)

                debugLog({
                    message: `Added ${tracksToAdd.length} related tracks to queue (autoplay: ${currentAutoplayCount + tracksToAdd.length}/${maxAutoplayTracks})`,
                    data: {
                        tracks: tracksToAdd.map((t) => t.title),
                        requestedBy: tracksToAdd.map((t) => t.requestedBy?.id),
                    },
                })
            }
        }
    } catch (error) {
        errorLog({ message: "Error replenishing queue:", error })
    }
}

/**
 * Get the track history for a guild
 */
export function getGuildHistory(guildId: string): {
    history: TrackHistoryEntry[]
    lastTrack: TrackHistoryEntry | undefined
} {
    return {
        history: recentlyPlayedTracks.get(guildId) ?? [],
        lastTrack: recentlyPlayedTracks.get(guildId)?.[0],
    }
}

/**
 * Clear the track history for a guild
 */
export function clearGuildHistory(guildId: string): void {
    clearHistory(guildId)
    infoLog({ message: `Cleared track history for guild ${guildId}` })
}
