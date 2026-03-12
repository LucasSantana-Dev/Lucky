import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { ChannelType, PermissionFlagsBits } from 'discord.js'
import { captureGuildAutomationState } from './captureGuildState'

const getSettingsMock = jest.fn()
const getModerationSettingsMock = jest.fn()
const getWelcomeMessageMock = jest.fn()
const getLeaveMessageMock = jest.fn()
const listReactionRoleMessagesMock = jest.fn()
const listExclusiveRolesMock = jest.fn()
const listRoleGrantsMock = jest.fn()
const onboardingToManifestMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    autoMessageService: {
        getWelcomeMessage: (...args: unknown[]) => getWelcomeMessageMock(...args),
        getLeaveMessage: (...args: unknown[]) => getLeaveMessageMock(...args),
    },
    autoModService: {
        getSettings: (...args: unknown[]) => getSettingsMock(...args),
    },
    getModerationSettings: (...args: unknown[]) => getModerationSettingsMock(...args),
    guildRoleAccessService: {
        listRoleGrants: (...args: unknown[]) => listRoleGrantsMock(...args),
    },
    reactionRolesService: {
        listReactionRoleMessages: (...args: unknown[]) =>
            listReactionRoleMessagesMock(...args),
    },
    roleManagementService: {
        listExclusiveRoles: (...args: unknown[]) => listExclusiveRolesMock(...args),
    },
    onboardingToManifest: (...args: unknown[]) => onboardingToManifestMock(...args),
}))

function createGuild(fetchOnboarding: jest.Mock) {
    return {
        id: '123456789012345678',
        name: 'Criativaria',
        fetchOnboarding,
        roles: {
            cache: new Map(),
        },
        channels: {
            cache: new Map(),
        },
        members: {
            cache: new Map([
                [
                    'bot-1',
                    {
                        id: 'bot-1',
                        user: {
                            bot: true,
                            username: 'LegacyBot',
                        },
                    },
                ],
            ]),
        },
    }
}

function createRichGuild(fetchOnboarding: jest.Mock) {
    const guildId = '123456789012345678'

    return {
        id: guildId,
        name: 'Criativaria',
        fetchOnboarding,
        roles: {
            cache: new Map([
                [
                    guildId,
                    {
                        id: guildId,
                    },
                ],
                [
                    'role-1',
                    {
                        id: 'role-1',
                        name: 'Admin',
                        color: 0xff00ff,
                        hoist: true,
                        mentionable: true,
                        permissions: {
                            bitfield: 8n,
                        },
                    },
                ],
            ]),
        },
        channels: {
            cache: new Map([
                [
                    'channel-1',
                    {
                        id: 'channel-1',
                        name: 'general',
                        type: ChannelType.GuildText,
                        parentId: null,
                        topic: 'General chat',
                        permissionOverwrites: {
                            cache: new Map([
                                [
                                    guildId,
                                    {
                                        deny: {
                                            has: (flag: bigint) =>
                                                flag ===
                                                PermissionFlagsBits.SendMessages,
                                        },
                                    },
                                ],
                            ]),
                        },
                    },
                ],
                [
                    'channel-unsupported',
                    {
                        id: 'channel-unsupported',
                        name: 'unsupported',
                        type: 999,
                    },
                ],
            ]),
        },
        members: {
            cache: new Map([
                [
                    'bot-1',
                    {
                        id: 'bot-1',
                        user: {
                            bot: true,
                            username: 'LegacyBot',
                        },
                    },
                ],
                [
                    'lucky-bot-id',
                    {
                        id: 'lucky-bot-id',
                        user: {
                            bot: true,
                            username: 'Lucky',
                        },
                    },
                ],
                [
                    'human-1',
                    {
                        id: 'human-1',
                        user: {
                            bot: false,
                            username: 'User',
                        },
                    },
                ],
            ]),
        },
    }
}

describe('captureGuildAutomationState', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        getSettingsMock.mockResolvedValue(null)
        getModerationSettingsMock.mockResolvedValue(null)
        getWelcomeMessageMock.mockResolvedValue(null)
        getLeaveMessageMock.mockResolvedValue(null)
        listReactionRoleMessagesMock.mockResolvedValue([])
        listExclusiveRolesMock.mockResolvedValue([])
        listRoleGrantsMock.mockResolvedValue([])
        onboardingToManifestMock.mockReturnValue({
            enabled: false,
            mode: 0,
            defaultChannelIds: [],
            prompts: [],
        })
    })

    it('treats only onboarding-not-found errors as empty onboarding', async () => {
        const fetchOnboarding = jest.fn().mockRejectedValue({ status: 404 })
        const guild = createGuild(fetchOnboarding)

        const state = await captureGuildAutomationState(guild as any, 'lucky-bot-id')

        expect(onboardingToManifestMock).toHaveBeenCalledWith(
            '123456789012345678',
            null,
        )
        expect(state.parity?.externalBots).toEqual([
            {
                id: 'bot-1',
                name: 'LegacyBot',
                retireOnCutover: false,
            },
        ])
    })

    it('propagates onboarding fetch errors when not a missing-onboarding case', async () => {
        const fetchOnboarding = jest
            .fn()
            .mockRejectedValue(new Error('Missing permissions'))
        const guild = createGuild(fetchOnboarding)

        await expect(
            captureGuildAutomationState(guild as any, 'lucky-bot-id'),
        ).rejects.toThrow('Missing permissions')
    })

    it('captures normalized moderation, roles, channels, and grants', async () => {
        const fetchOnboarding = jest.fn().mockResolvedValue({ enabled: true })
        const guild = createRichGuild(fetchOnboarding)

        getSettingsMock.mockResolvedValue({
            id: 'automod-id',
            guildId: '123456789012345678',
            enabled: true,
            spamEnabled: true,
            spamThreshold: 5,
            spamTimeWindow: 10,
            capsEnabled: true,
            capsThreshold: 80,
            linksEnabled: true,
            allowedDomains: ['example.com'],
            invitesEnabled: true,
            wordsEnabled: true,
            bannedWords: ['badword'],
            exemptRoles: ['role-1'],
            exemptChannels: ['channel-1'],
        })
        getModerationSettingsMock.mockResolvedValue({
            modLogChannelId: 'channel-1',
            muteRoleId: 'role-1',
            modRoleIds: ['role-1'],
            adminRoleIds: ['role-1'],
            autoModEnabled: true,
            maxWarnings: 3,
            warningExpiry: 30,
            dmOnAction: true,
            requireReason: true,
        })
        getWelcomeMessageMock.mockResolvedValue({
            enabled: true,
            channelId: 'channel-1',
            message: 'Welcome',
        })
        getLeaveMessageMock.mockResolvedValue({
            enabled: true,
            channelId: 'channel-1',
            message: 'Bye',
        })
        listReactionRoleMessagesMock.mockResolvedValue([
            {
                id: 'rr-1',
                messageId: 'm-1',
                channelId: 'channel-1',
                mappings: [
                    {
                        roleId: 'role-1',
                        label: 'Admin',
                        emoji: '🔥',
                        style: 'primary',
                    },
                ],
            },
        ])
        listExclusiveRolesMock.mockResolvedValue([
            {
                roleId: 'role-1',
                excludedRoleId: 'role-2',
            },
        ])
        listRoleGrantsMock.mockResolvedValue([
            {
                roleId: 'role-1',
                module: 'automation',
                mode: 'manage',
            },
        ])

        const state = await captureGuildAutomationState(guild as any, 'lucky-bot-id')

        expect(state.roles?.roles).toEqual([
            expect.objectContaining({
                id: 'role-1',
                name: 'Admin',
                permissions: '8',
            }),
        ])
        expect(state.roles?.channels).toEqual([
            expect.objectContaining({
                id: 'channel-1',
                type: 'GuildText',
                readonly: true,
            }),
        ])
        expect(state.moderation?.automod).toEqual(
            expect.objectContaining({
                enabled: true,
                spamThreshold: 5,
            }),
        )
        expect(state.moderation?.moderationSettings).toEqual(
            expect.objectContaining({
                modLogChannelId: 'channel-1',
                requireReason: true,
            }),
        )
        expect(state.commandaccess?.grants).toEqual([
            {
                roleId: 'role-1',
                module: 'automation',
                mode: 'manage',
            },
        ])
        expect(state.parity?.externalBots).toEqual([
            {
                id: 'bot-1',
                name: 'LegacyBot',
                retireOnCutover: false,
            },
        ])
    })
})
