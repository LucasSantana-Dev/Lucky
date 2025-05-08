import { SlashCommandBuilder } from '@discordjs/builders';
import { GuildMember } from 'discord.js';
import { QueryType, Track } from 'discord-player';
import play from 'play-dl';
import { debugLog, errorLog } from '../../../utils/general/log';
import { constants } from '../../../config/config';
import Command from '../../../models/Command';
import { createEmbed, EMBED_COLORS, EMOJIS } from '../../../utils/general/embeds';
import { requireGuild, requireVoiceChannel, requireQueue } from '../../../utils/command/commandValidations';
import { CommandExecuteParams } from '../../../types/CommandData';
import { messages } from '../../../utils/general/messages';
import { ColorResolvable } from 'discord.js';
import { interactionReply } from '../../../utils/general/interactionReply';

export default new Command({
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('🎵 Toca uma música do YouTube ou Spotify')
        .addStringOption(option => option.setName('query')
            .setDescription('A música para tocar (URL ou termo de busca)')
            .setRequired(true))
        .addBooleanOption(option =>
            option.setName('next')
                .setDescription('Tocar imediatamente após a música atual')
        ),
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return;
        if (!(await requireVoiceChannel(interaction))) return;

        const member = interaction.member as GuildMember;
        const voiceChannel = member.voice.channel;

        const query = interaction.options.getString('query', true);
        const playNext = interaction.options.getBoolean('next', false);
        debugLog({ message: `Query: ${query}` });

        await interactionReply({ interaction, content: { content: '' } });

        // Regex for Spotify and YouTube URLs
        const spotifyTrackRegex = /https?:\/\/(open\.)?spotify\.com\/track\/[a-zA-Z0-9]+/;
        const spotifyPlaylistRegex = /https?:\/\/(open\.)?spotify\.com\/playlist\/[a-zA-Z0-9]+/;
        const isSpotifyTrack = spotifyTrackRegex.test(query);
        const isSpotifyPlaylist = spotifyPlaylistRegex.test(query);
        const isYouTubePlaylist = /https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.*[?&]list=([a-zA-Z0-9_-]+)/.test(query);
        const isYouTubeUrl = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/.test(query);

        debugLog({ message: `Query type: ${isSpotifyTrack ? 'Spotify Track' : isSpotifyPlaylist ? 'Spotify Playlist' : isYouTubePlaylist ? 'YouTube Playlist' : isYouTubeUrl ? 'YouTube URL' : 'Search Term'}` });

        let tracksToAdd: Track[] = [];
        let playlistTitle = '';
        let isPlaylist = false;

        try {
            if (isSpotifyTrack) {
                const spData = await play.spotify(query);
                if (!spData || spData.type !== 'track') throw new Error('Spotify track não encontrado');
                // Only access artists if type is 'track'
                const artistName = 'artists' in spData && Array.isArray(spData.artists) && spData.artists.length > 0 ? spData.artists[0].name : '';
                const searchResult = await client.player.search(`${spData.name} ${artistName}`, {
                    requestedBy: interaction.user,
                    searchEngine: QueryType.YOUTUBE_SEARCH
                });
                if (!searchResult || !searchResult.tracks.length) throw new Error('Nenhum resultado encontrado no YouTube para a música do Spotify');
                tracksToAdd = [searchResult.tracks[0] as Track];
                playlistTitle = spData.name;
            } else if (isSpotifyPlaylist) {
                const spData = await play.spotify(query);
                if (!spData || spData.type !== 'playlist') throw new Error('Spotify playlist não encontrada');
                // Only access tracks if type is 'playlist'
                const tracks = 'tracks' in spData && Array.isArray(spData.tracks) ? spData.tracks : [];
                if (!tracks || tracks.length === 0) throw new Error('Nenhuma música encontrada na playlist do Spotify');
                const limitedTracks = tracks.slice(0, 50);
                const foundTracks: Track[] = [];
                for (const track of limitedTracks) {
                    const artistName = 'artists' in track && Array.isArray(track.artists) && track.artists.length > 0 ? track.artists[0].name : '';
                    const searchResult = await client.player.search(`${track.name} ${artistName}`, {
                        requestedBy: interaction.user,
                        searchEngine: QueryType.YOUTUBE_SEARCH
                    });
                    if (searchResult && searchResult.tracks.length > 0) {
                        foundTracks.push(searchResult.tracks[0] as Track);
                    }
                }
                if (foundTracks.length === 0) throw new Error('Nenhuma música da playlist do Spotify foi encontrada no YouTube');
                tracksToAdd = foundTracks;
                playlistTitle = spData.name;
                isPlaylist = true;
            } else if (isYouTubePlaylist) {
                // Handle YouTube playlist by URL
                const searchResult = await client.player.search(query, {
                    requestedBy: interaction.user,
                    searchEngine: QueryType.YOUTUBE_PLAYLIST
                });
                if (!searchResult || !searchResult.tracks.length) throw new Error('Nenhuma música encontrada na playlist do YouTube');
                tracksToAdd = searchResult.tracks.slice(0, 100) as Track[]; // Limit to 100
                playlistTitle = searchResult.playlist?.title || 'YouTube Playlist';
                isPlaylist = true;
            } else {
                // Default: YouTube search (single track or video URL)
                const searchResult = await client.player.search(query, {
                    requestedBy: interaction.user,
                    searchEngine: isYouTubeUrl ? QueryType.YOUTUBE_VIDEO : QueryType.AUTO
                });
                if (!searchResult || !searchResult.tracks.length) throw new Error(`Nenhum resultado encontrado para: **${query}**`);
                tracksToAdd = [searchResult.tracks[0] as Track];
                playlistTitle = searchResult.tracks[0].title;
            }

            if (!interaction.guild) {
                await interactionReply({
                    interaction,
                    content: { embeds: [createEmbed({
                        title: 'Erro',
                        description: messages.error.guildOnly,
                        color: EMBED_COLORS.ERROR as ColorResolvable,
                        emoji: EMOJIS.ERROR
                    })] }
                });
                return;
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
            });

            if (!(await requireQueue(queue, interaction))) return;

            try {
                if (!queue.connection) {
                    await queue.connect(voiceChannel!);
                }
            } catch (error) {
                errorLog({ message: 'Error connecting to voice channel:', error });
                await interactionReply({
                    interaction,
                    content: { embeds: [createEmbed({
                        title: 'Erro de conexão',
                        description: 'Não foi possível conectar ao canal de voz!',
                        color: EMBED_COLORS.ERROR as ColorResolvable,
                        emoji: EMOJIS.ERROR
                    })] }
                });
                queue.delete();
                return;
            }

            if (playNext) {
                queue.tracks.add(tracksToAdd);
            } else {
                // Prioritize manual tracks before autoplay tracks
                const isManual = !isPlaylist || (isPlaylist && tracksToAdd.every(track => track.requestedBy?.id !== client.user?.id));
                if (isManual && queue.tracks.size > 0) {
                    // Find the first autoplay track
                    const trackArray = queue.tracks.toArray();
                    const firstAutoplayIndex = trackArray.findIndex(track => track.requestedBy?.id === client.user?.id);
                    if (firstAutoplayIndex !== -1) {
                        // Insert manual tracks before the first autoplay track
                        const before = trackArray.slice(0, firstAutoplayIndex);
                        const after = trackArray.slice(firstAutoplayIndex);
                        queue.tracks.clear();
                        queue.tracks.add([...before, ...tracksToAdd, ...after]);
                    } else {
                        queue.addTrack(tracksToAdd);
                    }
                } else {
                    queue.addTrack(tracksToAdd);
                }
            }

            if (!queue.isPlaying()) {
                await queue.node.play();
            }

            // Create embed with appropriate message
            const embed = createEmbed({
                title: isPlaylist ? 'Playlist adicionada' : 'Música adicionada',
                description: isPlaylist
                    ? `Adicionada à fila: [**${playlistTitle}**](${query}) com ${tracksToAdd.length} músicas${tracksToAdd.length === 50 ? ' (limitado a 50 músicas)' : ''}`
                    : `Adicionado à fila: [**${playlistTitle}**](${tracksToAdd[0].url})`,
                color: EMBED_COLORS.MUSIC as ColorResolvable,
                emoji: EMOJIS.MUSIC,
                thumbnail: tracksToAdd[0].thumbnail,
                timestamp: true
            });

            await interactionReply({
                interaction,
                content: { embeds: [embed] }
            });
        } catch (searchError) {
            errorLog({ message: 'Error searching for content:', error: searchError });
            await interactionReply({
                interaction,
                content: { embeds: [createEmbed({
                    title: 'Erro de busca',
                    description: typeof searchError === 'string' ? searchError : (searchError as Error).message || messages.error.noTrack,
                    color: EMBED_COLORS.ERROR as ColorResolvable,
                    emoji: EMOJIS.ERROR
                })] }
            });
        }
    }
}); 