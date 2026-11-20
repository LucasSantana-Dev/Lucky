/**
 * Database service for managing PostgreSQL operations
 */

import { randomUUID } from 'node:crypto'
import { getPrismaClient } from '../../utils/database/prismaClient'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { Result } from '../../types/common/BaseResult'
import { errorLog } from '../../utils/general/log'

/**
 * Guild-scoped tables purged once a guild has been gone longer than the grace
 * period (#2377). Every model listed has a `guildId` column holding the guild's
 * Discord id. Child rows without a `guildId` (reaction_role_mappings,
 * batch_job_items, giveaway_entries) go with their parent via ON DELETE CASCADE.
 * Listed children first so the per-table counts are not hidden by a cascade.
 */
export const GUILD_PURGE_TARGETS = [
    { table: 'server_logs', model: 'serverLog' },
    { table: 'log_settings', model: 'logSettings' },
    { table: 'moderation_cases', model: 'moderationCase' },
    { table: 'moderation_settings', model: 'moderationSettings' },
    { table: 'automod_settings', model: 'autoModSettings' },
    { table: 'mod_digest_config', model: 'modDigestConfig' },
    { table: 'member_xp', model: 'memberXP' },
    { table: 'level_configs', model: 'levelConfig' },
    { table: 'level_rewards', model: 'levelReward' },
    { table: 'member_birthdays', model: 'memberBirthday' },
    { table: 'afk_statuses', model: 'afkStatus' },
    { table: 'reminders', model: 'reminder' },
    { table: 'starboard_entries', model: 'starboardEntry' },
    { table: 'starboard_configs', model: 'starboardConfig' },
    { table: 'starboard_dm_sents', model: 'starboardDmSent' },
    { table: 'giveaways', model: 'giveaway' },
    { table: 'track_history', model: 'trackHistory' },
    { table: 'recommendations', model: 'recommendation' },
    { table: 'user_track_feedbacks', model: 'userTrackFeedback' },
    { table: 'user_artist_preferences', model: 'userArtistPreference' },
    { table: 'named_queues', model: 'namedQueue' },
    { table: 'music_session_snapshots', model: 'musicSessionSnapshot' },
    { table: 'guild_sessions', model: 'guildSession' },
    { table: 'guild_counters', model: 'guildCounter' },
    { table: 'guild_settings', model: 'guildSettings' },
    { table: 'guild_feature_toggles', model: 'guildFeatureToggle' },
    { table: 'guild_role_grants', model: 'guildRoleGrant' },
    { table: 'guild_automation_runs', model: 'guildAutomationRun' },
    { table: 'guild_automation_drifts', model: 'guildAutomationDrift' },
    { table: 'guild_automation_manifests', model: 'guildAutomationManifest' },
    { table: 'reaction_role_messages', model: 'reactionRoleMessage' },
    { table: 'role_groups', model: 'roleGroup' },
    { table: 'role_exclusions', model: 'roleExclusion' },
    { table: 'auto_roles', model: 'autoRole' },
    { table: 'embed_templates', model: 'embedTemplate' },
    { table: 'auto_messages', model: 'autoMessage' },
    { table: 'custom_commands', model: 'customCommand' },
    { table: 'channel_cleanup_configs', model: 'channelCleanupConfig' },
    { table: 'twitch_notifications', model: 'twitchNotification' },
    { table: 'twitch_follower_links', model: 'twitchFollowerLink' },
    { table: 'twitch_follower_roles', model: 'twitchFollowerRole' },
    { table: 'twitch_subscriber_roles', model: 'twitchSubscriberRole' },
    {
        table: 'scheduled_event_notifications',
        model: 'scheduledEventNotification',
    },
    { table: 'rss_feed_subscriptions', model: 'rssFeedSubscription' },
    { table: 'guild_forum_threads', model: 'guildForumThread' },
    { table: 'batch_jobs', model: 'batchJob' },
    { table: 'support_sessions', model: 'supportSession' },
    { table: 'weekly_digest_snapshots', model: 'weeklyDigestSnapshot' },
] as const

/** Guild-scoped tables the purge deliberately leaves alone, with the reason. */
export const GUILD_PURGE_KEPT_TABLES = [
    { table: 'guilds', reason: 'join/leave analytics; holds leftAt itself' },
    { table: 'guild_membership_events', reason: 'join/leave analytics' },
    { table: 'guild_join_sources', reason: 'acquisition analytics' },
    { table: 'activation_events', reason: 'analytics, own 180-day sweep' },
    { table: 'command_events', reason: 'analytics, own 180-day sweep' },
    { table: 'user_feedback', reason: 'product feedback, own 180-day sweep' },
    { table: 'guild_subscriptions', reason: 'billing record (Stripe)' },
    { table: 'support_reports', reason: 'support triage, guildId optional' },
] as const

export type GuildPurgeSummary = {
    /** Departed guilds past the grace period that were swept. */
    guilds: number
    /**
     * Rows deleted per table; tables with zero deletions are omitted. Rows
     * removed by FK cascade (reaction_role_mappings, batch_job_items,
     * giveaway_entries) are not counted.
     */
    deleted: Record<string, number>
}

const GUILD_PURGE_TX_TIMEOUT_MS = 60_000

type DeleteManyDelegate = {
    deleteMany(args: {
        where: { guildId: { in: string[] } }
    }): ReturnType<PrismaClient['serverLog']['deleteMany']>
}

/** Rate limiting and data retention on top of the shared Prisma client. */
export class DatabaseService {
    private readonly prisma: PrismaClient

    constructor() {
        this.prisma = getPrismaClient()
    }

    private async executeWithFallback<T>(
        operation: () => Promise<T>,
        operationName: string,
    ): Promise<Result<T>> {
        try {
            const result = await operation()
            return Result.success(result)
        } catch (error) {
            errorLog({ message: `${operationName} failed`, error })
            return Result.failure(
                error instanceof Error
                    ? error
                    : new Error('Database operation failed'),
            )
        }
    }

    /** Checks whether the given key is within the allowed rate limit window. */
    async checkRateLimit(
        key: string,
        limit: number,
        windowMs: number,
    ): Promise<Result<boolean>> {
        return this.executeWithFallback(async () => {
            const now = new Date()
            const resetAt = new Date(now.getTime() + windowMs)

            // Single atomic statement: concurrent callers serialize on the
            // row lock, so check and increment cannot interleave.
            const rows: unknown = await this.prisma.$queryRaw`
                INSERT INTO "rate_limits" ("id", "key", "count", "resetAt")
                VALUES (${randomUUID()}, ${key}, 1, ${resetAt})
                ON CONFLICT ("key") DO UPDATE SET
                    "count" = CASE
                        WHEN "rate_limits"."resetAt" < ${now}
                        THEN 1
                        ELSE "rate_limits"."count" + 1
                    END,
                    "resetAt" = CASE
                        WHEN "rate_limits"."resetAt" < ${now}
                        THEN ${resetAt}
                        ELSE "rate_limits"."resetAt"
                    END
                RETURNING "count"
            `
            const count = Array.isArray(rows)
                ? (rows[0] as { count?: unknown } | undefined)?.count
                : undefined
            if (typeof count !== 'number') {
                throw new Error('Invalid rate limit result')
            }
            return count <= limit
        }, 'check_rate_limit')
    }

    /** Deletes track history, expired rate limit records, and server logs older than 30 days,
     * user feedback (#2477), command events (#2391) and activation events older than their own 180-day window. */
    async cleanupOldData(): Promise<Result<number>> {
        return this.executeWithFallback(async () => {
            const thirtyDaysAgo = new Date(
                Date.now() - 30 * 24 * 60 * 60 * 1000,
            )
            const oneHundredEightyDaysAgo = new Date(
                Date.now() - 180 * 24 * 60 * 60 * 1000,
            )

            const [
                tracks,
                rateLimits,
                serverLogs,
                userFeedback,
                commandEvents,
                activationEvents,
            ] = await Promise.all([
                this.prisma.trackHistory.deleteMany({
                    where: { playedAt: { lt: thirtyDaysAgo } },
                }),
                this.prisma.rateLimit.deleteMany({
                    where: { resetAt: { lt: new Date() } },
                }),
                this.prisma.serverLog.deleteMany({
                    where: { createdAt: { lt: thirtyDaysAgo } },
                }),
                this.prisma.userFeedback.deleteMany({
                    where: { createdAt: { lt: oneHundredEightyDaysAgo } },
                }),
                this.prisma.commandEvent.deleteMany({
                    where: { occurredAt: { lt: oneHundredEightyDaysAgo } },
                }),
                this.prisma.activationEvent.deleteMany({
                    where: { occurredAt: { lt: oneHundredEightyDaysAgo } },
                }),
            ])

            return (
                tracks.count +
                rateLimits.count +
                serverLogs.count +
                userFeedback.count +
                commandEvents.count +
                activationEvents.count
            )
        }, 'cleanup_old_data')
    }

    /**
     * Deletes guild-scoped data for guilds the bot left more than `graceDays`
     * ago (#2377). Rejoined guilds have `leftAt` null and never match, and
     * `activeGuildIds` (the bot's live guild cache) is excluded too. Keeps
     * the `guilds` row and the tables in GUILD_PURGE_KEPT_TABLES. Safe to run
     * repeatedly: a second pass over the same guilds deletes nothing.
     */
    async purgeDepartedGuildData(
        graceDays: number,
        activeGuildIds: readonly string[] = [],
    ): Promise<Result<GuildPurgeSummary>> {
        return this.executeWithFallback(async () => {
            const cutoff = new Date(
                Date.now() - graceDays * 24 * 60 * 60 * 1000,
            )
            // Lock the eligible guild rows for the whole purge: a concurrent
            // rejoin (recordGuildJoin clears leftAt) waits for this commit
            // instead of having its data deleted after it came back.
            return this.prisma.$transaction(
                async (tx) => {
                    const departed = await tx.$queryRaw<
                        { discordId: string }[]
                    >`SELECT "discordId" FROM "guilds" WHERE "leftAt" < ${cutoff} FOR UPDATE`
                    // A guild the bot is in right now is never purged, even if
                    // recordGuildJoin has not committed yet: discord.js adds it
                    // to the cache before GuildCreate fires, so before anyone
                    // can write new config for it.
                    const active = new Set(activeGuildIds)
                    const ids = departed
                        .map((g) => g.discordId)
                        .filter((id) => !active.has(id))
                    if (ids.length === 0) return { guilds: 0, deleted: {} }

                    const where = { guildId: { in: ids } }
                    const deleted: Record<string, number> = {}
                    for (const { table, model } of GUILD_PURGE_TARGETS) {
                        const { count } = await (
                            tx[model] as unknown as DeleteManyDelegate
                        ).deleteMany({ where })
                        if (count > 0) deleted[table] = count
                    }
                    return { guilds: ids.length, deleted }
                },
                { timeout: GUILD_PURGE_TX_TIMEOUT_MS },
            )
        }, 'purge_departed_guild_data')
    }
}
