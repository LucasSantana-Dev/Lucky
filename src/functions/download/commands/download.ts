import { SlashCommandBuilder } from "@discordjs/builders"
import { AttachmentBuilder } from "discord.js"
import play from "play-dl"
import Command from "../../../models/Command"
import { errorLog, infoLog, successLog } from "../../../utils/general/log"
import {
    downloadVideo,
    deleteDownloadedFile,
} from "../../../functions/download/utils/downloadUtils"
import { requireGuild } from "../../../utils/command/commandValidations"
import type { CommandExecuteParams } from "../../../types/CommandData"
import {
    createErrorEmbed,
    isYouTubeUrl,
    isSupportedPlatformUrl,
    getPlatformFromUrl,
    formatDuration,
} from "../../../functions/download/utils/downloadHelpers"
import {
    createEmbed,
    EMBED_COLORS,
    EMOJIS,
} from "../../../utils/general/embeds"
import type { ColorResolvable } from "discord.js"
import { interactionReply } from "../../../utils/general/interactionReply"
import { createUserFriendlyError } from "../../../utils/general/errorSanitizer"

export default new Command({
    data: new SlashCommandBuilder()
        .setName("download")
        .setDescription(
            "🎥 Download videos from YouTube, Instagram, X (Twitter), and TikTok",
        )
        .addStringOption((option) =>
            option
                .setName("query")
                .setDescription(
                    "The video URL (YouTube, Instagram, X, TikTok) or search query",
                )
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("format")
                .setDescription("The format to download (video/audio)")
                .setRequired(true)
                .addChoices(
                    { name: `${EMOJIS.VIDEO} Video`, value: "video" },
                    { name: `${EMOJIS.AUDIO} Audio`, value: "audio" },
                ),
        ),
    category: "download",
    execute: async ({ interaction }: CommandExecuteParams): Promise<void> => {
        try {
            if (!(await requireGuild(interaction))) return
            const query = interaction.options.get("query")?.value as string
            const format = interaction.options.get("format")?.value as string

            if (!query || !format) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                "Missing required options",
                                interaction.user.id,
                            ),
                        ],
                    },
                })
                return
            }

            if (!["video", "audio"].includes(format)) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                "Invalid format. Please choose 'video' or 'audio'",
                                interaction.user.id,
                            ),
                        ],
                    },
                })
                return
            }

            await interactionReply({
                interaction,
                content: { content: "⬇️ Starting download..." },
            })
            infoLog({
                message: `Processing download request for query: ${query}`,
            })

            try {
                let videoUrl = query
                let videoTitle = "Video"
                let channelName = "Unknown"
                let duration = 0
                let thumbnail = ""

                if (isSupportedPlatformUrl(query)) {
                    videoUrl = query
                    const platform = getPlatformFromUrl(query)
                    infoLog({ message: `Processing ${platform} URL: ${query}` })

                    if (!isYouTubeUrl(query)) {
                        videoTitle = `${platform} Video`
                        channelName = platform
                        infoLog({
                            message: `Using basic info for ${platform} video`,
                        })
                    } else {
                        try {
                            const videoInfo = await play.video_info(videoUrl)
                            if (videoInfo) {
                                const video = videoInfo.video_details
                                videoTitle = video.title ?? videoTitle
                                channelName = video.channel?.name ?? channelName
                                duration = video.durationInSec ?? duration
                                thumbnail =
                                    video.thumbnails[0]?.url ?? thumbnail
                            }
                        } catch (error) {
                            infoLog({
                                message: `Could not fetch YouTube video info, using basic info`,
                                error,
                            })
                        }
                    }
                } else {
                    infoLog({ message: `Searching for video: ${query}` })
                    const searchResults = await play.search(query, { limit: 1 })

                    if (!searchResults || searchResults.length === 0) {
                        infoLog({
                            message: `No search results found for query: ${query}`,
                        })
                        await interactionReply({
                            interaction,
                            content: {
                                content:
                                    "❌ No videos found matching your search query.",
                            },
                        })
                        return
                    }

                    videoUrl = searchResults[0].url
                    infoLog({ message: `Found video URL: ${videoUrl}` })

                    try {
                        const videoInfo = await play.video_info(videoUrl)
                        if (videoInfo) {
                            const video = videoInfo.video_details
                            videoTitle = video.title ?? videoTitle
                            channelName = video.channel?.name ?? channelName
                            duration = video.durationInSec ?? duration
                            thumbnail = video.thumbnails[0]?.url ?? thumbnail
                        }
                    } catch (error) {
                        infoLog({
                            message: `Could not fetch video info, using basic info`,
                            error,
                        })
                    }
                }

                const embed = createEmbed({
                    title: `${videoTitle}`,
                    description: `**Platform:** ${getPlatformFromUrl(videoUrl)}\n**Channel:** ${channelName}\n**Duration:** ${duration > 0 ? formatDuration(duration) : "Unknown"}\n**Format:** ${format === "video" ? "🎬 Video" : "🎵 Audio"}`,
                    color: EMBED_COLORS.SUCCESS as ColorResolvable,
                    emoji: EMOJIS.DOWNLOAD,
                    thumbnail: thumbnail,
                    footer: `Requested by ${interaction.user.tag}`,
                    timestamp: true,
                })

                await interactionReply({
                    interaction,
                    content: { embeds: [embed] },
                })

                infoLog({ message: "Starting download" })
                const downloadResult = await downloadVideo(
                    videoUrl,
                    format as "video" | "audio",
                    videoTitle,
                )

                if (!downloadResult.success || !downloadResult.filePath) {
                    errorLog({
                        message: "Download failed",
                        error: downloadResult.error,
                    })
                    const userFriendlyError = createUserFriendlyError(
                        downloadResult.error,
                    )
                    const errorEmbed = createErrorEmbed(
                        userFriendlyError,
                        interaction.user.id,
                    )
                    await interactionReply({
                        interaction,
                        content: { embeds: [errorEmbed] },
                    })
                    return
                }

                const attachment = new AttachmentBuilder(
                    downloadResult.filePath,
                )

                infoLog({ message: "Sending completed file" })
                await interactionReply({
                    interaction,
                    content: { embeds: [embed], files: [attachment] },
                })

                try {
                    await deleteDownloadedFile(downloadResult.filePath)
                    infoLog({
                        message: `Successfully cleaned up file: ${downloadResult.filePath}`,
                    })
                } catch (cleanupError) {
                    errorLog({
                        message: "Failed to cleanup file after sending",
                        error: cleanupError,
                    })
                }

                successLog({
                    message: `Successfully downloaded and sent ${format} for: ${videoTitle}`,
                })
            } catch (error) {
                errorLog({ message: "Error processing video:", error })
                const userFriendlyError = createUserFriendlyError(error)
                const errorEmbed = createErrorEmbed(
                    userFriendlyError,
                    interaction.user.id,
                )
                await interactionReply({
                    interaction,
                    content: { embeds: [errorEmbed] },
                })
            }
        } catch (error) {
            errorLog({ message: "Error on download command:", error })
            const userFriendlyError = createUserFriendlyError(error)
            const errorEmbed = createErrorEmbed(
                userFriendlyError,
                interaction.user.id,
            )
            await interactionReply({
                interaction,
                content: { embeds: [errorEmbed] },
            })
        }
    },
})
