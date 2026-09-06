import { getPrismaClient } from '../utils/database/prismaClient.js'

const prisma = getPrismaClient()

/** Per-guild server-logging ignore-list configuration. */
export type LogSettingsConfig = {
    id: string
    guildId: string
    ignoredChannelIds: string[]
    ignoredRoleIds: string[]
    ignoredUserIds: string[]
    createdAt: Date
    updatedAt: Date
}

export type IgnoreKind = 'channel' | 'role' | 'user'

/** The event's channel/user/role targets, checked against the guild's ignore-lists. */
export type LogEventTarget = {
    channelId?: string
    userId?: string
    roleIds?: string[]
}

function fieldForKind(
    kind: IgnoreKind,
): 'ignoredChannelIds' | 'ignoredRoleIds' | 'ignoredUserIds' {
    switch (kind) {
        case 'channel':
            return 'ignoredChannelIds'
        case 'role':
            return 'ignoredRoleIds'
        case 'user':
            return 'ignoredUserIds'
    }
}

/** Manages per-guild server-log ignore lists (excluded channels/roles/users). */
export class LogSettingsService {
    /** Retrieves ignore-list configuration for a guild, or null if unset. */
    async getConfig(guildId: string): Promise<LogSettingsConfig | null> {
        return await prisma.logSettings.findUnique({ where: { guildId } })
    }

    /** Adds an id to the given ignore-list. No-op if already present. */
    async addIgnored(
        guildId: string,
        kind: IgnoreKind,
        id: string,
    ): Promise<LogSettingsConfig> {
        const field = fieldForKind(kind)
        const existing = await this.getConfig(guildId)

        if (existing?.[field].includes(id)) {
            return existing
        }

        return await prisma.logSettings.upsert({
            where: { guildId },
            create: { guildId, [field]: [id] },
            update: { [field]: { push: id } },
        })
    }

    /** Removes an id from the given ignore-list. No-op if not present or unset. */
    async removeIgnored(
        guildId: string,
        kind: IgnoreKind,
        id: string,
    ): Promise<LogSettingsConfig | null> {
        const field = fieldForKind(kind)
        const existing = await this.getConfig(guildId)
        if (!existing) {
            return null
        }

        return await prisma.logSettings.update({
            where: { guildId },
            data: { [field]: existing[field].filter((x) => x !== id) },
        })
    }

    /**
     * True if the event should be suppressed: its channel, actor, or any of
     * the actor's roles appear in the guild's ignore-lists. Absent
     * configuration (guild never set anything up) never suppresses.
     */
    async isIgnored(guildId: string, target: LogEventTarget): Promise<boolean> {
        const config = await this.getConfig(guildId)
        if (!config) {
            return false
        }

        if (
            target.channelId &&
            config.ignoredChannelIds.includes(target.channelId)
        ) {
            return true
        }
        if (target.userId && config.ignoredUserIds.includes(target.userId)) {
            return true
        }
        if (
            target.roleIds?.some((roleId) =>
                config.ignoredRoleIds.includes(roleId),
            )
        ) {
            return true
        }

        return false
    }
}

/** Singleton instance of LogSettingsService. */
export const logSettingsService = new LogSettingsService()
