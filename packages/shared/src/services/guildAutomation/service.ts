import { Prisma } from '../../generated/prisma/client.js'
import { getPrismaClient } from '../../utils/database/prismaClient.js'
import { errorLog, debugLog } from '../../utils/general/log.js'
import {
    guildAutomationManifestSchema,
    type GuildAutomationManifestInput,
} from './manifestSchema.js'
import { createAutomationPlan } from './diff.js'
import type {
    AutomationModule,
    AutomationRunStatus,
    AutomationRunType,
    GuildAutomationManifestDocument,
    GuildAutomationStatus,
} from './types.js'

const prisma = getPrismaClient()
const LOCK_TTL_MS = 60_000

const locks = new Map<string, { expiresAt: number }>()

function toJsonValue(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toManifestDocument(value: unknown): GuildAutomationManifestDocument {
    if (!isObject(value)) {
        throw new Error('Manifest payload is invalid')
    }

    return guildAutomationManifestSchema.parse(value)
}

function cleanupLocks(): void {
    const now = Date.now()
    for (const [guildId, lock] of locks.entries()) {
        if (lock.expiresAt <= now) {
            locks.delete(guildId)
        }
    }
}

class GuildAutomationService {
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
            moduleOwnership?: Record<AutomationModule, boolean>
            version?: number
        },
    ) {
        const validated = guildAutomationManifestSchema.parse(manifest)

        return prisma.guildAutomationManifest.upsert({
            where: { guildId },
            create: {
                guildId,
                version: options?.version ?? validated.version,
                manifest: toJsonValue(validated),
                moduleOwnership: toJsonValue(options?.moduleOwnership ?? {}),
                createdBy: options?.createdBy,
            },
            update: {
                version: options?.version ?? validated.version,
                manifest: toJsonValue(validated),
                moduleOwnership: toJsonValue(options?.moduleOwnership ?? {}),
                createdBy: options?.createdBy,
            },
        })
    }

    async getManifest(guildId: string): Promise<{
        guildId: string
        version: number
        manifest: GuildAutomationManifestDocument
        lastCapturedState: GuildAutomationManifestDocument | null
        lastCapturedAt: Date | null
        updatedAt: Date
    } | null> {
        const row = await prisma.guildAutomationManifest.findUnique({
            where: { guildId },
        })

        if (!row) {
            return null
        }

        return {
            guildId: row.guildId,
            version: row.version,
            manifest: toManifestDocument(row.manifest),
            lastCapturedState: row.lastCapturedState
                ? toManifestDocument(row.lastCapturedState)
                : null,
            lastCapturedAt: row.lastCapturedAt,
            updatedAt: row.updatedAt,
        }
    }

    async recordCapture(
        guildId: string,
        capturedState: GuildAutomationManifestInput,
        initiatedBy?: string,
    ) {
        const parsed = guildAutomationManifestSchema.parse(capturedState)

        const manifestRow = await prisma.guildAutomationManifest.upsert({
            where: { guildId },
            create: {
                guildId,
                version: parsed.version,
                manifest: toJsonValue(parsed),
                lastCapturedState: toJsonValue(parsed),
                lastCapturedAt: new Date(),
                createdBy: initiatedBy,
            },
            update: {
                lastCapturedState: toJsonValue(parsed),
                lastCapturedAt: new Date(),
            },
        })

        const run = await prisma.guildAutomationRun.create({
            data: {
                guildId,
                manifestId: manifestRow.id,
                type: 'capture',
                status: 'completed',
                summary: toJsonValue({
                    capturedAt: new Date().toISOString(),
                    modules: Object.keys(parsed).filter(
                        (key) => key !== 'guild' && key !== 'version',
                    ),
                }),
                initiatedBy,
                completedAt: new Date(),
            },
        })

        return {
            manifestId: manifestRow.id,
            runId: run.id,
        }
    }

    async createPlan(
        guildId: string,
        options?: {
            actualState?: GuildAutomationManifestInput
            initiatedBy?: string
            runType?: Extract<AutomationRunType, 'plan' | 'apply' | 'reconcile'>
        },
    ) {
        const manifestRow = await prisma.guildAutomationManifest.findUnique({
            where: { guildId },
        })

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
        const runStatus: AutomationRunStatus =
            runType === 'plan' ? 'completed' : 'running'

        for (const [moduleName, count] of Object.entries(plan.summary.byModule)) {
            const severity: 'none' | 'low' | 'medium' | 'high' =
                count === 0
                    ? 'none'
                    : count < 3
                      ? 'low'
                      : count < 8
                        ? 'medium'
                        : 'high'

            await prisma.guildAutomationDrift.upsert({
                where: {
                    guildId_module: {
                        guildId,
                        module: moduleName,
                    },
                },
                create: {
                    guildId,
                    module: moduleName,
                    drift: toJsonValue(
                        plan.operations.filter(
                            (operation) => operation.module === moduleName,
                        ),
                    ),
                    severity,
                },
                update: {
                    drift: toJsonValue(
                        plan.operations.filter(
                            (operation) => operation.module === moduleName,
                        ),
                    ),
                    severity,
                },
            })
        }

        const run = await prisma.guildAutomationRun.create({
            data: {
                guildId,
                manifestId: manifestRow.id,
                type: runType,
                status: runStatus,
                operations: toJsonValue(plan.operations),
                protectedOperations: toJsonValue(plan.protectedOperations),
                summary: toJsonValue(plan.summary),
                diagnostics: toJsonValue({
                    usedCapturedState: !options?.actualState,
                }),
                initiatedBy: options?.initiatedBy,
                completedAt: runStatus === 'completed' ? new Date() : null,
            },
        })

        return {
            runId: run.id,
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
            throw new Error('Another automation apply operation is already running')
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
                : 'completed'

            const run = await prisma.guildAutomationRun.update({
                where: { id: planResult.runId },
                data: {
                    status,
                    diagnostics: toJsonValue({
                        allowProtected: options?.allowProtected ?? false,
                        blockedByProtected,
                        autoAppliedOperations: blockedByProtected
                            ? []
                            : planResult.plan.operations.filter(
                                  (operation) => !operation.protected,
                              ),
                    }),
                    completedAt: new Date(),
                },
            })

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
        await prisma.guildAutomationRun.update({
            where: { id: runId },
            data: {
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
                completedAt: new Date(),
            },
        })
    }

    async completeRun(runId: string, diagnostics?: Record<string, unknown>) {
        return prisma.guildAutomationRun.update({
            where: { id: runId },
            data: {
                status: 'completed',
                diagnostics: toJsonValue(diagnostics ?? {}),
                completedAt: new Date(),
            },
        })
    }

    async updateRunStatus(params: {
        runId: string
        status: AutomationRunStatus
        diagnostics?: Record<string, unknown>
        error?: string
    }) {
        return prisma.guildAutomationRun.update({
            where: { id: params.runId },
            data: {
                status: params.status,
                diagnostics: toJsonValue(params.diagnostics ?? {}),
                error: params.error,
                completedAt:
                    params.status === 'running' ? null : new Date(),
            },
        })
    }

    async getStatus(guildId: string): Promise<GuildAutomationStatus> {
        const [manifest, latestRun, drifts] = await Promise.all([
            prisma.guildAutomationManifest.findUnique({
                where: { guildId },
            }),
            prisma.guildAutomationRun.findFirst({
                where: { guildId },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.guildAutomationDrift.findMany({
                where: { guildId },
                orderBy: { module: 'asc' },
            }),
        ])

        return {
            manifest: manifest
                ? {
                      guildId: manifest.guildId,
                      version: manifest.version,
                      updatedAt: manifest.updatedAt,
                      lastCapturedAt: manifest.lastCapturedAt,
                  }
                : null,
            latestRun: latestRun
                ? {
                      id: latestRun.id,
                      type: latestRun.type,
                      status: latestRun.status,
                      createdAt: latestRun.createdAt,
                  }
                : null,
            drifts: drifts.map((drift) => ({
                module: drift.module,
                severity: drift.severity,
                updatedAt: drift.updatedAt,
            })),
        }
    }

    async runCutover(
        guildId: string,
        options?: {
            initiatedBy?: string
            completeChecklist?: boolean
        },
    ) {
        const row = await prisma.guildAutomationManifest.findUnique({
            where: { guildId },
        })

        if (!row) {
            throw new Error('No automation manifest found for this guild')
        }

        const manifest = toManifestDocument(row.manifest)
        const checklist = manifest.parity?.checklist ?? []
        const allDone = checklist.every((item) => item.done)

        if (!allDone && options?.completeChecklist !== true) {
            const run = await prisma.guildAutomationRun.create({
                data: {
                    guildId,
                    manifestId: row.id,
                    type: 'cutover',
                    status: 'blocked',
                    summary: toJsonValue({
                        reason: 'Parity checklist incomplete',
                        checklist,
                    }),
                    initiatedBy: options?.initiatedBy,
                    completedAt: new Date(),
                },
            })

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
                checklist: checklist.map((item) => ({ ...item, done: true })),
            },
        }

        await prisma.guildAutomationManifest.update({
            where: { guildId },
            data: {
                manifest: toJsonValue(nextManifest),
            },
        })

        const run = await prisma.guildAutomationRun.create({
            data: {
                guildId,
                manifestId: row.id,
                type: 'cutover',
                status: 'completed',
                summary: toJsonValue({
                    checklistComplete: true,
                    externalBots: nextManifest.parity?.externalBots ?? [],
                }),
                initiatedBy: options?.initiatedBy,
                completedAt: new Date(),
            },
        })

        return {
            runId: run.id,
            status: 'completed' as const,
            checklistComplete: true,
        }
    }

    async listRuns(guildId: string, limit = 10) {
        return prisma.guildAutomationRun.findMany({
            where: { guildId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        })
    }
}

export const guildAutomationService = new GuildAutomationService()

export type { GuildAutomationManifestDocument } from './types.js'

export function validateManifestOrThrow(
    manifest: unknown,
): GuildAutomationManifestInput {
    return guildAutomationManifestSchema.parse(manifest)
}

export function parseManifestForDiff(
    manifest: unknown,
): GuildAutomationManifestDocument {
    return toManifestDocument(manifest)
}

export async function createAutomationPlanWithDefaults(params: {
    guildId: string
    desired: GuildAutomationManifestDocument
    actual: GuildAutomationManifestDocument
}) {
    try {
        debugLog({
            message: 'Creating automation plan from explicit desired/actual state',
            data: { guildId: params.guildId },
        })
        const plan = createAutomationPlan({
            desired: params.desired,
            actual: params.actual,
        })

        return plan
    } catch (error) {
        errorLog({
            message: 'Failed to create automation plan',
            error,
        })
        throw error
    }
}
