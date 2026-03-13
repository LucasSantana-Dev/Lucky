import { beforeEach, describe, expect, jest, test } from '@jest/globals'
import type { DiscordGuild } from '../../../src/services/DiscordOAuthService'
import type { SessionData } from '../../../src/services/SessionService'

const mockGetUserGuilds = jest.fn<Promise<DiscordGuild[]>, [string]>()
const mockHasAdminPermission = jest.fn<
    boolean,
    [string | null | undefined, string | null | undefined]
>()

class MockDiscordApiError extends Error {
    constructor(public readonly statusCode: number, message = 'Discord API error') {
        super(message)
        this.name = 'DiscordApiError'
    }
}

const mockHasBotInGuild = jest.fn<Promise<boolean>, [string]>()
const mockGetGuildMemberContext = jest.fn<
    Promise<{ nickname: string | null; roleIds: string[] }>,
    [string, string]
>()
const mockEnrichGuildsWithBotStatus = jest.fn()

const mockResolveEffectiveAccess = jest.fn()
const mockHasAnyAccess = jest.fn<boolean, [Record<string, string>]>()
const mockHasAccess = jest.fn<
    boolean,
    [Record<string, string>, string, string]
>()
const mockRedisIsHealthy = jest.fn<boolean, []>()
const mockRedisGet = jest.fn<Promise<string | null>, [string]>()
const mockRedisSetex = jest.fn<Promise<boolean>, [string, number, string]>()

class MockGuildRoleGrantStorageError extends Error {}

jest.mock('../../../src/services/DiscordOAuthService', () => ({
    DiscordApiError: MockDiscordApiError,
    discordOAuthService: {
        getUserGuilds: (...args: [string]) => mockGetUserGuilds(...args),
        hasAdminPermission: (
            ...args: [string | null | undefined, string | null | undefined]
        ) =>
            mockHasAdminPermission(...args),
    },
}))

jest.mock('../../../src/services/GuildService', () => ({
    guildService: {
        hasBotInGuild: (...args: [string]) => mockHasBotInGuild(...args),
        getGuildMemberContext: (...args: [string, string]) =>
            mockGetGuildMemberContext(...args),
        enrichGuildsWithBotStatus: (...args: [DiscordGuild[]]) =>
            mockEnrichGuildsWithBotStatus(...args),
    },
}))

jest.mock('@lucky/shared/services', () => ({
    GuildRoleGrantStorageError: MockGuildRoleGrantStorageError,
    guildRoleAccessService: {
        resolveEffectiveAccess: (...args: [string, string[], boolean]) =>
            mockResolveEffectiveAccess(...args),
        hasAnyAccess: (...args: [Record<string, string>]) =>
            mockHasAnyAccess(...args),
        hasAccess: (...args: [Record<string, string>, string, string]) =>
            mockHasAccess(...args),
    },
    redisClient: {
        isHealthy: (...args: []) => mockRedisIsHealthy(...args),
        get: (...args: [string]) => mockRedisGet(...args),
        setex: (...args: [string, number, string]) => mockRedisSetex(...args),
    },
}))

import { guildAccessService } from '../../../src/services/GuildAccessService'
import { DiscordApiError } from '../../../src/services/DiscordOAuthService'

const EMPTY_ACCESS = {
    overview: 'none',
    settings: 'none',
    moderation: 'none',
    automation: 'none',
    music: 'none',
    integrations: 'none',
}

const SESSION: SessionData = {
    userId: 'user-1',
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 60_000,
    user: {
        id: 'user-1',
        username: 'lukso',
        discriminator: '0',
        avatar: null,
    },
}

function makeGuild(
    id: string,
    options: Partial<DiscordGuild> = {},
): DiscordGuild {
    return {
        id,
        name: `Guild ${id}`,
        icon: null,
        owner: false,
        permissions: '0',
        features: [],
        ...options,
    }
}

describe('GuildAccessService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        guildAccessService.resetCachesForTests()
        mockHasAdminPermission.mockImplementation(() => false)
        mockHasAnyAccess.mockImplementation((access) =>
            Object.values(access).some((value) => value !== 'none'),
        )
        mockHasAccess.mockImplementation((access, module, requiredMode) => {
            const value = access[module]
            if (requiredMode === 'view') {
                return value === 'view' || value === 'manage'
            }
            return value === 'manage'
        })
        mockRedisIsHealthy.mockReturnValue(false)
        mockRedisGet.mockResolvedValue(null)
        mockRedisSetex.mockResolvedValue(true)
        mockEnrichGuildsWithBotStatus.mockImplementation(
            async (guilds: DiscordGuild[]) =>
                guilds.map((guild) => ({
                    ...guild,
                    hasBot: guild.id !== '303',
                    botInviteUrl:
                        guild.id === '303'
                            ? 'https://discord.com/oauth2/authorize'
                            : undefined,
                })),
        )
    })

    test('listAuthorizedGuilds returns admin guilds and RBAC-authorized guilds', async () => {
        const guilds = [
            makeGuild('101', { owner: true }),
            makeGuild('202'),
            makeGuild('303'),
            makeGuild('404'),
        ]

        mockGetUserGuilds.mockResolvedValue(guilds)
        mockHasBotInGuild.mockImplementation(
            async (guildId: string) => guildId === '202' || guildId === '404',
        )
        mockGetGuildMemberContext.mockImplementation(async (guildId: string) =>
            guildId === '202'
                ? { nickname: 'Mods', roleIds: ['role-mod'] }
                : { nickname: null, roleIds: [] },
        )
        mockResolveEffectiveAccess.mockImplementation(
            async (guildId: string, _roles: string[], isAdmin: boolean) => {
                if (isAdmin) {
                    return {
                        overview: 'manage',
                        settings: 'manage',
                        moderation: 'manage',
                        automation: 'manage',
                        music: 'manage',
                        integrations: 'manage',
                    }
                }

                if (guildId === '202') {
                    return {
                        ...EMPTY_ACCESS,
                        moderation: 'view',
                    }
                }

                return EMPTY_ACCESS
            },
        )

        const result = await guildAccessService.listAuthorizedGuilds(SESSION)

        expect(mockGetUserGuilds).toHaveBeenCalledWith('access-token')
        expect(mockGetGuildMemberContext).toHaveBeenCalledTimes(2)
        expect(mockGetGuildMemberContext).toHaveBeenCalledWith('202', 'user-1')
        expect(mockGetGuildMemberContext).toHaveBeenCalledWith('404', 'user-1')
        expect(mockEnrichGuildsWithBotStatus).toHaveBeenCalledWith([
            guilds[0],
            guilds[1],
        ])
        expect(result).toHaveLength(2)
        expect(result.map((guild) => guild.id)).toEqual(['101', '202'])
        expect(result[0].canManageRbac).toBe(true)
        expect(result[1].canManageRbac).toBe(false)
        expect(result[1].effectiveAccess.moderation).toBe('view')
    })

    test('listAuthorizedGuilds skips guilds that fail context resolution', async () => {
        const guilds = [makeGuild('101', { owner: true }), makeGuild('202')]
        const adminAccess = {
            overview: 'manage',
            settings: 'manage',
            moderation: 'manage',
            automation: 'manage',
            music: 'manage',
            integrations: 'manage',
        }

        mockGetUserGuilds.mockResolvedValue(guilds)
        mockHasBotInGuild.mockImplementation(async (guildId: string) => {
            if (guildId === '202') {
                throw new Error('Discord guild fetch failed')
            }
            return true
        })
        mockResolveEffectiveAccess.mockResolvedValue(adminAccess)

        const result = await guildAccessService.listAuthorizedGuilds(SESSION)

        expect(result.map((guild) => guild.id)).toEqual(['101'])
        expect(mockEnrichGuildsWithBotStatus).toHaveBeenCalledWith([guilds[0]])
    })

    test('listAuthorizedGuilds maps Discord 401 errors to unauthorized AppError', async () => {
        mockGetUserGuilds.mockRejectedValue(
            new DiscordApiError(401, 'invalid token'),
        )

        await expect(guildAccessService.listAuthorizedGuilds(SESSION)).rejects.toMatchObject({
            statusCode: 401,
            message: 'Discord session expired. Please sign in again.',
        })
    })

    test('listAuthorizedGuilds maps Discord 403 errors to forbidden AppError', async () => {
        mockGetUserGuilds.mockRejectedValue({
            statusCode: 403,
            message: 'missing scope',
        })

        await expect(guildAccessService.listAuthorizedGuilds(SESSION)).rejects.toMatchObject({
            statusCode: 403,
            message: 'Discord OAuth scope is missing. Re-authenticate and try again.',
        })
    })

    test('listAuthorizedGuilds maps Discord upstream failures to 502 AppError', async () => {
        const uncachedSession = {
            ...SESSION,
            accessToken: 'fresh-token-for-upstream-error',
        }
        mockGetUserGuilds.mockRejectedValue({
            status: 429,
            message: 'rate limited',
        })

        await expect(
            guildAccessService.listAuthorizedGuilds(uncachedSession),
        ).rejects.toMatchObject({
            statusCode: 502,
            message: 'Discord API is temporarily unavailable. Please retry.',
        })
    })

    test('listAuthorizedGuilds ignores malformed cached guild payload on upstream 429', async () => {
        mockRedisIsHealthy.mockReturnValue(true)
        mockRedisGet.mockResolvedValue('{"guilds":"invalid"}')
        mockGetUserGuilds.mockRejectedValue({
            status: 429,
            message: 'rate limited',
        })

        await expect(guildAccessService.listAuthorizedGuilds(SESSION)).rejects.toMatchObject({
            statusCode: 502,
            message: 'Discord API is temporarily unavailable. Please retry.',
        })
    })

    test('listAuthorizedGuilds uses cached guilds on upstream 5xx failures', async () => {
        const cachedGuild = makeGuild('515', { owner: true })
        const adminAccess = {
            overview: 'manage',
            settings: 'manage',
            moderation: 'manage',
            automation: 'manage',
            music: 'manage',
            integrations: 'manage',
        }

        mockRedisIsHealthy.mockReturnValue(true)
        mockRedisGet.mockResolvedValue(JSON.stringify([cachedGuild]))
        mockGetUserGuilds.mockRejectedValue({
            status: 503,
            message: 'upstream unavailable',
        })
        mockResolveEffectiveAccess.mockResolvedValue(adminAccess)

        const result = await guildAccessService.listAuthorizedGuilds(SESSION)

        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({
            id: cachedGuild.id,
            canManageRbac: true,
        })
    })

    test('listAuthorizedGuilds rethrows unexpected guild-fetch errors', async () => {
        const unknownError = new Error('boom')
        mockGetUserGuilds.mockRejectedValue(unknownError)

        await expect(guildAccessService.listAuthorizedGuilds(SESSION)).rejects.toBe(
            unknownError,
        )
    })

    test('listAuthorizedGuilds skips guild when access resolution throws', async () => {
        const guilds = [makeGuild('101', { owner: true }), makeGuild('202')]
        const adminAccess = {
            overview: 'manage',
            settings: 'manage',
            moderation: 'manage',
            automation: 'manage',
            music: 'manage',
            integrations: 'manage',
        }

        mockGetUserGuilds.mockResolvedValue(guilds)
        mockHasBotInGuild.mockResolvedValue(true)
        mockResolveEffectiveAccess.mockImplementation(async (guildId: string) => {
            if (guildId === '202') {
                throw new Error('policy lookup failed')
            }
            return adminAccess
        })

        const result = await guildAccessService.listAuthorizedGuilds(SESSION)

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('101')
    })

    test('listAuthorizedGuilds returns 503 when RBAC storage is unavailable', async () => {
        const guild = makeGuild('919')

        mockGetUserGuilds.mockResolvedValue([guild])
        mockHasBotInGuild.mockResolvedValue(true)
        mockGetGuildMemberContext.mockResolvedValue({
            nickname: 'Helper',
            roleIds: ['role-helper'],
        })
        mockResolveEffectiveAccess.mockRejectedValue(
            new MockGuildRoleGrantStorageError('missing table'),
        )

        await expect(guildAccessService.listAuthorizedGuilds(SESSION)).rejects.toMatchObject({
            statusCode: 503,
            message:
                'RBAC storage is unavailable. Run database migrations and retry.',
        })
    })

    test('listAuthorizedGuilds returns retryable error when all context lookups fail', async () => {
        const guilds = [makeGuild('101'), makeGuild('202')]

        mockGetUserGuilds.mockResolvedValue(guilds)
        mockHasBotInGuild.mockResolvedValue(true)
        mockResolveEffectiveAccess.mockRejectedValue(
            new Error('rbac dependency unavailable'),
        )

        await expect(guildAccessService.listAuthorizedGuilds(SESSION)).rejects.toMatchObject({
            statusCode: 502,
            message: 'Unable to resolve server access right now. Please retry.',
        })
    })

    test('resolveGuildContext maps member context lookup failures to 502 AppError', async () => {
        const guild = makeGuild('808')

        mockGetUserGuilds.mockResolvedValue([guild])
        mockHasBotInGuild.mockResolvedValue(true)
        mockGetGuildMemberContext.mockRejectedValue(
            new Error('member context unavailable'),
        )

        await expect(
            guildAccessService.resolveGuildContext(SESSION, guild.id),
        ).rejects.toMatchObject({
            statusCode: 502,
            message: 'Unable to resolve server access right now. Please retry.',
        })

        expect(mockResolveEffectiveAccess).not.toHaveBeenCalled()
    })

    test('dedupes concurrent guild fetches for the same session', async () => {
        const guilds = [makeGuild('202')]
        const deferred = new Promise<DiscordGuild[]>((resolve) => {
            setTimeout(() => resolve(guilds), 0)
        })

        mockGetUserGuilds.mockReturnValue(deferred)
        mockHasBotInGuild.mockResolvedValue(true)
        mockGetGuildMemberContext.mockResolvedValue({
            nickname: null,
            roleIds: [],
        })
        mockResolveEffectiveAccess.mockResolvedValue({
            ...EMPTY_ACCESS,
            overview: 'view',
        })
        mockEnrichGuildsWithBotStatus.mockResolvedValue([
            {
                ...guilds[0],
                hasBot: true,
            },
        ])

        const [authorizedGuilds, context] = await Promise.all([
            guildAccessService.listAuthorizedGuilds(SESSION),
            guildAccessService.resolveGuildContext(SESSION, '202'),
        ])

        expect(authorizedGuilds).toHaveLength(1)
        expect(context?.guildId).toBe('202')
        expect(mockGetUserGuilds).toHaveBeenCalledTimes(1)
    })

    test('resolveGuildContext does not require bot lookup for admin guilds', async () => {
        const adminGuild = makeGuild('909', { owner: true })
        const adminAccess = {
            overview: 'manage',
            settings: 'manage',
            moderation: 'manage',
            automation: 'manage',
            music: 'manage',
            integrations: 'manage',
        }

        mockGetUserGuilds.mockResolvedValue([adminGuild])
        mockResolveEffectiveAccess.mockResolvedValue(adminAccess)

        const context = await guildAccessService.resolveGuildContext(
            SESSION,
            adminGuild.id,
        )

        expect(context).toMatchObject({
            guildId: adminGuild.id,
            isAdmin: true,
            hasBot: false,
            botPresenceChecked: false,
            canManageRbac: true,
        })
        expect(mockHasBotInGuild).not.toHaveBeenCalled()
        expect(mockGetGuildMemberContext).not.toHaveBeenCalled()
    })

    test('listAuthorizedGuilds returns retryable error when all member-context lookups fail', async () => {
        const guilds = [makeGuild('101'), makeGuild('202')]

        mockGetUserGuilds.mockResolvedValue(guilds)
        mockHasBotInGuild.mockResolvedValue(true)
        mockGetGuildMemberContext.mockRejectedValue(
            new Error('member context unavailable'),
        )

        await expect(guildAccessService.listAuthorizedGuilds(SESSION)).rejects.toMatchObject({
            statusCode: 502,
            message: 'Unable to resolve server access right now. Please retry.',
        })

        expect(mockResolveEffectiveAccess).not.toHaveBeenCalled()
    })

    test('listAuthorizedGuilds throws when enriched guild has no context', async () => {
        const guild = makeGuild('101', { owner: true })
        const adminAccess = {
            overview: 'manage',
            settings: 'manage',
            moderation: 'manage',
            automation: 'manage',
            music: 'manage',
            integrations: 'manage',
        }

        mockGetUserGuilds.mockResolvedValue([guild])
        mockHasBotInGuild.mockResolvedValue(true)
        mockResolveEffectiveAccess.mockResolvedValue(adminAccess)
        mockEnrichGuildsWithBotStatus.mockResolvedValueOnce([
            { ...guild, id: 'unknown-guild', hasBot: true },
        ])

        await expect(guildAccessService.listAuthorizedGuilds(SESSION)).rejects.toThrow(
            'Missing authorized context for guild unknown-guild',
        )
    })

    test('resolveGuildContext returns null when guild is not in user guild list', async () => {
        mockGetUserGuilds.mockResolvedValue([makeGuild('101')])

        const context = await guildAccessService.resolveGuildContext(
            SESSION,
            '999',
        )

        expect(context).toBeNull()
    })

    test('resolveGuildContext returns null when guild has no effective access', async () => {
        mockGetUserGuilds.mockResolvedValue([makeGuild('505')])
        mockHasBotInGuild.mockResolvedValue(true)
        mockGetGuildMemberContext.mockResolvedValue({
            nickname: 'Guest',
            roleIds: ['role-guest'],
        })
        mockResolveEffectiveAccess.mockResolvedValue(EMPTY_ACCESS)

        const context = await guildAccessService.resolveGuildContext(
            SESSION,
            '505',
        )

        expect(context).toBeNull()
    })

    test('resolveGuildContext returns member nickname/roles for authorized guild', async () => {
        const guild = makeGuild('606')
        const moderationViewAccess = {
            ...EMPTY_ACCESS,
            moderation: 'view',
        }

        mockGetUserGuilds.mockResolvedValue([guild])
        mockHasBotInGuild.mockResolvedValue(true)
        mockGetGuildMemberContext.mockResolvedValue({
            nickname: 'Moderator',
            roleIds: ['role-mod'],
        })
        mockResolveEffectiveAccess.mockResolvedValue(moderationViewAccess)

        const context = await guildAccessService.resolveGuildContext(
            SESSION,
            guild.id,
        )

        expect(context).toMatchObject({
            guildId: guild.id,
            owner: false,
            isAdmin: false,
            hasBot: true,
            botPresenceChecked: true,
            roleIds: ['role-mod'],
            nickname: 'Moderator',
            canManageRbac: false,
            effectiveAccess: moderationViewAccess,
        })
    })

    test('resolveGuildContext returns 503 when RBAC storage is unavailable', async () => {
        const guild = makeGuild('929')

        mockGetUserGuilds.mockResolvedValue([guild])
        mockHasBotInGuild.mockResolvedValue(true)
        mockGetGuildMemberContext.mockResolvedValue({
            nickname: 'Moderator',
            roleIds: ['role-mod'],
        })
        mockResolveEffectiveAccess.mockRejectedValue(
            new MockGuildRoleGrantStorageError('missing table'),
        )

        await expect(
            guildAccessService.resolveGuildContext(SESSION, guild.id),
        ).rejects.toMatchObject({
            statusCode: 503,
            message:
                'RBAC storage is unavailable. Run database migrations and retry.',
        })
    })

    test('resolveGuildContext short-circuits admin access without bot/member lookups', async () => {
        const guild = makeGuild('909', { owner: true })
        const adminAccess = {
            overview: 'manage',
            settings: 'manage',
            moderation: 'manage',
            automation: 'manage',
            music: 'manage',
            integrations: 'manage',
        }

        mockGetUserGuilds.mockResolvedValue([guild])
        mockHasBotInGuild.mockRejectedValue(new Error('discord unreachable'))
        mockResolveEffectiveAccess.mockResolvedValue(adminAccess)

        const context = await guildAccessService.resolveGuildContext(
            SESSION,
            guild.id,
        )

        expect(context).toMatchObject({
            guildId: guild.id,
            isAdmin: true,
            hasBot: false,
            botPresenceChecked: false,
            roleIds: [],
            nickname: null,
            effectiveAccess: adminAccess,
            canManageRbac: true,
        })
        expect(mockHasBotInGuild).not.toHaveBeenCalled()
        expect(mockGetGuildMemberContext).not.toHaveBeenCalled()
    })

    test('resolveGuildContext does not authorize using cached guilds on upstream 429', async () => {
        const guild = makeGuild('919', { owner: true })
        const adminAccess = {
            overview: 'manage',
            settings: 'manage',
            moderation: 'manage',
            automation: 'manage',
            music: 'manage',
            integrations: 'manage',
        }
        const cachedGuilds = JSON.stringify([guild])

        mockRedisIsHealthy.mockReturnValue(true)
        mockRedisGet.mockResolvedValue(cachedGuilds)
        mockGetUserGuilds.mockResolvedValueOnce([guild])
        mockResolveEffectiveAccess.mockResolvedValue(adminAccess)
        await guildAccessService.listAuthorizedGuilds(SESSION)
        expect(mockRedisSetex).toHaveBeenCalledTimes(1)

        mockGetUserGuilds.mockRejectedValueOnce({ status: 429 })

        await expect(
            guildAccessService.resolveGuildContext(SESSION, guild.id),
        ).rejects.toMatchObject({
            statusCode: 502,
            message: 'Discord API is temporarily unavailable. Please retry.',
        })
        expect(mockRedisGet).toHaveBeenCalled()
    })

    test('listAuthorizedGuilds does not store raw access token bytes in redis key', async () => {
        const guild = makeGuild('920', { owner: true })
        const adminAccess = {
            overview: 'manage',
            settings: 'manage',
            moderation: 'manage',
            automation: 'manage',
            music: 'manage',
            integrations: 'manage',
        }

        mockRedisIsHealthy.mockReturnValue(true)
        mockGetUserGuilds.mockResolvedValue([guild])
        mockResolveEffectiveAccess.mockResolvedValue(adminAccess)

        await guildAccessService.listAuthorizedGuilds(SESSION)

        expect(mockRedisSetex).toHaveBeenCalledTimes(1)
        const redisKey = mockRedisSetex.mock.calls[0][0]
        expect(redisKey).toContain(`guild-access:user-guilds:${SESSION.user.id}:`)
        expect(redisKey).not.toContain(SESSION.accessToken)
        expect(redisKey).not.toContain(SESSION.accessToken.slice(0, 24))
    })

    test('listAuthorizedGuilds keeps serving data when redis cache write fails', async () => {
        const guild = makeGuild('930', { owner: true })
        const adminAccess = {
            overview: 'manage',
            settings: 'manage',
            moderation: 'manage',
            automation: 'manage',
            music: 'manage',
            integrations: 'manage',
        }

        mockRedisIsHealthy.mockReturnValue(true)
        mockRedisSetex.mockRejectedValue(new Error('redis write failed'))
        mockGetUserGuilds.mockResolvedValue([guild])
        mockResolveEffectiveAccess.mockResolvedValue(adminAccess)

        const result = await guildAccessService.listAuthorizedGuilds(SESSION)

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe(guild.id)
        expect(mockRedisSetex).toHaveBeenCalledTimes(1)
    })

    test('hasAccess delegates to guild role access service', () => {
        const access = {
            ...EMPTY_ACCESS,
            settings: 'manage',
        }

        guildAccessService.hasAccess(
            {
                guildId: '777',
                owner: false,
                isAdmin: false,
                hasBot: true,
                botPresenceChecked: true,
                roleIds: [],
                nickname: null,
                effectiveAccess: access,
                canManageRbac: false,
            },
            'settings',
            'manage',
        )

        expect(mockHasAccess).toHaveBeenCalledWith(access, 'settings', 'manage')
    })
})
