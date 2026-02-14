import { getPrismaClient } from '../utils/database/prismaClient.js'
import type {
    ModerationCase,
    ModerationSettings,
} from '../generated/prisma/client.js'
import {
    getModerationSettings,
    updateModerationSettings,
    hasModPermissions,
    getModerationStats,
} from './moderationSettings.js'

const prisma = getPrismaClient()

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

export interface AppealCaseInput {
    caseId: string
    appealReason: string
}

export class ModerationService {
    async createCase(input: CreateCaseInput): Promise<ModerationCase> {
        const lastCase = await prisma.moderationCase.findFirst({
            where: { guildId: input.guildId },
            orderBy: { caseNumber: 'desc' },
        })
        const caseNumber = (lastCase?.caseNumber ?? 0) + 1
        const expiresAt = input.duration
            ? new Date(Date.now() + input.duration * 1000)
            : null
        return await prisma.moderationCase.create({
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
    }

    async getCase(
        guildId: string,
        caseNumber: number,
    ): Promise<ModerationCase | null> {
        return await prisma.moderationCase.findUnique({
            where: { guildId_caseNumber: { guildId, caseNumber } },
        })
    }

    async getUserCases(
        guildId: string,
        userId: string,
        activeOnly = false,
    ): Promise<ModerationCase[]> {
        return await prisma.moderationCase.findMany({
            where: { guildId, userId, ...(activeOnly && { active: true }) },
            orderBy: { createdAt: 'desc' },
        })
    }

    async getRecentCases(
        guildId: string,
        limit = 10,
    ): Promise<ModerationCase[]> {
        return await prisma.moderationCase.findMany({
            where: { guildId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        })
    }

    async getActiveWarningsCount(
        guildId: string,
        userId: string,
    ): Promise<number> {
        return await prisma.moderationCase.count({
            where: { guildId, userId, type: 'warn', active: true },
        })
    }

    async clearWarnings(guildId: string, userId: string): Promise<number> {
        const result = await prisma.moderationCase.updateMany({
            where: { guildId, userId, type: 'warn', active: true },
            data: { active: false },
        })
        return result.count
    }

    async deactivateCase(caseId: string): Promise<ModerationCase> {
        return await prisma.moderationCase.update({
            where: { id: caseId },
            data: { active: false },
        })
    }

    async appealCase(input: AppealCaseInput): Promise<ModerationCase> {
        return await prisma.moderationCase.update({
            where: { id: input.caseId },
            data: {
                appealed: true,
                appealReason: input.appealReason,
                appealedAt: new Date(),
            },
        })
    }

    async reviewAppeal(
        caseId: string,
        approved: boolean,
    ): Promise<ModerationCase> {
        return await prisma.moderationCase.update({
            where: { id: caseId },
            data: {
                appealReviewed: true,
                appealApproved: approved,
                ...(approved && { active: false }),
            },
        })
    }

    async getExpiredCases(): Promise<ModerationCase[]> {
        return await prisma.moderationCase.findMany({
            where: { active: true, expiresAt: { lte: new Date() } },
        })
    }

    async getSettings(guildId: string): Promise<ModerationSettings> {
        return getModerationSettings(guildId)
    }

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

    async hasModPermissions(
        guildId: string,
        userRoles: string[],
    ): Promise<boolean> {
        return hasModPermissions(guildId, userRoles)
    }

    async getStats(guildId: string) {
        return getModerationStats(guildId)
    }
}

export const moderationService = new ModerationService()
