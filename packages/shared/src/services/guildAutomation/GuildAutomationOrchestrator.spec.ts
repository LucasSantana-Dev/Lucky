import { describe, expect, it, jest } from '@jest/globals'
import { GuildAutomationOrchestrator } from './GuildAutomationOrchestrator'
import type { IGuildAutomationRepository } from './IGuildAutomationRepository'
import type { AutomationRunStatus } from './types'

type UpdateRunStatusArgs = [
    runId: string,
    status: AutomationRunStatus,
    diagnostics?: Record<string, unknown>,
]

function makeOrchestrator() {
    const updateRunStatus =
        jest.fn<
            (
                ...args: UpdateRunStatusArgs
            ) => Promise<{ id: string; status: AutomationRunStatus }>
        >()
    updateRunStatus.mockImplementation((runId, status) =>
        Promise.resolve({ id: runId, status }),
    )
    const repository = {
        updateRunStatus,
    } as unknown as IGuildAutomationRepository
    const orchestrator = new GuildAutomationOrchestrator(repository)
    return { orchestrator, updateRunStatus }
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
        desired: {},
        actual: {},
    })
}

describe('GuildAutomationOrchestrator.createApplyRun', () => {
    it('records the web apply as pending (plan-only) — not completed', async () => {
        const { orchestrator, updateRunStatus } = makeOrchestrator()
        stubPlan(orchestrator, [])

        const result = await orchestrator.createApplyRun('guild-pending', {
            runType: 'apply',
        })

        expect(result.status).toBe('pending')
        expect(result.blockedByProtected).toBe(false)
        const [, status, diagnostics] = updateRunStatus.mock.calls[0]
        expect(status).toBe('pending')
        // The web path no longer claims to have applied anything.
        expect(diagnostics?.autoAppliedOperations).toEqual([])
        expect(diagnostics?.planRecorded).toBe(true)
    })

    it('blocks when protected ops exist and allowProtected is false', async () => {
        const { orchestrator, updateRunStatus } = makeOrchestrator()
        stubPlan(orchestrator, [{ protected: true }])

        const result = await orchestrator.createApplyRun('guild-blocked', {
            runType: 'apply',
            allowProtected: false,
        })

        expect(result.status).toBe('blocked')
        expect(result.blockedByProtected).toBe(true)
        expect(updateRunStatus.mock.calls[0][1]).toBe('blocked')
    })

    it('records pending when protected ops are explicitly allowed', async () => {
        const { orchestrator, updateRunStatus } = makeOrchestrator()
        stubPlan(orchestrator, [{ protected: true }])

        const result = await orchestrator.createApplyRun('guild-allowed', {
            runType: 'reconcile',
            allowProtected: true,
        })

        expect(result.status).toBe('pending')
        expect(result.blockedByProtected).toBe(false)
        expect(updateRunStatus.mock.calls[0][1]).toBe('pending')
    })
})
