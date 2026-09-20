export const EMBED_COLORS = {
    SUCCESS: '#4CAF50',
    ERROR: '#F44336',
    INFO: '#2196F3',
    WARNING: '#FFC107',
    NEUTRAL: '#9E9E9E',
    MUSIC: '#9C27B0',
    QUEUE: '#3F51B5',
    AUTOPLAY: '#009688',
} as const

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

/** Type representing a valid embed color from EMBED_COLORS constants. */
export type EmbedColor = (typeof EMBED_COLORS)[keyof typeof EMBED_COLORS]

/** Type representing a valid emoji from EMOJIS constants. */
export type EmbedEmoji = (typeof EMOJIS)[keyof typeof EMOJIS]
