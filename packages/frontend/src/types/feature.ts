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

export type FeatureToggleState = Record<FeatureToggleName, boolean>
