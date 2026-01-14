import { EmbedBuilder } from 'discord.js'
import { messages } from '../general/messages'

export function createErrorEmbed(error: string, user: string): EmbedBuilder {
    return new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle(messages.error.downloadFailed)
        .setDescription(`<@${user}>, ${error}`)
        .setTimestamp()
}

export function isYouTubeUrl(str: string): boolean {
    return str.includes('youtube.com') || str.includes('youtu.be')
}

export function isInstagramUrl(str: string): boolean {
    return str.includes('instagram.com') || str.includes('instagr.am')
}

export function isTwitterUrl(str: string): boolean {
    return str.includes('twitter.com') || str.includes('x.com')
}

export function isTikTokUrl(str: string): boolean {
    return str.includes('tiktok.com')
}

export function isSupportedPlatformUrl(str: string): boolean {
    return (
        isYouTubeUrl(str) ||
        isInstagramUrl(str) ||
        isTwitterUrl(str) ||
        isTikTokUrl(str)
    )
}

export function getPlatformFromUrl(url: string): string {
    if (isYouTubeUrl(url)) return 'YouTube'
    if (isInstagramUrl(url)) return 'Instagram'
    if (isTwitterUrl(url)) return 'X (Twitter)'
    if (isTikTokUrl(url)) return 'TikTok'
    return 'Unknown'
}

export function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const remainingSeconds = seconds % 60
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
    } else {
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
    }
}

export function createVideoEmbed(
    video: unknown,
    format: string,
    user: { tag: string; displayAvatarURL: () => string },
): EmbedBuilder {
    return new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle(
            `🎥 ${(video as { title?: string }).title ?? 'Unknown Video'}`,
        )
        .setDescription(
            `**Channel:** ${(video as { channel?: { name?: string } }).channel?.name ?? 'Unknown'}\n**Duration:** ${formatDuration((video as { durationInSec: number }).durationInSec)}\n**Format:** ${format === 'video' ? '🎬 Video' : '🎵 Audio'}`,
        )
        .setThumbnail(
            (video as { thumbnails?: { url?: string }[] }).thumbnails?.[0]
                ?.url ?? '',
        )
        .setTimestamp()
        .setFooter({
            text: `Requested by ${user.tag}`,
            iconURL: user.displayAvatarURL(),
        })
}
