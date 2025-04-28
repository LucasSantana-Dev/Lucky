import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import play from 'play-dl';
import Command from '@/models/Command';
import { CustomClient } from '@/types';
import { errorLog, infoLog, successLog } from '@/utils/log';
import { downloadVideo, deleteDownloadedFile } from '../utils/downloadUtils';
import { interactionReply } from '@/handlers/interactionHandler';

interface CommandExecuteParams {
    client: CustomClient;
    interaction: ChatInputCommandInteraction;
}

function createProgressBar(progress: number, size: number = 20): string {
    const filled = Math.round(size * (progress / 100));
    const empty = size - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function createErrorEmbed(error: string, user: string): EmbedBuilder {
    return new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Download Failed')
        .setDescription(`<@${user}>, ${error}`)
        .setTimestamp();
}

function createProgressEmbed(title: string, progress: number, stage: 'downloading' | 'compressing', current?: number, total?: number): EmbedBuilder {
    const progressBar = createProgressBar(progress);
    const stageEmoji = stage === 'downloading' ? '⬇️' : '🎬';
    const stageText = stage === 'downloading' ? 'Downloading' : 'Compressing';
    
    const sizeInfo = total 
        ? `\n${formatBytes(current || 0)} / ${formatBytes(total)}`
        : '';
    
    return new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle(`${stageEmoji} ${stageText} Progress`)
        .setDescription(`**${title}**\n\n${progressBar} ${Math.round(progress)}%\n${sizeInfo}`)
        .setTimestamp();
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('download')
        .setDescription('🎥 Download a YouTube video')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('The YouTube video URL or search query')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('format')
                .setDescription('The format to download (video/audio)')
                .setRequired(true)
                .addChoices(
                    { name: 'Video', value: 'video' },
                    { name: 'Audio', value: 'audio' }
                )) as SlashCommandBuilder,
    execute: async ({ client, interaction }: { client: CustomClient; interaction: ChatInputCommandInteraction }): Promise<void> => {
        // Get command options
        const query = interaction.options.get('query')?.value as string;
        const format = interaction.options.get('format')?.value as string;

        // Validate query
        if (!query) {
            infoLog({ message: 'No query provided for download command' });
            await interactionReply({
                interaction,
                content: {
                    content: '❌ Please provide a YouTube URL or search query!'
                }
            });
            return;
        }

        // Defer the reply to prevent timeouts
        await interaction.deferReply();
        infoLog({ message: `Processing download request for query: ${query}` });

        try {
            let videoUrl = query;

            // If it's not a URL, search for it
            if (!isYouTubeUrl(query)) {
                infoLog({ message: `Searching for video: ${query}` });
                const searchResults = await play.search(query, { limit: 1 });

                if (!searchResults || searchResults.length === 0) {
                    infoLog({ message: `No search results found for query: ${query}` });
                    await interaction.editReply({
                        content: '❌ No videos found matching your search query.'
                    });
                    return;
                }

                videoUrl = searchResults[0].url;
                infoLog({ message: `Found video URL: ${videoUrl}` });
            }

            // Get video info for the embed
            const videoInfo = await play.video_info(videoUrl);
            if (!videoInfo) {
                infoLog({ message: `Could not fetch video information for URL: ${videoUrl}` });
                await interaction.editReply({
                    content: '❌ Could not fetch video information.'
                });
                return;
            }

            const video = videoInfo.video_details;
            
            // Create initial embed
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`🎥 ${video.title}`)
                .setDescription(`**Channel:** ${video.channel?.name || 'Unknown'}\n**Duration:** ${formatDuration(video.durationInSec)}\n**Format:** ${format === 'video' ? '🎬 Video' : '🎵 Audio'}`)
                .setThumbnail(video.thumbnails[0]?.url || '')
                .setTimestamp()
                .setFooter({ 
                    text: `Requested by ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL()
                });

            // Show initial progress embed
            const initialProgressEmbed = createProgressEmbed(
                video.title || 'Video',
                0,
                'downloading'
            );

            // Update status with both embeds
            await interaction.editReply({ 
                content: '⬇️ Starting download...',
                embeds: [embed, initialProgressEmbed]
            });

            let lastUpdate = Date.now();
            const updateInterval = 500; // Update every 500ms for more frequent updates
            let lastProgress = 0;
            let heartbeatInterval: NodeJS.Timeout;

            // Set up heartbeat to ensure progress bar is always visible
            heartbeatInterval = setInterval(async () => {
                try {
                    // Just update the timestamp to keep the message active
                    await interaction.editReply({
                        content: '⬇️ Downloading...',
                        embeds: [embed, createProgressEmbed(
                            video.title || 'Video',
                            lastProgress,
                            'downloading'
                        )]
                    });
                } catch (error) {
                    // Ignore errors from heartbeat updates
                }
            }, 15000); // Every 15 seconds

            // Download the video with progress tracking
            infoLog({ message: 'Starting download with progress tracking' });
            const downloadResult = await downloadVideo(
                videoUrl, 
                format as 'video' | 'audio',
                async (progress) => {
                    infoLog({ message: `Progress update received: ${progress.progress.toFixed(2)}%` });
                    const now = Date.now();
                    // Update more frequently - every 500ms or if progress changed by 1%
                    if (now - lastUpdate >= updateInterval || Math.abs(progress.progress - lastProgress) >= 1) {
                        lastUpdate = now;
                        lastProgress = progress.progress;

                        // Create progress embed
                        const progressEmbed = createProgressEmbed(
                            video.title || 'Video',
                            progress.progress,
                            progress.stage,
                            progress.current,
                            progress.total
                        );

                        infoLog({ message: `Sending progress update: ${progress.progress.toFixed(2)}%` });

                        try {
                            await interaction.editReply({
                                content: '⬇️ Downloading...',
                                embeds: [embed, progressEmbed]
                            });
                            infoLog({ message: 'Progress update sent successfully' });
                        } catch (error) {
                            errorLog({ message: 'Error updating progress:', error });
                        }
                    }
                }
            );

            // Clear heartbeat interval
            clearInterval(heartbeatInterval);

            if (!downloadResult.success || !downloadResult.filePath) {
                errorLog({ message: 'Download failed', error: downloadResult.error });
                const errorEmbed = createErrorEmbed(
                    downloadResult.error || 'Failed to download the content.',
                    interaction.user.id
                );
                await interaction.editReply({
                    content: null,
                    embeds: [errorEmbed]
                });
                return;
            }

            // Create attachment
            const attachment = new AttachmentBuilder(downloadResult.filePath);

            // Send the file
            infoLog({ message: 'Sending completed file' });
            await interaction.editReply({
                content: '✅ Download complete!',
                embeds: [embed],
                files: [attachment]
            });

            // Clean up the file after sending
            await deleteDownloadedFile(downloadResult.filePath);
            successLog({ message: `Successfully downloaded and sent ${format} for: ${video.title}` });

        } catch (error) {
            errorLog({ message: 'Error processing video:', error });
            const errorMessage = error instanceof Error ? error.message : 'There was an error while processing your request.';
            const errorEmbed = createErrorEmbed(errorMessage, interaction.user.id);
            await interaction.editReply({
                content: null,
                embeds: [errorEmbed]
            });
        }
    }
});

// Helper function to check if a string is a YouTube URL
function isYouTubeUrl(str: string): boolean {
    return str.includes('youtube.com') || str.includes('youtu.be');
}

function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
} 