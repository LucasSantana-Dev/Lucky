export type FeatureToggleName =
    | 'DOWNLOAD_VIDEO'
    | 'DOWNLOAD_AUDIO'
    | 'MUSIC_RECOMMENDATIONS'
    | 'AUTOPLAY'
    | 'LYRICS'
    | 'QUEUE_MANAGEMENT'
    | 'REACTION_ROLES'
    | 'ROLE_MANAGEMENT'
    | 'MODERATION'
    | 'AUTOMOD'
    | 'CUSTOM_COMMANDS'
    | 'AUTO_MESSAGES'
    | 'SERVER_LOGS'
    | 'WEBAPP'
    | 'TWITCH_NOTIFICATIONS'
    | 'LASTFM_INTEGRATION'
    | 'SPOTIFY_INTEGRATION'
    | 'WELCOME_MESSAGES'
    | 'ARTIST_COMMAND'
    | 'ALBUM_COMMAND'
    | 'EMBED_BUILDER'
    | 'COLLABORATIVE_PLAYLIST'
    | 'RSS_BRIDGE'

export type FeatureToggleConfig = {
    name: FeatureToggleName
    enabled: boolean
    description: string
}

export type FeatureToggleSource = 'environment' | 'redis' | 'default'

export type FeatureToggleScope = 'global' | 'guild'

export type GlobalFeatureToggleProvider = 'environment' | 'database'

export type GlobalFeatureToggleState = {
    enabled: boolean
    provider: GlobalFeatureToggleProvider
    writable: boolean
}

export interface FeatureToggleContext {
    userId?: string
    guildId?: string
    scope?: FeatureToggleScope
}
