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
const UNKNOWN_BAN = 10026

type BanOutcome = 'banned' | 'skipped' | 'failed'

/**
 * Executes a `bulk_ban` batch job: bans every non-bot member holding the
 * target role (`options.roleId`). Mirrors {@link BulkKickExecutor}'s
 * cursor/cancellation/pause contract so a restart resumes from the last banned
 * member (targets are sorted by id; the cursor is the last processed id).
 */
export class BulkBanExecutor implements BatchJobExecutor {
    jobType: 'bulk_ban' = 'bulk_ban'

    estimateMinutes(job: { totalItems: number }): number {
        // ~0.05 min per ban (one rate-limited REST call each).
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
            throw new Error('bulk_ban requires options.roleId')
        }

        const dbJob = await batchJobService.getById(jobId)
        const queue = await this.resolveBanTargets(
            client,
            guildId,
            roleId,
            (dbJob as { nextCursor?: string })?.nextCursor || undefined,
        )

        // Initialize tally with prior counts from resume, if any
        const tally: Record<BanOutcome, number> = {
            banned: (dbJob as { processedItems?: number })?.processedItems ?? 0,
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
            // if a crash occurs between checkpoint and ban, resume skips this
            // member rather than double-banning.
            const done = tally.banned + tally.skipped + tally.failed + 1
            await onProgress({
                processed: tally.banned + 1,
                failed: tally.failed,
                skipped: tally.skipped,
                total,
                percentComplete:
                    total > 0 ? Math.round((done / total) * 100) : 100,
                message: `Banning ${tally.banned + 1}/${total} (skipped ${tally.skipped}, failed ${tally.failed})`,
                nextCursor: member.id,
            })

            tally[await this.banMember(member, reason)]++
        }

        await onProgress({
            processed: tally.banned,
            failed: tally.failed,
            skipped: tally.skipped,
            total,
            percentComplete: 100,
            message: `Bulk ban complete: ${tally.banned} banned, ${tally.skipped} skipped, ${tally.failed} failed`,
        })

        return this.summary(tally)
    }

    /**
     * Resolve the ordered set of members to ban: non-bot holders of the role,
     * sorted by id, minus any already processed in a prior run (id <= cursor).
     * Throws if the guild/role is gone or the bot lacks Ban Members.
     */
    private async resolveBanTargets(
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
            !guild.members.me?.permissions.has(PermissionFlagsBits.BanMembers)
        ) {
            throw new Error('Bot missing Ban Members permission')
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

    private summary(tally: Record<BanOutcome, number>): {
        banned: number
        skipped: number
        failed: number
    } {
        return {
            banned: tally.banned,
            skipped: tally.skipped,
            failed: tally.failed,
        }
    }

    /** Ban one member; classify the result. Never throws. */
    private async banMember(
        member: GuildMember,
        reason: string | undefined,
    ): Promise<BanOutcome> {
        // Owner, higher role, or bot lacks perms for this specific member.
        if (!member.bannable) {
            return 'skipped'
        }
        try {
            await member.ban({ reason })
            return 'banned'
        } catch (err) {
            const code = (err as { code?: number })?.code
            if (
                code === UNKNOWN_MEMBER ||
                code === MISSING_PERMISSIONS ||
                code === UNKNOWN_BAN
            ) {
                return 'skipped'
            }
            errorLog({
                message: `bulk_ban: failed to ban member ${member.id}`,
                error: err,
            })
            return 'failed'
        }
    }
}
