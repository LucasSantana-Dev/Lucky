import type { Track, GuildQueue } from "discord-player"
import type { User } from "discord.js"
import { debugLog, errorLog, infoLog } from "../general/log"
import {
    isDuplicateTrack,
    clearHistory,
    recentlyPlayedTracks,
    addTrackToHistory,
    type TrackHistoryEntry,
} from "./duplicateDetection"
import {
    TrackFilter,
} from "./trackSearch/trackFilter"
import { getAutoplayCount, incrementAutoplayCount } from "./autoplayManager"

interface IQueueMetadata {
    channel: unknown
    client: { user: User } | undefined
    requestedBy: User | undefined
}

function checkAutoplayLimit(
    currentAutoplayCount: number,
    maxAutoplayTracks: number,
    queue: GuildQueue,
): boolean {
    if (currentAutoplayCount >= maxAutoplayTracks) {
        debugLog({
            message: `Autoplay limit reached (${currentAutoplayCount}/${maxAutoplayTracks}), stopping autoplay`,
        })
        queue.setRepeatMode(0)
        return false
    }
    return true
}

function calculateTargetQueueSize(
    currentAutoplayCount: number,
    maxAutoplayTracks: number,
): number {
    const isNearLimit = currentAutoplayCount >= maxAutoplayTracks * 0.8
    return isNearLimit ? 3 : 8
}

async function searchRelatedTracksForReplenishment(
    queue: GuildQueue,
    lastTrack: Track,
    guildId: string,
): Promise<Track[]> {
    addTrackToHistory(lastTrack, guildId)

    if (!lastTrack.id) {
        debugLog({
            message: "Last track has no ID, cannot search for related tracks",
            data: {
                trackTitle: lastTrack.title,
                trackUrl: lastTrack.url,
            },
        })
        return []
    }

    const requestedBy = (lastTrack.requestedBy ??
        (queue.metadata as IQueueMetadata)?.requestedBy) as User | undefined
    if (!requestedBy) {
        debugLog({
            message: "No requestedBy user found, cannot search for related tracks",
        })
        return []
    }

    const searchQuery = `${lastTrack.author} ${lastTrack.title}`
    const searchResult = await queue.player.search(searchQuery, {
        requestedBy,
    })
    return searchResult.hasTracks() ? searchResult.tracks : []
}

async function addTracksToQueueForReplenishment(
    queue: GuildQueue,
    filteredTracks: Track[],
    remainingSlots: number,
    guildId: string,
    currentAutoplayCount: number,
    maxAutoplayTracks: number,
): Promise<void> {
    const tracksToAdd = filteredTracks.slice(0, remainingSlots)

    if (tracksToAdd.length === 0) {
        return
    }

    const botUser = (queue.metadata as IQueueMetadata)?.client?.user
    tracksToAdd.forEach((track: Track) => {
        if (botUser) {
            track.requestedBy = botUser
        }
    })

    queue.addTrack(tracksToAdd)
    incrementAutoplayCount(guildId, tracksToAdd.length)

    debugLog({
        message: `Added ${tracksToAdd.length} related tracks to queue (autoplay: ${currentAutoplayCount + tracksToAdd.length}/${maxAutoplayTracks})`,
        data: {
            tracks: tracksToAdd.map((t: Track) => t.title),
            requestedBy: tracksToAdd.map((track: Track) => track.requestedBy?.id),
        },
    })
}

/**
 * Add a track to the queue with duplicate checking
 */
export async function addTrackToQueue(queue: GuildQueue, track: Track): Promise<void> {
    try {
        // Check if track is a duplicate
        const guildId = queue.guild.id
        const isDuplicate = await isDuplicateTrack(guildId, track.url)

        if (isDuplicate) {
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
export async function addTracksToQueue(queue: GuildQueue, tracks: Track[]): Promise<void> {
    try {
        // Check if tracks are duplicates
        const guildId = queue.guild.id
        const currentTrackIds = TrackFilter.getCurrentTrackIds(queue)

        // Filter out duplicates
        const filteredTracks = await TrackFilter.filterDuplicateTracks(
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

        const guildId = queue.guild.id
        const currentAutoplayCount = await Promise.resolve(getAutoplayCount(guildId))
        const maxAutoplayTracks = 50

        if (!checkAutoplayLimit(currentAutoplayCount, maxAutoplayTracks, queue)) {
            return
        }

        const targetQueueSize = calculateTargetQueueSize(currentAutoplayCount, maxAutoplayTracks)

        // If queue has less than target tracks OR force replenish is true, try to add more
        // This ensures we maintain a larger buffer for continuous radio-like experience
        const queueSize = queue.tracks.size
        if (queueSize < targetQueueSize || forceReplenish) {
            debugLog({
                message: forceReplenish
                    ? "Force replenishing queue with related tracks..."
                    : `Queue has less than ${targetQueueSize} tracks, replenishing...`,
            })

            const lastTrack = queue.currentTrack
            if (!lastTrack) {
                debugLog({
                    message: "No last track found, cannot replenish queue",
                })
                return
            }

            debugLog({
                message: "Searching for related tracks",
                data: {
                    trackId: lastTrack.id,
                    trackTitle: lastTrack.title,
                    trackAuthor: lastTrack.author,
                },
            })

            const relatedTracks = await searchRelatedTracksForReplenishment(
                queue,
                lastTrack,
                guildId,
            )

            debugLog({
                message: "Related tracks search completed",
                data: {
                    foundTracks: relatedTracks.length,
                    trackTitles: relatedTracks.map((t) => t.title),
                },
            })

            if (relatedTracks.length === 0) {
                debugLog({ message: "No related tracks found" })
                return
            }

            const currentTrackIds = TrackFilter.getCurrentTrackIds(queue)
            const filteredTracks = await TrackFilter.filterDuplicateTracks(
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

            const currentQueueSize = queue.tracks.size
            const remainingSlots = Math.min(
                targetQueueSize - currentQueueSize,
                maxAutoplayTracks - currentAutoplayCount,
            )

            await addTracksToQueueForReplenishment(
                queue,
                filteredTracks,
                remainingSlots,
                guildId,
                currentAutoplayCount,
                maxAutoplayTracks,
            )
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
