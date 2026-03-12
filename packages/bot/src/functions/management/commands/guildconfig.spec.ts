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

function createMember(roleIds: string[]) {
    const remove = jest.fn().mockResolvedValue(undefined)

    return {
        roles: {
            cache: new Map(
                roleIds.map((roleId) => [
                    roleId,
                    {
                        id: roleId,
                    },
                ]),
            ),
            remove,
        },
    }
}

function createInteraction(
    subcommand: string,
    options: Record<string, unknown> = {},
    guildOverrides: Record<string, unknown> = {},
) {
    const guild = {
        id: '123456789012345678',
        name: 'Criativaria',
        editOnboarding: jest.fn(),
        members: {
            cache: new Map(),
        },
        ...guildOverrides,
    }

    return {
        guild,
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
        getManifestMock.mockResolvedValue(null)
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
        const names = guildconfigCommand.data.options.map((option: any) => option.name)

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
        const interaction = createInteraction('apply', { allow_protected: false })

        await guildconfigCommand.execute({ interaction } as any)

        expect(applyAutomationModulesMock).toHaveBeenCalled()
        expect(updateRunStatusMock).toHaveBeenCalledWith(
            expect.objectContaining({
                runId: 'run-1',
                status: 'completed',
            }),
        )
    })

    it('marks run as blocked when protected operations require opt-in', async () => {
        createPlanMock.mockResolvedValueOnce({
            runId: 'run-protected',
            desired: {
                version: 1,
                guild: { id: '123456789012345678', name: 'Criativaria' },
                source: 'manual',
            },
            plan: {
                operations: [{ module: 'roles' }],
                protectedOperations: [{ module: 'roles' }],
                summary: {
                    total: 1,
                    safe: 0,
                    protected: 1,
                },
            },
        })
        const interaction = createInteraction('apply', { allow_protected: false })

        await guildconfigCommand.execute({ interaction } as any)

        expect(updateRunStatusMock).toHaveBeenCalledWith(
            expect.objectContaining({
                runId: 'run-protected',
                status: 'blocked',
            }),
        )
        expect(applyAutomationModulesMock).not.toHaveBeenCalled()
    })

    it('marks run as failed when apply throws', async () => {
        applyAutomationModulesMock.mockRejectedValueOnce(new Error('apply failed'))
        const interaction = createInteraction('apply', { allow_protected: true })

        await guildconfigCommand.execute({ interaction } as any)

        expect(updateRunStatusMock).toHaveBeenCalledWith(
            expect.objectContaining({
                runId: 'run-1',
                status: 'failed',
                error: 'apply failed',
            }),
        )
    })

    it('uses fallback error message when apply throws non-Error value', async () => {
        applyAutomationModulesMock.mockRejectedValueOnce('failed')
        const interaction = createInteraction('apply', { allow_protected: true })

        await guildconfigCommand.execute({ interaction } as any)

        expect(updateRunStatusMock).toHaveBeenCalledWith(
            expect.objectContaining({
                runId: 'run-1',
                status: 'failed',
                error: 'Failed to execute guild automation command.',
            }),
        )
    })

    it('loads status subcommand data and renders response', async () => {
        const interaction = createInteraction('status')

        await guildconfigCommand.execute({ interaction } as any)

        expect(getStatusMock).toHaveBeenCalledWith('123456789012345678')
        expect(listRunsMock).toHaveBeenCalledWith('123456789012345678', 5)
        expect(interaction.editReply).toHaveBeenCalled()
    })

    it('cleans roles only for bots flagged to retire on cutover', async () => {
        const cleanupTarget = createMember(['123456789012345678', 'role-1'])
        const untouchedBot = createMember(['123456789012345678', 'role-2'])

        const interaction = createInteraction(
            'cutover',
            { complete_checklist: true },
            {
                members: {
                    cache: new Map([
                        ['bot-1', cleanupTarget],
                        ['bot-2', untouchedBot],
                    ]),
                },
            },
        )

        getManifestMock.mockResolvedValueOnce({
            manifest: {
                parity: {
                    externalBots: [
                        { id: 'bot-1', retireOnCutover: true },
                        { id: 'bot-2', retireOnCutover: false },
                    ],
                },
            },
        })

        await guildconfigCommand.execute({ interaction } as any)

        expect(cleanupTarget.roles.remove).toHaveBeenCalledWith(
            ['role-1'],
            'Lucky cutover removed legacy bot permissions',
        )
        expect(untouchedBot.roles.remove).not.toHaveBeenCalled()
    })

    it('skips cutover cleanup when bot member is missing or has only @everyone role', async () => {
        const onlyEveryoneMember = createMember(['123456789012345678'])
        const interaction = createInteraction(
            'cutover',
            { complete_checklist: true },
            {
                members: {
                    cache: new Map([['bot-2', onlyEveryoneMember]]),
                },
            },
        )

        getManifestMock.mockResolvedValueOnce({
            manifest: {
                parity: {
                    externalBots: [
                        { id: 'bot-1', retireOnCutover: true },
                        { id: 'bot-2', retireOnCutover: true },
                    ],
                },
            },
        })

        await guildconfigCommand.execute({ interaction } as any)

        expect(onlyEveryoneMember.roles.remove).not.toHaveBeenCalled()
    })

    it('returns server-only error when interaction has no guild', async () => {
        const interaction = createInteraction('plan')
        interaction.guild = null

        await guildconfigCommand.execute({ interaction } as any)

        expect(interaction.editReply).toHaveBeenCalledWith({
            content: '❌ This command can only be used in a server.',
        })
    })
})
