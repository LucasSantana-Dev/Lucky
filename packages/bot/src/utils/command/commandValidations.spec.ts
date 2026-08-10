import { describe, expect, it, jest } from '@jest/globals'
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js'
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js'

jest.mock('@lucky/shared/services', () => ({
    guildSettingsService: {
        getGuildSettings: jest.fn(),
    },
}))
jest.mock('@lucky/shared/utils', () => ({
    handleError: jest.fn(),
    createUserErrorMessage: jest.fn(() => 'error'),
    warnLog: jest.fn(),
}))

import { requireDJRoleInGuild } from './commandValidations'

function makeInteraction(
    overrides: Record<string, unknown> = {},
): ChatInputCommandInteraction {
    return {
        guildId: 'guild-1',
        member: {
            permissions: new PermissionsBitField(
                PermissionFlagsBits.ManageGuild,
            ),
        } as GuildMember,
        ...overrides,
    } as unknown as ChatInputCommandInteraction
}

describe('requireDJRoleInGuild', () => {
    it('rejects when the interaction has no guildId', async () => {
        const interaction = makeInteraction({ guildId: null })

        await expect(
            requireDJRoleInGuild(interaction, 'someCheck'),
        ).rejects.toThrow(
            'assertDefined: Guild ID required after someCheck check',
        )
    })

    it('delegates to requireDJRole with the resolved guildId', async () => {
        const interaction = makeInteraction()

        await expect(
            requireDJRoleInGuild(interaction, 'someCheck'),
        ).resolves.toBe(true)
    })
})
