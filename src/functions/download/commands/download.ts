import { SlashCommandBuilder } from '@discordjs/builders';
import { AttachmentBuilder } from 'discord.js';
import play from 'play-dl';
import Command from '../../../models/Command';
import { errorLog, infoLog, successLog } from '../../../utils/general/log';
import { downloadVideo, deleteDownloadedFile } from '../../../functions/download/utils/downloadUtils';
import { requireGuild, requireInteractionOptions } from '../../../utils/command/commandValidations';
import { CommandExecuteParams } from '../../../types/CommandData';
import { messages } from '../../../utils/general/messages';
import { createErrorEmbed, createProgressEmbed, isYouTubeUrl, formatDuration } from '../../../functions/download/utils/downloadHelpers';
import { createEmbed, EMBED_COLORS, EMOJIS } from '../../../utils/general/embeds';
import { ColorResolvable } from 'discord.js';
import { interactionReply } from '../../../utils/general/interactionReply';

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
                    { name: `${EMOJIS.VIDEO} Video`, value: 'video' },
                    { name: `${EMOJIS.AUDIO} Audio`, value: 'audio' }
                )
        ),
    execute: async ({ interaction }: CommandExecuteParams): Promise<void> => {
        try {
            if (!(await requireGuild(interaction))) return;
            // Get command options
            const query = interaction.options.get('query')?.value as string;
            const format = interaction.options.get('format')?.value as string;

            if (!(await requireInteractionOptions(interaction, ['video', 'audio']))) return;

            // Defer the reply to prevent timeouts
            await interactionReply({ interaction, content: { content: '⬇️ Starting download...' } });
            infoLog({ message: `Processing download request for query: ${query}` });

            try {
                let videoUrl = query;

                // If it's not a URL, search for it
                if (!isYouTubeUrl(query)) {
                    infoLog({ message: `Searching for video: ${query}` });
                    const searchResults = await play.search(query, { limit: 1 });

                    if (!searchResults || searchResults.length === 0) {
                        infoLog({ message: `No search results found for query: ${query}` });
                        await interactionReply({ interaction, content: { content: '❌ No videos found matching your search query.' } });
                        return;
                    }

                    videoUrl = searchResults[0].url;
                    infoLog({ message: `Found video URL: ${videoUrl}` });
                }

                // Get video info for the embed
                const videoInfo = await play.video_info(videoUrl);
                if (!videoInfo) {
                    infoLog({ message: `Could not fetch video information for URL: ${videoUrl}` });
                    await interactionReply({ interaction, content: { content: '❌ Could not fetch video information.' } });
                    return;
                }

                const video = videoInfo.video_details;
            
                // Create initial embed
                const embed = createEmbed({
                    title: `${video.title}`,
                    description: `**Channel:** ${video.channel?.name || 'Unknown'}\n**Duration:** ${formatDuration(video.durationInSec)}\n**Format:** ${format === 'video' ? '🎬 Video' : '🎵 Audio'}`,
                    color: EMBED_COLORS.SUCCESS as ColorResolvable,
                    emoji: EMOJIS.DOWNLOAD,
                    thumbnail: video.thumbnails[0]?.url,
                    footer: `Requested by ${interaction.user.tag}`,
                    timestamp: true
                });

                // Show initial progress embed
                const initialProgressEmbed = createProgressEmbed(
                    video.title || 'Video',
                    0,
                    'downloading'
                );

                // Update status with both embeds
                await interactionReply({ interaction, content: { embeds: [embed, initialProgressEmbed] } });

                let lastProgressUpdate = 0;
                const progressSteps = [0, 25, 50, 75, 100];

                // Download the video with progress tracking
                infoLog({ message: 'Starting download with progress tracking' });
                const downloadResult = await downloadVideo(
                    videoUrl,
                    format as 'video' | 'audio',
                    async (progress) => {
                        // progress.progress is a percentage (0-100)
                        const rounded = Math.round(progress.progress);
                        // Find the closest step
                        const nextStep = progressSteps.find(step => rounded >= step && lastProgressUpdate < step);
                        if (nextStep !== undefined && nextStep !== lastProgressUpdate) {
                            lastProgressUpdate = nextStep;
                            // Create progress embed
                            const progressEmbed = createProgressEmbed(
                                video.title || 'Video',
                                rounded,
                                progress.stage,
                                progress.current,
                                progress.total
                            );
                            try {
                                await interactionReply({ interaction, content: { embeds: [embed, progressEmbed] } });
                            } catch (error) {
                                // Ignore errors from progress updates
                            }
                        }
                    }
                );

                if (!downloadResult.success || !downloadResult.filePath) {
                    errorLog({ message: 'Download failed', error: downloadResult.error });
                    const errorEmbed = createErrorEmbed(
                        downloadResult.error || messages.error.downloadFailed,
                        interaction.user.id
                    );
                    await interactionReply({ interaction, content: { embeds: [errorEmbed] } });
                    return;
                }

                // Create attachment
                const attachment = new AttachmentBuilder(downloadResult.filePath);

                // Send the file
                infoLog({ message: 'Sending completed file' });
                await interactionReply({ interaction, content: { embeds: [embed], files: [attachment] } });

                // Clean up the file after sending
                await deleteDownloadedFile(downloadResult.filePath);
                successLog({ message: `Successfully downloaded and sent ${format} for: ${video.title}` });

            } catch (error) {
                errorLog({ message: 'Error processing video:', error });
                const errorMessage = error instanceof Error ? error.message : messages.error.downloadFailed;
                const errorEmbed = createErrorEmbed(errorMessage, interaction.user.id);
                await interactionReply({ interaction, content: { embeds: [errorEmbed] } });
            }
        } catch (error) {
            errorLog({ message: 'Error on download command:', error });
            const errorEmbed = createErrorEmbed(messages.error.nonHandledError, interaction.user.id);
            await interactionReply({ interaction, content: { embeds: [errorEmbed] } });
        }
    }
});