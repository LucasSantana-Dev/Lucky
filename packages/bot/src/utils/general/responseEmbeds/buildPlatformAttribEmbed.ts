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
        color: 0xd51007,
    },
    spotify: {
        label: 'Spotify',
        emoji: '🟢',
        color: 0x1db954,
    },
    youtube: {
        label: 'YouTube',
        emoji: '🔴',
        color: 0xff0000,
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
