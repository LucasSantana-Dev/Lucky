import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const upsert = jest.fn<(args: unknown) => Promise<unknown>>()

jest.mock('../utils/database/prismaClient', () => ({
    getPrismaClient: () => ({ moderationSettings: { upsert } }),
}))

import {
    hasModPermissions,
    updateModerationSettings,
} from './moderationSettings'

const GUILD = '111111111111111111'

function settingsWith(overrides: Record<string, unknown>) {
    return { guildId: GUILD, modRoleIds: [], adminRoleIds: [], ...overrides }
}

describe('moderationSettings (#2630: guild id is the @everyone role)', () => {
    beforeEach(() => {
        upsert.mockReset()
    })

    describe('hasModPermissions', () => {
        it('ignores a stored @everyone mod role so plain members are not mods', async () => {
            upsert.mockResolvedValue(settingsWith({ modRoleIds: [GUILD] }))

            await expect(hasModPermissions(GUILD, [GUILD])).resolves.toBe(false)
        })

        it('ignores a stored @everyone admin role', async () => {
            upsert.mockResolvedValue(settingsWith({ adminRoleIds: [GUILD] }))

            await expect(hasModPermissions(GUILD, [GUILD])).resolves.toBe(false)
        })

        it('still grants a real mod role next to a poisoned entry', async () => {
            upsert.mockResolvedValue(
                settingsWith({ modRoleIds: [GUILD, 'mod-role'] }),
            )

            await expect(
                hasModPermissions(GUILD, [GUILD, 'mod-role']),
            ).resolves.toBe(true)
        })

        it('denies a member without any configured role', async () => {
            upsert.mockResolvedValue(settingsWith({ modRoleIds: ['mod-role'] }))

            await expect(
                hasModPermissions(GUILD, [GUILD, 'other']),
            ).resolves.toBe(false)
        })
    })

    describe('updateModerationSettings', () => {
        it.each([
            ['modRoleIds', { modRoleIds: ['mod-role', GUILD] }],
            ['adminRoleIds', { adminRoleIds: [GUILD] }],
            ['muteRoleId', { muteRoleId: GUILD }],
        ])(
            'rejects the guild id in %s without writing',
            async (_field, data) => {
                await expect(
                    updateModerationSettings(GUILD, data),
                ).rejects.toThrow(/@everyone/)
                expect(upsert).not.toHaveBeenCalled()
            },
        )

        it('writes valid role ids unchanged', async () => {
            const data = { modRoleIds: ['mod-role'], muteRoleId: 'mute-role' }
            upsert.mockResolvedValue(settingsWith(data))

            await updateModerationSettings(GUILD, data)

            expect(upsert).toHaveBeenCalledWith({
                where: { guildId: GUILD },
                create: { guildId: GUILD, ...data },
                update: data,
            })
        })
    })
})
