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
import {
    requireGuild,
    requireVoiceChannel,
    requireQueue,
} from "../../../utils/command/commandValidations"
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

export default new Command({
    data: new SlashCommandBuilder()
        .setName("play")
        .setDescription("🎵 Toca uma música do YouTube ou Spotify")
        .addStringOption((option) =>
            option
                .setName("query")
                .setDescription("A música para tocar (URL ou termo de busca)")
                .setRequired(true),
        )
        .addBooleanOption((option) =>
            option
                .setName("next")
                .setDescription("Tocar imediatamente após a música atual"),
        ),
    category: "music",
    execute: async ({ client, interaction }: ICommandExecuteParams) => {
        try {
            if (!(await requireGuild(interaction))) return
            if (!(await requireVoiceChannel(interaction))) return

            const member = interaction.member as GuildMember
            const voiceChannel = member.voice.channel

            const query = interaction.options.getString("query", true)
            const playNext = interaction.options.getBoolean("next", false)
            debugLog({ message: `Query: ${query}` })

            // Defer the interaction to prevent timeout
            await interaction.deferReply()

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
                    throw new Error("Spotify track não encontrado")
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
                    throw new Error(
                        "Nenhum resultado encontrado no YouTube para a música do Spotify",
                    )
                tracksToAdd = [searchResult.tracks[0]]
                playlistTitle = spData.name
            } else if (isSpotifyPlaylist) {
                const spData = await play.spotify(query)
                if (!spData || spData.type !== "playlist")
                    throw new Error("Spotify playlist não encontrada")
                const tracks =
                    "tracks" in spData && Array.isArray(spData.tracks)
                        ? spData.tracks
                        : []
                if (!tracks || tracks.length === 0)
                    throw new Error(
                        "Nenhuma música encontrada na playlist do Spotify",
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
                    throw new Error(
                        "Nenhuma música da playlist do Spotify foi encontrada no YouTube",
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
                    throw new Error(
                        enhancedResult.error ??
                            "Nenhuma música encontrada na playlist do YouTube",
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
                    throw new Error(
                        enhancedResult.error ??
                            `Nenhum resultado encontrado para: **${query}**`,
                    )
                }

                tracksToAdd = [enhancedResult.result.tracks[0]]
                playlistTitle = enhancedResult.result.tracks[0].title
            }

            if (!interaction.guild) {
                await interaction.editReply({
                    embeds: [
                        createEmbed({
                            title: "Erro",
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
                errorLog({
                    message: "Error connecting to voice channel:",
                    error,
                })
                await interaction.editReply({
                    embeds: [
                        createEmbed({
                            title: "Erro de conexão",
                            description:
                                "Não foi possível conectar ao canal de voz!",
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
                    title: isPlaylist
                        ? "Playlist adicionada"
                        : "Música adicionada",
                    description: isPlaylist
                        ? `Adicionada à fila: [**${playlistTitle}**](${query}) com ${tracksToAdd.length} músicas${tracksToAdd.length === 50 ? " (limitado a 50 músicas)" : ""}`
                        : `Adicionado à fila: [**${playlistTitle}**](${tracksToAdd[0].url})`,
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
                // For new tracks, just acknowledge the interaction without sending a message
                // The playerStart event will handle the "Tocando Agora" message
                try {
                    await interaction.editReply({
                        content: "✅",
                    })
                } catch (replyError) {
                    errorLog({
                        message: "Failed to acknowledge interaction:",
                        error: replyError,
                    })
                }
            }
        } catch (searchError) {
            const errorObj = searchError as Error

            // Log YouTube-specific errors with enhanced logging
            if (isRecoverableYouTubeError(errorObj)) {
                logYouTubeError(errorObj, "play command")
            } else {
                errorLog({
                    message: "Error searching for content:",
                    error: searchError,
                })
            }

            try {
                await interaction.editReply({
                    embeds: [
                        createEmbed({
                            title: "Erro de busca",
                            description:
                                typeof searchError === "string"
                                    ? searchError
                                    : errorObj.message ||
                                      messages.error.noTrack,
                            color: EMBED_COLORS.ERROR as ColorResolvable,
                            emoji: EMOJIS.ERROR,
                        }),
                    ],
                })
            } catch (replyError) {
                errorLog({
                    message: "Failed to send error reply to interaction:",
                    error: replyError,
                })
            }
        }
    },
})
