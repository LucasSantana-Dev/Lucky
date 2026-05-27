import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { ChannelType } from 'discord.js'

const getWelcomeMessageMock = jest.fn()
const getLeaveMessageMock = jest.fn()
const createMessageMock = jest.fn()
const updateMessageMock = jest.fn()

const updateSettingsMock = jest.fn()
const manifestOnboardingToDiscordEditMock = jest.fn()
const replaceRoleGrantsMock = jest.fn()
const listExclusiveRolesMock = jest.fn()
const removeExclusiveRoleMock = jest.fn()
const setExclusiveRoleMock = jest.fn()
const updateModerationSettingsMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    autoMessageService: {
        getWelcomeMessage: (...args: unknown[]) =>
            getWelcomeMessageMock(...args),
        getLeaveMessage: (...args: unknown[]) => getLeaveMessageMock(...args),
        createMessage: (...args: unknown[]) => createMessageMock(...args),
        updateMessage: (...args: unknown[]) => updateMessageMock(...args),
    },
    autoModService: {
        updateSettings: (...args: unknown[]) => updateSettingsMock(...args),
    },
    manifestOnboardingToDiscordEdit: (...args: unknown[]) =>
        manifestOnboardingToDiscordEditMock(...args),
    guildRoleAccessService: {
        replaceRoleGrants: (...args: unknown[]) =>
            replaceRoleGrantsMock(...args),
    },
    roleManagementService: {
        listExclusiveRoles: (...args: unknown[]) =>
            listExclusiveRolesMock(...args),
        removeExclusiveRole: (...args: unknown[]) =>
            removeExclusiveRoleMock(...args),
        setExclusiveRole: (...args: unknown[]) => setExclusiveRoleMock(...args),
    },
    updateModerationSettings: (...args: unknown[]) =>
        updateModerationSettingsMock(...args),
}))

const errorLogMock = jest.fn()
const warnLogMock = jest.fn()
jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    warnLog: (...args: unknown[]) => warnLogMock(...args),
}))

const autoMessagesExecutorCaptureMock = jest.fn()
const autoMessagesExecutorDiffMock = jest.fn()
const autoMessagesExecutorApplyMock = jest.fn()

const moderationExecutorCaptureMock = jest.fn()
const moderationExecutorDiffMock = jest.fn()
const moderationExecutorApplyMock = jest.fn()

const reactionRolesExecutorCaptureMock = jest.fn()
const reactionRolesExecutorDiffMock = jest.fn()
const reactionRolesExecutorApplyMock = jest.fn()

jest.mock('@lucky/shared/services/guildAutomation', () => ({
    createAutoMessagesExecutor: jest.fn(() => ({
        capture: (...args: unknown[]) =>
            autoMessagesExecutorCaptureMock(...args),
        diff: (...args: unknown[]) => autoMessagesExecutorDiffMock(...args),
        apply: (...args: unknown[]) => autoMessagesExecutorApplyMock(...args),
    })),
    createModerationExecutor: jest.fn(() => ({
        capture: (...args: unknown[]) => moderationExecutorCaptureMock(...args),
        diff: (...args: unknown[]) => moderationExecutorDiffMock(...args),
        apply: (...args: unknown[]) => moderationExecutorApplyMock(...args),
    })),
    createReactionRolesExecutor: jest.fn(() => ({
        capture: (...args: unknown[]) =>
            reactionRolesExecutorCaptureMock(...args),
        diff: (...args: unknown[]) => reactionRolesExecutorDiffMock(...args),
        apply: (...args: unknown[]) => reactionRolesExecutorApplyMock(...args),
    })),
}))

import { applyAutomationModules } from './applyPlan'

function buildPlan(modules: string[]) {
    return {
        operations: modules.map((module) => ({
            module,
            protected: false,
        })),
        protectedOperations: [],
        summary: {
            total: modules.length,
            safe: modules.length,
            protected: 0,
        },
    }
}

function createGuild(overrides: Record<string, unknown> = {}) {
    return {
        id: 'guild-1',
        editOnboarding: jest.fn().mockResolvedValue(undefined),
        roles: {
            cache: new Map(),
            create: jest.fn().mockResolvedValue(undefined),
        },
        channels: {
            cache: new Map(),
            create: jest.fn().mockResolvedValue(undefined),
        },
        ...overrides,
    }
}

describe('applyAutomationModules', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        manifestOnboardingToDiscordEditMock.mockReturnValue({ enabled: true })
        getWelcomeMessageMock.mockResolvedValue(null)
        getLeaveMessageMock.mockResolvedValue({ id: 'leave-message' })
        createMessageMock.mockResolvedValue(undefined)
        updateMessageMock.mockResolvedValue(undefined)
        updateSettingsMock.mockResolvedValue(undefined)
        updateModerationSettingsMock.mockResolvedValue(undefined)
        listExclusiveRolesMock.mockResolvedValue([
            {
                roleId: 'legacy-role',
                excludedRoleId: 'legacy-excluded',
            },
        ])
        removeExclusiveRoleMock.mockResolvedValue(undefined)
        setExclusiveRoleMock.mockResolvedValue(undefined)
        replaceRoleGrantsMock.mockResolvedValue(undefined)
        autoMessagesExecutorCaptureMock.mockResolvedValue({})
        autoMessagesExecutorDiffMock.mockReturnValue({ operations: [] })
        autoMessagesExecutorApplyMock.mockResolvedValue({
            status: 'success',
            applied: [],
        })
        moderationExecutorCaptureMock.mockReturnValue({})
        moderationExecutorDiffMock.mockReturnValue({ ops: [] })
        moderationExecutorApplyMock.mockResolvedValue({
            status: 'success',
            applied: [],
        })
        reactionRolesExecutorCaptureMock.mockResolvedValue({
            exclusiveRoles: [],
        })
        reactionRolesExecutorDiffMock.mockReturnValue({ ops: [] })
        reactionRolesExecutorApplyMock.mockResolvedValue({
            status: 'success',
            applied: [],
        })
    })

    it('applies configured modules and returns skipped guidance', async () => {
        const guild = createGuild()
        const result = await applyAutomationModules({
            guild: guild as any,
            desired: {
                onboarding: {
                    enabled: true,
                    mode: 1,
                    defaultChannelIds: [],
                    prompts: [],
                },
                moderation: {
                    automod: { enabled: true, spamThreshold: 5 },
                    moderationSettings: { requireReason: true },
                },
                automessages: {
                    welcome: {
                        channelId: 'welcome-channel',
                        message: 'Welcome',
                    },
                    leave: {
                        channelId: 'leave-channel',
                        message: 'Bye',
                        enabled: true,
                    },
                },
                reactionroles: {
                    messages: [{ id: 'rr-message-1' }],
                    exclusiveRoles: [
                        {
                            roleId: 'role-a',
                            excludedRoleId: 'role-b',
                        },
                    ],
                },
                commandaccess: {
                    grants: [
                        {
                            roleId: 'role-admin',
                            module: 'automation',
                            mode: 'manage',
                        },
                    ],
                },
            } as any,
            plan: buildPlan([
                'onboarding',
                'moderation',
                'automessages',
                'reactionroles',
                'commandaccess',
                'parity',
            ]) as any,
            allowProtected: false,
        })

        expect(guild.editOnboarding).toHaveBeenCalled()
        expect(autoMessagesExecutorCaptureMock).toHaveBeenCalledWith({
            guildId: 'guild-1',
        })
        expect(autoMessagesExecutorDiffMock).toHaveBeenCalled()
        expect(autoMessagesExecutorApplyMock).toHaveBeenCalled()
        expect(reactionRolesExecutorCaptureMock).toHaveBeenCalledWith({
            guildId: 'guild-1',
        })
        expect(reactionRolesExecutorDiffMock).toHaveBeenCalled()
        expect(reactionRolesExecutorApplyMock).toHaveBeenCalled()
        expect(replaceRoleGrantsMock).toHaveBeenCalledWith('guild-1', [
            {
                roleId: 'role-admin',
                module: 'automation',
                mode: 'manage',
            },
        ])
        expect(result.appliedModules).toEqual([
            'onboarding',
            'moderation',
            'automessages',
            'reactionroles',
            'commandaccess',
        ])
        expect(result.skippedModules).toEqual([
            'reactionroles.messages requires manual message-template publish',
            'parity requires checklist/cutover workflow',
        ])
    })

    it('logs and swallows expected channel deletion errors in protected mode', async () => {
        const deleteRoleMock = jest.fn().mockResolvedValue(undefined)
        const deleteChannelMock = jest.fn().mockRejectedValue({ status: 403 })
        const guild = createGuild({
            roles: {
                cache: new Map([
                    ['guild-1', { id: 'guild-1', editable: false }],
                    [
                        'legacy-role',
                        {
                            id: 'legacy-role',
                            editable: true,
                            delete: deleteRoleMock,
                        },
                    ],
                ]),
                create: jest.fn().mockResolvedValue(undefined),
            },
            channels: {
                cache: new Map([
                    [
                        'old-channel',
                        {
                            id: 'old-channel',
                            name: 'old-channel',
                            delete: deleteChannelMock,
                        },
                    ],
                ]),
                create: jest.fn().mockResolvedValue(undefined),
            },
        })

        const result = await applyAutomationModules({
            guild: guild as any,
            desired: {
                roles: {
                    roles: [],
                    channels: [],
                },
            } as any,
            plan: buildPlan(['roles']) as any,
            allowProtected: true,
        })

        expect(deleteRoleMock).toHaveBeenCalled()
        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message:
                    'Failed to delete channel during guild automation apply',
                data: expect.objectContaining({
                    guildId: 'guild-1',
                    channelId: 'old-channel',
                }),
            }),
        )
        expect(result.appliedModules).toEqual(['roles'])
    })

    it('rethrows unexpected channel deletion errors', async () => {
        const guild = createGuild({
            channels: {
                cache: new Map([
                    [
                        'channel-x',
                        {
                            id: 'channel-x',
                            name: 'channel-x',
                            delete: jest
                                .fn()
                                .mockRejectedValue(new Error('boom')),
                        },
                    ],
                ]),
                create: jest.fn().mockResolvedValue(undefined),
            },
        })

        await expect(
            applyAutomationModules({
                guild: guild as any,
                desired: {
                    roles: {
                        roles: [],
                        channels: [],
                    },
                } as any,
                plan: buildPlan(['roles']) as any,
                allowProtected: true,
            }),
        ).rejects.toThrow('boom')
    })

    it('maps channel type variants and handles missing permissions as undefined', async () => {
        const roleCreateMock = jest.fn().mockResolvedValue(undefined)
        const channelCreateMock = jest.fn().mockResolvedValue(undefined)
        const guild = createGuild({
            roles: {
                cache: new Map([
                    ['guild-1', { id: 'guild-1', editable: false }],
                ]),
                create: roleCreateMock,
            },
            channels: {
                cache: new Map(),
                create: channelCreateMock,
            },
        })

        await applyAutomationModules({
            guild: guild as any,
            desired: {
                roles: {
                    roles: [
                        {
                            id: 'new-role-no-perms',
                            name: 'No Permissions',
                            color: 0x000000,
                            hoist: false,
                            mentionable: false,
                        },
                    ],
                    channels: [
                        {
                            id: 'voice-channel',
                            name: 'voice',
                            type: 'GuildVoice',
                            parentId: null,
                            topic: null,
                        },
                        {
                            id: 'forum-channel',
                            name: 'forum',
                            type: 'GuildForum',
                            parentId: null,
                            topic: null,
                        },
                        {
                            id: 'stage-channel',
                            name: 'stage',
                            type: 'GuildStageVoice',
                            parentId: null,
                            topic: null,
                        },
                        {
                            id: 'unknown-channel',
                            name: 'unknown',
                            type: 'UnexpectedType',
                            parentId: null,
                            topic: null,
                        },
                    ],
                },
            } as any,
            plan: buildPlan(['roles']) as any,
            allowProtected: false,
        })

        expect(roleCreateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'No Permissions',
                permissions: undefined,
            }),
        )
        expect(channelCreateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'voice',
                type: ChannelType.GuildVoice,
            }),
        )
        expect(channelCreateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'forum',
                type: ChannelType.GuildForum,
            }),
        )
        expect(channelCreateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'stage',
                type: ChannelType.GuildStageVoice,
            }),
        )
        expect(channelCreateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'unknown',
                type: ChannelType.GuildText,
            }),
        )
    })

    it('skips desired channels in protected cleanup and rethrows non-object delete errors', async () => {
        const keepDeleteMock = jest.fn()
        const staleDeleteMock = jest.fn().mockRejectedValue('delete-failed')
        const guild = createGuild({
            roles: {
                cache: new Map([
                    ['guild-1', { id: 'guild-1', editable: false }],
                ]),
                create: jest.fn().mockResolvedValue(undefined),
            },
            channels: {
                cache: new Map([
                    [
                        'keep-channel',
                        {
                            id: 'keep-channel',
                            edit: jest.fn().mockResolvedValue(undefined),
                            delete: keepDeleteMock,
                        },
                    ],
                    [
                        'stale-channel',
                        {
                            id: 'stale-channel',
                            delete: staleDeleteMock,
                        },
                    ],
                ]),
                create: jest.fn().mockResolvedValue(undefined),
            },
        })

        await expect(
            applyAutomationModules({
                guild: guild as any,
                desired: {
                    roles: {
                        roles: [],
                        channels: [
                            {
                                id: 'keep-channel',
                                name: 'keep-channel',
                                type: 'GuildText',
                                parentId: null,
                                topic: null,
                            },
                        ],
                    },
                } as any,
                plan: buildPlan(['roles']) as any,
                allowProtected: true,
            }),
        ).rejects.toBe('delete-failed')

        expect(keepDeleteMock).not.toHaveBeenCalled()
        expect(staleDeleteMock).toHaveBeenCalled()
    })

    it('reconciles role and channel create/edit operations without protected deletes', async () => {
        const existingRoleEditMock = jest.fn().mockResolvedValue(undefined)
        const existingChannelEditMock = jest.fn().mockResolvedValue(undefined)
        const roleCreateMock = jest.fn().mockResolvedValue(undefined)
        const channelCreateMock = jest.fn().mockResolvedValue(undefined)

        const guild = createGuild({
            roles: {
                cache: new Map([
                    ['guild-1', { id: 'guild-1', editable: false }],
                    [
                        'existing-role',
                        {
                            id: 'existing-role',
                            editable: true,
                            edit: existingRoleEditMock,
                            delete: jest.fn(),
                        },
                    ],
                    [
                        'legacy-role',
                        {
                            id: 'legacy-role',
                            editable: true,
                            delete: jest.fn(),
                        },
                    ],
                ]),
                create: roleCreateMock,
            },
            channels: {
                cache: new Map([
                    [
                        'existing-channel',
                        {
                            id: 'existing-channel',
                            edit: existingChannelEditMock,
                            delete: jest.fn(),
                        },
                    ],
                    [
                        'legacy-channel',
                        {
                            id: 'legacy-channel',
                            delete: jest.fn(),
                        },
                    ],
                ]),
                create: channelCreateMock,
            },
        })

        const result = await applyAutomationModules({
            guild: guild as any,
            desired: {
                roles: {
                    roles: [
                        {
                            id: 'new-role',
                            name: 'New Role',
                            color: 0xff00ff,
                            hoist: true,
                            mentionable: false,
                            permissions: '8',
                        },
                        {
                            id: 'existing-role',
                            name: 'Existing Role',
                            color: 0x00ff00,
                            hoist: false,
                            mentionable: true,
                            permissions: '0',
                        },
                    ],
                    channels: [
                        {
                            id: 'new-channel',
                            name: 'news',
                            type: 'GuildAnnouncement',
                            parentId: null,
                            topic: 'updates',
                        },
                        {
                            id: 'existing-channel',
                            name: 'general',
                            type: 'GuildText',
                            parentId: null,
                            topic: 'chat',
                        },
                    ],
                },
            } as any,
            plan: buildPlan(['roles']) as any,
            allowProtected: false,
        })

        expect(roleCreateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'New Role',
                permissions: BigInt(8),
            }),
        )
        expect(existingRoleEditMock).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Existing Role',
                permissions: BigInt(0),
            }),
        )
        expect(channelCreateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'news',
                type: ChannelType.GuildAnnouncement,
            }),
        )
        expect(existingChannelEditMock).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'general',
                topic: 'chat',
            }),
        )
        expect(result.appliedModules).toEqual(['roles'])
    })

    it('skips auto-message upsert when payload message is missing', async () => {
        const guild = createGuild()

        const result = await applyAutomationModules({
            guild: guild as any,
            desired: {
                automessages: {
                    welcome: {
                        channelId: 'welcome-channel',
                    },
                    leave: {
                        enabled: true,
                    },
                },
            } as any,
            plan: buildPlan(['automessages']) as any,
            allowProtected: false,
        })

        expect(getWelcomeMessageMock).not.toHaveBeenCalled()
        expect(getLeaveMessageMock).not.toHaveBeenCalled()
        expect(createMessageMock).not.toHaveBeenCalled()
        expect(updateMessageMock).not.toHaveBeenCalled()
        expect(result.appliedModules).toEqual(['automessages'])
    })

    it('does not apply onboarding module when mapper returns no payload', async () => {
        const guild = createGuild()
        manifestOnboardingToDiscordEditMock.mockReturnValue(undefined)

        const result = await applyAutomationModules({
            guild: guild as any,
            desired: {
                onboarding: {
                    enabled: true,
                    mode: 1,
                    defaultChannelIds: [],
                    prompts: [],
                },
            } as any,
            plan: buildPlan(['onboarding']) as any,
            allowProtected: false,
        })

        expect(guild.editOnboarding).not.toHaveBeenCalled()
        expect(result.appliedModules).toEqual([])
    })

    it('logs warnLog when automessages executor returns partial status', async () => {
        const guild = createGuild()
        autoMessagesExecutorApplyMock.mockResolvedValue({
            status: 'partial',
            applied: [],
            errors: [
                {
                    opIndex: 0,
                    opKind: 'update',
                    reason: 'Message not found',
                },
            ],
        })

        const result = await applyAutomationModules({
            guild: guild as any,
            desired: {
                automessages: {
                    welcome: {
                        channelId: 'welcome-channel',
                        message: 'Welcome',
                    },
                },
            } as any,
            plan: buildPlan(['automessages']) as any,
            allowProtected: false,
        })

        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'AutoMessages executor apply: partial',
                data: expect.objectContaining({
                    guildId: 'guild-1',
                    errors: expect.arrayContaining([
                        expect.objectContaining({
                            opIndex: 0,
                            opKind: 'update',
                            reason: 'Message not found',
                        }),
                    ]),
                }),
            }),
        )
        expect(result.appliedModules).toEqual(['automessages'])
    })

    it('logs warnLog when automessages executor returns failed status', async () => {
        const guild = createGuild()
        autoMessagesExecutorApplyMock.mockResolvedValue({
            status: 'failed',
            error: 'Guild not found',
        })

        const result = await applyAutomationModules({
            guild: guild as any,
            desired: {
                automessages: {
                    welcome: {
                        channelId: 'welcome-channel',
                        message: 'Welcome',
                    },
                },
            } as any,
            plan: buildPlan(['automessages']) as any,
            allowProtected: false,
        })

        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'AutoMessages executor apply: failed',
                data: expect.objectContaining({
                    guildId: 'guild-1',
                    errors: 'Guild not found',
                }),
            }),
        )
        expect(result.appliedModules).toEqual(['automessages'])
    })
})
