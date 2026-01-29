export type CommandCategory = 'music' | 'download' | 'general'

export const COMMAND_CATEGORIES = {
    music: {
        key: 'music' as CommandCategory,
        label: '🎵 Music',
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
        label: '⚙️ General',
        emoji: '⚙️',
        prefixes: ['help', 'ping', 'twitch', 'lastfm'],
    },
}
