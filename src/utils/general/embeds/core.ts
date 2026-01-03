import { EmbedBuilder } from 'discord.js'
import { EMBED_COLORS } from './constants'
import type { CreateEmbedOptions } from './types'

/**
 * Set embed title with optional emoji
 */
function setEmbedTitle(
    embed: EmbedBuilder,
    title?: string,
    emoji?: string,
): void {
    if (title !== undefined && title !== null && title !== '') {
        const fullTitle =
            emoji !== undefined && emoji !== null && emoji !== ''
                ? `${emoji} ${title}`
                : title
        embed.setTitle(fullTitle)
    }
}

/**
 * Set embed author
 */
function setEmbedAuthor(
    embed: EmbedBuilder,
    author?: { name: string; iconURL?: string; url?: string },
): void {
    if (author) {
        embed.setAuthor({
            name: author.name,
            iconURL: author.iconURL,
            url: author.url,
        })
    }
}

/**
 * Set embed fields
 */
function setEmbedFields(
    embed: EmbedBuilder,
    fields?: Array<{ name: string; value: string; inline?: boolean }>,
): void {
    if (fields !== undefined && fields !== null && fields.length > 0) {
        embed.addFields(fields)
    }
}

/**
 * Set embed footer
 */
function setEmbedFooter(embed: EmbedBuilder, footer?: string): void {
    if (footer !== undefined && footer !== null && footer !== '') {
        embed.setFooter({ text: footer })
    }
}

export function createEmbed(options: CreateEmbedOptions): EmbedBuilder {
    const embed = new EmbedBuilder()

    // Set basic properties
    setEmbedTitle(embed, options.title, options.emoji)

    if (options.description) {
        embed.setDescription(options.description)
    }

    // Set color (default to neutral if not specified)
    embed.setColor(options.color ?? EMBED_COLORS.NEUTRAL)

    // Set optional properties
    if (options.thumbnail) {
        embed.setThumbnail(options.thumbnail)
    }

    if (options.url) {
        embed.setURL(options.url)
    }

    setEmbedAuthor(embed, options.author)
    setEmbedFields(embed, options.fields)
    setEmbedFooter(embed, options.footer)

    // Set timestamp
    if (options.timestamp) {
        embed.setTimestamp()
    }

    return embed
}

export function formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
}

export function createProgressBar(
    current: number,
    total: number,
    length = 20,
): string {
    const progress = Math.min(current / total, 1)
    const filled = Math.round(progress * length)
    const empty = length - filled

    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${Math.round(progress * 100)}%`
}
