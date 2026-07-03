import { getPrismaClient } from '../utils/database/prismaClient.js'

const prisma = getPrismaClient()

/** Configuration for a guild's starboard feature. */
export type StarboardConfig = {
    id: string
    guildId: string
    channelId: string
    emoji: string
    threshold: number
    selfStar: boolean
    seedReaction: boolean
    seedChannelIds: string[]
    firstStarDm: boolean
    firstStarDmMessage: string | null
    createdAt: Date
    updatedAt: Date
}

/** A message entry in the starboard. */
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

/** Data for upserting starboard configuration. */
type UpsertConfigData = {
    channelId: string
    emoji?: string
    threshold?: number
    selfStar?: boolean
    seedReaction?: boolean
    seedChannelIds?: string[]
    firstStarDm?: boolean
    firstStarDmMessage?: string | null
}

/** Data for upserting a starboard entry. */
type UpsertEntryData = {
    channelId: string
    authorId: string
    content?: string
    starCount: number
    starboardMsgId?: string
}

/** Manages starboard configuration and entries. */
export class StarboardService {
    /** Retrieves starboard configuration for a guild. */
    async getConfig(guildId: string): Promise<StarboardConfig | null> {
        return await prisma.starboardConfig.findUnique({ where: { guildId } })
    }

    /** Creates or updates starboard configuration for a guild. */
    async upsertConfig(
        guildId: string,
        data: UpsertConfigData,
    ): Promise<StarboardConfig> {
        return await prisma.starboardConfig.upsert({
            where: { guildId },
            create: { guildId, ...data },
            update: data,
        })
    }

    /**
     * Claims the one-time first-star DM for a user. Returns true exactly once
     * per (guild, user) — the unique constraint makes the claim atomic, so
     * concurrent reactions can't double-DM.
     */
    async tryClaimFirstStarDm(
        guildId: string,
        userId: string,
    ): Promise<boolean> {
        try {
            await prisma.starboardDmSent.create({ data: { guildId, userId } })
            return true
        } catch (error) {
            if ((error as { code?: string })?.code === 'P2002') {
                return false
            }
            throw error
        }
    }

    /** Deletes starboard configuration for a guild. */
    async deleteConfig(guildId: string): Promise<void> {
        await prisma.starboardConfig.deleteMany({ where: { guildId } })
    }

    /** Retrieves a starboard entry by message ID. */
    async getEntry(
        guildId: string,
        messageId: string,
    ): Promise<StarboardEntry | null> {
        return await prisma.starboardEntry.findUnique({
            where: { guildId_messageId: { guildId, messageId } },
        })
    }

    /** Creates or updates a starboard entry. */
    async upsertEntry(
        guildId: string,
        messageId: string,
        data: UpsertEntryData,
    ): Promise<StarboardEntry> {
        return await prisma.starboardEntry.upsert({
            where: { guildId_messageId: { guildId, messageId } },
            create: { guildId, messageId, ...data },
            update: data,
        })
    }

    /** Retrieves top-rated starboard entries for a guild. */
    async getTopEntries(
        guildId: string,
        limit = 10,
    ): Promise<StarboardEntry[]> {
        return await prisma.starboardEntry.findMany({
            where: { guildId },
            orderBy: { starCount: 'desc' },
            take: limit,
        })
    }
}

/** Singleton instance of StarboardService. */
export const starboardService = new StarboardService()
