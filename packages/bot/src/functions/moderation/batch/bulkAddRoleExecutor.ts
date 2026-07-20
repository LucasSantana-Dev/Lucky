import {
    type BatchJobExecutor,
    type BatchProgress,
    batchJobService,
} from '@lucky/shared/services/batch'
import { errorLog } from '@lucky/shared/utils'
import { PermissionFlagsBits, type GuildMember } from 'discord.js'
import type { CustomClient } from '../../../types'
import { getStoredClient } from '../../../bot/clientStore'

// Discord REST error codes we treat as "already has role" or "unmanageable".
const MISSING_PERMISSIONS = 50013
const UNKNOWN_MEMBER = 10007

type AddRoleOutcome = 'added' | 'skipped' | 'failed'

/**
 * Executes a `bulk_add_role` batch job: adds a target role to every non-bot
 * member holding a filter role. Mirrors the bulk-kick cursor/cancellation/pause
 * contract.
 */
export class BulkAddRoleExecutor implements BatchJobExecutor {
    jobType: 'bulk_add_role' = 'bulk_add_role'

    estimateMinutes(job: { totalItems: number }): number {
        return Math.min(Math.max(Math.ceil(job.totalItems * 0.04), 1), 5000)
    }

    async execute(
        job: {
            id: string
            guildId: string
            totalItems: number
            options?: Record<string, unknown>
        },
        onProgress: (progress: BatchProgress) => Promise<void>,
    ): Promise<Record<string, unknown>> {
        const client = getStoredClient() as CustomClient | null
        if (!client) {
            throw new Error('Discord client not available')
        }

        const { id: jobId, guildId, totalItems: total, options } = job
        const filterRoleId =
            typeof options?.filterRoleId === 'string'
                ? options.filterRoleId
                : undefined
        const targetRoleId =
            typeof options?.targetRoleId === 'string'
                ? options.targetRoleId
                : undefined
        if (!filterRoleId || !targetRoleId) {
            throw new Error('bulk_add_role requires options.filterRoleId and options.targetRoleId')
        }

        const dbJob = await batchJobService.getById(jobId)
        const queue = await this.resolveTargets(
            client,
            guildId,
            filterRoleId,
            targetRoleId,
            (dbJob as { nextCursor?: string })?.nextCursor || undefined,
        )

        const tally: Record<AddRoleOutcome, number> = {
            added: (dbJob as { processedItems?: number })?.processedItems ?? 0,
            skipped: (dbJob as { skippedItems?: number })?.skippedItems ?? 0,
            failed: (dbJob as { failedItems?: number })?.failedItems ?? 0,
        }

        for (const member of queue) {
            const refreshed = await batchJobService.getById(jobId)
            if (refreshed?.status === 'cancelled') {
                return { ...this.summary(tally), cancelled: true }
            }
            if (!getStoredClient()) {
                return { ...this.summary(tally), paused: true }
            }

            const done = tally.added + tally.skipped + tally.failed + 1
            await onProgress({
                processed: tally.added + 1,
                failed: tally.failed,
                skipped: tally.skipped,
                total,
                percentComplete:
                    total > 0 ? Math.round((done / total) * 100) : 100,
                message: `Adding role ${tally.added + 1}/${total} (skipped ${tally.skipped}, failed ${tally.failed})`,
                nextCursor: member.id,
            })

            tally[await this.addRole(member, targetRoleId)]++
        }

        await onProgress({
            processed: tally.added,
            failed: tally.failed,
            skipped: tally.skipped,
            total,
            percentComplete: 100,
            message: `Bulk add-role complete: ${tally.added} added, ${tally.skipped} skipped, ${tally.failed} failed`,
        })

        return this.summary(tally)
    }

    private async resolveTargets(
        client: CustomClient,
        guildId: string,
        filterRoleId: string,
        targetRoleId: string,
        cursor: string | undefined,
    ): Promise<GuildMember[]> {
        const guild = await client.guilds.fetch(guildId).catch(() => null)
        if (!guild) {
            throw new Error(`Guild not found: ${guildId}`)
        }
        if (
            !guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)
        ) {
            throw new Error('Bot missing Manage Roles permission')
        }

        await guild.members.fetch()
        const filterRole = await guild.roles.fetch(filterRoleId).catch(() => null)
        if (!filterRole) {
            throw new Error(`Filter role not found: ${filterRoleId}`)
        }

        const targetRole = await guild.roles.fetch(targetRoleId).catch(() => null)
        if (!targetRole) {
            throw new Error(`Target role not found: ${targetRoleId}`)
        }

        // Ensure bot can assign the target role (hierarchy check)
        if (targetRole.position >= guild.members.me.roles.highest.position) {
            throw new Error('Target role is higher than bot\'s highest role')
        }

        const targets = [...filterRole.members.values()]
            .filter((member) => !member.user.bot)
            .filter((member) => !member.roles.cache.has(targetRoleId))
            .sort((a, b) => a.id.localeCompare(b.id))

        return cursor
            ? targets.filter((member) => member.id.localeCompare(cursor) > 0)
            : targets
    }

    private summary(tally: Record<AddRoleOutcome, number>): {
        added: number
        skipped: number
        failed: number
    } {
        return {
            added: tally.added,
            skipped: tally.skipped,
            failed: tally.failed,
        }
    }

    private async addRole(
        member: GuildMember,
        targetRoleId: string,
    ): Promise<AddRoleOutcome> {
        if (!member.manageable) {
            return 'skipped'
        }
        try {
            await member.roles.add(targetRoleId)
            return 'added'
        } catch (err) {
            const code = (err as { code?: number })?.code
            if (code === MISSING_PERMISSIONS || code === UNKNOWN_MEMBER) {
                return 'skipped'
            }
            errorLog({
                message: `bulk_add_role: failed to add role to member ${member.id}`,
                error: err,
            })
            return 'failed'
        }
    }
}
