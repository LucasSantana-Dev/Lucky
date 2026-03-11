import {
    RBAC_MODULES,
    type AccessMode,
    type EffectiveAccessMap,
    type ModuleKey,
} from '@/types'

export function createEmptyEffectiveAccess(): EffectiveAccessMap {
    return {
        overview: 'none',
        settings: 'none',
        moderation: 'none',
        automation: 'none',
        music: 'none',
        integrations: 'none',
    }
}

export function hasModuleAccess(
    map: EffectiveAccessMap | undefined,
    module: ModuleKey,
    requiredMode: AccessMode = 'view',
): boolean {
    if (!map) {
        return false
    }

    const value = map[module]
    if (requiredMode === 'view') {
        return value === 'view' || value === 'manage'
    }

    return value === 'manage'
}

export function hasAnyAccess(map: EffectiveAccessMap | undefined): boolean {
    if (!map) {
        return false
    }

    return RBAC_MODULES.some((module) => map[module] !== 'none')
}
