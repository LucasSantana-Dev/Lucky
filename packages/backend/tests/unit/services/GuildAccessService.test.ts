import { beforeEach, describe, expect, jest, test } from '@jest/globals'
import type { DiscordGuild } from '../../../src/services/DiscordOAuthService'
import type { SessionData } from '../../../src/services/SessionService'

const mockGetUserGuilds = jest.fn<Promise<DiscordGuild[]>, [string]>()
const mockHasAdminPermission = jest.fn<boolean, [string]>()

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

jest.mock('../../../src/services/DiscordOAuthService', () => ({
    discordOAuthService: {
        getUserGuilds: (...args: [string]) => mockGetUserGuilds(...args),
        hasAdminPermission: (...args: [string]) =>
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
    guildRoleAccessService: {
        resolveEffectiveAccess: (...args: [string, string[], boolean]) =>
            mockResolveEffectiveAccess(...args),
        hasAnyAccess: (...args: [Record<string, string>]) =>
            mockHasAnyAccess(...args),
        hasAccess: (...args: [Record<string, string>, string, string]) =>
            mockHasAccess(...args),
    },
}))

import { guildAccessService } from '../../../src/services/GuildAccessService'

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
            roleIds: ['role-mod'],
            nickname: 'Moderator',
            canManageRbac: false,
            effectiveAccess: moderationViewAccess,
        })
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
