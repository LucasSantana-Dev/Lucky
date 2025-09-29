import type { Track, GuildQueue } from "discord-player"
import { Player } from "discord-player"
import { YoutubeiExtractor } from "discord-player-youtubei"
import { AttachmentExtractor } from "@discord-player/extractor"
import type { ICustomClient } from "../types/index"
import { errorLog, infoLog, debugLog } from "../utils/general/log"
import { constants } from "../config/config"
import { QueryType } from "discord-player"
import type { TextChannel, User, ChatInputCommandInteraction } from "discord.js"
import { addTrackToHistory } from "../utils/music/duplicateDetection"
import { replenishQueue } from "../utils/music/trackManagement"
import { createEmbed, EMBED_COLORS } from "../utils/general/embeds"
import type { ColorResolvable } from "discord.js"
import {
    getAutoplayCount,
    resetAutoplayCount,
} from "../utils/music/autoplayManager"
import {
    analyzeYouTubeError,
    logYouTubeError,
} from "../utils/music/youtubeErrorHandler"
import { youtubeConfig } from "../config/youtubeConfig"

interface IQueueMetadata {
    channel: TextChannel
    client: unknown
    requestedBy: User | undefined
    interaction?: ChatInputCommandInteraction // Store the interaction for reply editing
}

interface ICreatePlayerParams {
    client: ICustomClient
}

export const lastPlayedTracks = new Map<string, Track>()

interface ITrackHistoryEntry {
    url: string
    title: string
    author: string
    thumbnail?: string
    timestamp: number
}

export const recentlyPlayedTracks = new Map<string, ITrackHistoryEntry[]>()

const songInfoMessages = new Map<
    string,
    { messageId: string; channelId: string }
>()

export const createPlayer = ({ client }: ICreatePlayerParams): Player => {
    try {
        infoLog({ message: "Creating player..." })

        const player = new Player(client)

        try {
            debugLog({
                message: "Attempting to register extractors...",
            })
            
            // Register YouTubei extractor with improved configuration
            player.extractors.register(YoutubeiExtractor, {
                // Add configuration to reduce signature decipher warnings
                useClient: "WEB",
                // Enable better error handling
                throwOnError: false,
                // Add retry configuration
                retryOnFailure: true,
                maxRetries: 3,
            })
            infoLog({ message: "Successfully registered YouTubei extractor" })
            
            // Register Attachment extractor as fallback
            player.extractors.register(AttachmentExtractor, {})
            infoLog({ message: "Successfully registered Attachment extractor" })
            
        } catch (extractorError) {
            errorLog({
                message: "Failed to register extractors:",
                error: extractorError,
            })
            // Don't throw error, continue with available extractors
            debugLog({ message: "Continuing with available extractors" })
        }

        // Clear any existing event listeners to prevent duplicates
        player.events.removeAllListeners()

        // Suppress YouTube signature decipher warnings as they're not critical
        const originalConsoleWarn = console.warn
        console.warn = (...args) => {
            const message = args[0]?.toString() || ""
            if (message.includes("Failed to extract signature decipher algorithm")) {
                // Suppress this specific warning as it's not critical
                debugLog({ message: "YouTube signature decipher warning suppressed (non-critical)" })
                return
            }
            originalConsoleWarn.apply(console, args)
        }

        // Handle general errors
        player.events.on("error", (queue: GuildQueue, error: Error) => {
            errorLog({
                message: `Error in queue ${queue?.guild?.name || "unknown"}:`,
                error,
            })

            const isConnectionError =
                error.message.includes("ECONNRESET") ||
                error.message.includes("ECONNREFUSED") ||
                error.message.includes("ETIMEDOUT") ||
                error.message.includes("Connection reset by peer")

            if (isConnectionError) {
                debugLog({
                    message:
                        "Detected specific connection error, attempting recovery...",
                })
                if (queue?.connection) {
                    try {
                        if (queue.connection.state.status !== "ready") {
                            queue.connection.rejoin()
                            infoLog({
                                message:
                                    "Attempting to recover from connection error",
                            })
                        } else {
                            debugLog({
                                message:
                                    "Connection appears to be fine, ignoring error",
                            })
                        }
                    } catch (recoveryError) {
                        errorLog({
                            message: "Failed to recover from connection error:",
                            error: recoveryError,
                        })
                    }
                }
            } else {
                debugLog({
                    message: "Non-connection error, no recovery needed",
                })
            }
        })

        player.events.on(
            "playerError",
            async (queue: GuildQueue, error: Error) => {
                // Check if this is a YouTube parser error first
                const youtubeErrorInfo = analyzeYouTubeError(error)

                if (youtubeErrorInfo.isParserError) {
                    logYouTubeError(
                        error,
                        `player error in ${queue.guild.name}`,
                    )

                    // For YouTube parser errors, we'll skip the track and continue
                    // as these are usually temporary issues with YouTube's API
                    debugLog({
                        message:
                            "YouTube parser error detected, skipping current track",
                        data: {
                            errorType: youtubeErrorInfo.isCompositeVideoError
                                ? "CompositeVideoPrimaryInfo"
                                : youtubeErrorInfo.isHypePointsError
                                  ? "HypePointsFactoid"
                                  : youtubeErrorInfo.isTypeMismatchError
                                    ? "TypeMismatch"
                                    : "Parser",
                        },
                    })

                    // Skip to next track for parser errors if configured to do so
                    if (youtubeConfig.errorHandling.skipOnParserError) {
                        queue.node.skip()
                        return
                    }
                }

                errorLog({
                    message: `Player error in queue ${queue.guild.name}:`,
                    error,
                })

                const isStreamExtractionError =
                    error.message.includes("Could not extract stream") ||
                    error.message.includes("Streaming data not available") ||
                    error.message.includes("chooseFormat")

                if (isStreamExtractionError) {
                    debugLog({
                        message:
                            "Detected stream extraction error, attempting recovery...",
                    })

                    try {
                        const currentTrack = queue.currentTrack

                        if (currentTrack) {
                            debugLog({
                                message: `Problematic URL: ${currentTrack.url}`,
                            })

                            debugLog({
                                message:
                                    "Attempting to re-fetch track with alternative search engine...",
                            })

                            const searchResult = await queue.player.search(
                                currentTrack.title,
                                {
                                    requestedBy:
                                        currentTrack.requestedBy ??
                                        (queue.metadata as IQueueMetadata)
                                            .requestedBy,
                                    searchEngine: QueryType.YOUTUBE_SEARCH,
                                },
                            )

                            if (
                                searchResult &&
                                searchResult.tracks.length > 0
                            ) {
                                const alternativeTrack =
                                    searchResult.tracks.find(
                                        (track) =>
                                            track.url !== currentTrack.url,
                                    )

                                if (alternativeTrack) {
                                    // Remove the current track
                                    queue.removeTrack(0)

                                    // Add the alternative track
                                    queue.addTrack(alternativeTrack)

                                    // Try to play the new track
                                    if (!queue.node.isPlaying()) {
                                        await queue.node.play()
                                        debugLog({
                                            message:
                                                "Successfully recovered from stream extraction error",
                                        })
                                    }
                                } else {
                                    debugLog({
                                        message:
                                            "Could not find alternative track, skipping...",
                                    })
                                    queue.node.skip()
                                }
                            } else {
                                debugLog({
                                    message:
                                        "Could not find alternative track, skipping...",
                                })
                                queue.node.skip()
                            }
                        } else {
                            debugLog({
                                message: "No current track, skipping...",
                            })
                            queue.node.skip()
                        }
                    } catch (recoveryError) {
                        errorLog({
                            message:
                                "Failed to recover from stream extraction error:",
                            error: recoveryError,
                        })
                        // If all recovery attempts fail, skip to the next track
                        queue.node.skip()
                    }
                }
                // Handle download and streaming errors
                const isDownloadError =
                    error.message.includes("Invalid URL") ||
                    error.message.includes("No data received") ||
                    error.message.includes("download failed") ||
                    error.message.includes("stream failed")

                if (isDownloadError) {
                    debugLog({
                        message:
                            "Detected download/stream error, attempting recovery...",
                    })

                    try {
                        // Get the current track
                        const currentTrack = queue.currentTrack

                        if (currentTrack) {
                            // Log the problematic URL
                            debugLog({
                                message: `Problematic URL: ${currentTrack.url}`,
                            })

                            // Try to search for the track again
                            debugLog({
                                message:
                                    "Attempting to re-fetch track information...",
                            })

                            const searchResult = await queue.player.search(
                                currentTrack.url,
                                {
                                    requestedBy:
                                        currentTrack.requestedBy ??
                                        (queue.metadata as IQueueMetadata)
                                            .requestedBy,
                                    searchEngine: QueryType.YOUTUBE_SEARCH,
                                },
                            )

                            if (
                                searchResult &&
                                searchResult.tracks.length > 0
                            ) {
                                // Remove the current track
                                queue.removeTrack(0)

                                // Add the new track
                                queue.addTrack(searchResult.tracks[0])

                                // Try to play the new track
                                if (!queue.node.isPlaying()) {
                                    await queue.node.play()
                                    debugLog({
                                        message:
                                            "Successfully recovered from download error",
                                    })
                                }
                            } else {
                                debugLog({
                                    message:
                                        "Could not find alternative track, skipping...",
                                })
                                queue.node.skip()
                            }
                        } else {
                            debugLog({
                                message: "No current track, skipping...",
                            })
                            queue.node.skip()
                        }
                    } catch (recoveryError) {
                        errorLog({
                            message: "Failed to recover from download error:",
                            error: recoveryError,
                        })
                        // If all recovery attempts fail, skip to the next track
                        queue.node.skip()
                    }
                } else {
                    // Handle other player errors
                    const isStreamError =
                        error.message.includes("stream") ||
                        error.message.includes("FFmpeg")

                    if (isStreamError) {
                        debugLog({
                            message:
                                "Detected stream error, attempting recovery...",
                        })
                        try {
                            // Check if we're actually playing before trying to recover
                            if (queue.node.isPlaying()) {
                                queue.node.pause()

                                // Wait a bit before trying to resume
                                await new Promise((resolve) =>
                                    setTimeout(resolve, 5000),
                                )

                                // Try to resume playback
                                if (!queue.node.isPlaying()) {
                                    await queue.node.resume()
                                    debugLog({
                                        message:
                                            "Successfully resumed playback after stream error",
                                    })
                                }

                                // If still not playing, try to replay the current track
                                if (
                                    !queue.node.isPlaying() &&
                                    queue.currentTrack
                                ) {
                                    debugLog({
                                        message:
                                            "Attempting to replay current track...",
                                    })
                                    await queue.node.play()
                                }
                            } else {
                                debugLog({
                                    message:
                                        "Not currently playing, no recovery needed",
                                })
                            }
                        } catch (recoveryError) {
                            errorLog({
                                message: "Failed to recover from player error:",
                                error: recoveryError,
                            })
                        }
                    } else {
                        debugLog({
                            message: "Non-stream error, no recovery needed",
                        })
                    }
                }
            },
        )

        // Add debug event handlers
        player.events.on("debug", (queue: GuildQueue, message: string) => {
            debugLog({
                message: `Player debug from ${queue.guild.name}: ${message}`,
            })
        })

        // Add track start event handler
        player.events.on("playerStart", async (queue: GuildQueue, track) => {
            infoLog({
                message: `Started playing "${track.title}" in ${queue.guild.name}`,
            })

            // Log the download URL for debugging
            debugLog({ message: `Track URL: ${track.url}` })

            // Ensure volume is set correctly
            if (queue.node.volume !== constants.VOLUME) {
                queue.node.setVolume(constants.VOLUME)
            }

            // Reset autoplay counter if this is a manual track (not autoplay)
            const isAutoplay = track.requestedBy?.id === client.user?.id
            if (!isAutoplay) {
                resetAutoplayCount(queue.guild.id)
                debugLog({
                    message: `Reset autoplay counter for guild ${queue.guild.id} - manual track played`,
                })
            }

            // Replenish queue with autoplay tracks when a track starts
            try {
                await replenishQueue(queue)
                debugLog({
                    message: "Queue replenished after track start",
                    data: {
                        trackTitle: track.title,
                        guildId: queue.guild.id,
                        queueSize: queue.tracks.size,
                    },
                })
            } catch (error) {
                errorLog({
                    message: "Error replenishing queue after track start:",
                    error,
                })
            }

            // Check if this is an autoplay track - if so, we need to send a message
            // For manual tracks, the play command already handled the reply
            if (isAutoplay) {
                debugLog({
                    message: "Autoplay track started, sending playing message",
                    data: { trackTitle: track.title, guildId: queue.guild.id },
                })
            } else {
                debugLog({
                    message:
                        "Manual track started, skipping message (already handled by play command)",
                    data: { trackTitle: track.title, guildId: queue.guild.id },
                })
                return // Skip sending message for manual tracks
            }

            // Update the message to show the current track (only for autoplay)
            try {
                const metadata = queue.metadata as IQueueMetadata

                // Format duration
                const formatDuration = (duration: string) => {
                    if (!duration || duration === "0:00")
                        return "Unknown duration"
                    return duration
                }

                // Determine source
                const getSource = (url: string) => {
                    if (url.includes("youtube.com") || url.includes("youtu.be"))
                        return "YouTube"
                    if (url.includes("spotify.com")) return "Spotify"
                    if (url.includes("soundcloud.com")) return "SoundCloud"
                    return "Unknown"
                }

                // Get requester info
                const requester = track.requestedBy
                const requesterInfo = requester
                    ? `Added by **${requester.username}**`
                    : "Added automatically"

                const embed = createEmbed({
                    title: "🎵 Now Playing",
                    description: `[**${track.title}**](${track.url}) by **${track.author}**`,
                    color: EMBED_COLORS.MUSIC as ColorResolvable,
                    thumbnail: track.thumbnail,
                    timestamp: true,
                    fields: [
                        {
                            name: "⏱️ Duration",
                            value: formatDuration(track.duration),
                            inline: true,
                        },
                        {
                            name: "🌐 Source",
                            value: getSource(track.url),
                            inline: true,
                        },
                        {
                            name: "👤 Requested",
                            value: requesterInfo,
                            inline: true,
                        },
                    ],
                    footer: `Autoplay • ${getAutoplayCount(queue.guild.id)}/${constants.MAX_AUTOPLAY_TRACKS ?? 50} songs`,
                })

                // Send autoplay message to channel
                if (metadata?.channel) {
                    const message = await metadata.channel.send({
                        embeds: [embed],
                    })

                    const guildId = queue.guild.id
                    songInfoMessages.set(guildId, {
                        messageId: message.id,
                        channelId: metadata.channel.id,
                    })

                    debugLog({
                        message: "Sent autoplay track message to channel",
                        data: {
                            guildId: queue.guild.id,
                            trackTitle: track.title,
                        },
                    })
                }
            } catch (error) {
                errorLog({
                    message: "Error sending autoplay track message:",
                    error,
                })
            }
        })

        // Add playerFinish event handler
        player.events.on("playerFinish", async (queue: GuildQueue) => {
            try {
                // Store the last played track
                if (queue.currentTrack) {
                    // Add track to history using the utility function
                    addTrackToHistory(queue.currentTrack, queue.guild.id)
                }

                // Check and replenish the queue
                await replenishQueue(queue)
            } catch (error) {
                errorLog({ message: "Error in playerFinish event:", error })
            }
        })

        // Add playerSkip event handler
        player.events.on("playerSkip", async (queue: GuildQueue) => {
            try {
                debugLog({ message: "Track skipped, checking queue..." })

                // Add the skipped track to history using the utility function
                if (queue.currentTrack) {
                    addTrackToHistory(queue.currentTrack, queue.guild.id)
                }

                // Check and replenish the queue
                await replenishQueue(queue)
            } catch (error) {
                errorLog({ message: "Error in playerSkip event:", error })
            }
        })

        // Add track add event handler
        player.events.on("audioTracksAdd", (queue: GuildQueue, tracks) => {
            if (Array.isArray(tracks) && tracks.length > 0) {
                infoLog({
                    message: `Added "${tracks[0].title}" to queue in ${queue.guild.name}`,
                })
            }
        })

        // Add connection create event handler
        player.events.on("connection", (queue: GuildQueue) => {
            infoLog({
                message: `Created connection to voice channel in ${queue.guild.name}`,
            })
        })

        // Add connection destroy event handler
        player.events.on("connectionDestroyed", (queue: GuildQueue) => {
            infoLog({
                message: `Destroyed connection to voice channel in ${queue.guild.name}`,
            })
        })

        // Add player empty event handler
        player.events.on("emptyChannel", (queue: GuildQueue) => {
            infoLog({ message: `Channel is empty in ${queue.guild.name}` })
        })

        // Add player disconnect event handler
        player.events.on("disconnect", (queue: GuildQueue) => {
            infoLog({
                message: `Disconnected from voice channel in ${queue.guild.name}`,
            })
        })

        infoLog({ message: "Player created successfully" })
        return player
    } catch (error) {
        errorLog({ message: "Error creating player:", error })
        throw error
    }
}
