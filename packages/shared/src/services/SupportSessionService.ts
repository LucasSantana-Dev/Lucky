import { getPrismaClient } from '../utils/database/prismaClient.js'

/**
 * Lifecycle store for temporary support/ticket channels. The channel itself
 * owns access control (per-user + support-agent-role overwrites); this service
 * only tracks open/closed state so the sweep scheduler can auto-close expired
 * tickets and the command can enforce one open ticket per requestor.
 */
export class SupportSessionService {
    /** Record a newly-opened ticket channel. */
    async open(input: {
        guildId: string
        channelId: string
        requestorId: string
        expiresAt: Date
    }) {
        return await getPrismaClient().supportSession.create({
            data: { ...input, status: 'open' },
        })
    }

    /** The requestor's currently-open ticket, if any (one-active-per-user gate). */
    async getActiveForUser(guildId: string, requestorId: string) {
        return await getPrismaClient().supportSession.findFirst({
            where: { guildId, requestorId, status: 'open' },
        })
    }

    /** The open ticket owning a channel (for /ticket close from inside it). */
    async getByChannel(channelId: string) {
        return await getPrismaClient().supportSession.findUnique({
            where: { channelId },
        })
    }

    /** Open tickets whose deadline has passed — the sweep set. */
    async getExpired() {
        return await getPrismaClient().supportSession.findMany({
            where: { status: 'open', expiresAt: { lte: new Date() } },
        })
    }

    /** Mark a ticket closed (idempotent — the sweep and /close may race). */
    async close(id: string) {
        return await getPrismaClient().supportSession.update({
            where: { id },
            data: { status: 'closed' },
        })
    }
}

/** Singleton instance of SupportSessionService. */
export const supportSessionService = new SupportSessionService()
