import type { PrismaClient } from '../../generated/prisma/client.js'
import type {
    AutomationModule,
    AutomationRunStatus,
    AutomationRunType,
    GuildAutomationManifestDocument,
} from './types.js'
import type { IGuildAutomationRepository } from './IGuildAutomationRepository.js'
import { toJsonValue, toManifestDocument } from './guildAutomationHelpers.js'

export class GuildAutomationRepository implements IGuildAutomationRepository {
    constructor(private prisma: PrismaClient) {}

    async saveManifest(
        guildId: string,
        manifest: GuildAutomationManifestDocument,
        options?: {
            createdBy?: string
            moduleOwnership?: Record<AutomationModule, boolean>
            version?: number
        },
    ) {
        return this.prisma.guildAutomationManifest.upsert({
            where: { guildId },
            create: {
                guildId,
                version: options?.version ?? manifest.version,
                manifest: toJsonValue(manifest),
                moduleOwnership: toJsonValue(options?.moduleOwnership ?? {}),
                createdBy: options?.createdBy,
            },
            update: {
                version: options?.version ?? manifest.version,
                manifest: toJsonValue(manifest),
                moduleOwnership: toJsonValue(options?.moduleOwnership ?? {}),
                createdBy: options?.createdBy,
            },
        })
    }

    async getManifest(guildId: string) {
        const row = await this.prisma.guildAutomationManifest.findUnique({
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
        capturedState: GuildAutomationManifestDocument,
        initiatedBy?: string,
    ) {
        const capturedAt = new Date()
        const { manifestRow, run } = await this.prisma.$transaction(
            async (tx) => {
                const manifestRow = await tx.guildAutomationManifest.upsert({
                    where: { guildId },
                    create: {
                        guildId,
                        version: capturedState.version,
                        manifest: toJsonValue(capturedState),
                        lastCapturedState: toJsonValue(capturedState),
                        lastCapturedAt: capturedAt,
                        createdBy: initiatedBy,
                    },
                    update: {
                        lastCapturedState: toJsonValue(capturedState),
                        lastCapturedAt: capturedAt,
                    },
                })

                const run = await tx.guildAutomationRun.create({
                    data: {
                        guildId,
                        manifestId: manifestRow.id,
                        type: 'capture',
                        status: 'completed',
                        summary: toJsonValue({
                            capturedAt: capturedAt.toISOString(),
                            modules: Object.keys(capturedState).filter(
                                (key) => key !== 'guild' && key !== 'version',
                            ),
                        }),
                        initiatedBy,
                        completedAt: capturedAt,
                    },
                })

                return { manifestRow, run }
            },
        )

        return {
            manifestId: manifestRow.id,
            runId: run.id,
        }
    }

    async createPlanRecord(
        guildId: string,
        manifestId: string,
        runType: Extract<AutomationRunType, 'plan' | 'apply' | 'reconcile'>,
        operations: unknown[],
        protectedOperations: unknown[],
        summary: unknown,
        diagnostics: unknown,
        initiatedBy?: string,
    ) {
        const runStatus: AutomationRunStatus =
            runType === 'plan' ? 'completed' : 'running'

        const run = await this.prisma.guildAutomationRun.create({
            data: {
                guildId,
                manifestId,
                type: runType,
                status: runStatus,
                operations: toJsonValue(operations),
                protectedOperations: toJsonValue(protectedOperations),
                summary: toJsonValue(summary),
                diagnostics: toJsonValue(diagnostics),
                initiatedBy,
                completedAt: runStatus === 'completed' ? new Date() : null,
            },
        })

        return { id: run.id }
    }

    async upsertDrift(
        guildId: string,
        moduleName: string,
        drift: unknown[],
        severity: 'none' | 'low' | 'medium' | 'high',
    ) {
        await this.prisma.guildAutomationDrift.upsert({
            where: {
                guildId_module: {
                    guildId,
                    module: moduleName,
                },
            },
            create: {
                guildId,
                module: moduleName,
                drift: toJsonValue(drift),
                severity,
            },
            update: {
                drift: toJsonValue(drift),
                severity,
            },
        })
    }

    async updateRunStatus(
        runId: string,
        status: AutomationRunStatus,
        diagnostics?: Record<string, unknown>,
        error?: string,
    ) {
        return this.prisma.guildAutomationRun.update({
            where: { id: runId },
            data: {
                status,
                diagnostics: toJsonValue(diagnostics ?? {}),
                error,
                completedAt: status === 'running' ? null : new Date(),
            },
        })
    }

    async markRunFailure(runId: string, error: unknown) {
        await this.prisma.guildAutomationRun.update({
            where: { id: runId },
            data: {
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
                completedAt: new Date(),
            },
        })
    }

    async completeRun(runId: string, diagnostics?: Record<string, unknown>) {
        return this.prisma.guildAutomationRun.update({
            where: { id: runId },
            data: {
                status: 'completed',
                diagnostics: toJsonValue(diagnostics ?? {}),
                completedAt: new Date(),
            },
        })
    }

    async getManifestRow(guildId: string) {
        return this.prisma.guildAutomationManifest.findUnique({
            where: { guildId },
        })
    }

    async getStatus(guildId: string) {
        const [manifest, latestRun, drifts] = await Promise.all([
            this.prisma.guildAutomationManifest.findUnique({
                where: { guildId },
            }),
            this.prisma.guildAutomationRun.findFirst({
                where: { guildId },
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.guildAutomationDrift.findMany({
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
        nextManifest: GuildAutomationManifestDocument,
        checklist: unknown[],
        initiatedBy?: string,
    ) {
        const { run } = await this.prisma.$transaction(async (tx) => {
            const manifestRow = await tx.guildAutomationManifest.update({
                where: { guildId },
                data: {
                    version: nextManifest.version,
                    manifest: toJsonValue(nextManifest),
                },
            })

            const run = await tx.guildAutomationRun.create({
                data: {
                    guildId,
                    manifestId: manifestRow.id,
                    type: 'cutover',
                    status: 'completed',
                    summary: toJsonValue({
                        checklistComplete: true,
                        checklist: nextManifest.parity?.checklist ?? checklist,
                        externalBots: nextManifest.parity?.externalBots ?? [],
                    }),
                    initiatedBy,
                    completedAt: new Date(),
                },
            })

            return { manifestRow, run }
        })

        return {
            id: run.id,
            guildId: run.guildId,
            manifestId: run.manifestId,
        }
    }

    async listRuns(guildId: string, limit = 10) {
        return this.prisma.guildAutomationRun.findMany({
            where: { guildId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        })
    }

    async createBlockedCutoverRun(
        guildId: string,
        manifestId: string,
        checklist: unknown[],
        initiatedBy?: string,
    ) {
        return this.prisma.guildAutomationRun.create({
            data: {
                guildId,
                manifestId,
                type: 'cutover',
                status: 'blocked',
                summary: toJsonValue({
                    reason: 'Parity checklist incomplete',
                    checklist,
                }),
                initiatedBy,
                completedAt: new Date(),
            },
        })
    }
}
