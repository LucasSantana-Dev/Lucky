import { SlashCommandBuilder } from '@discordjs/builders';
import { ChannelType, EmbedBuilder } from 'discord.js';
import { QueryType } from 'discord-player';
import Command from '../../../models/Command';
import { debugLog, errorLog, infoLog } from '../../../utils/log';
import { constants } from '../../../config/config';
const command = new Command({
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song from YouTube or Spotify')
        .addStringOption(option => option.setName('query')
        .setDescription('The song to play (URL or search term)')
        .setRequired(true)),
    execute: async ({ client, interaction }) => {
        if (!interaction.guildId) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#FF0000')
                        .setDescription('❌ This command can only be used in a server!')
                ],
                ephemeral: true
            });
            return;
        }
        const member = interaction.member;
        debugLog({ message: `Member: ${member.user.username}, ID: ${member.id}` });
        debugLog({ message: `Voice state: ${JSON.stringify(member.voice)}` });
        const voiceChannel = member.voice.channel;
        debugLog({ message: `Voice channel: ${voiceChannel ? voiceChannel.name : 'None'}` });
        if (!voiceChannel) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#FF0000')
                        .setDescription('❌ You need to be in a voice channel!')
                ],
                ephemeral: true
            });
            return;
        }
        if (voiceChannel.type !== ChannelType.GuildVoice) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#FF0000')
                        .setDescription('❌ You need to be in a regular voice channel!')
                ],
                ephemeral: true
            });
            return;
        }
        const query = interaction.options.getString('query', true);
        debugLog({ message: `Query: ${query}` });
        try {
            await interaction.deferReply();
            infoLog({ message: `Starting search process for: ${query}` });
            // Check if the query is a URL
            const isUrl = /^https?:\/\//.test(query);
            debugLog({ message: `Query is ${isUrl ? 'a URL' : 'a search term'}` });
            // Try YouTube search first
            debugLog({ message: `Using YOUTUBE_SEARCH engine for query: ${query}` });
            const searchResult = await client.player.search(query, {
                requestedBy: interaction.user,
                searchEngine: QueryType.YOUTUBE_SEARCH
            });
            if (!searchResult || !searchResult.tracks.length) {
                infoLog({ message: `No results found with YOUTUBE_SEARCH for: ${query}` });
                // Try AUTO search as fallback
                debugLog({ message: `Trying AUTO search engine as fallback for query: ${query}` });
                const autoSearchResult = await client.player.search(query, {
                    requestedBy: interaction.user,
                    searchEngine: QueryType.AUTO
                });
                if (!autoSearchResult || !autoSearchResult.tracks.length) {
                    infoLog({ message: `No results found with AUTO search for: ${query}` });
                    await interaction.followUp({
                        embeds: [
                            new EmbedBuilder()
                                .setColor('#FF0000')
                                .setDescription(`❌ No results found for: **${query}**\nPlease try a different search term or check if the URL is valid.`)
                        ],
                        ephemeral: true
                    });
                    return;
                }
                infoLog({ message: `Found ${autoSearchResult.tracks.length} results with AUTO search for: ${query}` });
                const track = autoSearchResult.tracks[0];
                infoLog({
                    message: `Selected track: ${track.title} (${track.url})\nDuration: ${track.duration}\nAuthor: ${track.author}`
                });
                if (!interaction.guild) {
                    await interaction.followUp({
                        embeds: [
                            new EmbedBuilder()
                                .setColor('#FF0000')
                                .setDescription('❌ This command can only be used in a server!')
                        ],
                        ephemeral: true
                    });
                    return;
                }
                infoLog({ message: `Creating queue for guild: ${interaction.guild.name}` });
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
                        debugLog({ message: `Connecting to voice channel: ${voiceChannel.name}` });
                        await queue.connect(voiceChannel);
                        debugLog({ message: `Connected to voice channel: ${voiceChannel.name}` });
                    }
                }
                catch (error) {
                    errorLog({ message: `Error connecting to voice channel: ${error}` });
                    queue.delete();
                    await interaction.followUp({
                        embeds: [
                            new EmbedBuilder()
                                .setColor('#FF0000')
                                .setDescription('❌ Could not join your voice channel! Please check if I have the necessary permissions.')
                        ],
                        ephemeral: true
                    });
                    return;
                }
                infoLog({ message: `Adding track to queue: ${track.title}` });
                queue.addTrack(track);
                if (!queue.isPlaying()) {
                    infoLog({ message: `Starting playback of: ${track.title}` });
                    try {
                        // Add a small delay before playing to ensure everything is ready
                        setTimeout(async () => {
                            try {
                                await queue.node.play();
                                infoLog({ message: `Successfully started playback of: ${track.title}` });
                            }
                            catch (playError) {
                                errorLog({ message: `Error starting playback: ${playError}` });
                                await interaction.followUp({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setColor('#FF0000')
                                            .setDescription('❌ There was an error starting playback! Please try again or check if the track is available.')
                                    ],
                                    ephemeral: true
                                });
                            }
                        }, 1000);
                    }
                    catch (error) {
                        errorLog({ message: `Error starting playback: ${error}` });
                        await interaction.followUp({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor('#FF0000')
                                    .setDescription('❌ There was an error starting playback! Please try again or check if the track is available.')
                            ],
                            ephemeral: true
                        });
                        return;
                    }
                }
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('🎵 Added to Queue')
                    .setDescription(`**[${track.title}](${track.url})**`)
                    .addFields({ name: '👤 Author', value: track.author, inline: true }, { name: '⏱️ Duration', value: track.duration, inline: true }, { name: '🎵 Requested by', value: interaction.user.toString(), inline: true })
                    .setThumbnail(track.thumbnail || null)
                    .setFooter({ text: 'Use /queue to see the current queue' });
                await interaction.editReply({
                    content: '🎵 Track added to queue!',
                    embeds: [embed]
                });
            }
            infoLog({ message: `Found ${searchResult.tracks.length} results with YOUTUBE_SEARCH for: ${query}` });
            const track = searchResult.tracks[0];
            infoLog({
                message: `Selected track: ${track.title} (${track.url})\nDuration: ${track.duration}\nAuthor: ${track.author}`
            });
            if (!interaction.guild) {
                await interaction.followUp({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#FF0000')
                            .setDescription('❌ This command can only be used in a server!')
                    ],
                    ephemeral: true
                });
                return;
            }
            infoLog({ message: `Creating queue for guild: ${interaction.guild.name}` });
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
                    debugLog({ message: `Connecting to voice channel: ${voiceChannel.name}` });
                    await queue.connect(voiceChannel);
                    debugLog({ message: `Connected to voice channel: ${voiceChannel.name}` });
                }
            }
            catch (error) {
                errorLog({ message: `Error connecting to voice channel: ${error}` });
                queue.delete();
                await interaction.followUp({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#FF0000')
                            .setDescription('❌ Could not join your voice channel! Please check if I have the necessary permissions.')
                    ],
                    ephemeral: true
                });
                return;
            }
            infoLog({ message: `Adding track to queue: ${track.title}` });
            queue.addTrack(track);
            if (!queue.isPlaying()) {
                infoLog({ message: `Starting playback of: ${track.title}` });
                try {
                    // Add a small delay before playing to ensure everything is ready
                    setTimeout(async () => {
                        try {
                            await queue.node.play();
                            infoLog({ message: `Successfully started playback of: ${track.title}` });
                        }
                        catch (playError) {
                            errorLog({ message: `Error starting playback: ${playError}` });
                            await interaction.followUp({
                                embeds: [
                                    new EmbedBuilder()
                                        .setColor('#FF0000')
                                        .setDescription('❌ There was an error starting playback! Please try again or check if the track is available.')
                                ],
                                ephemeral: true
                            });
                        }
                    }, 1000);
                }
                catch (error) {
                    errorLog({ message: `Error starting playback: ${error}` });
                    await interaction.followUp({
                        embeds: [
                            new EmbedBuilder()
                                .setColor('#FF0000')
                                .setDescription('❌ There was an error starting playback! Please try again or check if the track is available.')
                        ],
                        ephemeral: true
                    });
                    return;
                }
            }
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🎵 Added to Queue')
                .setDescription(`**[${track.title}](${track.url})**`)
                .addFields({ name: '👤 Author', value: track.author, inline: true }, { name: '⏱️ Duration', value: track.duration, inline: true }, { name: '🎵 Requested by', value: interaction.user.toString(), inline: true })
                .setThumbnail(track.thumbnail || null)
                .setFooter({ text: 'Use /queue to see the current queue' });
            await interaction.editReply({
                content: '🎵 Track added to queue!',
                embeds: [embed]
            });
        }
        catch (error) {
            errorLog({ message: `Error in play command: ${error}` });
            await interaction.followUp({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#FF0000')
                        .setDescription('❌ There was an error while executing this command! Please try again or check if the track is available.')
                ],
                ephemeral: true
            });
        }
    }
});
export default command;
//# sourceMappingURL=play.js.map