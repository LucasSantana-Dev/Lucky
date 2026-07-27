import {
    type BatchJobExecutor,
    type BatchProgress,
    batchJobService,
} from '@lucky/shared/services/batch'
import { errorLog } from '@lucky/shared/utils'
import { PermissionFlagsBits, type GuildMember } from 'discord.js'
import type { CustomClient } from '../../../types'
import { getStoredClient } from '../../../bot/clientStore'

// Discord REST error codes we treat as "already gone" rather than a failure.
const UNKNOWN_MEMBER = 10007
const MISSING_PERMISSIONS = 50013

type KickOutcome = 'kicked' | 'skipped' | 'failed'

/**
 * Executes a `bulk_kick` batch job: kicks every non-bot member holding the
 * target role (`options.roleId`). Mirrors {@link ChannelMoveBatchExecutor}'s
 * cursor/cancellation/pause contract so a restart resumes from the last kicked
 * member (targets are sorted by id; the cursor is the last processed id).
 */
export class BulkKickExecutor implements BatchJobExecutor {
    jobType: 'bulk_kick' = 'bulk_kick'

    estimateMinutes(job: { totalItems: number }): number {
        // ~0.05 min per kick (one rate-limited REST call each).
        return Math.min(Math.max(Math.ceil(job.totalItems * 0.05), 1), 5000)
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
            typeof options?.reason === 'string' ? options.reason : undefined
        if (!roleId) {
            throw new Error('bulk_kick requires options.roleId')
        }

        const dbJob = await batchJobService.getById(jobId)
        const queue = await this.resolveKickTargets(
            client,
            guildId,
            roleId,
            (dbJob as { nextCursor?: string })?.nextCursor || undefined,
        )

        // Initialize tally with prior counts from resume, if any
        const tally: Record<KickOutcome, number> = {
            kicked: (dbJob as { processedItems?: number })?.processedItems ?? 0,
            skipped: (dbJob as { skippedItems?: number })?.skippedItems ?? 0,
            failed: (dbJob as { failedItems?: number })?.failedItems ?? 0,
        }

        for (const member of queue) {
            // Stop cleanly if the job was cancelled or the bot disconnected.
            const refreshed = await batchJobService.getById(jobId)
            if (refreshed?.status === 'cancelled') {
                return { ...this.summary(tally), cancelled: true }
            }
            if (!getStoredClient()) {
                return { ...this.summary(tally), paused: true }
            }

            // Checkpoint BEFORE the destructive step to ensure crash-safety:
            // if a crash occurs between checkpoint and kick, resume skips this
            // member rather than double-kicking.
            const done = tally.kicked + tally.skipped + tally.failed + 1
            await onProgress({
                processed: tally.kicked + 1,
                failed: tally.failed,
                skipped: tally.skipped,
                total,
                percentComplete:
                    total > 0 ? Math.round((done / total) * 100) : 100,
                message: `Kicking ${tally.kicked + 1}/${total} (skipped ${tally.skipped}, failed ${tally.failed})`,
                nextCursor: member.id,
            })

            tally[await this.kickMember(member, reason)]++
        }

        await onProgress({
            processed: tally.kicked,
            failed: tally.failed,
            skipped: tally.skipped,
            total,
            percentComplete: 100,
            message: `Bulk kick complete: ${tally.kicked} kicked, ${tally.skipped} skipped, ${tally.failed} failed`,
        })

        return this.summary(tally)
    }

    /**
     * Resolve the ordered set of members to kick: non-bot holders of the role,
     * sorted by id, minus any already processed in a prior run (id <= cursor).
     * Throws if the guild/role is gone or the bot lacks Kick Members.
     */
    private async resolveKickTargets(
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
            !guild.members.me?.permissions.has(PermissionFlagsBits.KickMembers)
        ) {
            throw new Error('Bot missing Kick Members permission')
        }

        // Fetching members populates the cache so role.members is complete.
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

    private summary(tally: Record<KickOutcome, number>): {
        kicked: number
        skipped: number
        failed: number
    } {
        return {
            kicked: tally.kicked,
            skipped: tally.skipped,
            failed: tally.failed,
        }
    }

    /** Kick one member; classify the result. Never throws. */
    private async kickMember(
        member: GuildMember,
        reason: string | undefined,
    ): Promise<KickOutcome> {
        // Owner, higher role, or bot lacks perms for this specific member.
        if (!member.kickable) {
            return 'skipped'
        }
        try {
            await member.kick(reason)
            return 'kicked'
        } catch (err) {
            const code = (err as { code?: number })?.code
            if (code === UNKNOWN_MEMBER || code === MISSING_PERMISSIONS) {
                return 'skipped'
            }
            errorLog({
                message: `bulk_kick: failed to kick member ${member.id}`,
                error: err,
            })
            return 'failed'
        }
    }
}
