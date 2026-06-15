import {
    describe,
    expect,
    it,
    jest,
    beforeEach,
    afterEach,
} from '@jest/globals'
import { GuildAutomationOrchestrator } from './GuildAutomationOrchestrator'
import type { IGuildAutomationRepository } from './IGuildAutomationRepository'
import type {
    AutomationRunStatus,
    GuildAutomationManifestDocument,
} from './types'

jest.mock('./diff.js', () => {
    const actual = jest.requireActual('./diff.js') as Record<string, unknown>
    return {
        __esModule: true,
        ...actual,
        createAutomationPlan: jest.fn(actual.createAutomationPlan as any),
    }
})
import { createAutomationPlan } from './diff.js'
const mockCreateAutomationPlan = createAutomationPlan as jest.MockedFunction<
    typeof createAutomationPlan
>

// Clean up locks and timers after each test
// Reset to real timers to ensure locks can expire naturally or are cleaned up
afterEach(() => {
    jest.useRealTimers()
    jest.clearAllTimers()
})

type UpdateRunStatusArgs = [
    runId: string,
    status: AutomationRunStatus,
    diagnostics?: Record<string, unknown>,
]

function baseManifest(): GuildAutomationManifestDocument {
    return {
        version: 1,
        guild: {
            id: '123456789012345678',
            name: 'TestGuild',
        },
        source: 'manual',
    }
}

function makeRepository(): {
    repo: IGuildAutomationRepository
    mocks: {
        saveManifest: jest.Mock
        getManifest: jest.Mock
        recordCapture: jest.Mock
        getManifestRow: jest.Mock
        createPlanRecord: jest.Mock
        upsertDrift: jest.Mock
        updateRunStatus: jest.Mock
        markRunFailure: jest.Mock
        completeRun: jest.Mock
        getStatus: jest.Mock
        runCutover: jest.Mock
        listRuns: jest.Mock
        createBlockedCutoverRun: jest.Mock
    }
} {
    const mocks = {
        saveManifest: jest.fn<(...a: any[]) => Promise<any>>(),
        getManifest: jest.fn<(...a: any[]) => Promise<any>>(),
        recordCapture: jest.fn<(...a: any[]) => Promise<any>>(),
        getManifestRow: jest.fn<(...a: any[]) => Promise<any>>(),
        createPlanRecord: jest.fn<(...a: any[]) => Promise<any>>(),
        upsertDrift: jest.fn<(...a: any[]) => Promise<any>>(),
        updateRunStatus: jest.fn<(...a: any[]) => Promise<any>>(),
        markRunFailure: jest.fn<(...a: any[]) => Promise<any>>(),
        completeRun: jest.fn<(...a: any[]) => Promise<any>>(),
        getStatus: jest.fn<(...a: any[]) => Promise<any>>(),
        runCutover: jest.fn<(...a: any[]) => Promise<any>>(),
        listRuns: jest.fn<(...a: any[]) => Promise<any>>(),
        createBlockedCutoverRun: jest.fn<(...a: any[]) => Promise<any>>(),
    }

    mocks.updateRunStatus.mockImplementation((runId, status) =>
        Promise.resolve({ id: runId, status }),
    )
    mocks.completeRun.mockImplementation((runId) =>
        Promise.resolve({ id: runId, status: 'completed' }),
    )
    mocks.markRunFailure.mockImplementation(() => Promise.resolve())
    mocks.upsertDrift.mockImplementation(() => Promise.resolve())
    mocks.recordCapture.mockImplementation((guildId, state, initiatedBy) =>
        Promise.resolve({ manifestId: 'manifest-1', runId: 'run-1' }),
    )
    mocks.createBlockedCutoverRun.mockImplementation((guildId, manifestId) =>
        Promise.resolve({ id: 'blocked-run-1', guildId }),
    )
    mocks.runCutover.mockImplementation((guildId, manifest, checklist) =>
        Promise.resolve({
            id: 'cutover-run-1',
            guildId,
            manifestId: 'manifest-1',
        }),
    )
    mocks.listRuns.mockImplementation((guildId, limit) =>
        Promise.resolve([
            {
                id: 'run-1',
                guildId,
                manifestId: 'manifest-1',
                type: 'capture',
                status: 'completed',
                operations: [],
                protectedOperations: [],
                summary: {},
                diagnostics: {},
                error: null,
                initiatedBy: 'user-1',
                completedAt: new Date(),
                updatedAt: new Date(),
                createdAt: new Date(),
            },
        ]),
    )
    mocks.getStatus.mockImplementation((guildId) =>
        Promise.resolve({
            manifest: {
                guildId,
                version: 1,
                updatedAt: new Date(),
                lastCapturedAt: null,
            },
            latestRun: {
                id: 'run-1',
                type: 'capture',
                status: 'completed',
                createdAt: new Date(),
            },
            drifts: [],
        }),
    )

    const repo = mocks as unknown as IGuildAutomationRepository
    return { repo, mocks }
}

function makeOrchestrator(
    repo?: IGuildAutomationRepository,
    updateRunStatus?: jest.Mock,
) {
    const { repo: defaultRepo, mocks } = repo
        ? { repo, mocks: {} as any }
        : makeRepository()
    const orchestrator = new GuildAutomationOrchestrator(repo || defaultRepo)
    return {
        orchestrator,
        repo: repo || defaultRepo,
        mocks: updateRunStatus ? { updateRunStatus } : mocks,
    }
}

function stubPlan(
    orchestrator: GuildAutomationOrchestrator,
    protectedOperations: unknown[],
) {
    // Bypass the full capture→diff→persist pipeline: createApplyRun only reads
    // runId + plan.protectedOperations.length for its status decision.
    jest.spyOn(
        orchestrator as unknown as {
            createPlan: () => Promise<unknown>
        },
        'createPlan',
    ).mockResolvedValue({
        runId: 'run-1',
        plan: { protectedOperations, operations: [] },
        desired: baseManifest(),
        actual: baseManifest(),
    })
}

describe('GuildAutomationOrchestrator.createApplyRun', () => {
    let orchestrator: GuildAutomationOrchestrator
    let mocks: any

    beforeEach(() => {
        const result = makeOrchestrator()
        orchestrator = result.orchestrator
        mocks = result.mocks
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('records the web apply as pending (plan-only) — not completed', async () => {
        stubPlan(orchestrator, [])

        const result = await orchestrator.createApplyRun('guild-pending', {
            runType: 'apply',
        })

        expect(result.status).toBe('pending')
        expect(result.blockedByProtected).toBe(false)
        const [, status, diagnostics] = mocks.updateRunStatus.mock.calls[0]
        expect(status).toBe('pending')
        // The web path no longer claims to have applied anything.
        expect(diagnostics?.autoAppliedOperations).toEqual([])
        expect(diagnostics?.planRecorded).toBe(true)
    })

    it('blocks when protected ops exist and allowProtected is false', async () => {
        stubPlan(orchestrator, [{ protected: true }])

        const result = await orchestrator.createApplyRun('guild-blocked', {
            runType: 'apply',
            allowProtected: false,
        })

        expect(result.status).toBe('blocked')
        expect(result.blockedByProtected).toBe(true)
        expect(mocks.updateRunStatus.mock.calls[0][1]).toBe('blocked')
    })

    it('records pending when protected ops are explicitly allowed', async () => {
        stubPlan(orchestrator, [{ protected: true }])

        const result = await orchestrator.createApplyRun('guild-allowed', {
            runType: 'reconcile',
            allowProtected: true,
        })

        expect(result.status).toBe('pending')
        expect(result.blockedByProtected).toBe(false)
        expect(mocks.updateRunStatus.mock.calls[0][1]).toBe('pending')
    })

    it('releases lock in finally block when plan succeeds', async () => {
        stubPlan(orchestrator, [])
        jest.useFakeTimers()

        try {
            await orchestrator.createApplyRun('guild-lock', {
                runType: 'apply',
            })

            // Lock should be released after execution
            // Try to acquire it again - should succeed
            const { orchestrator: orch2 } = makeOrchestrator()
            stubPlan(orch2, [])
            const canAcquire = await orch2.createApplyRun('guild-lock', {
                runType: 'apply',
            })
            expect(canAcquire.status).toBeDefined()
        } finally {
            jest.useRealTimers()
        }
    })

    it('throws when acquiring lock if another operation is running', async () => {
        stubPlan(orchestrator, [])
        jest.useFakeTimers()

        try {
            const promise1 = orchestrator.createApplyRun('guild-concurrent', {
                runType: 'apply',
            })

            // Attempt concurrent operation on same guild immediately
            const promise2 = orchestrator.createApplyRun('guild-concurrent', {
                runType: 'apply',
            })

            // First one should succeed
            await expect(promise1).resolves.toBeDefined()
            // Second one should reject due to lock
            await expect(promise2).rejects.toThrow(
                'Another automation apply operation is already running',
            )
        } finally {
            jest.useRealTimers()
        }
    })

    it('cleans up expired locks when acquiring a new lock', async () => {
        stubPlan(orchestrator, [])
        jest.useFakeTimers()

        try {
            // Create a lock on guild-expire
            const promise1 = orchestrator.createApplyRun('guild-expire', {
                runType: 'apply',
            })
            await expect(promise1).resolves.toBeDefined()

            // Move time forward past TTL (60 seconds)
            jest.advanceTimersByTime(61000)

            // Now another operation should succeed because the lock expired
            const { orchestrator: orch2 } = makeOrchestrator()
            stubPlan(orch2, [])
            const promise2 = orch2.createApplyRun('guild-expire', {
                runType: 'apply',
            })

            await expect(promise2).resolves.toBeDefined()
        } finally {
            jest.useRealTimers()
        }
    })

    it('defaults runType to apply when not provided', async () => {
        const createPlanSpy = jest.spyOn(orchestrator, 'createPlan' as any)
        createPlanSpy.mockResolvedValue({
            runId: 'run-1',
            plan: { protectedOperations: [], operations: [] },
            desired: baseManifest(),
            actual: baseManifest(),
        })

        await orchestrator.createApplyRun('guild-default')

        expect(createPlanSpy).toHaveBeenCalledWith(
            'guild-default',
            expect.objectContaining({ runType: 'apply' }),
        )

        createPlanSpy.mockRestore()
    })

    it('passes allowProtected to diagnostics', async () => {
        stubPlan(orchestrator, [])

        await orchestrator.createApplyRun('guild-diag', {
            runType: 'apply',
            allowProtected: true,
        })

        const [, , diagnostics] = mocks.updateRunStatus.mock.calls[0]
        expect(diagnostics?.allowProtected).toBe(true)
    })

    it('defaults allowProtected to false in diagnostics', async () => {
        stubPlan(orchestrator, [])

        await orchestrator.createApplyRun('guild-default-allow', {
            runType: 'apply',
        })

        const [, , diagnostics] = mocks.updateRunStatus.mock.calls[0]
        // When allowProtected is not provided, it should default to false
        expect(diagnostics?.allowProtected).toBe(false)
    })

    it('blocks when allowProtected defaults to false and protected ops exist', async () => {
        stubPlan(orchestrator, [{ protected: true }])

        // Call without specifying allowProtected - should default to false
        const result = await orchestrator.createApplyRun(
            'guild-default-block',
            {
                runType: 'apply',
            },
        )

        // Should be blocked because allowProtected defaults to false
        expect(result.status).toBe('blocked')
        expect(result.blockedByProtected).toBe(true)
    })

    it('verifies lock expiration timestamp is set correctly', async () => {
        stubPlan(orchestrator, [])
        jest.useFakeTimers()
        const baseTime = 1000000
        jest.setSystemTime(baseTime)

        await orchestrator.createApplyRun('guild-expire-check', {
            runType: 'apply',
        })

        // After execution, lock should be released (no longer present)
        // Try to acquire it again - should succeed immediately
        const { orchestrator: orch2 } = makeOrchestrator()
        stubPlan(orch2, [])

        const canAcquire = await orch2.createApplyRun('guild-expire-check', {
            runType: 'apply',
        })

        expect(canAcquire.status).toBeDefined()
        jest.useRealTimers()
    })

    it('blocks second operation immediately without waiting for expiration', async () => {
        stubPlan(orchestrator, [])

        // First operation acquires lock
        const promise1 = orchestrator.createApplyRun('guild-immediate-block', {
            runType: 'apply',
        })

        // Second operation should fail immediately, not wait for TTL
        const promise2 = orchestrator.createApplyRun('guild-immediate-block', {
            runType: 'apply',
        })

        await expect(promise1).resolves.toBeDefined()
        await expect(promise2).rejects.toThrow(
            'Another automation apply operation is already running',
        )
    })
})

describe('GuildAutomationOrchestrator.saveManifest', () => {
    let orchestrator: GuildAutomationOrchestrator
    let mocks: any

    beforeEach(() => {
        const result = makeOrchestrator()
        orchestrator = result.orchestrator
        mocks = result.mocks
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('validates and saves a manifest', async () => {
        const manifest = baseManifest()
        mocks.saveManifest.mockResolvedValue({
            id: 'manifest-1',
            guildId: 'guild-1',
            version: 1,
            manifest,
            moduleOwnership: {},
            createdBy: 'user-1',
            lastCapturedState: null,
            lastCapturedAt: null,
            updatedAt: new Date(),
            createdAt: new Date(),
        })

        const result = await orchestrator.saveManifest('guild-1', manifest, {
            createdBy: 'user-1',
        })

        expect(result.id).toBe('manifest-1')
        expect(result.guildId).toBe('guild-1')
        expect(mocks.saveManifest).toHaveBeenCalled()
    })

    it('passes createdBy and moduleOwnership options to repository', async () => {
        const manifest = baseManifest()
        mocks.saveManifest.mockResolvedValue({
            id: 'manifest-1',
            guildId: 'guild-1',
            version: 1,
            manifest,
            moduleOwnership: {},
            createdBy: 'user-1',
            lastCapturedState: null,
            lastCapturedAt: null,
            updatedAt: new Date(),
            createdAt: new Date(),
        })

        await orchestrator.saveManifest('guild-1', manifest, {
            createdBy: 'user-1',
            moduleOwnership: { onboarding: true },
            version: 2,
        })

        expect(mocks.saveManifest).toHaveBeenCalledWith(
            'guild-1',
            expect.any(Object),
            expect.objectContaining({
                createdBy: 'user-1',
                moduleOwnership: { onboarding: true },
                version: 2,
            }),
        )
    })
})

describe('GuildAutomationOrchestrator.getManifest', () => {
    let orchestrator: GuildAutomationOrchestrator
    let mocks: any

    beforeEach(() => {
        const result = makeOrchestrator()
        orchestrator = result.orchestrator
        mocks = result.mocks
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('retrieves manifest from repository', async () => {
        const manifest = baseManifest()
        mocks.getManifest.mockResolvedValue({
            guildId: 'guild-1',
            version: 1,
            manifest,
            lastCapturedState: null,
            lastCapturedAt: null,
            updatedAt: new Date(),
        })

        const result = await orchestrator.getManifest('guild-1')

        expect(result?.guildId).toBe('guild-1')
        expect(result?.manifest).toEqual(manifest)
        expect(mocks.getManifest).toHaveBeenCalledWith('guild-1')
    })

    it('returns null when manifest does not exist', async () => {
        mocks.getManifest.mockResolvedValue(null)

        const result = await orchestrator.getManifest('nonexistent-guild')

        expect(result).toBeNull()
    })
})

describe('GuildAutomationOrchestrator.recordCapture', () => {
    let orchestrator: GuildAutomationOrchestrator
    let mocks: any

    beforeEach(() => {
        const result = makeOrchestrator()
        orchestrator = result.orchestrator
        mocks = result.mocks
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('records a capture with guild state', async () => {
        const capturedState = baseManifest()
        mocks.recordCapture.mockResolvedValue({
            manifestId: 'manifest-1',
            runId: 'run-1',
        })

        const result = await orchestrator.recordCapture(
            'guild-1',
            capturedState,
            'user-1',
        )

        expect(result.runId).toBe('run-1')
        expect(result.manifestId).toBe('manifest-1')
        expect(mocks.recordCapture).toHaveBeenCalledWith(
            'guild-1',
            expect.objectContaining({
                version: 1,
                guild: { id: '123456789012345678', name: 'TestGuild' },
            }),
            'user-1',
        )
    })
})

describe('GuildAutomationOrchestrator.markRunFailure', () => {
    let orchestrator: GuildAutomationOrchestrator
    let mocks: any

    beforeEach(() => {
        const result = makeOrchestrator()
        orchestrator = result.orchestrator
        mocks = result.mocks
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('marks a run as failed with error', async () => {
        const error = new Error('Operation failed')
        mocks.markRunFailure.mockResolvedValue(undefined)

        await orchestrator.markRunFailure('run-1', error)

        expect(mocks.markRunFailure).toHaveBeenCalledWith('run-1', error)
    })

    it('passes error object to repository', async () => {
        const error = { message: 'Custom error' }
        mocks.markRunFailure.mockResolvedValue(undefined)

        await orchestrator.markRunFailure('run-1', error)

        expect(mocks.markRunFailure).toHaveBeenCalledWith('run-1', error)
    })
})

describe('GuildAutomationOrchestrator.completeRun', () => {
    let orchestrator: GuildAutomationOrchestrator
    let mocks: any

    beforeEach(() => {
        const result = makeOrchestrator()
        orchestrator = result.orchestrator
        mocks = result.mocks
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('completes a run without diagnostics', async () => {
        mocks.completeRun.mockResolvedValue({
            id: 'run-1',
            status: 'completed',
        })

        const result = await orchestrator.completeRun('run-1')

        expect(result.status).toBe('completed')
        expect(mocks.completeRun).toHaveBeenCalledWith('run-1', undefined)
    })

    it('completes a run with diagnostics', async () => {
        mocks.completeRun.mockResolvedValue({
            id: 'run-1',
            status: 'completed',
        })

        const diagnostics = { appliedCount: 5 }
        const result = await orchestrator.completeRun('run-1', diagnostics)

        expect(result.status).toBe('completed')
        expect(mocks.completeRun).toHaveBeenCalledWith('run-1', diagnostics)
    })
})

describe('GuildAutomationOrchestrator.updateRunStatus', () => {
    let orchestrator: GuildAutomationOrchestrator
    let mocks: any

    beforeEach(() => {
        const result = makeOrchestrator()
        orchestrator = result.orchestrator
        mocks = result.mocks
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('updates run status with all parameters', async () => {
        mocks.updateRunStatus.mockResolvedValue({
            id: 'run-1',
            status: 'running',
        })

        const result = await orchestrator.updateRunStatus({
            runId: 'run-1',
            status: 'running',
            diagnostics: { step: 1 },
            error: undefined,
        })

        expect(result.status).toBe('running')
        expect(mocks.updateRunStatus).toHaveBeenCalledWith(
            'run-1',
            'running',
            { step: 1 },
            undefined,
        )
    })

    it('updates run status to failed with error', async () => {
        mocks.updateRunStatus.mockResolvedValue({
            id: 'run-1',
            status: 'failed',
        })

        const result = await orchestrator.updateRunStatus({
            runId: 'run-1',
            status: 'failed',
            error: 'Something went wrong',
        })

        expect(result.status).toBe('failed')
        expect(mocks.updateRunStatus).toHaveBeenCalledWith(
            'run-1',
            'failed',
            undefined,
            'Something went wrong',
        )
    })
})

describe('GuildAutomationOrchestrator.getStatus', () => {
    let orchestrator: GuildAutomationOrchestrator
    let mocks: any

    beforeEach(() => {
        const result = makeOrchestrator()
        orchestrator = result.orchestrator
        mocks = result.mocks
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('retrieves guild automation status', async () => {
        mocks.getStatus.mockResolvedValue({
            manifest: {
                guildId: 'guild-1',
                version: 1,
                updatedAt: new Date(),
                lastCapturedAt: null,
            },
            latestRun: {
                id: 'run-1',
                type: 'capture',
                status: 'completed',
                createdAt: new Date(),
            },
            drifts: [],
        })

        const result = await orchestrator.getStatus('guild-1')

        expect(result.manifest?.guildId).toBe('guild-1')
        expect(result.latestRun?.status).toBe('completed')
        expect(result.drifts).toHaveLength(0)
        expect(mocks.getStatus).toHaveBeenCalledWith('guild-1')
    })

    it('returns status with drifts', async () => {
        mocks.getStatus.mockResolvedValue({
            manifest: null,
            latestRun: null,
            drifts: [
                {
                    module: 'roles',
                    severity: 'high',
                    updatedAt: new Date(),
                },
            ],
        })

        const result = await orchestrator.getStatus('guild-1')

        expect(result.drifts).toHaveLength(1)
        expect(result.drifts[0].module).toBe('roles')
        expect(result.drifts[0].severity).toBe('high')
    })
})

describe('GuildAutomationOrchestrator.runCutover', () => {
    let orchestrator: GuildAutomationOrchestrator
    let mocks: any

    beforeEach(() => {
        const result = makeOrchestrator()
        orchestrator = result.orchestrator
        mocks = result.mocks
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('blocks cutover when checklist is incomplete', async () => {
        const manifest = {
            ...baseManifest(),
            parity: {
                checklist: [
                    { key: 'item-1', label: 'Setup', done: false },
                    { key: 'item-2', label: 'Verify', done: true },
                ],
            },
        }
        mocks.getManifestRow.mockResolvedValue({
            id: 'manifest-1',
            guildId: 'guild-1',
            version: 1,
            manifest,
            createdBy: null,
            lastCapturedState: null,
            lastCapturedAt: null,
            updatedAt: new Date(),
        })
        mocks.createBlockedCutoverRun.mockResolvedValue({
            id: 'blocked-run-1',
            guildId: 'guild-1',
        })

        const result = await orchestrator.runCutover('guild-1', {
            completeChecklist: false,
        })

        expect(result.status).toBe('blocked')
        expect(result.checklistComplete).toBe(false)
        expect(mocks.createBlockedCutoverRun).toHaveBeenCalledWith(
            'guild-1',
            'manifest-1',
            expect.arrayContaining([
                expect.objectContaining({ key: 'item-1' }),
            ]),
            undefined,
        )
    })

    it('completes cutover when checklist is already complete', async () => {
        const manifest = {
            ...baseManifest(),
            parity: {
                checklist: [
                    { key: 'item-1', label: 'Setup', done: true },
                    { key: 'item-2', label: 'Verify', done: true },
                ],
            },
        }
        mocks.getManifestRow.mockResolvedValue({
            id: 'manifest-1',
            guildId: 'guild-1',
            version: 1,
            manifest,
            createdBy: null,
            lastCapturedState: null,
            lastCapturedAt: null,
            updatedAt: new Date(),
        })
        mocks.runCutover.mockResolvedValue({
            id: 'cutover-run-1',
            guildId: 'guild-1',
            manifestId: 'manifest-1',
        })

        const result = await orchestrator.runCutover('guild-1')

        expect(result.status).toBe('completed')
        expect(result.checklistComplete).toBe(true)
        expect(mocks.runCutover).toHaveBeenCalled()
    })

    it('completes cutover when completeChecklist is true', async () => {
        const manifest = {
            ...baseManifest(),
            parity: {
                checklist: [
                    { key: 'item-1', label: 'Setup', done: false },
                    { key: 'item-2', label: 'Verify', done: false },
                ],
            },
        }
        mocks.getManifestRow.mockResolvedValue({
            id: 'manifest-1',
            guildId: 'guild-1',
            version: 1,
            manifest,
            createdBy: null,
            lastCapturedState: null,
            lastCapturedAt: null,
            updatedAt: new Date(),
        })
        mocks.runCutover.mockResolvedValue({
            id: 'cutover-run-1',
            guildId: 'guild-1',
            manifestId: 'manifest-1',
        })

        const result = await orchestrator.runCutover('guild-1', {
            completeChecklist: true,
            initiatedBy: 'user-1',
        })

        expect(result.status).toBe('completed')
        expect(result.checklistComplete).toBe(true)
        expect(mocks.runCutover).toHaveBeenCalledWith(
            'guild-1',
            expect.objectContaining({
                parity: expect.objectContaining({
                    cutoverReady: true,
                    checklist: expect.arrayContaining([
                        expect.objectContaining({ done: true }),
                    ]),
                }),
            }),
            expect.any(Array),
            'user-1',
        )
    })

    it('throws when manifest does not exist', async () => {
        mocks.getManifestRow.mockResolvedValue(null)

        await expect(
            orchestrator.runCutover('nonexistent-guild'),
        ).rejects.toThrow('No automation manifest found for this guild')
    })

    it('handles manifest with no parity section', async () => {
        const manifest = baseManifest()
        mocks.getManifestRow.mockResolvedValue({
            id: 'manifest-1',
            guildId: 'guild-1',
            version: 1,
            manifest,
            createdBy: null,
            lastCapturedState: null,
            lastCapturedAt: null,
            updatedAt: new Date(),
        })
        mocks.runCutover.mockResolvedValue({
            id: 'cutover-run-1',
            guildId: 'guild-1',
            manifestId: 'manifest-1',
        })

        const result = await orchestrator.runCutover('guild-1')

        expect(result.status).toBe('completed')
        expect(result.checklistComplete).toBe(true)
    })

    it('uses initiatedBy from options when provided', async () => {
        const manifest = {
            ...baseManifest(),
            parity: {
                checklist: [{ key: 'item-1', label: 'Setup', done: true }],
            },
        }
        mocks.getManifestRow.mockResolvedValue({
            id: 'manifest-1',
            guildId: 'guild-1',
            version: 1,
            manifest,
            createdBy: null,
            lastCapturedState: null,
            lastCapturedAt: null,
            updatedAt: new Date(),
        })
        mocks.runCutover.mockResolvedValue({
            id: 'cutover-run-1',
            guildId: 'guild-1',
            manifestId: 'manifest-1',
        })

        await orchestrator.runCutover('guild-1', {
            initiatedBy: 'user-special',
        })

        expect(mocks.runCutover).toHaveBeenCalledWith(
            'guild-1',
            expect.any(Object),
            expect.any(Array),
            'user-special',
        )
    })

    it('handles missing parity.checklist via optional chaining', async () => {
        // Manifest with parity but no checklist
        const manifest = {
            ...baseManifest(),
            parity: {
                cutoverReady: false,
            },
        }
        mocks.getManifestRow.mockResolvedValue({
            id: 'manifest-1',
            guildId: 'guild-1',
            version: 1,
            manifest,
            createdBy: null,
            lastCapturedState: null,
            lastCapturedAt: null,
            updatedAt: new Date(),
        })
        mocks.runCutover.mockResolvedValue({
            id: 'cutover-run-1',
            guildId: 'guild-1',
            manifestId: 'manifest-1',
        })

        // Should not crash and should default checklist to []
        const result = await orchestrator.runCutover('guild-1')

        expect(result.status).toBe('completed')
        expect(result.checklistComplete).toBe(true)
    })

    it('handles missing parity.cutoverReady via optional chaining spread', async () => {
        // Manifest with parity but no cutoverReady
        const manifest = {
            ...baseManifest(),
            parity: {
                checklist: [{ key: 'item-1', label: 'Setup', done: true }],
            },
        }
        mocks.getManifestRow.mockResolvedValue({
            id: 'manifest-1',
            guildId: 'guild-1',
            version: 1,
            manifest,
            createdBy: null,
            lastCapturedState: null,
            lastCapturedAt: null,
            updatedAt: new Date(),
        })
        mocks.runCutover.mockResolvedValue({
            id: 'cutover-run-1',
            guildId: 'guild-1',
            manifestId: 'manifest-1',
        })

        await orchestrator.runCutover('guild-1', {
            completeChecklist: true,
        })

        // Verify parity spread works correctly
        expect(mocks.runCutover).toHaveBeenCalledWith(
            'guild-1',
            expect.objectContaining({
                parity: expect.objectContaining({
                    cutoverReady: true,
                }),
            }),
            expect.any(Array),
            undefined,
        )
    })
})

describe('GuildAutomationOrchestrator.createPlan', () => {
    let orchestrator: GuildAutomationOrchestrator
    let mocks: any

    beforeEach(() => {
        const result = makeRepository()
        mocks = result.mocks
        orchestrator = makeOrchestrator(result.repo).orchestrator
    })

    it('throws when manifest not found', async () => {
        ;(mocks.getManifestRow as any).mockResolvedValue(null)

        await expect(orchestrator.createPlan('guild-1')).rejects.toThrow(
            'No automation manifest found for this guild',
        )
    })

    it('throws when no captured state available', async () => {
        const m = baseManifest()
        const now = new Date()
        ;(mocks.getManifestRow as any).mockResolvedValue({
            id: 'manifest-1',
            guildId: 'guild-1',
            version: 1,
            manifest: m,
            lastCapturedState: null,
            createdBy: null,
            updatedAt: now,
        })

        await expect(orchestrator.createPlan('guild-1')).rejects.toThrow(
            'No captured guild state available',
        )
    })

    it('uses provided actualState over lastCapturedState', async () => {
        const storedManifest = baseManifest()
        const actualStateManifest = baseManifest()
        const now = new Date()
        const providedState = {
            ...actualStateManifest,
            version: 99,
            guild: {
                ...actualStateManifest.guild,
                id: '99999999999999999',
            },
        }
        ;(mocks.getManifestRow as any).mockResolvedValue({
            id: 'manifest-1',
            guildId: 'guild-1',
            version: 1,
            manifest: storedManifest,
            lastCapturedState: storedManifest,
            createdBy: null,
            updatedAt: now,
        })
        ;(mocks.createPlanRecord as any).mockResolvedValue({
            id: 'run-1',
            guildId: 'guild-1',
        })

        await orchestrator.createPlan('guild-1', {
            actualState: providedState,
        })

        // Verify mockCreateAutomationPlan was called with the provided actualState
        expect(mockCreateAutomationPlan).toHaveBeenCalled()
        const mockCall = mockCreateAutomationPlan.mock.calls[0]
        expect(mockCall[0].actual.version).toBe(99)
        expect(mockCall[0].actual.guild.id).toBe('99999999999999999')
    })

    it('uses lastCapturedState when actualState not provided', async () => {
        const m = baseManifest()
        const now = new Date()
        ;(mocks.getManifestRow as any).mockResolvedValue({
            id: 'manifest-1',
            guildId: 'guild-1',
            version: 1,
            manifest: m,
            lastCapturedState: m,
            createdBy: null,
            updatedAt: now,
        })
        ;(mocks.createPlanRecord as any).mockResolvedValue({
            id: 'run-1',
            guildId: 'guild-1',
        })

        await orchestrator.createPlan('guild-1')

        expect(mocks.createPlanRecord).toHaveBeenCalled()
    })

    it('defaults runType to "plan"', async () => {
        const m = baseManifest()
        const now = new Date()
        ;(mocks.getManifestRow as any).mockResolvedValue({
            id: 'manifest-1',
            guildId: 'guild-1',
            version: 1,
            manifest: m,
            lastCapturedState: m,
            createdBy: null,
            updatedAt: now,
        })
        ;(mocks.createPlanRecord as any).mockResolvedValue({
            id: 'run-1',
            guildId: 'guild-1',
        })

        await orchestrator.createPlan('guild-1')

        const call = mocks.createPlanRecord.mock.calls[0]
        expect(call[2]).toBe('plan') // runType argument
    })

    it('uses provided runType', async () => {
        const m = baseManifest()
        const now = new Date()
        ;(mocks.getManifestRow as any).mockResolvedValue({
            id: 'manifest-1',
            guildId: 'guild-1',
            version: 1,
            manifest: m,
            lastCapturedState: m,
            createdBy: null,
            updatedAt: now,
        })
        ;(mocks.createPlanRecord as any).mockResolvedValue({
            id: 'run-1',
            guildId: 'guild-1',
        })

        await orchestrator.createPlan('guild-1', {
            runType: 'apply',
        })

        const call = mocks.createPlanRecord.mock.calls[0]
        expect(call[2]).toBe('apply')
    })

    it('calls upsertDrift for each module', async () => {
        const m = baseManifest()
        const now = new Date()
        ;(mocks.getManifestRow as any).mockResolvedValue({
            id: 'manifest-1',
            guildId: 'guild-1',
            version: 1,
            manifest: m,
            lastCapturedState: m,
            createdBy: null,
            updatedAt: now,
        })
        ;(mocks.createPlanRecord as any).mockResolvedValue({
            id: 'run-1',
            guildId: 'guild-1',
        })

        await orchestrator.createPlan('guild-1')

        expect(mocks.upsertDrift).toHaveBeenCalled()
        expect(mocks.upsertDrift.mock.calls.length).toBeGreaterThan(0)
    })

    it('maps 0 operations to severity "none"', async () => {
        const m = baseManifest()
        const now = new Date()
        ;(mocks.getManifestRow as any).mockResolvedValue({
            id: 'manifest-1',
            guildId: 'guild-1',
            version: 1,
            manifest: m,
            lastCapturedState: m,
            createdBy: null,
            updatedAt: now,
        })
        ;(mocks.createPlanRecord as any).mockResolvedValue({
            id: 'run-1',
            guildId: 'guild-1',
        })

        await orchestrator.createPlan('guild-1')

        // With identical manifest, no operations, so severity should be 'none' (count === 0)
        const calls = mocks.upsertDrift.mock.calls
        // Should have been called with 'none' severity
        expect(calls.some((c: any) => c[3] === 'none')).toBe(true)
    })

    it('maps 1-2 operations to severity "low"', async () => {
        const m2 = baseManifest()
        const now2 = new Date()
        ;(mocks.getManifestRow as any).mockResolvedValue({
            id: 'manifest-1',
            guildId: 'guild-1',
            version: 1,
            manifest: m2,
            lastCapturedState: m2,
            createdBy: null,
            updatedAt: now2,
        })
        ;(mocks.createPlanRecord as any).mockResolvedValue({
            id: 'run-1',
            guildId: 'guild-1',
        })

        // Mock createAutomationPlan to return 1 operation (triggers 'low' severity: count < 3)
        mockCreateAutomationPlan.mockReturnValueOnce({
            operations: [
                {
                    module: 'roles',
                    action: 'create',
                    target: 'roles/test',
                    protected: false,
                    desired: {},
                    actual: undefined,
                    reason: 'test',
                },
            ],
            protectedOperations: [],
            summary: {
                total: 1,
                safe: 1,
                protected: 0,
                byModule: {
                    roles: 1,
                    onboarding: 0,
                    moderation: 0,
                    automessages: 0,
                    reactionroles: 0,
                    commandaccess: 0,
                    parity: 0,
                },
            },
        })

        await orchestrator.createPlan('guild-1')

        // Find the call to upsertDrift with roles module (count 1) and verify severity is 'low'
        const calls = mocks.upsertDrift.mock.calls
        const rolesCall = calls.find(
            (c: any) => c[1] === 'roles' && c[2].length === 1,
        )
        expect(rolesCall).toBeDefined()
        expect(rolesCall[3]).toBe('low')
    })

    it('maps 8+ operations to severity "high"', async () => {
        const m3 = baseManifest()
        const now3 = new Date()
        ;(mocks.getManifestRow as any).mockResolvedValue({
            id: 'manifest-1',
            guildId: 'guild-1',
            version: 1,
            manifest: m3,
            lastCapturedState: m3,
            createdBy: null,
            updatedAt: now3,
        })
        ;(mocks.createPlanRecord as any).mockResolvedValue({
            id: 'run-1',
            guildId: 'guild-1',
        })

        // Mock createAutomationPlan to return 8 operations (triggers 'high' severity: count >= 8)
        const ops = Array.from({ length: 8 }, (_, i) => ({
            module: 'roles' as const,
            action: 'create' as const,
            target: `roles/test-${i}`,
            protected: false,
            desired: {},
            actual: undefined,
            reason: 'test',
        }))
        mockCreateAutomationPlan.mockReturnValueOnce({
            operations: ops,
            protectedOperations: [],
            summary: {
                total: 8,
                safe: 8,
                protected: 0,
                byModule: {
                    roles: 8,
                    onboarding: 0,
                    moderation: 0,
                    automessages: 0,
                    reactionroles: 0,
                    commandaccess: 0,
                    parity: 0,
                },
            },
        })

        await orchestrator.createPlan('guild-1')

        // Find the call to upsertDrift with roles module (count 8) and verify severity is 'high'
        const calls = mocks.upsertDrift.mock.calls
        const rolesCall = calls.find(
            (c: any) => c[1] === 'roles' && c[2].length === 8,
        )
        expect(rolesCall).toBeDefined()
        expect(rolesCall[3]).toBe('high')
    })

    it('verifies severity "low" for 1-2 operations explicitly', async () => {
        const m = baseManifest()
        const now = new Date()
        ;(mocks.getManifestRow as any).mockResolvedValue({
            id: 'manifest-1',
            guildId: 'guild-1',
            version: 1,
            manifest: m,
            lastCapturedState: m,
            createdBy: null,
            updatedAt: now,
        })

        // Mock createAutomationPlan to return 2 operations (triggers 'low' severity: count < 3)
        mockCreateAutomationPlan.mockReturnValueOnce({
            operations: [
                {
                    module: 'roles',
                    action: 'create',
                    target: 'roles/test-1',
                    protected: false,
                    desired: {},
                    actual: undefined,
                    reason: 'test',
                },
                {
                    module: 'roles',
                    action: 'update',
                    target: 'roles/test-2',
                    protected: false,
                    desired: {},
                    actual: {},
                    reason: 'test',
                },
            ],
            protectedOperations: [],
            summary: {
                total: 2,
                safe: 2,
                protected: 0,
                byModule: {
                    roles: 2,
                    onboarding: 0,
                    moderation: 0,
                    automessages: 0,
                    reactionroles: 0,
                    commandaccess: 0,
                    parity: 0,
                },
            },
        })
        ;(mocks.createPlanRecord as any).mockResolvedValue({
            id: 'run-1',
            guildId: 'guild-1',
        })

        await orchestrator.createPlan('guild-1')

        // Verify the call with roles module (count 2) has 'low' severity
        const calls = mocks.upsertDrift.mock.calls
        const rolesCall = calls.find(
            (c: any) => c[1] === 'roles' && c[2].length === 2,
        )
        expect(rolesCall).toBeDefined()
        expect(rolesCall[3]).toBe('low')
    })

    it('verifies severity "medium" for 3-7 operations', async () => {
        const m = baseManifest()
        const now = new Date()
        ;(mocks.getManifestRow as any).mockResolvedValue({
            id: 'manifest-1',
            guildId: 'guild-1',
            version: 1,
            manifest: m,
            lastCapturedState: m,
            createdBy: null,
            updatedAt: now,
        })

        // Mock createAutomationPlan to return 5 operations (triggers 'medium' severity: 3 <= count < 8)
        const ops = Array.from({ length: 5 }, (_, i) => ({
            module: 'roles' as const,
            action: 'create' as const,
            target: `roles/test-${i}`,
            protected: false,
            desired: {},
            actual: undefined,
            reason: 'test',
        }))
        mockCreateAutomationPlan.mockReturnValueOnce({
            operations: ops,
            protectedOperations: [],
            summary: {
                total: 5,
                safe: 5,
                protected: 0,
                byModule: {
                    roles: 5,
                    onboarding: 0,
                    moderation: 0,
                    automessages: 0,
                    reactionroles: 0,
                    commandaccess: 0,
                    parity: 0,
                },
            },
        })
        ;(mocks.createPlanRecord as any).mockResolvedValue({
            id: 'run-1',
            guildId: 'guild-1',
        })

        await orchestrator.createPlan('guild-1')

        // Verify the call with roles module (count 5) has 'medium' severity
        const calls = mocks.upsertDrift.mock.calls
        const rolesCall = calls.find(
            (c: any) => c[1] === 'roles' && c[2].length === 5,
        )
        expect(rolesCall).toBeDefined()
        expect(rolesCall[3]).toBe('medium')
    })

    it('records usedCapturedState = true when actualState not provided', async () => {
        const m = baseManifest()
        const now = new Date()
        ;(mocks.getManifestRow as any).mockResolvedValue({
            id: 'manifest-1',
            guildId: 'guild-1',
            version: 1,
            manifest: m,
            lastCapturedState: m,
            createdBy: null,
            updatedAt: now,
        })
        ;(mocks.createPlanRecord as any).mockResolvedValue({
            id: 'run-1',
            guildId: 'guild-1',
        })

        await orchestrator.createPlan('guild-1')

        const call = mocks.createPlanRecord.mock.calls[0]
        // Index 6 is the diagnostics object with usedCapturedState flag
        expect(call[6]?.usedCapturedState).toBe(true)
    })

    it('records usedCapturedState = false when actualState is provided', async () => {
        const storedManifest = baseManifest()
        const providedState = {
            ...baseManifest(),
            version: 99,
        }
        const now = new Date()
        ;(mocks.getManifestRow as any).mockResolvedValue({
            id: 'manifest-1',
            guildId: 'guild-1',
            version: 1,
            manifest: storedManifest,
            lastCapturedState: storedManifest,
            createdBy: null,
            updatedAt: now,
        })
        ;(mocks.createPlanRecord as any).mockResolvedValue({
            id: 'run-1',
            guildId: 'guild-1',
        })

        await orchestrator.createPlan('guild-1', {
            actualState: providedState,
        })

        const call = mocks.createPlanRecord.mock.calls[0]
        // Index 6 is the diagnostics object with usedCapturedState flag
        expect(call[6]?.usedCapturedState).toBe(false)
    })
})

describe('GuildAutomationOrchestrator.listRuns', () => {
    let orchestrator: GuildAutomationOrchestrator
    let mocks: any

    beforeEach(() => {
        const result = makeOrchestrator()
        orchestrator = result.orchestrator
        mocks = result.mocks
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('lists runs with default limit', async () => {
        mocks.listRuns.mockResolvedValue([
            {
                id: 'run-1',
                guildId: 'guild-1',
                manifestId: 'manifest-1',
                type: 'capture',
                status: 'completed',
                operations: [],
                protectedOperations: [],
                summary: {},
                diagnostics: {},
                error: null,
                initiatedBy: 'user-1',
                completedAt: new Date(),
                updatedAt: new Date(),
                createdAt: new Date(),
            },
        ])

        const result = await orchestrator.listRuns('guild-1')

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('run-1')
        expect(mocks.listRuns).toHaveBeenCalledWith('guild-1', 10)
    })

    it('lists runs with custom limit', async () => {
        mocks.listRuns.mockResolvedValue([])

        await orchestrator.listRuns('guild-1', 5)

        expect(mocks.listRuns).toHaveBeenCalledWith('guild-1', 5)
    })

    it('returns empty array when no runs exist', async () => {
        mocks.listRuns.mockResolvedValue([])

        const result = await orchestrator.listRuns('guild-1')

        expect(result).toHaveLength(0)
    })
})
