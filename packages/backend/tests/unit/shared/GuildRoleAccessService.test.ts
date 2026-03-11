import { beforeEach, describe, expect, jest, test } from '@jest/globals'

const mockFindMany = jest.fn<any>()
const mockDeleteMany = jest.fn<any>()
const mockCreateMany = jest.fn<any>()
const mockTransaction = jest.fn<any>()

const mockRedisIsHealthy = jest.fn<boolean, []>()
const mockRedisGet = jest.fn<any>()
const mockRedisSetex = jest.fn<any>()
const mockRedisDel = jest.fn<any>()

const mockErrorLog = jest.fn<void, [unknown]>()

jest.mock('../../../../shared/src/utils/database/prismaClient.js', () => ({
    getPrismaClient: () => ({
        guildRoleGrant: {
            findMany: (...args: any[]) => mockFindMany(...args),
        },
        $transaction: (...args: any[]) => mockTransaction(...args),
    }),
}))

jest.mock('../../../../shared/src/services/redis/index.js', () => ({
    redisClient: {
        isHealthy: () => mockRedisIsHealthy(),
        get: (...args: any[]) => mockRedisGet(...args),
        setex: (...args: any[]) => mockRedisSetex(...args),
        del: (...args: any[]) => mockRedisDel(...args),
    },
}))

jest.mock('../../../../shared/src/utils/general/log.js', () => ({
    errorLog: (...args: [unknown]) => mockErrorLog(...args),
}))

import { guildRoleAccessService } from '../../../../shared/src/services/GuildRoleAccessService'

const guildId = '111111111111111111'
const now = new Date('2026-03-11T00:00:00.000Z')

describe('GuildRoleAccessService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockRedisIsHealthy.mockReturnValue(true)
        mockRedisGet.mockResolvedValue(null)
        mockRedisSetex.mockResolvedValue(undefined)
        mockRedisDel.mockResolvedValue(undefined)
        mockFindMany.mockResolvedValue([])
        mockDeleteMany.mockResolvedValue(undefined)
        mockCreateMany.mockResolvedValue(undefined)
        mockTransaction.mockImplementation(async (callback: any) =>
            callback({
                guildRoleGrant: {
                    deleteMany: (...args: any[]) => mockDeleteMany(...args),
                    createMany: (...args: any[]) => mockCreateMany(...args),
                },
            }),
        )
    })

    test('listRoleGrants returns cached grants when redis cache exists', async () => {
        mockRedisGet.mockResolvedValue(
            JSON.stringify([
                {
                    guildId,
                    roleId: '222222222222222222',
                    module: 'moderation',
                    mode: 'view',
                    createdAt: now.toISOString(),
                    updatedAt: now.toISOString(),
                },
            ]),
        )

        const grants = await guildRoleAccessService.listRoleGrants(guildId)

        expect(grants).toHaveLength(1)
        expect(grants[0]).toMatchObject({
            guildId,
            roleId: '222222222222222222',
            module: 'moderation',
            mode: 'view',
        })
        expect(mockFindMany).not.toHaveBeenCalled()
    })

    test('listRoleGrants falls back to database and caches normalized rows', async () => {
        mockFindMany.mockResolvedValue([
            {
                guildId,
                roleId: '222222222222222222',
                module: 'moderation',
                mode: 'manage',
                createdAt: now,
                updatedAt: now,
            },
            {
                guildId,
                roleId: '333333333333333333',
                module: 'invalid-module',
                mode: 'view',
                createdAt: now,
                updatedAt: now,
            },
        ])

        const grants = await guildRoleAccessService.listRoleGrants(guildId)

        expect(mockFindMany).toHaveBeenCalledWith({
            where: { guildId },
            orderBy: [{ module: 'asc' }, { roleId: 'asc' }],
        })
        expect(grants).toEqual([
            {
                guildId,
                roleId: '222222222222222222',
                module: 'moderation',
                mode: 'manage',
                createdAt: now,
                updatedAt: now,
            },
        ])
        expect(mockRedisSetex).toHaveBeenCalledWith(
            `guild_rbac:${guildId}`,
            300,
            JSON.stringify(grants),
        )
    })

    test('replaceRoleGrants deduplicates by role/module and clears cache', async () => {
        mockFindMany.mockResolvedValue([
            {
                guildId,
                roleId: '222222222222222222',
                module: 'moderation',
                mode: 'view',
                createdAt: now,
                updatedAt: now,
            },
        ])

        const updated = await guildRoleAccessService.replaceRoleGrants(
            guildId,
            [
                {
                    roleId: '222222222222222222',
                    module: 'moderation',
                    mode: 'view',
                },
                {
                    roleId: '222222222222222222',
                    module: 'moderation',
                    mode: 'manage',
                },
                {
                    roleId: '333333333333333333',
                    module: 'automation',
                    mode: 'manage',
                },
                {
                    roleId: '',
                    module: 'automation',
                    mode: 'view',
                } as any,
            ],
        )

        expect(mockDeleteMany).toHaveBeenCalledWith({ where: { guildId } })
        expect(mockCreateMany).toHaveBeenCalledWith({
            data: [
                {
                    guildId,
                    roleId: '222222222222222222',
                    module: 'moderation',
                    mode: 'manage',
                },
                {
                    guildId,
                    roleId: '333333333333333333',
                    module: 'automation',
                    mode: 'manage',
                },
            ],
        })
        expect(mockRedisDel).toHaveBeenCalledWith(`guild_rbac:${guildId}`)
        expect(updated).toHaveLength(1)
        expect(updated[0].module).toBe('moderation')
    })

    test('resolveEffectiveAccess applies manage and view precedence', async () => {
        mockRedisGet.mockResolvedValue(
            JSON.stringify([
                {
                    guildId,
                    roleId: 'role-manage',
                    module: 'settings',
                    mode: 'manage',
                    createdAt: now.toISOString(),
                    updatedAt: now.toISOString(),
                },
                {
                    guildId,
                    roleId: 'role-view',
                    module: 'moderation',
                    mode: 'view',
                    createdAt: now.toISOString(),
                    updatedAt: now.toISOString(),
                },
            ]),
        )

        const access = await guildRoleAccessService.resolveEffectiveAccess(
            guildId,
            ['role-manage', 'role-view'],
            false,
        )

        expect(access.settings).toBe('manage')
        expect(access.moderation).toBe('view')
        expect(access.music).toBe('none')
    })

    test('resolveEffectiveAccess returns full manage map for admin override', async () => {
        const access = await guildRoleAccessService.resolveEffectiveAccess(
            guildId,
            [],
            true,
        )

        expect(access).toEqual({
            overview: 'manage',
            settings: 'manage',
            moderation: 'manage',
            automation: 'manage',
            music: 'manage',
            integrations: 'manage',
        })
        expect(mockFindMany).not.toHaveBeenCalled()
    })

    test('hasAccess and hasAnyAccess enforce module permission checks', () => {
        const map = {
            overview: 'view',
            settings: 'manage',
            moderation: 'none',
            automation: 'none',
            music: 'none',
            integrations: 'none',
        } as const

        expect(guildRoleAccessService.hasAccess(map, 'overview', 'view')).toBe(
            true,
        )
        expect(
            guildRoleAccessService.hasAccess(map, 'overview', 'manage'),
        ).toBe(false)
        expect(
            guildRoleAccessService.hasAccess(map, 'settings', 'manage'),
        ).toBe(true)
        expect(guildRoleAccessService.hasAnyAccess(map)).toBe(true)
    })

    test('logs and bypasses cache read/write failures', async () => {
        mockRedisGet.mockRejectedValue(new Error('cache read failed'))
        mockFindMany.mockResolvedValue([])
        mockRedisSetex.mockRejectedValue(new Error('cache write failed'))
        mockRedisDel.mockRejectedValue(new Error('cache del failed'))

        await guildRoleAccessService.listRoleGrants(guildId)
        await guildRoleAccessService.replaceRoleGrants(guildId, [])

        expect(mockErrorLog).toHaveBeenCalled()
    })
})
