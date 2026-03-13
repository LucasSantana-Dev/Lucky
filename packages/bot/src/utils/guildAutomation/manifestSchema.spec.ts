import { describe, it, expect } from '@jest/globals'
import { validateGuildAutomationManifest } from '@lucky/shared/services/guildAutomation/manifestSchema'

describe('guildAutomationManifestSchema', () => {
    it('accepts a valid manifest payload', () => {
        const result = validateGuildAutomationManifest({
            version: 1,
            guild: {
                id: '123456789012345678',
                name: 'Criativaria',
            },
            source: 'manual',
        })

        expect(result.version).toBe(1)
        expect(result.guild.id).toBe('123456789012345678')
    })

    it('rejects an invalid guild id', () => {
        expect(() =>
            validateGuildAutomationManifest({
                version: 1,
                guild: {
                    id: 'invalid',
                },
            }),
        ).toThrow()
    })
})
