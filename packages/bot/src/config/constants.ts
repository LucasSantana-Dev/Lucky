export type CommandCategory =
    | 'music'
    | 'download'
    | 'general'
    | 'moderation'
    | 'management'
    | 'automod'

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
    moderation: {
        key: 'moderation' as CommandCategory,
        label: '🛡️ Moderation',
        emoji: '🛡️',
        prefixes: ['ban', 'kick', 'mute', 'unmute', 'warn', 'unban', 'cases'],
    },
    management: {
        key: 'management' as CommandCategory,
        label: '⚙️ Management',
        emoji: '⚙️',
        prefixes: ['embed', 'reactionroles', 'serverlog', 'customcommand'],
    },
    automod: {
        key: 'automod' as CommandCategory,
        label: '🤖 AutoMod',
        emoji: '🤖',
        prefixes: ['automod'],
    },
}
