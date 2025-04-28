import { SlashCommandBuilder } from '@discordjs/builders';
import { GuildMember } from 'discord.js';
import { QueryType } from 'discord-player';
import { debugLog, errorLog } from '@/utils/log';
import { constants } from '@/config/config';
import Command from '@/models/Command';
import { interactionReply } from '@/handlers/interactionHandler';
import { errorEmbed, musicEmbed } from '@/utils/embeds';

export default new Command({
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('🎵 Toca uma música do YouTube ou Spotify')
        .addStringOption(option => option.setName('query')
            .setDescription('A música para tocar (URL ou termo de busca)')
            .setRequired(true)) as SlashCommandBuilder,
    execute: async ({ client, interaction }) => {
        try {
            if (!interaction.guildId) {
                await interaction.reply({
                    embeds: [errorEmbed('Erro', 'Este comando só pode ser usado em um servidor!')]
                });
                return;
            }

            const member = interaction.member as GuildMember;
            const voiceChannel = member.voice.channel;

            if (!voiceChannel) {
                await interaction.reply({
                    embeds: [errorEmbed('Erro', 'Você precisa estar em um canal de voz!')]
                });
                return;
            }

            const query = interaction.options.getString('query', true);
            debugLog({ message: `Query: ${query}` });

            await interaction.deferReply();

            // Check if the query is a playlist URL or a valid YouTube URL
            const isPlaylist = query.includes('playlist?list=');
            const isYouTubeUrl = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/.test(query);
            debugLog({ message: `Query is ${isPlaylist ? 'a playlist' : isYouTubeUrl ? 'a YouTube URL' : 'a search term'}` });

            try {
                // Search for content with appropriate search engine
                let searchResult = await client.player.search(query, {
                    requestedBy: interaction.user,
                    searchEngine: isPlaylist ? QueryType.YOUTUBE_PLAYLIST : QueryType.YOUTUBE_SEARCH
                });

                if (!searchResult || !searchResult.tracks.length) {
                    // If no results with playlist search, try regular search
                    if (isPlaylist) {
                        debugLog({ message: 'No results with playlist search, trying regular search' });
                        const regularSearch = await client.player.search(query, {
                            requestedBy: interaction.user,
                            searchEngine: QueryType.YOUTUBE_SEARCH
                        });

                        if (regularSearch && regularSearch.tracks.length > 0) {
                            searchResult = regularSearch;
                        }
                    }

                    if (!searchResult || !searchResult.tracks.length) {
                        await interaction.editReply({
                            embeds: [errorEmbed('Erro', `Nenhum resultado encontrado para: **${query}**`)]
                        });
                        return;
                    }
                }

                if (!interaction.guild) {
                    await interaction.editReply({
                        embeds: [errorEmbed('Erro', 'Este comando só pode ser usado em um servidor!')]
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

                try {
                    if (!queue.connection) {
                        await queue.connect(voiceChannel);
                    }
                } catch (error) {
                    errorLog({ message: 'Error connecting to voice channel:', error });
                    await interaction.editReply({
                        embeds: [errorEmbed('Erro de conexão', 'Não foi possível conectar ao canal de voz!')]
                    });
                    queue.delete();
                    return;
                }

                // Add all tracks from the search result
                const tracks = searchResult.tracks;

                // Limit the number of tracks to add if it's a large playlist
                const maxTracks = 100; // Maximum number of tracks to add at once
                const tracksToAdd = tracks.length > maxTracks ? tracks.slice(0, maxTracks) : tracks;

                queue.addTrack(tracksToAdd);

                if (!queue.isPlaying()) {
                    await queue.node.play();
                }

                // Create embed with appropriate message based on whether it's a playlist or single track
                const embed = musicEmbed(
                    isPlaylist ? 'Playlist adicionada' : 'Música adicionada',
                    isPlaylist
                        ? `Adicionada à fila: **${searchResult.playlist?.title || 'Playlist'}** com ${tracksToAdd.length} músicas${tracks.length > maxTracks ? ` (limitado a ${maxTracks} músicas)` : ''}`
                        : `Adicionado à fila: **${tracksToAdd[0].title}** por **${tracksToAdd[0].author}**`
                );

                if (tracksToAdd[0].thumbnail) {
                    embed.setThumbnail(tracksToAdd[0].thumbnail);
                }

                await interaction.editReply({
                    embeds: [embed]
                });
            } catch (searchError) {
                errorLog({ message: 'Error searching for content:', error: searchError });
                await interaction.editReply({
                    embeds: [errorEmbed('Erro de busca', 'Ocorreu um erro ao buscar o conteúdo. Por favor, verifique se a URL é válida ou tente um termo de busca diferente.')]
                });
            }
        } catch (error) {
            errorLog({ message: 'Error in play command:', error });
            if (!interaction.replied && !interaction.deferred) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [errorEmbed('Erro', 'Ocorreu um erro ao executar o comando. Por favor, tente novamente.')]
                    }
                });
            } else if (interaction.deferred) {
                await interaction.editReply({
                    embeds: [errorEmbed('Erro', 'Ocorreu um erro ao executar o comando. Por favor, tente novamente.')]
                });
            }
        }
    }
}); 