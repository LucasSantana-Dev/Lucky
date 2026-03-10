/**
 * Command category type
 */
export type CommandCategory = 'music' | 'download' | 'general'

/**
 * Command categories configuration
 * Contains information about each command category including:
 * - key: The category identifier used in code
 * - label: The display name for the category
 * - emoji: The emoji used to represent the category in UI
 * - prefixes: Command name prefixes that belong to this category
 */
export const COMMAND_CATEGORIES = {
    music: {
        key: 'music' as CommandCategory,
        label: '🎵 Música',
        emoji: '🎵',
        prefixes: [
            'play',
            'queue',
            'skip',
            'pause',
            'resume',
            'remove',
            'repeat',
            'shuffle',
            'lyrics',
            'songinfo',
            'clear',
            'autoplay',
            'move',
            'volume',
            'stop',
            'leave',
            'music',
            'session',
            'playlist',
        ],
    },
    download: {
        key: 'download' as CommandCategory,
        label: '⬇️ Download',
        emoji: '⬇️',
        prefixes: ['download'],
    },
    general: {
        key: 'general' as CommandCategory,
        label: '⚙️ Geral',
        emoji: '⚙️',
        prefixes: ['help', 'ping'],
    },
}
