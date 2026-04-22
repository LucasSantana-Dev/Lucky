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
    | 'WELCOME_MESSAGES'

export type FeatureToggleConfig = {
    name: FeatureToggleName
    enabled: boolean
    description: string
}

export type FeatureToggleSource = 'environment' | 'redis' | 'default'

export type FeatureToggleScope = 'global' | 'guild'

export type GlobalFeatureToggleProvider = 'vercel' | 'environment'

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
