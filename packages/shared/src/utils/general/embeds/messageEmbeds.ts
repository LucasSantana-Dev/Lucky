import { EMBED_COLORS, EMOJIS } from './constants'
import { createEmbed } from './core'

/** Creates a success-styled embed with the given title and optional description. */
export function successEmbed(title: string, description?: string) {
    return createEmbed({
        title,
        description,
        color: EMBED_COLORS.SUCCESS,
        emoji: EMOJIS.SUCCESS,
    })
}

/** Creates an error-styled embed with the given title and optional description. */
export function errorEmbed(title: string, description?: string) {
    return createEmbed({
        title,
        description,
        color: EMBED_COLORS.ERROR,
        emoji: EMOJIS.ERROR,
    })
}

/** Creates a warning-styled embed with the given title and optional description. */
export function warningEmbed(title: string, description?: string) {
    return createEmbed({
        title,
        description,
        color: EMBED_COLORS.WARNING,
        emoji: EMOJIS.WARNING,
    })
}

/** Creates an info-styled embed with the given title and optional description. */
export function infoEmbed(title: string, description?: string) {
    return createEmbed({
        title,
        description,
        color: EMBED_COLORS.INFO,
        emoji: EMOJIS.INFO,
    })
}

/** Creates a success-styled embed with timestamp and optional footer. */
export function createSuccessEmbed(
    title: string,
    description: string,
    footer?: string,
) {
    return createEmbed({
        title,
        description,
        color: EMBED_COLORS.SUCCESS,
        emoji: EMOJIS.SUCCESS,
        footer,
        timestamp: true,
    })
}

/** Creates a warning-styled embed with timestamp and optional footer. */
export function createWarningEmbed(
    title: string,
    description: string,
    footer?: string,
) {
    return createEmbed({
        title,
        description,
        color: EMBED_COLORS.WARNING,
        emoji: EMOJIS.WARNING,
        footer,
        timestamp: true,
    })
}

/** Creates an info-styled embed with timestamp and optional footer. */
export function createInfoEmbed(
    title: string,
    description: string,
    footer?: string,
) {
    return createEmbed({
        title,
        description,
        color: EMBED_COLORS.INFO,
        emoji: EMOJIS.INFO,
        footer,
        timestamp: true,
    })
}

/** Creates a loading-styled embed with the given message. */
export function createLoadingEmbed(message: string) {
    return createEmbed({
        title: 'Loading...',
        description: message,
        color: EMBED_COLORS.INFO,
        emoji: '⏳',
    })
}
