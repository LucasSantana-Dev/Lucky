import { EmbedBuilder } from 'discord.js';
import { messages } from '../../../utils/general/messages';

export function createProgressBar(progress: number, size: number = 20): string {
    const filled = Math.round(size * (progress / 100));
    const empty = size - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function createErrorEmbed(error: string, user: string): EmbedBuilder {
    return new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle(messages.error.downloadFailed)
        .setDescription(`<@${user}>, ${error}`)
        .setTimestamp();
}

export function createProgressEmbed(title: string, progress: number, stage: 'downloading' | 'compressing', current?: number, total?: number): EmbedBuilder {
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

export function isYouTubeUrl(str: string): boolean {
    return str.includes('youtube.com') || str.includes('youtu.be');
}

export function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
}

export function createVideoEmbed(video: any, format: string, user: { tag: string; displayAvatarURL: () => string }): EmbedBuilder {
    return new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle(`🎥 ${video.title}`)
        .setDescription(`**Channel:** ${video.channel?.name || 'Unknown'}\n**Duration:** ${formatDuration(video.durationInSec)}\n**Format:** ${format === 'video' ? '🎬 Video' : '🎵 Audio'}`)
        .setThumbnail(video.thumbnails[0]?.url || '')
        .setTimestamp()
        .setFooter({
            text: `Requested by ${user.tag}`,
            iconURL: user.displayAvatarURL()
        });
} 