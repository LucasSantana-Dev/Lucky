export type FeatureToggleName =
    | 'DOWNLOAD_VIDEO'
    | 'DOWNLOAD_AUDIO'
    | 'MUSIC_RECOMMENDATIONS'
    | 'AUTOPLAY'
    | 'LYRICS'
    | 'QUEUE_MANAGEMENT'
    | 'REACTION_ROLES'
    | 'ROLE_MANAGEMENT'

export type FeatureToggleConfig = {
    name: FeatureToggleName
    enabled: boolean
    description: string
}

export type FeatureToggleSource = 'environment' | 'redis' | 'default'

export type FeatureToggleScope = 'global' | 'guild'

export interface FeatureToggleContext {
    userId?: string
    guildId?: string
    scope?: FeatureToggleScope
}
