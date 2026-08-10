import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
    GuildMemberRoleManager,
    PermissionFlagsBits,
    PermissionsBitField,
} from 'discord.js'
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js'

const getGuildSettingsMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    guildSettingsService: {
        getGuildSettings: (...args: unknown[]) => getGuildSettingsMock(...args),
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

function makeRoleManager(roleIds: string[]): GuildMemberRoleManager {
    const roleManager = Object.create(GuildMemberRoleManager.prototype)
    Object.defineProperty(roleManager, 'cache', {
        value: new Map(roleIds.map((id) => [id, {}])),
    })
    return roleManager as GuildMemberRoleManager
}

describe('requireDJRoleInGuild', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('rejects when the interaction has no guildId', async () => {
        const interaction = makeInteraction({ guildId: null })

        await expect(
            requireDJRoleInGuild(interaction, 'someCheck'),
        ).rejects.toThrow(
            'assertDefined: Guild ID required after someCheck check',
        )
    })

    it('grants members with ManageGuild without consulting guild settings', async () => {
        const interaction = makeInteraction()

        await expect(
            requireDJRoleInGuild(interaction, 'someCheck'),
        ).resolves.toBe(true)
        expect(getGuildSettingsMock).not.toHaveBeenCalled()
    })

    it('passes the resolved guildId to guild settings for a non-manager holding the DJ role', async () => {
        getGuildSettingsMock.mockResolvedValueOnce({ djRoleId: 'dj-role' })
        const interaction = makeInteraction({
            member: {
                permissions: new PermissionsBitField(),
                roles: makeRoleManager(['dj-role']),
            } as GuildMember,
        })

        await expect(
            requireDJRoleInGuild(interaction, 'someCheck'),
        ).resolves.toBe(true)
        expect(getGuildSettingsMock).toHaveBeenCalledWith('guild-1')
    })
})
