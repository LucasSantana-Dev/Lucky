import {
    type BatchJobExecutor,
    type BatchProgress,
    batchJobService,
} from '@lucky/shared/services/batch'
import { errorLog } from '@lucky/shared/utils'
import { PermissionFlagsBits, type GuildMember } from 'discord.js'
import type { CustomClient } from '../../../types'
import { getStoredClient } from '../../../bot/clientStore'
import { moderationService } from '@lucky/shared/services'

type WarnOutcome = 'warned' | 'skipped' | 'failed'

/**
 * Executes a `bulk_warn` batch job: creates a moderation warning case for
 * every non-bot member holding the target role (`options.roleId`).
 * Mirrors the bulk-kick/bulk-ban cursor/cancellation/pause contract.
 */
export class BulkWarnExecutor implements BatchJobExecutor {
    jobType: 'bulk_warn' = 'bulk_warn'

    estimateMinutes(job: { totalItems: number }): number {
        // ~0.03 min per warn (DB write, no Discord REST call).
        return Math.min(Math.max(Math.ceil(job.totalItems * 0.03), 1), 5000)
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
        const roleId =
            typeof options?.roleId === 'string' ? options.roleId : undefined
        const reason =
            typeof options?.reason === 'string'
                ? options.reason
                : 'No reason provided'
        const moderatorId =
            typeof options?.moderatorId === 'string'
                ? options.moderatorId
                : undefined
        const moderatorName =
            typeof options?.moderatorName === 'string'
                ? options.moderatorName
                : 'Unknown'
        if (!roleId) {
            throw new Error('bulk_warn requires options.roleId')
        }

        const dbJob = await batchJobService.getById(jobId)
        const queue = await this.resolveWarnTargets(
            client,
            guildId,
            roleId,
            (dbJob as { nextCursor?: string })?.nextCursor || undefined,
        )

        const tally: Record<WarnOutcome, number> = {
            warned: (dbJob as { processedItems?: number })?.processedItems ?? 0,
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

            const done = tally.warned + tally.skipped + tally.failed + 1
            await onProgress({
                processed: tally.warned + 1,
                failed: tally.failed,
                skipped: tally.skipped,
                total,
                percentComplete:
                    total > 0 ? Math.round((done / total) * 100) : 100,
                message: `Warning ${tally.warned + 1}/${total} (skipped ${tally.skipped}, failed ${tally.failed})`,
                nextCursor: member.id,
            })

            tally[await this.warnMember(member, reason, moderatorId, moderatorName, guildId)]++
        }

        await onProgress({
            processed: tally.warned,
            failed: tally.failed,
            skipped: tally.skipped,
            total,
            percentComplete: 100,
            message: `Bulk warn complete: ${tally.warned} warned, ${tally.skipped} skipped, ${tally.failed} failed`,
        })

        return this.summary(tally)
    }

    private async resolveWarnTargets(
        client: CustomClient,
        guildId: string,
        roleId: string,
        cursor: string | undefined,
    ): Promise<GuildMember[]> {
        const guild = await client.guilds.fetch(guildId).catch(() => null)
        if (!guild) {
            throw new Error(`Guild not found: ${guildId}`)
        }
        if (
            !guild.members.me?.permissions.has(
                PermissionFlagsBits.ModerateMembers,
            )
        ) {
            throw new Error('Bot missing Moderate Members permission')
        }

        await guild.members.fetch()
        const role = await guild.roles.fetch(roleId).catch(() => null)
        if (!role) {
            throw new Error(`Role not found: ${roleId}`)
        }

        const targets = [...role.members.values()]
            .filter((member) => !member.user.bot)
            .sort((a, b) => a.id.localeCompare(b.id))

        return cursor
            ? targets.filter((member) => member.id.localeCompare(cursor) > 0)
            : targets
    }

    private summary(tally: Record<WarnOutcome, number>): {
        warned: number
        skipped: number
        failed: number
    } {
        return {
            warned: tally.warned,
            skipped: tally.skipped,
            failed: tally.failed,
        }
    }

    private async warnMember(
        member: GuildMember,
        reason: string,
        moderatorId: string | undefined,
        moderatorName: string,
        guildId: string,
    ): Promise<WarnOutcome> {
        if (!moderatorId) {
            return 'skipped'
        }
        try {
            await moderationService.createCase({
                guildId,
                type: 'warn',
                userId: member.id,
                username: member.user.tag,
                moderatorId,
                moderatorName,
                reason,
                channelId: null,
            })
            return 'warned'
        } catch (err) {
            errorLog({
                message: `bulk_warn: failed to create warning case for member ${member.id}`,
                error: err,
            })
            return 'failed'
        }
    }
}
