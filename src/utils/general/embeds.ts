import type { ColorResolvable } from "discord.js"
import { EmbedBuilder } from "discord.js"
import { handleError } from "../error/errorHandler"
import { createUserErrorMessage } from "../error/errorHandler"

// Color constants for different types of messages
export const EMBED_COLORS = {
    SUCCESS: "#4CAF50", // Green
    ERROR: "#F44336", // Red
    INFO: "#2196F3", // Blue
    WARNING: "#FFC107", // Amber
    NEUTRAL: "#9E9E9E", // Grey
    MUSIC: "#9C27B0", // Purple
    QUEUE: "#3F51B5", // Indigo
    AUTOPLAY: "#009688", // Teal
}

// Emoji constants for different types of messages
export const EMOJIS = {
    SUCCESS: "✅",
    ERROR: "❌",
    INFO: "ℹ️",
    WARNING: "⚠️",
    NEUTRAL: "⚪",
    MUSIC: "🎵",
    AUDIO: "🎧",
    VIDEO: "🎥",
    QUEUE: "📋",
    AUTOPLAY: "🔄",
    PLAY: "▶️",
    PAUSE: "⏸️",
    STOP: "⏹️",
    SKIP: "⏭️",
    VOLUME: "🔊",
    LOOP: "🔁",
    SHUFFLE: "🔀",
    DOWNLOAD: "⬇️",
    EXIT: "🚪",
}

interface CreateEmbedOptions {
    title?: string
    description?: string
    color?: ColorResolvable
    emoji?: string
    footer?: string
    thumbnail?: string
    fields?: { name: string; value: string; inline?: boolean }[]
    timestamp?: boolean
    author?: { name: string; iconURL?: string; url?: string }
    image?: string
    url?: string
}

interface EmbedField {
    name: string
    value: string
    inline?: boolean
}

/**
 * Creates a consistent embed with the specified options
 * Following component-like patterns for reusability
 */
export function createEmbed(options: CreateEmbedOptions): EmbedBuilder {
    const embed = new EmbedBuilder()

    try {
        // Set color (default to neutral if not specified)
        embed.setColor(
            options.color ?? (EMBED_COLORS.NEUTRAL as ColorResolvable),
        )

        // Set title with emoji if provided
        if (options.title) {
            embed.setTitle(
                options.emoji
                    ? `${options.emoji} ${options.title}`
                    : options.title,
            )
        }

        // Set description
        if (options.description) {
            embed.setDescription(options.description)
        }

        // Set thumbnail
        if (options.thumbnail) {
            embed.setThumbnail(options.thumbnail)
        }

        // Set image
        if (options.image) {
            embed.setImage(options.image)
        }

        // Set URL
        if (options.url) {
            embed.setURL(options.url)
        }

        // Set author
        if (options.author) {
            embed.setAuthor({
                name: options.author.name,
                iconURL: options.author.iconURL,
                url: options.author.url,
            })
        }

        // Set fields
        if (options.fields && options.fields.length > 0) {
            embed.addFields(options.fields)
        }

        // Set footer
        if (options.footer) {
            embed.setFooter({ text: options.footer })
        }

        // Set timestamp
        if (options.timestamp) {
            embed.setTimestamp()
        }

        return embed
    } catch (error) {
        // Fallback to basic embed if there's an error
        const fallbackError = handleError(error, "embed creation", {
            details: { options: JSON.stringify(options) },
        })

        return new EmbedBuilder()
            .setColor(EMBED_COLORS.ERROR as ColorResolvable)
            .setTitle("❌ Erro")
            .setDescription(createUserErrorMessage(fallbackError))
            .setTimestamp()
    }
}

/**
 * Creates a success embed
 */
export function successEmbed(
    title: string,
    description?: string,
): EmbedBuilder {
    return createEmbed({
        title,
        description,
        color: EMBED_COLORS.SUCCESS as ColorResolvable,
        emoji: EMOJIS.SUCCESS,
    })
}

/**
 * Creates an error embed
 */
export function errorEmbed(title: string, description?: string): EmbedBuilder {
    return createEmbed({
        title,
        description,
        color: EMBED_COLORS.ERROR as ColorResolvable,
        emoji: EMOJIS.ERROR,
    })
}

/**
 * Creates an info embed
 */
export function infoEmbed(title: string, description?: string): EmbedBuilder {
    return createEmbed({
        title,
        description,
        color: EMBED_COLORS.INFO as ColorResolvable,
        emoji: EMOJIS.INFO,
    })
}

/**
 * Creates a warning embed
 */
export function warningEmbed(
    title: string,
    description?: string,
): EmbedBuilder {
    return createEmbed({
        title,
        description,
        color: EMBED_COLORS.WARNING as ColorResolvable,
        emoji: EMOJIS.WARNING,
    })
}

/**
 * Creates a music embed
 */
export function musicEmbed(title: string, description?: string): EmbedBuilder {
    return createEmbed({
        title,
        description,
        color: EMBED_COLORS.MUSIC as ColorResolvable,
        emoji: EMOJIS.MUSIC,
    })
}

/**
 * Creates a queue embed
 */
export function queueEmbed(title: string, description?: string): EmbedBuilder {
    return createEmbed({
        title,
        description,
        color: EMBED_COLORS.QUEUE as ColorResolvable,
        emoji: EMOJIS.QUEUE,
    })
}

/**
 * Creates an autoplay embed
 */
export function autoplayEmbed(
    title: string,
    description?: string,
): EmbedBuilder {
    return createEmbed({
        title,
        description,
        color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
        emoji: EMOJIS.AUTOPLAY,
    })
}

/**
 * Reusable embed components following frontend patterns
 */

/**
 * Creates a track information embed with consistent formatting
 */
export function createTrackEmbed(track: {
    title: string
    url: string
    thumbnail?: string
    duration?: string
    author?: string
    requestedBy?: { username: string }
}): EmbedBuilder {
    const fields: EmbedField[] = []

    if (track.duration) {
        fields.push({
            name: "⏱️ Duração",
            value: track.duration,
            inline: true,
        })
    }

    if (track.author) {
        fields.push({
            name: "👤 Artista",
            value: track.author,
            inline: true,
        })
    }

    if (track.requestedBy) {
        fields.push({
            name: "🎯 Solicitado por",
            value: track.requestedBy.username,
            inline: true,
        })
    }

    return createEmbed({
        title: "🎵 Tocando Agora",
        description: `[**${track.title}**](${track.url})`,
        color: EMBED_COLORS.MUSIC as ColorResolvable,
        thumbnail: track.thumbnail,
        fields,
        timestamp: true,
    })
}

/**
 * Creates a queue embed with pagination support
 */
export function createQueueEmbed(
    tracks: Array<{
        title: string
        url: string
        duration?: string
        requestedBy?: { username: string }
    }>,
    currentPage: number = 1,
    totalPages: number = 1,
    currentTrack?: { title: string; url: string },
): EmbedBuilder {
    const tracksPerPage = 10
    const startIndex = (currentPage - 1) * tracksPerPage
    const endIndex = startIndex + tracksPerPage
    const pageTracks = tracks.slice(startIndex, endIndex)

    const trackList = pageTracks
        .map((track, index) => {
            const globalIndex = startIndex + index + 1
            const duration = track.duration ? ` • ${track.duration}` : ""
            const requestedBy = track.requestedBy
                ? ` • ${track.requestedBy.username}`
                : ""

            return `${globalIndex}. [${track.title}](${track.url})${duration}${requestedBy}`
        })
        .join("\n")

    const fields: EmbedField[] = []

    if (currentTrack) {
        fields.push({
            name: "🎵 Tocando Agora",
            value: `[**${currentTrack.title}**](${currentTrack.url})`,
            inline: false,
        })
    }

    fields.push({
        name: `📋 Fila (${tracks.length} músicas)`,
        value: trackList || "Fila vazia",
        inline: false,
    })

    if (totalPages > 1) {
        fields.push({
            name: "📄 Página",
            value: `${currentPage}/${totalPages}`,
            inline: true,
        })
    }

    return createEmbed({
        title: "🎵 Fila de Música",
        color: EMBED_COLORS.QUEUE as ColorResolvable,
        fields,
        timestamp: true,
    })
}

/**
 * Creates a progress bar for track duration
 */
export function createProgressBar(
    current: number,
    total: number,
    length: number = 20,
): string {
    const percentage = Math.min(Math.max(current / total, 0), 1)
    const filled = Math.round(percentage * length)
    const empty = length - filled

    return `\`${"█".repeat(filled)}${"░".repeat(empty)}\` ${formatTime(current)} / ${formatTime(total)}`
}

/**
 * Formats time in MM:SS format
 */
export function formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.floor(seconds % 60)
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
}

/**
 * Creates a loading embed with animated dots
 */
export function createLoadingEmbed(message: string): EmbedBuilder {
    return createEmbed({
        title: "⏳ Carregando...",
        description: message,
        color: EMBED_COLORS.INFO as ColorResolvable,
        timestamp: true,
    })
}

/**
 * Creates an error embed with structured error information
 */
export function createErrorEmbed(
    title: string,
    error: unknown,
    showDetails: boolean = false,
): EmbedBuilder {
    const userMessage = createUserErrorMessage(error)

    const fields: EmbedField[] = []

    if (showDetails && error instanceof Error) {
        fields.push({
            name: "🔍 Detalhes Técnicos",
            value: `\`\`\`${error.message}\`\`\``,
            inline: false,
        })
    }

    return createEmbed({
        title: `❌ ${title}`,
        description: userMessage,
        color: EMBED_COLORS.ERROR as ColorResolvable,
        fields,
        timestamp: true,
    })
}
