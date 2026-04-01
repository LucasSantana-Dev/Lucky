import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import guildconfigCommand from './guildconfig'

const captureGuildAutomationStateMock = jest.fn()
const createPlanMock = jest.fn()
const getManifestMock = jest.fn()
const getStatusMock = jest.fn()
const listRunsMock = jest.fn()
const recordCaptureMock = jest.fn()
const runCutoverMock = jest.fn()
const updateRunStatusMock = jest.fn()
const applyAutomationModulesMock = jest.fn()
const interactionReplyMock = jest.fn()

jest.mock('../../../utils/guildAutomation/captureGuildState', () => ({
    captureGuildAutomationState: (...args: unknown[]) =>
        captureGuildAutomationStateMock(...args),
}))

jest.mock('../../../utils/guildAutomation/applyPlan', () => ({
    applyAutomationModules: (...args: unknown[]) =>
        applyAutomationModulesMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    guildAutomationService: {
        createPlan: (...args: unknown[]) => createPlanMock(...args),
        getManifest: (...args: unknown[]) => getManifestMock(...args),
        getStatus: (...args: unknown[]) => getStatusMock(...args),
        listRuns: (...args: unknown[]) => listRunsMock(...args),
        recordCapture: (...args: unknown[]) => recordCaptureMock(...args),
        runCutover: (...args: unknown[]) => runCutoverMock(...args),
        updateRunStatus: (...args: unknown[]) => updateRunStatusMock(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

function createInteraction(
    subcommand: string,
    options: Record<string, unknown> = {},
) {
    return {
        guild: {
            id: '123456789012345678',
            name: 'Criativaria',
            editOnboarding: jest.fn(),
        },
        client: {
            user: {
                id: '999999999999999999',
            },
        },
        user: {
            id: '888888888888888888',
        },
        options: {
            getSubcommand: jest.fn(() => subcommand),
            getBoolean: jest.fn((name: string) => options[name] ?? null),
        },
        reply: jest.fn().mockResolvedValue(undefined),
        deferReply: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined),
        replied: false,
        deferred: true,
    } as any
}

describe('guildconfig command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        captureGuildAutomationStateMock.mockResolvedValue({
            version: 1,
            guild: { id: '123456789012345678', name: 'Criativaria' },
            source: 'discord-capture',
        })
        createPlanMock.mockResolvedValue({
            runId: 'run-1',
            desired: {
                version: 1,
                guild: { id: '123456789012345678', name: 'Criativaria' },
                source: 'manual',
            },
            plan: {
                operations: [],
                protectedOperations: [],
                summary: {
                    total: 0,
                    safe: 0,
                    protected: 0,
                },
            },
        })
        getStatusMock.mockResolvedValue({
            manifest: {
                guildId: '123456789012345678',
                version: 1,
                updatedAt: new Date(),
                lastCapturedAt: new Date(),
            },
            latestRun: {
                id: 'run-1',
                type: 'plan',
                status: 'completed',
                createdAt: new Date(),
            },
            drifts: [],
        })
        listRunsMock.mockResolvedValue([])
        recordCaptureMock.mockResolvedValue({ runId: 'run-capture' })
        getManifestMock.mockResolvedValue(null)
        runCutoverMock.mockResolvedValue({
            runId: 'run-cutover',
            status: 'completed',
            checklistComplete: true,
        })
        updateRunStatusMock.mockResolvedValue(undefined)
        applyAutomationModulesMock.mockResolvedValue({
            appliedModules: ['onboarding'],
            skippedModules: [],
        })
    })

    it('exposes required subcommands', () => {
        const names = guildconfigCommand.data.options.map(
            (option: any) => option.name,
        )

        expect(names).toEqual(
            expect.arrayContaining([
                'capture',
                'plan',
                'apply',
                'reconcile',
                'status',
                'cutover',
            ]),
        )
    })

    it('captures guild state on capture subcommand', async () => {
        const interaction = createInteraction('capture')

        await guildconfigCommand.execute({ interaction } as any)

        expect(captureGuildAutomationStateMock).toHaveBeenCalled()
        expect(recordCaptureMock).toHaveBeenCalledWith(
            '123456789012345678',
            expect.any(Object),
            '888888888888888888',
        )
        expect(interaction.editReply).toHaveBeenCalled()
    })

    it('rejects execution outside guild context', async () => {
        const interaction = createInteraction('capture')
        interaction.guild = null

        await guildconfigCommand.execute({ interaction } as any)

        expect(interaction.deferReply).not.toHaveBeenCalled()
        expect(interaction.reply).toHaveBeenCalledWith({
            content: '❌ This command can only be used in a server.',
            ephemeral: true,
        })
    })

    it('builds plan from current capture', async () => {
        const interaction = createInteraction('plan')

        await guildconfigCommand.execute({ interaction } as any)

        expect(createPlanMock).toHaveBeenCalledWith('123456789012345678', {
            actualState: expect.any(Object),
            initiatedBy: '888888888888888888',
            runType: 'plan',
        })
    })

    it('applies modules for apply subcommand when no protected ops', async () => {
        const interaction = createInteraction('apply', {
            allow_protected: false,
        })

        await guildconfigCommand.execute({ interaction } as any)

        expect(applyAutomationModulesMock).toHaveBeenCalled()
        expect(updateRunStatusMock).toHaveBeenCalledWith(
            expect.objectContaining({
                runId: 'run-1',
                status: 'completed',
            }),
        )
    })

    it('blocks apply when protected operations exist and allow_protected is false', async () => {
        const interaction = createInteraction('apply', {
            allow_protected: false,
        })
        createPlanMock.mockResolvedValue({
            runId: 'run-protected',
            desired: {
                version: 1,
                guild: { id: '123456789012345678', name: 'Criativaria' },
                source: 'manual',
            },
            plan: {
                operations: [],
                protectedOperations: [{ module: 'roles' }],
                summary: {
                    total: 1,
                    safe: 0,
                    protected: 1,
                },
            },
        })

        await guildconfigCommand.execute({ interaction } as any)

        expect(applyAutomationModulesMock).not.toHaveBeenCalled()
        expect(updateRunStatusMock).toHaveBeenCalledWith(
            expect.objectContaining({
                runId: 'run-protected',
                status: 'blocked',
            }),
        )
    })

    it('returns status summary with latest runs and drifts', async () => {
        const interaction = createInteraction('status')
        listRunsMock.mockResolvedValue([
            { type: 'plan', status: 'completed' },
            { type: 'apply', status: 'blocked' },
        ])
        getStatusMock.mockResolvedValue({
            manifest: {
                version: 2,
            },
            latestRun: {
                type: 'apply',
                status: 'blocked',
            },
            drifts: [{ module: 'roles', severity: 'high' }],
        })

        await guildconfigCommand.execute({ interaction } as any)

        expect(getStatusMock).toHaveBeenCalledWith('123456789012345678')
        expect(listRunsMock).toHaveBeenCalledWith('123456789012345678', 5)
        expect(interaction.editReply).toHaveBeenCalled()
    })

    it('runs cutover cleanup for legacy external bots when completed', async () => {
        const interaction = createInteraction('cutover')
        const removeRolesMock = jest.fn().mockResolvedValue(undefined)
        interaction.guild.members = {
            cache: new Map([
                [
                    'legacy-bot',
                    {
                        roles: {
                            cache: new Map([
                                [
                                    '123456789012345678',
                                    { id: '123456789012345678' },
                                ],
                                ['legacy-role', { id: 'legacy-role' }],
                            ]),
                            remove: removeRolesMock,
                        },
                    },
                ],
            ]),
        }

        runCutoverMock.mockResolvedValue({
            runId: 'run-cutover-complete',
            status: 'completed',
            checklistComplete: true,
        })
        getManifestMock.mockResolvedValue({
            manifest: {
                parity: {
                    externalBots: [{ id: 'legacy-bot' }],
                },
            },
        })

        await guildconfigCommand.execute({ interaction } as any)

        expect(getManifestMock).toHaveBeenCalledWith('123456789012345678')
        expect(removeRolesMock).toHaveBeenCalledWith(
            ['legacy-role'],
            'Lucky cutover removed legacy bot permissions',
        )
    })

    it('skips missing members and members without removable roles during cutover cleanup', async () => {
        const interaction = createInteraction('cutover')
        const removeRolesMock = jest.fn().mockResolvedValue(undefined)

        interaction.guild.members = {
            cache: new Map([
                [
                    'legacy-bot-no-removable',
                    {
                        roles: {
                            cache: new Map([
                                [
                                    '123456789012345678',
                                    { id: '123456789012345678' },
                                ],
                            ]),
                            remove: removeRolesMock,
                        },
                    },
                ],
            ]),
        }

        runCutoverMock.mockResolvedValue({
            runId: 'run-cutover-complete',
            status: 'completed',
            checklistComplete: true,
        })
        getManifestMock.mockResolvedValue({
            manifest: {
                parity: {
                    externalBots: [
                        { id: 'legacy-bot-missing' },
                        { id: 'legacy-bot-no-removable' },
                    ],
                },
            },
        })

        await guildconfigCommand.execute({ interaction } as any)

        expect(getManifestMock).toHaveBeenCalledWith('123456789012345678')
        expect(removeRolesMock).not.toHaveBeenCalled()
    })

    it('skips legacy bot cleanup when cutover is blocked', async () => {
        const interaction = createInteraction('cutover')

        runCutoverMock.mockResolvedValue({
            runId: 'run-cutover-blocked',
            status: 'blocked',
            checklistComplete: false,
        })

        await guildconfigCommand.execute({ interaction } as any)

        expect(getManifestMock).not.toHaveBeenCalled()
    })

    it('replies with command failure message when execution throws', async () => {
        const interaction = createInteraction('plan')
        createPlanMock.mockRejectedValue(new Error('plan failed'))

        await guildconfigCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    content: '❌ plan failed',
                    ephemeral: true,
                }),
            }),
        )
    })
})
