export interface Feature {
    name: FeatureToggleName
    description: string
    isGlobal?: boolean
}

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

export type FeatureToggleState = Record<FeatureToggleName, boolean>

export type GlobalFeatureToggleProvider = 'vercel' | 'environment'

export interface GlobalFeatureToggleResponse {
    toggles: FeatureToggleState
    provider?: GlobalFeatureToggleProvider
    writable?: boolean
    sources?: Partial<Record<FeatureToggleName, GlobalFeatureToggleProvider>>
}
