import { SlashCommandBuilder } from "@discordjs/builders"
import type { Track } from "discord-player"
import { debugLog, errorLog } from "../../../utils/general/log"
import { interactionReply } from "../../../utils/general/interactionReply"
import Command from "../../../models/Command"
import {
    createEmbed,
    EMBED_COLORS,
    EMOJIS,
} from "../../../utils/general/embeds"
import { getTrackInfo } from "../../../utils/music/trackUtils"
import { isSimilarTitle } from "../../../utils/music/titleComparison"
import {
    requireGuild,
    requireQueue,
} from "../../../utils/command/commandValidations"
import type { ICommandExecuteParams } from "../../../types/CommandData"
import { messages } from "../../../utils/general/messages"
import type { ColorResolvable } from "discord.js"

export default new Command({
    data: new SlashCommandBuilder()
        .setName("queue")
        .setDescription("📋 Show the current music queue"),
    category: "music",
    execute: async ({
        client,
        interaction,
    }: ICommandExecuteParams): Promise<void> => {
        if (!(await requireGuild(interaction))) return

        const queue = client.player.nodes.get(interaction.guildId ?? "")
        if (!(await requireQueue(queue, interaction))) return

        try {
            debugLog({
                message: "Queue status",
                data: { queueExists: !!queue },
            })

            // Create the queue embed
            const embed = createEmbed({
                title: "📄 Music Queue",
                color: EMBED_COLORS.QUEUE as ColorResolvable,
                timestamp: true,
            })

            // Add current track information
            try {
                const currentTrack = queue?.currentTrack
                if (currentTrack) {
                    const trackInfo = getTrackInfo(currentTrack)
                    const isAutoplay =
                        currentTrack.requestedBy?.id === client.user?.id
                    const tag = isAutoplay ? "🤖 Autoplay" : "👤 Manual"

                    // Get next track information
                    let nextTrackInfo = ""
                    const nextTrack = queue?.tracks.at(0)
                    if (nextTrack) {
                        const nextTrackData = getTrackInfo(nextTrack)
                        const isNextAutoplay =
                            nextTrack.requestedBy?.id === client.user?.id
                        const nextTag = isNextAutoplay
                            ? "🤖 Autoplay"
                            : "👤 Manual"
                        nextTrackInfo = `\n\n⏭️ Next song:\n**${nextTrackData.title}**\nDuration: ${nextTrackData.duration}\nRequested by: ${nextTrackData.requester}\n${nextTag}`
                    }

                    embed.addFields({
                        name: "▶️ Now Playing",
                        value: `**${trackInfo.title}**\nDuration: ${trackInfo.duration}\nRequested by: ${trackInfo.requester}\n${tag}${nextTrackInfo}`,
                    })
                } else {
                    embed.addFields({
                        name: "▶️ Now Playing",
                        value: "No music is currently playing",
                    })
                }
            } catch (currentTrackError) {
                errorLog({
                    message: "Error processing current track:",
                    error: currentTrackError,
                })
                embed.addFields({
                    name: "▶️ Now Playing",
                    value: messages.error.noTrack,
                })
            }

            // Add upcoming tracks
            try {
                // Get tracks safely
                const tracks: Track[] = []
                const manualTracks: Track[] = []
                const autoplayTracks: Track[] = []

                // Safely iterate through tracks
                if (queue?.tracks) {
                    try {
                        // Use the correct method to get tracks
                        const trackArray = queue.tracks.toArray()
                        debugLog({
                            message: "Track array length",
                            data: { length: trackArray.length },
                        })

                        // First, separate tracks into manual and autoplay
                        for (const track of trackArray) {
                            try {
                                if (!track) {
                                    debugLog({ message: "Skipping null track" })
                                    continue
                                }

                                // Validate track properties
                                if (!track.title) {
                                    debugLog({
                                        message: "Track missing title",
                                        data: { trackId: track.id },
                                    })
                                    continue
                                }

                                // Check for duplicates
                                const isDuplicate = tracks.some(
                                    (existingTrack) =>
                                        isSimilarTitle(
                                            track.title,
                                            existingTrack.title,
                                        ),
                                )

                                if (isDuplicate) {
                                    debugLog({
                                        message: "Skipping duplicate track",
                                        data: {
                                            trackTitle: track.title,
                                            existingTracks: tracks.map(
                                                (t) => t.title,
                                            ),
                                        },
                                    })
                                    continue
                                }

                                if (track.requestedBy?.id === client.user?.id) {
                                    autoplayTracks.push(track)
                                } else {
                                    manualTracks.push(track)
                                }
                                tracks.push(track)
                            } catch (trackError) {
                                errorLog({
                                    message:
                                        "Error processing individual track:",
                                    error: trackError,
                                })
                                continue
                            }
                        }

                        // Clear the current queue
                        queue.tracks.clear()

                        // Add manual tracks first
                        for (const track of manualTracks) {
                            queue.tracks.add(track)
                        }

                        // Then add autoplay tracks
                        for (const track of autoplayTracks) {
                            queue.tracks.add(track)
                        }
                    } catch (arrayError) {
                        errorLog({
                            message: "Error converting tracks to array:",
                            error: arrayError,
                        })
                    }
                }

                debugLog({
                    message: "Queue tracks processed",
                    data: {
                        total: tracks.length,
                        manual: manualTracks.length,
                        autoplay: autoplayTracks.length,
                    },
                })

                // Show manual tracks first (priority)
                if (manualTracks.length > 0) {
                    const manualTracksList: string[] = []
                    const maxManual = Math.min(manualTracks.length, 10)

                    for (let i = 0; i < maxManual; i++) {
                        try {
                            const track = manualTracks[i]
                            if (!track) continue

                            const trackInfo = getTrackInfo(track)
                            manualTracksList.push(
                                `${i + 1}. **${trackInfo.title}**\n   Duration: ${trackInfo.duration} | Requested by: ${trackInfo.requester} 👤 Manual`,
                            )
                        } catch (trackError) {
                            errorLog({
                                message: `Error processing manual track ${i}:`,
                                error: trackError,
                            })
                            manualTracksList.push(`${i + 1}. **Unknown song**`)
                        }
                    }

                    const manualList = manualTracksList.join("\n\n")
                    if (manualList) {
                        embed.addFields({
                            name: "👤 Manual Songs (Priority)",
                            value: manualList,
                        })
                    }
                }

                // Show autoplay tracks second
                if (autoplayTracks.length > 0) {
                    const autoplayTracksList: string[] = []
                    const maxAutoplay = Math.min(autoplayTracks.length, 10)

                    for (let i = 0; i < maxAutoplay; i++) {
                        try {
                            const track = autoplayTracks[i]
                            if (!track) continue

                            const trackInfo = getTrackInfo(track)
                            autoplayTracksList.push(
                                `${i + 1}. **${trackInfo.title}**\n   Duration: ${trackInfo.duration} | Requested by: ${trackInfo.requester} 🤖 Autoplay`,
                            )
                        } catch (trackError) {
                            errorLog({
                                message: `Error processing autoplay track ${i}:`,
                                error: trackError,
                            })
                            autoplayTracksList.push(
                                `${i + 1}. **Unknown song**`,
                            )
                        }
                    }

                    const autoplayList = autoplayTracksList.join("\n\n")
                    if (autoplayList) {
                        embed.addFields({
                            name: "🤖 Autoplay Songs",
                            value: autoplayList,
                        })
                    }
                }

                // Show remaining tracks count
                if (tracks.length > 0) {
                    const remainingManual = Math.max(
                        0,
                        manualTracks.length - 10,
                    )
                    const remainingAutoplay = Math.max(
                        0,
                        autoplayTracks.length - 10,
                    )

                    if (remainingManual > 0 || remainingAutoplay > 0) {
                        let remainingText = "And "
                        if (remainingManual > 0) {
                            remainingText += `${remainingManual} more manual songs`
                        }
                        if (remainingAutoplay > 0) {
                            if (remainingManual > 0) remainingText += " and "
                            remainingText += `${remainingAutoplay} more autoplay songs`
                        }
                        remainingText += " in queue..."

                        embed.addFields({
                            name: "📝 More songs",
                            value: remainingText,
                        })
                    }
                } else {
                    embed.addFields({
                        name: "📑 Next Songs",
                        value: "No songs in the queue",
                    })
                }

                // Add queue statistics
                try {
                    const repeatMode = queue?.repeatMode
                        ? "Enabled"
                        : "Disabled"
                    const volume = queue?.node.volume ?? 100
                    const trackCount = queue?.tracks?.size ?? 0
                    const manualCount = manualTracks.length
                    const autoplayCount = autoplayTracks.length

                    embed.addFields({
                        name: "📊 Queue Statistics",
                        value: `Total songs: ${trackCount}\nManual songs: ${manualCount}\nAutoplay songs: ${autoplayCount}\nRepeat mode: ${repeatMode}\nVolume: ${volume}%`,
                    })
                } catch (statsError) {
                    errorLog({
                        message: "Error processing queue statistics:",
                        error: statsError,
                    })
                }
            } catch (tracksError) {
                errorLog({
                    message: "Error processing tracks list:",
                    error: tracksError,
                })
                embed.addFields({
                    name: "📑 Next Songs",
                    value: messages.error.noTrack,
                })
            }

            // Set timestamp
            embed.setTimestamp()

            await interactionReply({
                interaction,
                content: {
                    embeds: [embed],
                },
            })
        } catch (error) {
            errorLog({ message: "Error in queue command:", error })
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createEmbed({
                            title: "Error",
                            description: messages.error.noQueue,
                            color: EMBED_COLORS.ERROR as ColorResolvable,
                            emoji: EMOJIS.ERROR,
                        }),
                    ],
                    ephemeral: true,
                },
            })
        }
    },
})
