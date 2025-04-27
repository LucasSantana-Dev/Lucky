import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder } from 'discord.js';
import Command from '../../../models/Command';
import { infoLog, errorLog } from '../../../utils/log';
const command = new Command({
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current music queue'),
    execute: async ({ client, interaction }) => {
        try {
            if (!interaction.guildId) {
                await interaction.reply({ content: 'This command can only be used in a server!', ephemeral: true });
                return;
            }
            const queue = client.player.nodes.get(interaction.guildId);
            infoLog({ message: `Queue status for guild ${interaction.guildId}: ${queue ? 'exists' : 'does not exist'}` });
            if (!queue) {
                await interaction.reply({ content: 'There is no active music queue!', ephemeral: true });
                return;
            }
            const currentTrack = queue.currentTrack;
            const tracks = queue.tracks.toArray();
            infoLog({
                message: `Queue details - Current track: ${currentTrack?.title || 'none'}, Tracks in queue: ${tracks.length}`
            });
            const embed = new EmbedBuilder()
                .setTitle('🎵 Music Queue')
                .setColor('#FF0000')
                .setTimestamp();
            if (currentTrack) {
                const duration = currentTrack.duration ? formatDuration(currentTrack.duration) : 'Unknown';
                const requestedBy = currentTrack.requestedBy?.username || 'Unknown';
                embed.addFields({
                    name: '▶️ Now Playing',
                    value: `**${currentTrack.title}**\nDuration: ${duration}\nRequested by: ${requestedBy}`
                });
            }
            else {
                embed.addFields({
                    name: '▶️ Now Playing',
                    value: 'No song is currently playing'
                });
            }
            if (tracks.length > 0) {
                const trackList = tracks.map((track, i) => {
                    const duration = track.duration ? formatDuration(track.duration) : 'Unknown';
                    return `${i + 1}. **${track.title}**\n   Duration: ${duration} | Requested by: ${track.requestedBy?.username || 'Unknown'}`;
                }).join('\n\n');
                embed.addFields({
                    name: '📑 Up Next',
                    value: trackList
                });
            }
            else {
                embed.addFields({
                    name: '📑 Up Next',
                    value: 'No songs in queue'
                });
            }
            // Add queue statistics
            embed.addFields({
                name: '📊 Queue Statistics',
                value: `Total tracks: ${tracks.length}\nLoop mode: ${queue.repeatMode ? 'Enabled' : 'Disabled'}\nVolume: ${queue.node.volume}%`
            });
            await interaction.reply({ embeds: [embed] });
        }
        catch (error) {
            errorLog({ message: 'Error in queue command:', error });
            await interaction.reply({
                content: 'There was an error while trying to show the queue!',
                ephemeral: true
            });
        }
    }
});
function formatDuration(duration) {
    // Check if the duration is already in the correct format (MM:SS)
    if (/^\d+:\d+$/.test(duration)) {
        return duration;
    }
    // If it's a number (seconds), convert it to MM:SS format
    const seconds = parseInt(duration);
    if (!isNaN(seconds)) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    // If it's already in the format we want (e.g., "04:01"), return it as is
    if (/^\d{2}:\d{2}$/.test(duration)) {
        return duration;
    }
    // If we can't parse it, return the original string
    return duration;
}
export default command;
//# sourceMappingURL=queue.js.map