import { COLOR } from '@lucky/shared/constants'
import { EmbedBuilder } from 'discord.js'

export type PlatformType = 'lastfm' | 'spotify' | 'youtube'

type PlatformBranding = {
    label: string
    emoji: string
    color: number
}

const PLATFORM_BRANDING: Record<PlatformType, PlatformBranding> = {
    lastfm: {
        label: 'Last.fm',
        emoji: '📊',
        color: COLOR.TWITTER_RED,
    },
    spotify: {
        label: 'Spotify',
        emoji: '🟢',
        color: COLOR.SPOTIFY_GREEN,
    },
    youtube: {
        label: 'YouTube',
        emoji: '🔴',
        color: COLOR.YOUTUBE_RED,
    },
}

export function buildPlatformAttribEmbed(
    platform: PlatformType,
    body: { title?: string; description?: string; thumbnail?: string; url?: string },
): EmbedBuilder {
    const branding = PLATFORM_BRANDING[platform]

    const embed = new EmbedBuilder()
        .setAuthor({
            name: `${branding.emoji} ${branding.label}`,
        })
        .setColor(branding.color)
        .setTimestamp()

    if (body.title) {
        embed.setTitle(body.title)
    }

    if (body.url) {
        embed.setURL(body.url)
    }

    if (body.description) {
        embed.setDescription(body.description)
    }

    if (body.thumbnail) {
        embed.setThumbnail(body.thumbnail)
    }

    return embed
}
