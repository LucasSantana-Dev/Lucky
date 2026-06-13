import { getPrismaClient } from '../utils/database/prismaClient.js'
import * as helpers from './serverLogHelpers.js'

const prisma = getPrismaClient()

/** Represents a server audit log entry. */
export type ServerLog = {
    id: string
    guildId: string
    type: string
    userId: string | null
    channelId: string | null
    moderatorId: string | null
    details: unknown
    createdAt: Date
}

/** Discriminated union of all server log event types. */
export type LogType =
    | 'message_delete'
    | 'message_edit'
    | 'member_join'
    | 'member_leave'
    | 'role_update'
    | 'channel_update'
    | 'voice_state'
    | 'mod_action'
    | 'mod_case_update'
    | 'automod_trigger'
    | 'automod_settings'
    | 'custom_command'
    | 'embed_template'
    | 'auto_message'
    | 'settings_change'

/** Arbitrary key-value payload attached to a log entry. */
export interface LogDetails {
    [key: string]: unknown
}

/** Service for creating and querying server audit logs persisted in the database. */
export class ServerLogService {
    /** Creates a new audit log entry for the given guild. */
    async createLog(
        guildId: string,
        type: LogType,
        action: string,
        details: LogDetails,
        options?: { userId?: string; channelId?: string; moderatorId?: string },
    ) {
        return await prisma.serverLog.create({
            data: {
                guildId,
                type,
                action,
                details: JSON.stringify(details),
                userId: options?.userId,
                channelId: options?.channelId,
                moderatorId: options?.moderatorId,
            },
        })
    }

    /** Retrieves logs of a specific type for a guild, most recent first. */
    async getLogsByType(guildId: string, type: LogType, limit: number = 50) {
        return await prisma.serverLog.findMany({
            where: { guildId, type },
            orderBy: { createdAt: 'desc' },
            take: limit,
        })
    }

    /** Retrieves all logs attributed to a specific user in a guild. */
    async getUserLogs(guildId: string, userId: string, limit: number = 50) {
        return await prisma.serverLog.findMany({
            where: { guildId, userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        })
    }

    /** Retrieves the most recent logs across all types for a guild. */
    async getRecentLogs(guildId: string, limit: number = 100) {
        return await prisma.serverLog.findMany({
            where: { guildId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        })
    }

    /** Returns the total number of log entries for a guild. */
    async countRecentLogs(guildId: string) {
        return await prisma.serverLog.count({ where: { guildId } })
    }

    /** Returns the count of logs of a specific type for a guild. */
    async countLogsByType(guildId: string, type: LogType) {
        return await prisma.serverLog.count({
            where: { guildId, type },
        })
    }

    /** Searches logs with optional filters on type, user, channel, moderator, and date range. */
    async searchLogs(
        guildId: string,
        filters: {
            type?: LogType
            userId?: string
            channelId?: string
            moderatorId?: string
            startDate?: Date
            endDate?: Date
        },
        limit: number = 100,
    ) {
        return await prisma.serverLog.findMany({
            where: {
                guildId,
                ...(filters.type && { type: filters.type }),
                ...(filters.userId && { userId: filters.userId }),
                ...(filters.channelId && { channelId: filters.channelId }),
                ...(filters.moderatorId && {
                    moderatorId: filters.moderatorId,
                }),
                ...((filters.startDate || filters.endDate) && {
                    createdAt: {
                        ...(filters.startDate && { gte: filters.startDate }),
                        ...(filters.endDate && { lte: filters.endDate }),
                    },
                }),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
        })
    }

    /** Deletes log entries older than the specified number of days and returns the deletion count. */
    async deleteOldLogs(guildId: string, daysToKeep: number = 30) {
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)
        const result = await prisma.serverLog.deleteMany({
            where: { guildId, createdAt: { lt: cutoffDate } },
        })
        return result.count
    }

    /** Returns log statistics including total count and per-type breakdown. */
    async getStats(guildId: string) {
        const [totalLogs, logsByType] = await Promise.all([
            prisma.serverLog.count({ where: { guildId } }),
            prisma.serverLog.groupBy({
                by: ['type'],
                where: { guildId },
                _count: true,
            }),
        ])
        return {
            totalLogs,
            logsByType: Object.fromEntries(
                logsByType.map((item: { type: string; _count: number }) => [
                    item.type,
                    item._count,
                ]),
            ),
        }
    }

    /** Logs a message deletion event. */
    async logMessageDelete(
        guildId: string,
        messageId: string,
        channelId: string,
        userId: string,
        content: string,
        moderatorId?: string,
    ) {
        return helpers.logMessageDelete(
            this,
            guildId,
            messageId,
            channelId,
            userId,
            content,
            moderatorId,
        )
    }

    /** Logs a message edit event. */
    async logMessageEdit(
        guildId: string,
        messageId: string,
        channelId: string,
        userId: string,
        oldContent: string,
        newContent: string,
    ) {
        return helpers.logMessageEdit(
            this,
            guildId,
            messageId,
            channelId,
            userId,
            oldContent,
            newContent,
        )
    }

    /** Logs a member join event. */
    async logMemberJoin(
        guildId: string,
        userId: string,
        username: string,
        accountCreated: Date,
    ) {
        return helpers.logMemberJoin(
            this,
            guildId,
            userId,
            username,
            accountCreated,
        )
    }

    /** Logs a member leave event. */
    async logMemberLeave(
        guildId: string,
        userId: string,
        username: string,
        roles: string[],
    ) {
        return helpers.logMemberLeave(this, guildId, userId, username, roles)
    }

    /** Logs a role assignment or removal event for a user. */
    async logRoleUpdate(
        guildId: string,
        userId: string,
        addedRoles: string[],
        removedRoles: string[],
        moderatorId?: string,
    ) {
        return helpers.logRoleUpdate(
            this,
            guildId,
            userId,
            addedRoles,
            removedRoles,
            moderatorId,
        )
    }

    /** Logs a voice channel state change event. */
    async logVoiceState(
        guildId: string,
        userId: string,
        action: 'join' | 'leave' | 'move',
        channelId: string,
        oldChannelId?: string,
    ) {
        return helpers.logVoiceState(
            this,
            guildId,
            userId,
            action,
            channelId,
            oldChannelId,
        )
    }

    /** Logs a moderation action event. */
    async logModerationAction(
        guildId: string,
        action: string,
        details: {
            caseNumber: number
            type: string
            userId: string
            username: string
            reason?: string
            duration?: number
            silent?: boolean
        },
        moderatorId: string,
    ) {
        return helpers.logModerationAction(
            this,
            guildId,
            action,
            details,
            moderatorId,
        )
    }

    /** Logs a moderation case update event. */
    async logCaseUpdate(
        guildId: string,
        details: {
            caseNumber: number
            changeType:
                | 'reason_update'
                | 'deactivated'
                | 'appeal_submitted'
                | 'appeal_reviewed'
            oldValue?: string
            newValue?: string
        },
        moderatorId: string,
    ) {
        return helpers.logCaseUpdate(this, guildId, details, moderatorId)
    }

    /** Logs an auto-moderation trigger event. */
    async logAutoModTrigger(
        guildId: string,
        details: {
            rule: string
            action: string
            messageContent?: string
            channelId: string
        },
        userId: string,
    ) {
        return helpers.logAutoModTrigger(this, guildId, details, userId)
    }

    /** Logs an auto-moderation settings change event. */
    async logAutoModSettingsChange(
        guildId: string,
        details: {
            module: string
            enabled: boolean
            changes: Record<string, unknown>
        },
        moderatorId: string,
    ) {
        return helpers.logAutoModSettingsChange(
            this,
            guildId,
            details,
            moderatorId,
        )
    }

    /** Logs a custom command create, update, or delete event. */
    async logCustomCommandChange(
        guildId: string,
        action: 'created' | 'updated' | 'deleted',
        details: { commandName: string; changes?: Record<string, unknown> },
        moderatorId: string,
    ) {
        return helpers.logCustomCommandChange(
            this,
            guildId,
            action,
            details,
            moderatorId,
        )
    }

    /** Logs an embed template create, update, delete, or send event. */
    async logEmbedTemplateChange(
        guildId: string,
        action: 'created' | 'updated' | 'deleted' | 'sent',
        details: { templateName: string; channelId?: string },
        moderatorId: string,
    ) {
        return helpers.logEmbedTemplateChange(
            this,
            guildId,
            action,
            details,
            moderatorId,
        )
    }

    /** Logs an auto-message create, update, enable, or disable event. */
    async logAutoMessageChange(
        guildId: string,
        action: 'created' | 'updated' | 'enabled' | 'disabled',
        details: {
            type: string
            channelId?: string
            changes?: Record<string, unknown>
        },
        moderatorId: string,
    ) {
        return helpers.logAutoMessageChange(
            this,
            guildId,
            action,
            details,
            moderatorId,
        )
    }

    /** Logs a settings change event. */
    async logSettingsChange(
        guildId: string,
        details: { setting: string; oldValue?: unknown; newValue?: unknown },
        moderatorId: string,
    ) {
        return helpers.logSettingsChange(this, guildId, details, moderatorId)
    }
}

export const serverLogService = new ServerLogService()
