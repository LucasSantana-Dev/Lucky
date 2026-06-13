import { Prisma } from '../../generated/prisma/client.js'
import type {
    AutomationModule,
    AutomationRunStatus,
    AutomationRunType,
    GuildAutomationManifestDocument,
} from './types.js'

/**
 * Repository interface for all Guild Automation database operations.
 * Abstracts Prisma implementation details from business logic.
 */
export interface IGuildAutomationRepository {
    saveManifest(
        guildId: string,
        manifest: GuildAutomationManifestDocument,
        options?: {
            createdBy?: string
            moduleOwnership?: Record<AutomationModule, boolean>
            version?: number
        },
    ): Promise<{
        id: string
        guildId: string
        version: number
        manifest: Prisma.JsonValue
        moduleOwnership: Prisma.JsonValue
        createdBy: string | null
        lastCapturedState: Prisma.JsonValue
        lastCapturedAt: Date | null
        updatedAt: Date
        createdAt: Date
    }>

    getManifest(guildId: string): Promise<{
        guildId: string
        version: number
        manifest: GuildAutomationManifestDocument
        lastCapturedState: GuildAutomationManifestDocument | null
        lastCapturedAt: Date | null
        updatedAt: Date
    } | null>

    recordCapture(
        guildId: string,
        capturedState: GuildAutomationManifestDocument,
        initiatedBy?: string,
    ): Promise<{
        manifestId: string
        runId: string
    }>

    createPlanRecord(
        guildId: string,
        manifestId: string,
        runType: Extract<AutomationRunType, 'plan' | 'apply' | 'reconcile'>,
        operations: unknown[],
        protectedOperations: unknown[],
        summary: unknown,
        diagnostics: unknown,
        initiatedBy?: string,
    ): Promise<{ id: string }>

    upsertDrift(
        guildId: string,
        moduleName: string,
        drift: unknown[],
        severity: 'none' | 'low' | 'medium' | 'high',
    ): Promise<void>

    updateRunStatus(
        runId: string,
        status: AutomationRunStatus,
        diagnostics?: Record<string, unknown>,
        error?: string,
    ): Promise<{
        id: string
        status: string
    }>

    markRunFailure(runId: string, error: unknown): Promise<void>

    completeRun(
        runId: string,
        diagnostics?: Record<string, unknown>,
    ): Promise<{
        id: string
        status: string
    }>

    getManifestRow(guildId: string): Promise<{
        id: string
        guildId: string
        version: number
        manifest: Prisma.JsonValue
        lastCapturedState: Prisma.JsonValue
        createdBy: string | null
        lastCapturedAt: Date | null
        updatedAt: Date
    } | null>

    getStatus(guildId: string): Promise<{
        manifest: {
            guildId: string
            version: number
            updatedAt: Date
            lastCapturedAt: Date | null
        } | null
        latestRun: {
            id: string
            type: string
            status: string
            createdAt: Date
        } | null
        drifts: Array<{
            module: string
            severity: string
            updatedAt: Date
        }>
    }>

    runCutover(
        guildId: string,
        nextManifest: GuildAutomationManifestDocument,
        checklist: unknown[],
        initiatedBy?: string,
    ): Promise<{
        id: string
        guildId: string
        manifestId: string | null
    }>

    listRuns(
        guildId: string,
        limit?: number,
    ): Promise<
        Array<{
            id: string
            guildId: string
            manifestId: string | null
            type: string
            status: string
            operations: Prisma.JsonValue
            protectedOperations: Prisma.JsonValue
            summary: Prisma.JsonValue
            diagnostics: Prisma.JsonValue
            error: string | null
            initiatedBy: string | null
            completedAt: Date | null
            updatedAt: Date
            createdAt: Date
        }>
    >

    createBlockedCutoverRun(
        guildId: string,
        manifestId: string,
        checklist: unknown[],
        initiatedBy?: string,
    ): Promise<{
        id: string
        guildId: string
    }>
}
