import { beforeEach, describe, expect, it, jest } from '@jest/globals'

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
        getWelcomeMessage: (...args: unknown[]) => getWelcomeMessageMock(...args),
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
        replaceRoleGrants: (...args: unknown[]) => replaceRoleGrantsMock(...args),
    },
    roleManagementService: {
        listExclusiveRoles: (...args: unknown[]) => listExclusiveRolesMock(...args),
        removeExclusiveRole: (...args: unknown[]) => removeExclusiveRoleMock(...args),
        setExclusiveRole: (...args: unknown[]) => setExclusiveRoleMock(...args),
    },
    updateModerationSettings: (...args: unknown[]) =>
        updateModerationSettingsMock(...args),
}))

const errorLogMock = jest.fn()
jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
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
        expect(updateSettingsMock).toHaveBeenCalledWith('guild-1', {
            enabled: true,
            spamThreshold: 5,
        })
        expect(updateModerationSettingsMock).toHaveBeenCalledWith('guild-1', {
            requireReason: true,
        })
        expect(createMessageMock).toHaveBeenCalledTimes(1)
        expect(updateMessageMock).toHaveBeenCalledTimes(1)
        expect(removeExclusiveRoleMock).toHaveBeenCalledWith(
            'guild-1',
            'legacy-role',
            'legacy-excluded',
        )
        expect(setExclusiveRoleMock).toHaveBeenCalledWith(
            'guild-1',
            'role-a',
            'role-b',
        )
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
                    ['legacy-role', { id: 'legacy-role', editable: true, delete: deleteRoleMock }],
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
                message: 'Failed to delete channel during guild automation apply',
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
                            delete: jest.fn().mockRejectedValue(new Error('boom')),
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
})
