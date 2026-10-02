import { describe, test, expect } from '@jest/globals'
import { moderationSchemas as s } from '../../../src/schemas/moderation'

describe('moderationSchemas.updateSettingsBody', () => {
    test('accepts a valid partial body', () => {
        const r = s.updateSettingsBody.safeParse({
            modLogChannelId: '123456789012345678',
            muteRoleId: null,
            maxWarnings: 5,
            dmOnAction: false,
        })
        expect(r.success).toBe(true)
    })

    test('rejects unknown keys', () => {
        expect(
            s.updateSettingsBody.safeParse({ warnThreshold: 3 }).success,
        ).toBe(false)
    })

    test('rejects an empty body with a clear message', () => {
        const r = s.updateSettingsBody.safeParse({})
        expect(r.success).toBe(false)
        if (!r.success) {
            expect(r.error.issues[0].message).toMatch(/at least one/i)
        }
    })

    test('enforces maxWarnings bounds 1 to 50', () => {
        expect(s.updateSettingsBody.safeParse({ maxWarnings: 0 }).success).toBe(
            false,
        )
        expect(
            s.updateSettingsBody.safeParse({ maxWarnings: 51 }).success,
        ).toBe(false)
        expect(
            s.updateSettingsBody.safeParse({ maxWarnings: 50 }).success,
        ).toBe(true)
    })
})
