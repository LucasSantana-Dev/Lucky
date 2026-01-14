export type FeatureToggleName =
  | 'DOWNLOAD_VIDEO'
  | 'DOWNLOAD_AUDIO'
  | 'MUSIC_RECOMMENDATIONS'
  | 'AUTOPLAY'
  | 'LYRICS'
  | 'QUEUE_MANAGEMENT'
  | 'REACTION_ROLES'
  | 'ROLE_MANAGEMENT'

export interface Feature {
  name: FeatureToggleName
  description: string
}

export interface FeatureToggleState {
  [key: string]: boolean
}
