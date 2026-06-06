import { guildAutomationManifestSchema } from './manifestSchema.js'
import { createAutomationPlan } from './diff.js'
import type {
    AutomationRunStatus,
    AutomationRunType,
    GuildAutomationManifestDocument,
    GuildAutomationStatus,
} from './types.js'
import type { GuildAutomationManifestInput } from './manifestSchema.js'
import type { IGuildAutomationRepository } from './IGuildAutomationRepository.js'
import { toManifestDocument } from './guildAutomationHelpers.js'

const LOCK_TTL_MS = 60_000

const locks = new Map<string, { expiresAt: number }>()

function cleanupLocks(): void {
    const now = Date.now()
    for (const [guildId, lock] of locks.entries()) {
        if (lock.expiresAt <= now) {
            locks.delete(guildId)
        }
    }
}

export class GuildAutomationOrchestrator {
    constructor(private repository: IGuildAutomationRepository) {}

    private acquireLock(guildId: string): boolean {
        cleanupLocks()
        if (locks.has(guildId)) {
            return false
        }

        locks.set(guildId, {
            expiresAt: Date.now() + LOCK_TTL_MS,
        })

        return true
    }

    private releaseLock(guildId: string): void {
        locks.delete(guildId)
    }

    async saveManifest(
        guildId: string,
        manifest: GuildAutomationManifestInput,
        options?: {
            createdBy?: string
            moduleOwnership?: Record<string, boolean>
            version?: number
        },
    ) {
        const validated = guildAutomationManifestSchema.parse(manifest)

        return this.repository.saveManifest(guildId, validated, options)
    }

    async getManifest(guildId: string) {
        return this.repository.getManifest(guildId)
    }

    async recordCapture(
        guildId: string,
        capturedState: GuildAutomationManifestInput,
        initiatedBy?: string,
    ) {
        const parsed = guildAutomationManifestSchema.parse(capturedState)

        return this.repository.recordCapture(guildId, parsed, initiatedBy)
    }

    async createPlan(
        guildId: string,
        options?: {
            actualState?: GuildAutomationManifestInput
            initiatedBy?: string
            runType?: Extract<AutomationRunType, 'plan' | 'apply' | 'reconcile'>
        },
    ) {
        const manifestRow = await this.repository.getManifestRow(guildId)

        if (!manifestRow) {
            throw new Error('No automation manifest found for this guild')
        }

        const desired = toManifestDocument(manifestRow.manifest)

        const actual = options?.actualState
            ? guildAutomationManifestSchema.parse(options.actualState)
            : manifestRow.lastCapturedState
              ? toManifestDocument(manifestRow.lastCapturedState)
              : null

        if (!actual) {
            throw new Error(
                'No captured guild state available. Run capture before plan/apply.',
            )
        }

        const plan = createAutomationPlan({
            desired,
            actual,
        })

        const runType = options?.runType ?? 'plan'

        for (const [moduleName, count] of Object.entries(
            plan.summary.byModule,
        )) {
            const severity: 'none' | 'low' | 'medium' | 'high' =
                count === 0
                    ? 'none'
                    : count < 3
                      ? 'low'
                      : count < 8
                        ? 'medium'
                        : 'high'

            await this.repository.upsertDrift(
                guildId,
                moduleName,
                plan.operations.filter(
                    (operation) => operation.module === moduleName,
                ),
                severity,
            )
        }

        const planRunResult = await this.repository.createPlanRecord(
            guildId,
            manifestRow.id,
            runType,
            plan.operations,
            plan.protectedOperations,
            plan.summary,
            {
                usedCapturedState: !options?.actualState,
            },
            options?.initiatedBy,
        )

        return {
            runId: planRunResult.id,
            plan,
            desired,
            actual,
        }
    }

    async createApplyRun(
        guildId: string,
        options?: {
            actualState?: GuildAutomationManifestInput
            initiatedBy?: string
            allowProtected?: boolean
            runType?: Extract<AutomationRunType, 'apply' | 'reconcile'>
        },
    ) {
        if (!this.acquireLock(guildId)) {
            throw new Error(
                'Another automation apply operation is already running',
            )
        }

        try {
            const planResult = await this.createPlan(guildId, {
                actualState: options?.actualState,
                initiatedBy: options?.initiatedBy,
                runType: options?.runType ?? 'apply',
            })

            const blockedByProtected =
                (options?.allowProtected ?? false) === false &&
                planResult.plan.protectedOperations.length > 0

            const status: AutomationRunStatus = blockedByProtected
                ? 'blocked'
                : 'pending'

            const run = await this.repository.updateRunStatus(
                planResult.runId,
                status,
                {
                    allowProtected: options?.allowProtected ?? false,
                    blockedByProtected,
                    planRecorded: true,
                    autoAppliedOperations: [],
                },
            )

            return {
                runId: run.id,
                status,
                plan: planResult.plan,
                blockedByProtected,
            }
        } finally {
            this.releaseLock(guildId)
        }
    }

    async markRunFailure(runId: string, error: unknown): Promise<void> {
        await this.repository.markRunFailure(runId, error)
    }

    async completeRun(runId: string, diagnostics?: Record<string, unknown>) {
        return this.repository.completeRun(runId, diagnostics)
    }

    async updateRunStatus(params: {
        runId: string
        status: AutomationRunStatus
        diagnostics?: Record<string, unknown>
        error?: string
    }) {
        return this.repository.updateRunStatus(
            params.runId,
            params.status,
            params.diagnostics,
            params.error,
        )
    }

    async getStatus(guildId: string): Promise<GuildAutomationStatus> {
        return this.repository.getStatus(guildId)
    }

    async runCutover(
        guildId: string,
        options?: {
            initiatedBy?: string
            completeChecklist?: boolean
        },
    ) {
        const row = await this.repository.getManifestRow(guildId)

        if (!row) {
            throw new Error('No automation manifest found for this guild')
        }

        const manifest = toManifestDocument(row.manifest)
        const checklist = manifest.parity?.checklist ?? []
        const allDone = checklist.every((item) => item.done)

        if (!allDone && options?.completeChecklist !== true) {
            const run = await this.repository.createBlockedCutoverRun(
                guildId,
                row.id,
                checklist,
                options?.initiatedBy,
            )

            return {
                runId: run.id,
                status: 'blocked' as const,
                checklistComplete: false,
            }
        }

        const nextManifest: GuildAutomationManifestDocument = {
            ...manifest,
            parity: {
                ...manifest.parity,
                cutoverReady: true,
                checklist: checklist.map((item) => ({
                    ...item,
                    done: true,
                })),
            },
        }

        const run = await this.repository.runCutover(
            guildId,
            nextManifest,
            checklist,
            options?.initiatedBy,
        )

        return {
            runId: run.id,
            status: 'completed' as const,
            checklistComplete: true,
        }
    }

    async listRuns(guildId: string, limit = 10) {
        return this.repository.listRuns(guildId, limit)
    }
}
