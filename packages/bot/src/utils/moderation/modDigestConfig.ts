import { getPrismaClient } from '@lucky/shared/utils/database/prismaClient'
import { errorLog } from '@lucky/shared/utils'
import cuid2 from '@paralleldrive/cuid2'

export type ModDigestConfig = {
    guildId: string
    channelId: string
    enabled: boolean
    lastSentAt: number | null
    createdAt: number
}

export type EnableModDigestInput = {
    guildId: string
    channelId: string
    lastSentAt?: number | null
    createdAt?: number
}

export class ModDigestConfigService {
    /**
     * Persist a guild's digest config to Postgres.
     * Callers can pre-populate `lastSentAt` (used by /digest schedule to write
     * the post-sample timestamp atomically with enabling, eliminating the
     * scheduler-tick race window).
     */
    async enable(input: EnableModDigestInput): Promise<ModDigestConfig> {
        const prisma = getPrismaClient()
        const createdAtMs = input.createdAt ?? Date.now()
        const lastSentAtMs = input.lastSentAt ?? null

        try {
            const row = await prisma.modDigestConfig.upsert({
                where: { guildId: input.guildId },
                update: {
                    channelId: input.channelId,
                    enabled: true,
                    lastSentAt: lastSentAtMs !== null ? BigInt(lastSentAtMs) : null,
                    updatedAt: new Date(),
                },
                create: {
                    id: cuid2.createId(),
                    guildId: input.guildId,
                    channelId: input.channelId,
                    enabled: true,
                    lastSentAt: lastSentAtMs !== null ? BigInt(lastSentAtMs) : null,
                    createdAt: BigInt(createdAtMs),
                },
            })

            return {
                guildId: row.guildId,
                channelId: row.channelId,
                enabled: row.enabled,
                lastSentAt: row.lastSentAt !== null ? Number(row.lastSentAt) : null,
                createdAt: Number(row.createdAt),
            }
        } catch (error) {
            errorLog({
                message: 'Failed to enable mod digest config',
                error,
                data: { guildId: input.guildId },
            })
            throw error
        }
    }

    async disable(guildId: string): Promise<boolean> {
        const prisma = getPrismaClient()

        try {
            const row = await prisma.modDigestConfig.findUnique({
                where: { guildId },
            })
            if (!row) return false

            await prisma.modDigestConfig.delete({
                where: { guildId },
            })
            return true
        } catch (error) {
            errorLog({
                message: 'Failed to disable mod digest config',
                error,
                data: { guildId },
            })
            throw error
        }
    }

    async get(guildId: string): Promise<ModDigestConfig | null> {
        const prisma = getPrismaClient()

        try {
            const row = await prisma.modDigestConfig.findUnique({
                where: { guildId },
            })
            if (!row) return null

            return {
                guildId: row.guildId,
                channelId: row.channelId,
                enabled: row.enabled,
                lastSentAt: row.lastSentAt !== null ? Number(row.lastSentAt) : null,
                createdAt: Number(row.createdAt),
            }
        } catch (error) {
            errorLog({
                message: 'Failed to read mod digest config',
                error,
                data: { guildId },
            })
            return null
        }
    }

    async listEnabledGuildIds(): Promise<string[]> {
        const prisma = getPrismaClient()

        try {
            const rows = await prisma.modDigestConfig.findMany({
                where: { enabled: true },
                select: { guildId: true },
            })
            return rows.map((row) => row.guildId)
        } catch (error) {
            errorLog({
                message: 'Failed to list enabled mod digest guilds',
                error,
            })
            return []
        }
    }

    async markSent(guildId: string, sentAt: number = Date.now()): Promise<void> {
        const prisma = getPrismaClient()

        try {
            await prisma.modDigestConfig.update({
                where: { guildId },
                data: {
                    lastSentAt: BigInt(sentAt),
                    updatedAt: new Date(),
                },
            })
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('Record to update not found')
            ) {
                // Guild no longer has digest enabled; silently succeed
                return
            }
            errorLog({
                message: 'Failed to mark mod digest as sent',
                error,
                data: { guildId },
            })
            throw error
        }
    }
}

export const modDigestConfigService = new ModDigestConfigService()
