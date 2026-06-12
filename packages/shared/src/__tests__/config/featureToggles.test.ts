import { describe, expect, it, beforeEach, afterEach } from '@jest/globals'
import { getFeatureToggleConfig } from '../../config/featureToggles'

describe('featureToggles.ts', () => {
    const originalEnv = process.env

    beforeEach(() => {
        // Minimal fixture env, never a copy of the real one (#1262 pattern).
        process.env = { NODE_ENV: 'test' } as NodeJS.ProcessEnv
    })

    afterEach(() => {
        process.env = originalEnv
    })

    it('returns defaults when no FEATURE_* env vars are set', () => {
        const config = getFeatureToggleConfig()

        expect(config.AUTOPLAY.enabled).toBe(true)
        expect(config.LYRICS.enabled).toBe(false)
        expect(config.AUTOPLAY.description).toContain('autoplay')
    })

    it('treats empty-string env values as unset', () => {
        process.env.FEATURE_AUTOPLAY = ''
        expect(getFeatureToggleConfig().AUTOPLAY.enabled).toBe(true)
    })

    it.each([
        ['true', true],
        ['TRUE', true],
        ['1', true],
        [' yes ', true],
        ['false', false],
        ['0', false],
        ['anything-else', false],
    ])('parses FEATURE_LYRICS=%s as %s', (value, expected) => {
        process.env.FEATURE_LYRICS = value
        expect(getFeatureToggleConfig().LYRICS.enabled).toBe(expected)
    })

    it('can disable a default-enabled toggle via env', () => {
        process.env.FEATURE_AUTOPLAY = 'false'
        expect(getFeatureToggleConfig().AUTOPLAY.enabled).toBe(false)
    })
})
