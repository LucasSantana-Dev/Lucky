import type { FeatureToggleConfig, FeatureToggleName } from '../types/featureToggle'

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
        enabled: true,
        description: 'Enable lyrics display',
    },
    QUEUE_MANAGEMENT: {
        name: 'QUEUE_MANAGEMENT',
        enabled: true,
        description: 'Enable advanced queue management features',
    },
    REACTION_ROLES: {
        name: 'REACTION_ROLES',
        enabled: true,
        description: 'Enable reaction roles with embed builders and button support',
    },
    ROLE_MANAGEMENT: {
        name: 'ROLE_MANAGEMENT',
        enabled: true,
        description: 'Enable automatic role management (mutually exclusive roles)',
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
