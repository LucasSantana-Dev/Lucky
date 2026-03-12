import { getPrismaClient } from '../utils/database/prismaClient.js'
import { Prisma } from '../generated/prisma/client.js'
import type { EmbedData } from './embedValidation.js'

const prisma = getPrismaClient()

export type MessageType = 'welcome' | 'leave' | 'auto_response' | 'scheduled'

export interface AutoMessageData {
    message: string
    embedData?: EmbedData
}

type AutoMessageOptions = {
    trigger?: string
    exactMatch?: boolean
    channelId?: string
    cronSchedule?: string
}

export class AutoMessageService {
    /**
     * Create a new auto message
     */
    async createMessage(
        guildId: string,
        type: MessageType,
        data: AutoMessageData,
        options?: AutoMessageOptions,
    ) {
        return await prisma.autoMessage.create({
            data: {
                guildId,
                type,
                message: data.message,
                embedData: data.embedData
                    ? JSON.stringify(data.embedData)
                    : Prisma.JsonNull,
                trigger: options?.trigger,
                exactMatch: options?.exactMatch || false,
                channelId: options?.channelId,
                cronSchedule: options?.cronSchedule,
            },
        })
    }

    async upsertGuildTypeMessage(
        guildId: string,
        type: MessageType,
        data: AutoMessageData,
        options?: AutoMessageOptions,
    ): Promise<'created' | 'updated'> {
        const lockKey = `auto-message:${guildId}:${type}`
        return await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`

            const existing = await tx.autoMessage.findFirst({
                where: { guildId, type },
                orderBy: { createdAt: 'asc' },
                select: { id: true },
            })

            if (!existing) {
                await tx.autoMessage.create({
                    data: {
                        guildId,
                        type,
                        message: data.message,
                        embedData: data.embedData
                            ? JSON.stringify(data.embedData)
                            : Prisma.JsonNull,
                        trigger: options?.trigger,
                        exactMatch: options?.exactMatch || false,
                        channelId: options?.channelId,
                        cronSchedule: options?.cronSchedule,
                    },
                })
                return 'created'
            }

            await tx.autoMessage.update({
                where: { id: existing.id },
                data: {
                    message: data.message,
                    embedData: data.embedData
                        ? JSON.stringify(data.embedData)
                        : Prisma.JsonNull,
                    trigger: options?.trigger ?? null,
                    exactMatch: options?.exactMatch || false,
                    channelId: options?.channelId ?? null,
                    cronSchedule: options?.cronSchedule ?? null,
                    enabled: true,
                },
            })

            return 'updated'
        })
    }

    /**
     * Get messages by type
     */
    async getMessagesByType(guildId: string, type: MessageType) {
        return await prisma.autoMessage.findMany({
            where: {
                guildId,
                type,
                enabled: true,
            },
        })
    }

    /**
     * Get welcome message
     */
    async getWelcomeMessage(guildId: string) {
        const messages = await this.getMessagesByType(guildId, 'welcome')
        return messages[0] || null
    }

    /**
     * Get leave message
     */
    async getLeaveMessage(guildId: string) {
        const messages = await this.getMessagesByType(guildId, 'leave')
        return messages[0] || null
    }

    /**
     * Get auto-responders
     */
    async getAutoResponders(guildId: string) {
        return await this.getMessagesByType(guildId, 'auto_response')
    }

    /**
     * Find matching auto-responder
     */
    async findMatchingResponder(guildId: string, message: string) {
        const responders = await this.getAutoResponders(guildId)

        for (const responder of responders) {
            if (!responder.trigger) continue

            const matches = responder.exactMatch
                ? message.toLowerCase() === responder.trigger.toLowerCase()
                : message
                      .toLowerCase()
                      .includes(responder.trigger.toLowerCase())

            if (matches) {
                return responder
            }
        }

        return null
    }

    /**
     * Update a message
     */
    async updateMessage(
        id: string,
        data: Prisma.AutoMessageUpdateInput,
    ) {
        return await prisma.autoMessage.update({
            where: { id },
            data,
        })
    }

    /**
     * Delete a message
     */
    async deleteMessage(id: string) {
        return await prisma.autoMessage.delete({
            where: { id },
        })
    }

    /**
     * Toggle message enabled status
     */
    async toggleMessage(id: string, enabled: boolean) {
        return await this.updateMessage(id, { enabled })
    }

    /**
     * Replace placeholders in message
     */
    replacePlaceholders(
        message: string,
        data: {
            user?: { username: string; mention: string; id: string }
            guild?: { name: string; memberCount: number }
            server?: { name: string; memberCount: number }
        },
    ): string {
        let result = message

        if (data.user) {
            result = result
                .replace(/{user}/g, data.user.username)
                .replace(/{user\.mention}/g, data.user.mention)
                .replace(/{user\.id}/g, data.user.id)
                .replace(/{user\.username}/g, data.user.username)
        }

        if (data.guild || data.server) {
            const guildData = data.guild || data.server
            result = result
                .replace(/{guild}/g, guildData!.name)
                .replace(/{guild\.name}/g, guildData!.name)
                .replace(
                    /{guild\.memberCount}/g,
                    String(guildData!.memberCount),
                )
                .replace(/{server}/g, guildData!.name)
                .replace(/{server\.name}/g, guildData!.name)
                .replace(
                    /{server\.memberCount}/g,
                    String(guildData!.memberCount),
                )
        }

        return result
    }

    /**
     * Get scheduled messages
     */
    async getScheduledMessages(guildId: string) {
        return await prisma.autoMessage.findMany({
            where: {
                guildId,
                type: 'scheduled',
                enabled: true,
            },
        })
    }

    /**
     * Update last sent time
     */
    async updateLastSent(id: string) {
        return await prisma.autoMessage.update({
            where: { id },
            data: {
                lastSent: new Date(),
            },
        })
    }
}

export const autoMessageService = new AutoMessageService()
