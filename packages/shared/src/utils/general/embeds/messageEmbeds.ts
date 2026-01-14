import { EMBED_COLORS, EMOJIS } from './constants'
import { createEmbed } from './core'

export function successEmbed(title: string, description?: string) {
    return createEmbed({
        title,
        description,
        color: EMBED_COLORS.SUCCESS,
        emoji: EMOJIS.SUCCESS,
    })
}

export function errorEmbed(title: string, description?: string) {
    return createEmbed({
        title,
        description,
        color: EMBED_COLORS.ERROR,
        emoji: EMOJIS.ERROR,
    })
}

export function warningEmbed(title: string, description?: string) {
    return createEmbed({
        title,
        description,
        color: EMBED_COLORS.WARNING,
        emoji: EMOJIS.WARNING,
    })
}

export function infoEmbed(title: string, description?: string) {
    return createEmbed({
        title,
        description,
        color: EMBED_COLORS.INFO,
        emoji: EMOJIS.INFO,
    })
}

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

export function createLoadingEmbed(message: string) {
    return createEmbed({
        title: 'Loading...',
        description: message,
        color: EMBED_COLORS.INFO,
        emoji: '⏳',
    })
}
