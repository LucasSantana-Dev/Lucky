import { describe, expect, test } from 'vitest'
import {
    createEmptyEffectiveAccess,
    hasAnyAccess,
    hasModuleAccess,
} from './rbac'

describe('rbac helpers', () => {
    test('createEmptyEffectiveAccess returns deny-all map', () => {
        expect(createEmptyEffectiveAccess()).toEqual({
            overview: 'none',
            settings: 'none',
            moderation: 'none',
            automation: 'none',
            music: 'none',
            integrations: 'none',
        })
    })

    test('hasModuleAccess enforces view and manage semantics', () => {
        const access = {
            overview: 'view',
            settings: 'manage',
            moderation: 'none',
            automation: 'none',
            music: 'none',
            integrations: 'none',
        } as const

        expect(hasModuleAccess(undefined, 'overview', 'view')).toBe(false)
        expect(hasModuleAccess(undefined, 'overview')).toBe(false)
        expect(hasModuleAccess(access, 'overview')).toBe(true)
        expect(hasModuleAccess(access, 'overview', 'view')).toBe(true)
        expect(hasModuleAccess(access, 'overview', 'manage')).toBe(false)
        expect(hasModuleAccess(access, 'settings')).toBe(true)
        expect(hasModuleAccess(access, 'settings', 'view')).toBe(true)
        expect(hasModuleAccess(access, 'settings', 'manage')).toBe(true)
    })

    test('hasAnyAccess returns true when at least one module is granted', () => {
        expect(hasAnyAccess(undefined)).toBe(false)
        expect(hasAnyAccess(createEmptyEffectiveAccess())).toBe(false)
        expect(
            hasAnyAccess({
                ...createEmptyEffectiveAccess(),
                music: 'view',
            }),
        ).toBe(true)
        expect(
            hasAnyAccess({
                ...createEmptyEffectiveAccess(),
                music: 'manage',
            }),
        ).toBe(true)
    })
})
