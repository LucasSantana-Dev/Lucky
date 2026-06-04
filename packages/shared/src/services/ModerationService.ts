import { getPrismaClient } from '../utils/database/prismaClient.js'
import {
    getModerationSettings,
    updateModerationSettings,
    hasModPermissions,
    getModerationStats,
} from './moderationSettings.js'

/** Represents a moderation case record. */
export type ModerationCase = {
    id: string
    caseNumber: number
    guildId: string
    userId: string
    username: string
    moderatorId: string
    moderatorName: string
    type: string
    reason: string | null
    duration: number | null
    expiresAt: Date | null
    active: boolean
    appealed: boolean
    appealReason: string | null
    appealReviewed: boolean
    appealApproved: boolean
    channelId: string | null
    evidence: string[]
    createdAt: Date
    updatedAt: Date
}

/** Guild-level moderation configuration. */
export type ModerationSettings = {
    id: string
    guildId: string
    modLogChannelId: string | null
    muteRoleId: string | null
    modRoleIds: string[]
    adminRoleIds: string[]
    autoModEnabled: boolean
    maxWarnings: number
    warningExpiry: number
    dmOnAction: boolean
    requireReason: boolean
    createdAt: Date
    updatedAt: Date
}

/** Input payload for creating a new moderation case. */
export interface CreateCaseInput {
    guildId: string
    type: 'warn' | 'mute' | 'kick' | 'ban' | 'timeout' | 'unban' | 'unmute'
    userId: string
    username: string
    moderatorId: string
    moderatorName: string
    reason?: string
    duration?: number // seconds
    channelId?: string
    evidence?: string[]
}

/** Input payload for submitting a case appeal. */
export interface AppealCaseInput {
    caseId: string
    appealReason: string
}

/** Service for managing guild moderation cases and settings. */
export class ModerationService {
    /** Creates a new moderation case with an auto-incremented case number.
     *  Retries on unique constraint violation (P2002) up to MAX_RETRIES times.
     */
    async createCase(input: CreateCaseInput): Promise<ModerationCase> {
        const prisma = getPrismaClient()
        const MAX_RETRIES = 5
        const expiresAt = input.duration
            ? new Date(Date.now() + input.duration * 1000)
            : null

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                return await prisma.$transaction(async (tx: any) => {
                    const lastCase = await tx.moderationCase.findFirst({
                        where: { guildId: input.guildId },
                        orderBy: { caseNumber: 'desc' },
                    })
                    const caseNumber = (lastCase?.caseNumber ?? 0) + 1

                    return await tx.moderationCase.create({
                        data: {
                            caseNumber,
                            guildId: input.guildId,
                            type: input.type,
                            userId: input.userId,
                            username: input.username,
                            moderatorId: input.moderatorId,
                            moderatorName: input.moderatorName,
                            reason: input.reason,
                            duration: input.duration,
                            expiresAt,
                            channelId: input.channelId,
                            evidence: input.evidence ?? [],
                        },
                    })
                })
            } catch (error) {
                // Retry only on unique constraint violation for (guildId, caseNumber)
                // Check for P2002 error code (Prisma unique constraint violation)
                const isP2002 =
                    error instanceof Error &&
                    'code' in error &&
                    error.code === 'P2002'

                if (isP2002) {
                    // Last attempt — re-throw
                    if (attempt === MAX_RETRIES - 1) {
                        throw error
                    }
                    // Otherwise, continue to next attempt
                    continue
                }
                // Non-P2002 errors propagate immediately
                throw error
            }
        }

        // Should never reach here due to the throw in the loop
        throw new Error('Failed to create case after max retries')
    }

    /** Retrieves a moderation case by guild and case number. */
    async getCase(
        guildId: string,
        caseNumber: number,
    ): Promise<ModerationCase | null> {
        const prisma = getPrismaClient()
        return await prisma.moderationCase.findUnique({
            where: { guildId_caseNumber: { guildId, caseNumber } },
        })
    }

    /** Retrieves all moderation cases for a user, optionally filtered to active cases only. */
    async getUserCases(
        guildId: string,
        userId: string,
        activeOnly = false,
    ): Promise<ModerationCase[]> {
        const prisma = getPrismaClient()
        return await prisma.moderationCase.findMany({
            where: { guildId, userId, ...(activeOnly && { active: true }) },
            orderBy: { createdAt: 'desc' },
        })
    }

    /** Retrieves the most recent moderation cases for a guild. */
    async getRecentCases(
        guildId: string,
        limit = 10,
    ): Promise<ModerationCase[]> {
        const prisma = getPrismaClient()
        return await prisma.moderationCase.findMany({
            where: { guildId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        })
    }

    /** Retrieves all moderation cases created after the given date. */
    async getCasesSince(
        guildId: string,
        since: Date,
    ): Promise<ModerationCase[]> {
        const prisma = getPrismaClient()
        return await prisma.moderationCase.findMany({
            where: { guildId, createdAt: { gte: since } },
            orderBy: { createdAt: 'desc' },
        })
    }

    /** Returns the count of active warning cases for a user in a guild. */
    async getActiveWarningsCount(
        guildId: string,
        userId: string,
    ): Promise<number> {
        const prisma = getPrismaClient()
        return await prisma.moderationCase.count({
            where: { guildId, userId, type: 'warn', active: true },
        })
    }

    /** Deactivates all active warning cases for a user and returns the count cleared. */
    async clearWarnings(guildId: string, userId: string): Promise<number> {
        const prisma = getPrismaClient()
        const result = await prisma.moderationCase.updateMany({
            where: { guildId, userId, type: 'warn', active: true },
            data: { active: false },
        })
        return result.count
    }

    /** Marks a moderation case as inactive by its ID. */
    async deactivateCase(caseId: string): Promise<ModerationCase> {
        const prisma = getPrismaClient()
        return await prisma.moderationCase.update({
            where: { id: caseId },
            data: { active: false },
        })
    }

    /** Submits an appeal for a moderation case. */
    async appealCase(input: AppealCaseInput): Promise<ModerationCase> {
        const prisma = getPrismaClient()
        return await prisma.moderationCase.update({
            where: { id: input.caseId },
            data: {
                appealed: true,
                appealReason: input.appealReason,
                appealedAt: new Date(),
            },
        })
    }

    /** Reviews a submitted appeal, optionally deactivating the case if approved. */
    async reviewAppeal(
        caseId: string,
        approved: boolean,
    ): Promise<ModerationCase> {
        const prisma = getPrismaClient()
        return await prisma.moderationCase.update({
            where: { id: caseId },
            data: {
                appealReviewed: true,
                appealApproved: approved,
                ...(approved && { active: false }),
            },
        })
    }

    /** Retrieves all active cases whose expiry date has passed. */
    async getExpiredCases(): Promise<ModerationCase[]> {
        const prisma = getPrismaClient()
        return await prisma.moderationCase.findMany({
            where: { active: true, expiresAt: { lte: new Date() } },
        })
    }

    /** Retrieves the moderation settings for a guild. */
    async getSettings(guildId: string): Promise<ModerationSettings> {
        return getModerationSettings(guildId)
    }

    /** Updates moderation settings for a guild. */
    async updateSettings(
        guildId: string,
        data: Partial<
            Omit<
                ModerationSettings,
                'id' | 'guildId' | 'createdAt' | 'updatedAt'
            >
        >,
    ): Promise<ModerationSettings> {
        return updateModerationSettings(guildId, data)
    }

    /** Checks whether any of the given role IDs grant moderation permissions in the guild. */
    async hasModPermissions(
        guildId: string,
        userRoles: string[],
    ): Promise<boolean> {
        return hasModPermissions(guildId, userRoles)
    }

    /** Returns moderation statistics for a guild. */
    async getStats(guildId: string) {
        return getModerationStats(guildId)
    }
}

export const moderationService = new ModerationService()
