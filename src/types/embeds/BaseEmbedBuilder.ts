/**
 * Base embed builder with common patterns
 */

import { EmbedBuilder } from 'discord.js'
import { EMBED_COLORS } from '../../utils/general/embeds/constants'
import { createEmbed } from '../../utils/general/embeds/core'
import type { CreateEmbedOptions } from '../../utils/general/embeds/types'

export interface BaseEmbedOptions extends CreateEmbedOptions {
    showTimestamp?: boolean
    showFooter?: boolean
    footerText?: string
}

export abstract class BaseEmbedBuilder {
    protected createBaseEmbed(options: BaseEmbedOptions): EmbedBuilder {
        const embedOptions: CreateEmbedOptions = {
            title: options.title,
            description: options.description,
            color: options.color ?? EMBED_COLORS.NEUTRAL,
            emoji: options.emoji,
            thumbnail: options.thumbnail,
            url: options.url,
            fields: options.fields,
            author: options.author,
            timestamp: options.showTimestamp ?? true,
        }

        const embed = createEmbed(embedOptions)

        if (options.showFooter && options.footerText) {
            embed.setFooter({ text: options.footerText })
        }

        return embed
    }

    protected addErrorDetails(embed: EmbedBuilder, error: Error): void {
        embed.addFields({
            name: 'Error Details',
            value: `\`\`\`${error.message}\`\`\``,
            inline: false,
        })
    }

    protected addTimestamp(embed: EmbedBuilder): void {
        embed.setTimestamp()
    }

    protected addFooter(embed: EmbedBuilder, text: string, iconUrl?: string): void {
        embed.setFooter({ text, iconURL: iconUrl })
    }
}
