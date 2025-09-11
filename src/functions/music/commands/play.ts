import { SlashCommandBuilder } from "@discordjs/builders"
import type { GuildMember } from "discord.js"
import type { Track } from "discord-player"
import { QueryType, QueueRepeatMode } from "discord-player"
import play from "play-dl"
import { debugLog, errorLog } from "../../../utils/general/log"
import { constants } from "../../../config/config"
import Command from "../../../models/Command"
import {
    createEmbed,
    EMBED_COLORS,
    EMOJIS,
} from "../../../utils/general/embeds"
import { requireQueue } from "../../../utils/command/commandValidations"
import type { ICommandExecuteParams } from "../../../types/CommandData"
import { messages } from "../../../utils/general/messages"
import type { ColorResolvable } from "discord.js"
import {
    enhancedYouTubeSearch,
    enhancedAutoSearch,
} from "../../../utils/music/enhancedSearch"
import {
    logYouTubeError,
    isRecoverableYouTubeError,
} from "../../../utils/music/youtubeErrorHandler"
import {
    handleError,
    createUserErrorMessage,
} from "../../../utils/error/errorHandler"
import { MusicError, YouTubeError, ErrorCode } from "../../../types/errors"

export default new Command({
    data: new SlashCommandBuilder()
        .setName("play")
        .setDescription("🎵 Play a song from YouTube or Spotify")
        .addStringOption((option) =>
            option
                .setName("query")
                .setDescription("The song to play (URL or search term)")
                .setRequired(true),
        )
        .addBooleanOption((option) =>
            option
                .setName("next")
                .setDescription("Play immediately after the current song"),
        ),
    category: "music",
    execute: async ({ client, interaction }: ICommandExecuteParams) => {
        try {
            // Defer the interaction first to prevent timeout
            await interaction.deferReply()

            // Inline validation to avoid interaction issues
            if (!interaction.guildId) {
                await interaction.editReply({
                    embeds: [
                        createEmbed({
                            title: "Error",
                            description:
                                "This command can only be used in a server!",
                            color: EMBED_COLORS.ERROR as ColorResolvable,
                            emoji: EMOJIS.ERROR,
                        }),
                    ],
                })
                return
            }

            const member = interaction.member as GuildMember
            if (!member?.voice?.channel) {
                await interaction.editReply({
                    embeds: [
                        createEmbed({
                            title: "Error",
                            description: "You need to be in a voice channel!",
                            color: EMBED_COLORS.ERROR as ColorResolvable,
                            emoji: EMOJIS.ERROR,
                        }),
                    ],
                })
                return
            }

            const voiceChannel = member.voice.channel

            const query = interaction.options.getString("query", true)
            const playNext = interaction.options.getBoolean("next", false)
            debugLog({ message: `Query: ${query}` })

            const spotifyTrackRegex =
                /https?:\/\/(open\.)?spotify\.com\/track\/[a-zA-Z0-9]+/
            const spotifyPlaylistRegex =
                /https?:\/\/(open\.)?spotify\.com\/playlist\/[a-zA-Z0-9]+/
            const isSpotifyTrack = spotifyTrackRegex.test(query)
            const isSpotifyPlaylist = spotifyPlaylistRegex.test(query)
            const isYouTubePlaylist =
                /https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.*[?&]list=([a-zA-Z0-9_-]+)/.test(
                    query,
                )
            const isYouTubeUrl =
                /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/.test(query)

            debugLog({
                message: `Query type: ${isSpotifyTrack ? "Spotify Track" : isSpotifyPlaylist ? "Spotify Playlist" : isYouTubePlaylist ? "YouTube Playlist" : isYouTubeUrl ? "YouTube URL" : "Search Term"}`,
            })

            let tracksToAdd: Track[] = []
            let playlistTitle = ""
            let isPlaylist = false
            if (isSpotifyTrack) {
                const spData = await play.spotify(query)
                if (!spData || spData.type !== "track")
                    throw new MusicError(
                        ErrorCode.MUSIC_TRACK_NOT_FOUND,
                        "Spotify track not found",
                        {
                            guildId: interaction.guild?.id,
                            userId: interaction.user.id,
                            query,
                        },
                    )
                const artistName =
                    "artists" in spData &&
                    Array.isArray(spData.artists) &&
                    spData.artists.length > 0
                        ? spData.artists[0].name
                        : ""
                const searchResult = await client.player.search(
                    `${spData.name} ${artistName}`,
                    {
                        requestedBy: interaction.user,
                        searchEngine: QueryType.YOUTUBE_SEARCH,
                    },
                )
                if (!searchResult?.tracks.length)
                    throw new YouTubeError(
                        "No YouTube results found for the Spotify song",
                        {
                            guildId: interaction.guild?.id,
                            userId: interaction.user.id,
                            query,
                            originalError: "Spotify track not found on YouTube",
                        },
                    )
                tracksToAdd = [searchResult.tracks[0]]
                playlistTitle = spData.name
            } else if (isSpotifyPlaylist) {
                const spData = await play.spotify(query)
                if (!spData || spData.type !== "playlist")
                    throw new MusicError(
                        ErrorCode.MUSIC_PLAYLIST_NOT_FOUND,
                        "Spotify playlist not found",
                        {
                            guildId: interaction.guild?.id,
                            userId: interaction.user.id,
                            query,
                        },
                    )
                const tracks =
                    "tracks" in spData && Array.isArray(spData.tracks)
                        ? spData.tracks
                        : []
                if (!tracks || tracks.length === 0)
                    throw new MusicError(
                        ErrorCode.MUSIC_PLAYLIST_NOT_FOUND,
                        "No songs found in the Spotify playlist",
                        {
                            guildId: interaction.guild?.id,
                            userId: interaction.user.id,
                            query,
                        },
                    )
                const limitedTracks = tracks.slice(0, 50)
                const foundTracks: Track[] = []
                for (const track of limitedTracks) {
                    const artistName =
                        "artists" in track &&
                        Array.isArray(track.artists) &&
                        track.artists.length > 0
                            ? track.artists[0].name
                            : ""
                    const searchResult = await client.player.search(
                        `${track.name} ${artistName}`,
                        {
                            requestedBy: interaction.user,
                            searchEngine: QueryType.YOUTUBE_SEARCH,
                        },
                    )
                    if (searchResult && searchResult.tracks.length > 0) {
                        foundTracks.push(searchResult.tracks[0])
                    }
                }
                if (foundTracks.length === 0)
                    throw new YouTubeError(
                        "No Spotify playlist songs were found on YouTube",
                        {
                            guildId: interaction.guild?.id,
                            userId: interaction.user.id,
                            query,
                            originalError:
                                "Spotify playlist songs not found on YouTube",
                        },
                    )
                tracksToAdd = foundTracks
                playlistTitle = spData.name
                isPlaylist = true
            } else if (isYouTubePlaylist) {
                const enhancedResult = await enhancedYouTubeSearch(
                    client.player,
                    query,
                    interaction.user,
                    true, // isPlaylist
                )

                if (
                    !enhancedResult.success ||
                    !enhancedResult.result?.tracks.length
                ) {
                    throw new YouTubeError(
                        enhancedResult.error ??
                            "No songs found in the YouTube playlist",
                        {
                            guildId: interaction.guild?.id,
                            userId: interaction.user.id,
                            query,
                            originalError: enhancedResult.error,
                        },
                    )
                }

                tracksToAdd = enhancedResult.result.tracks.slice(0, 100)
                playlistTitle =
                    enhancedResult.result.playlist?.title ?? "YouTube Playlist"
                isPlaylist = true
            } else {
                const enhancedResult = await enhancedAutoSearch(
                    client.player,
                    query,
                    interaction.user,
                )

                if (
                    !enhancedResult.success ||
                    !enhancedResult.result?.tracks.length
                ) {
                    throw new YouTubeError(
                        enhancedResult.error ??
                            `No results found for: **${query}**`,
                        {
                            guildId: interaction.guild?.id,
                            userId: interaction.user.id,
                            query,
                            originalError: enhancedResult.error,
                        },
                    )
                }

                tracksToAdd = [enhancedResult.result.tracks[0]]
                playlistTitle = enhancedResult.result.tracks[0].title
            }

            if (!interaction.guild) {
                await interaction.editReply({
                    embeds: [
                        createEmbed({
                            title: "Error",
                            description: messages.error.guildOnly,
                            color: EMBED_COLORS.ERROR as ColorResolvable,
                            emoji: EMOJIS.ERROR,
                        }),
                    ],
                })
                return
            }

            const queue = client.player.nodes.create(interaction.guild, {
                metadata: {
                    channel: interaction.channel,
                    client: interaction.guild.members.me,
                    requestedBy: interaction.user,
                },
                selfDeaf: true,
                volume: constants.VOLUME,
                leaveOnEmpty: true,
                leaveOnEmptyCooldown: 300000,
                leaveOnEnd: true,
                leaveOnEndCooldown: 300000,
            })

            if (!(await requireQueue(queue, interaction))) return

            try {
                if (!queue.connection && voiceChannel) {
                    await queue.connect(voiceChannel)
                }
            } catch (error) {
                const structuredError = handleError(
                    error,
                    "voice channel connection",
                    {
                        guildId: interaction.guild?.id,
                        channelId: voiceChannel?.id,
                        userId: interaction.user.id,
                    },
                )

                await interaction.editReply({
                    embeds: [
                        createEmbed({
                            title: "Connection error",
                            description:
                                createUserErrorMessage(structuredError),
                            color: EMBED_COLORS.ERROR as ColorResolvable,
                            emoji: EMOJIS.ERROR,
                        }),
                    ],
                })
                queue.delete()
                return
            }

            if (playNext) {
                queue.tracks.add(tracksToAdd)
            } else {
                const isManualRequest = tracksToAdd.every(
                    (track) => track.requestedBy?.id !== client.user?.id,
                )

                if (isManualRequest && queue.tracks.size > 0) {
                    const trackArray = queue.tracks.toArray()
                    const firstAutoplayIndex = trackArray.findIndex(
                        (track) => track.requestedBy?.id === client.user?.id,
                    )

                    if (firstAutoplayIndex !== -1) {
                        const before = trackArray.slice(0, firstAutoplayIndex)
                        const after = trackArray.slice(firstAutoplayIndex)
                        queue.tracks.clear()
                        queue.tracks.add([...before, ...tracksToAdd, ...after])
                        debugLog({
                            message: `Prioritized ${tracksToAdd.length} manual track(s) before autoplay tracks`,
                            data: { tracks: tracksToAdd.map((t) => t.title) },
                        })
                    } else {
                        queue.addTrack(tracksToAdd)
                    }
                } else {
                    queue.addTrack(tracksToAdd)
                }
            }

            const wasPlaying = queue.isPlaying()

            // Enable autoplay by default for all new tracks
            if (!wasPlaying) {
                queue.setRepeatMode(QueueRepeatMode.AUTOPLAY)
            }

            if (!wasPlaying) {
                await queue.node.play()
            }

            // Only send a reply when music is already playing (to avoid duplication with playerStart event)
            if (wasPlaying) {
                const embed = createEmbed({
                    title: isPlaylist ? "Playlist added" : "Song added",
                    description: isPlaylist
                        ? `Added to queue: [**${playlistTitle}**](${query}) with ${tracksToAdd.length} songs${tracksToAdd.length === 50 ? " (limited to 50 songs)" : ""}`
                        : `Added to queue: [**${playlistTitle}**](${tracksToAdd[0].url})`,
                    color: EMBED_COLORS.MUSIC as ColorResolvable,
                    emoji: EMOJIS.MUSIC,
                    thumbnail: tracksToAdd[0].thumbnail,
                    timestamp: true,
                })

                try {
                    await interaction.editReply({
                        embeds: [embed],
                    })
                } catch (replyError) {
                    errorLog({
                        message: "Failed to send success reply to interaction:",
                        error: replyError,
                    })
                }
            } else {
                // For new tracks, we'll handle the reply directly here
                // since we know the track will start playing immediately
                try {
                    // Create the playing embed immediately
                    const track = tracksToAdd[0]

                    // Format duration
                    const formatDuration = (duration: string) => {
                        if (!duration || duration === "0:00")
                            return "Unknown duration"
                        return duration
                    }

                    // Determine source
                    const getSource = (url: string) => {
                        if (
                            url.includes("youtube.com") ||
                            url.includes("youtu.be")
                        )
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
                                name: "👤 Requisitado",
                                value: requesterInfo,
                                inline: true,
                            },
                        ],
                    })

                    // Send the embed as the interaction reply
                    await interaction.editReply({
                        embeds: [embed],
                    })

                    debugLog({
                        message: "Sent playing embed as interaction reply",
                        data: {
                            guildId: interaction.guild?.id,
                            userId: interaction.user.id,
                            trackTitle: track.title,
                        },
                    })
                } catch (replyError) {
                    errorLog({
                        message:
                            "Failed to send playing embed as interaction reply:",
                        error: replyError,
                    })
                }
            }
        } catch (searchError) {
            const errorObj = searchError as Error

            // Handle YouTube-specific errors with structured approach
            let structuredError
            if (isRecoverableYouTubeError(errorObj)) {
                structuredError = logYouTubeError(errorObj, "play command", {
                    guildId: interaction.guild?.id,
                    userId: interaction.user.id,
                    query: interaction.options.getString("query", true),
                })
            } else {
                structuredError = handleError(searchError, "music search", {
                    guildId: interaction.guild?.id,
                    userId: interaction.user.id,
                    query: interaction.options.getString("query", true),
                })
            }

            try {
                await interaction.editReply({
                    embeds: [
                        createEmbed({
                            title: "Search error",
                            description:
                                createUserErrorMessage(structuredError),
                            color: EMBED_COLORS.ERROR as ColorResolvable,
                            emoji: EMOJIS.ERROR,
                        }),
                    ],
                })
            } catch (replyError) {
                const replyStructuredError = handleError(
                    replyError,
                    "error reply",
                    {
                        guildId: interaction.guild?.id,
                        userId: interaction.user.id,
                        originalError: structuredError.code,
                    },
                )

                errorLog({
                    message: "Failed to send error reply to interaction",
                    error: replyStructuredError,
                    correlationId: replyStructuredError.metadata.correlationId,
                })
            }
        }
    },
})
