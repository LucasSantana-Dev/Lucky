import { getPrismaClient } from '../utils/database/prismaClient.js'

const prisma = getPrismaClient()

/** Configuration for the leveling system in a guild. */
export type LevelConfig = {
    id: string
    guildId: string
    enabled: boolean
    xpPerMessage: number
    xpCooldownMs: number
    announceChannel: string | null
    createdAt: Date
    updatedAt: Date
}

/** User's XP and level tracking in a guild. */
export type MemberXP = {
    id: string
    guildId: string
    userId: string
    displayName: string | null
    xp: number
    level: number
    lastXpAt: Date
    createdAt: Date
    updatedAt: Date
}

/** Role reward granted when a user reaches a specific level. */
export type LevelReward = {
    id: string
    guildId: string
    level: number
    roleId: string
}

type UpsertConfigData = {
    enabled?: boolean
    xpPerMessage?: number
    xpCooldownMs?: number
    announceChannel?: string | null
}

/** Calculates XP required to reach a specific level. */
export function xpNeededForLevel(level: number): number {
    return level * level * 100
}

/** Manages user leveling, XP, and level-based rewards. */
export class LevelService {
    async getConfig(guildId: string): Promise<LevelConfig | null> {
        return await prisma.levelConfig.findUnique({ where: { guildId } })
    }

    async upsertConfig(
        guildId: string,
        data: UpsertConfigData,
    ): Promise<LevelConfig> {
        return await prisma.levelConfig.upsert({
            where: { guildId },
            create: { guildId, ...data },
            update: data,
        })
    }

    async getMemberXP(
        guildId: string,
        userId: string,
    ): Promise<MemberXP | null> {
        return await prisma.memberXP.findUnique({
            where: { guildId_userId: { guildId, userId } },
        })
    }

    async addXP(
        guildId: string,
        userId: string,
        amount: number,
        displayName?: string | null,
    ): Promise<{ member: MemberXP; leveledUp: boolean; newLevel: number }> {
        // Use a transaction to ensure read-modify-write is atomic for concurrent XP additions
        const result = await prisma.$transaction(async (tx) => {
            // Upsert with XP increment (returns the updated record with post-increment XP)
            const current = await tx.memberXP.upsert({
                where: { guildId_userId: { guildId, userId } },
                create: {
                    guildId,
                    userId,
                    xp: amount,
                    lastXpAt: new Date(),
                    displayName: displayName ?? null,
                },
                // Only overwrite the name when a fresh one is supplied, so a missing
                // value never wipes a previously-captured name.
                update: {
                    xp: { increment: amount },
                    lastXpAt: new Date(),
                    ...(displayName ? { displayName } : {}),
                },
            })

            // Calculate new level based on the post-increment XP
            let leveledUp = false
            let newLevel = current.level

            while (current.xp >= xpNeededForLevel(newLevel + 1)) {
                newLevel++
                leveledUp = true
            }

            // Update level in the same transaction to prevent race conditions
            let finalMember = current
            if (leveledUp) {
                finalMember = await tx.memberXP.update({
                    where: { guildId_userId: { guildId, userId } },
                    data: { level: newLevel },
                })
            }

            return { member: finalMember, leveledUp, newLevel }
        })

        return result
    }

    async getLeaderboard(guildId: string, limit = 10): Promise<MemberXP[]> {
        return await prisma.memberXP.findMany({
            where: { guildId },
            orderBy: { xp: 'desc' },
            take: limit,
        })
    }

    async getRank(guildId: string, userId: string): Promise<number> {
        const member = await this.getMemberXP(guildId, userId)
        if (!member) return 0
        const count = await prisma.memberXP.count({
            where: { guildId, xp: { gt: member.xp } },
        })
        return count + 1
    }

    async addReward(
        guildId: string,
        level: number,
        roleId: string,
    ): Promise<LevelReward> {
        return await prisma.levelReward.upsert({
            where: { guildId_level: { guildId, level } },
            create: { guildId, level, roleId },
            update: { roleId },
        })
    }

    async removeReward(guildId: string, level: number): Promise<void> {
        await prisma.levelReward.deleteMany({ where: { guildId, level } })
    }

    async getRewards(guildId: string): Promise<LevelReward[]> {
        return await prisma.levelReward.findMany({
            where: { guildId },
            orderBy: { level: 'asc' },
        })
    }
}

export const levelService = new LevelService()
