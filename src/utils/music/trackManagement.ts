import type { Track, GuildQueue } from "discord-player"
import { debugLog, errorLog, infoLog } from "../general/log"
import type { TrackHistoryEntry } from "./duplicateDetection"
import {
    isDuplicateTrack,
    clearHistory,
    recentlyPlayedTracks,
} from "./duplicateDetection"
import {
    searchRelatedTracks,
    filterDuplicateTracks,
    getCurrentTrackIds,
} from "./trackSearch"
import { getAutoplayCount, incrementAutoplayCount } from "./autoplayManager"

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
export async function replenishQueue(queue: GuildQueue): Promise<void> {
    try {
        // Check if autoplay is enabled
        const isAutoplayEnabled = queue.repeatMode === 3 // QueueRepeatMode.AUTOPLAY

        if (!isAutoplayEnabled) {
            debugLog({
                message:
                    "Autoplay is not enabled, skipping queue replenishment",
            })
            return
        }

        // Get the autoplay counter for this guild
        const guildId = queue.guild.id
        const currentAutoplayCount = getAutoplayCount(guildId)
        const maxAutoplayTracks = 50 // This should come from constants, but importing here would create circular dependency

        if (currentAutoplayCount >= maxAutoplayTracks) {
            debugLog({
                message: `Autoplay limit reached (${currentAutoplayCount}/${maxAutoplayTracks}), stopping autoplay`,
            })
            queue.setRepeatMode(0) // QueueRepeatMode.OFF
            return
        }

        // If queue has less than 2 tracks, try to add more
        if (queue.tracks.size < 2) {
            debugLog({
                message: "Queue has less than 2 tracks, replenishing...",
            })

            // Get the last played track to use for related search
            const lastTrack = queue.currentTrack
            if (!lastTrack) {
                debugLog({
                    message: "No last track found, cannot replenish queue",
                })
                return
            }

            if (!lastTrack.id) {
                debugLog({
                    message:
                        "Last track has no ID, cannot search for related tracks",
                })
                return
            }

            // Search for related tracks using metadata
            const relatedTracks = await searchRelatedTracks(
                queue,
                lastTrack.id,
                lastTrack.requestedBy ??
                    (queue.metadata as { requestedBy?: unknown })?.requestedBy,
            )

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

            // Add tracks to queue until we have at least 2, but respect autoplay limit
            const remainingSlots = Math.min(
                2 - queue.tracks.size,
                maxAutoplayTracks - currentAutoplayCount,
            )
            const tracksToAdd = filteredTracks.slice(0, remainingSlots)

            if (tracksToAdd.length > 0) {
                queue.addTrack(tracksToAdd)

                // Update autoplay counter
                incrementAutoplayCount(guildId, tracksToAdd.length)

                debugLog({
                    message: `Added ${tracksToAdd.length} related tracks to queue (autoplay: ${currentAutoplayCount + tracksToAdd.length}/${maxAutoplayTracks})`,
                    data: { tracks: tracksToAdd.map((t) => t.title) },
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
