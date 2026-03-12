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

    it('accepts typed moderation payload and cutover bot flags', () => {
        const result = validateGuildAutomationManifest({
            version: 1,
            guild: {
                id: '123456789012345678',
            },
            moderation: {
                automod: {
                    enabled: true,
                    spamThreshold: 5,
                },
                moderationSettings: {
                    modRoleIds: ['223456789012345678'],
                    requireReason: true,
                },
            },
            parity: {
                externalBots: [
                    {
                        id: '323456789012345678',
                        name: 'Legacy Bot',
                        retireOnCutover: true,
                    },
                ],
            },
        })

        expect(result.parity?.externalBots?.[0]?.retireOnCutover).toBe(true)
        expect(result.moderation?.automod?.enabled).toBe(true)
    })
})
