import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { ChannelType, PermissionFlagsBits } from 'discord.js'

const getAutoModSettingsMock = jest.fn()
const getModerationSettingsMock = jest.fn()
const getWelcomeMessageMock = jest.fn()
const getLeaveMessageMock = jest.fn()
const listReactionRoleMessagesMock = jest.fn()
const listExclusiveRolesMock = jest.fn()
const listRoleGrantsMock = jest.fn()
const onboardingToManifestMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    autoModService: {
        getSettings: (...args: unknown[]) => getAutoModSettingsMock(...args),
    },
    getModerationSettings: (...args: unknown[]) => getModerationSettingsMock(...args),
    autoMessageService: {
        getWelcomeMessage: (...args: unknown[]) => getWelcomeMessageMock(...args),
        getLeaveMessage: (...args: unknown[]) => getLeaveMessageMock(...args),
    },
    reactionRolesService: {
        listReactionRoleMessages: (...args: unknown[]) =>
            listReactionRoleMessagesMock(...args),
    },
    roleManagementService: {
        listExclusiveRoles: (...args: unknown[]) => listExclusiveRolesMock(...args),
    },
    guildRoleAccessService: {
        listRoleGrants: (...args: unknown[]) => listRoleGrantsMock(...args),
    },
    onboardingToManifest: (...args: unknown[]) => onboardingToManifestMock(...args),
}))

import { captureGuildAutomationState } from './captureGuildState'

function createGuild(overrides: Record<string, unknown> = {}) {
    const guildId = 'guild-1'
    return {
        id: guildId,
        name: 'Lucky Guild',
        fetchOnboarding: jest.fn(),
        members: {
            cache: new Map([
                ['bot-self', { id: 'bot-self', user: { bot: true, username: 'Lucky' } }],
                ['legacy-bot', { id: 'legacy-bot', user: { bot: true, username: 'LegacyBot' } }],
                ['human-user', { id: 'human-user', user: { bot: false, username: 'User' } }],
            ]),
        },
        roles: {
            cache: new Map([
                [guildId, { id: guildId, name: '@everyone' }],
                [
                    'role-admin',
                    {
                        id: 'role-admin',
                        name: 'Admin',
                        color: 0xff00ff,
                        hoist: true,
                        mentionable: true,
                        permissions: { bitfield: BigInt(8) },
                    },
                ],
            ]),
        },
        channels: {
            cache: new Map([
                [
                    'text-1',
                    {
                        id: 'text-1',
                        name: 'general',
                        type: ChannelType.GuildText,
                        parentId: null,
                        topic: 'welcome',
                        permissionOverwrites: {
                            cache: new Map([
                                [
                                    guildId,
                                    {
                                        deny: {
                                            has: (permission: bigint) =>
                                                permission ===
                                                PermissionFlagsBits.SendMessages,
                                        },
                                    },
                                ],
                            ]),
                        },
                    },
                ],
                [
                    'voice-1',
                    {
                        id: 'voice-1',
                        name: 'voice',
                        type: ChannelType.GuildVoice,
                        parentId: null,
                    },
                ],
                [
                    'text-no-overwrite',
                    {
                        id: 'text-no-overwrite',
                        name: 'readonly-false',
                        type: ChannelType.GuildText,
                        parentId: null,
                        topic: null,
                        permissionOverwrites: {
                            cache: new Map(),
                        },
                    },
                ],
                [
                    'unsupported',
                    {
                        id: 'unsupported',
                        name: 'dm-like',
                        type: ChannelType.DM,
                        parentId: null,
                    },
                ],
            ]),
        },
        ...overrides,
    }
}

describe('captureGuildAutomationState', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        getAutoModSettingsMock.mockResolvedValue({ enabled: true, threshold: 5 })
        getModerationSettingsMock.mockResolvedValue({ requireReason: true })
        getWelcomeMessageMock.mockResolvedValue({
            enabled: true,
            channelId: 'text-1',
            message: 'Welcome!',
        })
        getLeaveMessageMock.mockResolvedValue({
            enabled: false,
            channelId: 'text-1',
            message: 'Bye!',
        })
        listReactionRoleMessagesMock.mockResolvedValue([
            {
                id: 'rr-1',
                messageId: 'message-1',
                channelId: 'text-1',
                mappings: [
                    { roleId: 'role-admin', label: null, emoji: '🔥', style: 'PRIMARY' },
                ],
            },
        ])
        listExclusiveRolesMock.mockResolvedValue([
            { roleId: 'role-admin', excludedRoleId: 'role-muted' },
        ])
        listRoleGrantsMock.mockResolvedValue([
            { roleId: 'role-admin', module: 'automation', mode: 'manage' },
        ])
        onboardingToManifestMock.mockReturnValue({ enabled: false, prompts: [] })
    })

    it('captures guild automation state with channel filtering and parity data', async () => {
        const guild = createGuild()
        ;(guild.fetchOnboarding as jest.Mock).mockRejectedValue({ status: 404 })

        const result = await captureGuildAutomationState(guild as any, 'bot-self')

        expect(onboardingToManifestMock).toHaveBeenCalledWith('guild-1', null)
        expect(result.guild).toEqual({ id: 'guild-1', name: 'Lucky Guild' })
        expect(result.roles.roles).toHaveLength(1)
        expect(result.roles.roles[0]).toMatchObject({
            id: 'role-admin',
            name: 'Admin',
            permissions: '8',
        })
        expect(result.roles.channels).toEqual([
            expect.objectContaining({
                id: 'text-1',
                type: 'GuildText',
                readonly: true,
                topic: 'welcome',
            }),
            expect.objectContaining({
                id: 'voice-1',
                type: 'GuildVoice',
                readonly: false,
                topic: null,
            }),
            expect.objectContaining({
                id: 'text-no-overwrite',
                type: 'GuildText',
                readonly: false,
                topic: null,
            }),
        ])
        expect(result.reactionroles.messages).toEqual([
            expect.objectContaining({
                id: 'rr-1',
                mappings: [
                    expect.objectContaining({
                        roleId: 'role-admin',
                        label: 'role-admin',
                        emoji: '🔥',
                    }),
                ],
            }),
        ])
        expect(result.commandaccess.grants).toEqual([
            { roleId: 'role-admin', module: 'automation', mode: 'manage' },
        ])
        expect(result.parity.externalBots).toEqual([
            { id: 'legacy-bot', name: 'LegacyBot', retireOnCutover: false },
        ])
        expect(result.source).toBe('discord-capture')
        expect(typeof result.capturedAt).toBe('string')
    })

    it('supports missing onboarding by Discord code 10005', async () => {
        const guild = createGuild()
        ;(guild.fetchOnboarding as jest.Mock).mockRejectedValue({ code: 10005 })

        await captureGuildAutomationState(guild as any, 'bot-self')

        expect(onboardingToManifestMock).toHaveBeenCalledWith('guild-1', null)
    })

    it('rethrows unexpected onboarding fetch errors', async () => {
        const guild = createGuild()
        ;(guild.fetchOnboarding as jest.Mock).mockRejectedValue('onboarding-fail')

        await expect(
            captureGuildAutomationState(guild as any, 'bot-self'),
        ).rejects.toBe('onboarding-fail')
    })
})
