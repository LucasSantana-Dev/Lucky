import { describe, test, expect, beforeEach, jest } from '@jest/globals'

const mockFetch = jest.fn<any>()
global.fetch = mockFetch as any

jest.mock('@lucky/shared/services', () => ({
    autoMessageService: {
        getWelcomeMessage: jest.fn<any>(),
        getLeaveMessage: jest.fn<any>(),
        createMessage: jest.fn<any>(),
        updateMessage: jest.fn<any>(),
    },
    autoModService: {
        getSettings: jest.fn<any>(),
        updateSettings: jest.fn<any>(),
    },
    getModerationSettings: jest.fn<any>(),
    updateModerationSettings: jest.fn<any>(),
    guildAutomationService: {
        getManifest: jest.fn<any>(),
    },
    guildRoleAccessService: {
        listRoleGrants: jest.fn<any>(),
        replaceRoleGrants: jest.fn<any>(),
    },
    reactionRolesService: {
        listReactionRoleMessages: jest.fn<any>(),
    },
    roleManagementService: {
        listExclusiveRoles: jest.fn<any>(),
        setExclusiveRole: jest.fn<any>(),
        removeExclusiveRole: jest.fn<any>(),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
}))

import {
    guildAutomationExecutionService,
    GuildAutomationExecutionError,
    normalizeName,
    asObject,
    toAutoModPayload,
    toModerationPayload,
    isExpectedDeleteError,
    isOnboardingUnavailable,
    mapChannelType,
    toDiscordChannelType,
} from '../../../src/services/GuildAutomationExecutionService'
import {
    autoMessageService,
    autoModService,
    getModerationSettings,
    updateModerationSettings,
    guildAutomationService,
    guildRoleAccessService,
    reactionRolesService,
    roleManagementService,
} from '@lucky/shared/services'
import type {
    GuildAutomationManifestDocument,
    GuildAutomationPlan,
} from '@lucky/shared/services'

describe('GuildAutomationExecutionService', () => {
    const GUILD_ID = '111111111111111111'
    const TOKEN = 'test-token'
    const ROLE_ID_1 = '222222222222222222'
    const ROLE_ID_2 = '333333333333333333'
    const CHANNEL_ID_1 = '444444444444444444'
    const CHANNEL_ID_2 = '555555555555555555'

    beforeEach(() => {
        jest.clearAllMocks()
        process.env.DISCORD_TOKEN = TOKEN
        mockFetch.mockReset()
    })

    describe('captureGuildAutomationState', () => {
        test('should capture complete guild automation state', async () => {
            const mockGuild = {
                id: GUILD_ID,
                name: 'Test Guild',
            }

            const mockRoles = [
                {
                    id: GUILD_ID,
                    name: '@everyone',
                    color: 0,
                    hoist: false,
                    mentionable: false,
                    permissions: '0',
                },
                {
                    id: ROLE_ID_1,
                    name: 'Admin',
                    color: 16711680,
                    hoist: true,
                    mentionable: true,
                    permissions: '8',
                    managed: false,
                },
            ]

            const mockChannels = [
                {
                    id: CHANNEL_ID_1,
                    name: 'general',
                    type: 0,
                    parent_id: null,
                    topic: 'General chat',
                },
                {
                    id: CHANNEL_ID_2,
                    name: 'voice',
                    type: 2,
                    parent_id: null,
                    topic: null,
                },
            ]

            const mockOnboarding = {
                enabled: true,
                mode: 0,
                default_channel_ids: [CHANNEL_ID_1],
                prompts: [
                    {
                        id: 'prompt1',
                        title: 'Welcome',
                        single_select: false,
                        required: true,
                        in_onboarding: true,
                        type: 0,
                        options: [
                            {
                                id: 'option1',
                                title: 'Get role',
                                description: null,
                                channel_ids: [],
                                role_ids: [ROLE_ID_1],
                                emoji: { id: null, name: '👋' },
                            },
                        ],
                    },
                ],
            }

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => mockGuild,
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => mockRoles,
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => mockChannels,
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => mockOnboarding,
                })
            ;(
                guildAutomationService.getManifest as jest.Mock
            ).mockResolvedValue(null)
            ;(autoModService.getSettings as jest.Mock).mockResolvedValue(null)
            ;(getModerationSettings as jest.Mock).mockResolvedValue(null)
            ;(
                autoMessageService.getWelcomeMessage as jest.Mock
            ).mockResolvedValue(null)
            ;(
                autoMessageService.getLeaveMessage as jest.Mock
            ).mockResolvedValue(null)
            ;(
                reactionRolesService.listReactionRoleMessages as jest.Mock
            ).mockResolvedValue([])
            ;(
                roleManagementService.listExclusiveRoles as jest.Mock
            ).mockResolvedValue([])
            ;(
                guildRoleAccessService.listRoleGrants as jest.Mock
            ).mockResolvedValue([])

            const result =
                await guildAutomationExecutionService.captureGuildAutomationState(
                    GUILD_ID,
                )

            expect(result.guild.id).toBe(GUILD_ID)
            expect(result.guild.name).toBe('Test Guild')
            expect(result.roles?.roles).toHaveLength(1)
            expect(result.roles?.roles[0].name).toBe('Admin')
            expect(result.roles?.channels).toHaveLength(2)
            expect(result.onboarding?.enabled).toBe(true)
            expect(result.onboarding?.prompts).toHaveLength(1)
            expect(result.source).toBe('discord-capture')
            expect(result.capturedAt).toBeDefined()
        })

        test('should filter out @everyone role', async () => {
            const mockGuild = { id: GUILD_ID, name: 'Test Guild' }
            const mockRoles = [
                { id: GUILD_ID, name: '@everyone', color: 0 },
                { id: ROLE_ID_1, name: 'Admin', color: 0 },
            ]

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockGuild,
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockRoles,
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => [],
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 404,
                    text: async () => 'Not Found',
                })
            ;(
                guildAutomationService.getManifest as jest.Mock
            ).mockResolvedValue(null)
            ;(autoModService.getSettings as jest.Mock).mockResolvedValue(null)
            ;(getModerationSettings as jest.Mock).mockResolvedValue(null)
            ;(
                autoMessageService.getWelcomeMessage as jest.Mock
            ).mockResolvedValue(null)
            ;(
                autoMessageService.getLeaveMessage as jest.Mock
            ).mockResolvedValue(null)
            ;(
                reactionRolesService.listReactionRoleMessages as jest.Mock
            ).mockResolvedValue([])
            ;(
                roleManagementService.listExclusiveRoles as jest.Mock
            ).mockResolvedValue([])
            ;(
                guildRoleAccessService.listRoleGrants as jest.Mock
            ).mockResolvedValue([])

            const result =
                await guildAutomationExecutionService.captureGuildAutomationState(
                    GUILD_ID,
                )

            expect(result.roles?.roles).toHaveLength(1)
            expect(result.roles?.roles[0].id).toBe(ROLE_ID_1)
        })

        test('should filter unsupported channel types', async () => {
            const mockGuild = { id: GUILD_ID, name: 'Test Guild' }
            const mockChannels = [
                { id: CHANNEL_ID_1, name: 'text', type: 0 },
                { id: CHANNEL_ID_2, name: 'voice', type: 2 },
                { id: '666', name: 'private-thread', type: 12 },
            ]

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockGuild,
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => [],
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockChannels,
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 404,
                    text: async () => 'Not Found',
                })
            ;(
                guildAutomationService.getManifest as jest.Mock
            ).mockResolvedValue(null)
            ;(autoModService.getSettings as jest.Mock).mockResolvedValue(null)
            ;(getModerationSettings as jest.Mock).mockResolvedValue(null)
            ;(
                autoMessageService.getWelcomeMessage as jest.Mock
            ).mockResolvedValue(null)
            ;(
                autoMessageService.getLeaveMessage as jest.Mock
            ).mockResolvedValue(null)
            ;(
                reactionRolesService.listReactionRoleMessages as jest.Mock
            ).mockResolvedValue([])
            ;(
                roleManagementService.listExclusiveRoles as jest.Mock
            ).mockResolvedValue([])
            ;(
                guildRoleAccessService.listRoleGrants as jest.Mock
            ).mockResolvedValue([])

            const result =
                await guildAutomationExecutionService.captureGuildAutomationState(
                    GUILD_ID,
                )

            expect(result.roles?.channels).toHaveLength(2)
            expect(result.roles?.channels.map((c) => c.type)).toEqual([
                'GuildText',
                'GuildVoice',
            ])
        })

        test('should handle onboarding unavailable (403)', async () => {
            const mockGuild = { id: GUILD_ID, name: 'Test Guild' }

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockGuild,
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => [],
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => [],
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 403,
                    text: async () => 'Forbidden',
                })
            ;(
                guildAutomationService.getManifest as jest.Mock
            ).mockResolvedValue(null)
            ;(autoModService.getSettings as jest.Mock).mockResolvedValue(null)
            ;(getModerationSettings as jest.Mock).mockResolvedValue(null)
            ;(
                autoMessageService.getWelcomeMessage as jest.Mock
            ).mockResolvedValue(null)
            ;(
                autoMessageService.getLeaveMessage as jest.Mock
            ).mockResolvedValue(null)
            ;(
                reactionRolesService.listReactionRoleMessages as jest.Mock
            ).mockResolvedValue([])
            ;(
                roleManagementService.listExclusiveRoles as jest.Mock
            ).mockResolvedValue([])
            ;(
                guildRoleAccessService.listRoleGrants as jest.Mock
            ).mockResolvedValue([])

            const result =
                await guildAutomationExecutionService.captureGuildAutomationState(
                    GUILD_ID,
                )

            expect(result.onboarding).toBeUndefined()
        })

        test('should throw when DISCORD_TOKEN is missing', async () => {
            delete process.env.DISCORD_TOKEN

            await expect(
                guildAutomationExecutionService.captureGuildAutomationState(
                    GUILD_ID,
                ),
            ).rejects.toThrow('DISCORD_TOKEN is required')
        })

        test('should throw on Discord API failure', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                text: async () => 'Internal Server Error',
            })
            ;(
                guildAutomationService.getManifest as jest.Mock
            ).mockResolvedValue(null)
            ;(autoModService.getSettings as jest.Mock).mockResolvedValue(null)
            ;(getModerationSettings as jest.Mock).mockResolvedValue(null)
            ;(
                autoMessageService.getWelcomeMessage as jest.Mock
            ).mockResolvedValue(null)
            ;(
                autoMessageService.getLeaveMessage as jest.Mock
            ).mockResolvedValue(null)
            ;(
                reactionRolesService.listReactionRoleMessages as jest.Mock
            ).mockResolvedValue([])
            ;(
                roleManagementService.listExclusiveRoles as jest.Mock
            ).mockResolvedValue([])
            ;(
                guildRoleAccessService.listRoleGrants as jest.Mock
            ).mockResolvedValue([])

            await expect(
                guildAutomationExecutionService.captureGuildAutomationState(
                    GUILD_ID,
                ),
            ).rejects.toThrow('Discord request failed')
        })

        test('should throw on fetch network error', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'))
            ;(
                guildAutomationService.getManifest as jest.Mock
            ).mockResolvedValue(null)
            ;(autoModService.getSettings as jest.Mock).mockResolvedValue(null)
            ;(getModerationSettings as jest.Mock).mockResolvedValue(null)
            ;(
                autoMessageService.getWelcomeMessage as jest.Mock
            ).mockResolvedValue(null)
            ;(
                autoMessageService.getLeaveMessage as jest.Mock
            ).mockResolvedValue(null)
            ;(
                reactionRolesService.listReactionRoleMessages as jest.Mock
            ).mockResolvedValue([])
            ;(
                roleManagementService.listExclusiveRoles as jest.Mock
            ).mockResolvedValue([])
            ;(
                guildRoleAccessService.listRoleGrants as jest.Mock
            ).mockResolvedValue([])

            await expect(
                guildAutomationExecutionService.captureGuildAutomationState(
                    GUILD_ID,
                ),
            ).rejects.toThrow('Discord request failed')
        })
    })

    describe('executeApplyPlan', () => {
        const createMinimalManifest = (
            overrides?: Partial<GuildAutomationManifestDocument>,
        ): GuildAutomationManifestDocument => ({
            version: 1,
            guild: { id: GUILD_ID, name: 'Test Guild' },
            source: 'test',
            capturedAt: new Date().toISOString(),
            parity: {
                shadowMode: true,
                externalBots: [],
                checklist: [],
                cutoverReady: false,
            },
            ...overrides,
        })

        const createMinimalPlan = (
            operations: GuildAutomationPlan['operations'],
        ): GuildAutomationPlan => ({
            guildId: GUILD_ID,
            status: 'pending',
            operations,
            summary: { added: [], changed: [], removed: [] },
            createdAt: new Date().toISOString(),
        })

        test('should apply onboarding module when plan includes it', async () => {
            const desired = createMinimalManifest({
                onboarding: {
                    enabled: true,
                    mode: 0,
                    defaultChannelIds: [CHANNEL_ID_1],
                    prompts: [],
                },
            })

            const actual = createMinimalManifest()

            const plan = createMinimalPlan([
                {
                    module: 'onboarding',
                    action: 'update',
                    protected: false,
                    description: 'Update onboarding',
                },
            ])

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({}),
            })

            const result =
                await guildAutomationExecutionService.executeApplyPlan({
                    guildId: GUILD_ID,
                    plan,
                    desired,
                    actual,
                    allowProtected: false,
                })

            expect(result.diagnostics.appliedModules).toContain('onboarding')
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/onboarding'),
                expect.objectContaining({
                    method: 'PUT',
                }),
            )
        })

        test('should skip protected module when allowProtected is false', async () => {
            const desired = createMinimalManifest({
                onboarding: {
                    enabled: true,
                    mode: 0,
                    defaultChannelIds: [],
                    prompts: [],
                },
            })

            const actual = createMinimalManifest()

            const plan = createMinimalPlan([
                {
                    module: 'onboarding',
                    action: 'delete',
                    protected: true,
                    description: 'Delete onboarding',
                },
            ])

            const result =
                await guildAutomationExecutionService.executeApplyPlan({
                    guildId: GUILD_ID,
                    plan,
                    desired,
                    actual,
                    allowProtected: false,
                })

            expect(result.diagnostics.appliedModules).not.toContain(
                'onboarding',
            )
            expect(mockFetch).not.toHaveBeenCalled()
        })

        test('should apply moderation settings', async () => {
            const desired = createMinimalManifest({
                moderation: {
                    automod: {
                        enabled: true,
                        spamEnabled: true,
                        spamThreshold: 5,
                        exemptRoles: [],
                        exemptChannels: [],
                    },
                    moderationSettings: {
                        enabled: true,
                        muteRoleId: null,
                        modRoleIds: [],
                        adminRoleIds: [],
                    },
                },
            })

            const actual = createMinimalManifest()

            const plan = createMinimalPlan([
                {
                    module: 'moderation',
                    action: 'update',
                    protected: false,
                    description: 'Update moderation',
                },
            ])

            const result =
                await guildAutomationExecutionService.executeApplyPlan({
                    guildId: GUILD_ID,
                    plan,
                    desired,
                    actual,
                    allowProtected: false,
                })

            expect(result.diagnostics.appliedModules).toContain('moderation')
            expect(autoModService.updateSettings).toHaveBeenCalledWith(
                GUILD_ID,
                expect.objectContaining({
                    enabled: true,
                    spamEnabled: true,
                }),
            )
            expect(updateModerationSettings).toHaveBeenCalledWith(
                GUILD_ID,
                expect.objectContaining({
                    enabled: true,
                }),
            )
        })

        test('should create welcome and leave auto messages', async () => {
            const desired = createMinimalManifest({
                automessages: {
                    welcome: {
                        enabled: true,
                        channelId: CHANNEL_ID_1,
                        message: 'Welcome!',
                    },
                    leave: {
                        enabled: true,
                        channelId: CHANNEL_ID_1,
                        message: 'Goodbye!',
                    },
                },
            })

            const actual = createMinimalManifest()

            const plan = createMinimalPlan([
                {
                    module: 'automessages',
                    action: 'create',
                    protected: false,
                    description: 'Create auto messages',
                },
            ])

            ;(
                autoMessageService.getWelcomeMessage as jest.Mock
            ).mockResolvedValue(null)
            ;(
                autoMessageService.getLeaveMessage as jest.Mock
            ).mockResolvedValue(null)

            const result =
                await guildAutomationExecutionService.executeApplyPlan({
                    guildId: GUILD_ID,
                    plan,
                    desired,
                    actual,
                    allowProtected: false,
                })

            expect(result.diagnostics.appliedModules).toContain('automessages')
            expect(autoMessageService.createMessage).toHaveBeenCalledWith(
                GUILD_ID,
                'welcome',
                { message: 'Welcome!' },
                { channelId: CHANNEL_ID_1 },
            )
            expect(autoMessageService.createMessage).toHaveBeenCalledWith(
                GUILD_ID,
                'leave',
                { message: 'Goodbye!' },
                { channelId: CHANNEL_ID_1 },
            )
        })

        test('should update existing auto messages', async () => {
            const desired = createMinimalManifest({
                automessages: {
                    welcome: {
                        enabled: false,
                        channelId: CHANNEL_ID_2,
                        message: 'New welcome!',
                    },
                },
            })

            const actual = createMinimalManifest()

            const plan = createMinimalPlan([
                {
                    module: 'automessages',
                    action: 'update',
                    protected: false,
                    description: 'Update auto messages',
                },
            ])

            ;(
                autoMessageService.getWelcomeMessage as jest.Mock
            ).mockResolvedValue({
                id: 'msg1',
                enabled: true,
                channelId: CHANNEL_ID_1,
                message: 'Old welcome',
            })
            ;(
                autoMessageService.getLeaveMessage as jest.Mock
            ).mockResolvedValue(null)

            const result =
                await guildAutomationExecutionService.executeApplyPlan({
                    guildId: GUILD_ID,
                    plan,
                    desired,
                    actual,
                    allowProtected: false,
                })

            expect(result.diagnostics.appliedModules).toContain('automessages')
            expect(autoMessageService.updateMessage).toHaveBeenCalledWith(
                'msg1',
                {
                    message: 'New welcome!',
                    channelId: CHANNEL_ID_2,
                    enabled: false,
                },
            )
        })

        test('should apply reaction role rules', async () => {
            const desired = createMinimalManifest({
                reactionroles: {
                    messages: [],
                    exclusiveRoles: [
                        {
                            roleId: ROLE_ID_1,
                            excludedRoleId: ROLE_ID_2,
                        },
                    ],
                },
            })

            const actual = createMinimalManifest()

            const plan = createMinimalPlan([
                {
                    module: 'reactionroles',
                    action: 'update',
                    protected: false,
                    description: 'Update reaction roles',
                },
            ])

            ;(
                roleManagementService.listExclusiveRoles as jest.Mock
            ).mockResolvedValue([])

            const result =
                await guildAutomationExecutionService.executeApplyPlan({
                    guildId: GUILD_ID,
                    plan,
                    desired,
                    actual,
                    allowProtected: false,
                })

            expect(result.diagnostics.appliedModules).toContain('reactionroles')
            expect(roleManagementService.setExclusiveRole).toHaveBeenCalledWith(
                GUILD_ID,
                ROLE_ID_1,
                ROLE_ID_2,
            )
        })

        test('should remove old exclusive role rules', async () => {
            const desired = createMinimalManifest({
                reactionroles: {
                    messages: [],
                    exclusiveRoles: [],
                },
            })

            const actual = createMinimalManifest()

            const plan = createMinimalPlan([
                {
                    module: 'reactionroles',
                    action: 'update',
                    protected: false,
                    description: 'Clean up reaction roles',
                },
            ])

            ;(
                roleManagementService.listExclusiveRoles as jest.Mock
            ).mockResolvedValue([
                { roleId: ROLE_ID_1, excludedRoleId: ROLE_ID_2 },
            ])

            const result =
                await guildAutomationExecutionService.executeApplyPlan({
                    guildId: GUILD_ID,
                    plan,
                    desired,
                    actual,
                    allowProtected: false,
                })

            expect(result.diagnostics.appliedModules).toContain('reactionroles')
            expect(
                roleManagementService.removeExclusiveRole,
            ).toHaveBeenCalledWith(GUILD_ID, ROLE_ID_1, ROLE_ID_2)
        })

        test('should apply command access grants', async () => {
            const desired = createMinimalManifest({
                commandaccess: {
                    grants: [
                        {
                            roleId: ROLE_ID_1,
                            module: 'moderation',
                            mode: 'allow',
                        },
                    ],
                },
            })

            const actual = createMinimalManifest()

            const plan = createMinimalPlan([
                {
                    module: 'commandaccess',
                    action: 'update',
                    protected: false,
                    description: 'Update command access',
                },
            ])

            const result =
                await guildAutomationExecutionService.executeApplyPlan({
                    guildId: GUILD_ID,
                    plan,
                    desired,
                    actual,
                    allowProtected: false,
                })

            expect(result.diagnostics.appliedModules).toContain('commandaccess')
            expect(
                guildRoleAccessService.replaceRoleGrants,
            ).toHaveBeenCalledWith(GUILD_ID, [
                {
                    roleId: ROLE_ID_1,
                    module: 'moderation',
                    mode: 'allow',
                },
            ])
        })

        test('should create new roles when no matching role exists', async () => {
            const desired = createMinimalManifest({
                roles: {
                    roles: [
                        {
                            id: ROLE_ID_1,
                            name: 'Admin',
                            color: 16711680,
                            hoist: true,
                            mentionable: true,
                            permissions: '8',
                        },
                    ],
                    channels: [],
                },
            })

            const actual = createMinimalManifest({
                roles: {
                    roles: [],
                    channels: [],
                },
            })

            const plan = createMinimalPlan([
                {
                    module: 'roles',
                    action: 'create',
                    protected: false,
                    description: 'Create roles',
                },
            ])

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    id: 'new-role-id',
                    name: 'Admin',
                }),
            })

            const result =
                await guildAutomationExecutionService.executeApplyPlan({
                    guildId: GUILD_ID,
                    plan,
                    desired,
                    actual,
                    allowProtected: false,
                })

            expect(result.diagnostics.appliedModules).toContain('roles')
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining(`/guilds/${GUILD_ID}/roles`),
                expect.objectContaining({
                    method: 'POST',
                }),
            )
        })

        test('should update existing roles by ID', async () => {
            const desired = createMinimalManifest({
                roles: {
                    roles: [
                        {
                            id: ROLE_ID_1,
                            name: 'Admin Updated',
                            color: 255,
                            hoist: false,
                            mentionable: false,
                            permissions: '8',
                        },
                    ],
                    channels: [],
                },
            })

            const actual = createMinimalManifest({
                roles: {
                    roles: [
                        {
                            id: ROLE_ID_1,
                            name: 'Admin',
                            color: 0,
                            hoist: true,
                            mentionable: true,
                            permissions: '8',
                        },
                    ],
                    channels: [],
                },
            })

            const plan = createMinimalPlan([
                {
                    module: 'roles',
                    action: 'update',
                    protected: false,
                    description: 'Update roles',
                },
            ])

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({}),
            })

            const result =
                await guildAutomationExecutionService.executeApplyPlan({
                    guildId: GUILD_ID,
                    plan,
                    desired,
                    actual,
                    allowProtected: false,
                })

            expect(result.diagnostics.appliedModules).toContain('roles')
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining(`/roles/${ROLE_ID_1}`),
                expect.objectContaining({
                    method: 'PATCH',
                }),
            )
        })

        test('should create channels and categories', async () => {
            const desired = createMinimalManifest({
                roles: {
                    roles: [],
                    channels: [
                        {
                            id: CHANNEL_ID_1,
                            name: 'general',
                            type: 'GuildText',
                            parentId: null,
                            topic: 'Welcome',
                            readonly: false,
                        },
                    ],
                },
            })

            const actual = createMinimalManifest({
                roles: {
                    roles: [],
                    channels: [],
                },
            })

            const plan = createMinimalPlan([
                {
                    module: 'roles',
                    action: 'create',
                    protected: false,
                    description: 'Create channels',
                },
            ])

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    id: 'new-channel-id',
                    name: 'general',
                }),
            })

            const result =
                await guildAutomationExecutionService.executeApplyPlan({
                    guildId: GUILD_ID,
                    plan,
                    desired,
                    actual,
                    allowProtected: false,
                })

            expect(result.diagnostics.appliedModules).toContain('roles')
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining(`/guilds/${GUILD_ID}/channels`),
                expect.objectContaining({
                    method: 'POST',
                }),
            )
        })

        test('should remap role and channel IDs when created', async () => {
            const OLD_ROLE_ID = 'old-role-id'
            const NEW_ROLE_ID = 'new-role-id'

            const desired = createMinimalManifest({
                roles: {
                    roles: [
                        {
                            id: OLD_ROLE_ID,
                            name: 'Admin',
                            color: 0,
                            hoist: false,
                            mentionable: false,
                            permissions: '8',
                        },
                    ],
                    channels: [],
                },
                moderation: {
                    moderationSettings: {
                        enabled: true,
                        muteRoleId: OLD_ROLE_ID,
                        modRoleIds: [OLD_ROLE_ID],
                        adminRoleIds: [],
                    },
                },
            })

            const actual = createMinimalManifest({
                roles: {
                    roles: [],
                    channels: [],
                },
            })

            const plan = createMinimalPlan([
                {
                    module: 'roles',
                    action: 'create',
                    protected: false,
                    description: 'Create roles',
                },
                {
                    module: 'moderation',
                    action: 'update',
                    protected: false,
                    description: 'Update moderation',
                },
            ])

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    id: NEW_ROLE_ID,
                    name: 'Admin',
                }),
            })

            const result =
                await guildAutomationExecutionService.executeApplyPlan({
                    guildId: GUILD_ID,
                    plan,
                    desired,
                    actual,
                    allowProtected: false,
                })

            expect(result.diagnostics.roleIdRemaps).toHaveProperty(
                OLD_ROLE_ID,
                NEW_ROLE_ID,
            )
            expect(result.remappedManifest).toBeDefined()
            expect(
                result.remappedManifest?.moderation?.moderationSettings
                    ?.muteRoleId,
            ).toBe(NEW_ROLE_ID)
        })

        test('should delete unmanaged roles when allowProtected is true', async () => {
            const desired = createMinimalManifest({
                roles: {
                    roles: [
                        {
                            id: ROLE_ID_1,
                            name: 'Keeper',
                            color: 0,
                            hoist: false,
                            mentionable: false,
                            permissions: '0',
                        },
                    ],
                    channels: [],
                },
            })

            const actual = createMinimalManifest({
                roles: {
                    roles: [
                        {
                            id: ROLE_ID_1,
                            name: 'Keeper',
                            color: 0,
                            hoist: false,
                            mentionable: false,
                            permissions: '0',
                        },
                        {
                            id: ROLE_ID_2,
                            name: 'Obsolete',
                            color: 0,
                            hoist: false,
                            mentionable: false,
                            permissions: '0',
                        },
                    ],
                    channels: [],
                },
            })

            const plan = createMinimalPlan([
                {
                    module: 'roles',
                    action: 'delete',
                    protected: true,
                    description: 'Delete old roles',
                },
            ])

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => ({}),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => [
                        {
                            id: ROLE_ID_1,
                            name: 'Keeper',
                            managed: false,
                        },
                        {
                            id: ROLE_ID_2,
                            name: 'Obsolete',
                            managed: false,
                        },
                    ],
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 204,
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => [],
                })

            const result =
                await guildAutomationExecutionService.executeApplyPlan({
                    guildId: GUILD_ID,
                    plan,
                    desired,
                    actual,
                    allowProtected: true,
                })

            expect(result.diagnostics.appliedModules).toContain('roles')
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining(`/roles/${ROLE_ID_2}`),
                expect.objectContaining({
                    method: 'DELETE',
                }),
            )
        })

        test('should not delete managed roles', async () => {
            const desired = createMinimalManifest({
                roles: {
                    roles: [],
                    channels: [],
                },
            })

            const actual = createMinimalManifest({
                roles: {
                    roles: [],
                    channels: [],
                },
            })

            const plan = createMinimalPlan([
                {
                    module: 'roles',
                    action: 'delete',
                    protected: true,
                    description: 'Clean roles',
                },
            ])

            const MANAGED_ROLE_ID = 'managed-role'

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => [
                        {
                            id: MANAGED_ROLE_ID,
                            name: 'Bot',
                            managed: true,
                        },
                    ],
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => [],
                })

            const result =
                await guildAutomationExecutionService.executeApplyPlan({
                    guildId: GUILD_ID,
                    plan,
                    desired,
                    actual,
                    allowProtected: true,
                })

            expect(result.diagnostics.appliedModules).toContain('roles')
            const deleteCalls = (mockFetch.mock.calls as any[][]).filter(
                (call) => call[1]?.method === 'DELETE',
            )
            expect(deleteCalls).toHaveLength(0)
        })

        test('should skip parity module with diagnostic', async () => {
            const desired = createMinimalManifest({
                parity: {
                    shadowMode: false,
                    externalBots: [],
                    checklist: [],
                    cutoverReady: true,
                },
            })

            const actual = createMinimalManifest()

            const plan = createMinimalPlan([
                {
                    module: 'parity',
                    action: 'update',
                    protected: false,
                    description: 'Update parity',
                },
            ])

            const result =
                await guildAutomationExecutionService.executeApplyPlan({
                    guildId: GUILD_ID,
                    plan,
                    desired,
                    actual,
                    allowProtected: false,
                })

            expect(result.diagnostics.skippedModules).toContain(
                'parity requires checklist/cutover workflow',
            )
        })

        test('should apply onboarding module with prompts containing options', async () => {
            const desired = createMinimalManifest({
                onboarding: {
                    enabled: true,
                    mode: 0,
                    defaultChannelIds: [CHANNEL_ID_1],
                    prompts: [
                        {
                            id: 'prompt-1',
                            title: 'Pick a channel',
                            singleSelect: true,
                            required: false,
                            inOnboarding: true,
                            type: 0,
                            options: [
                                {
                                    id: 'opt-1',
                                    title: 'General',
                                    description: null,
                                    channelIds: [CHANNEL_ID_1],
                                    roleIds: [ROLE_ID_1],
                                    emoji: null,
                                },
                            ],
                        },
                    ],
                },
            })
            const actual = createMinimalManifest()
            const plan = createMinimalPlan([
                { module: 'onboarding', action: 'update', protected: false, description: 'Update' },
            ])
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
            const result = await guildAutomationExecutionService.executeApplyPlan({
                guildId: GUILD_ID, plan, desired, actual, allowProtected: false,
            })
            expect(result.diagnostics.appliedModules).toContain('onboarding')
            const body = JSON.parse((mockFetch.mock.calls[0] as any[])[1].body as string)
            expect(body.prompts[0].options[0].channel_ids).toEqual([CHANNEL_ID_1])
            expect(body.prompts[0].options[0].role_ids).toEqual([ROLE_ID_1])
        })

        test('should apply command access grants', async () => {
            const desired = createMinimalManifest({
                commandaccess: {
                    grants: [
                        { roleId: ROLE_ID_1, module: 'music', mode: 'allow' as any },
                    ],
                },
            })
            const actual = createMinimalManifest()
            const plan = createMinimalPlan([
                { module: 'commandaccess', action: 'update', protected: false, description: 'Update' },
            ])
            const { guildRoleAccessService } = await import('@lucky/shared/services')
            ;(guildRoleAccessService.replaceRoleGrants as jest.Mock).mockResolvedValue(undefined)
            const result = await guildAutomationExecutionService.executeApplyPlan({
                guildId: GUILD_ID, plan, desired, actual, allowProtected: false,
            })
            expect(result.diagnostics.appliedModules).toContain('commandaccess')
            expect(guildRoleAccessService.replaceRoleGrants as jest.Mock).toHaveBeenCalledWith(
                GUILD_ID,
                [{ roleId: ROLE_ID_1, module: 'music', mode: 'allow' }],
            )
        })

        test('should update existing channel by ID', async () => {
            const desired = createMinimalManifest({
                roles: {
                    roles: [],
                    channels: [
                        { id: CHANNEL_ID_1, name: 'updated-name', type: 'GuildText', parentId: null, topic: null, readonly: false },
                    ],
                },
            })
            const actual = createMinimalManifest({
                roles: {
                    roles: [],
                    channels: [
                        { id: CHANNEL_ID_1, name: 'old-name', type: 'GuildText', parentId: null, topic: null, readonly: false },
                    ],
                },
            })
            const plan = createMinimalPlan([
                { module: 'roles', action: 'update', protected: false, description: 'Update channel' },
            ])
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
            const result = await guildAutomationExecutionService.executeApplyPlan({
                guildId: GUILD_ID, plan, desired, actual, allowProtected: false,
            })
            expect(result.diagnostics.appliedModules).toContain('roles')
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining(`/channels/${CHANNEL_ID_1}`),
                expect.objectContaining({ method: 'PATCH' }),
            )
        })

        test('should delete stale channels when allowProtected is true', async () => {
            const desired = createMinimalManifest({
                roles: {
                    roles: [],
                    channels: [
                        { id: CHANNEL_ID_1, name: 'keep', type: 'GuildText', parentId: null, topic: null, readonly: false },
                    ],
                },
            })
            const actual = createMinimalManifest({
                roles: { roles: [], channels: [] },
            })
            const plan = createMinimalPlan([
                { module: 'roles', action: 'delete', protected: true, description: 'Delete stale' },
            ])
            mockFetch
                .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: CHANNEL_ID_1, name: 'keep' }) })  // POST create channel
                .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] })  // GET roles for prune
                .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [  // GET channels for prune
                    { id: CHANNEL_ID_2, name: 'stale' },
                ] })
                .mockResolvedValueOnce({ ok: true, status: 204, json: async () => undefined })  // DELETE stale channel
            const result = await guildAutomationExecutionService.executeApplyPlan({
                guildId: GUILD_ID, plan, desired, actual, allowProtected: true,
            })
            expect(result.diagnostics.appliedModules).toContain('roles')
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining(`/channels/${CHANNEL_ID_2}`),
                expect.objectContaining({ method: 'DELETE' }),
            )
        })

        test('should apply remapping through all manifest sections when roles/channels are remapped', async () => {
            const OLD_ROLE = 'old-role-111'
            const NEW_ROLE = 'new-role-222'
            const OLD_CHANNEL = 'old-ch-111'
            const NEW_CHANNEL = 'new-ch-222'

            const desired = createMinimalManifest({
                roles: {
                    roles: [{ id: OLD_ROLE, name: 'Member', color: 0, hoist: false, mentionable: false }],
                    channels: [{ id: OLD_CHANNEL, name: 'general', type: 'GuildText', parentId: null, topic: null, readonly: false }],
                },
                onboarding: { enabled: true, mode: 0, defaultChannelIds: [OLD_CHANNEL], prompts: [] },
                moderation: {
                    automod: { exemptRoles: [OLD_ROLE], exemptChannels: [OLD_CHANNEL] } as any,
                    moderationSettings: { muteRoleId: OLD_ROLE, modRoleIds: [OLD_ROLE], adminRoleIds: [] } as any,
                },
                automessages: {
                    welcome: { enabled: true, channelId: OLD_CHANNEL, message: 'hi' },
                    leave: { enabled: true, channelId: OLD_CHANNEL, message: 'bye' },
                },
                reactionroles: {
                    messages: [{ id: 'm1', messageId: 'dm1', channelId: OLD_CHANNEL, mappings: [{ roleId: OLD_ROLE, label: 'x', emoji: undefined, style: undefined }] }],
                    exclusiveRoles: [{ roleId: OLD_ROLE, excludedRoleId: OLD_ROLE }],
                },
                commandaccess: { grants: [{ roleId: OLD_ROLE, module: 'music', mode: 'allow' as any }] },
            })
            const actual = createMinimalManifest({ roles: { roles: [], channels: [] } })
            const plan = createMinimalPlan([
                { module: 'roles', action: 'create', protected: false, description: 'Create' },
            ])
            mockFetch
                .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: NEW_ROLE, name: 'Member' }) })
                .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: NEW_CHANNEL, name: 'general' }) })
            const result = await guildAutomationExecutionService.executeApplyPlan({
                guildId: GUILD_ID, plan, desired, actual, allowProtected: false,
            })
            expect(result.remappedManifest).toBeDefined()
            expect(result.diagnostics.roleIdRemaps).toEqual({ [OLD_ROLE]: NEW_ROLE })
            expect(result.diagnostics.channelIdRemaps).toEqual({ [OLD_CHANNEL]: NEW_CHANNEL })
        })

        test('should note when reactionroles messages require manual setup', async () => {
            const desired = createMinimalManifest({
                reactionroles: {
                    messages: [
                        {
                            id: 'msg1',
                            messageId: 'discord-msg-1',
                            channelId: CHANNEL_ID_1,
                            mappings: [],
                        },
                    ],
                    exclusiveRoles: [],
                },
            })

            const actual = createMinimalManifest()

            const plan = createMinimalPlan([
                {
                    module: 'reactionroles',
                    action: 'create',
                    protected: false,
                    description: 'Create reaction roles',
                },
            ])

            ;(
                roleManagementService.listExclusiveRoles as jest.Mock
            ).mockResolvedValue([])

            const result =
                await guildAutomationExecutionService.executeApplyPlan({
                    guildId: GUILD_ID,
                    plan,
                    desired,
                    actual,
                    allowProtected: false,
                })

            expect(result.diagnostics.skippedModules).toContain(
                'reactionroles.messages requires manual message-template publish',
            )
        })
    })

    describe('captureGuildAutomationState - reaction roles and exclusive roles coverage', () => {
        test('should capture reaction role messages with complete mappings', async () => {
            const mockGuild = { id: GUILD_ID, name: 'Test Guild' }
            const mockRoles = [
                { id: GUILD_ID, name: '@everyone', color: 0 },
                { id: ROLE_ID_1, name: 'Member', color: 3066993 },
                { id: ROLE_ID_2, name: 'Moderator', color: 15158332 },
            ]

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockGuild,
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockRoles,
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => [],
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 404,
                    text: async () => 'Not Found',
                })
            ;(
                guildAutomationService.getManifest as jest.Mock
            ).mockResolvedValue(null)
            ;(autoModService.getSettings as jest.Mock).mockResolvedValue(null)
            ;(getModerationSettings as jest.Mock).mockResolvedValue(null)
            ;(
                autoMessageService.getWelcomeMessage as jest.Mock
            ).mockResolvedValue(null)
            ;(
                autoMessageService.getLeaveMessage as jest.Mock
            ).mockResolvedValue(null)
            ;(
                reactionRolesService.listReactionRoleMessages as jest.Mock
            ).mockResolvedValue([
                {
                    id: 'rrm1',
                    messageId: 'msg-discord-1',
                    channelId: CHANNEL_ID_1,
                    mappings: [
                        {
                            roleId: ROLE_ID_1,
                            label: 'Member Role',
                            emoji: '👤',
                            style: 'primary',
                        },
                        {
                            roleId: ROLE_ID_2,
                            label: 'Moderator Role',
                            emoji: '👮',
                            style: 'danger',
                        },
                    ],
                },
            ])
            ;(
                roleManagementService.listExclusiveRoles as jest.Mock
            ).mockResolvedValue([
                {
                    roleId: ROLE_ID_1,
                    excludedRoleId: ROLE_ID_2,
                },
            ])
            ;(
                guildRoleAccessService.listRoleGrants as jest.Mock
            ).mockResolvedValue([])

            const result =
                await guildAutomationExecutionService.captureGuildAutomationState(
                    GUILD_ID,
                )

            expect(result.reactionroles?.messages).toHaveLength(1)
            expect(result.reactionroles?.messages[0].id).toBe('rrm1')
            expect(result.reactionroles?.messages[0].mappings).toHaveLength(2)
            expect(result.reactionroles?.messages[0].mappings[0]).toEqual({
                roleId: ROLE_ID_1,
                label: 'Member Role',
                emoji: '👤',
                style: 'primary',
            })
            expect(result.reactionroles?.exclusiveRoles).toHaveLength(1)
            expect(result.reactionroles?.exclusiveRoles[0]).toEqual({
                roleId: ROLE_ID_1,
                excludedRoleId: ROLE_ID_2,
            })
        })

        test('should handle reaction role mappings with missing optional fields', async () => {
            const mockGuild = { id: GUILD_ID, name: 'Test Guild' }

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockGuild,
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => [{ id: GUILD_ID, name: '@everyone' }, { id: ROLE_ID_1, name: 'Member' }],
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => [],
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 404,
                    text: async () => 'Not Found',
                })
            ;(
                guildAutomationService.getManifest as jest.Mock
            ).mockResolvedValue(null)
            ;(autoModService.getSettings as jest.Mock).mockResolvedValue(null)
            ;(getModerationSettings as jest.Mock).mockResolvedValue(null)
            ;(
                autoMessageService.getWelcomeMessage as jest.Mock
            ).mockResolvedValue(null)
            ;(
                autoMessageService.getLeaveMessage as jest.Mock
            ).mockResolvedValue(null)
            ;(
                reactionRolesService.listReactionRoleMessages as jest.Mock
            ).mockResolvedValue([
                {
                    id: 'rrm2',
                    messageId: 'msg-2',
                    channelId: CHANNEL_ID_1,
                    mappings: [
                        {
                            roleId: ROLE_ID_1,
                        },
                    ],
                },
            ])
            ;(
                roleManagementService.listExclusiveRoles as jest.Mock
            ).mockResolvedValue([])
            ;(
                guildRoleAccessService.listRoleGrants as jest.Mock
            ).mockResolvedValue([])

            const result =
                await guildAutomationExecutionService.captureGuildAutomationState(
                    GUILD_ID,
                )

            expect(result.reactionroles?.messages[0].mappings[0]).toEqual({
                roleId: ROLE_ID_1,
                label: ROLE_ID_1,
                emoji: undefined,
                style: undefined,
            })
        })

        test('should capture command access grants', async () => {
            const mockGuild = { id: GUILD_ID, name: 'Test Guild' }

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockGuild,
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => [{ id: GUILD_ID, name: '@everyone' }, { id: ROLE_ID_1, name: 'Admin' }],
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => [],
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 404,
                    text: async () => 'Not Found',
                })
            ;(
                guildAutomationService.getManifest as jest.Mock
            ).mockResolvedValue(null)
            ;(autoModService.getSettings as jest.Mock).mockResolvedValue(null)
            ;(getModerationSettings as jest.Mock).mockResolvedValue(null)
            ;(
                autoMessageService.getWelcomeMessage as jest.Mock
            ).mockResolvedValue(null)
            ;(
                autoMessageService.getLeaveMessage as jest.Mock
            ).mockResolvedValue(null)
            ;(
                reactionRolesService.listReactionRoleMessages as jest.Mock
            ).mockResolvedValue([])
            ;(
                roleManagementService.listExclusiveRoles as jest.Mock
            ).mockResolvedValue([])
            ;(
                guildRoleAccessService.listRoleGrants as jest.Mock
            ).mockResolvedValue([
                {
                    roleId: ROLE_ID_1,
                    module: 'music',
                    mode: 'view',
                },
                {
                    roleId: ROLE_ID_1,
                    module: 'settings',
                    mode: 'manage',
                },
            ])

            const result =
                await guildAutomationExecutionService.captureGuildAutomationState(
                    GUILD_ID,
                )

            expect(result.commandaccess?.grants).toHaveLength(2)
            expect(result.commandaccess?.grants[0]).toEqual({
                roleId: ROLE_ID_1,
                module: 'music',
                mode: 'view',
            })
            expect(result.commandaccess?.grants[1]).toEqual({
                roleId: ROLE_ID_1,
                module: 'settings',
                mode: 'manage',
            })
        })

        test('should handle automessages with null values', async () => {
            const mockGuild = { id: GUILD_ID, name: 'Test Guild' }

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockGuild,
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => [{ id: GUILD_ID, name: '@everyone' }],
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => [],
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 404,
                    text: async () => 'Not Found',
                })
            ;(
                guildAutomationService.getManifest as jest.Mock
            ).mockResolvedValue(null)
            ;(autoModService.getSettings as jest.Mock).mockResolvedValue(null)
            ;(getModerationSettings as jest.Mock).mockResolvedValue(null)
            ;(
                autoMessageService.getWelcomeMessage as jest.Mock
            ).mockResolvedValue({
                enabled: true,
                channelId: null,
                message: null,
            })
            ;(
                autoMessageService.getLeaveMessage as jest.Mock
            ).mockResolvedValue({
                enabled: false,
                channelId: CHANNEL_ID_1,
                message: 'Goodbye!',
            })
            ;(
                reactionRolesService.listReactionRoleMessages as jest.Mock
            ).mockResolvedValue([])
            ;(
                roleManagementService.listExclusiveRoles as jest.Mock
            ).mockResolvedValue([])
            ;(
                guildRoleAccessService.listRoleGrants as jest.Mock
            ).mockResolvedValue([])

            const result =
                await guildAutomationExecutionService.captureGuildAutomationState(
                    GUILD_ID,
                )

            expect(result.automessages?.welcome).toEqual({
                enabled: true,
                channelId: undefined,
                message: undefined,
            })
            expect(result.automessages?.leave).toEqual({
                enabled: false,
                channelId: CHANNEL_ID_1,
                message: 'Goodbye!',
            })
        })
    })

    describe('GuildAutomationExecutionError', () => {
        it('should create error with default status code', () => {
            const error = new GuildAutomationExecutionError('Test error')
            expect(error.message).toBe('Test error')
            expect(error.statusCode).toBe(500)
            expect(error.name).toBe('GuildAutomationExecutionError')
        })

        it('should create error with custom status code', () => {
            const error = new GuildAutomationExecutionError('Not found', 404)
            expect(error.statusCode).toBe(404)
        })
    })

    describe('utility functions', () => {
        it('mapChannelType should convert Discord channel types to type names', () => {
            expect(mapChannelType(0)).toBe('GuildText')
            expect(mapChannelType(2)).toBe('GuildVoice')
            expect(mapChannelType(4)).toBe('GuildCategory')
            expect(mapChannelType(5)).toBe('GuildAnnouncement')
            expect(mapChannelType(13)).toBe('GuildStageVoice')
            expect(mapChannelType(15)).toBe('GuildForum')
            expect(mapChannelType(999)).toBe('GuildText')
        })

        it('toDiscordChannelType should convert type names to Discord channel types', () => {
            expect(toDiscordChannelType('GuildText')).toBe(0)
            expect(toDiscordChannelType('GuildVoice')).toBe(2)
            expect(toDiscordChannelType('GuildCategory')).toBe(4)
            expect(toDiscordChannelType('GuildAnnouncement')).toBe(5)
            expect(toDiscordChannelType('GuildStageVoice')).toBe(13)
            expect(toDiscordChannelType('GuildForum')).toBe(15)
            expect(toDiscordChannelType('Unknown')).toBe(0)
        })

        it('isExpectedDeleteError should identify forbidden and not found errors', () => {
            const err403 = new GuildAutomationExecutionError('Forbidden', 403)
            const err404 = new GuildAutomationExecutionError('Not found', 404)
            const err500 = new GuildAutomationExecutionError('Server error', 500)
            const nonError = new Error('Regular error')

            expect(isExpectedDeleteError(err403)).toBe(true)
            expect(isExpectedDeleteError(err404)).toBe(true)
            expect(isExpectedDeleteError(err500)).toBe(false)
            expect(isExpectedDeleteError(nonError)).toBe(false)
            expect(isExpectedDeleteError(null)).toBe(false)
        })

        it('isOnboardingUnavailable should identify forbidden and not found errors', () => {
            const err403 = new GuildAutomationExecutionError('Forbidden', 403)
            const err404 = new GuildAutomationExecutionError('Not found', 404)
            const err400 = new GuildAutomationExecutionError('Bad request', 400)

            expect(isOnboardingUnavailable(err403)).toBe(true)
            expect(isOnboardingUnavailable(err404)).toBe(true)
            expect(isOnboardingUnavailable(err400)).toBe(false)
        })

        it('normalizeName should trim and normalize strings', () => {
            expect(normalizeName('  Hello  ')).toBe('hello')
            expect(normalizeName('Test   Name')).toBe('test name')
            expect(normalizeName('UPPER')).toBe('upper')
        })

        it('asObject should convert values to objects', () => {
            expect(asObject({})).toEqual({})
            expect(asObject({ key: 'value' })).toEqual({ key: 'value' })
            expect(asObject(null)).toBeNull()
            expect(asObject([])).toBeNull()
            expect(asObject('string')).toBeNull()
            expect(asObject(123)).toBeNull()
        })

        it('toAutoModPayload should convert to payload or null', () => {
            expect(toAutoModPayload({ test: true })).toEqual({ test: true })
            expect(toAutoModPayload(null)).toBeNull()
            expect(toAutoModPayload('string')).toBeNull()
            expect(toAutoModPayload([])).toBeNull()
        })

        it('toModerationPayload should convert to payload or null', () => {
            expect(toModerationPayload({ test: true })).toEqual({ test: true })
            expect(toModerationPayload(null)).toBeNull()
            expect(toModerationPayload([])).toBeNull()
        })
    })
})
