import type {
    FeatureToggleConfig,
    FeatureToggleName,
} from '../types/featureToggle'

const defaultToggles: Record<FeatureToggleName, FeatureToggleConfig> = {
    DOWNLOAD_VIDEO: {
        name: 'DOWNLOAD_VIDEO',
        enabled: true,
        description: 'Enable video download functionality',
    },
    DOWNLOAD_AUDIO: {
        name: 'DOWNLOAD_AUDIO',
        enabled: true,
        description: 'Enable audio download functionality',
    },
    MUSIC_RECOMMENDATIONS: {
        name: 'MUSIC_RECOMMENDATIONS',
        enabled: true,
        description: 'Enable music recommendation system',
    },
    AUTOPLAY: {
        name: 'AUTOPLAY',
        enabled: true,
        description: 'Enable autoplay functionality',
    },
    LYRICS: {
        name: 'LYRICS',
        enabled: false,
        description: 'Enable lyrics display (Genius API)',
    },
    QUEUE_MANAGEMENT: {
        name: 'QUEUE_MANAGEMENT',
        enabled: true,
        description: 'Enable advanced queue management features',
    },
    REACTION_ROLES: {
        name: 'REACTION_ROLES',
        enabled: true,
        description:
            'Enable reaction roles with embed builders and button support',
    },
    ROLE_MANAGEMENT: {
        name: 'ROLE_MANAGEMENT',
        enabled: true,
        description:
            'Enable automatic role management (mutually exclusive roles)',
    },
    MODERATION: {
        name: 'MODERATION',
        enabled: true,
        description: 'Enable moderation commands (ban, kick, warn, mute)',
    },
    AUTOMOD: {
        name: 'AUTOMOD',
        enabled: true,
        description:
            'Enable auto-moderation (spam, caps, links, invites, badwords)',
    },
    CUSTOM_COMMANDS: {
        name: 'CUSTOM_COMMANDS',
        enabled: true,
        description: 'Enable custom command creation and triggers',
    },
    AUTO_MESSAGES: {
        name: 'AUTO_MESSAGES',
        enabled: true,
        description: 'Enable scheduled auto-messages in channels',
    },
    SERVER_LOGS: {
        name: 'SERVER_LOGS',
        enabled: true,
        description: 'Enable server audit logging',
    },
    WEBAPP: {
        name: 'WEBAPP',
        enabled: true,
        description: 'Enable web dashboard interface',
    },
    TWITCH_NOTIFICATIONS: {
        name: 'TWITCH_NOTIFICATIONS',
        enabled: true,
        description: 'Enable Twitch stream notifications (requires API keys)',
    },
    LASTFM_INTEGRATION: {
        name: 'LASTFM_INTEGRATION',
        enabled: true,
        description: 'Enable Last.fm scrobbling and profile linking',
    },
    SPOTIFY_INTEGRATION: {
        name: 'SPOTIFY_INTEGRATION',
        enabled: false,
        description: 'Enable Spotify account linking and personalized autoplay seeds',
    },
    WELCOME_MESSAGES: {
        name: 'WELCOME_MESSAGES',
        enabled: true,
        description: 'Enable welcome/leave messages for new members',
    },
    ARTIST_COMMAND: {
        name: 'ARTIST_COMMAND',
        enabled: true,
        description: 'Enable /artist command to queue top tracks from an artist',
    },
    ALBUM_COMMAND: {
        name: 'ALBUM_COMMAND',
        enabled: true,
        description: 'Enable /album command to queue all tracks from an album',
    },
    EMBED_BUILDER: {
        name: 'EMBED_BUILDER',
        enabled: true,
        description: 'Enable /embed command for interactive embed template builder',
    },
    COLLABORATIVE_PLAYLIST: {
        name: 'COLLABORATIVE_PLAYLIST',
        enabled: true,
        description: 'Enable collaborative queue mode (/playlist collaborative)',
    },
    RSS_BRIDGE: {
        name: 'RSS_BRIDGE',
        enabled: true,
        description: 'Enable RSS feed polling for Criativaria guides',
    },
}

function parseEnvironmentToggle(
    name: FeatureToggleName,
    defaultValue: boolean,
): boolean {
    const envKey = `FEATURE_${name}`
    const envValue = process.env[envKey]

    if (envValue === undefined || envValue === '') {
        return defaultValue
    }

    const normalized = envValue.toLowerCase().trim()
    return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

function loadTogglesFromEnvironment(): Record<FeatureToggleName, boolean> {
    const toggles: Partial<Record<FeatureToggleName, boolean>> = {}

    for (const [name, config] of Object.entries(defaultToggles)) {
        toggles[name as FeatureToggleName] = parseEnvironmentToggle(
            name as FeatureToggleName,
            config.enabled,
        )
    }

    return toggles as Record<FeatureToggleName, boolean>
}

export function getFeatureToggleConfig(): Record<
    FeatureToggleName,
    FeatureToggleConfig
> {
    const envToggles = loadTogglesFromEnvironment()
    const config: Partial<Record<FeatureToggleName, FeatureToggleConfig>> = {}

    for (const [name, defaultConfig] of Object.entries(defaultToggles)) {
        const toggleName = name as FeatureToggleName
        config[toggleName] = {
            ...defaultConfig,
            enabled: envToggles[toggleName] ?? defaultConfig.enabled,
        }
    }

    return config as Record<FeatureToggleName, FeatureToggleConfig>
}
