import { getPrismaClient } from '../utils/database/prismaClient.js'

const prisma = getPrismaClient()

export type StarboardConfig = {
    id: string
    guildId: string
    channelId: string
    emoji: string
    threshold: number
    selfStar: boolean
    createdAt: Date
    updatedAt: Date
}

export type StarboardEntry = {
    id: string
    guildId: string
    messageId: string
    channelId: string
    authorId: string
    starboardMsgId: string | null
    starCount: number
    content: string | null
    createdAt: Date
    updatedAt: Date
}

type UpsertConfigData = {
    channelId: string
    emoji?: string
    threshold?: number
    selfStar?: boolean
}

type UpsertEntryData = {
    channelId: string
    authorId: string
    content?: string
    starCount: number
    starboardMsgId?: string
}

export class StarboardService {
    async getConfig(guildId: string): Promise<StarboardConfig | null> {
        return await prisma.starboardConfig.findUnique({ where: { guildId } })
    }

    async upsertConfig(guildId: string, data: UpsertConfigData): Promise<StarboardConfig> {
        return await prisma.starboardConfig.upsert({
            where: { guildId },
            create: { guildId, ...data },
            update: data,
        })
    }

    async deleteConfig(guildId: string): Promise<void> {
        await prisma.starboardConfig.deleteMany({ where: { guildId } })
    }

    async getEntry(guildId: string, messageId: string): Promise<StarboardEntry | null> {
        return await prisma.starboardEntry.findUnique({
            where: { guildId_messageId: { guildId, messageId } },
        })
    }

    async upsertEntry(guildId: string, messageId: string, data: UpsertEntryData): Promise<StarboardEntry> {
        return await prisma.starboardEntry.upsert({
            where: { guildId_messageId: { guildId, messageId } },
            create: { guildId, messageId, ...data },
            update: data,
        })
    }

    async getTopEntries(guildId: string, limit = 10): Promise<StarboardEntry[]> {
        return await prisma.starboardEntry.findMany({
            where: { guildId },
            orderBy: { starCount: 'desc' },
            take: limit,
        })
    }
}

export const starboardService = new StarboardService()
