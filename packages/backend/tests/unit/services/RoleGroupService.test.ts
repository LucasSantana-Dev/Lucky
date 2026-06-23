import { describe, test, expect, beforeEach, jest } from '@jest/globals'

const mockPrisma: any = {
    roleGroup: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
    reactionRoleMessage: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
    },
    reactionRoleMapping: {
        findMany: jest.fn(),
        create: jest.fn(),
    },
}

jest.mock('@lucky/shared/utils/database/prismaClient', () => {
    return { getPrismaClient: () => mockPrisma }
})

jest.mock('@lucky/shared/utils/general/log', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
}))

// Mock the singletons that are imported at the module level
jest.mock('../../../src/services/GuildService', () => {
    return {
        guildService: {
            createGuildRole: jest.fn(),
            deleteGuildRole: jest.fn(),
            getFullGuildRoles: jest.fn(),
        },
    }
})

jest.mock('@lucky/shared/services/ReactionRolesService', () => {
    return {
        reactionRolesService: {
            addRoleToMessage: jest.fn(),
        },
    }
})

import { RoleGroupService } from '../../../src/services/RoleGroupService'

describe('RoleGroupService', () => {
    let service: InstanceType<typeof RoleGroupService>

    const GUILD_ID = '111111111111111111'
    const MESSAGE_ID = 'msg-123'
    const ROLE_ID_A = 'role-111'
    const ROLE_ID_B = 'role-222'
    const BOT_TOKEN = 'token-xyz'

    beforeEach(() => {
        jest.clearAllMocks()
        service = new RoleGroupService()
    })

    describe('hex ↔ int color conversion', () => {
        test('converts hex string to integer color', () => {
            // 0x5865F2 = 5793266
            expect(service.hexToInt('0x5865F2')).toBe(5793266)
        })

        test('converts integer color to hex string', () => {
            // 5793266 = 0x5865F2
            expect(service.intToHex(5793266)).toBe('0x5865F2')
        })

        test('returns undefined for null hex', () => {
            expect(service.hexToInt(null)).toBeUndefined()
        })

        test('returns undefined for null int', () => {
            expect(service.intToHex(null)).toBeUndefined()
        })

        test('round-trip conversion preserves value', () => {
            const original = 5793266
            const hex = service.intToHex(original)
            const roundTrip = service.hexToInt(hex)
            expect(roundTrip).toBe(original)
        })
    })

    describe('seedStyleFromMessage', () => {
        test('returns modal color, mode buttonStyle, and divergence flag from siblings', async () => {
            const mockRoles = [
                {
                    id: ROLE_ID_A,
                    color: 5793266,
                    hoist: true,
                    mentionable: false,
                },
                {
                    id: ROLE_ID_B,
                    color: 5793266,
                    hoist: true,
                    mentionable: false,
                },
            ]
            const mockMappings = [
                { id: 'map-1', roleId: ROLE_ID_A, style: 'Primary' },
                { id: 'map-2', roleId: ROLE_ID_B, style: 'Primary' },
            ]

            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValue({
                id: MESSAGE_ID,
                guildId: GUILD_ID,
            })
            mockPrisma.reactionRoleMapping.findMany.mockResolvedValue(
                mockMappings,
            )

            const { guildService } =
                await import('../../../src/services/GuildService')
            ;(guildService.getFullGuildRoles as jest.Mock).mockResolvedValue(
                mockRoles,
            )

            const result = await service.seedStyleFromMessage(MESSAGE_ID)

            expect(result.color).toBe('0x5865F2')
            expect(result.hoist).toBe(true)
            expect(result.mentionable).toBe(false)
            expect(result.buttonStyle).toBe('Primary')
            expect(result.divergence).toBe(false)
        })

        test('flags divergence when sibling colors differ', async () => {
            const mockRoles = [
                {
                    id: ROLE_ID_A,
                    color: 5793266,
                    hoist: true,
                    mentionable: false,
                },
                {
                    id: ROLE_ID_B,
                    color: 16711680,
                    hoist: true,
                    mentionable: false,
                }, // different color (red)
            ]
            const mockMappings = [
                { id: 'map-1', roleId: ROLE_ID_A, style: 'Primary' },
                { id: 'map-2', roleId: ROLE_ID_B, style: 'Primary' },
            ]

            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValue({
                id: MESSAGE_ID,
                guildId: GUILD_ID,
            })
            mockPrisma.reactionRoleMapping.findMany.mockResolvedValue(
                mockMappings,
            )

            const { guildService } =
                await import('../../../src/services/GuildService')
            ;(guildService.getFullGuildRoles as jest.Mock).mockResolvedValue(
                mockRoles,
            )

            const result = await service.seedStyleFromMessage(MESSAGE_ID)

            expect(result.divergence).toBe(true)
        })

        test('defaults buttonStyle to Primary on tie', async () => {
            const mockRoles = [
                {
                    id: ROLE_ID_A,
                    color: 5793266,
                    hoist: true,
                    mentionable: false,
                },
                {
                    id: ROLE_ID_B,
                    color: 5793266,
                    hoist: true,
                    mentionable: false,
                },
            ]
            const mockMappings = [
                { id: 'map-1', roleId: ROLE_ID_A, style: 'Primary' },
                { id: 'map-2', roleId: ROLE_ID_B, style: 'Secondary' },
            ]

            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValue({
                id: MESSAGE_ID,
                guildId: GUILD_ID,
            })
            mockPrisma.reactionRoleMapping.findMany.mockResolvedValue(
                mockMappings,
            )

            const { guildService } =
                await import('../../../src/services/GuildService')
            ;(guildService.getFullGuildRoles as jest.Mock).mockResolvedValue(
                mockRoles,
            )

            const result = await service.seedStyleFromMessage(MESSAGE_ID)

            expect(result.buttonStyle).toBe('Primary')
        })
    })

    describe('createRoleGroup', () => {
        test('creates a role group with provided style when no fromMessageId', async () => {
            mockPrisma.roleGroup.create.mockResolvedValue({
                id: 'group-1',
                guildId: GUILD_ID,
                name: 'TestGroup',
                color: '0x5865F2',
                hoist: false,
                mentionable: false,
                buttonStyle: 'Primary',
                defaultEmoji: null,
            })

            const result = await service.createRoleGroup({
                guildId: GUILD_ID,
                name: 'TestGroup',
                style: {
                    color: '0x5865F2',
                    hoist: false,
                    mentionable: false,
                    buttonStyle: 'Primary',
                },
            })

            expect(result.id).toBe('group-1')
            expect(result.name).toBe('TestGroup')
            expect(result.color).toBe('0x5865F2')
            expect(mockPrisma.roleGroup.create).toHaveBeenCalled()
        })

        test('seeds style from message and links when fromMessageId provided', async () => {
            const mockRoles = [
                {
                    id: ROLE_ID_A,
                    color: 5793266,
                    hoist: true,
                    mentionable: false,
                },
            ]
            const mockMappings = [
                { id: 'map-1', roleId: ROLE_ID_A, style: 'Primary' },
            ]

            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValue({
                id: MESSAGE_ID,
                guildId: GUILD_ID,
                groupId: null,
            })
            mockPrisma.reactionRoleMapping.findMany.mockResolvedValue(
                mockMappings,
            )
            mockPrisma.roleGroup.create.mockResolvedValue({
                id: 'group-1',
                guildId: GUILD_ID,
                name: 'TestGroup',
                color: '0x5865F2',
                hoist: true,
                mentionable: false,
                buttonStyle: 'Primary',
            })
            mockPrisma.reactionRoleMessage.update.mockResolvedValue({
                id: MESSAGE_ID,
                groupId: 'group-1',
            })

            const { guildService } =
                await import('../../../src/services/GuildService')
            ;(guildService.getFullGuildRoles as jest.Mock).mockResolvedValue(
                mockRoles,
            )

            const result = await service.createRoleGroup({
                guildId: GUILD_ID,
                name: 'TestGroup',
                fromMessageId: MESSAGE_ID,
            })

            expect(result.id).toBe('group-1')
            expect(mockPrisma.reactionRoleMessage.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: MESSAGE_ID },
                    data: { groupId: 'group-1' },
                }),
            )
        })

        test('throws conflict when message already has a groupId', async () => {
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValue({
                id: MESSAGE_ID,
                guildId: GUILD_ID,
                groupId: 'existing-group',
            })

            await expect(
                service.createRoleGroup({
                    guildId: GUILD_ID,
                    name: 'TestGroup',
                    fromMessageId: MESSAGE_ID,
                }),
            ).rejects.toThrow(/already has a group|conflict/i)
        })
    })

    describe('addRoleToGroup', () => {
        test('dryRun returns plan with zero mutations', async () => {
            mockPrisma.roleGroup.findUnique.mockResolvedValue({
                id: 'group-1',
                guildId: GUILD_ID,
                name: 'TestGroup',
                color: '0x5865F2',
                hoist: true,
                mentionable: false,
                buttonStyle: 'Primary',
            })
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValue({
                id: MESSAGE_ID,
                guildId: GUILD_ID,
            })
            mockPrisma.reactionRoleMapping.findMany.mockResolvedValue([])

            const { guildService } =
                await import('../../../src/services/GuildService')
            ;(guildService.getFullGuildRoles as jest.Mock).mockResolvedValue([])

            const result = await service.addRoleToGroup(
                'group-1',
                { name: 'NewRole', dryRun: true },
                BOT_TOKEN,
            )

            expect(result).toHaveProperty('plan')
            expect(result.plan).toMatchObject({
                roleName: 'NewRole',
                resolvedColorHex: '0x5865F2',
                resolvedColorInt: 5793266,
                buttonStyle: 'Primary',
                willCreateRole: true,
                willAddButton: true,
            })
            expect(guildService.createGuildRole).not.toHaveBeenCalled()
        })

        test('preflight rejects when message has >= 25 buttons', async () => {
            mockPrisma.roleGroup.findUnique.mockResolvedValue({
                id: 'group-1',
                guildId: GUILD_ID,
                color: '0x5865F2',
                hoist: true,
                mentionable: false,
                buttonStyle: 'Primary',
            })
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValue({
                id: MESSAGE_ID,
                guildId: GUILD_ID,
            })
            const mappings = Array.from({ length: 25 }, (_, i) => ({
                id: `map-${i}`,
                roleId: `role-${i}`,
                style: 'Primary',
            }))
            mockPrisma.reactionRoleMapping.findMany.mockResolvedValue(mappings)

            await expect(
                service.addRoleToGroup(
                    'group-1',
                    { name: 'NewRole' },
                    BOT_TOKEN,
                ),
            ).rejects.toThrow(/25|capacity|limit/i)
        })

        test('preflight rejects when guild has >= 250 roles', async () => {
            mockPrisma.roleGroup.findUnique.mockResolvedValue({
                id: 'group-1',
                guildId: GUILD_ID,
                color: '0x5865F2',
                hoist: true,
                mentionable: false,
                buttonStyle: 'Primary',
            })
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValue({
                id: MESSAGE_ID,
                guildId: GUILD_ID,
            })
            mockPrisma.reactionRoleMapping.findMany.mockResolvedValue([])

            const { guildService } =
                await import('../../../src/services/GuildService')
            const manyRoles = Array.from({ length: 250 }, (_, i) => ({
                id: `role-${i}`,
                name: `Role ${i}`,
                color: 0,
                hoist: false,
                mentionable: false,
                permissions: '0',
                position: i,
                managed: false,
            }))
            ;(guildService.getFullGuildRoles as jest.Mock).mockResolvedValue(
                manyRoles,
            )

            await expect(
                service.addRoleToGroup(
                    'group-1',
                    { name: 'NewRole' },
                    BOT_TOKEN,
                ),
            ).rejects.toThrow(/250|role limit/i)
        })

        test('preflight rejects when label > 80 chars', async () => {
            mockPrisma.roleGroup.findUnique.mockResolvedValue({
                id: 'group-1',
                guildId: GUILD_ID,
                color: '0x5865F2',
                hoist: true,
                mentionable: false,
                buttonStyle: 'Primary',
            })
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValue({
                id: MESSAGE_ID,
                guildId: GUILD_ID,
            })
            mockPrisma.reactionRoleMapping.findMany.mockResolvedValue([])

            const { guildService } =
                await import('../../../src/services/GuildService')
            ;(guildService.getFullGuildRoles as jest.Mock).mockResolvedValue([])

            const longLabel = 'a'.repeat(81)
            await expect(
                service.addRoleToGroup(
                    'group-1',
                    { name: 'NewRole', label: longLabel },
                    BOT_TOKEN,
                ),
            ).rejects.toThrow(/80|label.*length/i)
        })

        test('preflight rejects when role name already exists in group message', async () => {
            mockPrisma.roleGroup.findUnique.mockResolvedValue({
                id: 'group-1',
                guildId: GUILD_ID,
                color: '0x5865F2',
                hoist: true,
                mentionable: false,
                buttonStyle: 'Primary',
            })
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValue({
                id: MESSAGE_ID,
                guildId: GUILD_ID,
            })
            mockPrisma.reactionRoleMapping.findMany.mockResolvedValue([
                {
                    id: 'map-1',
                    roleId: 'role-existing',
                    style: 'Primary',
                    label: 'ExistingRole',
                },
            ])

            const { guildService } =
                await import('../../../src/services/GuildService')
            ;(guildService.getFullGuildRoles as jest.Mock).mockResolvedValue([
                {
                    id: 'role-existing',
                    name: 'ExistingRole',
                    color: 0,
                    hoist: false,
                    mentionable: false,
                    permissions: '0',
                    position: 0,
                    managed: false,
                },
            ])

            await expect(
                service.addRoleToGroup(
                    'group-1',
                    { name: 'ExistingRole' },
                    BOT_TOKEN,
                ),
            ).rejects.toThrow(/already.*mapped|duplicate|exists/i)
        })

        test('applies role creation and button add on success', async () => {
            mockPrisma.roleGroup.findUnique.mockResolvedValue({
                id: 'group-1',
                guildId: GUILD_ID,
                color: '0x5865F2',
                hoist: true,
                mentionable: false,
                buttonStyle: 'Primary',
            })
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValue({
                id: MESSAGE_ID,
                guildId: GUILD_ID,
            })
            mockPrisma.reactionRoleMapping.findMany.mockResolvedValue([])

            const { guildService } =
                await import('../../../src/services/GuildService')
            ;(guildService.getFullGuildRoles as jest.Mock).mockResolvedValue([])
            ;(guildService.createGuildRole as jest.Mock).mockResolvedValue({
                id: ROLE_ID_A,
                name: 'NewRole',
                color: 5793266,
                hoist: true,
                mentionable: false,
                permissions: '0',
                position: 0,
                managed: false,
            })

            const { reactionRolesService } =
                await import('@lucky/shared/services/ReactionRolesService')
            ;(
                reactionRolesService.addRoleToMessage as jest.Mock
            ).mockResolvedValue({
                status: 'ok',
                mapping: {
                    id: 'map-1',
                    roleId: ROLE_ID_A,
                    label: 'NewRole',
                    style: 'Primary',
                },
            })

            const result = await service.addRoleToGroup(
                'group-1',
                { name: 'NewRole' },
                BOT_TOKEN,
            )

            expect(result.status).toBe('ok')
            expect(result.role?.id).toBe(ROLE_ID_A)
            expect(guildService.createGuildRole).toHaveBeenCalledWith(
                GUILD_ID,
                {
                    name: 'NewRole',
                    color: 5793266,
                    hoist: true,
                    mentionable: false,
                    permissions: '0',
                },
            )
        })

        test('compensation: deletes created role if addRoleToMessage fails', async () => {
            mockPrisma.roleGroup.findUnique.mockResolvedValue({
                id: 'group-1',
                guildId: GUILD_ID,
                color: '0x5865F2',
                hoist: true,
                mentionable: false,
                buttonStyle: 'Primary',
            })
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValue({
                id: MESSAGE_ID,
                guildId: GUILD_ID,
            })
            mockPrisma.reactionRoleMapping.findMany.mockResolvedValue([])

            const { guildService } =
                await import('../../../src/services/GuildService')
            ;(guildService.getFullGuildRoles as jest.Mock).mockResolvedValue([])
            ;(guildService.createGuildRole as jest.Mock).mockResolvedValue({
                id: ROLE_ID_A,
                name: 'NewRole',
                color: 5793266,
                hoist: true,
                mentionable: false,
                permissions: '0',
                position: 0,
                managed: false,
            })

            const { reactionRolesService } =
                await import('@lucky/shared/services/ReactionRolesService')
            ;(
                reactionRolesService.addRoleToMessage as jest.Mock
            ).mockRejectedValue(new Error('DB transaction failed'))
            ;(guildService.deleteGuildRole as jest.Mock).mockResolvedValue(
                undefined,
            )

            await expect(
                service.addRoleToGroup(
                    'group-1',
                    { name: 'NewRole' },
                    BOT_TOKEN,
                ),
            ).rejects.toThrow(/transaction failed|compensation/i)

            expect(guildService.deleteGuildRole).toHaveBeenCalledWith(
                GUILD_ID,
                ROLE_ID_A,
            )
        })

        test('handles deleteGuildRole 404 as success during compensation', async () => {
            mockPrisma.roleGroup.findUnique.mockResolvedValue({
                id: 'group-1',
                guildId: GUILD_ID,
                color: '0x5865F2',
                hoist: true,
                mentionable: false,
                buttonStyle: 'Primary',
            })
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValue({
                id: MESSAGE_ID,
                guildId: GUILD_ID,
            })
            mockPrisma.reactionRoleMapping.findMany.mockResolvedValue([])

            const { guildService } =
                await import('../../../src/services/GuildService')
            ;(guildService.getFullGuildRoles as jest.Mock).mockResolvedValue([])
            ;(guildService.createGuildRole as jest.Mock).mockResolvedValue({
                id: ROLE_ID_A,
                name: 'NewRole',
                color: 5793266,
                hoist: true,
                mentionable: false,
                permissions: '0',
                position: 0,
                managed: false,
            })

            const { reactionRolesService } =
                await import('@lucky/shared/services/ReactionRolesService')
            ;(
                reactionRolesService.addRoleToMessage as jest.Mock
            ).mockRejectedValue(new Error('DB transaction failed'))
            ;(guildService.deleteGuildRole as jest.Mock).mockRejectedValue(
                new Error('Role not found (404)'),
            )

            await expect(
                service.addRoleToGroup(
                    'group-1',
                    { name: 'NewRole' },
                    BOT_TOKEN,
                ),
            ).rejects.toThrow()

            // deleteGuildRole should still be called (404 is tolerated internally)
            expect(guildService.deleteGuildRole).toHaveBeenCalledWith(
                GUILD_ID,
                ROLE_ID_A,
            )
        })

        test('returns partial_success when addRoleToMessage succeeds but Discord PATCH fails', async () => {
            mockPrisma.roleGroup.findUnique.mockResolvedValue({
                id: 'group-1',
                guildId: GUILD_ID,
                color: '0x5865F2',
                hoist: true,
                mentionable: false,
                buttonStyle: 'Primary',
            })
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValue({
                id: MESSAGE_ID,
                guildId: GUILD_ID,
            })
            mockPrisma.reactionRoleMapping.findMany.mockResolvedValue([])

            const { guildService } =
                await import('../../../src/services/GuildService')
            ;(guildService.getFullGuildRoles as jest.Mock).mockResolvedValue([])
            ;(guildService.createGuildRole as jest.Mock).mockResolvedValue({
                id: ROLE_ID_A,
                name: 'NewRole',
                color: 5793266,
                hoist: true,
                mentionable: false,
                permissions: '0',
                position: 0,
                managed: false,
            })

            const { reactionRolesService } =
                await import('@lucky/shared/services/ReactionRolesService')
            ;(
                reactionRolesService.addRoleToMessage as jest.Mock
            ).mockResolvedValue({
                status: 'partial_success',
                mapping: {
                    id: 'map-1',
                    roleId: ROLE_ID_A,
                    label: 'NewRole',
                    style: 'Primary',
                },
            })

            const { infoLog } = await import('@lucky/shared/utils/general/log')

            const result = await service.addRoleToGroup(
                'group-1',
                { name: 'NewRole' },
                BOT_TOKEN,
            )

            expect(result.status).toBe('partial_success')
            expect(result.role?.id).toBe(ROLE_ID_A)
            // Audit log should be called
            expect(infoLog).toHaveBeenCalled()
        })

        test('respects colorOverride when provided', async () => {
            mockPrisma.roleGroup.findUnique.mockResolvedValue({
                id: 'group-1',
                guildId: GUILD_ID,
                color: '0x5865F2',
                hoist: true,
                mentionable: false,
                buttonStyle: 'Primary',
            })
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValue({
                id: MESSAGE_ID,
                guildId: GUILD_ID,
            })
            mockPrisma.reactionRoleMapping.findMany.mockResolvedValue([])

            const { guildService } =
                await import('../../../src/services/GuildService')
            ;(guildService.getFullGuildRoles as jest.Mock).mockResolvedValue([])
            ;(guildService.createGuildRole as jest.Mock).mockResolvedValue({
                id: ROLE_ID_A,
                name: 'NewRole',
                color: 16711680, // red
                hoist: true,
                mentionable: false,
                permissions: '0',
                position: 0,
                managed: false,
            })

            const { reactionRolesService } =
                await import('@lucky/shared/services/ReactionRolesService')
            ;(
                reactionRolesService.addRoleToMessage as jest.Mock
            ).mockResolvedValue({
                status: 'ok',
                mapping: {
                    id: 'map-1',
                    roleId: ROLE_ID_A,
                    label: 'NewRole',
                    style: 'Primary',
                },
            })

            await service.addRoleToGroup(
                'group-1',
                { name: 'NewRole', colorOverride: '0xFF0000' },
                BOT_TOKEN,
            )

            expect(guildService.createGuildRole).toHaveBeenCalledWith(
                GUILD_ID,
                expect.objectContaining({
                    color: 16711680,
                }),
            )
        })
    })
})
