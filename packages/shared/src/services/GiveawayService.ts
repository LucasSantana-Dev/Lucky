import { randomInt } from 'node:crypto'
import { getPrismaClient } from '../utils/database/prismaClient.js'

/** Duration parser for human-readable durations (e.g., "10m", "2h", "1d"). */
export function parseDuration(input: string): number | null {
    const match = input.match(/^(\d+)([mhd])$/)
    if (!match) return null

    const amount = Number.parseInt(match[1], 10)
    const unit = match[2]

    const ms = {
        m: amount * 60 * 1000,
        h: amount * 60 * 60 * 1000,
        d: amount * 24 * 60 * 60 * 1000,
    }[unit]

    return ms ?? null
}

export type GiveawayData = {
    id: string
    guildId: string
    channelId: string
    messageId: string | null
    prize: string
    winnersCount: number
    endsAt: Date
    endedAt: Date | null
    winnerIds: string[]
    createdBy: string
    createdAt: Date
}

export class GiveawayService {
    private getPrisma() {
        return getPrismaClient()
    }

    /** Create a new giveaway. */
    async create(data: {
        guildId: string
        channelId: string
        prize: string
        winnersCount: number
        endsAt: Date
        createdBy: string
    }): Promise<GiveawayData> {
        return await this.getPrisma().giveaway.create({
            data,
        })
    }

    /** Get an active giveaway by message ID. */
    async getActiveByMessageId(
        messageId: string,
    ): Promise<GiveawayData | null> {
        return await this.getPrisma().giveaway.findFirst({
            where: { messageId, endedAt: null },
        })
    }

    /** Get a giveaway by ID. */
    async getById(id: string): Promise<GiveawayData | null> {
        return await this.getPrisma().giveaway.findUnique({
            where: { id },
        })
    }

    /** Add an entry to a giveaway (ignore duplicate user entries). */
    async addEntry(giveawayId: string, userId: string): Promise<void> {
        try {
            await this.getPrisma().giveawayEntry.create({
                data: { giveawayId, userId },
            })
        } catch (err) {
            // Unique constraint violation: user already entered
            if ((err as Error & { code?: string }).code === 'P2002') {
                return
            }
            throw err
        }
    }

    /** Get all entries for a giveaway. */
    async getEntries(giveawayId: string): Promise<string[]> {
        const entries = await this.getPrisma().giveawayEntry.findMany({
            where: { giveawayId },
            select: { userId: true },
        })
        return entries.map((e) => e.userId)
    }

    /** End a giveaway and draw winners. */
    async endAndDraw(
        giveawayId: string,
        winnersCount: number,
    ): Promise<string[]> {
        const entries = await this.getEntries(giveawayId)

        // Draw up to winnersCount distinct winners
        const winners: string[] = []
        const copied = [...entries]
        for (let i = 0; i < Math.min(winnersCount, copied.length); i++) {
            const idx = randomInt(copied.length)
            winners.push(copied[idx])
            copied.splice(idx, 1)
        }

        // Update the giveaway
        await this.getPrisma().giveaway.update({
            where: { id: giveawayId },
            data: {
                winnerIds: winners,
                endedAt: new Date(),
            },
        })

        return winners
    }

    /**
     * End a giveaway by ID (early termination). Guild-scoped. Returns the
     * giveaway plus `wasAlreadyEnded` so the caller can tell a fresh end from
     * a no-op on an already-ended giveaway — the returned record always has
     * `endedAt` set, so `endedAt` alone cannot distinguish the two.
     */
    async endById(
        giveawayId: string,
        guildId: string,
    ): Promise<{ giveaway: GiveawayData; wasAlreadyEnded: boolean } | null> {
        const giveaway = await this.getPrisma().giveaway.findFirst({
            where: { id: giveawayId, guildId },
        })
        if (!giveaway) return null
        // If already ended, return the existing record (no redraw).
        if (giveaway.endedAt !== null) {
            return { giveaway, wasAlreadyEnded: true }
        }

        const winners = await this.endAndDraw(giveawayId, giveaway.winnersCount)
        return {
            giveaway: { ...giveaway, winnerIds: winners, endedAt: new Date() },
            wasAlreadyEnded: false,
        }
    }

    /** Reroll winners for an ended giveaway. Guild-scoped. */
    async reroll(
        giveawayId: string,
        guildId: string,
    ): Promise<string[] | null> {
        const giveaway = await this.getPrisma().giveaway.findFirst({
            where: { id: giveawayId, guildId },
        })
        if (!giveaway) return null
        // Reroll must only operate on already-ended giveaways
        if (giveaway.endedAt === null) return null

        return await this.rerollWinners(giveawayId)
    }

    /** Update only winnerIds without touching endedAt. */
    private async rerollWinners(giveawayId: string): Promise<string[]> {
        const giveaway = await this.getById(giveawayId)
        if (!giveaway) return []

        const entries = await this.getEntries(giveawayId)
        const winners: string[] = []
        const copied = [...entries]
        for (
            let i = 0;
            i < Math.min(giveaway.winnersCount, copied.length);
            i++
        ) {
            const idx = randomInt(copied.length)
            winners.push(copied[idx])
            copied.splice(idx, 1)
        }

        // Update ONLY winnerIds, leave endedAt alone
        await this.getPrisma().giveaway.update({
            where: { id: giveawayId },
            data: { winnerIds: winners },
        })

        return winners
    }

    /** Get all giveaways that have ended (endsAt <= now, endedAt IS NULL). */
    async getEndedDue(): Promise<GiveawayData[]> {
        return await this.getPrisma().giveaway.findMany({
            where: {
                endsAt: { lte: new Date() },
                endedAt: null,
            },
            orderBy: { endsAt: 'asc' },
        })
    }

    /** Update giveaway with message ID. */
    async updateMessageId(
        giveawayId: string,
        messageId: string,
    ): Promise<GiveawayData> {
        return await this.getPrisma().giveaway.update({
            where: { id: giveawayId },
            data: { messageId },
        })
    }
}

export const giveawayService = new GiveawayService()
