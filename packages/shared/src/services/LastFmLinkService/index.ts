import { getPrismaClient } from '../../utils/database/prismaClient'
import { errorLog, debugLog } from '../../utils/general/log'

/** Last.fm link data for a user. */
export type LastFmLinkRow = {
    sessionKey: string
    lastFmUsername: string | null
}

/** Manages Last.fm account links for Discord users. */
export class LastFmLinkService {
    /** Gets the Last.fm link for a Discord user. */
    async getByDiscordId(discordId: string): Promise<LastFmLinkRow | null> {
        try {
            const prisma = getPrismaClient()
            const row = await prisma.lastFmLink.findUnique({
                where: { discordId },
            })
            return row
                ? {
                      sessionKey: row.sessionKey,
                      lastFmUsername: row.lastFmUsername,
                  }
                : null
        } catch (error) {
            errorLog({
                message: 'Failed to get Last.fm link',
                error,
                data: { discordId },
            })
            return null
        }
    }

    /** Gets the Last.fm session key for a Discord user. */
    async getSessionKey(discordId: string): Promise<string | null> {
        const row = await this.getByDiscordId(discordId)
        return row?.sessionKey ?? null
    }

    /** Sets or updates a Last.fm link for a Discord user. */
    async set(
        discordId: string,
        sessionKey: string,
        lastFmUsername?: string | null,
    ): Promise<boolean> {
        try {
            const prisma = getPrismaClient()
            await prisma.lastFmLink.upsert({
                where: { discordId },
                create: {
                    discordId,
                    sessionKey,
                    ...(lastFmUsername != null &&
                        lastFmUsername !== '' && { lastFmUsername }),
                },
                update: {
                    sessionKey,
                    lastFmUsername: lastFmUsername ?? null,
                },
            })
            debugLog({
                message: 'Last.fm link saved',
                data: {
                    discordId,
                    lastFmUsername: lastFmUsername ?? undefined,
                },
            })
            return true
        } catch (error) {
            errorLog({
                message: 'Failed to set Last.fm link',
                error,
                data: { discordId },
            })
            return false
        }
    }

    /** Removes a Last.fm link for a Discord user. */
    async unlink(discordId: string): Promise<boolean> {
        try {
            const prisma = getPrismaClient()
            await prisma.lastFmLink.delete({ where: { discordId } })
            debugLog({
                message: 'Last.fm link removed',
                data: { discordId },
            })
            return true
        } catch (error) {
            const code =
                typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                typeof (error as { code?: unknown }).code === 'string'
                    ? (error as { code: string }).code
                    : null

            if (code === 'P2025') {
                // Prisma P2025 = record not found:
                // https://www.prisma.io/docs/orm/reference/error-reference
                // Treat delete of a missing link as idempotent success.
                debugLog({
                    message: 'Last.fm link already absent',
                    data: { discordId },
                })
                return true
            }

            errorLog({
                message: 'Failed to unlink Last.fm',
                error,
                data: { discordId },
            })
            return false
        }
    }
}

/** Singleton instance of LastFmLinkService. */
export const lastFmLinkService = new LastFmLinkService()
