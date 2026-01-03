// Removed unused import

// Color constants for different types of messages
export const EMBED_COLORS = {
    SUCCESS: '#4CAF50', // Green
    ERROR: '#F44336', // Red
    INFO: '#2196F3', // Blue
    WARNING: '#FFC107', // Amber
    NEUTRAL: '#9E9E9E', // Grey
    MUSIC: '#9C27B0', // Purple
    QUEUE: '#3F51B5', // Indigo
    AUTOPLAY: '#009688', // Teal
} as const

// Emoji constants for different types of messages
export const EMOJIS = {
    SUCCESS: '✅',
    ERROR: '❌',
    INFO: 'ℹ️',
    WARNING: '⚠️',
    NEUTRAL: '⚪',
    MUSIC: '🎵',
    AUDIO: '🎧',
    VIDEO: '🎥',
    QUEUE: '📋',
    AUTOPLAY: '🔄',
    PLAY: '▶️',
    PAUSE: '⏸️',
    STOP: '⏹️',
    SKIP: '⏭️',
    VOLUME: '🔊',
    LOOP: '🔁',
    SHUFFLE: '🔀',
    DOWNLOAD: '⬇️',
    SETTINGS: '⚙️',
    EXIT: '🚪',
} as const

export type EmbedColor = (typeof EMBED_COLORS)[keyof typeof EMBED_COLORS]
export type EmbedEmoji = (typeof EMOJIS)[keyof typeof EMOJIS]
