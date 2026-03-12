import { Prisma } from '../../generated/prisma/client.js'
import { getPrismaClient } from '../../utils/database/prismaClient.js'
import { errorLog, debugLog } from '../../utils/general/log.js'
import { redisClient } from '../redis/index.js'
import {
    guildAutomationManifestSchema,
    type GuildAutomationManifestInput,
} from './manifestSchema.js'
import { createAutomationPlan } from './diff.js'
import {
    GuildAutomationApplyLockedError,
    GuildAutomationCaptureRequiredError,
    GuildAutomationInvalidManifestPayloadError,
    GuildAutomationLockUnavailableError,
    GuildAutomationManifestNotFoundError,
} from '../../types/errors/guildAutomation.js'
import type {
    AutomationModule,
    AutomationRunStatus,
    AutomationRunType,
    DriftSeverity,
    GuildAutomationManifestDocument,
    GuildAutomationPlan,
    GuildAutomationStatus,
} from './types.js'
import { randomUUID } from 'node:crypto'

const prisma = getPrismaClient()
const LOCK_TTL_MS = 60_000
const LOCK_KEY_PREFIX = 'guild-automation:lock'

function toJsonValue(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toManifestDocument(value: unknown): GuildAutomationManifestDocument {
    if (!isObject(value)) {
        throw new GuildAutomationInvalidManifestPayloadError()
    }

    return guildAutomationManifestSchema.parse(value)
}

function computeSeverity(count: number): DriftSeverity {
    if (count === 0) {
        return 'none'
    }

    if (count < 3) {
        return 'low'
    }

    if (count < 8) {
        return 'medium'
    }

    return 'high'
}

class GuildAutomationService {
    private getLockKey(guildId: string): string {
        return `${LOCK_KEY_PREFIX}:${guildId}`
    }

    private async acquireLock(guildId: string): Promise<string> {
        if (!redisClient.isHealthy()) {
            throw new GuildAutomationLockUnavailableError(guildId)
        }

        const key = this.getLockKey(guildId)
        const token = randomUUID()
        const acquired = await redisClient.setNxPx(key, token, LOCK_TTL_MS)

        if (!acquired) {
            throw new GuildAutomationApplyLockedError(guildId)
        }

        return token
    }

    private async releaseLock(guildId: string, token: string): Promise<void> {
        if (!redisClient.isHealthy()) {
            return
        }

        const key = this.getLockKey(guildId)
        await redisClient.delIfValueMatches(key, token)
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

    private resolveActualState(
        guildId: string,
        manifestRow: {
            lastCapturedState: Prisma.JsonValue | null
        },
        options?: { actualState?: GuildAutomationManifestInput },
    ): GuildAutomationManifestDocument {
        if (options?.actualState) {
            return guildAutomationManifestSchema.parse(options.actualState)
        }

        if (manifestRow.lastCapturedState) {
            return toManifestDocument(manifestRow.lastCapturedState)
        }

        throw new GuildAutomationCaptureRequiredError(guildId)
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
            throw new GuildAutomationManifestNotFoundError(guildId)
        }

        const desired = toManifestDocument(manifestRow.manifest)
        const actual = this.resolveActualState(guildId, manifestRow, options)

        const plan = createAutomationPlan({
            desired,
            actual,
        })

        const runType = options?.runType ?? 'plan'
        const runStatus: AutomationRunStatus =
            runType === 'plan' ? 'completed' : 'running'

        for (const [moduleName, count] of Object.entries(plan.summary.byModule)) {
            const severity = computeSeverity(count)

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
            executor?: (params: {
                guildId: string
                runId: string
                plan: GuildAutomationPlan
                desired: GuildAutomationManifestDocument
                actual: GuildAutomationManifestDocument
                allowProtected: boolean
            }) => Promise<{
                diagnostics?: Record<string, unknown>
                remappedManifest?: GuildAutomationManifestDocument
            }>
        },
    ) {
        const lockToken = await this.acquireLock(guildId)

        try {
            const planResult = await this.createPlan(guildId, {
                actualState: options?.actualState,
                initiatedBy: options?.initiatedBy,
                runType: options?.runType ?? 'apply',
            })

            const blockedByProtected =
                (options?.allowProtected ?? false) === false &&
                planResult.plan.protectedOperations.length > 0

            const allowProtected = options?.allowProtected ?? false
            const baseDiagnostics: Record<string, unknown> = {
                allowProtected,
                blockedByProtected,
            }

            if (blockedByProtected) {
                const run = await this.updateRunStatus({
                    runId: planResult.runId,
                    status: 'blocked',
                    diagnostics: baseDiagnostics,
                })

                return {
                    runId: run.id,
                    status: 'blocked' as const,
                    plan: planResult.plan,
                    blockedByProtected,
                }
            }

            if (options?.executor) {
                try {
                    const execution = await options.executor({
                        guildId,
                        runId: planResult.runId,
                        plan: planResult.plan,
                        desired: planResult.desired,
                        actual: planResult.actual,
                        allowProtected,
                    })

                    if (execution.remappedManifest) {
                        await this.saveManifest(guildId, execution.remappedManifest, {
                            createdBy: options.initiatedBy,
                            version: execution.remappedManifest.version,
                        })
                    }

                    const run = await this.updateRunStatus({
                        runId: planResult.runId,
                        status: 'completed',
                        diagnostics: {
                            ...baseDiagnostics,
                            ...(execution.diagnostics ?? {}),
                        },
                    })

                    return {
                        runId: run.id,
                        status: 'completed' as const,
                        plan: planResult.plan,
                        blockedByProtected: false,
                    }
                } catch (error) {
                    await this.updateRunStatus({
                        runId: planResult.runId,
                        status: 'failed',
                        error: error instanceof Error ? error.message : String(error),
                        diagnostics: baseDiagnostics,
                    })
                    throw error
                }
            }

            const run = await this.updateRunStatus({
                runId: planResult.runId,
                status: 'completed',
                diagnostics: {
                    ...baseDiagnostics,
                    autoAppliedOperations: planResult.plan.operations.filter(
                        (operation) => !operation.protected,
                    ),
                },
            })

            return {
                runId: run.id,
                status: run.status,
                plan: planResult.plan,
                blockedByProtected,
            }
        } finally {
            await this.releaseLock(guildId, lockToken)
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
                      type: latestRun.type as AutomationRunType,
                      status: latestRun.status as AutomationRunStatus,
                      createdAt: latestRun.createdAt,
                  }
                : null,
            drifts: drifts.map((drift) => ({
                module: drift.module as AutomationModule,
                severity: drift.severity as DriftSeverity,
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
            throw new GuildAutomationManifestNotFoundError(guildId)
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
