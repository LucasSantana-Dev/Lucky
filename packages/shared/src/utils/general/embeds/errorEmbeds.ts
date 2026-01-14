import { EMBED_COLORS, EMOJIS } from './constants'
import { createEmbed } from './core'
import { handleError, createUserErrorMessage } from '../../error/errorHandler'

export function createErrorEmbed(
    title: string,
    description: string,
    error?: Error,
    footer?: string,
) {
    const embed = createEmbed({
        title,
        description,
        color: EMBED_COLORS.ERROR,
        emoji: EMOJIS.ERROR,
        footer,
        timestamp: true,
    })

    // Add error details if provided
    if (error) {
        embed.addFields({
            name: 'Error Details',
            value: `\`\`\`${error.message}\`\`\``,
            inline: false,
        })

        // Log the error for debugging
        handleError(error, {
            details: { context: 'Error Embed Creation', title, description },
        })
    }

    return embed
}

export function createUserErrorEmbed(
    title: string,
    description: string,
    error?: Error,
    footer?: string,
) {
    const userMessage = createUserErrorMessage(error)

    return createEmbed({
        title,
        description: userMessage || description,
        color: EMBED_COLORS.ERROR,
        emoji: EMOJIS.ERROR,
        footer,
        timestamp: true,
    })
}
